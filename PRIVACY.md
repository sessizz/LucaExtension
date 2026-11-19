# Gizlilik Politikasi

Luca Captcha, 2FA ve Firma Doldurucu uzantisi, yalnizca `https://agiris.luca.com.tr/` adresindeki Luca giris ekraninda kullaniciya yardimci olmak icin calisir. `https://www.luca.com.tr/` sayfasinda yalnizca "Sistem Giris" butonlarinin giris ekranini ayni sekmede acmasini saglar; bu sayfadan veri okumaz veya saklamaz.

## Saklanan Veriler

Uzanti, kullanicinin kendi girdigi firma adi, uye numarasi, kullanici adi, parola, iki asamali dogrulama (2FA) anahtari ile yapay zeka saglayici ayarlarini (saglayici, API adresi, model ve API anahtari) tarayicida yerel olarak saklar.

## Verilerin Kullanimi

Kaydedilen firma bilgileri, kullanicinin secimiyle Luca giris ekranindaki ilgili alanlari otomatik doldurmak icin kullanilir.

## Veri Paylasimi

Firma bilgileri, kullanici adi, parola ve 2FA anahtarlari gelistiriciye ait herhangi bir sunucuya gonderilmez, satilmaz, paylasilmaz ve reklam ya da profil olusturma amaciyla kullanilmaz.

## Iki Asamali Dogrulama (2FA)

2FA kodlari uzanti icinde yerel olarak uretilir. QR goruntuleri ve 2FA anahtarlari hicbir sunucuya gonderilmez; anahtarlar yalnizca kod uretmek icin kullanilir.

## Captcha Cozumu

Captcha cozumu ozelligi kullanildiginda, captcha gorseli kullanicinin sectigi yapay zeka saglayicisina (OpenRouter, OpenAI veya kullanicinin girdigi OpenAI uyumlu bir API adresi) kullanicinin kendi API anahtari ile gonderilebilir. Saglayici tarafindan islenen veriler o saglayicinin kendi sartlari ve gizlilik politikasina tabi olabilir.

## Toplanmayan Veriler

Uzanti web gecmisi, konum, saglik bilgisi, odeme bilgisi veya kisisel iletisim icerikleri toplamaz.

## Verilerin Silinmesi

Kullanici, uzantiyi Chrome'dan kaldirarak yerel olarak saklanan uzanti verilerini silebilir. Ayrica uzanti arayuzunden kayitli firma bilgilerini duzenleyebilir veya silebilir.

## Iletisim

E-posta: alperbah@gmail.com
