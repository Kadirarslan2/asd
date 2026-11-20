# AuraCraft Discord Botu

**auracraft.net.tr** Minecraft sunucusunun Discord botu. Tek komutla tüm Discord sunucusunu kurar; resimli kartlar, butonlar ve menülerle çalışır. AuraCraft survival paketiyle (Paper) konsol bağlantısı (RCON) üzerinden konuşur.

![logo](assets/logo.png)

## Kurulum (Windows)

1. **Node.js kur:** [nodejs.org](https://nodejs.org) → LTS sürümü (22.13 veya üstü).
2. **Botu oluştur:** [discord.com/developers/applications](https://discord.com/developers/applications) → New Application → **Bot** sekmesi:
   - **Reset Token** ile token'ı kopyala.
   - **Server Members Intent** ve **Message Content Intent**'i aç. Açmazsan bot giriş yapamaz.
3. **Sunucuna ekle:** OAuth2 → URL Generator → `bot` ve `applications.commands` kutuları, yetkilerden **Administrator**. Çıkan linki aç.
4. **`baslat.bat` dosyasına çift tıkla.** İlk açılışta `.env` dosyasını oluşturup Not Defteri'nde açar:
   - `DISCORD_TOKEN=` sonuna token'ı yapıştır.
   - `GUILD_ID=` sonuna Discord sunucu ID'ni yaz (Ayarlar → Gelişmiş → Geliştirici Modu; sunucuya sağ tık → Sunucu ID'sini Kopyala).
   - RCON bilgilerini de gir (aşağıda). Kaydet, `baslat.bat`'ı tekrar aç.
5. **Discord'da `/kurulum` yaz.** Roller, kategoriler, kanallar ve paneller kurulur.
6. **Sunucu Ayarları → Roller'den botun rolünü en üste taşı.** Yoksa rol veremez.

Linux/VDS: `npm install && cp .env.example .env`, `.env`'i doldur, `npm start`. Bot 7/24 açık kalsın istiyorsan VDS'te çalıştır.

## RCON'u açmak (önemli)

Hesap doğrulama, bağlama ödülleri, oyun içi market, whitelist ve Discord'dan oyuncu yönetimi RCON ile çalışır. Minecraft sunucusunun `server.properties` dosyasında:
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
Bot ile Minecraft aynı makinedeyse `MC_RCON_HOST=127.0.0.1` yaz ve RCON portunu güvenlik duvarında dışarıya **açma**.

## Hesap bağlama ve ödül

1. Oyuncu `auracraft.net.tr`'ye girer.
2. Discord'da **🔗・hesap-bağla** kanalındaki **Hesabımı bağla** butonuna basıp Minecraft adını yazar.
3. Bot oyunda yalnızca o oyuncuya görünen 6 haneli kod gönderir; oyuncu kodu **Kodu gir** butonuna yazar.
4. Hesap doğrulanır: **🔗 Hesap Bağlı** rolü, **1.000 coin** ve **oyun içi ödül** (3 elmas, 2 altın elma, 16 tecrübe şişesi) verilir.

Ödül her Minecraft hesabı ve her Discord üyesi için **bir kez** verilir; ayırıp tekrar bağlamak ödül kazandırmaz. Ödülleri `/hesap-ayar` ile değiştir:
- `/hesap-ayar para miktar:2000`
- `/hesap-ayar komut-ekle komut:give {oyuncu} minecraft:diamond 5`
- AuraCraft eklentisinin para ya da sandık anahtarı veren bir konsol komutu varsa onu da ekleyebilirsin (`{oyuncu}` yerine oyuncunun adı yazılır).
- `/hesap-ayar isim-eşitle açık:True` → Discord takma adı Minecraft adı olur.

RCON ayarlı değilse hesap "doğrulanmamış" bağlanır ve ödül verilmez.

## `/kurulum` ne kurar?

- **Roller:** 🔗 Hesap Bağlı, Üye, Oyuncu, Destek Ekibi, Cezalı ve seviye rütbeleri (Odun → Taş → Demir → Altın → Elmas → Netherite)
- **📢 Bilgi:** kurallar (kabul butonlu), duyurular, sunucu-durumu (canlı panel), hoş-geldin, başvuru, hesap-bağla
- **💬 Topluluk:** sohbet, ekran-görüntüleri, bot-komut, seviye, öneriler, yıldızlar, sayı-sayma, kelime-oyunu
- **🔊 Ses:** ➕ Oda Oluştur, Genel Sohbet, Müzik
- **🎫 Destek:** konu seçmeli talep paneli
- **🛡️ Yetkili:** mod-log, başvurular, cezalı
- **Market:** oyun içine teslim edilen hazır ürünler (elmas, altın elma, tecrübe şişesi, demir, yemek, roket)

İkinci kez çalıştırırsan yalnızca eksikleri tamamlar.

## Özellikler

### ⛏️ Minecraft
- `/sunucu` — canlı durum kartı: oyuncu sayısı, sürüm, gecikme, rekor. Canlı panel her dakika güncellenir; sunucu kapanınca/açılınca bildirim düşer; botun durum yazısında oyuncu sayısı görünür
- `/oyuncular` — şu an oyunda olanlar, hesabı bağlıysa Discord etiketiyle
- `/ip`, `/oy`, `/skin`, `/hesap`
- **Başvuru sistemi:** form → yetkili kanalı → Onayla/Reddet; onayda Oyuncu rolü, whitelist ve özel mesaj

### 🎮 Discord'dan oyun yönetimi (RCON)
- `/oyun at | ban | ban-kaldır | whitelist-ekle | whitelist-sil | duyur`
- `/ban oyundan-da:True` → Discord'dan banlanan üyenin bağlı Minecraft hesabı oyundan da banlanır
- `/duyuru oyuna-da:True` → duyuru oyundaki herkese de gider
- `/mc rcon` → konsol komutu (yalnızca Yönetici). Her işlem mod-log kanalına yazılır

### 🔊 Özel odalar
**➕ Oda Oluştur** kanalına giren üyeye kendi odası açılır ve oraya taşınır. Odanın sohbetine resimli kontrol paneli düşer: kilitle, gizle, limit, isim, üyeye izin ver, at, devret. Sahip çıkınca oda sıradaki kişiye geçer; boşalınca silinir. Açılamazsa sebebi mod-log kanalına yazılır.

### 📈 Seviye ve ekonomi
- Mesaj ve ses XP'si, resimli `/profil` (Minecraft kafasıyla) ve `/sıralama`, seviye atlama kartları, otomatik rütbe rolleri
- Günlük görevler, 18 başarım, haftalık karne
- `/günlük`, `/çalış`, `/gönder`, `/market` (Discord rolü ya da oyun içi eşya), `/kumar`, klanlar

### 🛡️ Moderasyon ve topluluk
- Ban, kick, sustur, uyarı (3/5/7'de otomatik ceza), jail, toplu silme, kilit, yavaş mod
- Otomod: spam, davet/link, yasaklı kelime, büyük harf, toplu etiket, baskın koruması
- Destek talepleri (dökümlü), çekiliş, anket, öneri, yıldız panosu, rol paneli, `/duyuru`
- Müzik (`/müzik çal`, `/müzik radyo`), Minecraft bilgi yarışması, düello, nişan antrenmanı, sayı sayma, kelime zinciri

Tüm komutlar için `/yardım`.

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Bir şey çalışmıyor | Discord'da **`/teşhis`** yaz: komutları, yetkileri, Minecraft bağlantısını ve RCON'u tek tek kontrol eder |
| Sunucu kapalı görünüyor ama açık | Bot ile Minecraft aynı bilgisayardaysa `.env`'e `MC_SORGU_ADRES=127.0.0.1:25565` yaz (modemler kendi dış adresine bağlanmaya çoğu zaman izin vermez). RCON ayarlıysa bot sunucuyu oradan da görür |
| Komut tıklayınca "uygulama yanıt vermedi" | Eski sürümün komutları kalmış olabilir: bot açılışta onları siler; Discord'da **Ctrl+R** ile listeyi yenile |
| "Used disallowed intents" / giriş yapamadı | Developer Portal → Bot → iki intent'i aç |
| Komutlar görünmüyor | `.env` içinde `GUILD_ID` doğru mu? Botu `applications.commands` kapsamıyla ekledin mi? |
| Hesap bağlarken "doğrulanmadı" diyor | RCON ayarlı değil; `.env`'e RCON bilgilerini gir, botu yeniden başlat |
| "Önce oyuna gir" diyor | Kod oyunda gönderilir; o adla sunucuda çevrimiçi ol |
| Özel oda açılmıyor | Mod-log kanalına sebep yazılır. Botta **Kanalları Yönet**, **Üyeleri Taşı**, **Rolleri Yönet** olmalı |
| Rol verilmiyor | Bot rolünü rol listesinde en üste taşı |

## Geliştirme
```
npm test                     # sahte Discord, Minecraft ve RCON sunucularıyla testler
node test/kart-onizleme.js   # resim kartlarını data/onizleme klasörüne çizer
```
