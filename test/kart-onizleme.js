// Tüm resim kartlarını örnek veriyle bir klasöre çizer:  node test/kart-onizleme.js [klasör]
const fs = require('node:fs'), path = require('node:path');
const c = require('../src/core/cizim');
const hedef = process.argv[2] || path.join(__dirname, '..', 'data', 'onizleme');
fs.mkdirSync(hedef, { recursive: true });
(async () => {
  const kartlar = {
    sunucu: await c.sunucuKart({ ad: 'AuraCraft', adres: 'auracraft.net.tr', motd: 'Survival • Skyblock • BedWars — 1.21 destekli', oyuncu: 184, max: 500, surum: 'Paper 1.21.4', ping: 38, rekor: 412, liste: ['Kadir', 'Notch_TR', 'elmasci', 'creeperAvcisi'] }),
    profil: await c.profilKart({ yetkili: { ad: 'Moderatör', renk: '#5ad1ff' }, vip: { ad: 'MVP+', renk: '#ff5edb' }, ad: 'Kadir Arslan', seviye: 27, sira: 3, kalan: 2140, gereken: 5095, para: 48250, mesaj: 12893, ses: 412000, rep: 37, seri: 12, basarim: 9, basarimToplam: 18, rutbe: { ad: 'DEMİR', renk: '#e6e6e6' }, mc: 'Kadir_TR', klan: 'KMP' }),
    oda: await c.odaKart({ ad: 'Elmas Madeni', sahip: 'Kadir', kisi: 3, limit: 5, kilitli: true, gizli: false }),
    siralama: await c.siralamaKart({ baslik: 'Seviye Sıralaması', altBaslik: 'AuraCraft', ben: 'Senin sıran: #3', satirlar: ['maXoz', 'Zeynep', 'Kadir', 'Deniz', 'Baran'].map((ad, i) => ({ ad, avatar: null, deger: `Seviye ${40 - i * 3}`, alt: `${(90000 - i * 7400).toLocaleString('tr-TR')} XP` })) }),
    hosgeldin: await c.bannerKart({ ust: 'HOŞ GELDİN', baslik: 'Zeynep', alt: 'Örnek Craft  •  1.284. üye', ad: 'Zeynep' }),
    kurallar: await c.bannerKart({ ust: 'OKUMADAN GEÇME', baslik: 'Sunucu Kuralları', alt: 'Discord ve Minecraft sunucumuzda geçerlidir', logo: true }),
    hesap: await c.bannerKart({ ust: 'HESAP BAĞLANDI', baslik: 'Kadir_TR', alt: 'Ödül: 1.000 coin + oyun içi eşyalar', avatarUrl: c.kafaUrl('Kadir_TR'), ad: 'Kadir_TR' }),
    hesapPanel: await c.bannerKart({ ust: 'HESAP BAĞLA', baslik: 'Ödülünü al', alt: 'Minecraft hesabını bağla: rol, coin ve oyun içi ödül kazan', logo: true }),
    muzik: await c.muzikKart({ baslik: 'C418 - Sweden', kanal: 'Minecraft Volume Alpha', sure: 215, isteyen: 'Kadir', sira: 3 }),
    kadro: await c.kadroKart({ sunucu: 'AuraCraft', toplam: 8, gorevde: 3, gruplar: require('../src/core/yetki').RUTBELER.map((r, k) => ({ ad: r.ad, renk: r.renk, uyeler: [['Kadir'], ['Zeynep'], ['maXoz', 'Deniz'], ['Baran'], ['Can', 'Ece'], ['Selin']][k].map((ad, n) => ({ ad, avatar: null, gorevde: (k + n) % 2 === 0, alt: (k + n) % 2 === 0 ? 'Görevde' : '2 saat önce' })) })) }),
    vip: c.vipKart({ sunucu: 'AuraCraft', paketler: require('../src/core/yetki').VIPLER.slice().reverse() }),
    terfi: await c.bannerKart({ ust: 'TERFİ', baslik: 'Zeynep', alt: 'Rehber → Moderatör', ad: 'Zeynep', vurgu: '#5ad1ff' }),
    yardim: c.yardimKart('AuraCraft', 9, 61),
  };
  for (const [ad, k] of Object.entries(kartlar)) fs.writeFileSync(path.join(hedef, `${ad}.png`), k.attachment);
  console.log(`${Object.keys(kartlar).length} kart çizildi → ${hedef}`);
})();
