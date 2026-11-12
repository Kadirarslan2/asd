// Seviye sistemi: mesaj ve ses XP'si, profil, sıralamalar, seviye rolleri, görevler, başarımlar, itibar
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { E, R, yanit, hata, tamam, sayi, para, cubuk, sureYaz, madalya, rast, gun } = require('../core/util');

const bekleme = new Map(); // mesaj XP'si için 45 sn bekleme

function profilEmbed(guild, user) {
  const u = db.uye(guild.id, user.id);
  const s = oyuncu.seviyeHesapla(u.xp);
  const rozetler = (u.veri.basarim || []).map((b) => oyuncu.BASARIMLAR[b]?.[0]).filter(Boolean).join(' ');
  const e = E(`${user.username} — Profil`, null, R.mor).setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: `Seviye ${s.seviye}`, value: `\`${cubuk(s.kalan / s.gereken, 14)}\` ${sayi(s.kalan)}/${sayi(s.gereken)} XP • Sıra **#${db.sira(guild.id, user.id, 'xp')}**` },
      { name: '🪙 Para', value: sayi(u.para), inline: true }, { name: '💬 Mesaj', value: sayi(u.mesaj), inline: true }, { name: '🎙️ Ses', value: sureYaz(u.ses * 1000), inline: true },
      { name: '⭐ İtibar', value: sayi(u.rep), inline: true }, { name: '⚔️ Sunucu ELO', value: `${u.elo} (${u.galibiyet}G / ${u.maglubiyet}M)`, inline: true },
      { name: '🎯 FACEIT', value: u.faceit_nick ? `${u.faceit_nick} • Lvl ${u.faceit_lvl} • ${u.faceit_elo} ELO` : 'Bağlı değil', inline: true });
  if (u.veri.klan) { const k = db.belge.al(u.veri.klan); if (k) e.addFields({ name: '🛡️ Klan', value: `[${k.etiket}] ${k.ad}`, inline: true }); }
  if (rozetler) e.addFields({ name: `Başarımlar (${u.veri.basarim.length}/${Object.keys(oyuncu.BASARIMLAR).length})`, value: rozetler });
  return e;
}

const TURLER = { xp: ['📈 Seviye', (u) => `Seviye **${u.seviye}** • ${sayi(u.xp)} XP`], para: ['🪙 Zenginler', (u) => `${sayi(u.para)} 🪙`], ses: ['🎙️ Ses', (u) => sureYaz(u.ses * 1000)],
  mesaj: ['💬 Mesaj', (u) => `${sayi(u.mesaj)} mesaj`], rep: ['⭐ İtibar', (u) => `${u.rep} itibar`], elo: ['⚔️ Sunucu ELO', (u) => `**${u.elo}** ELO • ${u.galibiyet}G/${u.maglubiyet}M`], faceit_elo: ['🎯 FACEIT ELO', (u) => `**${u.faceit_elo}** ELO • Lvl ${u.faceit_lvl} • ${u.faceit_nick}`] };

