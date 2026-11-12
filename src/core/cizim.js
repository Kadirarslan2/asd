// Resim kartı motoru: profil, sıralama, FACEIT, skor tablosu, kamp ateşi, müzik vb. tüm görseller burada çizilir
const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');

const fontDizin = path.join(__dirname, '..', '..', 'node_modules', '@fontsource', 'inter', 'files');
for (const w of [400, 600, 800]) for (const s of ['latin', 'latin-ext']) GlobalFonts.registerFromPath(path.join(fontDizin, `inter-${s}-${w}-normal.woff2`), 'Inter');

const RENK = { zemin1: '#0b1020', zemin2: '#1b1330', panel: 'rgba(255,255,255,0.055)', cizgi: 'rgba(255,255,255,0.09)', yazi: '#f6efe4', soluk: 'rgba(246,239,228,0.58)', ates: '#ff7a18', altin: '#ffd166', yesil: '#3ddc84', kirmizi: '#ff5d5d', mavi: '#5aa9ff', mor: '#b388ff' };
const FACEIT_RENK = ['#888', '#eeeeee', '#1ce400', '#1ce400', '#ffc800', '#ffc800', '#ffc800', '#ffc800', '#ff6309', '#ff6309', '#fe1f00'];
const PALET = ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab17d', '#577590', '#b5838d', '#f4a261', '#6d597a', '#43aa8b', '#f94144'];
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

