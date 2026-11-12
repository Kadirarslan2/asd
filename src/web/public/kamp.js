// Kamp ateşi 3D sahnesi (Three.js). Sunucudan WebSocket ile gelen ses kanalı durumunu canlandırır.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const yol = location.pathname.split('/'), sorgu = new URLSearchParams(location.search);
const G = yol[2], C = yol[3], BEN = sorgu.get('u') || '', K = sorgu.get('k') || '';

// ---------- Sahne ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('#sahne'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const GECE = new THREE.Color(0x0a1026), KORKU = new THREE.Color(0x020a08);
scene.background = GECE.clone();
scene.fog = new THREE.FogExp2(0x0a1026, 0.035);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
camera.position.set(0, 4.2, 9.5);
const kontrol = new OrbitControls(camera, renderer.domElement);
kontrol.target.set(0, 1.1, 0);
kontrol.enableDamping = true; kontrol.enablePan = false;
kontrol.minDistance = 4; kontrol.maxDistance = 22;
kontrol.minPolarAngle = 0.35; kontrol.maxPolarAngle = 1.5;
kontrol.autoRotate = true; kontrol.autoRotateSpeed = 0.35;
function boyutla() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', boyutla); boyutla();

let tohum = 1337;
const rnd = () => ((tohum = (tohum * 16807) % 2147483647) - 1) / 2147483646; // sahne her açılışta aynı olsun
const mat = (renk, ek = {}) => new THREE.MeshStandardMaterial({ color: renk, roughness: 0.95, flatShading: true, ...ek });

// Işıklar
const ay = new THREE.DirectionalLight(0x8fa8ff, 0.55); ay.position.set(-12, 18, -8); scene.add(ay);
const ortam = new THREE.HemisphereLight(0x33468a, 0x0d0a08, 0.75); scene.add(ortam);
const atesIsik = new THREE.PointLight(0xff8a3c, 30, 26, 1.6);
atesIsik.position.set(0, 1.3, 0); atesIsik.castShadow = true; atesIsik.shadow.mapSize.set(1024, 1024); atesIsik.shadow.bias = -0.004; atesIsik.shadow.radius = 4;
scene.add(atesIsik);

// Zemin
const zeminGeo = new THREE.CircleGeometry(60, 72, 0, Math.PI * 2);
const zemin = new THREE.Mesh(zeminGeo, mat(0x1d2a1c)); zemin.rotation.x = -Math.PI / 2; zemin.receiveShadow = true; scene.add(zemin);
const toprak = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28), mat(0x2b2118)); toprak.rotation.x = -Math.PI / 2; toprak.position.y = 0.01; toprak.receiveShadow = true; scene.add(toprak);

// Yıldızlar ve ay
{
  const n = 900, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, y = rnd() * 0.95 + 0.05, r = Math.sqrt(1 - y * y); p.set([Math.cos(a) * r * 110, y * 110, Math.sin(a) * r * 110], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.55, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 })));
  const ayTop = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 24), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false })); ayTop.position.set(-55, 62, -70); scene.add(ayTop);
}
function isiltiDoku(ic, dis) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, ic); g.addColorStop(0.4, dis); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
// Ağaçlar
for (let i = 0; i < 70; i++) {
  const a = rnd() * Math.PI * 2, r = 10 + rnd() * 30, h = 3.5 + rnd() * 4, g = new THREE.Group();
  const govde = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, h * 0.35, 6), mat(0x3a2a1c)); govde.position.y = h * 0.17; g.add(govde);
  for (let k = 0; k < 3; k++) { const koni = new THREE.Mesh(new THREE.ConeGeometry(1.5 - k * 0.38, h * 0.42, 7), mat(k % 2 ? 0x1c3d2a : 0x183524)); koni.position.y = h * (0.42 + k * 0.22); koni.castShadow = true; g.add(koni); }
  g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.rotation.y = rnd() * 6; scene.add(g);
}
// Ateş çukuru: taşlar ve odunlar
for (let i = 0; i < 11; i++) {
  const a = (i / 11) * Math.PI * 2, t = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + rnd() * 0.08, 0), mat(0x55504c));
  t.position.set(Math.cos(a) * 0.95, 0.1, Math.sin(a) * 0.95); t.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); t.castShadow = true; scene.add(t);
}
const odunGeo = new THREE.CylinderGeometry(0.09, 0.1, 1.15, 7);
for (let i = 0; i < 5; i++) { const o = new THREE.Mesh(odunGeo, mat(0x2a1a10, { emissive: 0x551800, emissiveIntensity: 0.5 })); const a = (i / 5) * Math.PI * 2; o.position.set(Math.cos(a) * 0.28, 0.42, Math.sin(a) * 0.28); o.rotation.set(0, -a, 0.95); o.rotation.order = 'YXZ'; scene.add(o); }

