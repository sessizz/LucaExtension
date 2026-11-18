# Luca Captcha, 2FA ve Firma Doldurucu

Chrome uzantisi; `https://agiris.luca.com.tr/` adresindeki Luca giris ekraninda captcha cozumu, iki asamali dogrulama (2FA) kodu ve kayitli firma bilgilerini otomatik doldurma icin kullanilir.

## Ozellikler

- Luca giris sayfasinda firma secim paneli gosterir.
- Uye numarasi, kullanici adi ve parola alanlarini kayitli firma bilgileriyle doldurur.
- Doldurma sonrasinda giris butonuna tiklar.
- **2FA (Google Authenticator):** her firmaya kendi QR kodu kaydedilir. Giristen sonra gelen kod ekraninda (`#code`) secilen firmanin 6 haneli kodunu uretip yazar ve `Tamam`a basar.
  - QR, uzanti penceresine ekran goruntusu olarak yapistirilir (Ctrl+V), surukle-birak veya dosyadan secilir. Anahtar metni (`otpauth://...` veya `JBSW...`) de yapistirilabilir.
  - Sitenin `otpauth://totp/...` QR'i ve Google Authenticator "Hesaplari aktar" QR'i (`otpauth-migration://`) desteklenir; aktarma QR'inda birden cok hesap varsa firmaya ait olan secilir.
  - Kodlar yerelde (Web Crypto, RFC 6238) uretilir; hicbir yere gonderilmez. Popup'ta her firmanin guncel kodu ve kalan suresi gorunur, tiklayinca kopyalanir.
  - Otomatik gonderim firma secimi basina bir kez yapilir; kod reddedilirse panelden firma tekrar secilir.
  - Bilgiler elle yazilsa da calisir: uye no + kullanici adi kayitli bir firmayla eslesirse (kullanici adi buyuk/kucuk harf duyarsiz) o firma panelden secilmis sayilir ve 2FA kodu otomatik yazilir.
- 2FA aktif olmayan hesaplarda captcha cozumu eskisi gibi calisir: sayfada hangisi cikarsa o doldurulur.
- Captcha cozumu icin OpenAI uyumlu (`/chat/completions`) bir gorsel model kullanir:
  - **OpenRouter** (varsayilan, `google/gemini-2.5-flash-lite`)
  - **OpenAI** (`gpt-4.1-mini`)
  - **Ozel**: OpenAI uyumlu herhangi bir API adresi (Ollama, LM Studio, Groq vb.). Kaydederken o adres icin tarayici izni istenir; API anahtari istege baglidir.
- Saglayici, model ve API anahtari uzanti penceresinden ayarlanir.
- Captcha cevabi gecerli gorunuyorsa (3-10 harf/rakam) `Tamam`a kendisi basar; yanlis okumalarda Luca'ya durmadan giris gitmesin diye 5 dakikada en fazla 3 kez.
- Yapay zeka bos metin dondururse sayfa yenilenip yeni captcha istenir (arka arkaya en fazla 3 kez; giris alanlarina klavyeden yazilmaya baslandiysa yenilenmez).
- Ayarlari, firma bilgilerini ve 2FA anahtarlarini Chrome `storage.local` alaninda **sifresiz** saklar.
- Firma listesi JSON olarak disa/ice aktarilabilir (yedek dosyasi parola ve 2FA anahtarlarini sifresiz icerir).

## Kurulum

1. Chrome'da `chrome://extensions` sayfasini acin.
2. Gelistirici modunu etkinlestirin.
3. `Paketlenmemis oge yukle` ile bu klasoru secin.

## Test

```
node --test
```

QR okuma icin [jsQR 1.4.0](https://github.com/cozmo/jsQR) (`vendor/`, Apache-2.0) kullanilir.

## Gizlilik

Gizlilik detaylari icin [PRIVACY.md](PRIVACY.md) dosyasina bakabilirsiniz.
