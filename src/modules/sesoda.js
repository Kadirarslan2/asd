// Özel ses odaları: "➕ Oda Oluştur" kanalına giren üyeye kendi odası açılır ve oraya taşınır.
// Odanın sohbetine resimli kontrol paneli düşer; oda boşalınca kendiliğinden silinir.
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, OverwriteType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const { log } = require('../core/log');
const { E, R, hata, tamam } = require('../core/util');

const sonAcilis = new Map(), sonIsim = new Map(), kuruluyor = new Set();
const SAHIP_IZIN = { ViewChannel: true, Connect: true, Speak: true, ManageChannels: true, MoveMembers: true, MuteMembers: true };
const GEREKLI = [[P.ManageChannels, 'Kanalları Yönet'], [P.MoveMembers, 'Üyeleri Taşı'], [P.ManageRoles, 'Rolleri Yönet'], [P.Connect, 'Bağlan'], [P.ViewChannel, 'Kanalı Gör']];

async function odaAc(guild, member, parentId) {
  const ben = guild.members.me;
  const eksik = GEREKLI.filter(([izin]) => !ben.permissions.has(izin)).map(([, ad]) => ad);
  if (eksik.length) throw new Error(`Botun şu yetkileri eksik: ${eksik.join(', ')}`);
  const parent = parentId && guild.channels.cache.get(parentId);
  const kanal = await guild.channels.create({
    name: `🔊 ${member.displayName}`.slice(0, 90), type: ChannelType.GuildVoice,
    parent: parent && parent.children.cache.size < 50 ? parent.id : undefined, // dolu kategoriye kanal açılamaz
    permissionOverwrites: [
      { id: member.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.Connect, P.Speak, P.ManageChannels, P.MoveMembers, P.MuteMembers] },
      { id: ben.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.Connect, P.ManageChannels, P.MoveMembers, P.ManageRoles, P.SendMessages] },
    ],
    reason: `${member.user.tag} için özel oda`,
  });
  const id = db.belge.ekle(guild.id, 'oda', { sahip: member.id, acilis: Date.now() }, kanal.id);
  return { kanal, id };
}
const herkes = (kanal) => kanal.permissionOverwrites.cache.get(kanal.guild.id);
const kilitliMi = (kanal) => Boolean(herkes(kanal)?.deny.has(P.Connect));
const gizliMi = (kanal) => Boolean(herkes(kanal)?.deny.has(P.ViewChannel));
const satir = (...b) => new ActionRowBuilder().addComponents(...b);

async function panel(kanal, oda) {
  const sahip = kanal.guild.members.cache.get(oda.sahip);
  const b = (id, ad, emoji, stil = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`oda:${id}`).setLabel(ad).setEmoji(emoji).setStyle(stil);
  const sec = (id, yer) => satir(new UserSelectMenuBuilder().setCustomId(`oda:${id}`).setPlaceholder(yer).setMinValues(1).setMaxValues(1));
  return {
    files: [await cizim.odaKart({ ad: kanal.name.replace(/^🔊\s*/, ''), sahip: sahip?.displayName || 'Sahipsiz', sahipAvatar: sahip?.displayAvatarURL({ extension: 'png', size: 128 }), kisi: kanal.members.filter((m) => !m.user.bot).size, limit: kanal.userLimit, kilitli: kilitliMi(kanal), gizli: gizliMi(kanal) })],
    components: [
      satir(b('kilit', kilitliMi(kanal) ? 'Kilidi aç' : 'Kilitle', kilitliMi(kanal) ? '🔓' : '🔒', kilitliMi(kanal) ? ButtonStyle.Success : ButtonStyle.Secondary), b('gizle', gizliMi(kanal) ? 'Göster' : 'Gizle', '👁️'), b('limit', 'Limit', '👥'), b('isim', 'İsim', '✏️'), b('sahiplen', 'Sahiplen', '👑')),
      sec('izin', '✅ Üyeye izin ver (kilitli/gizli odaya girebilsin)'), sec('at', '🚫 Üyeyi odadan at'), sec('devret', '👑 Odayı devret'),
    ],
  };
}
async function panelYenile(kanal, oda) {
  if (!oda.panel) return;
  await kanal.messages.edit(oda.panel, { ...(await panel(kanal, oda)), attachments: [] }).catch(() => {});
}

