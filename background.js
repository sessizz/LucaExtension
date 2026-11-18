importScripts("providers.js");

// Resmi tarayıcı içinde indirip Base64 formatına çeviren fonksiyon (Sağ tık için)
async function urlToBase64(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Sağ tık menüsünü oluştur
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "convertToCharacter",
    title: "Bu Resmi Çöz",
    contexts: ["image"]
  });
});

// Captcha resmini kayitli saglayiciya (OpenAI uyumlu chat/completions) gonderir.
// Basarida { text, model }, hatada Error firlatir.
async function solveCaptcha(base64Image) {
  const stored = await chrome.storage.local.get(SETTINGS_KEYS);
  const settings = resolveSettings(stored);

  const settingsError = validateSettings(settings);
  if (settingsError) {
    throw new Error(settingsError);
  }

  const { url, init } = buildChatRequest(settings, base64Image);
  const response = await fetch(url, init);

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`HTTP ${response.status} ${response.statusText} (JSON olmayan yanit)`);
  }

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${response.status} ${response.statusText}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    const error = new Error("API boş metin döndü");
    error.code = "EMPTY_RESPONSE"; // content.js bu durumda sayfayi yenileyip yeni captcha alir
    throw error;
  }

  return { text: content.replace(/\s+/g, ''), model: data.model || settings.model };
}

// --- 1. SAĞ TIK İLE ÇALIŞTIRMA (POPUP EKRANI GÖSTERİR) ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "convertToCharacter") return;

  // Ekranda "İşleniyor" penceresini aç
  showCustomModal(tab.id, info.srcUrl, "Yapay zeka çözüyor...");

  try {
    const base64Image = await urlToBase64(info.srcUrl);
    const result = await solveCaptcha(base64Image);
    updateModalText(tab.id, result.text, result.model);
  } catch (error) {
    updateModalText(tab.id, "HATA: " + error.message, "");
  }
});

// --- 2. OTOMATİK MOD (CONTENT.JS'DEN GELEN İSTEKLER - INPUT'A YAZAR) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoSolve") {
        solveCaptcha(request.imageBase64)
            .then((result) => sendResponse({ success: true, text: result.text }))
            .catch((error) => sendResponse({ success: false, error: error.message || "BAĞLANTI_HATASI", code: error.code }));
        return true; // Asenkron cevap için gerekli
    }
});


// --- EKRAN ÇİZİM FONKSİYONLARI (POPUP) ---

function showCustomModal(tabId, imgSrc, msg) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (img, text) => {
      const existing = document.getElementById('ai-captcha-modal');
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ai-captcha-modal';
      overlay.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:2147483647; display:flex; justify-content:center; align-items:center;';

      const modal = document.createElement('div');
      modal.style.cssText = 'background:white; padding:20px 30px; border-radius:10px; text-align:center; box-shadow:0 10px 25px rgba(0,0,0,0.5); font-family:Arial, sans-serif; min-width:250px;';

      if (img) {
        const imageEl = document.createElement('img');
        imageEl.src = img;
        imageEl.style.cssText = 'max-width:200px; height:auto; margin-bottom:15px; border:1px solid #ddd; padding:5px; background:#f9f9f9; border-radius:5px;';
        modal.appendChild(imageEl);
      }

      const textEl = document.createElement('h2');
      textEl.id = 'ai-captcha-text';
      textEl.innerText = text;
      textEl.style.cssText = 'color:#2c3e50; margin:10px 0 5px 0; letter-spacing:5px; font-weight:bold; font-size:28px;';
      modal.appendChild(textEl);

      const modelEl = document.createElement('p');
      modelEl.id = 'ai-model-name';
      modelEl.innerText = ''; 
      modelEl.style.cssText = 'color:#7f8c8d; font-size:11px; margin-bottom:20px; font-style:italic;';
      modal.appendChild(modelEl);

      const btn = document.createElement('button');
      btn.innerText = 'Kapat';
      btn.style.cssText = 'padding:10px 25px; border:none; background:#e74c3c; color:white; border-radius:5px; cursor:pointer; font-size:16px; font-weight:bold; transition:background 0.3s;';
      btn.onmouseover = () => btn.style.background = '#c0392b';
      btn.onmouseout = () => btn.style.background = '#e74c3c';
      btn.onclick = () => overlay.remove();
      modal.appendChild(btn);

      overlay.appendChild(modal);
      document.body.appendChild(overlay);
    },
    args: [imgSrc, msg]
  });
}

function updateModalText(tabId, newText, modelName) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (text, model) => {
      const textEl = document.getElementById('ai-captcha-text');
      if (textEl) textEl.innerText = text;
      
      if (model) {
        const modelEl = document.getElementById('ai-model-name');
        if (modelEl) modelEl.innerText = "Kullanılan Model: " + model;
      }
    },
    args: [newText, modelName]
  });
}
