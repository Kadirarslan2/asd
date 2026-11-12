---
name: video-uret
description: Kullanıcı bir video, reklam filmi, kısa film, Reels/Shorts/TikTok videosu, tanıtım videosu üretmek, bir sahneyi yeniden üretmek, seslendirme eklemek veya videoyu farklı formatta dışa aktarmak istediğinde kullan. Senaryo ve storyboard'u yazar, Runway/Kling/Veo ile sahneleri üretir, ElevenLabs ile Türkçe seslendirir, FFmpeg ile kurgular.
---

# Video üretimi

Araç: bu depodaki `ai-video-studio/` (CLI: `studio`). Kullanıcı çoğunlukla telefondadır:
komut çalıştıramaz, dosya yolu açamaz. Her şeyi sen çalıştır, sonuçları SendUserFile ile
sohbete gönder, kullanıcıya komut verme.

## Hazırlık (oturumda bir kez)

```bash
cd ai-video-studio && pip install -q -e ".[llm]" && studio doctor
```

`doctor` çıktısında eksik API anahtarı veya erişilemeyen sunucu varsa, kullanıcıya hangi
servisin hazır olmadığını tek cümleyle söyle. Hiçbir video sağlayıcısı hazır değilse
`--mock` ile taslak üretip akışı göster ve bunun sahte görüntü olduğunu açıkça belirt.

## Akış

1. **Brif.** Eksikse şunları sor (tek mesajda): konu, süre, format (9:16 / 16:9 / 1:1),
   seslendirme isteniyor mu. Söylenmeyenlerde varsayılan: 9:16, 1080p, ~20 sn, sağlayıcı
   `doctor`'da hazır olan ilk servis.
2. **Storyboard'u kendin yaz.** `studio new` ile LLM çağırma; `projects/<ad>/project.yaml`
   dosyasını `examples/istanbul-sabahi.yaml` biçiminde doğrudan yaz. Kurallar:
   - Görsel alanlar (appearance, wardrobe, description, action, camera, lighting,
     atmosphere, motion, vfx, ambience) İngilizce; `title` ve `narration` Türkçe.
   - Her sahne tek kesintisiz çekim, tek net aksiyon; her sahnede farklı çekim ölçeği,
     açı, kamera hareketi, lens ve ışık.
   - Karakterin yüzü/saçı/kıyafeti yalnızca `characters` altında, ayrıntılı ve tek kez
     tarif edilir; `action` içinde tekrar edilmez.
   - `narration` sahne süresinin saniyesi başına en çok 2,2 kelime.
   - Sahne süreleri `studio models` çıktısındaki izinli sürelerden seçilir.
3. **Storyboard'u göster.** Sahneleri kısa bir liste olarak sohbette özetle ve onay al.
4. **Maliyet.** `studio estimate <ad>` çalıştır, toplamı ve kalemleri kullanıcıya yaz.
5. **Onay — kesin kural.** Kullanıcı o tutarı sohbette açıkça onaylamadan ücretli hiçbir
   komut çalıştırma. Onaydan sonra komuta onayı ilet:
   `echo evet | studio generate <ad>` ve `echo evet | studio audio <ad>`.
   Onay yalnızca gösterdiğin tutar ve işler için geçerlidir; tutar değişirse veya yeni bir
   iş çıkarsa (yeniden üretim dahil) yeniden sor. `echo evet` kullanımını asla kullanıcı
   onayı olmadan yapma.
6. **Önizleme.** Her sahnenin klibini (`projects/<ad>/scenes/sXX/takeNN.mp4`)
   SendUserFile ile gönder; hangi sahne olduğunu başlıkta yaz.
7. **Yeniden üretim.** Kullanıcı bir sahneyi beğenmezse maliyetini söyle, onay al, sonra
   `echo evet | studio regen <ad> <sahne> --note "<İngilizce yönetmen notu>"`. Eski çekime
   dönmek: `studio select <ad> <sahne> <çekim>`.
8. **Kurgu.** `studio render <ad>` (ücretsiz). Başka format: `--aspect 9:16`, `--res 4k`,
   `--all-formats`. Final dosyayı (`projects/<ad>/output/*.mp4`) SendUserFile ile gönder.

## Notlar

- Seslendirme için `audio.voice_id` gerekir: `studio voices` ile Türkçe bir ses bul,
  kullanıcıya 2-3 seçenek sun, seçileni `project.yaml`'a yaz.
- Tutarlar `studio/catalog.yaml`'daki tahmini birim fiyatlardan gelir; kullanıcıya her
  zaman "tahmini" olarak sun.
- Üretim yarıda kesilirse aynı komutu tekrar çalıştır: görev kimliği saklıdır, ikinci kez
  ücret alınmaz.
- Ayrıntı: `ai-video-studio/README.md`.
