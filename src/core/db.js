// SQLite veri katmanı (Node'un yerleşik node:sqlite modülü — ek kurulum gerektirmez)
const fs = require('node:fs');
const path = require('node:path');
const uyari = process.emitWarning;
process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : uyari.call(process, w, ...a));
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

if (config.dbYol !== ':memory:') fs.mkdirSync(path.dirname(config.dbYol), { recursive: true });
const sql = new DatabaseSync(config.dbYol);
sql.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS ayar (guild TEXT, anahtar TEXT, deger TEXT, PRIMARY KEY (guild, anahtar));
CREATE TABLE IF NOT EXISTS uye (
  guild TEXT, user TEXT,
  xp INTEGER DEFAULT 0, seviye INTEGER DEFAULT 0, para INTEGER DEFAULT 0,
  mesaj INTEGER DEFAULT 0, ses INTEGER DEFAULT 0, rep INTEGER DEFAULT 0,
  mc_nick TEXT, mc_uuid TEXT,
  veri TEXT DEFAULT '{}',
  PRIMARY KEY (guild, user));
CREATE TABLE IF NOT EXISTS belge (id INTEGER PRIMARY KEY AUTOINCREMENT, guild TEXT, tur TEXT, ref TEXT, veri TEXT, zaman INTEGER);
CREATE INDEX IF NOT EXISTS belge_tur ON belge (tur, guild);
CREATE INDEX IF NOT EXISTS belge_ref ON belge (tur, ref);
CREATE TABLE IF NOT EXISTS aktivite (guild TEXT, saat INTEGER, mesaj INTEGER DEFAULT 0, ses INTEGER DEFAULT 0, PRIMARY KEY (guild, saat));
`);

const q = (s) => sql.prepare(s);
const SAYISAL = new Set(['xp', 'seviye', 'para', 'mesaj', 'ses', 'rep']);
const METIN = new Set(['mc_nick', 'mc_uuid']);
const belgeAc = (r) => (r ? { id: r.id, guild: r.guild, tur: r.tur, ref: r.ref, zaman: r.zaman, ...JSON.parse(r.veri) } : null);

const db = {
  sql,
  // --- Sunucu ayarları ---
  ayar(guild, anahtar, varsayilan = null) {
    const r = q('SELECT deger FROM ayar WHERE guild=? AND anahtar=?').get(guild, anahtar);
    return r ? JSON.parse(r.deger) : varsayilan;
  },
  ayarYaz(guild, anahtar, deger) {
    if (deger === null || deger === undefined) q('DELETE FROM ayar WHERE guild=? AND anahtar=?').run(guild, anahtar);
    else q('INSERT INTO ayar VALUES (?,?,?) ON CONFLICT(guild, anahtar) DO UPDATE SET deger=excluded.deger').run(guild, anahtar, JSON.stringify(deger));
  },
  // --- Üyeler ---
  uye(guild, user) {
    q('INSERT OR IGNORE INTO uye (guild, user) VALUES (?,?)').run(guild, user);
    const r = q('SELECT * FROM uye WHERE guild=? AND user=?').get(guild, user);
    r.veri = JSON.parse(r.veri || '{}');
    return r;
  },
  arttir(guild, user, alan, n) {
    if (!SAYISAL.has(alan)) throw new Error('Geçersiz alan: ' + alan);
    q('INSERT OR IGNORE INTO uye (guild, user) VALUES (?,?)').run(guild, user);
    q(`UPDATE uye SET ${alan} = ${alan} + ? WHERE guild=? AND user=?`).run(Math.trunc(n), guild, user);
  },
  uyeYaz(guild, user, alanlar) {
    q('INSERT OR IGNORE INTO uye (guild, user) VALUES (?,?)').run(guild, user);
    for (const [k, v] of Object.entries(alanlar)) {
      if (!SAYISAL.has(k) && !METIN.has(k)) throw new Error('Geçersiz alan: ' + k);
      q(`UPDATE uye SET ${k} = ? WHERE guild=? AND user=?`).run(v, guild, user);
    }
  },
  // Üyenin serbest biçimli JSON verisini günceller: db.veri(g, u, v => { v.x = 1 })
  veri(guild, user, fn) {
    const u = db.uye(guild, user);
    const sonuc = fn(u.veri);
    q('UPDATE uye SET veri=? WHERE guild=? AND user=?').run(JSON.stringify(u.veri), guild, user);
    return sonuc === undefined ? u.veri : sonuc;
  },
  sirala(guild, alan, limit = 10, kosul = '') {
    if (!SAYISAL.has(alan)) throw new Error('Geçersiz alan: ' + alan);
    return q(`SELECT * FROM uye WHERE guild=? AND ${alan} > 0 ${kosul} ORDER BY ${alan} DESC LIMIT ?`).all(guild, limit);
  },
  sira(guild, user, alan) {
    if (!SAYISAL.has(alan)) throw new Error('Geçersiz alan: ' + alan);
    const u = db.uye(guild, user);
    return q(`SELECT COUNT(*) AS n FROM uye WHERE guild=? AND ${alan} > ?`).get(guild, u[alan]).n + 1;
  },
  mcBul: (guild, nick) => q('SELECT * FROM uye WHERE guild=? AND lower(mc_nick)=lower(?)').get(guild, nick) || null,
  // --- Belgeler: çekiliş, turnuva, uyarı, hatırlatıcı vb. için genel depo ---
  belge: {
    ekle(guild, tur, veri, ref = null) {
      return Number(q('INSERT INTO belge (guild, tur, ref, veri, zaman) VALUES (?,?,?,?,?)').run(guild, tur, ref, JSON.stringify(veri), Date.now()).lastInsertRowid);
    },
    al: (id) => belgeAc(q('SELECT * FROM belge WHERE id=?').get(Number(id))),
    ref: (tur, ref) => belgeAc(q('SELECT * FROM belge WHERE tur=? AND ref=? ORDER BY id DESC').get(tur, ref)),
    refHepsi: (guild, tur, ref) => q('SELECT * FROM belge WHERE guild=? AND tur=? AND ref=? ORDER BY id').all(guild, tur, ref).map(belgeAc),
    liste: (guild, tur) => q('SELECT * FROM belge WHERE guild=? AND tur=? ORDER BY id').all(guild, tur).map(belgeAc),
    hepsi: (tur) => q('SELECT * FROM belge WHERE tur=? ORDER BY id').all(tur).map(belgeAc),
    yaz(id, veri, ref) {
      const { id: _i, guild: _g, tur: _t, ref: _r, zaman: _z, ...temiz } = veri;
      if (ref !== undefined) q('UPDATE belge SET veri=?, ref=? WHERE id=?').run(JSON.stringify(temiz), ref, Number(id));
      else q('UPDATE belge SET veri=? WHERE id=?').run(JSON.stringify(temiz), Number(id));
    },
    sil: (id) => q('DELETE FROM belge WHERE id=?').run(Number(id)),
  },
  // --- Saatlik aktivite (nabız grafiği) ---
  aktivite(guild, alan, n = 1) {
    const saat = Math.floor(Date.now() / 3600000);
    q('INSERT OR IGNORE INTO aktivite (guild, saat) VALUES (?,?)').run(guild, saat);
    q(`UPDATE aktivite SET ${alan === 'ses' ? 'ses' : 'mesaj'} = ${alan === 'ses' ? 'ses' : 'mesaj'} + ? WHERE guild=? AND saat=?`).run(n, guild, saat);
  },
  aktiviteSon(guild, saatSayisi = 24) {
    const simdi = Math.floor(Date.now() / 3600000);
    const rows = q('SELECT * FROM aktivite WHERE guild=? AND saat > ?').all(guild, simdi - saatSayisi);
    const harita = new Map(rows.map((r) => [r.saat, r]));
    return Array.from({ length: saatSayisi }, (_, i) => {
      const s = simdi - saatSayisi + 1 + i;
      return { saat: s, mesaj: harita.get(s)?.mesaj || 0, ses: harita.get(s)?.ses || 0 };
    });
  },
};
module.exports = db;
