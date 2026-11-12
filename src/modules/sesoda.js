// Özel ses odaları: "Oda Oluştur" kanalına giren üyeye kendi odası açılır, boşalınca silinir
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../core/db');
const { E, R, hata, tamam } = require('../core/util');

const bekleme = new Map();
// Diğer modüller de (takım arama, maçlar) geçici oda açabilir
async function geciciOda(guild, ad, { limit = 0, sahip = null, parent = null, izinler = [] } = {}) {
  const kanal = await guild.channels.create({
    name: ad.slice(0, 90), type: ChannelType.GuildVoice, userLimit: limit, parent: parent || undefined,
    permissionOverwrites: [...izinler, ...(sahip ? [{ id: sahip, allow: [P.ManageChannels, P.MoveMembers, P.Connect] }] : []), { id: guild.client.user.id, allow: [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers] }],
  });
  db.belge.ekle(guild.id, 'oda', { sahip, acilis: Date.now() }, kanal.id);
  return kanal;
}
const panel = () => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('oda:kilit').setEmoji('🔒').setLabel('Kilitle/Aç').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('oda:gizle').setEmoji('👁️').setLabel('Gizle/Göster').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('oda:limit').setEmoji('👥').setLabel('Limit').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('oda:isim').setEmoji('✏️').setLabel('İsim').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('oda:sahiplen').setEmoji('👑').setLabel('Sahiplen').setStyle(ButtonStyle.Secondary))];

// Komutu kullananın bulunduğu özel odayı ve sahipliğini doğrular
function odam(i, sahipSart = true) {
  const kanal = i.member.voice.channel;
  const oda = kanal && db.belge.ref('oda', kanal.id);
  if (!oda) { hata(i, 'Bir özel odada değilsin.'); return null; }
  if (sahipSart && oda.sahip !== i.user.id && !i.memberPermissions.has(P.ManageChannels)) { hata(i, 'Bu odanın sahibi değilsin.'); return null; }
  return { kanal, oda };
}
async function islem(i, tur, deger) {
  const o = odam(i, tur !== 'sahiplen');
  if (!o) return;
  const { kanal, oda } = o, herkes = i.guild.roles.everyone;
  if (tur === 'kilit') {
    const kilitli = kanal.permissionOverwrites.cache.get(herkes.id)?.deny.has(P.Connect);
    await kanal.permissionOverwrites.edit(herkes, { Connect: kilitli ? null : false });
    return tamam(i, kilitli ? '🔓 Oda herkese açıldı.' : '🔒 Oda kilitlendi; içeridekiler kalır, yeni kimse giremez.', true);
  }
  if (tur === 'gizle') {
    const gizli = kanal.permissionOverwrites.cache.get(herkes.id)?.deny.has(P.ViewChannel);
    await kanal.permissionOverwrites.edit(herkes, { ViewChannel: gizli ? null : false });
    return tamam(i, gizli ? '👁️ Oda artık görünür.' : '🙈 Oda gizlendi.', true);
  }
  if (tur === 'limit') { await kanal.setUserLimit(deger); return tamam(i, deger ? `Limit **${deger}** kişi.` : 'Limit kaldırıldı.', true); }
  if (tur === 'isim') {
    if (Date.now() - (bekleme.get(kanal.id) || 0) < 5 * 6e4) return hata(i, 'Oda adı 5 dakikada bir değiştirilebilir (Discord sınırı).');
    bekleme.set(kanal.id, Date.now());
    await kanal.setName(deger.slice(0, 90));
    return tamam(i, `Oda adı **${deger}** oldu.`, true);
  }
  if (tur === 'sahiplen') {
    if (oda.sahip && kanal.members.has(oda.sahip)) return hata(i, 'Oda sahibi hâlâ odada.');
    if (oda.sahip) await kanal.permissionOverwrites.delete(oda.sahip).catch(() => {});
    await kanal.permissionOverwrites.edit(i.user.id, { ManageChannels: true, MoveMembers: true, Connect: true });
    db.belge.yaz(oda.id, { ...oda, sahip: i.user.id });
    return tamam(i, `👑 Odanın yeni sahibi ${i.user}.`);
  }
  const hedef = deger; // at / devret
  if (!hedef || hedef.voice.channelId !== kanal.id || hedef.id === i.user.id) return hata(i, 'Bu üye odanda değil.');
  if (tur === 'at') {
    await kanal.permissionOverwrites.edit(hedef.id, { Connect: false });
    await hedef.voice.disconnect().catch(() => {});
    return tamam(i, `${hedef} odadan atıldı ve geri giremez.`, true);
  }
  await kanal.permissionOverwrites.delete(i.user.id).catch(() => {});
  await kanal.permissionOverwrites.edit(hedef.id, { ManageChannels: true, MoveMembers: true, Connect: true });
  db.belge.yaz(oda.id, { ...oda, sahip: hedef.id });
  return tamam(i, `👑 Oda ${hedef} kullanıcısına devredildi.`);
}

