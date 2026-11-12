// Seviye sistemi: mesaj ve ses XP'si, profil, sıralamalar, seviye rolleri, görevler, başarımlar, itibar
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const cizim = require('../core/cizim');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { E, R, yanit, hata, tamam, sayi, para, cubuk, sureYaz, madalya, rast, gun } = require('../core/util');

const bekleme = new Map(); // mesaj XP'si için 45 sn bekleme

const avatarUrl = (u) => u.displayAvatarURL({ extension: 'png', size: 256 });
const satir = (...b) => new ActionRowBuilder().addComponents(...b);

async function profilMesaj(guild, user) {
  const u = db.uye(guild.id, user.id), s = oyuncu.seviyeHesapla(u.xp);
  const member = await guild.members.fetch(user.id).catch(() => null);
  const klan = u.veri.klan && db.belge.al(u.veri.klan);
  const kart = await cizim.profilKart({ ad: member?.displayName || user.username, avatar: avatarUrl(member || user), renk: member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : null,
    seviye: s.seviye, sira: db.sira(guild.id, user.id, 'xp'), kalan: s.kalan, gereken: s.gereken, para: u.para, mesaj: u.mesaj, ses: u.ses, rep: u.rep, elo: u.elo, g: u.galibiyet, m: u.maglubiyet,
    basarim: (u.veri.basarim || []).length, basarimToplam: Object.keys(oyuncu.BASARIMLAR).length, klan: klan?.etiket, boost: u.veri.boost > Date.now(),
    faceit: u.faceit_nick ? { lvl: u.faceit_lvl, elo: u.faceit_elo, nick: u.faceit_nick } : null });
  const b = (id, ad, emoji) => new ButtonBuilder().setCustomId(`profil:${id}:${user.id}`).setLabel(ad).setEmoji(emoji).setStyle(ButtonStyle.Secondary);
  return { files: [kart], components: [satir(b('gorev', 'Görevler', '📜'), b('basarim', 'Başarımlar', '🏅'), b('yenile', 'Yenile', '🔄'), ...(u.faceit_nick ? [b('faceit', 'FACEIT', '🎯')] : []))] };
}
function gorevEmbed(guildId, user) {
  const g = oyuncu.gorevDurum(guildId, user.id);
  const satirlar = g.liste.map((a) => {
    const [emoji, ad, hedef, odul] = oyuncu.GOREVLER[a];
    const bitti = g.biten.includes(a), n = Math.min(hedef, g.ilerleme[a] || 0);
    return `${bitti ? '✅' : emoji} **${ad}** — ${n}/${hedef} • ${sayi(odul)} 🪙\n\`${cubuk(bitti ? 1 : n / hedef, 16)}\``;
  });
  return E(`📜 ${user.username} — Günlük Görevler`, satirlar.join('\n') + `\n\n🌟 Üçünü de bitir: +${para(300)} bonus${g.bonus ? ' ✅' : ''}\n*Görevler her gece yarısı yenilenir.*`, R.bilgi);
}
function basarimEmbed(guildId, user) {
  const acik = db.uye(guildId, user.id).veri.basarim || [];
  return E(`🏅 ${user.username} — Başarımlar (${acik.length}/${Object.keys(oyuncu.BASARIMLAR).length})`,
    Object.entries(oyuncu.BASARIMLAR).map(([id, [e, ad, ac]]) => `${acik.includes(id) ? e : '🔒'} **${ad}** — ${ac}`).join('\n'), R.mor);
}

const TURLER = { xp: ['Seviye', (u) => [`Seviye ${u.seviye}`, `${sayi(u.xp)} XP`], '📈'], para: ['Zenginler', (u) => [`${sayi(u.para)} coin`], '🪙'], ses: ['Ses', (u) => [cizim.sure(u.ses)], '🎙️'],
  mesaj: ['Mesaj', (u) => [`${sayi(u.mesaj)} mesaj`], '💬'], rep: ['İtibar', (u) => [`${u.rep} itibar`], '⭐'], elo: ['Sunucu ELO', (u) => [`${u.elo} ELO`, `${u.galibiyet}G / ${u.maglubiyet}M`], '⚔️'],
  faceit_elo: ['FACEIT ELO', (u) => [`${sayi(u.faceit_elo)} ELO`, `Seviye ${u.faceit_lvl} • ${u.faceit_nick}`], '🎯'] };

