// Tüm resim kartlarını örnek veriyle bir klasöre çizer:  node test/kart-onizleme.js [klasör]
const fs = require('node:fs'), path = require('node:path');
const c = require('../src/core/cizim');
const hedef = process.argv[2] || path.join(__dirname, '..', 'data', 'onizleme');
fs.mkdirSync(hedef, { recursive: true });
const uye = (id, ad, ek = {}) => ({ id: String(id), ad, avatar: null, renk: null, ...ek });
const oyuncu = (ad, k, d, a, ek = {}) => ({ ad, k, d, a, kd: k / d, adr: 60 + k * 2.1, hs: 30 + (k % 5) * 6, mvp: k % 4, ...ek });
(async () => {
  const kartlar = {
    profil: await c.profilKart({ ad: 'Kadir Arslan', avatar: null, seviye: 27, sira: 3, kalan: 2140, gereken: 5095, para: 48250, mesaj: 12893, ses: 412000, rep: 37, elo: 1184, g: 23, m: 14, basarim: 12, basarimToplam: 20, klan: 'KMP', boost: true, faceit: { lvl: 8, elo: 1702, nick: 'kadir-awp' } }),
    siralama: await c.siralamaKart({ baslik: 'Seviye Sıralaması', altBaslik: 'Önizleme Sunucusu', ben: 'Senin sıran: #3', satirlar: ['maXoz', 'Zeynep', 'Kadir', 'xX_Awp_Xx', 'Deniz', 'Baran', 'Elif', 'Çağrı', 'İlker', 'Gökçe'].map((ad, i) => ({ ad, avatar: null, deger: `Seviye ${40 - i * 3}`, alt: `${(90000 - i * 7400).toLocaleString('tr-TR')} XP` })) }),
    seviye: await c.bannerKart({ ust: 'SEVİYE ATLADI', baslik: 'Seviye 28', alt: 'Kadir Arslan  •  Ödül: 1.400 coin', ad: 'Kadir', vurgu: c.RENK.altin }),
    hosgeldin: await c.bannerKart({ ust: 'HOŞ GELDİN', baslik: 'Zeynep', alt: 'Seninle birlikte 1.284 kişi olduk  •  Ateşin başında yerin hazır', ad: 'Zeynep' }),
    faceit: await c.faceitKart({ nick: 'kadir-awp', avatar: null, ulke: 'TR', bolge: 'EU', lvl: 8, elo: 1702, oran: 0.78, ilerleme: "Seviye 9'a 49 ELO", kutular: [['MAÇ', '1.482'], ['KAZANMA', '%54', c.RENK.yesil], ['K/D', '1.18', c.RENK.yesil], ['HS', '%47'], ['ADR', '82.4'], ['EN UZUN SERİ', '11', c.RENK.altin]], son: [1, 1, 0, 1, 0], haritalar: [{ ad: 'Mirage', mac: 402, kazanma: 57, kd: '1.24' }, { ad: 'Inferno', mac: 311, kazanma: 52, kd: '1.15' }, { ad: 'Ancient', mac: 198, kazanma: 49, kd: '1.09' }] }),
    skor: c.skorTablosu({ harita: 'Mirage', alt: 'FACEIT 5v5  •  12 Kasım 2026  •  24 tur', dipnot: 'Turuncu satırlar bu sunucunun üyeleri', takimlar: [
      { ad: 'team_kadir-awp', skor: 13, kazandi: true, oyuncular: [oyuncu('kadir-awp', 27, 14, 5, { vurgu: true, etiket: '@Kadir', ace: 1 }), oyuncu('maXoz', 21, 16, 7, { vurgu: true, etiket: '@maXoz' }), oyuncu('s1mpleFan', 18, 15, 4), oyuncu('duman', 15, 17, 9), oyuncu('eco_kral', 11, 18, 6)] },
      { ad: 'team_rakip', skor: 11, kazandi: false, oyuncular: [oyuncu('n0scope', 24, 18, 3), oyuncu('ruski', 19, 19, 5), oyuncu('lurker', 16, 18, 8), oyuncu('entry', 12, 19, 4), oyuncu('igl', 9, 18, 10)] }] }),
    kamp: await c.kampKart({ kanal: 'Kamp Ateşi', sunucu: 'Önizleme', ates: { yakit: 72, seri: 12 }, muzik: 'Duman - Senden Daha Güzel', uyeler: ['Kadir', 'maXoz', 'Zeynep', 'xX_Awp_Xx', 'Deniz', 'Baran', 'Elif'].map((ad, i) => uye(i, ad, { sessiz: i === 2 })) }),
    muzik: await c.muzikKart({ baslik: 'Duman - Senden Daha Güzel', kanal: 'Duman', sure: 251, isteyen: 'Kadir', sira: 3 }),
    yardim: c.yardimKart(11, 60),
    karne: await c.haftalikKart({ sunucu: 'Önizleme Sunucusu', tarih: '6 - 12 Kasım', ozet: [['MESAJ', '18.420'], ['SES SAATİ', '912'], ['YENİ ÜYE', '+47'], ['ATEŞ SERİSİ', '12 gün']], bolumler: [['EN ÇOK YAZANLAR', 'mesaj'], ['SESİN KRALLARI', 'saat'], ['EN ÇOK XP', 'XP']].map(([baslik, b]) => ({ baslik, satirlar: ['maXoz', 'Zeynep', 'Kadir'].map((ad, i) => ({ ad, avatar: null, deger: `${900 - i * 210} ${b}` })) })) }),
  };
  for (const [ad, k] of Object.entries(kartlar)) fs.writeFileSync(path.join(hedef, `${ad}.png`), k.attachment);
  console.log(`${Object.keys(kartlar).length} kart çizildi → ${hedef}`);
})();
