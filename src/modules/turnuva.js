// Turnuva: kayıt butonu, tek elemeli fikstür (bay geçişli), sonuç girişi, şampiyon ödülü
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { E, R, yanit, hata, tamam, para, karistir } = require('../core/util');

// Katılımcılardan tek elemeli fikstür üretir; eksik yerler "bay" olur ve rakibi otomatik tur atlar
function fiksturKur(katilimcilar) {
  const boyut = 2 ** Math.ceil(Math.log2(Math.max(2, katilimcilar.length)));
  const tohum = [...katilimcilar, ...Array(boyut - katilimcilar.length).fill(null)];
  const turlar = [Array.from({ length: boyut / 2 }, (_, k) => ({ a: tohum[k], b: tohum[boyut - 1 - k], kazanan: null }))];
  for (let n = boyut / 4; n >= 1; n /= 2) turlar.push(Array.from({ length: n }, () => ({ a: null, b: null, kazanan: null })));
  turlar[0].forEach((m, k) => { if (m.b === null) kazananYaz(turlar, 0, k, m.a); });
  return turlar;
}
function kazananYaz(turlar, tur, k, kazanan) {
  turlar[tur][k].kazanan = kazanan;
  if (tur + 1 < turlar.length) turlar[tur + 1][Math.floor(k / 2)][k % 2 === 0 ? 'a' : 'b'] = kazanan;
}
// Oyuncunun oynanmayı bekleyen maçını bulur
function aktifMac(turlar, id) {
  for (let t = 0; t < turlar.length; t++) {
    const k = turlar[t].findIndex((m) => !m.kazanan && m.a && m.b && (m.a === id || m.b === id));
    if (k !== -1) return { tur: t, k };
  }
  return null;
}
const turAdi = (t, toplam) => ['Final', 'Yarı final', 'Çeyrek final'][toplam - 1 - t] || `${t + 1}. tur`;
const u = (id) => (id ? `<@${id}>` : '*bay*');
function tablo(t) {
  return t.turlar.map((tur, n) => `**${turAdi(n, t.turlar.length)}**\n` + tur.map((m) => {
    if (m.a && m.b) return m.kazanan ? `✅ ${m.kazanan === m.a ? `**${u(m.a)}**` : `~~${u(m.a)}~~`} vs ${m.kazanan === m.b ? `**${u(m.b)}**` : `~~${u(m.b)}~~`}` : `⚔️ ${u(m.a)} vs ${u(m.b)}`;
    if (m.kazanan) return `➡️ ${u(m.kazanan)} *(bay geçti)*`;
    return `⏳ ${m.a ? u(m.a) : '…'} vs ${m.b ? u(m.b) : '…'}`;
  }).join('\n')).join('\n\n');
}
const kayitGorunum = (t) => ({
  embeds: [E(`🏆 ${t.ad}`, `${t.aciklama ? `${t.aciklama}\n\n` : ''}**Format:** Tek eleme${t.odul ? `\n**Ödül:** ${para(t.odul)}` : ''}\n**Kontenjan:** ${t.katilimcilar.length}/${t.max}\n\n${t.katilimcilar.map((id) => `<@${id}>`).join(' ') || '*Henüz kayıt yok*'}`, R.altin).setFooter({ text: 'Yetkili /turnuva başlat yazınca fikstür çekilir' })],
  components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`turnuva:katil:${t.id}`).setLabel('Kayıt ol').setStyle(ButtonStyle.Success).setEmoji('✍️'), new ButtonBuilder().setCustomId(`turnuva:ayril:${t.id}`).setLabel('Kaydı sil').setStyle(ButtonStyle.Secondary))],
});
const aktif = (g) => db.belge.liste(g, 'turnuva').at(-1);