// Alevler: üst üste binen ışıyan koniler + kıvılcım parçacıkları
const alevler = [];
for (const [renk, r, h, op] of [[0xff4a12, 0.52, 1.5, 0.75], [0xff9a22, 0.38, 1.2, 0.85], [0xffe08a, 0.22, 0.8, 0.95]]) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9, 4, true), new THREE.MeshBasicMaterial({ color: renk, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.userData = { h, taban: m.geometry.attributes.position.array.slice(), renk: new THREE.Color(renk) };
  m.position.y = 0.3 + h / 2; scene.add(m); alevler.push(m);
}
const KIV = 110, kivPos = new Float32Array(KIV * 3), kivVeri = [];
for (let i = 0; i < KIV; i++) kivVeri.push({ y: Math.random() * 4, hiz: 0.6 + Math.random() * 1.4, a: Math.random() * 6.28, r: Math.random() * 0.35, sal: Math.random() * 6 });
const kivGeo = new THREE.BufferGeometry(); kivGeo.setAttribute('position', new THREE.BufferAttribute(kivPos, 3));
const kivMat = new THREE.PointsMaterial({ map: isiltiDoku('rgba(255,240,200,1)', 'rgba(255,140,40,.7)'), size: 0.13, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false });
scene.add(new THREE.Points(kivGeo, kivMat));
const hale = new THREE.Sprite(new THREE.SpriteMaterial({ map: isiltiDoku('rgba(255,170,80,.55)', 'rgba(255,90,20,.18)'), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
hale.position.y = 1.1; hale.scale.set(6, 6, 1); scene.add(hale);
// Ateş böcekleri
const BOCEK = 40, bocekPos = new Float32Array(BOCEK * 3), bocekVeri = [];
for (let i = 0; i < BOCEK; i++) bocekVeri.push({ a: rnd() * 6.28, r: 5 + rnd() * 14, y: 0.6 + rnd() * 2.5, hiz: 0.05 + rnd() * 0.12, f: rnd() * 6 });
const bocekGeo = new THREE.BufferGeometry(); bocekGeo.setAttribute('position', new THREE.BufferAttribute(bocekPos, 3));
scene.add(new THREE.Points(bocekGeo, new THREE.PointsMaterial({ map: isiltiDoku('rgba(220,255,150,1)', 'rgba(160,255,80,.5)'), size: 0.22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

// Radyo ve uçuşan notalar (sunucuda müzik çalarken görünür)
const radyo = new THREE.Group(); radyo.position.set(1.35, 0, 0.75); radyo.rotation.y = -0.9; radyo.visible = false; scene.add(radyo);
{ const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.18), mat(0x8a3b2a)); g.position.y = 0.17; g.castShadow = true; radyo.add(g);
  for (const sx of [-0.13, 0.13]) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.085, 14), mat(0x1c1c22)); h.position.set(sx, 0.17, 0.092); radyo.add(h); }
  const anten = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), mat(0xbbbbbb)); anten.position.set(0.2, 0.52, 0); anten.rotation.z = -0.35; radyo.add(anten); }
function notaDoku(k) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = '52px serif'; x.fillStyle = '#ffd9a0'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k, 32, 34); return new THREE.CanvasTexture(c); }
const notalar = ['♪', '♫', '♩'].flatMap((k) => [0, 1]).map((_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: notaDoku(['♪', '♫', '♩'][i % 3]), transparent: true, depthWrite: false, fog: false })); s.scale.setScalar(0.28); s.userData.f = i / 6; s.visible = false; scene.add(s); return s; });
let muzikVar = false;