function tuval(w, h, { vurgu = RENK.ates } = {}) {
  const c = createCanvas(w, h), x = c.getContext('2d');
  x.save(); x.beginPath(); x.roundRect(0, 0, w, h, 28); x.clip();
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, RENK.zemin1); g.addColorStop(1, RENK.zemin2);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  for (const [cx, cy, r, renk, a] of [[w * 0.92, -h * 0.1, h * 0.95, vurgu, 0.30], [w * 0.05, h * 1.1, h * 0.8, '#5b3cff', 0.16]]) {
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, renk); rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = a; x.fillStyle = rg; x.fillRect(0, 0, w, h);
  }
  x.globalAlpha = 1;
  let t = w * 7 + h; // sabit tohumlu kıvılcımlar
  for (let i = 0; i < 46; i++) { t = (t * 16807) % 2147483647; const px = t % w; t = (t * 16807) % 2147483647; const py = t % h; x.globalAlpha = 0.08 + (i % 5) * 0.05; x.fillStyle = i % 3 ? '#ffd9a8' : vurgu; x.beginPath(); x.arc(px, py, 1 + (i % 3) * 0.7, 0, 7); x.fill(); }
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
function cubuk(x, a, b, w, h, oran, renk1 = RENK.ates, renk2 = RENK.altin) {
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
function hap(x, metin, a, b, { renk = RENK.ates, px = 18, yaziRenk = '#111' } = {}) {
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
function faceitRozet(x, cx, cy, r, lvl) {
  x.fillStyle = '#16171a'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  x.strokeStyle = FACEIT_RENK[lvl] || '#888'; x.lineWidth = r * 0.22; x.beginPath(); x.arc(cx, cy, r * 0.78, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * (lvl / 10)); x.stroke();
  yazi(x, String(lvl || '-'), cx, cy + r * 0.3, { px: r * 0.85, w: 800, hiza: 'center', renk: FACEIT_RENK[lvl] || '#888' });
}
const sayi = (n) => Math.trunc(Number(n) || 0).toLocaleString('tr-TR');
const sure = (sn) => { const s = Math.floor(sn / 3600), d = Math.floor((sn % 3600) / 60); return s ? `${s}sa ${d}dk` : `${d}dk`; };

// ---------- Kartlar ----------
async function profilKart(p) {
  const t = tuval(1000, 430), { x } = t;
  await avatar(x, p.avatar, 120, 125, 78, p.ad, p.renk || RENK.ates);
  yazi(x, p.ad, 225, 100, { px: 46, w: 800, max: 500 });
  let hx = 225;
  hx += hap(x, `SEVİYE ${p.seviye}`, hx, 122) + 10;
  hx += hap(x, `#${p.sira}`, hx, 122, { renk: 'rgba(255,255,255,0.14)', yaziRenk: RENK.yazi }) + 10;
  if (p.klan) hx += hap(x, `[${p.klan}]`, hx, 122, { renk: RENK.mor }) + 10;
  if (p.boost) hap(x, '2x XP', hx, 122, { renk: RENK.altin });
  if (p.faceit) { faceitRozet(x, 900, 95, 46, p.faceit.lvl); yazi(x, `${sayi(p.faceit.elo)} ELO`, 900, 170, { px: 18, w: 800, hiza: 'center', renk: FACEIT_RENK[p.faceit.lvl] }); yazi(x, p.faceit.nick, 900, 192, { px: 14, hiza: 'center', renk: RENK.soluk, max: 170 }); }
  yazi(x, `${sayi(p.kalan)} / ${sayi(p.gereken)} XP`, 800, 196, { px: 16, renk: RENK.soluk, hiza: 'right' });
  cubuk(x, 225, 206, 575, 18, p.kalan / p.gereken);
  const k = [['PARA', sayi(p.para), RENK.altin], ['MESAJ', sayi(p.mesaj)], ['SESTE', sure(p.ses)], ['İTİBAR', sayi(p.rep)], ['SUNUCU ELO', String(p.elo), RENK.mavi], ['MAÇ', `${p.g}G ${p.m}M`]];
  k.forEach(([e, d, r], i) => kutucuk(x, 40 + i * 155, 255, 143, 96, e, d, r));
  yazi(x, `BAŞARIMLAR ${p.basarim}/${p.basarimToplam}`, 40, 392, { px: 15, renk: RENK.soluk });
  for (let i = 0; i < p.basarimToplam; i++) { x.fillStyle = i < p.basarim ? RENK.altin : 'rgba(255,255,255,0.13)'; x.beginPath(); x.arc(240 + i * 24, 386, 8, 0, 7); x.fill(); }
  return bitir(t, 'profil');
}

async function siralamaKart({ baslik, altBaslik, satirlar, ben }) {
  const n = Math.max(1, satirlar.length), t = tuval(900, 150 + n * 66 + (ben ? 60 : 16)), { x } = t;
  yazi(x, baslik, 40, 68, { px: 40, w: 800 });
  yazi(x, altBaslik, 40, 100, { px: 18, renk: RENK.soluk });
  if (!satirlar.length) yazi(x, 'Henüz veri yok', 450, 170, { px: 22, renk: RENK.soluk, hiza: 'center' });
  const madalya = [RENK.altin, '#cfd6e4', '#d08a4e'];
  for (let i = 0; i < satirlar.length; i++) {
    const s = satirlar[i], y = 126 + i * 66;
    panel(x, 30, y, 840, 58, 16, i < 3 ? 'rgba(255,255,255,0.09)' : RENK.panel);
    if (i < 3) { x.fillStyle = madalya[i]; x.beginPath(); x.arc(66, y + 29, 19, 0, 7); x.fill(); }
    yazi(x, String(i + 1), 66, y + 37, { px: 20, w: 800, hiza: 'center', renk: i < 3 ? '#111' : RENK.soluk });
    await avatar(x, s.avatar, 124, y + 29, 22, s.ad);
    yazi(x, s.ad, 162, y + 37, { px: 23, w: 600, max: 380 });
    if (s.alt) yazi(x, s.alt, 850 - 0, y + 50, { px: 13, renk: RENK.soluk, hiza: 'right' });
    yazi(x, s.deger, 850, y + (s.alt ? 31 : 38), { px: 23, w: 800, renk: i === 0 ? RENK.altin : RENK.yazi, hiza: 'right' });
  }
  if (ben) yazi(x, ben, 450, t.h - 28, { px: 18, renk: RENK.soluk, hiza: 'center' });
  return bitir(t, 'siralama');
}

async function bannerKart({ ust, baslik, alt, avatarUrl, ad, vurgu = RENK.ates, dosya = 'kart' }) {
  const t = tuval(1000, 300, { vurgu }), { x } = t;
  await avatar(x, avatarUrl, 160, 150, 92, ad, vurgu);
  yazi(x, ust, 290, 105, { px: 22, w: 800, renk: vurgu });
  yazi(x, baslik, 290, 165, { px: 54, w: 800, max: 660 });
  yazi(x, alt, 290, 208, { px: 22, renk: RENK.soluk, max: 660 });
  return bitir(t, dosya);
}

async function faceitKart(p) {
  const t = tuval(1000, 520, { vurgu: '#ff5500' }), { x } = t;
  await avatar(x, p.avatar, 110, 110, 70, p.nick, '#ff5500');
  yazi(x, p.nick, 205, 95, { px: 46, w: 800, max: 420 });
  yazi(x, [p.ulke, p.bolge, 'CS2'].filter(Boolean).join('  •  '), 205, 128, { px: 18, renk: RENK.soluk });
  faceitRozet(x, 700, 105, 58, p.lvl);
  yazi(x, sayi(p.elo), 950, 108, { px: 62, w: 800, hiza: 'right', renk: FACEIT_RENK[p.lvl] });
  yazi(x, 'ELO', 950, 136, { px: 18, w: 800, hiza: 'right', renk: RENK.soluk });
  yazi(x, p.ilerleme, 950, 196, { px: 16, renk: RENK.soluk, hiza: 'right' });
  yazi(x, `SEVİYE ${p.lvl}`, 40, 196, { px: 16, w: 800, renk: RENK.soluk });
  cubuk(x, 40, 206, 920, 16, p.oran, '#ff5500', FACEIT_RENK[Math.min(10, p.lvl + 1)]);
  p.kutular.forEach(([e, d, r], i) => kutucuk(x, 40 + i * 155, 244, 143, 100, e, d, r));
  yazi(x, 'SON MAÇLAR', 40, 386, { px: 15, w: 800, renk: RENK.soluk });
  p.son.forEach((k, i) => { x.fillStyle = k ? RENK.yesil : RENK.kirmizi; x.beginPath(); x.roundRect(40 + i * 46, 398, 38, 38, 10); x.fill(); yazi(x, k ? 'G' : 'M', 59 + i * 46, 425, { px: 20, w: 800, hiza: 'center', renk: '#0b1020' }); });
  yazi(x, 'EN ÇOK OYNANAN HARİTALAR', 330, 386, { px: 15, w: 800, renk: RENK.soluk });
  p.haritalar.forEach((h, i) => {
    const a = 330 + i * 213; panel(x, a, 398, 203, 92, 14);
    yazi(x, h.ad, a + 16, 430, { px: 22, w: 800, max: 170 });
    yazi(x, `${h.mac} maç  •  %${h.kazanma}  •  ${h.kd} K/D`, a + 16, 456, { px: 14, renk: RENK.soluk, max: 175 });
    cubuk(x, a + 16, 468, 171, 8, Number(h.kazanma) / 100, RENK.kirmizi, RENK.yesil);
  });
  return bitir(t, 'faceit');
}

// Maç skor tablosu: iki takım, tüm oyuncuların K/D/A, ADR, HS%, MVP değerleri
function skorTablosu(m) {
  const satirY = 44, t = tuval(1100, 170 + (m.takimlar[0].oyuncular.length + m.takimlar[1].oyuncular.length) * satirY + 150, { vurgu: '#ff5500' }), { x } = t;
  yazi(x, m.harita, 40, 72, { px: 44, w: 800 });
  yazi(x, m.alt, 40, 104, { px: 17, renk: RENK.soluk, max: 560 });
  const [a, b] = m.takimlar;
  yazi(x, String(a.skor), 880, 86, { px: 64, w: 800, hiza: 'right', renk: a.kazandi ? RENK.yesil : RENK.kirmizi });
  yazi(x, ':', 905, 80, { px: 50, w: 800, hiza: 'center', renk: RENK.soluk });
  yazi(x, String(b.skor), 930, 86, { px: 64, w: 800, renk: b.kazandi ? RENK.yesil : RENK.kirmizi });
  const sutun = [['K', 560], ['D', 625], ['A', 690], ['K/D', 770], ['ADR', 855], ['HS%', 935], ['MVP', 1015]];
  let y = 135;
  const enIyi = Math.max(...m.takimlar.flatMap((tk) => tk.oyuncular.map((o) => o.k)));
  for (const tk of m.takimlar) {
    x.fillStyle = tk.kazandi ? 'rgba(61,220,132,0.16)' : 'rgba(255,93,93,0.14)'; x.beginPath(); x.roundRect(30, y, 1040, 42, 12); x.fill();
    yazi(x, tk.ad, 50, y + 28, { px: 19, w: 800, renk: tk.kazandi ? RENK.yesil : RENK.kirmizi, max: 420 });
    for (const [e, sx] of sutun) yazi(x, e, sx, y + 27, { px: 14, w: 800, renk: RENK.soluk, hiza: 'center' });
    y += 50;
    for (const o of tk.oyuncular) {
      if (o.vurgu) { x.fillStyle = 'rgba(255,122,24,0.20)'; x.beginPath(); x.roundRect(30, y - 4, 1040, satirY - 4, 10); x.fill(); x.fillStyle = RENK.ates; x.beginPath(); x.roundRect(30, y - 4, 5, satirY - 4, 3); x.fill(); }
      const adGen = yazi(x, o.ad, 50, y + 23, { px: 20, w: o.vurgu ? 800 : 600, max: 330 });
      let ex = 50 + adGen + 10;
      if (o.k === enIyi) ex += hap(x, 'EN İYİ', ex, y + 3, { renk: RENK.altin, px: 12 }) + 6;
      if (o.ace) ex += hap(x, `${o.ace} ACE`, ex, y + 3, { renk: RENK.mor, px: 12 }) + 6;
      if (o.etiket) yazi(x, o.etiket, ex, y + 22, { px: 14, renk: RENK.ates, max: 500 - ex });
      const d = [[o.k, RENK.yazi], [o.d, RENK.yazi], [o.a, RENK.soluk], [o.kd.toFixed(2), o.kd >= 1 ? RENK.yesil : RENK.kirmizi], [o.adr ? Math.round(o.adr) : '-', RENK.yazi], [o.hs, RENK.soluk], [o.mvp, RENK.altin]];
      d.forEach(([v, r], i) => yazi(x, String(v), sutun[i][1], y + 23, { px: 19, w: i < 2 || i === 3 ? 800 : 600, renk: r, hiza: 'center' }));
      y += satirY;
    }
    y += 14;
  }
  yazi(x, m.dipnot || '', 550, t.h - 26, { px: 15, renk: RENK.soluk, hiza: 'center', max: 1000 });
  return bitir(t, 'skor');
}

// Kamp ateşi kartı: ses kanalındakiler ateşin etrafında (2D)
async function kampKart({ kanal, sunucu, uyeler, ates, muzik }) {
  const W = 1000, H = 520, c = createCanvas(W, H), x = c.getContext('2d'), t = { c, x, w: W, h: H };
  x.save(); x.beginPath(); x.roundRect(0, 0, W, H, 28); x.clip();
  const gok = x.createLinearGradient(0, 0, 0, H); gok.addColorStop(0, '#060a1c'); gok.addColorStop(0.62, '#141a3a'); gok.addColorStop(0.63, '#141b17'); gok.addColorStop(1, '#0a0d0b');
  x.fillStyle = gok; x.fillRect(0, 0, W, H);
  let s = 4242;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 130; i++) { x.globalAlpha = 0.3 + r() * 0.7; x.fillStyle = '#e8eeff'; x.beginPath(); x.arc(r() * W, r() * H * 0.58, r() * 1.5 + 0.3, 0, 7); x.fill(); }
  x.globalAlpha = 1; x.fillStyle = '#eef2ff'; x.beginPath(); x.arc(860, 86, 34, 0, 7); x.fill(); x.fillStyle = '#060a1c'; x.beginPath(); x.arc(846, 78, 30, 0, 7); x.fill();
  for (let i = 0; i < 26; i++) { const tx = r() * W, th = 110 + r() * 150, tw = th * 0.42; x.fillStyle = `rgb(${8 + r() * 8},${16 + r() * 14},${14 + r() * 8})`; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(tx, H * 0.63 - th + k * th * 0.2); x.lineTo(tx - tw * (0.5 + k * 0.22), H * 0.63 - th * 0.42 + k * th * 0.21); x.lineTo(tx + tw * (0.5 + k * 0.22), H * 0.63 - th * 0.42 + k * th * 0.21); x.fill(); } }
  const guc = 0.35 + (ates.yakit / 100) * 0.65, fx = W / 2, fy = 350;
  const isik = x.createRadialGradient(fx, fy, 0, fx, fy, 430 * guc + 120); isik.addColorStop(0, 'rgba(255,150,50,0.62)'); isik.addColorStop(0.35, 'rgba(255,100,20,0.20)'); isik.addColorStop(1, 'rgba(255,90,20,0)');
  x.fillStyle = isik; x.fillRect(0, 0, W, H);
  // Oturanlar: ateşin arkasında yarım elips, sonra ateş, sonra öndekiler
  // Oturma düzeni: arka sıra ateşin gerisinde, ön sıra önünde; ateşin iki yanına dönüşümlü yerleşir
  const n = uyeler.length, YER = [[-105, 0], [105, 0], [-175, 1], [175, 1], [-232, 0], [232, 0], [-305, 1], [305, 1], [-358, 0], [358, 0], [-432, 1], [432, 1]];
  const yer = uyeler.slice(0, YER.length).map((u, i) => { const [dx, on] = YER[i]; return { u, px: fx + dx, py: on ? fy + 62 - Math.abs(dx) * 0.06 : fy - 78 + Math.abs(dx) * 0.05, on: Boolean(on) }; });
  const ciz = async ({ u, px, py, on }) => {
    const rr = on ? 42 : 36;
    x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.ellipse(px, py + rr + 30, rr * 1.1, 9, 0, 0, 7); x.fill();
    x.fillStyle = u.renk || PALET[karma(u.id) % PALET.length]; x.beginPath(); x.roundRect(px - rr * 0.75, py + rr * 0.55, rr * 1.5, rr * 1.15, rr * 0.5); x.fill();
    await avatar(x, u.avatar, px, py, rr, u.ad, u.sessiz ? '#566' : '#ffb45a');
    x.font = font(16, 800); const w = Math.min(170, x.measureText(temiz(u.ad)).width + 22);
    x.fillStyle = 'rgba(6,8,18,0.78)'; x.beginPath(); x.roundRect(px - w / 2, py - rr - 34, w, 26, 13); x.fill();
    yazi(x, u.ad, px, py - rr - 15, { px: 16, w: 800, hiza: 'center', max: 150 });
  };
  for (const y of yer.filter((q) => !q.on)) await ciz(y);
  for (let i = 0; i < 5; i++) { x.save(); x.translate(fx, fy + 44); x.rotate((i - 2) * 0.5); x.fillStyle = '#3a2416'; x.beginPath(); x.roundRect(-58, -9, 116, 18, 8); x.fill(); x.restore(); }
  for (const [renk, gen, yuk] of [['#ff4a12', 62, 190], ['#ff9a22', 44, 140], ['#ffe08a', 24, 86]]) {
    x.fillStyle = renk; x.beginPath(); x.moveTo(fx - gen * guc, fy + 40);
    x.bezierCurveTo(fx - gen * 1.5 * guc, fy - yuk * 0.3 * guc, fx - gen * 0.2, fy - yuk * 0.6 * guc, fx + 6, fy + 40 - yuk * guc);
    x.bezierCurveTo(fx + gen * 0.5, fy - yuk * 0.5 * guc, fx + gen * 1.5 * guc, fy - yuk * 0.2 * guc, fx + gen * guc, fy + 40); x.fill();
  }
  for (let i = 0; i < 26 * guc; i++) { x.globalAlpha = 0.4 + r() * 0.6; x.fillStyle = '#ffd08a'; x.beginPath(); x.arc(fx + (r() - 0.5) * 150, fy - 40 - r() * 230 * guc, 1 + r() * 2, 0, 7); x.fill(); }
  x.globalAlpha = 1;
  for (const y of yer.filter((q) => q.on)) await ciz(y);
  if (n > YER.length) hap(x, `+${n - YER.length} kişi daha`, 830, 470, { px: 15 });
  if (!n) yazi(x, 'Ateşin başında kimse yok', fx, 235, { px: 26, w: 800, hiza: 'center', renk: RENK.soluk });
  panel(x, 24, 22, 330, muzik ? 118 : 92, 18, 'rgba(6,8,18,0.66)');
  yazi(x, kanal, 44, 58, { px: 24, w: 800, max: 290 });
  yazi(x, `${sunucu}  •  ${n} kişi`, 44, 82, { px: 14, renk: RENK.soluk, max: 290 });
  cubuk(x, 44, 94, 200, 8, ates.yakit / 100);
  yazi(x, `${ates.seri} gün seri`, 334, 103, { px: 13, w: 800, renk: RENK.altin, hiza: 'right' });
  if (muzik) yazi(x, `♪  ${muzik}`, 44, 128, { px: 14, w: 600, renk: RENK.ates, max: 290 });
  return bitir(t, 'kamp');
}

