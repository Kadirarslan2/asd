# Minecraft Topluluk Botu

Minecraft sunucuları için her şey dahil Discord botu. Tek komutla tüm sunucuyu kurar; resimli kartlar, butonlar ve menülerle çalışır.

![logo](assets/logo.png)

## Kurulum (Windows)

1. **Node.js kur:** [nodejs.org](https://nodejs.org) → LTS sürümü (22.13 veya üstü).
2. **Botu oluştur:** [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → **Bot** sekmesi:
   - **Reset Token** ile token'ı kopyala.
   - **Server Members Intent** ve **Message Content Intent**'i aç. Açmazsan bot giriş yapamaz.
3. **Sunucuna ekle:** OAuth2 → URL Generator → `bot` ve `applications.commands` kutuları, yetkilerden **Administrator**. Çıkan linki aç.
4. **`baslat.bat` dosyasına çift tıkla.** İlk açılışta `.env` dosyasını oluşturup Not Defteri'nde açar:
   - `DISCORD_TOKEN=` sonuna token'ı yapıştır.
   - `GUILD_ID=` sonuna sunucu ID'ni yaz (Discord Ayarlar → Gelişmiş → Geliştirici Modu; sunucuya sağ tık → Sunucu ID'sini Kopyala).
   - Kaydet, `baslat.bat`'ı tekrar aç. Paketleri kendisi kurar ve botu başlatır.
5. **Discord'da `/kurulum adres:play.sunucun.com ad:SunucuAdı` yaz.** Roller, kategoriler, kanallar ve paneller kurulur.
6. **Sunucu Ayarları → Roller'den botun rolünü en üste taşı.** Yoksa rol veremez.

Linux/VDS: `npm install && cp .env.example .env`, `.env`'i doldur, `npm start`.

Bot 7/24 açık kalsın istiyorsan bir VDS'te çalıştır; kendi bilgisayarında pencereyi kapatınca bot da kapanır.

## `/kurulum` ne kurar?

- **Roller:** Üye, Oyuncu, Destek Ekibi, Cezalı ve seviye rütbeleri (Odun → Taş → Demir → Altın → Elmas → Netherite)
- **📢 Bilgi:** kurallar (kabul butonlu), duyurular, sunucu-durumu (canlı panel), hoş-geldin, başvuru
- **💬 Topluluk:** sohbet, ekran-görüntüleri, bot-komut, seviye, öneriler, yıldızlar, sayı-sayma, kelime-oyunu
- **🔊 Ses:** ➕ Oda Oluştur, Genel Sohbet, Müzik
- **🎫 Destek:** konu seçmeli talep paneli
- **🛡️ Yetkili:** mod-log, başvurular, cezalı

İkinci kez çalıştırırsan yalnızca eksikleri tamamlar.

## Özellikler

### ⛏️ Minecraft
- `/sunucu` — canlı durum kartı: oyuncu sayısı, sürüm, gecikme, rekor, oyundakiler. Java ve Bedrock desteklenir
- **Canlı panel** her dakika güncellenir; sunucu kapanınca/açılınca kanala bildirim düşer; botun durum yazısında oyuncu sayısı görünür
- `/ip`, `/oy`, `/skin` — adres ve giriş rehberi, oy bağlantıları, oyuncu skini
- `/hesap bağla` — Minecraft hesabı profil kartında oyuncu kafasıyla görünür
- **Başvuru sistemi:** form → yetkili kanalı → Onayla/Reddet. Onayda Oyuncu rolü verilir, hesap bağlanır, üyeye özel mesaj gider
- **RCON (isteğe bağlı):** onaylanan başvuru otomatik whitelist'e eklenir; marketten coin'le **oyun içi ödül** satılır (`/market ekle komut:give {oyuncu} diamond 5`); `/mc rcon` ile konsol komutu çalıştırılır

### 🔊 Özel odalar
**➕ Oda Oluştur** kanalına giren üyeye kendi odası açılır ve oraya taşınır. Odanın sohbetine resimli kontrol paneli düşer: kilitle, gizle, limit, isim, üyeye izin ver, at, devret. Sahip çıkınca oda sıradaki kişiye geçer; boşalınca silinir.

### 📈 Seviye ve ekonomi
- Mesaj ve ses XP'si, resimli `/profil` ve `/sıralama`, seviye atlama kartları, otomatik rütbe rolleri
- Günlük görevler, 18 başarım, haftalık karne
- `/günlük`, `/çalış`, `/gönder`, `/market`, `/kumar slot | yazıtura | blackjack`, klanlar

### 🎵 Müzik
`/müzik çal` (şarkı adı, YouTube linki), `/müzik radyo`; butonlu "şimdi çalıyor" kartı.
Şarkı araması için bot ilk kullanımda **yt-dlp** programını GitHub'daki resmî sürümünden `data/bin` klasörüne indirir. İstemiyorsan `.env` içine `YTDLP_OTOMATIK_INDIR=0` yaz; radyolar yine çalışır.

### 🛡️ Moderasyon ve topluluk
- Ban, kick, sustur, uyarı (3/5/7'de otomatik ceza), jail, toplu silme, kilit, yavaş mod, kayıt kanalı
- Otomod: spam, davet/link, yasaklı kelime, büyük harf, toplu etiket, baskın koruması
- Destek talepleri (dökümlü), çekiliş, anket, öneri, yıldız panosu, rol paneli, `/duyuru`
- Minecraft bilgi yarışması, düello, nişan antrenmanı, sayı sayma, kelime zinciri

Tüm komutlar için `/yardım`.

## RCON'u açmak (isteğe bağlı)

Minecraft sunucusunun `server.properties` dosyasında:
```
enable-rcon=true
rcon.port=25575
rcon.password=GucluBirSifre
```
Sunucuyu yeniden başlat, sonra botun `.env` dosyasına yaz:
```
MC_RCON_HOST=sunucu-ip
MC_RCON_PORT=25575
MC_RCON_PASSWORD=GucluBirSifre
```
RCON portunu internete açık bırakma; yalnızca botun çalıştığı makine erişebilsin.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| "Used disallowed intents" / giriş yapamadı | Developer Portal → Bot → iki intent'i aç |
| Komutlar görünmüyor | `.env` içinde `GUILD_ID` doğru mu? Botu `applications.commands` kapsamıyla ekledin mi? |
| Özel oda açılmıyor | Mod-log kanalına sebep yazılır. Botta **Kanalları Yönet**, **Üyeleri Taşı**, **Rolleri Yönet** olmalı; `/ayar göster` ile oda kanalını kontrol et |
| Rol verilmiyor | Bot rolünü rol listesinde en üste taşı |
| Sunucu çevrimdışı görünüyor | `/mc ayarla` ile adres ve türü (Java/Bedrock) kontrol et |

## Geliştirme
```
npm test                     # sahte Discord, Minecraft ve RCON sunucularıyla testler
node test/kart-onizleme.js   # resim kartlarını data/onizleme klasörüne çizer
```