// Etkileşimin ait olduğu odayı bulur: panel butonlarında bulunduğu kanal, komutlarda üyenin ses kanalı
function odaBul(i, sahipSart = true) {
  const kanal = db.belge.ref('oda', i.channelId) ? i.channel : i.member.voice.channel;
  const oda = kanal && db.belge.ref('oda', kanal.id);
  if (!oda) { hata(i, 'Bir özel odada değilsin. Önce **➕ Oda Oluştur** kanalına gir.'); return null; }
  if (sahipSart && oda.sahip !== i.user.id && !i.memberPermissions.has(P.ManageChannels)) { hata(i, `Bu odayı yalnızca sahibi (<@${oda.sahip}>) yönetebilir.`); return null; }
  return { kanal, oda };
}
async function islem(i, tur, deger) {
  const o = odaBul(i, tur !== 'sahiplen');
  if (!o) return;
  const { kanal, oda } = o, g = i.guild;
  let mesaj;
  if (tur === 'kilit') {
    const kilitli = kilitliMi(kanal);
    await kanal.permissionOverwrites.edit(g.id, { Connect: kilitli ? null : false });
    mesaj = kilitli ? '🔓 Oda herkese açıldı.' : '🔒 Oda kilitlendi. İçeridekiler kalır; yeni girecek kişiye alttaki menüden izin ver.';
  } else if (tur === 'gizle') {
    const gizli = gizliMi(kanal);
    await kanal.permissionOverwrites.edit(g.id, { ViewChannel: gizli ? null : false });
    mesaj = gizli ? '👁️ Oda artık herkese görünür.' : '🙈 Oda gizlendi; yalnızca izin verdiklerin görebilir.';
  } else if (tur === 'limit') {
    await kanal.setUserLimit(deger);
    mesaj = deger ? `👥 Kişi limiti **${deger}** oldu.` : '👥 Kişi limiti kaldırıldı.';
  } else if (tur === 'isim') {
    const kalan = (sonIsim.get(kanal.id) || 0) + 5 * 6e4 - Date.now();
    if (kalan > 0) return hata(i, `Oda adı 5 dakikada bir değişebilir (Discord sınırı). ${Math.ceil(kalan / 1000)} sn sonra tekrar dene.`);
    sonIsim.set(kanal.id, Date.now());
    await kanal.setName(`🔊 ${deger}`.slice(0, 90));
    mesaj = `✏️ Oda adı **${deger}** oldu.`;
  } else if (tur === 'sahiplen') {
    if (oda.sahip === i.user.id) return hata(i, 'Bu oda zaten senin.');
    if (kanal.members.has(oda.sahip)) return hata(i, `Oda sahibi (<@${oda.sahip}>) hâlâ odada.`);
    if (!kanal.members.has(i.user.id)) return hata(i, 'Sahiplenmek için odada olmalısın.');
    await sahipDegistir(kanal, oda, i.user.id);
    mesaj = `👑 Odanın yeni sahibi ${i.user}.`;
  } else {
    const hedef = deger; // GuildMember
    if (!hedef || hedef.user.bot) return hata(i, 'Geçerli bir üye seç.');
    if (hedef.id === i.user.id) return hata(i, 'Kendini seçemezsin.');
    if (tur === 'izin') {
      await kanal.permissionOverwrites.edit(hedef.id, { ViewChannel: true, Connect: true });
      mesaj = `✅ ${hedef} artık odaya girebilir.`;
    } else if (tur === 'at') {
      if (hedef.permissions.has(P.ManageChannels)) return hata(i, 'Yetkilileri odadan atamazsın.');
      await kanal.permissionOverwrites.edit(hedef.id, { Connect: false });
      if (hedef.voice.channelId === kanal.id) await hedef.voice.disconnect().catch(() => {});
      mesaj = `🚫 ${hedef} odadan atıldı ve geri giremez.`;
    } else {
      if (hedef.voice.channelId !== kanal.id) return hata(i, 'Odayı yalnızca içerideki birine devredebilirsin.');
      await sahipDegistir(kanal, oda, hedef.id);
      mesaj = `👑 Oda ${hedef} kullanıcısına devredildi.`;
    }
  }
  await tamam(i, mesaj, true);
  await panelYenile(kanal, db.belge.ref('oda', kanal.id) || oda);
}
async function sahipDegistir(kanal, oda, yeniId) {
  if (oda.sahip && oda.sahip !== yeniId) await kanal.permissionOverwrites.delete(oda.sahip).catch(() => {});
  await kanal.permissionOverwrites.edit(yeniId, SAHIP_IZIN);
  oda.sahip = yeniId;
  db.belge.yaz(oda.id, oda);
}
async function odaSil(kanal, oda) {
  db.belge.sil(oda.id);
  await kanal?.delete('Özel oda boşaldı').catch(() => {});
}

