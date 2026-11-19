# Luca 2FA (OTP) Desteği — Kısa Tasarım

## Amaç
Luca girişinde captcha yerine iki aşamalı doğrulama (TOTP) gelmeye başladı. Uzantı, her firma için
kaydedilen Google Authenticator anahtarıyla 6 haneli kodu üretip OTP ekranına yazmalı. 2FA aktif
olmayan hesaplarda eski captcha çözümü aynen çalışmaya devam etmeli.

## Kararlar (kullanıcıyla)
- Mevcut LucaCaptcha uzantısı genişletilir (yeni uzantı değil): kayıtlı firmalar yerinde kalır.
- Her firmanın kendi QR'ı vardır; QR okut / sil / yeniden okut firma formundadır.
- QR kaynağı: sitenin `otpauth://totp/...` QR'ı veya Google Authenticator "Hesapları aktar"
  QR'ı (`otpauth-migration://offline?data=...`). Aktarma QR'ında birden çok hesap varsa kullanıcı seçer.
- Şifreleme yok: anahtarlar da parolalar gibi `chrome.storage.local` içinde düz durur.
- Akış: login ekranında firma seçilir → üye no / kullanıcı / parola doldurulur → GİRİŞ.
  Ardından gelen ekranda `<input id="code" name="code">` ve `<input type="button" value="Tamam">` vardır.
- Hangi ekran gelirse o çalışır: captcha görünürse yapay zeka çözer, OTP kutusu görünürse kod yazılır.

## Yaklaşımlar
- **A) Yeni uzantı (LucaAuth klasörü):** kod çatallanır, firmalar aktarılmalı, iki panel çakışır. Seçilmedi.
- **B) LucaCaptcha'ya OTP eklemek:** tek kod tabanı, veri yerinde. **Seçildi.**

## Tasarım
- `totp.js` (saf JS, testli): base32, `otpauth://` ve `otpauth-migration://` (elle protobuf çözücü)
  ayrıştırma, Web Crypto ile TOTP (SHA1/256/512, 6/8 hane, periyot). Popup, content script ve
  node testleri ortak kullanır.
- `vendor/jsQR.js` (jsqr 1.4.0, Apache-2.0): popup'ta QR görüntüsünü çözer. Windows Chrome'da
  `BarcodeDetector` yok.
- Firma kaydına `otp: { secret, issuer, account, algorithm, digits, period }` alanı eklenir.
- Popup: QR yapıştır (Ctrl+V) / sürükle / dosya seç, QR sil, firma listesinde canlı kod + kalan süre
  (tıkla → kopyala), JSON dışa/içe aktarma (yedek), "yeni sekmede aç".
- Content script: login panelinde seçilen firma `sessionStorage`'a yazılır (10 dk geçerli, tek kullanımlık).
  OTP kutusu görünce: seçili firma + anahtar varsa kodu yazar, `Tamam`'a basar. Kalan süre < 5 sn ise
  yeni kodu bekler. Seçim yoksa / ikinci deneme ise OTP ekranında firma paneli çıkar, tıkla → yaz + Tamam.
  Otomatik gönderim seçim başına bir kez (yanlış anahtarla sonsuz deneme döngüsü olmasın).

## Uygulayıcıya kalanlar (benim kararlarım)
- UI metinleri mevcut popup gibi ASCII Türkçe.
- Uzantı adı: "Luca Captcha, 2FA ve Firma Doldurucu"; sürüm 1.3.
- Dışa aktarılan JSON'da parola ve anahtarlar şifresizdir; arayüzde uyarı gösterilir.