module.exports = {
  ad: 'turnuva',
  fiksturKur, kazananYaz, aktifMac,
  komutlar: [
    { data: new SlashCommandBuilder().setName('turnuva').setDescription('Turnuva sistemi')
        .addSubcommand((s) => s.setName('oluştur').setDescription('[Yetkili] Kayıtları açar')
          .addStringOption((o) => o.setName('ad').setDescription('Turnuva adı').setRequired(true).setMaxLength(80))
          .addIntegerOption((o) => o.setName('kontenjan').setDescription('En fazla katılımcı (varsayılan 16)').setMinValue(2).setMaxValue(64))
          .addIntegerOption((o) => o.setName('ödül').setDescription('Şampiyona verilecek coin').setMinValue(0).setMaxValue(1000000))
          .addStringOption((o) => o.setName('açıklama').setDescription('Kurallar, tarih vb.').setMaxLength(500)))
        .addSubcommand((s) => s.setName('başlat').setDescription('[Yetkili] Kayıtları kapatır ve fikstürü çeker'))
        .addSubcommand((s) => s.setName('sonuç').setDescription('[Yetkili] Bir maçın kazananını girer').addUserOption((o) => o.setName('kazanan').setDescription('Maçı kazanan oyuncu').setRequired(true)))
        .addSubcommand((s) => s.setName('tablo').setDescription('Fikstürü gösterir'))
        .addSubcommand((s) => s.setName('iptal').setDescription('[Yetkili] Turnuvayı iptal eder')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt !== 'tablo' && !i.memberPermissions.has(P.ManageGuild)) return hata(i, 'Bunun için **Sunucuyu Yönet** yetkisi gerekir.');
        const t = aktif(g);
        if (alt === 'oluştur') {
          if (t) return hata(i, `Zaten süren bir turnuva var: **${t.ad}**. Önce onu bitir ya da \`/turnuva iptal\` kullan.`);
          const yeni = { ad: i.options.getString('ad'), max: i.options.getInteger('kontenjan') || 16, odul: i.options.getInteger('ödül') || 0, aciklama: i.options.getString('açıklama'), katilimcilar: [], turlar: null };
          yeni.id = db.belge.ekle(g, 'turnuva', yeni);
          return i.reply(kayitGorunum(yeni));
        }
        if (!t) return hata(i, 'Aktif bir turnuva yok.');
        if (alt === 'tablo') return yanit(i, t.turlar ? E(`🏆 ${t.ad} — Fikstür`, tablo(t), R.altin) : kayitGorunum(t));
        if (alt === 'iptal') { db.belge.sil(t.id); return tamam(i, `**${t.ad}** iptal edildi.`); }
        if (alt === 'başlat') {
          if (t.turlar) return hata(i, 'Turnuva zaten başladı.');
          if (t.katilimcilar.length < 2) return hata(i, 'En az 2 katılımcı gerekli.');
          t.turlar = fiksturKur(karistir(t.katilimcilar));
          db.belge.yaz(t.id, t);
          return yanit(i, { content: t.katilimcilar.map((id) => `<@${id}>`).join(' '), embeds: [E(`🏆 ${t.ad} başladı!`, tablo(t), R.altin).setFooter({ text: 'Sonuçlar: /turnuva sonuç' })] });
        }
        // sonuç
        if (!t.turlar) return hata(i, 'Turnuva henüz başlamadı.');
        const kazanan = i.options.getUser('kazanan');
        const m = aktifMac(t.turlar, kazanan.id);
        if (!m) return hata(i, 'Bu oyuncunun oynanmayı bekleyen bir maçı yok.');
        kazananYaz(t.turlar, m.tur, m.k, kazanan.id);
        if (m.tur === t.turlar.length - 1) {
          db.belge.sil(t.id);
          if (t.odul) db.arttir(g, kazanan.id, 'para', t.odul);
          await yanit(i, { content: `${kazanan}`, embeds: [E(`🏆 ${t.ad} — ŞAMPİYON`, `# 👑 ${kazanan}\n${t.odul ? `Ödül: ${para(t.odul)}\n` : ''}\n${tablo(t)}`, R.altin).setThumbnail(kazanan.displayAvatarURL({ size: 256 }))] });
          await oyuncu.basarimVer(i.guild, kazanan.id, 'sampiyon', i.channel);
          return oyuncu.xpEkle(i.guild, kazanan.id, 500, i.channel);
        }
        db.belge.yaz(t.id, t);
        const sonraki = aktifMac(t.turlar, kazanan.id);
        return yanit(i, E(null, `✅ ${kazanan} **${turAdi(m.tur, t.turlar.length)}** maçını kazandı ve tur atladı.${sonraki ? `\nSıradaki maç: ${u(t.turlar[sonraki.tur][sonraki.k].a)} vs ${u(t.turlar[sonraki.tur][sonraki.k].b)}` : ''}`, R.ok));
      } },
  ],
  bilesenler: {
    turnuva: async (i, [islem, id]) => {
      const t = db.belge.al(id);
      if (!t || t.tur !== 'turnuva' || t.turlar) return hata(i, 'Bu turnuvanın kayıtları kapalı.');
      const var_ = t.katilimcilar.includes(i.user.id);
      if (islem === 'katil') {
        if (var_) return hata(i, 'Zaten kayıtlısın.');
        if (t.katilimcilar.length >= t.max) return hata(i, 'Kontenjan dolu.');
        t.katilimcilar.push(i.user.id);
      } else {
        if (!var_) return hata(i, 'Kayıtlı değilsin.');
        t.katilimcilar = t.katilimcilar.filter((x) => x !== i.user.id);
      }
      db.belge.yaz(t.id, t);
      return i.update(kayitGorunum(t));
    },
  },
};
