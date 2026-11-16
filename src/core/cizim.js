// Resim kartı motoru: logo, profil, sıralama, sunucu durumu, özel oda, müzik vb. tüm görseller burada çizilir
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const fontDizin = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'inter', 'files');
for (const w of [400, 600, 800]) for (const s of ['latin', 'latin-ext']) GlobalFonts.registerFromPath(path.join(fontDizin, `inter-${s}-${w}-normal.woff2`), 'Inter');

const RENK = { zemin1: '#07130d', zemin2: '#0e1a22', panel: 'rgba(255,255,255,0.055)', cizgi: 'rgba(255,255,255,0.09)', yazi: '#eefaf1', soluk: 'rgba(238,250,241,0.58)', ana: '#2ee66b', koyu: '#12a150', altin: '#ffd166', yesil: '#2ee66b', kirmizi: '#ff5d5d', mavi: '#5ad1ff', mor: '#b388ff', elmas: '#5eead4' };
const PALET = ['#2ee66b', '#5ad1ff', '#ffd166', '#b388ff', '#ff8a5c', '#5eead4', '#f472b6', '#a3e635', '#fb7185', '#60a5fa'];
const karma = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const font = (px, w = 600) => `${w} ${px}px Inter`;
// Yazı tipinde bulunmayan emoji vb. karakterleri ayıklar (kutu olarak görünmesinler)
const temiz = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim() || '?';

const resimler = new Map();
async function resim(url) {
  if (!url) return null;
  if (resimler.has(url)) return resimler.get(url);
  const p = (async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) return null;
      return await loadImage(Buffer.from(await r.arrayBuffer()));
    } catch { return null; }
  })();
  resimler.set(url, p);
  if (resimler.size > 300) resimler.delete(resimler.keys().next().value);
  setTimeout(() => resimler.delete(url), 10 * 6e4).unref();
  return p;
}

