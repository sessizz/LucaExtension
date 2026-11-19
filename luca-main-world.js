// Sayfanin kendi dunyasinda (MAIN world) calisir; content.js'in erisemedigi window.open'i sarar.
// Amac: giris sonrasi urun secim ekranindaki (orn. TicariSSO/main.erp) kutular urunu yeni
// pencere yerine ayni sekmede acsin. Sadece sayfada urun kutulari (.uygText) varken devreye girer;
// diger Luca sayfalari eskisi gibi calisir.
(() => {
    const hasProductTiles = () => !!document.querySelector(".uygText[onclick]");
    const isSelfTarget = (name) => !name || /^_(self|top|parent)$/i.test(String(name));

    const originalOpen = window.open;
    window.open = function (url, name, features) {
        if (!hasProductTiles()) return originalOpen.apply(this, arguments);

        // Siklikla once bos adresle adli pencere acilir, sonra form o ada gonderilir:
        // bu sekmeye o adi vermek formun da burada acilmasini saglar.
        if (!isSelfTarget(name)) {
            try {
                window.name = String(name);
            } catch (e) {
                // yok sayilir
            }
        }

        const href = url ? String(url) : "";
        if (href && href !== "about:blank") {
            window.location.assign(new URL(href, location.href).href);
        }
        return window;
    };

    const forceSelf = (element) => {
        if (element && !isSelfTarget(element.target) && hasProductTiles()) {
            element.target = "_self";
        }
    };

    const originalSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function () {
        forceSelf(this);
        return originalSubmit.call(this);
    };

    document.addEventListener("submit", (event) => forceSelf(event.target), true);
    document.addEventListener("click", (event) => {
        const link = event.target && event.target.closest && event.target.closest("a[target]");
        if (link) forceSelf(link);
    }, true);
})();
