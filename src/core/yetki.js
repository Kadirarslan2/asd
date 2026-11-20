// Yetkili rütbeleri, VIP paketleri ve yetki seviyesi kontrolü.
// Moderasyon komutları Discord izinlerine değil buradaki seviyeye bakar; böylece her rütbenin sınırı ayrı ayarlanır
// (ör. Deneme Rehber en fazla 30 dakika susturabilir, Moderatör en fazla 7 günlük ban atabilir).
const { PermissionFlagsBits: P } = require('discord.js');
const db = require('./db');

// Yüksekten düşüğe. "oyun": AuraCraft eklentisinde rütbe vermek için konsol komutu ({oyuncu} = Minecraft adı)
const RUTBELER = [
  { id: 'kurucu', ad: 'Kurucu', emoji: '👑', renk: 0xff4d4d, seviye: 6, oyun: 'yetki ver {oyuncu} kurucu', izin: [P.Administrator] },
  { id: 'yonetici', ad: 'Yönetici', emoji: '🛡️', renk: 0xff8a3d, seviye: 5, oyun: 'yetki ver {oyuncu} admin', izin: [P.ManageGuild, P.ManageRoles, P.ManageChannels, P.ManageMessages, P.ModerateMembers, P.KickMembers, P.BanMembers, P.MoveMembers, P.MuteMembers, P.DeafenMembers, P.ManageNicknames, P.ViewAuditLog] },
  { id: 'moderator', ad: 'Moderatör', emoji: '⚔️', renk: 0x5ad1ff, seviye: 4, oyun: 'yetki ver {oyuncu} moderator', izin: [P.ManageMessages, P.ModerateMembers, P.KickMembers, P.MoveMembers, P.MuteMembers, P.DeafenMembers, P.ManageNicknames] },
  { id: 'discord', ad: 'Discord Yetkilisi', emoji: '💬', renk: 0x8b9dff, seviye: 3, oyun: null, izin: [P.ManageMessages, P.MoveMembers, P.MuteMembers, P.ManageNicknames] },
  { id: 'rehber', ad: 'Rehber', emoji: '🧭', renk: 0x2ee66b, seviye: 2, oyun: 'yetki ver {oyuncu} rehber', izin: [P.ManageMessages, P.MuteMembers] },
  { id: 'deneme', ad: 'Deneme Rehber', emoji: '🌱', renk: 0xa3e635, seviye: 1, oyun: 'yetki ver {oyuncu} deneme-rehber', izin: [] },
];
const SAHIP = 7; // sunucu sahibi: Kurucu rütbesini de verebilir

// VIP paketleri: XP ve günlük ödül çarpanı. "ver"/"al" konsol komutları /vip-ayar ile tanımlanır.
const VIPLER = [
  { id: 'mvpplus', ad: 'MVP+', emoji: '💎', renk: 0xff5edb, carpan: 2.0 },
  { id: 'mvp', ad: 'MVP', emoji: '💠', renk: 0x5eead4, carpan: 1.75 },
  { id: 'vipplus', ad: 'VIP+', emoji: '⭐', renk: 0xffd166, carpan: 1.5 },
  { id: 'vip', ad: 'VIP', emoji: '✨', renk: 0xf4e285, carpan: 1.25 },
];

// İşlem → gereken en düşük seviye
const GEREK = {
  uyar: 1, sustur: 1, 'susturma-kaldır': 1, sicil: 1, not: 1, sikayet: 1, mesai: 1,
  kick: 2, sil: 2, 'oyun-at': 2,
  jail: 3, unjail: 3, yavasmod: 3, kilit: 3, 'oyun-whitelist': 3,
  ban: 4, unban: 4, 'uyari-sil': 4, 'oyun-ban': 4, 'oyun-duyur': 4,
  vip: 5, 'yetkili-ver': 5, 'yetkili-basvuru': 5,
};
const SUSTUR_MAX = { 1: 30 * 6e4, 2: 2 * 36e5, 3: 864e5, 4: 7 * 864e5 }; // 5+ : 28 gün (Discord sınırı)
const BAN_MAX = { 4: 7 * 864e5 };                                          // 5+ : kalıcı

const rolHaritasi = (g) => db.ayar(g, 'yetki.roller', {});
const vipHaritasi = (g) => db.ayar(g, 'vip.roller', {});

function seviye(member) {
  if (!member) return 0;
  if (member.id === member.guild?.ownerId) return SAHIP;
  let s = 0;
  const roller = rolHaritasi(member.guild.id);
  for (const r of RUTBELER) if (roller[r.id] && member.roles.cache.has(roller[r.id])) s = Math.max(s, r.seviye);
  if (member.permissions?.has(P.Administrator)) s = Math.max(s, 6);
  return s;
}
const rutbe = (member) => { const roller = rolHaritasi(member.guild.id); return RUTBELER.find((r) => roller[r.id] && member.roles.cache.has(roller[r.id])) || null; };
const rutbeBul = (id) => RUTBELER.find((r) => r.id === id);
const seviyeAdi = (s) => (s >= SAHIP ? 'Sunucu Sahibi' : RUTBELER.find((r) => r.seviye === s)?.ad || 'Üye');

// Etkileşimi yapan yetkilinin bu işlem için seviyesi yetiyor mu? Yetmiyorsa açıklama döner.
function gerek(i, islem) {
  const s = seviye(i.member), g = GEREK[islem] ?? 6;
  if (s >= g) return null;
  return `Bu işlem için en az **${seviyeAdi(g)}** rütbesi gerekir.${s ? ` (Senin rütben: ${seviyeAdi(s)})` : ''}`;
}
const susturMax = (s) => (s >= 5 ? 28 * 864e5 : SUSTUR_MAX[s] || 0);
const banMax = (s) => (s >= 5 ? Infinity : BAN_MAX[s] || 0);

// Hedef bir yetkiliyse ve seviyesi işlemi yapanınkine eşit/yüksekse engelle
function ustYetkili(i, hedef) {
  if (!hedef || i.user.id === i.guild.ownerId) return null;
  return seviye(hedef) >= seviye(i.member) && seviye(hedef) > 0 ? 'Kendi rütbende ya da üstündeki bir yetkiliye işlem yapamazsın.' : null;
}

// Her ceza sicile yazılır; yetkili istatistikleri de buradan sayılır
function cezaKaydet(guildId, hedefId, yetkiliId, tur, sebep, sure = null) {
  return db.belge.ekle(guildId, 'ceza', { tur, yetkili: yetkiliId, sebep: sebep || null, sure }, hedefId);
}
function vipBilgi(guildId, userId) {
  const v = db.uye(guildId, userId).veri.vip;
  if (!v || (v.bitis && v.bitis < Date.now())) return null;
  return { ...VIPLER.find((p) => p.id === v.paket), ...v };
}
// XP/günlük çarpanı: VIP paketi ve sunucu takviyesi (booster)
function carpan(guildId, userId) {
  const u = db.uye(guildId, userId), v = vipBilgi(guildId, userId);
  return Math.max(v?.carpan || 1, u.veri.booster ? 1.25 : 1);
}

module.exports = { RUTBELER, VIPLER, GEREK, SAHIP, seviye, rutbe, rutbeBul, seviyeAdi, gerek, susturMax, banMax, ustYetkili, cezaKaydet, vipBilgi, carpan, rolHaritasi, vipHaritasi };