async function siralamaMesaj(guild, tur, userId) {
  const [baslik, fmt] = TURLER[tur];
  const l = db.sirala(guild.id, tur, 10, tur === 'elo' ? 'AND (galibiyet + maglubiyet) > 0' : '');
  const uyeler = l.length ? await guild.members.fetch({ user: l.map((u) => u.user) }).catch(() => null) : null;
  const kart = await cizim.siralamaKart({ baslik: `${baslik} Sıralaması`, altBaslik: guild.name, ben: `Senin sıran: #${db.sira(guild.id, userId, tur)}`,
    satirlar: l.map((u) => { const m = uyeler?.get(u.user), [deger, alt] = fmt(u); return { ad: m?.displayName || `Üye ${u.user.slice(-4)}`, avatar: m ? avatarUrl(m) : null, deger, alt }; }) });
  const menu = new StringSelectMenuBuilder().setCustomId('siralama').setPlaceholder('Sıralama türünü değiştir')
    .addOptions(Object.entries(TURLER).map(([value, [label, , emoji]]) => ({ label, value, emoji, default: value === tur })));
  return { files: [kart], components: [satir(menu)], attachments: [] };
}

// Haftalık karne: pazar akşamı, haftanın en aktifleri tek resimde
async function haftalikKarne(guild) {
  const onceki = db.ayar(guild.id, 'hafta.anlik', {});
  const tum = db.sql.prepare('SELECT user, mesaj, ses, xp FROM uye WHERE guild=?').all(guild.id);
  const fark = tum.map((u) => { const o = onceki[u.user] || [0, 0, 0]; return { user: u.user, mesaj: u.mesaj - o[0], ses: u.ses - o[1], xp: u.xp - o[2] }; });
  db.ayarYaz(guild.id, 'hafta.anlik', Object.fromEntries(tum.map((u) => [u.user, [u.mesaj, u.ses, u.xp]])));
  const kanal = guild.channels.cache.get(db.ayar(guild.id, 'kanal.seviye'));
  const toplamMesaj = fark.reduce((a, u) => a + u.mesaj, 0), toplamSes = fark.reduce((a, u) => a + u.ses, 0);
  if (!kanal || (!toplamMesaj && !toplamSes)) return null;
  const ilk3 = (alan) => fark.filter((u) => u[alan] > 0).sort((a, b) => b[alan] - a[alan]).slice(0, 3);
  const secilen = { mesaj: ilk3('mesaj'), ses: ilk3('ses'), xp: ilk3('xp') };
  const idler = [...new Set(Object.values(secilen).flat().map((u) => u.user))];
  const uyeler = idler.length ? await guild.members.fetch({ user: idler }).catch(() => null) : null;
  const sat = (l, fmt) => l.map((u) => { const m = uyeler?.get(u.user); return { ad: m?.displayName || `Üye ${u.user.slice(-4)}`, avatar: m ? avatarUrl(m) : null, deger: fmt(u) }; });
  const bit = new Date(), bas = new Date(Date.now() - 6 * 864e5), ates = db.ayar(guild.id, 'ates');
  const kart = await cizim.haftalikKart({ sunucu: guild.name, tarih: `${bas.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} - ${bit.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`,
    ozet: [['MESAJ', sayi(toplamMesaj)], ['SES SAATİ', sayi(toplamSes / 3600)], ['AKTİF ÜYE', sayi(fark.filter((u) => u.mesaj > 0 || u.ses > 0).length)], ['ATEŞ SERİSİ', `${ates?.seri || 0} gün`]],
    bolumler: [{ baslik: 'EN ÇOK YAZANLAR', satirlar: sat(secilen.mesaj, (u) => `${sayi(u.mesaj)} mesaj`) }, { baslik: 'SESİN KRALLARI', satirlar: sat(secilen.ses, (u) => cizim.sure(u.ses)) }, { baslik: 'EN ÇOK XP', satirlar: sat(secilen.xp, (u) => `${sayi(u.xp)} XP`) }] });
  // Haftanın birincilerine ödül
  for (const l of Object.values(secilen)) if (l[0]) db.arttir(guild.id, l[0].user, 'para', 500);
  await kanal.send({ content: `📊 **Haftanın karnesi** geldi! Her kategorinin birincisine ${para(500)} ödül verildi.`, files: [kart] }).catch(() => {});
  return kart;
}

