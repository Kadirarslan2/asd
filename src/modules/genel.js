// Genel komutlar: yardım, kurulum sihirbazı, ayarlar, bilgi komutları, sunucu nabzı
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../core/db');
const { E, R, yanit, hata, tamam, zd, sayi, sureYaz, GIZLI } = require('../core/util');
const cizim = require('../core/cizim');

const KATEGORILER = {
  '🔥 Kamp Ateşi (3D)': ['kamp'],
  '🎯 Oyun': ['faceit', 'steam', 'oyun-sunucu'],
  '⚔️ Rekabet': ['maç', 'turnuva', 'takım-ara', 'tahmin'],
  '📈 Seviye & Profil': ['seviye', 'profil', 'sıralama', 'görevler', 'başarımlar', 'rep', 'seviye-rol', 'karne'],
  '🪙 Ekonomi': ['bakiye', 'günlük', 'çalış', 'gönder', 'market', 'kumar', 'ödül'],
  '🎲 Eğlence': ['düello', 'tkm', 'aim', 'trivia'],
  '👥 Topluluk': ['klan', 'çekiliş', 'anket', 'öneri', 'hatırlat', 'zaman-kapsülü', 'afk', 'doğumgünü', 'davetler'],
  '🎵 Müzik & Ses': ['müzik', 'oda'],
  '🛡️ Moderasyon': ['ban', 'kick', 'sustur', 'susturma-kaldır', 'uyar', 'uyarılar', 'uyarı-sil', 'sil', 'jail', 'unjail', 'yavaşmod', 'kilit', 'otomod'],
  '⚙️ Yönetim': ['kurulum', 'ayar', 'ticket-panel', 'rol-panel', 'nabız'],
  'ℹ️ Bilgi': ['yardım', 'ping', 'avatar', 'sunucu', 'kullanıcı'],
};

const KANAL_AYAR = {
  log: 'Moderasyon kayıtları', hosgeldin: 'Hoş geldin / güle güle mesajları', seviye: 'Seviye ve başarım duyuruları',
  oneri: 'Öneriler', yildiz: 'Yıldız panosu (⭐)', faceit: 'FACEIT maç takibi', sayma: 'Sayı sayma oyunu',
  kelime: 'Kelime zinciri oyunu', dogumgunu: 'Doğum günü kutlamaları',
};
const ROL_AYAR = { jail: 'Cezalı rolü', oto: 'Yeni üyeye otomatik rol', destek: 'Destek ekibi (ticket)' };