// ---------- Avatarlar ----------
const PALET = ['#e76f51', '#2a9d8f', '#e9c46a', '#8ab17d', '#577590', '#b5838d', '#f4a261', '#6d597a', '#43aa8b', '#f94144'];
const TEN = [0xf1c9a5, 0xe0ac86, 0xc68863, 0x9c6b4a, 0xffdbb8];
const karma = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const dokuYukle = new THREE.TextureLoader();
const avatarlar = new Map();
const resimOnbellek = new Map();
function resim(url) {
  if (!resimOnbellek.has(url)) resimOnbellek.set(url, new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = '/avatar?u=' + encodeURIComponent(url); }));
  return resimOnbellek.get(url);
}
function yuvarlak(x, a, b, w, h, r) { x.beginPath(); x.roundRect(a, b, w, h, r); x.fill(); }

// İsim etiketi: avatar + ad + seviye/FACEIT/klan + ses durumu simgeleri
async function etiketCiz(av) {
  const u = av.veri, c = av.etiketTuval, x = c.getContext('2d');
  const im = await resim(u.avatar);
  if (av.veri !== u) return;
  x.clearRect(0, 0, c.width, c.height);
  x.font = '600 40px system-ui, sans-serif';
  const ad = (u.klan ? `[${u.klan}] ` : '') + u.ad;
  const altSatir = [u.bot ? 'BOT' : `Sv ${u.seviye}`, u.faceit ? `FACEIT ${u.faceit}` : null].filter(Boolean).join(' • ');
  const simge = (u.sagir ? '🎧' : u.sessiz ? '🔇' : '') + (u.yayin ? '🔴' : '') + (u.kamera ? '📷' : '');
  const gen = Math.min(c.width, Math.max(x.measureText(ad).width, 150) + 130 + (simge ? 70 : 0));
  const sol = (c.width - gen) / 2;
  x.fillStyle = u.id === BEN ? 'rgba(120,60,10,.82)' : 'rgba(8,10,20,.72)'; yuvarlak(x, sol, 14, gen, 100, 50);
  if (u.id === BEN) { x.strokeStyle = '#ffb45a'; x.lineWidth = 4; x.beginPath(); x.roundRect(sol + 2, 16, gen - 4, 96, 48); x.stroke(); }
  x.save(); x.beginPath(); x.arc(sol + 50, 64, 40, 0, 6.3); x.clip();
  if (im) x.drawImage(im, sol + 10, 24, 80, 80); else { x.fillStyle = av.renk; x.fillRect(sol + 10, 24, 80, 80); }
  x.restore();
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(ad, sol + 104, 50, gen - 124 - (simge ? 60 : 0));
  x.font = '500 24px system-ui, sans-serif'; x.fillStyle = u.faceit ? '#ffb070' : 'rgba(255,255,255,.65)'; x.fillText(altSatir, sol + 104, 88);
  if (simge) { x.font = '34px system-ui, sans-serif'; x.textAlign = 'right'; x.fillText(simge, sol + gen - 22, 64); x.textAlign = 'left'; }
  av.etiket.material.map.needsUpdate = true;
  if (im && !av.yuzHazir) { const t = new THREE.Texture(im); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; av.yuz.material.map = t; av.yuz.material.color.set(0xdddddd); av.yuz.material.needsUpdate = true; av.yuzHazir = u.avatar; }
}
function balonCiz(av, metin) {
  const c = av.balonTuval, x = c.getContext('2d');
  x.clearRect(0, 0, c.width, c.height);
  x.font = '500 34px system-ui, sans-serif';
  const kelimeler = metin.split(/\s+/), satirlar = ['']; // en fazla 3 satıra sığdır
  for (const k of kelimeler) { const s = satirlar.at(-1); if (x.measureText(s + ' ' + k).width > 440 && s) satirlar.push(k); else satirlar[satirlar.length - 1] = (s + ' ' + k).trim(); }
  const l = satirlar.slice(0, 3); if (satirlar.length > 3) l[2] += '…';
  const gen = Math.min(490, Math.max(...l.map((s) => x.measureText(s).width)) + 50), yuk = l.length * 42 + 30, sol = (c.width - gen) / 2, ust = c.height - yuk - 26;
  x.fillStyle = 'rgba(255,250,240,.96)'; yuvarlak(x, sol, ust, gen, yuk, 22);
  x.beginPath(); x.moveTo(c.width / 2 - 14, ust + yuk - 1); x.lineTo(c.width / 2, ust + yuk + 22); x.lineTo(c.width / 2 + 14, ust + yuk - 1); x.fill();
  x.fillStyle = '#1a1410'; x.textBaseline = 'middle'; x.textAlign = 'center';
  l.forEach((s, i) => x.fillText(s, c.width / 2, ust + 36 + i * 42, 450));
  av.balon.material.map.needsUpdate = true; av.balon.visible = true; av.balonBitis = performance.now() + 6500;
}
function tuvalSprite(w, h, olcek) {
  const tuval = document.createElement('canvas'); tuval.width = w; tuval.height = h;
  const doku = new THREE.CanvasTexture(tuval); doku.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: doku, transparent: true, depthWrite: false, depthTest: false, fog: false, sizeAttenuation: false }));
  s.scale.set(olcek, olcek * h / w, 1);
  return [s, tuval];
}