// Oluşturma kanalındaki üyeye oda açar ve taşır
async function uyeIcinAc(member, olusturKanal) {
  const g = member.guild, anahtar = `${g.id}:${member.id}`;
  if (kuruluyor.has(anahtar)) return;
  if (Date.now() - (sonAcilis.get(anahtar) || 0) < 5000) { await member.voice.disconnect().catch(() => {}); return; } // art arda oda açmayı engelle
  kuruluyor.add(anahtar); sonAcilis.set(anahtar, Date.now());
  try {
    const { kanal, id } = await odaAc(g, member, olusturKanal.parentId);
    const tasindi = await member.voice.setChannel(kanal).then(() => true, () => false);
    if (!tasindi) { await odaSil(kanal, { id }); return; } // üye bu arada çıkmış
    const oda = db.belge.al(id);
    const m = await kanal.send({ content: `${member} odan hazır! Aşağıdan yönetebilirsin.`, ...(await panel(kanal, oda)) }).catch(() => null);
    if (m) db.belge.yaz(id, { ...oda, panel: m.id });
  } catch (e) {
    console.error(`[sesoda] ${member.user.tag} için oda açılamadı:`, e.message);
    await log(g, E('⚠️ Özel oda açılamadı', `${member} için oda açılamadı.\n**Sebep:** ${e.message}\n\nBotun rolünde **Kanalları Yönet**, **Üyeleri Taşı** ve **Rolleri Yönet** yetkileri olmalı ve bot rolü üst sıralarda durmalı.`, R.hata));
    await member.send(`**${g.name}**: özel odan açılamadı (${e.message}). Yetkililere haber verildi.`).catch(() => {});
  } finally { kuruluyor.delete(anahtar); }
}

