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

  let companies = [];
  let editingCompanyId = null;

  function showStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#d93025' : '#137333';
    setTimeout(() => { statusDiv.textContent = ''; }, 2500);
  }

  function clearCompanyForm() {
    editingCompanyId = null;
    companyNameInput.value = '';
    memberNoInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    saveCompanyBtn.textContent = 'Firmayi Kaydet';
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

        const name = document.createElement('span');
        name.textContent = company.name;

        const actions = document.createElement('div');

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
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.textContent = 'Sil';
        deleteBtn.addEventListener('click', () => {
          companies = companies.filter((item) => item.id !== company.id);
          persistCompanies('Firma silindi.');
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        item.appendChild(name);
        item.appendChild(actions);
        companyList.appendChild(item);
      });
  }

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

  chrome.storage.local.get([...SETTINGS_KEYS, 'luca_companies'], (result) => {
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
});