function tuval(w, h, { vurgu = RENK.ana } = {}) {
  const c = createCanvas(w, h), x = c.getContext('2d');
  x.save(); x.beginPath(); x.roundRect(0, 0, w, h, 28); x.clip();
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, RENK.zemin1); g.addColorStop(1, RENK.zemin2);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (const [cx, cy, r, renk, a] of [[w * 0.92, -h * 0.1, h * 0.95, vurgu, 0.30], [w * 0.05, h * 1.1, h * 0.8, '#0ea5e9', 0.13]]) {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, renk); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = a; x.fillStyle = rg; x.fillRect(0, 0, w, h);
  }
  x.globalAlpha = 1;
  let t = w * 7 + h; // sabit tohumlu kıvılcımlar
  for (let i = 0; i < 46; i++) { t = (t * 16807) % 2147483647; const px = t % w; t = (t * 16807) % 2147483647; const py = t % h; x.globalAlpha = 0.08 + (i % 5) * 0.05; x.fillStyle = i % 3 ? '#c9ffd9' : vurgu; const k = 3 + (i % 3) * 2; x.fillRect(px - (px % 4), py - (py % 4), k, k); } // piksel tozu
  x.globalAlpha = 1;
  return { c, x, w, h };
}
const bitir = ({ c, x }, ad) => { x.restore(); return new AttachmentBuilder(c.toBuffer('image/png'), { name: `${ad}.png` }); };
function panel(x, a, b, w, h, r = 18, renk = RENK.panel) { x.fillStyle = renk; x.beginPath(); x.roundRect(a, b, w, h, r); x.fill(); x.strokeStyle = RENK.cizgi; x.lineWidth = 1; x.stroke(); }
function yazi(x, metin, a, b, { px = 24, w = 600, renk = RENK.yazi, hiza = 'left', max = 0 } = {}) {
  x.font = font(px, w); x.fillStyle = renk; x.textAlign = hiza; x.textBaseline = 'alphabetic';
  let s = temiz(metin);
  if (max && x.measureText(s).width > max) { while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1); s += '…'; }
  x.fillText(s, a, b);
  return x.measureText(s).width;
}
function cubuk(x, a, b, w, h, oran, renk1 = RENK.koyu, renk2 = RENK.ana) {
  x.fillStyle = 'rgba(255,255,255,0.10)'; x.beginPath(); x.roundRect(a, b, w, h, h / 2); x.fill();
  const dolu = Math.max(h, w * Math.min(1, Math.max(0, oran)));
  const g = x.createLinearGradient(a, 0, a + w, 0); g.addColorStop(0, renk1); g.addColorStop(1, renk2);
  x.fillStyle = g; x.beginPath(); x.roundRect(a, b, dolu, h, h / 2); x.fill();
}
async function avatar(x, url, cx, cy, r, ad = '?', halka = null) {
  const im = await resim(url);
  if (halka) { x.fillStyle = halka; x.beginPath(); x.arc(cx, cy, r + 5, 0, 7); x.fill(); }
  x.save(); x.beginPath(); x.arc(cx, cy, r, 0, 7); x.clip();
  if (im) x.drawImage(im, cx - r, cy - r, r * 2, r * 2);
  else { x.fillStyle = PALET[karma(ad) % PALET.length]; x.fillRect(cx - r, cy - r, r * 2, r * 2); yazi(x, temiz(ad)[0].toUpperCase(), cx, cy + r * 0.36, { px: r, w: 800, hiza: 'center', renk: '#fff' }); }
  x.restore();
}
function hap(x, metin, a, b, { renk = RENK.ana, px = 18, yaziRenk = '#06210f' } = {}) {
  x.font = font(px, 800); const w = x.measureText(temiz(metin)).width + px * 1.3, h = px * 1.75;
  x.fillStyle = renk; x.beginPath(); x.roundRect(a, b, w, h, h / 2); x.fill();
  yazi(x, metin, a + w / 2, b + h * 0.7, { px, w: 800, renk: yaziRenk, hiza: 'center' });
  return w;
}
function kutucuk(x, a, b, w, h, etiket, deger, renk = RENK.yazi) {
  panel(x, a, b, w, h, 16);
  yazi(x, etiket, a + w / 2, b + 30, { px: 15, w: 600, renk: RENK.soluk, hiza: 'center' });
  let px = Math.min(32, h * 0.36);
  x.font = font(px, 800);
  while (px > 14 && x.measureText(temiz(deger)).width > w - 18) { px -= 2; x.font = font(px, 800); } // sığana kadar küçült
  yazi(x, deger, a + w / 2, b + h - 20, { px, w: 800, renk, hiza: 'center', max: w - 12 });
}
const sayi = (n) => Math.trunc(Number(n) || 0).toLocaleString('tr-TR');
const sure = (sn) => { const s = Math.floor(sn / 3600), d = Math.floor((sn % 3600) / 60); return s ? `${s}sa ${d}dk` : `${d}dk`; };
const kafaUrl = (nick) => (nick ? `https://mc-heads.net/avatar/${encodeURIComponent(nick)}/128` : null);

// Logo: yeşil, kesik "Λ" (çubuksuz A). cx,cy merkez; b kenar uzunluğu
function logoCiz(x, cx, cy, b, zemin = true) {
  const X = (u) => cx - b / 2 + u * b, Y = (v) => cy - b / 2 + v * b;
  x.save();
  if (zemin) {
    const zg = x.createLinearGradient(X(0), Y(0), X(1), Y(1)); zg.addColorStop(0, '#0d2417'); zg.addColorStop(1, '#06120c');
    x.fillStyle = zg; x.beginPath(); x.roundRect(X(0), Y(0), b, b, b * 0.22); x.fill();
    x.strokeStyle = 'rgba(46,230,107,0.35)'; x.lineWidth = Math.max(1, b * 0.012); x.stroke();
    x.beginPath(); x.roundRect(X(0), Y(0), b, b, b * 0.22); x.clip();
    const isik = x.createRadialGradient(cx, Y(0.62), 0, cx, Y(0.62), b * 0.6); isik.addColorStop(0, 'rgba(46,230,107,0.30)'); isik.addColorStop(1, 'rgba(46,230,107,0)');
    x.fillStyle = isik; x.fillRect(X(0), Y(0), b, b);
  }
  const g = x.createLinearGradient(X(0.2), Y(0.15), X(0.8), Y(0.85)); g.addColorStop(0, '#7dffa8'); g.addColorStop(0.5, '#2ee66b'); g.addColorStop(1, '#0c8f43');
  const yol = (n) => { x.beginPath(); n.forEach(([u, v], i) => (i ? x.lineTo(X(u), Y(v)) : x.moveTo(X(u), Y(v)))); x.closePath(); };
  x.fillStyle = g; x.shadowColor = 'rgba(46,230,107,0.55)'; x.shadowBlur = b * 0.08;
  // Sol bacak tepeyle birlikte tek parça; sağ bacak eğik bir kesikle ikiye ayrılır
  yol([[0.5, 0.15], [0.605, 0.15], [0.335, 0.83], [0.125, 0.83]]); x.fill();
  yol([[0.605, 0.15], [0.5, 0.15], [0.572, 0.33], [0.69, 0.365]]); x.fill();
  yol([[0.6, 0.4], [0.712, 0.432], [0.875, 0.83], [0.665, 0.83], [0.565, 0.585]]); x.fill();
  x.restore();
}
function logoDosya(boyut = 512) {
  const c = createCanvas(boyut, boyut), x = c.getContext('2d');
  logoCiz(x, boyut / 2, boyut / 2, boyut);
  return c.toBuffer('image/png');
}
const filigran = (x, w, h) => { x.globalAlpha = 0.9; logoCiz(x, w - 46, 46, 48); x.globalAlpha = 1; };

