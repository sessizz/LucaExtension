let hasRun = false;
let searchInterval;
let loadingInterval;
let lucaPanelReady = false;

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
                stopLoadingAnimation(response.text);
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
    setTimeout(() => {
        status.textContent = "";
    }, 2500);
}

function fillLucaLogin(company) {
    const memberNoInput = document.getElementById("musteriNo") || document.querySelector('input[name="musteriNo"]');
    const usernameInput = document.getElementById("kullaniciAdi") || document.querySelector('input[name="kullaniciAdi"]');
    const passwordInput = document.getElementById("parola") || document.querySelector('input[name="parola"]');

    if (!memberNoInput || !usernameInput || !passwordInput) {
        showLucaStatus("Luca alanlari bulunamadi.", true);
        return;
    }

    setNativeInputValue(memberNoInput, company.memberNo || "");
    setNativeInputValue(usernameInput, company.username || "");
    setNativeInputValue(passwordInput, company.password || "");
    showLucaStatus(`${company.name} dolduruldu, giris yapiliyor.`, false);

    setTimeout(clickLucaLoginButton, 150);
}

function clickLucaLoginButton() {
    const loginButton = Array.from(document.querySelectorAll('input[type="button"], button'))
        .find((button) => {
            const text = (button.value || button.textContent || "").trim().toLocaleUpperCase("tr-TR");
            return text === "GIRIS" || text === "GİRİŞ";
        });

    if (!loginButton) {
        showLucaStatus("Giris butonu bulunamadi.", true);
        return;
    }

    loginButton.click();
}

function toggleLucaPanel() {
    const panel = document.getElementById("luca-autofill-panel");
    if (!panel) return;

    panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function renderLucaCompanies(companies) {
    const select = document.getElementById("luca-company-select");
    if (!select) return;

    select.innerHTML = "";
    if (!companies.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Kayitli firma yok";
        select.appendChild(option);
        return;
    }

    companies
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, "tr"))
        .forEach((company) => {
            const option = document.createElement("option");
            option.value = company.id;
            option.textContent = company.name;
            select.appendChild(option);
        });
}

function initLucaAutofillPanel() {
    if (lucaPanelReady || document.getElementById("luca-autofill-button")) return;

    const memberNoInput = document.getElementById("musteriNo") || document.querySelector('input[name="musteriNo"]');
    const usernameInput = document.getElementById("kullaniciAdi") || document.querySelector('input[name="kullaniciAdi"]');
    const passwordInput = document.getElementById("parola") || document.querySelector('input[name="parola"]');

    if (!memberNoInput || !usernameInput || !passwordInput) return;

    lucaPanelReady = true;

    const button = document.createElement("button");
    button.id = "luca-autofill-button";
    button.type = "button";
    button.textContent = "Luca Firma";
    button.style.cssText = [
        "all:initial",
        "position:fixed",
        "top:14px",
        "right:14px",
        "z-index:2147483647",
        "box-sizing:border-box",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "min-width:112px",
        "height:34px",
        "padding:9px 12px",
        "border:0",
        "border-radius:6px",
        "background:#1f6feb",
        "color:#fff",
        "font:700 13px Arial,sans-serif",
        "line-height:1",
        "text-align:center",
        "white-space:nowrap",
        "box-shadow:0 4px 14px rgba(0,0,0,.22)",
        "cursor:pointer",
        "appearance:none"
    ].join(";");

    const panel = document.createElement("div");
    panel.id = "luca-autofill-panel";
    panel.style.cssText = [
        "all:initial",
        "position:fixed",
        "top:58px",
        "right:14px",
        "z-index:2147483647",
        "display:none",
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
    title.textContent = "Firma sec";
    title.style.cssText = "all:initial;display:block;font:700 13px Arial,sans-serif;color:#17202a;margin-bottom:10px;";

    const select = document.createElement("select");
    select.id = "luca-company-select";
    select.style.cssText = [
        "all:revert",
        "box-sizing:border-box",
        "display:block",
        "width:100%",
        "height:40px",
        "padding:0 10px",
        "margin:0 0 10px",
        "border:1px solid #b7c0c7",
        "border-radius:6px",
        "background:#fff",
        "color:#17202a",
        "font:13px Arial,sans-serif"
    ].join(";");

    const fillButton = document.createElement("button");
    fillButton.type = "button";
    fillButton.textContent = "Doldur";
    fillButton.style.cssText = [
        "all:initial",
        "box-sizing:border-box",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "width:100%",
        "height:36px",
        "padding:0 12px",
        "border:0",
        "border-radius:6px",
        "background:#137333",
        "color:#fff",
        "font:700 13px Arial,sans-serif",
        "line-height:1",
        "text-align:center",
        "cursor:pointer",
        "appearance:none"
    ].join(";");

    const status = document.createElement("div");
    status.id = "luca-autofill-status";
    status.style.cssText = "all:initial;display:block;min-height:16px;margin-top:9px;font:12px Arial,sans-serif;";

    panel.appendChild(title);
    panel.appendChild(select);
    panel.appendChild(fillButton);
    panel.appendChild(status);
    document.documentElement.appendChild(button);
    document.documentElement.appendChild(panel);

    let companies = [];

    chrome.storage.local.get(["luca_companies"], (result) => {
        companies = Array.isArray(result.luca_companies) ? result.luca_companies : [];
        renderLucaCompanies(companies);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes.luca_companies) return;
        companies = Array.isArray(changes.luca_companies.newValue) ? changes.luca_companies.newValue : [];
        renderLucaCompanies(companies);
    });

    button.addEventListener("click", toggleLucaPanel);
    fillButton.addEventListener("click", () => {
        const selected = companies.find((company) => company.id === select.value);
        if (!selected) {
            showLucaStatus("Once firma kaydedin.", true);
            return;
        }

        fillLucaLogin(selected);
    });
}

function checkForLucaLogin() {
    initLucaAutofillPanel();
}

searchInterval = setInterval(checkForElements, 500);
setInterval(checkForLucaLogin, 500);

if (document.readyState === "complete" || document.readyState === "interactive") {
    checkForElements();
    checkForLucaLogin();
} else {
    document.addEventListener("DOMContentLoaded", () => {
        checkForElements();
        checkForLucaLogin();
    });
}