async function muzikKart({ baslik, kanal, sure: sn, kapak, isteyen, sira, canli, durum }) {
  const t = tuval(900, 260, { vurgu: RENK.mor }), { x } = t;
  const im = await resim(kapak);
  x.save(); x.beginPath(); x.roundRect(30, 30, 200, 200, 22); x.clip();
  if (im) { const o = Math.max(200 / im.width, 200 / im.height); x.drawImage(im, 130 - (im.width * o) / 2, 130 - (im.height * o) / 2, im.width * o, im.height * o); }
  else { const g = x.createLinearGradient(30, 30, 230, 230); g.addColorStop(0, RENK.mor); g.addColorStop(1, RENK.ates); x.fillStyle = g; x.fillRect(30, 30, 200, 200); x.fillStyle = 'rgba(11,16,32,0.85)'; x.beginPath(); x.arc(130, 130, 62, 0, 7); x.fill(); x.fillStyle = RENK.yazi; x.beginPath(); x.arc(130, 130, 14, 0, 7); x.fill(); }
  x.restore();
  hap(x, durum || (canli ? 'CANLI RADYO' : 'ŞİMDİ ÇALIYOR'), 260, 34, { renk: canli ? RENK.kirmizi : RENK.mor, px: 14, yaziRenk: '#fff' });
  yazi(x, baslik, 260, 112, { px: 36, w: 800, max: 600 });
  yazi(x, kanal || '', 260, 146, { px: 20, renk: RENK.soluk, max: 600 });
  for (let i = 0; i < 44; i++) { const h = 8 + ((karma(baslik + i) % 100) / 100) * 34; x.fillStyle = i % 2 ? RENK.mor : RENK.ates; x.globalAlpha = 0.85; x.beginPath(); x.roundRect(260 + i * 13.6, 205 - h, 8, h, 4); x.fill(); }
  x.globalAlpha = 1;
  yazi(x, [canli ? null : sn ? `${Math.floor(sn / 60)}:${String(Math.floor(sn % 60)).padStart(2, '0')}` : null, isteyen ? `İsteyen: ${isteyen}` : null, sira ? `Sırada ${sira} şarkı` : null].filter(Boolean).join('   •   '), 260, 236, { px: 16, renk: RENK.soluk, max: 600 });
  return bitir(t, 'muzik');
}