// ---------- Kartlar ----------
async function profilKart(p) {
  const t = tuval(1000, 430), { x } = t;
  await avatar(x, p.avatar, 120, 125, 78, p.ad, p.renk || RENK.ana);
  yazi(x, p.ad, 225, 100, { px: 46, w: 800, max: 500 });
  let hx = 225;
  hx += hap(x, `SEVİYE ${p.seviye}`, hx, 122) + 10;
  hx += hap(x, `#${p.sira}`, hx, 122, { renk: 'rgba(255,255,255,0.14)', yaziRenk: RENK.yazi }) + 10;
  if (p.rutbe) hx += hap(x, p.rutbe.ad, hx, 122, { renk: p.rutbe.renk }) + 10;
  if (p.klan) hx += hap(x, `[${p.klan}]`, hx, 122, { renk: RENK.mor }) + 10;
  if (p.boost) hap(x, '2x XP', hx, 122, { renk: RENK.altin });
  // Minecraft hesabı: oyuncu kafası (piksel piksel, yumuşatmasız)
  panel(x, 822, 34, 144, 172, 18);
  if (p.mc) {
    const im = await resim(kafaUrl(p.mc));
    x.imageSmoothingEnabled = false;
    if (im) x.drawImage(im, 854, 48, 80, 80); else { x.fillStyle = '#3b2a1a'; x.fillRect(854, 48, 80, 80); yazi(x, p.mc[0].toUpperCase(), 894, 104, { px: 44, w: 800, hiza: 'center' }); }
    x.imageSmoothingEnabled = true;
    yazi(x, p.mc, 894, 160, { px: 17, w: 800, hiza: 'center', renk: RENK.ana, max: 128 });
    yazi(x, 'MINECRAFT', 894, 186, { px: 12, w: 800, hiza: 'center', renk: RENK.soluk });
  } else { yazi(x, 'Hesap bağlı değil', 894, 112, { px: 14, hiza: 'center', renk: RENK.soluk }); yazi(x, '/hesap bağla', 894, 138, { px: 15, w: 800, hiza: 'center', renk: RENK.ana }); }
  yazi(x, `${sayi(p.kalan)} / ${sayi(p.gereken)} XP`, 795, 196, { px: 16, renk: RENK.soluk, hiza: 'right' });
  cubuk(x, 225, 206, 570, 18, p.kalan / p.gereken);
  const k = [['PARA', sayi(p.para), RENK.altin], ['MESAJ', sayi(p.mesaj)], ['SESTE', sure(p.ses)], ['İTİBAR', sayi(p.rep)], ['GÜNLÜK SERİ', `${p.seri} gün`, RENK.elmas], ['BAŞARIM', `${p.basarim}/${p.basarimToplam}`, RENK.mor]];
  k.forEach(([e, d, r], i) => kutucuk(x, 40 + i * 155, 255, 143, 96, e, d, r));
  yazi(x, 'BAŞARIMLAR', 40, 392, { px: 15, renk: RENK.soluk });
  for (let i = 0; i < p.basarimToplam; i++) { x.fillStyle = i < p.basarim ? RENK.altin : 'rgba(255,255,255,0.13)'; x.fillRect(160 + i * 26, 378, 16, 16); }
  return bitir(t, 'profil');
}

