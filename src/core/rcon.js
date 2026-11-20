// Minecraft RCON istemcisi: sunucu konsolunda komut çalıştırır (whitelist, ödül verme vb.)
const net = require('node:net');
const config = require('./config');

const paket = (id, tip, govde) => { const g = Buffer.from(govde, 'utf8'), b = Buffer.alloc(14 + g.length); b.writeInt32LE(10 + g.length, 0); b.writeInt32LE(id, 4); b.writeInt32LE(tip, 8); g.copy(b, 12); return b; };
const hazir = () => Boolean(config.rcon.host && config.rcon.sifre);

// Bağlan → giriş yap → komutu çalıştır → kapat. Yanıt metnini döndürür.
function calistir(komut, ayar = config.rcon) {
  return new Promise((resolve, reject) => {
    if (!ayar.host || !ayar.sifre) return reject(new Error('RCON ayarlı değil (.env içinde MC_RCON_HOST ve MC_RCON_PASSWORD).'));
    const s = net.createConnection({ host: ayar.host, port: ayar.port, timeout: 6000 });
    let tampon = Buffer.alloc(0), asama = 'giris', yanit = '', bitti = false, kapanis = null;
    const bitir = (e, v) => { if (bitti) return; bitti = true; clearTimeout(kapanis); s.destroy(); e ? reject(e) : resolve(v); };
    s.on('timeout', () => bitir(new Error('RCON zaman aşımı: Minecraft sunucusu yanıt vermedi.')));
    s.on('error', (e) => bitir(new Error(`RCON bağlantısı kurulamadı (${e.code || e.message}). enable-rcon=true ve port açık mı?`)));
    s.on('connect', () => s.write(paket(1, 3, ayar.sifre)));
    s.on('data', (d) => {
      tampon = Buffer.concat([tampon, d]);
      while (tampon.length >= 4 && tampon.length >= tampon.readInt32LE(0) + 4) {
        const uz = tampon.readInt32LE(0), id = tampon.readInt32LE(4), tip = tampon.readInt32LE(8), govde = tampon.toString('utf8', 12, 2 + uz);
        tampon = tampon.subarray(4 + uz);
        if (asama === 'giris') {
          if (tip !== 2) continue; // bazı sunucular önce boş bir yanıt yollar
          if (id === -1) return bitir(new Error('RCON şifresi yanlış.'));
          asama = 'komut'; s.write(paket(2, 2, komut));
        } else if (id === 2) {
          yanit += govde;
          clearTimeout(kapanis); kapanis = setTimeout(() => bitir(null, yanit.replace(/§./g, '').trim()), 150); // çok parçalı yanıtları topla
        }
      }
    });
  });
}
// Oyuncu adını komuta güvenle gömmek için: yalnızca geçerli Minecraft adları (Bedrock için baştaki nokta dahil)
const nickGecerli = (n) => /^\.?[A-Za-z0-9_]{3,16}$/.test(String(n));
// "There are 2 of a max of 20 players online: Ali, Veli" → ['Ali', 'Veli'] (Paper/Spigot/vanilla biçimi; renk kodları temizlenir)
async function oyuncular(ayar) {
  const c = await calistir('list', ayar);
  const liste = c.includes(':') ? c.slice(c.indexOf(':') + 1) : '';
  return liste.split(',').map((x) => x.replace(/§./g, '').replace(/^.*\]\s*/, '').trim()).filter(Boolean);
}
// list çıktısından sayı ve kapasite: "There are 3 of a max of 20 players online: ..." (Paper bazen "3 out of maximum 20" yazar)
async function liste(ayar) {
  const c = await calistir('list', ayar);
  const sayilar = (c.replace(/§./g, '').split(':')[0].match(/\d+/g) || []).map(Number);
  return { oyuncu: sayilar[0] ?? 0, max: sayilar[1] ?? 0, liste: await oyuncularMetinden(c) };
}
const oyuncularMetinden = (c) => (c.includes(':') ? c.slice(c.indexOf(':') + 1) : '').split(',').map((x) => x.replace(/§./g, '').replace(/^.*\]\s*/, '').trim()).filter(Boolean);
const cevrimici = async (nick, ayar) => (await oyuncular(ayar)).some((o) => o.toLowerCase() === String(nick).toLowerCase());
// Oyuncuya (ya da @a'ya) renkli mesaj: metin JSON olarak kaçışlanır, komuta enjeksiyon yapılamaz
const tellraw = (hedef, parcalar, ayar) => calistir(`tellraw ${hedef} ${JSON.stringify(parcalar)}`, ayar);
module.exports = { calistir, hazir, nickGecerli, oyuncular, cevrimici, tellraw, liste };