let yardimOnbellek = null;
function yardimKart(kategoriSayisi, komutSayisi) {
  if (yardimOnbellek) return new AttachmentBuilder(yardimOnbellek, { name: 'yardim.png' });
  const t = tuval(1000, 250), { x } = t;
  yazi(x, 'KampAteş', 50, 118, { px: 76, w: 800 });
  yazi(x, 'Oyun topluluğunun her şeyi tek botta', 54, 158, { px: 24, renk: RENK.soluk });
  hap(x, `${komutSayisi} KOMUT`, 54, 184, { px: 16 });
  hap(x, `${kategoriSayisi} KATEGORİ`, 190, 184, { px: 16, renk: 'rgba(255,255,255,0.14)', yaziRenk: RENK.yazi });
  for (const [renk, gen, yuk] of [['#ff4a12', 70, 190], ['#ff9a22', 48, 140], ['#ffe08a', 26, 86]]) { x.fillStyle = renk; x.beginPath(); x.moveTo(840 - gen, 215); x.bezierCurveTo(840 - gen * 1.5, 215 - yuk * 0.4, 835, 215 - yuk * 0.7, 846, 215 - yuk); x.bezierCurveTo(840 + gen * 0.5, 215 - yuk * 0.6, 840 + gen * 1.5, 215 - yuk * 0.3, 840 + gen, 215); x.fill(); }
  const att = bitir(t, 'yardim'); yardimOnbellek = att.attachment;
  return att;
}