async function siralamaKart({ baslik, altBaslik, satirlar, ben }) {
  const n = Math.max(1, satirlar.length), t = tuval(900, 150 + n * 66 + (ben ? 60 : 16)), { x } = t;
  yazi(x, baslik, 40, 68, { px: 40, w: 800, max: 720 });
  yazi(x, altBaslik, 40, 100, { px: 18, renk: RENK.soluk, max: 720 });
  filigran(x, 900);
  if (!satirlar.length) yazi(x, 'Henüz veri yok', 450, 170, { px: 22, renk: RENK.soluk, hiza: 'center' });
  const madalya = [RENK.altin, '#cfd6e4', '#d08a4e'];
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i], y = 126 + i * 66;
    panel(x, 30, y, 840, 58, 16, i < 3 ? 'rgba(255,255,255,0.09)' : RENK.panel);
    if (i < 3) { x.fillStyle = madalya[i]; x.beginPath(); x.arc(66, y + 29, 19, 0, 7); x.fill(); }
    yazi(x, String(i + 1), 66, y + 37, { px: 20, w: 800, hiza: 'center', renk: i < 3 ? '#111' : RENK.soluk });
    await avatar(x, s.avatar, 124, y + 29, 22, s.ad);
    yazi(x, s.ad, 162, y + 37, { px: 23, w: 600, max: 380 });
    if (s.alt) yazi(x, s.alt, 850, y + 50, { px: 13, renk: RENK.soluk, hiza: 'right' });
    yazi(x, s.deger, 850, y + (s.alt ? 31 : 38), { px: 23, w: 800, renk: i === 0 ? RENK.altin : RENK.yazi, hiza: 'right' });
  }
  if (ben) yazi(x, ben, 450, t.h - 28, { px: 18, renk: RENK.soluk, hiza: 'center' });
  return bitir(t, 'siralama');
}

async function bannerKart({ ust, baslik, alt, avatarUrl, ad, vurgu = RENK.ana, dosya = 'kart', logo = false }) {
  const t = tuval(1000, 300, { vurgu }), { x } = t;
  if (logo) logoCiz(x, 160, 150, 184); else await avatar(x, avatarUrl, 160, 150, 92, ad, vurgu);
  yazi(x, ust, 290, 105, { px: 22, w: 800, renk: vurgu });
  yazi(x, baslik, 290, 165, { px: 54, w: 800, max: 660 });
  yazi(x, alt, 290, 208, { px: 22, renk: RENK.soluk, max: 660 });
  if (!logo) filigran(x, 1000);
  return bitir(t, dosya);
}