module.exports = {
  ad: 'seviye',
  komutlar: [
    { data: new SlashCommandBuilder().setName('seviye').setDescription('Seviye kartını gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: async (i) => { await i.deferReply(); return i.editReply(await profilMesaj(i.guild, i.options.getUser('üye') || i.user)); } },
    { data: new SlashCommandBuilder().setName('profil').setDescription('Tüm istatistikleri tek kartta gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: async (i) => { await i.deferReply(); return i.editReply(await profilMesaj(i.guild, i.options.getUser('üye') || i.user)); } },
    { data: new SlashCommandBuilder().setName('sıralama').setDescription('Sunucu sıralamaları (resimli, menüden tür değiştirilebilir)')
        .addStringOption((o) => o.setName('tür').setDescription('Sıralama türü').addChoices(...Object.entries(TURLER).map(([value, [name]]) => ({ name, value })))),
      calistir: async (i) => { await i.deferReply(); return i.editReply(await siralamaMesaj(i.guild, i.options.getString('tür') || 'xp', i.user.id)); } },
    { data: new SlashCommandBuilder().setName('görevler').setDescription('Bugünkü günlük görevlerini gösterir'),
      calistir: (i) => yanit(i, gorevEmbed(i.guild.id, i.user)) },
    { data: new SlashCommandBuilder().setName('başarımlar').setDescription('Başarımları ve hangilerini açtığını gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => yanit(i, basarimEmbed(i.guild.id, i.options.getUser('üye') || i.user)) },
    { data: new SlashCommandBuilder().setName('karne').setDescription('[Yönetici] Haftalık karneyi şimdi yayınlar').setDefaultMemberPermissions(P.ManageGuild),
      calistir: async (i) => {
        await i.deferReply({ flags: 64 });
        const k = await haftalikKarne(i.guild);
        return i.editReply(k ? 'Karne seviye kanalına gönderildi.' : 'Karne gönderilemedi: seviye kanalı ayarlı değil ya da bu hafta hiç aktivite yok.');
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
  haftalikKarne,
  bilesenler: {
    profil: async (i, [islem, uid]) => {
      const user = await i.client.users.fetch(uid).catch(() => null);
      if (!user) return hata(i, 'Üye bulunamadı.');
      if (islem === 'gorev') return yanit(i, gorevEmbed(i.guild.id, user), true);
      if (islem === 'basarim') return yanit(i, basarimEmbed(i.guild.id, user), true);
      if (islem === 'faceit') return require('./faceit').profilGonder(i, uid);
      await i.deferUpdate();
      return i.editReply({ ...(await profilMesaj(i.guild, user)), attachments: [] });
    },
    siralama: async (i) => { await i.deferUpdate(); return i.editReply(await siralamaMesaj(i.guild, i.values[0], i.user.id)); },
  },
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
    const simdi = new Date(), saat = simdi.getHours();
    for (const g of ctx.client.guilds.cache.values()) {
      // Pazar 20:00'den sonra haftada bir kez karne yayınla
      if (simdi.getDay() === 0 && saat >= 20 && db.ayar(g.id, 'hafta.son') !== gun()) { db.ayarYaz(g.id, 'hafta.son', gun()); await haftalikKarne(g).catch((e) => console.error('karne:', e)); }
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
