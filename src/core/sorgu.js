// Minecraft sunucu sorgusu — harici servis yok: Java (Server List Ping, TCP) ve Bedrock (RakNet ping, UDP)
const dgram = require('node:dgram');
const net = require('node:net');
const dns = require('node:dns').promises;

function adresAyir(adres, varsayilanPort) {
  const m = String(adres).trim().match(/^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!m) throw new Error('Geçersiz adres. Örnek: `play.sunucum.com` ya da `1.2.3.4:25565`');
  const port = m[2] ? Number(m[2]) : varsayilanPort;
  if (port < 1 || port > 65535) throw new Error('Geçersiz port.');
  return { host: m[1], port, portVerildi: Boolean(m[2]) };
}
const coz = async (host) => (net.isIP(host) ? host : (await dns.lookup(host, { family: 4 }).catch(() => { throw new Error('Sunucu adresi çözümlenemedi.'); })).address);

const varint = (n) => { const d = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; d.push(b); } while (n); return Buffer.from(d); };
function varintOku(buf, p) {
  let v = 0, kay = 0, b;
  do { if (p >= buf.length) return null; b = buf[p++]; v |= (b & 0x7f) << kay; kay += 7; } while (b & 0x80);
  return [v, p];
}
const mcMetin = (d) => (typeof d === 'string' ? d : (d?.text || '') + (d?.extra || []).map(mcMetin).join('')).replace(/§./g, '');
const duzMetin = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean).join(' — ');

async function java(adres) {
  let { host, port, portVerildi } = adresAyir(adres, 25565);
  let hedef = host;
  if (!portVerildi && !net.isIP(host)) {
    const srv = await dns.resolveSrv(`_minecraft._tcp.${host}`).catch(() => []);
    if (srv[0]) { hedef = srv[0].name; port = srv[0].port; }
  }
  const ip = await coz(hedef);
  return new Promise((resolve, reject) => {
    const basla = Date.now();
    const s = net.createConnection({ host: ip, port, timeout: 5000 });
    let tampon = Buffer.alloc(0), bitti = false;
    const bitir = (e, v) => { if (bitti) return; bitti = true; s.destroy(); e ? reject(e) : resolve(v); };
    s.on('timeout', () => bitir(new Error('Sunucu yanıt vermedi.')));
    s.on('error', () => bitir(new Error('Sunucuya bağlanılamadı.')));
    s.on('connect', () => {
      const h = Buffer.from(host);
      const el = Buffer.concat([varint(0), varint(767), varint(h.length), h, Buffer.from([port >> 8, port & 0xff]), varint(1)]);
      s.write(Buffer.concat([varint(el.length), el, Buffer.from([1, 0])]));
    });
    s.on('data', (d) => {
      tampon = Buffer.concat([tampon, d]);
      const uz = varintOku(tampon, 0);
      if (!uz || tampon.length < uz[0] + uz[1]) return;
      const id = varintOku(tampon, uz[1]), jl = varintOku(tampon, id[1]);
      try {
        const j = JSON.parse(tampon.toString('utf8', jl[1], jl[1] + jl[0]));
        bitir(null, { tur: 'java', motd: duzMetin(mcMetin(j.description)), surum: (j.version?.name || '?').replace(/§./g, ''), oyuncu: j.players?.online ?? 0, max: j.players?.max ?? 0,
          liste: (j.players?.sample || []).map((x) => String(x.name).replace(/§./g, '')).filter((n) => /^[.\w]{2,17}$/.test(n)).slice(0, 8), ikon: typeof j.favicon === 'string' && j.favicon.startsWith('data:image/png;base64,') ? j.favicon : null, ping: Date.now() - basla });
      } catch { bitir(new Error('Sunucudan anlaşılır bir yanıt alınamadı.')); }
    });
  });
}

const RAKNET = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
async function bedrock(adres) {
  const { host, port } = adresAyir(adres, 19132);
  const ip = await coz(host);
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4'), basla = Date.now();
    const zaman = setTimeout(() => { s.close(); reject(new Error('Sunucu yanıt vermedi.')); }, 4000);
    s.on('error', () => { clearTimeout(zaman); s.close(); reject(new Error('Sunucuya bağlanılamadı.')); });
    s.on('message', (b) => {
      if (b[0] !== 0x1c || b.length < 35) return;
      clearTimeout(zaman); s.close();
      const p = b.toString('utf8', 35).split(';'); // MCPE;motd;protokol;sürüm;çevrimiçi;max;...
      resolve({ tur: 'bedrock', motd: [p[1], p[7]].filter(Boolean).map((x) => x.replace(/§./g, '')).join(' — '), surum: `Bedrock ${p[3] || '?'}`, oyuncu: Number(p[4]) || 0, max: Number(p[5]) || 0, liste: [], ikon: null, ping: Date.now() - basla });
    });
    const zamanBuf = Buffer.alloc(8); zamanBuf.writeBigInt64BE(BigInt(Date.now()));
    s.send(Buffer.concat([Buffer.from([0x01]), zamanBuf, RAKNET, Buffer.alloc(8, 7)]), port, ip);
  });
}

module.exports = { java, bedrock, adresAyir, sorgula: (tur, adres) => (tur === 'bedrock' ? bedrock(adres) : java(adres)) };
