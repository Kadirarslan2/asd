const { EmbedBuilder, MessageFlags } = require('discord.js');

const R = { ana: 0x2ee66b, ok: 0x2ecc71, hata: 0xe74c3c, bilgi: 0x3498db, altin: 0xf1c40f, mor: 0x9b59b6, gri: 0x95a5a6 };
const E = (baslik, aciklama, renk = R.ana) => {
  const e = new EmbedBuilder().setColor(renk);
  if (baslik) e.setTitle(String(baslik).slice(0, 256));
  if (aciklama) e.setDescription(String(aciklama).slice(0, 4096));
  return e;
};
const GIZLI = MessageFlags.Ephemeral;

// Etkileşimin durumuna göre doğru yanıt yöntemini seçer
async function yanit(i, icerik, gizli = false) {
  const p = typeof icerik === 'string' ? { content: icerik } : icerik instanceof EmbedBuilder ? { embeds: [icerik] } : { ...icerik };
  if (i.deferred && !i.replied) return i.editReply(p);
  if (gizli) p.flags = GIZLI;
  if (i.replied) return i.followUp(p);
  return i.reply(p);
}
const hata = (i, metin) => yanit(i, { embeds: [E(null, `❌ ${metin}`, R.hata)] }, true);
const tamam = (i, metin, gizli = false) => yanit(i, { embeds: [E(null, `✅ ${metin}`, R.ok)] }, gizli);

// "10dk", "2s", "1g", "30sn", "1h30m" gibi süreleri milisaniyeye çevirir
function sureCoz(str) {
  if (!str) return null;
  const birim = { sn: 1e3, s: 36e5, sa: 36e5, saat: 36e5, dk: 6e4, d: 6e4, m: 6e4, h: 36e5, g: 864e5, gün: 864e5, gun: 864e5, hafta: 6048e5, w: 6048e5, hf: 6048e5, sec: 1e3 };
  let toplam = 0, eslesti = false;
  for (const m of String(str).toLowerCase().matchAll(/(\d+(?:[.,]\d+)?)\s*([a-zğüşıöç]+)/g)) {
    const b = birim[m[2]];
    if (!b) return null;
    toplam += parseFloat(m[1].replace(',', '.')) * b;
    eslesti = true;
  }
  return eslesti ? Math.round(toplam) : null;
}
function sureYaz(ms) {
  let s = Math.max(0, Math.round(ms / 1000));
  const g = Math.floor(s / 86400); s %= 86400;
  const sa = Math.floor(s / 3600); s %= 3600;
  const dk = Math.floor(s / 60); s %= 60;
  return [g && `${g}g`, sa && `${sa}sa`, dk && `${dk}dk`, !g && !sa && s && `${s}sn`].filter(Boolean).join(' ') || '0sn';
}
const zd = (ms, stil = 'R') => `<t:${Math.floor(ms / 1000)}:${stil}>`;
const rast = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sec = (dizi) => dizi[Math.floor(Math.random() * dizi.length)];
const karistir = (dizi) => {
  const d = [...dizi];
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
};
const sayi = (n) => Math.trunc(n).toLocaleString('tr-TR');
const para = (n) => `**${sayi(n)}** 🪙`;
const gun = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE'); // YYYY-AA-GG (yerel saat dilimi)
const cubuk = (oran, uzunluk = 12) => { const d = Math.round(Math.min(1, Math.max(0, oran)) * uzunluk); return '█'.repeat(d) + '░'.repeat(uzunluk - d); };
const kisalt = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const madalya = (i) => ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;

module.exports = { R, E, GIZLI, yanit, hata, tamam, sureCoz, sureYaz, zd, rast, sec, karistir, sayi, para, gun, cubuk, kisalt, madalya };
