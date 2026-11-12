// Oyun sunucusu sorguları — harici servis kullanmadan: Source A2S_INFO (UDP) ve Minecraft Server List Ping (TCP)
const dgram = require('node:dgram');
const net = require('node:net');
const dns = require('node:dns').promises;

// Botun bulunduğu iç ağı taramaya karşı koruma: özel/yerel adreslere sorgu yapılmaz
function ozelMi(ip) {
  if (process.env.SORGU_OZEL_IZIN === '1') return false;
  if (net.isIPv6(ip)) return /^(::1$|::$|f[cd]|fe[89ab]|::ffff:)/i.test(ip);
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function adresAyir(adres, varsayilanPort) {
  const m = String(adres).trim().match(/^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!m) throw new Error('Geçersiz adres. Örnek: `1.2.3.4:27015` ya da `play.sunucu.com`');
  const port = m[2] ? Number(m[2]) : varsayilanPort;
  if (port < 1 || port > 65535) throw new Error('Geçersiz port.');
  return { host: m[1], port, portVerildi: Boolean(m[2]) };
}
async function coz(host) {
  const { address } = await dns.lookup(host).catch(() => { throw new Error('Sunucu adresi çözümlenemedi.'); });
  if (ozelMi(address)) throw new Error('Bu adrese sorgu yapılamaz.');
  return address;
}

async function source(adres) {
  const { host, port } = adresAyir(adres, 27015);
  const ip = await coz(host);
  const istek = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]), Buffer.from('Source Engine Query\0')]);
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    const basla = Date.now();
    const zaman = setTimeout(() => { s.close(); reject(new Error('Sunucu yanıt vermedi (kapalı olabilir ya da sorgu portu yanlış).')); }, 4000);
    s.on('error', (e) => { clearTimeout(zaman); s.close(); reject(e); });
    s.on('message', (b) => {
      if (b.length < 6 || b.readInt32LE(0) !== -1) return;
      if (b[4] === 0x41) return s.send(Buffer.concat([istek, b.subarray(5, 9)]), port, ip); // challenge
      if (b[4] !== 0x49) return;
      clearTimeout(zaman); s.close();
      let p = 6;
      const yazi = () => { const son = b.indexOf(0, p); const v = b.toString('utf8', p, son); p = son + 1; return v; };
      const ad = yazi(), harita = yazi(), klasor = yazi(), oyun = yazi();
      p += 2;
      resolve({ tur: 'source', ad, harita, oyun: oyun || klasor, oyuncu: b[p], max: b[p + 1], bot: b[p + 2], sifreli: b[p + 5] === 1, ping: Date.now() - basla, adres: `${host}:${port}` });
    });
    s.send(istek, port, ip);
  });
}

const varint = (n) => { const d = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; d.push(b); } while (n); return Buffer.from(d); };
function varintOku(buf, p) {
  let v = 0, kay = 0, b;
  do { if (p >= buf.length) return null; b = buf[p++]; v |= (b & 0x7f) << kay; kay += 7; } while (b & 0x80);
  return [v, p];
}
const mcMetin = (d) => (typeof d === 'string' ? d : (d?.text || '') + (d?.extra || []).map(mcMetin).join('')).replace(/§./g, '');

async function minecraft(adres) {
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
    let tampon = Buffer.alloc(0);
    const bitir = (e, v) => { s.destroy(); e ? reject(e) : resolve(v); };
    s.on('timeout', () => bitir(new Error('Sunucu yanıt vermedi (kapalı olabilir).')));
    s.on('error', () => bitir(new Error('Sunucuya bağlanılamadı (kapalı olabilir).')));
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
        bitir(null, { tur: 'minecraft', ad: mcMetin(j.description).trim().replace(/\s*\n\s*/g, ' — ') || host, surum: j.version?.name || '?', oyuncu: j.players?.online ?? 0, max: j.players?.max ?? 0,
          liste: (j.players?.sample || []).map((x) => x.name).slice(0, 12), ping: Date.now() - basla, adres: portVerildi ? `${host}:${port}` : host });
      } catch { bitir(new Error('Sunucudan anlaşılır bir yanıt alınamadı.')); }
    });
  });
}

module.exports = { source, minecraft, ozelMi, adresAyir, sorgula: (tur, adres) => (tur === 'minecraft' ? minecraft(adres) : source(adres)) };