module.exports = {
  ad: 'sesoda',
  komutlar: [
    { data: new SlashCommandBuilder().setName('oda').setDescription('Özel ses odanı yönet')
        .addSubcommand((s) => s.setName('panel').setDescription('Kontrol panelini yeniden gönderir'))
        .addSubcommand((s) => s.setName('kilit').setDescription('Odayı kilitler/açar'))
        .addSubcommand((s) => s.setName('gizle').setDescription('Odayı gizler/gösterir'))
        .addSubcommand((s) => s.setName('limit').setDescription('Kişi limitini ayarlar').addIntegerOption((o) => o.setName('kişi').setDescription('0 = sınırsız').setRequired(true).setMinValue(0).setMaxValue(99)))
        .addSubcommand((s) => s.setName('isim').setDescription('Oda adını değiştirir').addStringOption((o) => o.setName('ad').setDescription('Yeni ad').setRequired(true).setMaxLength(80)))
        .addSubcommand((s) => s.setName('izin').setDescription('Bir üyenin kilitli/gizli odaya girmesine izin verir').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('at').setDescription('Bir üyeyi odadan atar').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('devret').setDescription('Oda sahipliğini devreder').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('sahiplen').setDescription('Sahibi çıkmış odayı sahiplenir')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand();
        if (alt === 'panel') {
          const o = odaBul(i); if (!o) return;
          await i.deferReply({ flags: 64 });
          const m = await o.kanal.send(await panel(o.kanal, o.oda));
          if (o.oda.panel) o.kanal.messages.delete(o.oda.panel).catch(() => {});
          db.belge.yaz(o.oda.id, { ...o.oda, panel: m.id });
          return i.editReply('Panel odanın sohbetine gönderildi.');
        }
        return islem(i, alt, alt === 'limit' ? i.options.getInteger('kişi') : alt === 'isim' ? i.options.getString('ad').trim() : i.options.getMember('üye'));
      } },
  ],
  bilesenler: {
    oda: (i, [tur]) => {
      if (i.isUserSelectMenu()) return islem(i, tur, i.members.first());
      if (tur === 'limit' || tur === 'isim') {
        if (!i.isModalSubmit()) {
          if (!odaBul(i)) return;
          return i.showModal(new ModalBuilder().setCustomId(`oda:${tur}`).setTitle(tur === 'limit' ? 'Kişi limiti' : 'Oda adı').addComponents(satir(
            new TextInputBuilder().setCustomId('deger').setLabel(tur === 'limit' ? 'Limit (0-99, 0 = sınırsız)' : 'Yeni oda adı').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(tur === 'limit' ? 2 : 80))));
        }
        const d = i.fields.getTextInputValue('deger').trim();
        if (tur === 'limit' && !/^\d{1,2}$/.test(d)) return hata(i, '0-99 arası bir sayı gir.');
        if (!d) return hata(i, 'Boş bırakılamaz.');
        return islem(i, tur, tur === 'limit' ? Number(d) : d);
      }
      return islem(i, tur);
    },
  },
  olaylar: {
    voiceStateUpdate: async (eski, yeni) => {
      const g = yeni.guild, olustur = db.ayar(g.id, 'ses.olustur');
      // 1) Oluşturma kanalına giriş → yeni oda
      if (olustur && yeni.channelId === olustur && eski.channelId !== olustur && yeni.member && !yeni.member.user.bot) await uyeIcinAc(yeni.member, yeni.channel);
      // 2) Bir odadan çıkış → boşsa sil, sahibi çıktıysa sahipliği sıradaki kişiye ver
      if (eski.channelId && eski.channelId !== yeni.channelId) {
        const oda = db.belge.ref('oda', eski.channelId), kanal = eski.channel || g.channels.cache.get(eski.channelId);
        if (!oda) return;
        if (!kanal) { db.belge.sil(oda.id); return; }
        const insanlar = kanal.members.filter((m) => !m.user.bot);
        if (insanlar.size === 0) return odaSil(kanal, oda);
        if (oda.sahip === eski.id) {
          const yeniSahip = insanlar.first();
          await sahipDegistir(kanal, oda, yeniSahip.id).catch(() => {});
          await kanal.send({ embeds: [E(null, `👑 Oda sahibi ayrıldı; yeni sahip ${yeniSahip}.`, R.bilgi)] }).catch(() => {});
        }
        await panelYenile(kanal, db.belge.ref('oda', kanal.id) || oda);
      }
      // 3) Bir odaya giriş → paneldeki kişi sayısını güncelle
      if (yeni.channelId && yeni.channelId !== eski.channelId) { const oda = db.belge.ref('oda', yeni.channelId); if (oda?.panel && yeni.channel) await panelYenile(yeni.channel, oda); }
    },
    channelDelete: (k) => { const oda = db.belge.ref('oda', k.id); if (oda) db.belge.sil(oda.id); },
  },
  // Açılışta: bot kapalıyken boşalmış odaları temizle, oluşturma kanalında bekleyenlere oda aç
  async hazir(ctx) {
    await module.exports.tik(ctx);
    for (const g of ctx.client.guilds.cache.values()) {
      const kanal = g.channels.cache.get(db.ayar(g.id, 'ses.olustur'));
      for (const m of kanal?.members?.values() || []) if (!m.user.bot) await uyeIcinAc(m, kanal);
    }
  },
  async tik(ctx) {
    for (const oda of db.belge.hepsi('oda')) {
      const kanal = ctx.client.channels.cache.get(oda.ref);
      if (!kanal) { if (ctx.client.guilds.cache.has(oda.guild)) db.belge.sil(oda.id); continue; }
      if (kanal.members.filter((m) => !m.user.bot).size === 0 && Date.now() - (oda.acilis || 0) > 60_000) await odaSil(kanal, oda);
    }
  },
};