async function kurulum(i) {
  await i.deferReply();
  const g = i.guild, yapilan = [];
  const kanalVar = (anahtar) => { const id = db.ayar(g.id, anahtar); return id && g.channels.cache.get(id); };
  let kat = kanalVar('kategori.ana');
  if (!kat) { kat = await g.channels.create({ name: '🔥 KampAteş', type: ChannelType.GuildCategory }); db.ayarYaz(g.id, 'kategori.ana', kat.id); }
  const metin = { hosgeldin: '👋・hoş-geldin', seviye: '📈・seviye', oneri: '💡・öneriler', yildiz: '⭐・yıldızlar', faceit: '🎯・faceit-maçlar', sayma: '🔢・sayı-sayma', kelime: '🔤・kelime-oyunu', dogumgunu: '🎂・doğum-günü' };
  for (const [a, ad] of Object.entries(metin)) {
    if (kanalVar(`kanal.${a}`)) continue;
    const k = await g.channels.create({ name: ad, type: ChannelType.GuildText, parent: kat.id });
    db.ayarYaz(g.id, `kanal.${a}`, k.id); yapilan.push(`${k}`);
  }
  if (!kanalVar('kanal.log')) {
    const k = await g.channels.create({ name: '🛡️・mod-log', type: ChannelType.GuildText, parent: kat.id, permissionOverwrites: [{ id: g.roles.everyone.id, deny: [P.ViewChannel] }, { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages] }] });
    db.ayarYaz(g.id, 'kanal.log', k.id); yapilan.push(`${k}`);
  }
  if (!kanalVar('ses.olustur')) {
    const k = await g.channels.create({ name: '➕ Oda Oluştur', type: ChannelType.GuildVoice, parent: kat.id });
    db.ayarYaz(g.id, 'ses.olustur', k.id); yapilan.push(`${k}`);
  }
  if (!kanalVar('ses.kamp')) {
    const k = await g.channels.create({ name: '🔥 Kamp Ateşi', type: ChannelType.GuildVoice, parent: kat.id });
    db.ayarYaz(g.id, 'ses.kamp', k.id); yapilan.push(`${k}`);
  }
  if (!kanalVar('kategori.ticket')) {
    const k = await g.channels.create({ name: '🎫 Destek', type: ChannelType.GuildCategory, permissionOverwrites: [{ id: g.roles.everyone.id, deny: [P.ViewChannel] }, { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels] }] });
    db.ayarYaz(g.id, 'kategori.ticket', k.id); yapilan.push(`kategori **${k.name}**`);
  }
  const jailId = db.ayar(g.id, 'rol.jail');
  if (!jailId || !g.roles.cache.get(jailId)) {
    const rol = await g.roles.create({ name: 'Cezalı', color: 0x555555, permissions: [] });
    db.ayarYaz(g.id, 'rol.jail', rol.id);
    let n = 0;
    for (const k of g.channels.cache.values()) {
      if (k.type === ChannelType.GuildCategory || !k.parentId) {
        await k.permissionOverwrites?.edit(rol, { ViewChannel: false }).then(() => n++).catch(() => {});
      }
    }
    const hucre = await g.channels.create({ name: '⛓️・cezalı', type: ChannelType.GuildText, parent: kat.id, permissionOverwrites: [{ id: g.roles.everyone.id, deny: [P.ViewChannel] }, { id: rol.id, allow: [P.ViewChannel, P.SendMessages] }, { id: i.client.user.id, allow: [P.ViewChannel] }] });
    yapilan.push(`${rol} rolü (${n} kanalda gizlendi) ve ${hucre}`);
  }
  await i.editReply({ embeds: [E('🔥 Kurulum tamamlandı', (yapilan.length ? `Oluşturulanlar:\n• ${yapilan.join('\n• ')}` : 'Her şey zaten kuruluydu.') +
    '\n\n**Sıradaki adımlar**\n• `/ticket-panel` ile destek paneli gönder\n• `/otomod` ile otomatik moderasyonu aç\n• `/seviye-rol ekle` ile seviye rolleri tanımla\n• `/faceit bağla` ile üyeler hesaplarını bağlasın\n• Bir ses kanalına girip `/kamp` yaz 🔥', R.ok)] });
}

function yardimEmbed(ctx, kategori) {
  if (!kategori) {
    return E(null, 'Aşağıdaki menüden bir **kategori seç**; o kategorideki tüm komutlar açıklamalarıyla listelenir.\n\n' +
      Object.entries(KATEGORILER).map(([k, v]) => `**${k}** · ${v.length} komut`).join('\n')).setImage('attachment://yardim.png');
  }
  const satirlar = [];
  for (const ad of KATEGORILER[kategori] || []) {
    const k = ctx.komutlar.get(ad);
    if (!k) continue;
    const j = k.data.toJSON();
    const altlar = (j.options || []).filter((o) => o.type === 1 || o.type === 2);
    if (altlar.length) for (const a of altlar) satirlar.push(`\`/${ad} ${a.name}\` — ${a.description}`);
    else satirlar.push(`\`/${ad}\` — ${j.description}`);
  }
  return E(kategori, satirlar.join('\n') || 'Komut yok.').setImage('attachment://yardim.png');
}
const yardimMenu = () => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('yardim').setPlaceholder('Kategori seç…')
  .addOptions(Object.entries(KATEGORILER).map(([k, v]) => ({ label: k.replace(/^\S+\s/, ''), value: k, emoji: k.split(' ')[0], description: v.map((c) => `/${c}`).join(' ').slice(0, 100) }))));