module.exports = {
  ad: 'seviye',
  komutlar: [
    { data: new SlashCommandBuilder().setName('seviye').setDescription('Seviye ve XP durumunu gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => {
        const user = i.options.getUser('üye') || i.user, u = db.uye(i.guild.id, user.id), s = oyuncu.seviyeHesapla(u.xp);
        return yanit(i, E(null, `**${user.username}** — Seviye **${s.seviye}** • Sıra **#${db.sira(i.guild.id, user.id, 'xp')}**\n\`${cubuk(s.kalan / s.gereken, 20)}\` ${sayi(s.kalan)} / ${sayi(s.gereken)} XP${u.veri.boost > Date.now() ? '\n⚡ 2x XP takviyesi aktif' : ''}`, R.mor).setThumbnail(user.displayAvatarURL()));
      } },
    { data: new SlashCommandBuilder().setName('profil').setDescription('Tüm istatistikleri tek kartta gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => yanit(i, profilEmbed(i.guild, i.options.getUser('üye') || i.user)) },
    { data: new SlashCommandBuilder().setName('sıralama').setDescription('Sunucu sıralamaları')
        .addStringOption((o) => o.setName('tür').setDescription('Sıralama türü').addChoices(...Object.entries(TURLER).map(([value, [name]]) => ({ name, value })))),
      calistir: (i) => {
        const tur = i.options.getString('tür') || 'xp';
        const [baslik, fmt] = TURLER[tur];
        const l = db.sirala(i.guild.id, tur, 10, tur === 'elo' ? 'AND (galibiyet + maglubiyet) > 0' : '');
        return yanit(i, E(`${baslik} Sıralaması`, l.map((u, k) => `${madalya(k)} <@${u.user}> — ${fmt(u)}`).join('\n') || 'Henüz veri yok.', R.altin)
          .setFooter({ text: `Senin sıran: #${db.sira(i.guild.id, i.user.id, tur)}` }));
      } },
    { data: new SlashCommandBuilder().setName('görevler').setDescription('Bugünkü günlük görevlerini gösterir'),
      calistir: (i) => {
        const g = oyuncu.gorevDurum(i.guild.id, i.user.id);
        const satirlar = g.liste.map((a) => {
          const [emoji, ad, hedef, odul] = oyuncu.GOREVLER[a];
          const bitti = g.biten.includes(a), n = Math.min(hedef, g.ilerleme[a] || 0);
          return `${bitti ? '✅' : emoji} **${ad}** — ${n}/${hedef} • ${sayi(odul)} 🪙\n\`${cubuk(bitti ? 1 : n / hedef, 16)}\``;
        });
        return yanit(i, E('📜 Günlük Görevler', satirlar.join('\n') + `\n\n🌟 Üçünü de bitir: +${para(300)} bonus${g.bonus ? ' ✅' : ''}\n*Görevler her gece yarısı yenilenir.*`, R.bilgi));
      } },
    { data: new SlashCommandBuilder().setName('başarımlar').setDescription('Başarımları ve hangilerini açtığını gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => {
        const user = i.options.getUser('üye') || i.user;
        const acik = db.uye(i.guild.id, user.id).veri.basarim || [];
        return yanit(i, E(`🏅 ${user.username} — Başarımlar (${acik.length}/${Object.keys(oyuncu.BASARIMLAR).length})`,
          Object.entries(oyuncu.BASARIMLAR).map(([id, [e, ad, ac]]) => `${acik.includes(id) ? e : '🔒'} **${ad}** — ${ac}`).join('\n'), R.mor));
      } },
    { data: new SlashCommandBuilder().setName('rep').setDescription('Bir üyeye itibar puanı verir (günde 1)').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)),
      calistir: async (i) => {
        const hedef = i.options.getUser('üye');
        if (hedef.id === i.user.id || hedef.bot) return hata(i, 'Kendine ya da botlara itibar veremezsin.');
        const u = db.uye(i.guild.id, i.user.id);
        if (u.veri.repGun === gun()) return hata(i, 'Bugünkü itibar hakkını kullandın. Yarın tekrar gel.');
        db.veri(i.guild.id, i.user.id, (v) => { v.repGun = gun(); });
        db.arttir(i.guild.id, hedef.id, 'rep', 1);
        await tamam(i, `${i.user}, ${hedef} kullanıcısına ⭐ **+1 itibar** verdi!`);
        await oyuncu.gorevIlerle(i.guild, i.user.id, 'rep', 1, i.channel);
      } },
    { data: new SlashCommandBuilder().setName('seviye-rol').setDescription('Seviyeye ulaşınca verilecek roller').setDefaultMemberPermissions(P.ManageRoles)
        .addSubcommand((s) => s.setName('ekle').setDescription('Seviye rolü ekler')
          .addIntegerOption((o) => o.setName('seviye').setDescription('Seviye').setRequired(true).setMinValue(1).setMaxValue(200))
          .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true)))
        .addSubcommand((s) => s.setName('sil').setDescription('Seviye rolünü kaldırır').addIntegerOption((o) => o.setName('seviye').setDescription('Seviye').setRequired(true)))
        .addSubcommand((s) => s.setName('liste').setDescription('Seviye rollerini listeler')),
      calistir: (i) => {
        const alt = i.options.getSubcommand(), r = db.ayar(i.guild.id, 'seviyeRolleri', {});
        if (alt === 'liste') return yanit(i, E('📈 Seviye Rolleri', Object.entries(r).sort((a, b) => a[0] - b[0]).map(([l, id]) => `Seviye **${l}** → <@&${id}>`).join('\n') || 'Tanımlı rol yok.'), true);
        const l = i.options.getInteger('seviye');
        if (alt === 'ekle') {
          const rol = i.options.getRole('rol');
          if (rol.managed || rol.position >= i.guild.members.me.roles.highest.position) return hata(i, 'Bu rolü veremem; rolümü onun üstüne taşı.');
          r[l] = rol.id;
        } else delete r[l];
        db.ayarYaz(i.guild.id, 'seviyeRolleri', r);
        return tamam(i, alt === 'ekle' ? `Seviye **${l}** → ${i.options.getRole('rol')}` : `Seviye ${l} rolü kaldırıldı.`, true);
      } },
  ],
  olaylar: {
    messageCreate: async (m) => {
      if (!m.guild || m.author.bot || m.system) return;
      db.arttir(m.guild.id, m.author.id, 'mesaj', 1);
      await oyuncu.gorevIlerle(m.guild, m.author.id, 'mesaj', 1, m.channel);
      const k = `${m.guild.id}:${m.author.id}`;
      if (Date.now() - (bekleme.get(k) || 0) < 45_000) return;
      bekleme.set(k, Date.now());
      await oyuncu.basarimVer(m.guild, m.author.id, 'ilkmesaj', m.channel);
      await oyuncu.xpEkle(m.guild, m.author.id, rast(15, 25), m.channel);
    },
  },
  // Her dakika: seste olan (sağırlaştırılmamış, yalnız olmayan) üyelere XP + süre
  async tik(ctx) {
    const saat = new Date().getHours();
    for (const g of ctx.client.guilds.cache.values()) {
      for (const kanal of g.channels.cache.values()) {
        if (!kanal.isVoiceBased() || kanal.id === g.afkChannelId) continue;
        const insanlar = kanal.members.filter((m) => !m.user.bot);
        if (insanlar.size < 2) continue; // tek başına AFK kasmayı engelle
        for (const m of insanlar.values()) {
          if (m.voice.selfDeaf || m.voice.serverDeaf) continue;
          db.arttir(g.id, m.id, 'ses', 60);
          db.arttir(g.id, m.id, 'para', 2);
          db.aktivite(g.id, 'ses', 1);
          await oyuncu.xpEkle(g, m.id, 8);
          await oyuncu.gorevIlerle(g, m.id, 'ses', 1);
          const u = db.uye(g.id, m.id);
          if (u.ses >= 36000) await oyuncu.basarimVer(g, m.id, 'ses10');
          if (u.ses >= 360000) await oyuncu.basarimVer(g, m.id, 'ses100');
          if (saat >= 3 && saat < 5) await oyuncu.basarimVer(g, m.id, 'gecekusu');
        }
      }
    }
  },
};
