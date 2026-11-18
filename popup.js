document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('provider');
  const baseUrlInput = document.getElementById('baseUrl');
  const modelInput = document.getElementById('model');
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');
  const companyNameInput = document.getElementById('companyName');
  const memberNoInput = document.getElementById('memberNo');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const saveCompanyBtn = document.getElementById('saveCompanyBtn');
  const clearCompanyBtn = document.getElementById('clearCompanyBtn');
  const companyList = document.getElementById('companyList');
  const otpInfo = document.getElementById('otpInfo');
  const otpDrop = document.getElementById('otpDrop');
  const otpFileBtn = document.getElementById('otpFileBtn');
  const otpFile = document.getElementById('otpFile');
  const otpRemoveBtn = document.getElementById('otpRemoveBtn');
  const otpChoices = document.getElementById('otpChoices');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const openTabLink = document.getElementById('openTab');
  const optReloadOnEmpty = document.getElementById('optReloadOnEmpty');
  const optAutoSubmit = document.getElementById('optAutoSubmit');

  let companies = [];
  let editingCompanyId = null;
  // Formdaki firmanin 2FA bilgisi (kaydedilene kadar burada durur).
  let pendingOtp = null;
  let pendingOtpChanged = false;

  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#d93025' : '#137333';
    setTimeout(() => { statusDiv.textContent = ''; }, 2500);
  }

  // --- 2FA (QR) ---

  function setPendingOtp(otp, changed) {
    pendingOtp = otp;
    pendingOtpChanged = changed;
    otpChoices.innerHTML = '';
    renderOtpInfo();
    refreshCodes();
  }

  function renderOtpInfo() {
    otpRemoveBtn.disabled = !pendingOtp;
    otpRemoveBtn.style.opacity = pendingOtp ? '1' : '.5';

    if (!pendingOtp) {
      otpInfo.textContent = pendingOtpChanged
        ? 'QR silinecek. Kaydetmek icin firmayi kaydedin.'
        : 'QR kayitli degil.';
      return;
    }

    otpInfo.textContent = '';
    const title = document.createElement('div');
    title.textContent = (pendingOtpChanged ? 'Yeni QR okundu: ' : 'Kayitli QR: ') + otpLabel(pendingOtp);
    const code = document.createElement('div');
    code.id = 'otpFormCode';
    code.className = 'otp-code';
    code.title = 'Kopyalamak icin tiklayin';
    code.addEventListener('click', () => copyCode(code.dataset.code));
    otpInfo.appendChild(title);
    otpInfo.appendChild(code);

    if (pendingOtpChanged) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Kod telefondakiyle ayniysa firmayi kaydedin.';
      otpInfo.appendChild(hint);
    }
  }

  function applyOtpEntries(entries) {
    if (entries.length === 1) {
      setPendingOtp(entries[0], true);
      showStatus('QR okundu. Firmayi kaydetmeyi unutmayin.');
      return;
    }

    // Google Authenticator aktarma QR'inda birden cok hesap olabilir: kullanici secer.
    otpChoices.innerHTML = '';
    const note = document.createElement('div');
    note.className = 'hint';
    note.textContent = `Bu QR'da ${entries.length} hesap var. Bu firmaya ait olani secin:`;
    otpChoices.appendChild(note);
    entries.forEach((entry) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = otpLabel(entry);
      button.addEventListener('click', () => {
        setPendingOtp(entry, true);
        showStatus('Hesap secildi. Firmayi kaydetmeyi unutmayin.');
      });
      otpChoices.appendChild(button);
    });
  }

  // Seffaf PNG'ler beyaz zemine cizilir; buyuk/kucuk goruntuler icin olcekli tekrar denenir.
  async function decodeQrFromBlob(blob) {
    const bitmap = await createImageBitmap(blob);
    const maxSide = Math.max(bitmap.width, bitmap.height);
    const scales = [1];
    if (maxSide > 1400) scales.push(1400 / maxSide, 800 / maxSide);
    if (maxSide < 500) scales.push(2);

    for (const scale of scales) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = scale < 1;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      const result = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' });
      if (result && result.data) return result.data;
    }
    return null;
  }

  async function handleQrImage(blob) {
    try {
      const text = await decodeQrFromBlob(blob);
      if (!text) {
        showStatus('Goruntude QR kod bulunamadi.', true);
        return;
      }
      applyOtpEntries(parseQrText(text));
    } catch (error) {
      showStatus(error.message || 'QR okunamadi.', true);
    }
  }

  // QR yerine anahtar metni (otpauth://... veya JBSW... gibi) de yapistirilabilir.
  function handleOtpText(text) {
    const value = text.trim();
    try {
      if (/^otpauth/i.test(value)) {
        applyOtpEntries(parseQrText(value));
      } else {
        applyOtpEntries([makeOtp({ secret: value, issuer: '', account: companyNameInput.value.trim() })]);
      }
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  document.addEventListener('paste', (event) => {
    const items = Array.from(event.clipboardData?.items || []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (imageItem) {
      event.preventDefault();
      handleQrImage(imageItem.getAsFile());
      return;
    }
    // Metin yapistirma normal alanlarda bozulmasin; sadece QR kutusundayken anahtar olarak yorumla.
    if (document.activeElement === otpDrop) {
      const text = event.clipboardData?.getData('text') || '';
      if (text.trim()) {
        event.preventDefault();
        handleOtpText(text);
      }
    }
  });

  otpDrop.addEventListener('dragover', (event) => {
    event.preventDefault();
    otpDrop.classList.add('dragover');
  });
  otpDrop.addEventListener('dragleave', () => otpDrop.classList.remove('dragover'));
  otpDrop.addEventListener('drop', (event) => {
    event.preventDefault();
    otpDrop.classList.remove('dragover');
    const file = Array.from(event.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
    if (file) handleQrImage(file);
    else showStatus('Bir resim dosyasi birakin.', true);
  });

  otpFileBtn.addEventListener('click', () => otpFile.click());
  otpFile.addEventListener('change', () => {
    const file = otpFile.files && otpFile.files[0];
    otpFile.value = '';
    if (file) handleQrImage(file);
  });

  otpRemoveBtn.addEventListener('click', () => {
    if (!pendingOtp) return;
    setPendingOtp(null, true);
  });

  // --- Canli kodlar ---

  function copyCode(code) {
    if (!code) return;
    navigator.clipboard.writeText(code)
      .then(() => showStatus('Kod kopyalandi.'))
      .catch(() => showStatus('Kopyalanamadi.', true));
  }

  function setCodeElement(element, otp, now) {
    generateTotp(otp, now)
      .then((code) => {
        element.dataset.code = code;
        element.textContent = code;
        const secs = document.createElement('span');
        secs.className = 'otp-secs';
        secs.textContent = `${otpRemainingSeconds(otp, now)} sn`;
        element.appendChild(secs);
      })
      .catch(() => {
        element.textContent = 'Kod uretilemedi';
      });
  }

  function refreshCodes() {
    const now = Date.now();
    companyList.querySelectorAll('.otp-code[data-company-id]').forEach((element) => {
      const company = companies.find((item) => item.id === element.dataset.companyId);
      if (company && company.otp) setCodeElement(element, company.otp, now);
    });
    const formCode = document.getElementById('otpFormCode');
    if (formCode && pendingOtp) setCodeElement(formCode, pendingOtp, now);
  }

  setInterval(refreshCodes, 1000);

  // --- Firmalar ---

  function clearCompanyForm() {
    editingCompanyId = null;
    companyNameInput.value = '';
    memberNoInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    saveCompanyBtn.textContent = 'Firmayi Kaydet';
    setPendingOtp(null, false);
  }

  function persistCompanies(message) {
    chrome.storage.local.set({ luca_companies: companies }, () => {
      renderCompanies();
      clearCompanyForm();
      showStatus(message);
    });
  }

  function renderCompanies() {
    companyList.innerHTML = '';

    if (companies.length === 0) {
      companyList.textContent = 'Kayitli firma yok.';
      return;
    }

    companies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .forEach((company) => {
        const item = document.createElement('div');
        item.className = 'company-item';

        const main = document.createElement('div');
        main.className = 'company-main';

        const name = document.createElement('span');
        name.textContent = company.name;

        const code = document.createElement('span');
        if (company.otp) {
          code.className = 'otp-code';
          code.dataset.companyId = company.id;
          code.title = 'Kopyalamak icin tiklayin';
          code.addEventListener('click', () => copyCode(code.dataset.code));
        } else {
          code.className = 'otp-code none';
          code.textContent = '2FA yok';
        }

        main.appendChild(name);
        main.appendChild(code);

        const actions = document.createElement('div');
        actions.className = 'company-actions';

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'secondary';
        editBtn.textContent = 'Duzenle';
        editBtn.addEventListener('click', () => {
          editingCompanyId = company.id;
          companyNameInput.value = company.name || '';
          memberNoInput.value = company.memberNo || '';
          usernameInput.value = company.username || '';
          passwordInput.value = company.password || '';
          saveCompanyBtn.textContent = 'Firmayi Guncelle';
          setPendingOtp(company.otp || null, false);
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = 'Sil';
        deleteBtn.addEventListener('click', () => {
          if (!confirm(`${company.name} silinsin mi?`)) return;
          companies = companies.filter((item) => item.id !== company.id);
          persistCompanies('Firma silindi.');
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(main);
        item.appendChild(actions);
        companyList.appendChild(item);
      });

    refreshCodes();
  }

  // --- Yedek (JSON) ---

  exportBtn.addEventListener('click', () => {
    const data = {
      app: 'luca-extension',
      version: 1,
      exportedAt: new Date().toISOString(),
      companies
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `luca-firmalar-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showStatus(`${companies.length} firma disa aktarildi.`);
  });

  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = '';
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data && data.companies;
      if (!Array.isArray(list)) throw new Error('Dosyada firma listesi yok.');

      // Kopya uzerinde calis: bozuk bir kayit yarim kalmis bir liste birakmasin.
      const next = companies.slice();
      let added = 0;
      let updated = 0;
      list.forEach((raw) => {
        if (!raw || !raw.name) return;
        const company = {
          id: raw.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: String(raw.name).trim(),
          memberNo: String(raw.memberNo || '').trim(),
          username: String(raw.username || '').trim(),
          password: String(raw.password || '')
        };
        if (raw.otp) company.otp = makeOtp(raw.otp);

        const index = next.findIndex((item) => item.id === company.id);
        if (index === -1) {
          next.push(company);
          added++;
        } else {
          next[index] = company;
          updated++;
        }
      });

      companies = next;
      persistCompanies(`${added} firma eklendi, ${updated} firma guncellendi.`);
    } catch (error) {
      showStatus('Ice aktarilamadi: ' + error.message, true);
    }
  });

  openTabLink.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  });

  // --- Yapay zeka ayarlari ---

  Object.entries(PROVIDERS).forEach(([id, preset]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = preset.label;
    providerSelect.appendChild(option);
  });

  function applyProviderUi(providerId) {
    // Hazir saglayicilarin adresi sabittir; sadece ozel saglayicida duzenlenir.
    baseUrlInput.readOnly = providerId !== 'custom';
    apiKeyInput.placeholder = PROVIDERS[providerId].requiresKey ? 'sk-...' : 'Gerekmiyorsa bos birakin';
  }

  providerSelect.addEventListener('change', () => {
    const preset = PROVIDERS[providerSelect.value];
    baseUrlInput.value = preset.baseUrl;
    modelInput.value = preset.model;
    applyProviderUi(providerSelect.value);
  });

  // --- Captcha davranisi (isaretlenince hemen kaydedilir) ---

  function bindCaptchaOption(checkbox, key) {
    checkbox.addEventListener('change', () => {
      chrome.storage.local.set({ [key]: checkbox.checked }, () => {
        showStatus(checkbox.checked ? 'Ayar acildi.' : 'Ayar kapatildi.');
      });
    });
  }

  bindCaptchaOption(optReloadOnEmpty, 'captcha_reload_on_empty');
  bindCaptchaOption(optAutoSubmit, 'captcha_auto_submit');

  chrome.storage.local.get([...SETTINGS_KEYS, ...CAPTCHA_OPTION_KEYS, 'luca_companies'], (result) => {
    const captchaOptions = resolveCaptchaOptions(result);
    optReloadOnEmpty.checked = captchaOptions.reloadOnEmpty;
    optAutoSubmit.checked = captchaOptions.autoSubmit;

    const settings = resolveSettings(result);
    providerSelect.value = settings.providerId;
    baseUrlInput.value = settings.baseUrl;
    modelInput.value = settings.model;
    apiKeyInput.value = settings.apiKey;
    applyProviderUi(settings.providerId);

    companies = Array.isArray(result.luca_companies) ? result.luca_companies : [];
    renderCompanies();
  });

  saveBtn.addEventListener('click', () => {
    const settings = resolveSettings({
      ai_provider: providerSelect.value,
      ai_base_url: baseUrlInput.value,
      ai_model: modelInput.value,
      ai_api_key: apiKeyInput.value
    });

    const settingsError = validateSettings(settings);
    if (settingsError) {
      showStatus(settingsError, true);
      return;
    }

    // Izin istegi kullanici tiklamasi icinde, baska bir await'ten once yapilmali.
    // Manifest'te zaten izinli olan adresler icin pencere acilmadan true doner.
    const url = new URL(settings.baseUrl);
    const permissionRequest = chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });

    chrome.storage.local.set({
      ai_provider: settings.providerId,
      ai_base_url: settings.baseUrl,
      ai_model: settings.model,
      ai_api_key: settings.apiKey
    }, () => {
      chrome.storage.local.remove('openrouter_api_key');
      baseUrlInput.value = settings.baseUrl;
    });

    permissionRequest
      .then((granted) => {
        if (granted) {
          showStatus('Ayarlar kaydedildi.');
        } else {
          showStatus(`Ayarlar kaydedildi ama ${url.hostname} icin izin verilmedi.`, true);
        }
      })
      .catch((error) => showStatus('Izin hatasi: ' + error.message, true));
  });

  saveCompanyBtn.addEventListener('click', () => {
    const company = {
      id: editingCompanyId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: companyNameInput.value.trim(),
      memberNo: memberNoInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value
    };
    if (pendingOtp) company.otp = pendingOtp;

    if (!company.name || !company.memberNo || !company.username || !company.password) {
      showStatus('Tum firma alanlarini doldurun.', true);
      return;
    }

    if (editingCompanyId) {
      companies = companies.map((item) => item.id === editingCompanyId ? company : item);
    } else {
      companies.push(company);
    }

    persistCompanies('Firma bilgileri kaydedildi.');
  });

  clearCompanyBtn.addEventListener('click', clearCompanyForm);

  renderOtpInfo();
});
