// Kamp ateşi web sunucusu: statik dosyalar + avatar vekili + WebSocket odaları
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const PUBLIC = path.join(__dirname, 'public');
const THREE = path.join(__dirname, '..', '..', 'node_modules', 'three');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

function dosyaGonder(res, kok, goreli) {
  const tam = path.normalize(path.join(kok, goreli));
  if (!tam.startsWith(kok + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(tam, (e, veri) => {
    if (e) { res.writeHead(404).end('Bulunamadı'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(tam)] || 'application/octet-stream', 'Cache-Control': kok === THREE ? 'public, max-age=604800' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(veri);
  });
}

// saglayici: { dogrula(g, c, u, k), durum(g, c), eylem(g, c, u, mesaj) }
function sunucuBaslat({ port, saglayici }) {
  const odalar = new Map(); // "g:c" -> Set<ws>
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/' ) { res.writeHead(200, { 'Content-Type': MIME['.html'] }).end('<meta charset="utf-8"><body style="background:#0b1020;color:#eee;font-family:sans-serif;text-align:center;padding-top:20vh">🔥 KampAteş<br><small>Discord\'da bir ses kanalına girip <b>/kamp</b> yaz.</small>'); return; }
    if (/^\/kamp\/\d+\/\d+$/.test(url.pathname)) return dosyaGonder(res, PUBLIC, 'kamp.html');
    if (url.pathname.startsWith('/static/')) return dosyaGonder(res, PUBLIC, decodeURIComponent(url.pathname.slice(8)));
    if (url.pathname.startsWith('/vendor/')) return dosyaGonder(res, THREE, decodeURIComponent(url.pathname.slice(8)));
    if (url.pathname === '/avatar') {
      // Tarayıcıda WebGL dokusu olarak kullanılabilsin diye Discord CDN'i aynı kökenden sunar
      const hedef = url.searchParams.get('u') || '';
      if (!/^https:\/\/cdn\.discordapp\.com\/(avatars|embed\/avatars|guilds)\/[\w/.-]+\.(png|webp|jpg)(\?size=\d+)?$/.test(hedef)) { res.writeHead(400).end(); return; }
      try {
        const r = await fetch(hedef, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status));
        res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'public, max-age=3600' });
        res.end(Buffer.from(await r.arrayBuffer()));
      } catch { res.writeHead(502).end(); }
      return;
    }
    res.writeHead(404).end('Bulunamadı');
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  server.on('upgrade', (req, soket, kafa) => {
    const url = new URL(req.url, 'http://x');
    const g = url.searchParams.get('g'), c = url.searchParams.get('c'), u = url.searchParams.get('u') || '', k = url.searchParams.get('k') || '';
    if (url.pathname !== '/ws' || !g || !c || !saglayici.dogrula(g, c, u, k)) { soket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); soket.destroy(); return; }
    wss.handleUpgrade(req, soket, kafa, (ws) => {
      const anahtar = `${g}:${c}`;
      const d = saglayici.durum(g, c);
      if (!d) { ws.send(JSON.stringify({ t: 'hata', mesaj: 'Bu ses kanalı artık yok.' })); ws.close(); return; }
      if (!odalar.has(anahtar)) odalar.set(anahtar, new Set());
      const oda = odalar.get(anahtar);
      if (oda.size >= 200) { ws.close(); return; }
      oda.add(ws);
      ws.canli = true;
      ws.send(JSON.stringify({ t: 'durum', ...d, ben: u || null }));
      ws.on('pong', () => { ws.canli = true; });
      ws.on('message', (ham) => {
        if (!u) return; // izleyici bağlantıları yalnızca seyreder
        let m; try { m = JSON.parse(ham.toString()); } catch { return; }
        if (m && typeof m === 'object') Promise.resolve(saglayici.eylem(g, c, u, m)).then((cevap) => { if (cevap) ws.send(JSON.stringify(cevap)); }).catch(() => {});
      });
      ws.on('close', () => { oda.delete(ws); if (!oda.size) odalar.delete(anahtar); });
      ws.on('error', () => {});
    });
  });
  const nabiz = setInterval(() => {
    for (const oda of odalar.values()) for (const ws of oda) { if (!ws.canli) { ws.terminate(); continue; } ws.canli = false; ws.ping(); }
  }, 30_000);
  nabiz.unref();

  const gonder = (oda, mesaj) => { if (!oda) return; const s = JSON.stringify(mesaj); for (const ws of oda) if (ws.readyState === 1) ws.send(s); };
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({
      server, port: server.address().port,
      yayin: (g, c, mesaj) => gonder(odalar.get(`${g}:${c}`), mesaj),
      yayinSunucu: (g, mesajFn) => { for (const [anahtar, oda] of odalar) if (anahtar.startsWith(`${g}:`)) gonder(oda, mesajFn(anahtar.split(':')[1])); },
      izlenen: (g, c) => odalar.has(`${g}:${c}`),
      kapat: () => new Promise((r) => { clearInterval(nabiz); for (const oda of odalar.values()) for (const ws of oda) ws.terminate(); wss.close(); server.close(() => r()); }),
    }));
  });
}
module.exports = { sunucuBaslat };
