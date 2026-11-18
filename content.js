let hasRun = false;
let searchInterval;
let loadingInterval;

function getBase64FromImage(imgEl) {
    const canvas = document.createElement("canvas");
    canvas.width = imgEl.naturalWidth || imgEl.width || 150;
    canvas.height = imgEl.naturalHeight || imgEl.height || 50;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(imgEl, 0, 0);
    return canvas.toDataURL("image/png");
}

function startLoadingAnimation() {
    const inputEl = document.getElementById("captcha-input");
    if (!inputEl) return;

    const frames = ["|", "/", "-", "\\"];
    let i = 0;

    loadingInterval = setInterval(() => {
        inputEl.value = frames[i];
        i = (i + 1) % frames.length;
    }, 150);
}

function stopLoadingAnimation(resultText) {
    clearInterval(loadingInterval);
    const inputEl = document.getElementById("captcha-input");

    if (inputEl) {
        inputEl.value = resultText;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

// API bos metin donerse yeni captcha icin sayfa yenilenir. Ayar bozuksa sonsuz
// donguye girmesin diye arka arkaya en fazla CAPTCHA_MAX_RELOADS kez.
const CAPTCHA_RELOAD_KEY = "lucaCaptchaEmptyReloads";
const CAPTCHA_MAX_RELOADS = 3;
// Kullanici giris alanlarina klavyeden yazdiysa yenileme yazdiklarini silmesin.
let loginTypedByUser = false;

function readCaptchaReloads() {
    try {
        return Number(sessionStorage.getItem(CAPTCHA_RELOAD_KEY)) || 0;
    } catch (e) {
        return CAPTCHA_MAX_RELOADS;
    }
}

function writeCaptchaReloads(count) {
    try {
        if (count) sessionStorage.setItem(CAPTCHA_RELOAD_KEY, String(count));
        else sessionStorage.removeItem(CAPTCHA_RELOAD_KEY);
    } catch (e) {
        // yok sayilir
    }
}

function reloadPage() {
    location.reload();
}

function handleEmptyCaptchaResponse() {
    const count = readCaptchaReloads();

    if (count >= CAPTCHA_MAX_RELOADS) {
        writeCaptchaReloads(0);
        stopLoadingAnimation(`BOS YANIT (${count} deneme)`);
        return;
    }

    if (loginTypedByUser) {
        stopLoadingAnimation("BOS YANIT - sayfayi yenileyin");
        return;
    }

    writeCaptchaReloads(count + 1);
    stopLoadingAnimation(`BOS YANIT, yenileniyor (${count + 1}/${CAPTCHA_MAX_RELOADS})`);
    setTimeout(() => {
        if (!loginTypedByUser) reloadPage();
    }, 800);
}

// Gecerli gorunen captcha cevabindan sonra Tamam'a basilir. Yapay zeka hep yanlis okursa
// Luca'ya durmadan hatali giris gitmesin diye 5 dakikada en fazla CAPTCHA_MAX_AUTO_SUBMITS kez.
const CAPTCHA_SUBMIT_KEY = "lucaCaptchaAutoSubmits";
const CAPTCHA_MAX_AUTO_SUBMITS = 3;
const CAPTCHA_SUBMIT_WINDOW_MS = 5 * 60 * 1000;
const CAPTCHA_ANSWER_PATTERN = /^[a-z0-9]{3,10}$/i;

function recentCaptchaSubmits() {
    try {
        const list = JSON.parse(sessionStorage.getItem(CAPTCHA_SUBMIT_KEY) || "[]");
        const now = Date.now();
        return Array.isArray(list) ? list.filter((time) => now - time < CAPTCHA_SUBMIT_WINDOW_MS) : [];
    } catch (e) {
        return null; // sayac tutulamiyorsa otomatik gonderim yapilmaz
    }
}

function autoSubmitCaptcha(answer) {
    // Giris alanlari ayni sayfadaysa gonderim GIRIS ile yapilir; ona kullanici ya da panel basar.
    if (findLoginInputs()) return;
    // Cumle, bos ya da tuhaf karakterli cevaplar gonderilmez; kullanici kontrol eder.
    if (!CAPTCHA_ANSWER_PATTERN.test(answer)) return;

    const input = document.getElementById("captcha-input");
    const button = (input && input.form && findButtonByText(input.form, "TAMAM")) || findButtonByText(document, "TAMAM");
    if (!button) return;

    const submits = recentCaptchaSubmits();
    if (!submits || submits.length >= CAPTCHA_MAX_AUTO_SUBMITS) {
        console.log("Captcha otomatik gonderim siniri doldu; Tamam'a elle basin.");
        return;
    }

    submits.push(Date.now());
    try {
        sessionStorage.setItem(CAPTCHA_SUBMIT_KEY, JSON.stringify(submits));
    } catch (e) {
        return;
    }
    setTimeout(() => button.click(), 300);
}

function processImage(imgEl) {
    if (hasRun) return;
    hasRun = true;
    clearInterval(searchInterval);

    console.log("Captcha image found, solving...");
    startLoadingAnimation();

    try {
        const base64Image = getBase64FromImage(imgEl);

        chrome.runtime.sendMessage({ action: "autoSolve", imageBase64: base64Image }, (response) => {
            if (response && response.success) {
                writeCaptchaReloads(0);
                stopLoadingAnimation(response.text);
                autoSubmitCaptcha(response.text);
            } else if (response && response.code === "EMPTY_RESPONSE") {
                handleEmptyCaptchaResponse();
            } else {
                const errMsg = (response && response.error) ? response.error : "HATA";
                stopLoadingAnimation(errMsg);
            }
        });
    } catch (err) {
        stopLoadingAnimation("KOPYALAMA HATASI");
    }
}

function checkForElements() {
    if (hasRun) return;

    const targetImage = document.getElementById("captcha");
    const targetInput = document.getElementById("captcha-input");

    if (targetImage && targetInput) {
        if (targetImage.complete && targetImage.naturalHeight !== 0) {
            processImage(targetImage);
        } else {
            targetImage.addEventListener("load", () => processImage(targetImage), { once: true });
        }
    }
}

// --- Firma paneli: giris ekraninda bilgileri, 2FA ekraninda kodu doldurur ---

// Giris ekraninda secilen firma, sonraki 2FA ekraninda kodu otomatik yazmak icin hatirlanir.
// Tek kullanimlik: kod yanlis cikarsa ayni anahtarla tekrar tekrar gonderilmez.
const SELECTED_COMPANY_KEY = "lucaSelectedCompany";
const SELECTED_COMPANY_TTL_MS = 10 * 60 * 1000;

let lucaCompanies = [];
let lucaPanelMode = null; // "login" | "otp"
let otpAutoTried = false;
let otpBusy = false;

const lucaCompaniesLoaded = new Promise((resolve) => {
    chrome.storage.local.get(["luca_companies"], (result) => {
        lucaCompanies = Array.isArray(result.luca_companies) ? result.luca_companies : [];
        resolve();
    });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.luca_companies) return;
    lucaCompanies = Array.isArray(changes.luca_companies.newValue) ? changes.luca_companies.newValue : [];
    renderLucaCompanies();
});

function rememberSelectedCompany(companyId) {
    try {
        sessionStorage.setItem(SELECTED_COMPANY_KEY, JSON.stringify({ id: companyId, at: Date.now() }));
    } catch (e) {
        // sessionStorage kapaliysa 2FA ekraninda firma elle secilir
    }
}

function peekSelectedCompanyId() {
    try {
        const raw = sessionStorage.getItem(SELECTED_COMPANY_KEY);
        if (!raw) return null;
        const selected = JSON.parse(raw);
        return Date.now() - selected.at < SELECTED_COMPANY_TTL_MS ? selected.id : null;
    } catch (e) {
        return null;
    }
}

function forgetSelectedCompany() {
    try {
        sessionStorage.removeItem(SELECTED_COMPANY_KEY);
    } catch (e) {
        // yok sayilir
    }
}

function takeSelectedCompanyId() {
    const id = peekSelectedCompanyId();
    forgetSelectedCompany();
    return id;
}

// --- Elle giris: uye no + kullanici adi kayitli bir firmayla eslesirse o firma secilmis sayilir ---

let lastRecognizedCompanyId = null;

function sameLogin(company, memberNo, username) {
    return String(company.memberNo || "").trim() === memberNo &&
        String(company.username || "").trim().toLocaleLowerCase("tr-TR") === username.toLocaleLowerCase("tr-TR");
}

function syncSelectionFromLoginFields() {
    const inputs = findLoginInputs();
    if (!inputs) return;

    const memberNo = inputs.memberNoInput.value.trim();
    const username = inputs.usernameInput.value.trim();

    // Panelden secilen firma alanlarla hala uyusuyorsa ona dokunma.
    const current = lucaCompanies.find((item) => item.id === peekSelectedCompanyId());
    if (current && sameLogin(current, memberNo, username)) return;

    const matches = memberNo && username
        ? lucaCompanies.filter((item) => sameLogin(item, memberNo, username))
        : [];
    // Ayni giris bilgisiyle birden cok kayit varsa 2FA'si olan tercih edilir.
    const match = matches.find((item) => item.otp) || matches[0];

    if (!match) {
        forgetSelectedCompany();
        lastRecognizedCompanyId = null;
        return;
    }

    rememberSelectedCompany(match.id);
    if (lastRecognizedCompanyId !== match.id) {
        lastRecognizedCompanyId = match.id;
        showLucaStatus(`${match.name} tanindi.${match.otp ? " 2FA kodu otomatik yazilacak." : ""}`, false);
    }
}

function isLoginField(target) {
    const inputs = findLoginInputs();
    return !!inputs && (target === inputs.memberNoInput || target === inputs.usernameInput);
}

function isLoginButton(button) {
    const text = buttonText(button);
    return text === "GIRIS" || text === "GİRİŞ";
}

document.addEventListener("input", (event) => {
    if (isLoginField(event.target)) syncSelectionFromLoginFields();
}, true);
document.addEventListener("change", (event) => {
    if (isLoginField(event.target)) syncSelectionFromLoginFields();
}, true);
// Tarayicinin otomatik doldurmasi olay gondermeyebilir: GIRIS'e basilirken ve Enter'da son kez okunur.
document.addEventListener("click", (event) => {
    const button = event.target && event.target.closest &&
        event.target.closest('input[type="button"], input[type="submit"], button');
    if (button && isLoginButton(button)) syncSelectionFromLoginFields();
}, true);
document.addEventListener("keydown", (event) => {
    const inputs = findLoginInputs();
    if (!inputs) return;
    if ([inputs.memberNoInput, inputs.usernameInput, inputs.passwordInput].includes(event.target)) {
        loginTypedByUser = true;
    }
    if (event.key === "Enter") syncSelectionFromLoginFields();
}, true);

function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

function showLucaStatus(message, isError) {
    const status = document.getElementById("luca-autofill-status");
    if (!status) return;

    status.textContent = message;
    status.style.color = isError ? "#d93025" : "#137333";
    clearTimeout(showLucaStatus.timer);
    showLucaStatus.timer = setTimeout(() => {
        status.textContent = "";
    }, isError ? 6000 : 2500);
}

function findLoginInputs() {
    const memberNoInput = document.getElementById("musteriNo") || document.querySelector('input[name="musteriNo"]');
    const usernameInput = document.getElementById("kullaniciAdi") || document.querySelector('input[name="kullaniciAdi"]');
    const passwordInput = document.getElementById("parola") || document.querySelector('input[name="parola"]');

    if (!memberNoInput || !usernameInput || !passwordInput) return null;
    return { memberNoInput, usernameInput, passwordInput };
}

// Luca 2FA ekrani: <input type="text" id="code" name="code">
function findOtpInput() {
    const input = document.getElementById("code");
    if (!input || input.tagName !== "INPUT" || input.name !== "code") return null;
    return input;
}

function buttonText(button) {
    return (button.value || button.textContent || "").trim().toLocaleUpperCase("tr-TR");
}

function findButtonByText(root, ...labels) {
    const wanted = labels.map((label) => label.toLocaleUpperCase("tr-TR"));
    return Array.from(root.querySelectorAll('input[type="button"], input[type="submit"], button'))
        .find((button) => wanted.includes(buttonText(button)));
}

function fillLucaLogin(company) {
    const inputs = findLoginInputs();
    if (!inputs) {
        showLucaStatus("Luca alanlari bulunamadi.", true);
        return;
    }

    setNativeInputValue(inputs.memberNoInput, company.memberNo || "");
    setNativeInputValue(inputs.usernameInput, company.username || "");
    setNativeInputValue(inputs.passwordInput, company.password || "");
    rememberSelectedCompany(company.id);
    showLucaStatus(`${company.name} dolduruldu, giris yapiliyor.`, false);

    setTimeout(clickLucaLoginButton, 150);
}

function clickLucaLoginButton() {
    const loginButton = Array.from(document.querySelectorAll('input[type="button"], input[type="submit"], button'))
        .find(isLoginButton);

    if (!loginButton) {
        showLucaStatus("Giris butonu bulunamadi.", true);
        return;
    }

    loginButton.click();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fillOtpCode(company) {
    if (otpBusy) return;
    if (!company.otp) {
        showLucaStatus(`${company.name} icin 2FA QR kaydi yok. Kodu elle girin.`, true);
        return;
    }

    const input = findOtpInput();
    if (!input) {
        showLucaStatus("2FA kod alani bulunamadi.", true);
        return;
    }

    otpBusy = true;
    try {
        const wait = otpWaitMs(company.otp, Date.now());
        if (wait) {
            showLucaStatus("Kodun suresi doluyor, yeni kod bekleniyor...", false);
            await sleep(wait);
        }

        const code = await generateTotp(company.otp, Date.now());
        setNativeInputValue(input, code);
        showLucaStatus(`${company.name} 2FA kodu yazildi, gonderiliyor.`, false);
        setTimeout(() => clickOtpSubmitButton(input), 150);
    } catch (err) {
        showLucaStatus("2FA kodu uretilemedi: " + (err && err.message ? err.message : err), true);
    } finally {
        otpBusy = false;
    }
}

// Luca 2FA ekrani: <input onclick="document.forms[0].submit()" type="button" value="Tamam">
function clickOtpSubmitButton(input) {
    const button = (input.form && findButtonByText(input.form, "TAMAM")) || findButtonByText(document, "TAMAM");

    if (!button) {
        showLucaStatus("Tamam butonu bulunamadi; kod yazildi, elle gonderin.", true);
        return;
    }

    button.click();
}

async function autoFillOtp() {
    if (otpAutoTried) return;
    otpAutoTried = true;

    const companyId = takeSelectedCompanyId();
    await lucaCompaniesLoaded;

    if (!companyId) {
        showLucaStatus("2FA kodu icin firma secin.", false);
        return;
    }

    const company = lucaCompanies.find((item) => item.id === companyId);
    if (!company) {
        showLucaStatus("Secilen firma bulunamadi; listeden secin.", true);
        return;
    }

    await fillOtpCode(company);
}

function onLucaCompanyClick(company) {
    if (lucaPanelMode === "otp") {
        fillOtpCode(company);
    } else {
        fillLucaLogin(company);
    }
}

function renderLucaCompanies() {
    const list = document.getElementById("luca-company-list");
    if (!list) return;

    list.innerHTML = "";
    if (!lucaCompanies.length) {
        const empty = document.createElement("div");
        empty.textContent = "Kayitli firma yok";
        empty.style.cssText = "all:initial;display:block;padding:10px 8px;color:#566773;font:13px Arial,sans-serif;text-align:center;";
        list.appendChild(empty);
        return;
    }

    const otpMode = lucaPanelMode === "otp";

    lucaCompanies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .forEach((company) => {
            const disabled = otpMode && !company.otp;
            const companyButton = document.createElement("button");
            companyButton.type = "button";
            companyButton.textContent = disabled ? `${company.name} (2FA yok)` : company.name;
            companyButton.style.cssText = [
                "all:initial",
                "box-sizing:border-box",
                "display:flex",
                "align-items:center",
                "justify-content:flex-start",
                "width:100%",
                "min-height:38px",
                "padding:9px 11px",
                "margin:0 0 7px",
                "border:1px solid #d0d7de",
                "border-radius:6px",
                "background:#f8fafc",
                `color:${disabled ? "#90a4ae" : "#17202a"}`,
                "font:700 13px Arial,sans-serif",
                "line-height:1.2",
                "text-align:left",
                "cursor:pointer",
                "appearance:none"
            ].join(";");

            companyButton.addEventListener("mouseenter", () => {
                companyButton.style.background = "#eaf2ff";
                companyButton.style.borderColor = "#1f6feb";
            });
            companyButton.addEventListener("mouseleave", () => {
                companyButton.style.background = "#f8fafc";
                companyButton.style.borderColor = "#d0d7de";
            });
            companyButton.addEventListener("click", () => onLucaCompanyClick(company));

            list.appendChild(companyButton);
        });
}

function ensureLucaPanel(mode) {
    let panel = document.getElementById("luca-autofill-panel");

    if (!panel) {
        panel = document.createElement("div");
        panel.id = "luca-autofill-panel";
        panel.style.cssText = [
            "all:initial",
            "position:fixed",
            "top:14px",
            "right:14px",
            "z-index:2147483647",
            "display:block",
            "box-sizing:border-box",
            "width:286px",
            "padding:14px",
            "border:1px solid #d0d7de",
            "border-radius:8px",
            "background:#fff",
            "box-shadow:0 8px 28px rgba(0,0,0,.24)",
            "font:13px Arial,sans-serif",
            "color:#17202a"
        ].join(";");

        const title = document.createElement("div");
        title.id = "luca-autofill-title";
        title.style.cssText = "all:initial;display:block;font:700 13px Arial,sans-serif;color:#17202a;margin-bottom:10px;";

        const list = document.createElement("div");
        list.id = "luca-company-list";
        list.style.cssText = "all:initial;box-sizing:border-box;display:block;max-height:260px;overflow:auto;";

        const status = document.createElement("div");
        status.id = "luca-autofill-status";
        status.style.cssText = "all:initial;display:block;min-height:16px;margin-top:9px;font:12px Arial,sans-serif;";

        panel.appendChild(title);
        panel.appendChild(list);
        panel.appendChild(status);
        document.documentElement.appendChild(panel);
    }

    if (lucaPanelMode !== mode) {
        lucaPanelMode = mode;
        document.getElementById("luca-autofill-title").textContent =
            mode === "otp" ? "2FA kodu icin firma sec" : "Firma sec";
        lucaCompaniesLoaded.then(renderLucaCompanies);
    }
}

function checkForLucaPage() {
    // 2FA ekrani once kontrol edilir; giris alanlari ayni sayfada gizli kalsa bile kod yazilir.
    if (findOtpInput()) {
        ensureLucaPanel("otp");
        autoFillOtp();
        return;
    }

    if (findLoginInputs()) {
        ensureLucaPanel("login");
    }
}

searchInterval = setInterval(checkForElements, 500);
setInterval(checkForLucaPage, 500);

if (document.readyState === "complete" || document.readyState === "interactive") {
    checkForElements();
    checkForLucaPage();
} else {
    document.addEventListener("DOMContentLoaded", () => {
        checkForElements();
        checkForLucaPage();
    });
}