function avatarKur(u) {
  const h = karma(u.id), renk = u.renk || PALET[h % PALET.length];
  const g = new THREE.Group(), govde = new THREE.Group(); g.add(govde);
  const ekle = (geo, m, x, y, z, ust = govde) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; ust.add(o); return o; };
  const ust = mat(renk), pantolon = mat(0x2b3142), ten = mat(TEN[h % TEN.length]);
  ekle(new THREE.CylinderGeometry(0.33, 0.36, 0.42, 9), mat(0x4a3322), 0, 0.21, 0, g).receiveShadow = true; // kütük
  ekle(new THREE.CapsuleGeometry(0.21, 0.36, 3, 8), ust, 0, 0.84, 0);
  const kafa = new THREE.Group(); kafa.position.set(0, 1.33, 0); govde.add(kafa);
  ekle(new THREE.SphereGeometry(0.2, 12, 10), ten, 0, 0, 0, kafa);
  const yuz = new THREE.Mesh(new THREE.CircleGeometry(0.165, 24), new THREE.MeshBasicMaterial({ color: renk, fog: true })); yuz.position.z = 0.185; kafa.add(yuz);
  for (const s of [-1, 1]) {
    ekle(new THREE.BoxGeometry(0.14, 0.14, 0.42), pantolon, s * 0.115, 0.5, 0.22);
    ekle(new THREE.BoxGeometry(0.13, 0.42, 0.13), pantolon, s * 0.115, 0.23, 0.44);
    ekle(new THREE.BoxGeometry(0.14, 0.08, 0.22), mat(0x1a1a1f), s * 0.115, 0.04, 0.5);
  }
  const kollar = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.28, 1.04, 0); p.rotation.x = -1.05; govde.add(p); ekle(new THREE.BoxGeometry(0.1, 0.42, 0.1), ust, 0, -0.2, 0, p); ekle(new THREE.SphereGeometry(0.065, 6, 6), ten, 0, -0.43, 0, p); return p; });
  // Marshmallow çubuğu (gizli başlar)
  const cubuk = new THREE.Group(); cubuk.visible = false; cubuk.position.set(0, -0.43, 0); cubuk.rotation.x = 1.25; kollar[1].add(cubuk);
  ekle(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5), mat(0x6b4a2a), 0, 0.5, 0, cubuk);
  const lokum = ekle(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), 0, 1.0, 0, cubuk);
  const [etiket, etiketTuval] = tuvalSprite(512, 128, 0.27); etiket.position.y = 1.95; g.add(etiket);
  const [balon, balonTuval] = tuvalSprite(512, 256, 0.34); balon.position.y = 2.2; balon.center.set(0.5, 0); balon.visible = false; balon.renderOrder = 5; g.add(balon);
  const av = { g, govde, kafa, yuz, kollar, cubuk, lokum, etiket, etiketTuval, balon, balonTuval, renk, veri: u, aci: null, hedefAci: 0, yaricap: 14, olcek: 0.01, faz: (h % 100) / 10, ifade: null, ifadeBas: 0, ayriliyor: false };
  scene.add(g); avatarlar.set(u.id, av); etiketCiz(av);
  return av;
}