// Minecraft sunucu durumu kartı
async function sunucuKart(s) {
  const acik = s.acik !== false, t = tuval(1000, 420, { vurgu: acik ? RENK.ana : RENK.kirmizi }), { x } = t;
  panel(x, 40, 40, 132, 132, 22, 'rgba(0,0,0,0.35)');
  let ikon = null;
  if (s.ikon) { try { ikon = await loadImage(Buffer.from(s.ikon.split(',')[1], 'base64')); } catch { ikon = null; } }
  if (ikon) { x.imageSmoothingEnabled = false; x.drawImage(ikon, 52, 52, 108, 108); x.imageSmoothingEnabled = true; } else logoCiz(x, 106, 106, 108);
  yazi(x, s.ad, 200, 92, { px: 46, w: 800, max: 520 });
  yazi(x, s.adres, 200, 128, { px: 24, w: 600, renk: RENK.ana, max: 520 });
  yazi(x, s.motd || '', 200, 160, { px: 17, renk: RENK.soluk, max: 740 });
  const hw = hap(x, acik ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI', 0, -100, { px: 18 });
  hap(x, acik ? 'ÇEVRİMİÇİ' : 'ÇEVRİMDIŞI', 960 - hw, 52, { px: 18, renk: acik ? RENK.ana : RENK.kirmizi, yaziRenk: acik ? '#06210f' : '#fff' });
  if (!acik) {
    panel(x, 40, 210, 920, 170, 20);
    yazi(x, 'Sunucuya şu an ulaşılamıyor', 500, 290, { px: 30, w: 800, hiza: 'center' });
    yazi(x, s.sebep || 'Bakımda ya da kapalı olabilir. Birazdan tekrar dene.', 500, 328, { px: 18, hiza: 'center', renk: RENK.soluk, max: 860 });
    return bitir(t, 'sunucu');
  }
  panel(x, 40, 204, 440, 176, 20);
  yazi(x, 'OYUNCULAR', 64, 240, { px: 15, w: 800, renk: RENK.soluk });
  const gen = yazi(x, sayi(s.oyuncu), 64, 320, { px: 78, w: 800, renk: RENK.ana });
  yazi(x, `/ ${sayi(s.max)}`, 76 + gen, 320, { px: 30, w: 600, renk: RENK.soluk });
  cubuk(x, 64, 342, 392, 14, s.max ? s.oyuncu / s.max : 0);
  [['SÜRÜM', kisaltMetin(s.surum, 16)], ['GECİKME', `${s.ping} ms`, s.ping < 120 ? RENK.ana : RENK.altin], ['REKOR', sayi(s.rekor || s.oyuncu), RENK.altin]].forEach(([e, d, r], i) => kutucuk(x, 500 + i * 156, 204, 144, 84, e, d, r));
  panel(x, 500, 300, 460, 80, 16);
  yazi(x, 'ŞU AN OYUNDA', 520, 328, { px: 13, w: 800, renk: RENK.soluk });
  yazi(x, s.liste?.length ? s.liste.join('  •  ') : s.oyuncu ? 'Oyuncu listesi sunucu tarafından gizlenmiş' : 'Kimse yok — ilk giren sen ol!', 520, 358, { px: 17, w: 600, max: 420 });
  return bitir(t, 'sunucu');
}
const kisaltMetin = (m, n) => { const s = temiz(m); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// Özel oda kontrol paneli kartı
async function odaKart({ ad, sahip, sahipAvatar, kisi, limit, kilitli, gizli }) {
  const t = tuval(1000, 250), { x } = t;
  await avatar(x, sahipAvatar, 120, 125, 70, sahip, RENK.ana);
  yazi(x, 'ÖZEL ODA', 220, 78, { px: 18, w: 800, renk: RENK.ana });
  yazi(x, ad, 220, 128, { px: 42, w: 800, max: 700 });
  yazi(x, `Sahibi: ${temiz(sahip)}`, 220, 160, { px: 19, renk: RENK.soluk, max: 700 });
  let hx = 220;
  hx += hap(x, `${kisi}${limit ? ` / ${limit}` : ''} KİŞİ`, hx, 178, { px: 15, renk: 'rgba(255,255,255,0.14)', yaziRenk: RENK.yazi }) + 8;
  hx += hap(x, kilitli ? 'KİLİTLİ' : 'HERKESE AÇIK', hx, 178, { px: 15, renk: kilitli ? RENK.kirmizi : RENK.ana, yaziRenk: kilitli ? '#fff' : '#06210f' }) + 8;
  if (gizli) hap(x, 'GİZLİ', hx, 178, { px: 15, renk: RENK.mor });
  filigran(x, 1000);
  return bitir(t, 'oda');
}

async function muzikKart({ baslik, kanal, sure: sn, kapak, isteyen, sira, canli, durum }) {
  const t = tuval(900, 260, { vurgu: RENK.mavi }), { x } = t;
  const im = await resim(kapak);
  x.save(); x.beginPath(); x.roundRect(30, 30, 200, 200, 22); x.clip();
  if (im) { const o = Math.max(200 / im.width, 200 / im.height); x.drawImage(im, 130 - (im.width * o) / 2, 130 - (im.height * o) / 2, im.width * o, im.height * o); }
  else { const g = x.createLinearGradient(30, 30, 230, 230); g.addColorStop(0, RENK.koyu); g.addColorStop(1, RENK.mavi); x.fillStyle = g; x.fillRect(30, 30, 200, 200); x.fillStyle = 'rgba(7,19,13,0.85)'; x.beginPath(); x.arc(130, 130, 62, 0, 7); x.fill(); x.fillStyle = RENK.yazi; x.beginPath(); x.arc(130, 130, 14, 0, 7); x.fill(); }
  x.restore();
  hap(x, durum || (canli ? 'CANLI RADYO' : 'ŞİMDİ ÇALIYOR'), 260, 34, { renk: canli ? RENK.kirmizi : RENK.ana, px: 14, yaziRenk: canli ? '#fff' : '#06210f' });
  yazi(x, baslik, 260, 112, { px: 36, w: 800, max: 600 });
  yazi(x, kanal || '', 260, 146, { px: 20, renk: RENK.soluk, max: 600 });
  for (let i = 0; i < 44; i++) { const h = 8 + ((karma(baslik + i) % 100) / 100) * 34; x.fillStyle = i % 2 ? RENK.mavi : RENK.ana; x.globalAlpha = 0.85; x.beginPath(); x.roundRect(260 + i * 13.6, 205 - h, 8, h, 4); x.fill(); }
  x.globalAlpha = 1;
  yazi(x, [canli ? null : sn ? `${Math.floor(sn / 60)}:${String(Math.floor(sn % 60)).padStart(2, '0')}` : null, isteyen ? `İsteyen: ${temiz(isteyen)}` : null, sira ? `Sırada ${sira} şarkı` : null].filter(Boolean).join('   •   '), 260, 236, { px: 16, renk: RENK.soluk, max: 600 });
  return bitir(t, 'muzik');
}

function yardimKart(sunucuAd, kategoriSayisi, komutSayisi) {
  const t = tuval(1000, 250), { x } = t;
  logoCiz(x, 140, 125, 170);
  yazi(x, sunucuAd, 260, 112, { px: 60, w: 800, max: 690 });
  yazi(x, 'Minecraft topluluğunun her şeyi tek botta', 262, 152, { px: 23, renk: RENK.soluk, max: 690 });
  const w = hap(x, `${komutSayisi} KOMUT`, 262, 178, { px: 16 });
  hap(x, `${kategoriSayisi} KATEGORİ`, 272 + w, 178, { px: 16, renk: 'rgba(255,255,255,0.14)', yaziRenk: RENK.yazi });
  return bitir(t, 'yardim');
}

async function haftalikKart({ sunucu, tarih, bolumler, ozet }) {
  const t = tuval(1000, 560, { vurgu: RENK.altin }), { x } = t;
  yazi(x, 'HAFTANIN KARNESİ', 40, 62, { px: 20, w: 800, renk: RENK.altin });
  yazi(x, sunucu, 40, 108, { px: 42, w: 800, max: 640 });
  yazi(x, tarih, 900, 62, { px: 18, renk: RENK.soluk, hiza: 'right' });
  filigran(x, 1000);
  ozet.forEach(([e, d], i) => kutucuk(x, 40 + i * 232, 134, 220, 90, e, d, RENK.altin));
  for (let b = 0; b < bolumler.length; b++) {
    const bl = bolumler[b], a = 40 + b * 310; panel(x, a, 244, 300, 286, 18);
    yazi(x, bl.baslik, a + 20, 280, { px: 17, w: 800, renk: RENK.soluk });
    if (!bl.satirlar.length) yazi(x, 'Veri yok', a + 150, 390, { px: 18, renk: RENK.soluk, hiza: 'center' });
    for (let i = 0; i < bl.satirlar.length; i++) { const s = bl.satirlar[i], y = 302 + i * 74; await avatar(x, s.avatar, a + 48, y + 30, i ? 24 : 28, s.ad, i ? null : RENK.altin); yazi(x, s.ad, a + 90, y + 26, { px: 20, w: 800, max: 195 }); yazi(x, s.deger, a + 90, y + 50, { px: 16, renk: i ? RENK.soluk : RENK.altin, max: 195 }); }
  }
  return bitir(t, 'karne');
}

module.exports = { RENK, logoCiz, logoDosya, kafaUrl, profilKart, siralamaKart, bannerKart, sunucuKart, odaKart, muzikKart, yardimKart, haftalikKart, sayi, sure };
