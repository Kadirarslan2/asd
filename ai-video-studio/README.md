# AI Video Studio

Fikirden bitmiş videoya uzanan modüler prodüksiyon hattı:

**senaryo → storyboard → video (Runway / Kling / Veo) → ses (ElevenLabs) → kurgu (FFmpeg)**

Her ücretli adımdan önce tahmini maliyet gösterilir ve siz `evet` yazmadan hiçbir ücretli
istek gönderilmez.

## Kurulum

Gerekenler: Python 3.10+ ve FFmpeg.

| Sistem | Komut |
|---|---|
| Windows | `kurulum.bat` (FFmpeg yoksa: `winget install Gyan.FFmpeg`) |
| macOS / Linux | `./setup.sh` (FFmpeg yoksa: `brew install ffmpeg` / `sudo apt install ffmpeg`) |

Betik sanal ortam kurar, paketi yükler, `.env` dosyasını oluşturur ve `studio doctor`
çalıştırır. Sonraki oturumlarda önce sanal ortamı etkinleştirin
(`.venv\Scripts\activate` veya `source .venv/bin/activate`).

Ardından `.env` dosyasına yalnızca kullanacağınız servislerin anahtarlarını yazın:

| Değişken | Servis |
|---|---|
| `GEMINI_API_KEY` | Google Veo |
| `RUNWAYML_API_SECRET` | Runway |
| `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` | Kling |
| `ELEVENLABS_API_KEY` | Seslendirme ve ortam sesleri |
| `ANTHROPIC_API_KEY` | Otomatik senaryo yazımı (isteğe bağlı) |

`studio doctor` neyin hazır, neyin eksik olduğunu gösterir.

## Hızlı deneme (ücretsiz)

API anahtarı olmadan tüm hattı sahte kliplerle deneyebilirsiniz:

```bash
mkdir -p projects/demo
cp examples/istanbul-sabahi.yaml projects/demo/project.yaml
studio generate demo --mock      # sahte klipler
studio audio demo --mock         # sahte sesler
studio preview demo --open       # sahne sahne önizleme
studio render demo --all-formats # 16:9, 9:16 ve 1:1 final videolar
```

## Gerçek üretim akışı

```bash
# 1. Senaryo + storyboard (Claude ile; ~$0.25, onay ister). Anahtarsız iskelet: --offline
studio new "İstanbul'da sabah kahvesi reklamı" --aspect 9:16 --res 1080p --duration 30 --provider veo

# 2. Storyboard'u inceleyin, gerekirse projects/<ad>/project.yaml dosyasını düzenleyin
studio storyboard <ad>

# 3. Maliyeti görün (hiçbir istek gönderilmez)
studio estimate <ad>

# 4. Üretin — her komut maliyet tablosunu gösterip onayınızı ister
studio generate <ad>
studio voices                    # Türkçe ses seçin → project.yaml: audio.voice_id
studio audio <ad>

# 5. Sahneleri tek tek izleyin; beğenmediğinizi yeniden üretin
studio preview <ad> --open
studio regen <ad> 3 --note "slower camera move, warmer light"
studio select <ad> 3 1           # eski çekime dönmek isterseniz

# 6. Kurgu (yerel ve ücretsiz)
studio render <ad>
studio render <ad> --aspect 9:16 --aspect 1:1 --res 4k
```

Tüm komutlar: `studio --help`. Modeller ve fiyatlar: `studio models`.

## Özellikler

**Üretim modları.** Sahnenin `mode` alanı belirler: `text` (metinden), `image`
(`input_image` ilk kare, destekleyen modellerde `last_image` son kare), `video`
(`input_video` referans videodan; Runway `gen4_aleph`). Seçili model modu desteklemiyorsa
aynı sağlayıcının destekleyen modeline geçilir ve bu, maliyet tablosunda not olarak görünür.
Sahne bazında `provider` / `model` yazarak sağlayıcıları karıştırabilirsiniz.

**Sinematografi.** Her sahnenin kendi çekim ölçeği, kamera açısı, kamera hareketi, lensi,
ışığı, atmosferi, hareket tarifi ve efekti vardır (`camera`, `lighting`, `atmosphere`,
`motion`, `vfx`). Tüm istemlere gerçekçi fizik ve doğal insan hareketi yönergeleri eklenir.

**Tutarlılık.** Dört katman birlikte çalışır:

1. *Kimlik kilidi* — karakterin `appearance` + `wardrobe` ve mekânın `description` metni
   her sahnenin istemine kelimesi kelimesine aynı şekilde girer.
