# 🔥 KampAteş Bot

Oyun toplulukları için her şey dahil Discord botu. discord.js v14, slash komutları, sıfır harici veritabanı (Node'un yerleşik SQLite'ı).

Öne çıkan özellik: **3D kamp ateşi**. Bir ses kanalına giren herkes, tarayıcıda açılan canlı 3D sahnede ateşin etrafında oturur. Biri girip çıktıkça sahne güncellenir, kanal sohbetine yazılanlar konuşma balonu olur, odun atılır, marshmallow kızartılır.

## Kurulum

Gereken: **Node.js 22.13 veya üstü**.

1. [Discord Developer Portal](https://discord.com/developers/applications) → New Application → **Bot** sekmesi:
   - Token'ı kopyala.
   - **Privileged Gateway Intents** altında **Server Members Intent** ve **Message Content Intent**'i aç. (Açılmazsa bot giriş yapamaz.)
2. OAuth2 → URL Generator: `bot` + `applications.commands` kapsamlarını, yetki olarak **Administrator**'ı seç; çıkan linkle botu sunucuna ekle.
3. Dosyaları hazırla:
   ```
   npm install
   copy .env.example .env      (Linux/Mac: cp .env.example .env)
   ```
   `.env` içine `DISCORD_TOKEN` yaz. Komutların anında görünmesi için `GUILD_ID`'ye sunucu ID'ni yaz (boş bırakırsan global kayıt olur, yayılması 1 saate kadar sürebilir).
4. Başlat: `npm start` (Windows'ta `baslat.bat`).
5. Sunucuda **`/kurulum`** yaz: gerekli kanalları, cezalı rolünü ve "Oda Oluştur" / "Kamp Ateşi" ses kanallarını kendisi kurar.
6. Botun rolünü rol listesinde **yukarı taşı** (yönettiği rollerin üstünde olmalı).

### Müzik için
Ek kurulum gerekmez: ffmpeg paketle birlikte gelir. Şarkı adıyla/YouTube'dan çalmak için bot ilk kullanımda **yt-dlp** programını GitHub'daki resmî sürümünden `data/bin` klasörüne kendisi indirir. Bunu istemiyorsan `.env` içine `YTDLP_OTOMATIK_INDIR=0` yaz; radyolar ve doğrudan ses linkleri yine çalışır.

### İsteğe bağlı anahtarlar
| Değişken | Ne için | Nereden |
|---|---|---|
| `FACEIT_API_KEY` | `/faceit` komutları ve maç takibi | developers.faceit.com → App Studio → API Keys (Server side) |
| `STEAM_API_KEY` | `/steam` | steamcommunity.com/dev/apikey |
| `PUBLIC_URL`, `WEB_PORT` | Kamp ateşi bağlantıları | Botu VDS'te çalıştırıyorsan `http://SUNUCU_IP:3000` yaz ve portu aç |

> Kamp ateşi sayfası botun çalıştığı makineden sunulur. Bot kendi bilgisayarındaysa `localhost` bağlantısı yalnızca sende açılır; arkadaşlarının da görmesi için botu bir VDS'te çalıştır ya da portu dışarı aç ve `PUBLIC_URL`'i ona göre ayarla.

## Özellikler

### 🔥 Kamp ateşi (3D)
- **Komut yazmaya gerek yok:** bir ses kanalına girince kanalın sohbetine kendiliğinden resimli kamp kartı düşer (kim ateş başında, ateş ne durumda, ne çalıyor). Karttaki butonlarla 3D sahne açılır, odun atılır, hatıra fotoğrafı çekilir, menüden radyo açılır. `/kamp otomatik` ile kapatılabilir
- `/kamp aç` — aynı 3D bağlantıyı komutla verir (kişiye özel imzalı bağlantı)
- Avatarlar Discord profil fotoğrafı, rol rengi, seviye, FACEIT seviyesi ve klan etiketiyle görünür; susturma/sağırlaştırma/yayın simgeleri canlıdır
- İfadeler: selam, alkış, dans, odun at, marshmallow kızart, korku hikâyesi (ateş yeşile döner)
- **Sunucu ateşi:** seste zaman geçtikçe ve odun atıldıkça büyür, kimse yokken söner. Her gün seste biri olursa **ateş serisi** uzar (`/kamp durum`)

### 🎵 Müzik
- `/müzik çal` — şarkı adı, YouTube linki/listesi ya da ses dosyası linki. `/müzik radyo` — canlı radyolar
- Resimli "şimdi çalıyor" kartı ve butonlar: duraklat, geç, döngü, karıştır, durdur, ses, sıra
- Müzik çalarken 3D sahnede ateşin yanında radyo belirir, herkes kafa sallar

### 🎯 Oyun
- `/faceit profil` — resimli profil kartı (ELO, seviye, K/D, haritalar) ve butonlar
- **Skor tablosu:** bir maçtaki 10 oyuncunun tamamı (K/D/A, K/D, ADR, HS%, MVP, ACE) tek resimde; sunucu üyeleri vurgulanır. `/faceit maçlar` menüsünden ya da profildeki butondan açılır
- **Maç takibi:** hesabını bağlayanların biten maçları skor tablosuyla birlikte kanala düşer (ELO farkı, seviye atlama). 3 mağlubiyet üst üste gelince **tilt alarmı** verir
- `/faceit karşılaştır | bağla | sıralama | roller`
- Otomatik **FACEIT 1-10 rolleri**
- `/oyun-sunucu sorgula | panel` — CS2/Source ve Minecraft sunucu durumu; her dakika güncellenen canlı panel
- `/steam` — seviye, CS2 saati, VAC durumu

### ⚔️ Rekabet
- `/maç oluştur` — lobi → takım kurma (ELO dengeli / rastgele / kaptan seçimi) → **harita vetosu** → takım ses odaları → sonuç. Sunucu içi **ELO** ve sıralama
- `/turnuva` — butonla kayıt, tek elemeli fikstür, bay geçişleri, şampiyon ödülü
- `/takım-ara` — takım arkadaşı ilanı; kadro dolunca oda açılır
- `/tahmin` — coin'le oynanan **tahmin borsası** (havuz, kazananlara oranla dağıtılır)
- `/ödül koy` — **ödül avı**: birinin başına ödül koy, onu `/düello`'da yenen alır

### 📈 Seviye, ekonomi, eğlence
- Mesaj ve ses XP'si, seviye rolleri; resimli `/profil` kartı, menüden türü değişen resimli `/sıralama`, resimli seviye atlama ve hoş geldin kartları
- **Haftanın karnesi:** her pazar akşamı haftanın en çok yazanı, seste en çok duranı ve en çok XP kazananı tek resimde; birincilere ödül
- **Günlük görevler** (her üyeye her gün 3 farklı) ve 20 **başarım**
- `/günlük` (seri bonuslu), `/çalış`, `/gönder`, `/market` (rol satışı, 2x XP), `/kumar slot | yazıtura | blackjack`
- `/düello` (refleks), `/aim` (aim antrenmanı), `/trivia`, `/tkm`, sayı sayma ve kelime zinciri kanalları
- `/klan` — klan kur, davet et, kasa, klan sıralaması

### 👥 Topluluk ve yönetim
- Özel ses odaları ("Oda Oluştur"a gir → kendi odan, butonlu kontrol paneli)
- Ticket sistemi (dökümlü), çekiliş, anket, öneri, yıldız panosu, rol paneli
- `/hatırlat`, `/zaman-kapsülü`, `/afk`, `/doğumgünü`, davet takibi, `/nabız` (aktivite grafiği)
- Moderasyon: ban, kick, sustur, uyarı (3/5/7'de otomatik ceza), jail, toplu silme, kilit, yavaş mod, kayıt kanalı
- **Otomod:** spam, davet/link, yasaklı kelime, büyük harf, toplu etiket ve **baskın koruması**

Tüm komutlar için sunucuda `/yardım` yaz.

## Geliştirme
```
npm test                      # Discord'a bağlanmadan duman testleri
node test/kamp-onizleme.js    # 3D sahneyi sahte üyelerle tarayıcıda aç
node test/kart-onizleme.js    # tüm resim kartlarını örnek veriyle data/onizleme klasörüne çiz
```
Yapı: `src/core` (veritabanı, oyuncu servisi, yardımcılar), `src/modules` (her özellik bir dosya; komut/buton/olay tanımları), `src/web` (kamp ateşi sunucusu ve Three.js istemcisi). Veriler `data/bot.sqlite` dosyasında tutulur.

Eski discord.js v12 botu `legacy/` klasöründe duruyor.