module.exports = {
  ad: 'sesoda',
  geciciOda,
  komutlar: [
    { data: new SlashCommandBuilder().setName('oda').setDescription('Özel ses odanı yönet')
        .addSubcommand((s) => s.setName('kilit').setDescription('Odayı kilitler/açar'))
        .addSubcommand((s) => s.setName('gizle').setDescription('Odayı gizler/gösterir'))
        .addSubcommand((s) => s.setName('limit').setDescription('Kişi limitini ayarlar').addIntegerOption((o) => o.setName('kişi').setDescription('0 = sınırsız').setRequired(true).setMinValue(0).setMaxValue(99)))
        .addSubcommand((s) => s.setName('isim').setDescription('Oda adını değiştirir').addStringOption((o) => o.setName('ad').setDescription('Yeni ad').setRequired(true).setMaxLength(90)))
        .addSubcommand((s) => s.setName('at').setDescription('Bir üyeyi odadan atar').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('devret').setDescription('Oda sahipliğini devreder').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('sahiplen').setDescription('Sahibi çıkmış odayı sahiplenir')),
      calistir: (i) => {
        const alt = i.options.getSubcommand();
        return islem(i, alt, alt === 'limit' ? i.options.getInteger('kişi') : alt === 'isim' ? i.options.getString('ad') : i.options.getMember('üye'));
      } },
  ],
  bilesenler: {
    oda: (i, [tur]) => {
      if (tur === 'limit' || tur === 'isim') {
        if (!i.isModalSubmit()) {
          return i.showModal(new ModalBuilder().setCustomId(`oda:${tur}`).setTitle(tur === 'limit' ? 'Kişi limiti' : 'Oda adı').addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('deger').setLabel(tur === 'limit' ? 'Limit (0-99, 0 = sınırsız)' : 'Yeni oda adı').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(tur === 'limit' ? 2 : 90))));
        }
        const d = i.fields.getTextInputValue('deger').trim();
        if (tur === 'limit' && !/^\d{1,2}$/.test(d)) return hata(i, '0-99 arası bir sayı gir.');
        return islem(i, tur, tur === 'limit' ? Number(d) : d);
      }
      return islem(i, tur);
    },
  },
  olaylar: {
    voiceStateUpdate: async (eski, yeni) => {
      const g = yeni.guild;
      // Oluşturma kanalına giriş → yeni oda
      if (yeni.channelId && yeni.channelId !== eski.channelId && yeni.channelId === db.ayar(g.id, 'ses.olustur') && yeni.member && !yeni.member.user.bot) {
        const k = `${g.id}:${yeni.id}`;
        if (Date.now() - (bekleme.get(k) || 0) < 8000) { await yeni.disconnect().catch(() => {}); }
        else {
          bekleme.set(k, Date.now());
          const kanal = await geciciOda(g, `🔊 ${yeni.member.displayName} odası`, { sahip: yeni.id, parent: yeni.channel.parentId }).catch(() => null);
          if (kanal) {
            await yeni.setChannel(kanal).catch(() => {});
            await kanal.send({ content: `${yeni.member}`, embeds: [E('🔊 Odan hazır', 'Aşağıdaki butonlarla ya da `/oda` komutlarıyla odanı yönetebilirsin. Oda boşalınca kendiliğinden silinir.\n🔥 Ateş başı görünümü için `/kamp` yaz.')], components: panel() }).catch(() => {});
          }
        }
      }
      // Boşalan özel odayı sil
      if (eski.channelId && eski.channelId !== yeni.channelId) {
        const oda = db.belge.ref('oda', eski.channelId);
        if (oda && oda.kalici !== true && eski.channel && eski.channel.members.size === 0) {
          db.belge.sil(oda.id);
          await eski.channel.delete().catch(() => {});
        }
      }
    },
    channelDelete: (k) => { const oda = db.belge.ref('oda', k.id); if (oda) db.belge.sil(oda.id); },
  },
  // Hiç girilmemiş, 3 dakikadan eski boş geçici odaları temizle
  async tik(ctx) {
    for (const oda of db.belge.hepsi('oda')) {
      const kanal = ctx.client.channels.cache.get(oda.ref);
      if (!kanal) { db.belge.sil(oda.id); continue; }
      if (kanal.members.size === 0 && Date.now() - (oda.acilis || 0) > 3 * 6e4) { db.belge.sil(oda.id); await kanal.delete().catch(() => {}); }
    }
  },
};
