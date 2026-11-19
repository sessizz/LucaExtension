// www.luca.com.tr: "Sistem Giris" butonlari giris ekranini acilir pencere (popup) yerine
// ayni sekmede acar. Ust menudeki butonlar popup('...'), sayfadaki "Sisteme Giris" butonlari
// window.open('...') cagirir; adres onclick ozelliginden okunur.
const LOGIN_OPENER_PATTERN = /(?:popup|window\.open)\(\s*['"](https?:\/\/[^'"]+)['"]/;
const LOGIN_BUTTON_SELECTOR = ".system-entry-v2 [onclick], #hizli-menu [onclick]";

function openInSameTab(url) {
    window.location.assign(url);
}

function loginUrlFromClick(target) {
    const button = target && target.closest && target.closest(LOGIN_BUTTON_SELECTOR);
    if (!button) return null;
    const match = (button.getAttribute("onclick") || "").match(LOGIN_OPENER_PATTERN);
    return match ? match[1] : null;
}

// Yakalama asamasinda calisir: sayfanin kendi onclick'i (popup acan) hic calismaz.
document.addEventListener("click", (event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const url = loginUrlFromClick(event.target);
    if (!url) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    openInSameTab(url);
}, true);
