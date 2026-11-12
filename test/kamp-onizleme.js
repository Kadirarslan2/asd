// Kamp ateşi sahnesini sahte bir ses kanalıyla ayağa kaldırır (Discord gerekmez):  node test/kamp-onizleme.js
process.env.DB_PATH = ':memory:';
const { sunucuBaslat } = require('../src/web/server');
const adlar = ['Kadir', 'maXoz', 'Zeynep', 'xX_Awp_Xx', 'Deniz', 'Baran', 'Elif'];
const uyeler = adlar.map((ad, i) => ({ id: String(1000 + i), ad, avatar: `https://cdn.discordapp.com/embed/avatars/${i % 6}.png`, renk: null, sessiz: i === 2, sagir: i === 4, yayin: i === 3, kamera: false, bot: false, seviye: 3 + i * 4, faceit: i % 3 ? 4 + i : 0, klan: i === 1 ? 'KMP' : null }));
const ates = { yakit: 70, seri: 12, toplam: 348 };
(async () => {
  let web;
  web = await sunucuBaslat({ port: Number(process.env.WEB_PORT || 3000), saglayici: {
    dogrula: () => true,
    durum: () => ({ kanal: 'Kamp Ateşi', sunucu: 'Önizleme Sunucusu', uyeler, ates }),
    eylem: (g, c, u, m) => { web.yayin(g, c, { t: 'ifade', id: u, ad: m.ad }); if (m.ad === 'odun') { ates.yakit = Math.min(100, ates.yakit + 6); ates.toplam++; web.yayin(g, c, { t: 'ates', ates }); } return null; },
  } });
  console.log(`Önizleme: http://localhost:${web.port}/kamp/1/2?u=1000&k=x`);
  if (process.env.ONIZLEME_SOHBET !== '0') setInterval(() => web.yayin('1', '2', { t: 'sohbet', id: String(1000 + Math.floor(Math.random() * adlar.length)), metin: ['gg wp', 'bir maç daha atalım mı?', 'ateş çok güzel yanıyor', 'kim odun atacak'][Math.floor(Math.random() * 4)] }), 4000);
})();
