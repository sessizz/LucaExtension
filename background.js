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

// --- 1. SAĞ TIK İLE ÇALIŞTIRMA (POPUP EKRANI GÖSTERİR) ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "convertToCharacter") {
    try {
      const result = await chrome.storage.local.get(['openrouter_api_key']);
      const apiKey = result.openrouter_api_key;

      if (!apiKey) {
        alertInTab(tab.id, "HATA: Lütfen API anahtarınızı kaydedin.");
        return;
      }

      // Ekranda "İşleniyor" penceresini aç
      showCustomModal(tab.id, info.srcUrl, "Yapay zeka çözüyor...");

      // Resmi Base64'e çevir
      const base64Image = await urlToBase64(info.srcUrl);

      // OpenRouter API İsteği (Gemini Flash Modelini Sabitledik)
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://localhost.com",
          "X-Title": "Karakter Cevirici"
        },
        body: JSON.stringify({
          "model": "openrouter/auto", 
          "messages": [
            {
              "role": "user",
              "content": [
                {
                  "type": "text",
                  "text": "Bu resimdeki karakterleri oku. Bazı resimlerde g ile 9 karışıyor ona dikkat et. s ile S yani küçük büyük de karışıyor, v ile V gibi dikkat et. SADECE resimde okuduğun karakterleri BİTİŞİK olarak yaz. Aralarına KESİNLİKLE boşluk koyma. Başka hiçbir kelime veya yorum ekleme."
                },
                {
                  "type": "image_url",
                  "image_url": { "url": base64Image }
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const errorMsg = data.error?.message || "API_HATA";
        updateModalText(tab.id, "HATA: " + errorMsg, "Bilinmeyen Model");
        return;
      }

      if (data.choices && data.choices.length > 0) {
        let characterText = data.choices[0].message.content.replace(/\s+/g, '');
        const usedModel = data.model || "Bilinmeyen Model";
        updateModalText(tab.id, characterText, usedModel);
      } else {
        updateModalText(tab.id, "HATA: Boş yanıt döndü.", "Bilinmeyen Model");
      }

    } catch (error) {
      alertInTab(tab.id, "SİSTEM/BAĞLANTI HATASI: \n" + error.message);
    }
  }
});

// --- 2. OTOMATİK MOD (CONTENT.JS'DEN GELEN İSTEKLER - INPUT'A YAZAR) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "autoSolve") {
        processAutoWithAI(request.imageBase64, sendResponse);
        return true; // Asenkron cevap için gerekli
    }
});

async function processAutoWithAI(base64Image, sendResponse) {
    try {
        const result = await chrome.storage.local.get(['openrouter_api_key']);
        const apiKey = result.openrouter_api_key;
  
        if (!apiKey) {
          sendResponse({ success: false, error: "API KEY YOK" });
          return;
        }
  
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "model": "openrouter/auto", 
            "messages": [
              {
                "role": "user",
                "content": [
                  {
                    "type": "text",
                    "text": "Bu resimdeki karakterleri oku. Bazı resimlerde g ile 9 karışıyor ona dikkat et. s ile S yani küçük büyük de karışıyor, v ile V gibi dikkat et. SADECE resimde okuduğun karakterleri BİTİŞİK olarak yaz. Aralarına KESİNLİKLE boşluk koyma. Başka hiçbir kelime veya yorum ekleme."
                  },
                  {
                    "type": "image_url",
                    "image_url": { "url": base64Image }
                  }
                ]
              }
            ]
          })
        });
  
        const data = await response.json();
  
        if (!response.ok || data.error) {
          sendResponse({ success: false, error: "API_HATA" });
          return;
        }
  
        if (data.choices && data.choices.length > 0) {
          let characterText = data.choices[0].message.content.replace(/\s+/g, '');
          sendResponse({ success: true, text: characterText });
        } else {
          sendResponse({ success: false, error: "BOŞ_YANIT" });
        }
  
      } catch (error) {
          sendResponse({ success: false, error: "BAĞLANTI_HATASI" });
      }
}


// --- EKRAN ÇİZİM FONKSİYONLARI (POPUP) ---

function alertInTab(tabId, message) {
  chrome.scripting.executeScript({ target: { tabId: tabId }, func: (msg) => alert(msg), args: [message] });
}

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