document.addEventListener('DOMContentLoaded', () => {
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

  chrome.storage.local.get(['openrouter_api_key', 'luca_companies'], (result) => {
    if (result.openrouter_api_key) {
      apiKeyInput.value = result.openrouter_api_key;
    }

    companies = Array.isArray(result.luca_companies) ? result.luca_companies : [];
    renderCompanies();
  });

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    chrome.storage.local.set({ openrouter_api_key: key }, () => {
      showStatus('API anahtari kaydedildi.');
    });
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