module.exports = {
  ad: 'genel',
  KATEGORILER,
  komutlar: [
    { data: new SlashCommandBuilder().setName('yardım').setDescription('Tüm komutları kategorilere göre gösterir'),
      calistir: (i, ctx) => i.reply({ embeds: [yardimEmbed(ctx)], components: [yardimMenu()], files: [cizim.yardimKart(Object.keys(KATEGORILER).length, ctx.komutlar.size)] }) },
    { data: new SlashCommandBuilder().setName('ping').setDescription('Botun gecikmesini gösterir'),
      calistir: (i) => yanit(i, E(null, `🏓 Gecikme: **${Math.max(0, Math.round(i.client.ws.ping))}ms** • Çalışma süresi: **${sureYaz(i.client.uptime)}**`, R.bilgi)) },
    { data: new SlashCommandBuilder().setName('avatar').setDescription('Bir üyenin avatarını gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => { const u = i.options.getUser('üye') || i.user; return yanit(i, E(`${u.username} avatarı`).setImage(u.displayAvatarURL({ size: 1024 }))); } },
    { data: new SlashCommandBuilder().setName('sunucu').setDescription('Sunucu bilgilerini gösterir'),
      calistir: (i) => {
        const g = i.guild;
        const ses = g.voiceStates.cache.filter((v) => v.channelId).size;
        return yanit(i, E(g.name).setThumbnail(g.iconURL({ size: 256 })).addFields(
          { name: 'Üye', value: sayi(g.memberCount), inline: true }, { name: 'Seste', value: String(ses), inline: true },
          { name: 'Takviye', value: `${g.premiumSubscriptionCount || 0} (Seviye ${g.premiumTier})`, inline: true },
          { name: 'Kanal', value: String(g.channels.cache.size), inline: true }, { name: 'Rol', value: String(g.roles.cache.size), inline: true },
          { name: 'Kuruluş', value: zd(g.createdTimestamp, 'D'), inline: true }, { name: 'Sahip', value: `<@${g.ownerId}>`, inline: true }));
      } },
    { data: new SlashCommandBuilder().setName('kullanıcı').setDescription('Bir üyenin hesap bilgilerini gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: async (i) => {
        const u = i.options.getUser('üye') || i.user;
        const m = await i.guild.members.fetch(u.id).catch(() => null);
        const e = E(u.tag).setThumbnail(u.displayAvatarURL({ size: 256 })).addFields(
          { name: 'ID', value: u.id, inline: true }, { name: 'Hesap açılış', value: zd(u.createdTimestamp, 'D'), inline: true });
        if (m) e.addFields({ name: 'Sunucuya katılış', value: zd(m.joinedTimestamp, 'D'), inline: true },
          { name: `Roller (${m.roles.cache.size - 1})`, value: m.roles.cache.filter((r) => r.id !== i.guild.id).sort((a, b) => b.position - a.position).first(15).join(' ') || 'Yok' });
        return yanit(i, e);
      } },
    { data: new SlashCommandBuilder().setName('kurulum').setDescription('Botun ihtiyaç duyduğu kanal ve rolleri otomatik oluşturur').setDefaultMemberPermissions(P.Administrator),
      calistir: kurulum },
    { data: new SlashCommandBuilder().setName('ayar').setDescription('Bot ayarları').setDefaultMemberPermissions(P.ManageGuild)
        .addSubcommand((s) => s.setName('kanal').setDescription('Bir özelliğin kanalını ayarlar (kanal boşsa kapatır)')
          .addStringOption((o) => o.setName('tür').setDescription('Hangi özellik').setRequired(true).addChoices(...Object.entries(KANAL_AYAR).map(([value, name]) => ({ name, value }))))
          .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
        .addSubcommand((s) => s.setName('rol').setDescription('Bir özelliğin rolünü ayarlar (rol boşsa kapatır)')
          .addStringOption((o) => o.setName('tür').setDescription('Hangi rol').setRequired(true).addChoices(...Object.entries(ROL_AYAR).map(([value, name]) => ({ name, value }))))
          .addRoleOption((o) => o.setName('rol').setDescription('Rol')))
        .addSubcommand((s) => s.setName('ses').setDescription('Özel ses kanallarını ayarlar')
          .addStringOption((o) => o.setName('tür').setDescription('Hangi kanal').setRequired(true).addChoices({ name: 'Oda oluşturma kanalı (gir → özel oda)', value: 'olustur' }, { name: 'Kamp ateşi kanalı', value: 'kamp' }))
          .addChannelOption((o) => o.setName('kanal').setDescription('Ses kanalı').addChannelTypes(ChannelType.GuildVoice)))
        .addSubcommand((s) => s.setName('mesaj').setDescription('Hoş geldin mesajını ayarlar ({üye} {sunucu} {sayı} kullanılabilir)')
          .addStringOption((o) => o.setName('metin').setDescription('Mesaj metni').setRequired(true).setMaxLength(500)))
        .addSubcommand((s) => s.setName('göster').setDescription('Mevcut ayarları listeler')),
      calistir: (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'göster') {
          const k = Object.entries(KANAL_AYAR).map(([a, ad]) => `${ad}: ${db.ayar(g, `kanal.${a}`) ? `<#${db.ayar(g, `kanal.${a}`)}>` : '—'}`);
          const r = Object.entries(ROL_AYAR).map(([a, ad]) => `${ad}: ${db.ayar(g, `rol.${a}`) ? `<@&${db.ayar(g, `rol.${a}`)}>` : '—'}`);
          const s = ['olustur', 'kamp'].map((a) => `Ses (${a}): ${db.ayar(g, `ses.${a}`) ? `<#${db.ayar(g, `ses.${a}`)}>` : '—'}`);
          return yanit(i, E('⚙️ Ayarlar', [...k, '', ...r, '', ...s].join('\n'), R.bilgi), true);
        }
        if (alt === 'mesaj') { db.ayarYaz(g, 'hosgeldin.mesaj', i.options.getString('metin')); return tamam(i, 'Hoş geldin mesajı güncellendi.', true); }
        const tur = i.options.getString('tür');
        const hedef = alt === 'rol' ? i.options.getRole('rol') : i.options.getChannel('kanal');
        db.ayarYaz(g, `${alt}.${tur}`, hedef?.id ?? null);
        return tamam(i, hedef ? `Ayarlandı → ${hedef}` : 'Ayar kapatıldı.', true);
      } },
    { data: new SlashCommandBuilder().setName('nabız').setDescription('Sunucunun son 24 saatlik aktivite grafiğini gösterir'),
      calistir: (i) => {
        const v = db.aktiviteSon(i.guild.id, 24);
        const ciz = (alan) => { const mx = Math.max(1, ...v.map((x) => x[alan])); return v.map((x) => ' ▁▂▃▄▅▆▇█'[Math.ceil((x[alan] / mx) * 8)]).join(''); };
        const top = (alan) => v.reduce((a, x) => a + x[alan], 0);
        const zirve = v.reduce((a, x) => (x.mesaj + x.ses > a.mesaj + a.ses ? x : a), v[0]);
        return yanit(i, E('💓 Sunucu Nabzı — son 24 saat',
          `💬 Mesaj (${sayi(top('mesaj'))})\n\`${ciz('mesaj')}\`\n🎙️ Ses dakikası (${sayi(top('ses'))})\n\`${ciz('ses')}\`\n\nEn hareketli saat: ${zd(zirve.saat * 3600000, 't')}`, R.bilgi));
      } },
  ],
  bilesenler: {
    yardim: (i, _a, ctx) => i.update({ embeds: [yardimEmbed(ctx, i.values[0])], components: [yardimMenu()] }),
  },
  olaylar: {
    messageCreate: (m) => { if (m.guild && !m.author?.bot) db.aktivite(m.guild.id, 'mesaj'); },
  },
};