// ---------- Durum ----------
let ates = { yakit: 30, seri: 0, toplam: 0 }, atesGuc = 0.5, parlama = 0, korkuBitis = 0, R = 3;
const ucanlar = [];
function durumUygula(d) {
  $('#kanal').textContent = '🔥 ' + d.kanal;
  $('#bilgi').textContent = `${d.sunucu} • ${d.uyeler.length} kişi ateş başında`;
  document.title = `🔥 ${d.kanal}`;
  $('#bos').style.display = d.uyeler.length ? 'none' : 'block';
  $('#alt').style.display = BEN && d.uyeler.some((u) => u.id === BEN) ? 'flex' : 'none';
  atesUygula(d.ates);
  muzikVar = Boolean(d.muzik); radyo.visible = muzikVar; $('#muzik').style.display = muzikVar ? 'block' : 'none'; $('#muzik').textContent = muzikVar ? '🎵 ' + d.muzik : '';
  const n = d.uyeler.length; R = Math.max(2.7, n * 0.48);
  kontrol.minDistance = R + 1.5;
  const idler = new Set(d.uyeler.map((u) => u.id));
  for (const [id, av] of avatarlar) if (!idler.has(id)) av.ayriliyor = true;
  d.uyeler.forEach((u, i) => {
    let av = avatarlar.get(u.id);
    if (!av) av = avatarKur(u);
    av.ayriliyor = false;
    if (JSON.stringify(av.veri) !== JSON.stringify(u)) { if (av.yuzHazir !== u.avatar) av.yuzHazir = null; av.veri = u; etiketCiz(av); }
    av.hedefAci = (i / n) * Math.PI * 2 + Math.PI / 2;
    if (av.aci === null) av.aci = av.hedefAci;
  });
}
function atesUygula(a) {
  ates = a;
  $('#yakit i').style.width = a.yakit + '%';
  $('#seri').textContent = `🔥 Ateş serisi: ${a.seri} gün • 🪵 ${a.toplam} odun`;
}
function ifadeUygula(id, ad) {
  const av = avatarlar.get(id);
  if (ad === 'hikaye') { korkuBitis = performance.now() + 12000; bildir(`👻 ${av?.veri.ad || 'Biri'} korku hikâyesi anlatıyor…`); return; }
  if (!av) return;
  av.ifade = ad; av.ifadeBas = performance.now();
  if (ad === 'odun') {
    const o = new THREE.Mesh(odunGeo, mat(0x4a3020)); o.scale.setScalar(0.7); scene.add(o);
    ucanlar.push({ o, bas: av.g.position.clone().setY(1.2), t: 0 });
  }
}
let bildirimZaman;
function bildir(m) { const b = $('#bildirim'); b.textContent = m; b.style.opacity = 1; clearTimeout(bildirimZaman); bildirimZaman = setTimeout(() => (b.style.opacity = 0), 3500); }

