// OpenAI uyumlu (chat/completions) saglayicilarin ortak ayarlari.
// background.js (importScripts), popup.js (<script>) ve testler (require) tarafindan kullanilir.

const CAPTCHA_PROMPT = "Bu resimdeki karakterleri oku. Bazı resimlerde g ile 9 karışıyor ona dikkat et. s ile S yani küçük büyük de karışıyor, v ile V gibi dikkat et. SADECE resimde okuduğun karakterleri BİTİŞİK olarak yaz. Aralarına KESİNLİKLE boşluk koyma. Başka hiçbir kelime veya yorum ekleme. Harflerin hepsi küçük.";

const PROVIDERS = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash-lite",
    requiresKey: true,
    extraBody: { "max_tokens": 20, "reasoning": { "effort": "none" } }
  },
  openai: {
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    requiresKey: true,
    extraBody: { "max_completion_tokens": 20 }
  },
  custom: {
    label: "Ozel (OpenAI uyumlu)",
    baseUrl: "",
    model: "",
    requiresKey: false,
    extraBody: { "max_tokens": 20 }
  }
};

const SETTINGS_KEYS = ["ai_provider", "ai_base_url", "ai_model", "ai_api_key", "openrouter_api_key"];

// Kayitli ayarlari, eksik alanlari saglayici varsayilanlariyla doldurarak cozer.
// Eski surumlerden kalan "openrouter_api_key" degeri de okunur.
function resolveSettings(stored) {
  const providerId = PROVIDERS[stored.ai_provider] ? stored.ai_provider : "openrouter";
  const preset = PROVIDERS[providerId];

  // Hazir saglayicilarin adresi sabittir; sadece ozel saglayicida kayitli adres kullanilir.
  const baseUrl = providerId === "custom" ? (stored.ai_base_url || "") : preset.baseUrl;

  return {
    providerId,
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    model: (stored.ai_model || preset.model).trim(),
    apiKey: (stored.ai_api_key ?? stored.openrouter_api_key ?? "").trim()
  };
}

function buildChatRequest(settings, base64Image) {
  const preset = PROVIDERS[settings.providerId] || PROVIDERS.custom;
  const headers = { "Content-Type": "application/json" };
  if (settings.apiKey) {
    headers["Authorization"] = `Bearer ${settings.apiKey}`;
  }
  if (settings.providerId === "openrouter") {
    headers["X-Title"] = "Luca Captcha";
  }

  return {
    url: `${settings.baseUrl}/chat/completions`,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify({
        "model": settings.model,
        ...preset.extraBody,
        "messages": [
          {
            "role": "user",
            "content": [
              { "type": "text", "text": CAPTCHA_PROMPT },
              { "type": "image_url", "image_url": { "url": base64Image } }
            ]
          }
        ]
      })
    }
  };
}

// Ayarlarda eksik bir sey varsa hata mesaji, yoksa null dondurur.
function validateSettings(settings) {
  const preset = PROVIDERS[settings.providerId];
  if (!settings.baseUrl) return "API adresi (Base URL) bos.";
  if (!/^https?:\/\//i.test(settings.baseUrl)) return "API adresi http:// veya https:// ile baslamali.";
  if (!settings.model) return "Model adi bos.";
  if (preset.requiresKey && !settings.apiKey) return "API anahtari bos.";
  return null;
}

// Captcha davranis ayarlari (popup'tan acilip kapatilir). Kayit yoksa ikisi de acik.
const CAPTCHA_OPTION_KEYS = ["captcha_reload_on_empty", "captcha_auto_submit"];

function resolveCaptchaOptions(stored) {
  return {
    reloadOnEmpty: stored.captcha_reload_on_empty !== false,
    autoSubmit: stored.captcha_auto_submit !== false
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    CAPTCHA_PROMPT, PROVIDERS, SETTINGS_KEYS, CAPTCHA_OPTION_KEYS,
    resolveSettings, buildChatRequest, validateSettings, resolveCaptchaOptions
  };
}