2. *Referans görseller* — `reference_images` listeleri, destekleyen modellere (ör. Veo 3.1)
   gönderilir.
3. *Sahne zincirleme* — `chain_from_previous: true` yazılan sahne, önceki sahnenin son
   karesini ilk kare olarak kullanır.
4. *Sabit seed* — proje `seed` değeri destekleyen modellere gönderilir.

**Ses.** `narration` alanları ElevenLabs ile Türkçe seslendirilir (karaktere özel
`voice_id` verilebilir); `ambience` tarifleri ortam sesine dönüşür. Metni değişmeyen ses
yeniden üretilmez.

**Kurgu.** Renk profilleri (`neutral`, `cinematic`, `warm`, `cold_noir`, `vibrant`) veya
kendi `.cube` LUT dosyanız, film greni, vinyet, keskinleştirme; sahne geçişleri (`cut` veya
`fade`, `dissolve`, `fadeblack`, `wipeleft`, `circleopen` gibi herhangi bir FFmpeg xfade
türü); seslendirme + ortam + müzik miksajı, seslendirme sırasında müziği otomatik kısma ve
−14 LUFS ses seviyesi; seslendirmeden üretilen `.srt` altyazı.

**Format ve çözünürlük.** 16:9, 9:16 ve 1:1; 720p, 1080p ve 4K. Veo 4K'yı doğal üretir;
Runway'de sağlayıcının 4K yükselticisi kullanılır; diğerlerinde 4K çıktı FFmpeg ile
büyütülür. Hangisinin uygulanacağı maliyet tablosunda yazar. Modelin üretmediği oranlar
(ör. Veo'da 1:1) 16:9 üretilip kurguda kırpılır.

**Maliyet güvenliği.**

- `studio estimate` yalnızca hesap yapar.
- Her ücretli iş (klip, seslendirme, ortam sesi, senaryo yazımı) ayrı ayrı onaylanır; onay
  tek kullanımlıktır ve onaylanan tutarı aşan işi kapsamaz. Yeniden üretim yeni onay ister.
- Yarıda kesilen üretimin görev kimliği saklanır; komutu tekrar çalıştırınca ikinci kez
  ödeme yapılmadan kaldığı yerden devam eder.
- Harcamalar `projects/<ad>/ledger.jsonl` dosyasına işlenir.

> Tutarlar `studio/catalog.yaml` içindeki birim fiyatlardan hesaplanan **tahmindir**.
> Sağlayıcılar fiyat ve model adlarını sık değiştirir; ilk ücretli üretimden önce bu dosyayı
> sağlayıcıların güncel fiyat sayfalarıyla karşılaştırın.

## Proje klasörü

```
projects/<ad>/
  project.yaml      senaryo + storyboard (elle düzenlenebilir)
  storyboard.md     okunabilir döküm
  scenes/s01/       take01.mp4, take02.mp4 …
  audio/            s01_vo.mp3, s01_amb.mp3 …
  preview/index.html
  output/           final videolar ve .srt
  state.json, approval.json, ledger.jsonl
```

## Mimari ve genişletme

| Modül | Görev |
|---|---|
| `studio/models.py` | Proje, sahne, karakter veri modelleri |
| `studio/script.py` | Senaryo + storyboard yazımı (Claude veya çevrimdışı iskelet) |
| `studio/prompting.py` | Sahne → model istemi, kimlik kilidi |
| `studio/plan.py` | Model/mod/süre/çözünürlük seçimi ve maliyet hesabı |
| `studio/budget.py` | Onay kapısı ve harcama defteri |
| `studio/providers/` | Runway, Kling, Veo, mock |
| `studio/audio.py` | ElevenLabs TTS ve ses efektleri |
| `studio/pipeline.py` | İşlerin çalıştırılması, kaldığı yerden devam |
| `studio/post.py` | FFmpeg kurgu, renk, geçiş, miksaj |
| `studio/preview.py` | Önizleme sayfası |
| `studio/catalog.yaml` | Modeller, sınırlar, fiyatlar |

Yeni bir video sağlayıcısı eklemek için `VideoProvider`'dan türetip `submit` ve `poll`
yazın, `providers/__init__.py` içinde kaydedin ve `catalog.yaml`'a aynı adla bir bölüm
ekleyin. Yeni model eklemek yalnızca katalog değişikliğidir.

Testler: `pytest` (ağ ve API anahtarı gerektirmez).