// ---------- Bağlantı ----------
let ws, deneme = 0;
function baglan() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?g=${G}&c=${C}&u=${BEN}&k=${K}`);
  ws.onopen = () => { deneme = 0; };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'durum') durumUygula(m);
    else if (m.t === 'ates') atesUygula(m.ates);
    else if (m.t === 'sohbet') { const av = avatarlar.get(m.id); if (av) balonCiz(av, m.metin); }
    else if (m.t === 'ifade') ifadeUygula(m.id, m.ad);
    else if (m.t === 'hata') bildir('⚠️ ' + m.mesaj);
  };
  ws.onclose = () => { $('#bilgi').textContent = 'Bağlantı koptu, yeniden deneniyor…'; setTimeout(baglan, Math.min(15000, 1000 * 2 ** deneme++)); };
}
baglan();
for (const b of document.querySelectorAll('[data-ifade]')) b.onclick = () => { if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'ifade', ad: b.dataset.ifade })); };
renderer.domElement.addEventListener('pointerdown', () => { kontrol.autoRotate = false; clearTimeout(kontrol._z); kontrol._z = setTimeout(() => (kontrol.autoRotate = true), 12000); });

// ---------- Ateş sesi (WebAudio ile üretilir, dosya gerekmez) ----------
let ses = null;
$('#sesBtn').onclick = () => {
  if (ses) { ses.ctx.close(); ses = null; $('#sesBtn').textContent = '🔇'; return; }
  const ctx = new AudioContext(), n = ctx.sampleRate * 2, tampon = ctx.createBuffer(1, n, ctx.sampleRate), v = tampon.getChannelData(0);
  let son = 0; for (let i = 0; i < n; i++) { son = (son + 0.02 * (Math.random() * 2 - 1)) / 1.02; v[i] = son * 3.2; }
  const kaynak = ctx.createBufferSource(); kaynak.buffer = tampon; kaynak.loop = true;
  const suzgec = ctx.createBiquadFilter(); suzgec.type = 'lowpass'; suzgec.frequency.value = 900;
  const kazanc = ctx.createGain(); kazanc.gain.value = 0.5;
  kaynak.connect(suzgec).connect(kazanc).connect(ctx.destination); kaynak.start();
  const citirti = () => {
    if (!ses || ses.ctx !== ctx) return;
    const o = ctx.createBufferSource(), b = ctx.createBuffer(1, 600, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < 600; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 60);
    const g = ctx.createGain(); g.gain.value = 0.15 + Math.random() * 0.3 * atesGuc; o.buffer = b; o.connect(g).connect(ctx.destination); o.start();
    setTimeout(citirti, 60 + Math.random() * 500 / (0.3 + atesGuc));
  };
  ses = { ctx, kazanc }; citirti(); $('#sesBtn').textContent = '🔊';
};

// ---------- Döngü ----------
const saat = new THREE.Clock(), v3 = new THREE.Vector3(), atesRenk = new THREE.Color(), KORKU_RENK = new THREE.Color(0x35ffb0), NORMAL_RENK = new THREE.Color(0xff8a3c);
function kare() {
  requestAnimationFrame(kare);
  const dt = Math.min(saat.getDelta(), 0.05), t = saat.elapsedTime, simdi = performance.now();
  const korku = simdi < korkuBitis ? Math.min(1, (korkuBitis - simdi) / 1500, (simdi - (korkuBitis - 12000)) / 1500) : 0;
  atesGuc += ((0.22 + (ates.yakit / 100) * 0.95) - atesGuc) * dt * 1.5;
  parlama = Math.max(0, parlama - dt * 0.8);
  const guc = atesGuc + parlama * 0.6;
  // Alev
  atesRenk.copy(NORMAL_RENK).lerp(KORKU_RENK, korku);
  alevler.forEach((m, i) => {
    const p = m.geometry.attributes.position, taban = m.userData.taban, h = m.userData.h;
    for (let k = 0; k < p.count; k++) {
      const y = taban[k * 3 + 1], oran = (y + h / 2) / h, sal = oran * oran * 0.22;
      p.setX(k, taban[k * 3] + Math.sin(t * 7 + y * 5 + i * 2 + k) * sal);
      p.setZ(k, taban[k * 3 + 2] + Math.cos(t * 6 + y * 4 + i + k * 1.3) * sal);
    }
    p.needsUpdate = true;
    const s = guc * (1 + Math.sin(t * 9 + i * 1.7) * 0.07);
    m.scale.set(0.55 + s * 0.7, 0.35 + s * 1.05, 0.55 + s * 0.7);
    m.position.y = 0.3 + (h * m.scale.y) / 2; m.rotation.y = t * (0.6 + i * 0.4);
    m.material.color.copy(m.userData.renk).lerp(KORKU_RENK, korku * 0.85);
  });
  const titre = 1 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23.7) * 0.05 + Math.sin(t * 3.1) * 0.05;
  atesIsik.intensity = (6 + guc * 34) * titre * (1 - korku * 0.45); atesIsik.color.copy(atesRenk);
  atesIsik.position.set(Math.sin(t * 13) * 0.05, 1.1 + guc * 0.5, Math.cos(t * 17) * 0.05);
  hale.scale.setScalar(3 + guc * 5); hale.material.color.copy(atesRenk); hale.material.opacity = 0.5 + guc * 0.4;
  kivMat.color.copy(atesRenk).lerp(new THREE.Color(0xffffff), 0.5);
  for (let i = 0; i < KIV; i++) {
    const k = kivVeri[i]; k.y += k.hiz * dt * (0.6 + guc);
    const tavan = 1.2 + guc * 3.6 * (0.4 + (i % 7) / 9);
    if (k.y > tavan) { k.y = 0.3; k.a = Math.random() * 6.28; k.r = Math.random() * 0.3; }
    const yay = k.r + k.y * 0.09;
    kivPos.set([Math.cos(k.a + k.y) * yay + Math.sin(t * 2 + k.sal) * 0.08, i < KIV * (0.25 + guc * 0.75) ? k.y : -5, Math.sin(k.a + k.y) * yay], i * 3);
  }
  kivGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < BOCEK; i++) { const b = bocekVeri[i]; b.a += b.hiz * dt; bocekPos.set([Math.cos(b.a) * b.r, b.y + Math.sin(t * 0.8 + b.f) * 0.4, Math.sin(b.a) * b.r], i * 3); }
  bocekGeo.attributes.position.needsUpdate = true;
  scene.background.copy(GECE).lerp(KORKU, korku); scene.fog.color.copy(scene.background); scene.fog.density = 0.035 + korku * 0.03;
  ortam.intensity = 0.75 - korku * 0.5; ay.intensity = 0.55 - korku * 0.35;

  for (const nota of notalar) { nota.visible = muzikVar; if (!muzikVar) continue; const f = (t * 0.22 + nota.userData.f) % 1; nota.position.set(1.35 + Math.sin(f * 9 + nota.userData.f * 20) * 0.35, 0.5 + f * 2.4, 0.75 + Math.cos(f * 7) * 0.25); nota.material.opacity = Math.sin(f * Math.PI); }
  // Avatarlar
  for (const [id, av] of avatarlar) {
    if (av.ayriliyor) { av.yaricap += dt * 5; av.olcek -= dt * 1.2; if (av.olcek <= 0.02) { scene.remove(av.g); avatarlar.delete(id); continue; } }
    else { av.yaricap += (R - av.yaricap) * Math.min(1, dt * 2.5); av.olcek += (1 - av.olcek) * Math.min(1, dt * 4); }
    let fark = av.hedefAci - av.aci; fark = Math.atan2(Math.sin(fark), Math.cos(fark)); av.aci += fark * Math.min(1, dt * 3);
    av.g.position.set(Math.cos(av.aci) * av.yaricap, 0, Math.sin(av.aci) * av.yaricap);
    av.g.lookAt(0, 0, 0); av.g.scale.setScalar(Math.max(0.01, av.olcek));
    // Boşta: nefes, hafif baş hareketi, ellerini ateşe tutma
    const f = t + av.faz;
    av.govde.position.y = 0; av.govde.rotation.set(Math.sin(f * 0.9) * 0.025 + 0.06, 0, Math.sin(f * 0.6) * 0.02);
    av.kafa.rotation.set(Math.sin(f * 0.7) * 0.06 - korku * 0.15 + (muzikVar ? Math.sin(t * 5.2) * 0.09 : 0), Math.sin(f * 0.31) * 0.35, 0); // müzikte kafa sallar
    av.kollar[0].rotation.set(-1.05 + Math.sin(f * 1.3) * 0.05, 0, 0.12); av.kollar[1].rotation.set(-1.05 + Math.cos(f * 1.3) * 0.05, 0, -0.12);
    av.cubuk.visible = false;
    if (av.ifade) {
      const g = (simdi - av.ifadeBas) / 1000;
      if (av.ifade === 'selam' && g < 2.2) { av.kollar[1].rotation.set(0, 0, -2.6 + Math.sin(g * 14) * 0.35); }
      else if (av.ifade === 'alkis' && g < 2.2) { const c = Math.abs(Math.sin(g * 16)) * 0.35; av.kollar[0].rotation.set(-1.5, 0, 0.75 - c); av.kollar[1].rotation.set(-1.5, 0, -0.75 + c); }
      else if (av.ifade === 'dans' && g < 5) { av.govde.position.y = 0.25 + Math.abs(Math.sin(g * 7)) * 0.22; av.govde.rotation.y = Math.sin(g * 3.5) * 0.7; av.kollar[0].rotation.set(0, 0, 2.4 + Math.sin(g * 7) * 0.5); av.kollar[1].rotation.set(0, 0, -2.4 + Math.sin(g * 7) * 0.5); }
      else if (av.ifade === 'marshmallow' && g < 9) { av.cubuk.visible = true; av.kollar[1].rotation.set(-1.25 + Math.sin(g * 2) * 0.04, 0, -0.1); av.lokum.material.color.setHex(0xffffff).lerp(new THREE.Color(g > 8 ? 0x2a1508 : 0xb9772f), Math.min(1, g / 7)); }
      else if (av.ifade === 'odun' && g < 0.7) { av.kollar[1].rotation.set(-2.6 + g * 3, 0, -0.1); }
      else av.ifade = null;
    }
    if (av.balon.visible) { const kalan = av.balonBitis - simdi; av.balon.material.opacity = Math.min(1, kalan / 500); if (kalan <= 0) av.balon.visible = false; }
  }
  // Havada uçan odunlar
  for (let i = ucanlar.length - 1; i >= 0; i--) {
    const u = ucanlar[i]; u.t += dt * 1.4;
    u.o.position.lerpVectors(u.bas, v3.set(0, 0.5, 0), Math.min(1, u.t)); u.o.position.y += Math.sin(Math.min(1, u.t) * Math.PI) * 1.6;
    u.o.rotation.x += dt * 9; u.o.rotation.z += dt * 5;
    if (u.t >= 1) { scene.remove(u.o); ucanlar.splice(i, 1); parlama = 1; for (const k of kivVeri) if (Math.random() < 0.5) { k.y = 0.3; k.hiz = 1.5 + Math.random() * 2.5; } }
  }
  kontrol.update();
  renderer.render(scene, camera);
}
kare();
window.__kamp = { avatarlar, durumUygula, ifadeUygula }; // hata ayıklama