async function haftalikKart({ sunucu, tarih, bolumler, ozet }) {
  const t = tuval(1000, 560, { vurgu: RENK.altin }), { x } = t;
  yazi(x, 'HAFTANIN KARNESİ', 40, 62, { px: 20, w: 800, renk: RENK.altin });
  yazi(x, sunucu, 40, 108, { px: 42, w: 800, max: 640 });
  yazi(x, tarih, 960, 62, { px: 18, renk: RENK.soluk, hiza: 'right' });
  ozet.forEach(([e, d], i) => kutucuk(x, 40 + i * 232, 134, 220, 90, e, d, RENK.altin));
  for (let b = 0; b < bolumler.length; b++) {
    const bl = bolumler[b], a = 40 + b * 310; panel(x, a, 244, 300, 286, 18);
    yazi(x, bl.baslik, a + 20, 280, { px: 17, w: 800, renk: RENK.soluk });
    if (!bl.satirlar.length) yazi(x, 'Veri yok', a + 150, 390, { px: 18, renk: RENK.soluk, hiza: 'center' });
    for (let i = 0; i < bl.satirlar.length; i++) { const s = bl.satirlar[i], y = 302 + i * 74; await avatar(x, s.avatar, a + 48, y + 30, i ? 24 : 28, s.ad, i ? null : RENK.altin); yazi(x, s.ad, a + 90, y + 26, { px: 20, w: 800, max: 195 }); yazi(x, s.deger, a + 90, y + 50, { px: 16, renk: i ? RENK.soluk : RENK.altin, max: 195 }); }
  }
  return bitir(t, 'karne');
}

module.exports = { RENK, profilKart, siralamaKart, bannerKart, faceitKart, skorTablosu, kampKart, muzikKart, yardimKart, haftalikKart, sayi, sure };
