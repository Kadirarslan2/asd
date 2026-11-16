// Destek talepleri: panel → konu seçimi → özel kanal; kapatınca döküm dosyası log kanalına gider
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, OverwriteType, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const { log } = require('../core/log');
const { E, R, hata, tamam } = require('../core/util');

const KONULAR = { destek: ['🛟', 'Genel destek', 'Oyunla ya da Discord\'la ilgili yardım'], sikayet: ['🚨', 'Oyuncu şikâyeti', 'Hile, küfür, grief vb. bildir'], magaza: ['🛒', 'Mağaza / ödeme', 'Satın alım ve teslimat sorunları'], hata: ['🐛', 'Hata bildirimi', 'Sunucuda bulduğun bir hata'], itiraz: ['⚖️', 'Ceza itirazı', 'Ban ya da susturma itirazı'] };
const panelGonder = async (kanal, mesaj) => kanal.send({
  files: [await cizim.bannerKart({ ust: 'DESTEK MERKEZİ', baslik: 'Yardım mı lazım?', alt: mesaj || 'Aşağıdan konunu seç; sana özel bir kanal açılsın', logo: true, dosya: 'destek' })],
  components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket:ac').setPlaceholder('📩 Talep açmak için bir konu seç')
    .addOptions(Object.entries(KONULAR).map(([value, [emoji, label, description]]) => ({ value, emoji, label, description }))))] });

module.exports = {
  ad: 'ticket',
  panelGonder, KONULAR,
  komutlar: [
    { data: new SlashCommandBuilder().setName('ticket-panel').setDescription('Bu kanala destek talebi paneli gönderir').setDefaultMemberPermissions(P.ManageGuild)
        .addStringOption((o) => o.setName('mesaj').setDescription('Panel açıklaması').setMaxLength(90)),
      calistir: async (i) => { await i.deferReply({ flags: 64 }); await panelGonder(i.channel, i.options.getString('mesaj')); return i.editReply('Panel gönderildi.'); } },
  ],
  bilesenler: {
    ticket: async (i, [islem]) => {
      const g = i.guild;
      if (islem === 'ac') {
        const konu = KONULAR[i.values?.[0]] ? i.values[0] : 'destek';
        const acik = db.belge.refHepsi(g.id, 'ticket', i.user.id).find((t) => g.channels.cache.has(t.kanal));
        if (acik) return hata(i, `Zaten açık bir talebin var: <#${acik.kanal}>`);
        await i.deferReply({ flags: 64 });
        const destek = db.ayar(g.id, 'rol.destek'), destekVar = destek && g.roles.cache.has(destek);
        const no = db.ayar(g.id, 'ticket.sayac', 0) + 1;
        db.ayarYaz(g.id, 'ticket.sayac', no);
        const kat = g.channels.cache.get(db.ayar(g.id, 'kategori.ticket'));
        const kanal = await g.channels.create({
          name: `${KONULAR[konu][0]}・talep-${String(no).padStart(4, '0')}`, type: ChannelType.GuildText, parent: kat && kat.children.cache.size < 50 ? kat.id : undefined, topic: `${KONULAR[konu][1]} • ${i.user.tag} (${i.user.id})`,
          permissionOverwrites: [{ id: g.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
            { id: i.user.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory, P.EmbedLinks] },
            { id: i.client.user.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
            ...(destekVar ? [{ id: destek, type: OverwriteType.Role, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] }] : [])],
        });
        db.belge.ekle(g.id, 'ticket', { kanal: kanal.id, no, konu }, i.user.id);
        const mc = db.uye(g.id, i.user.id).mc_nick;
        await kanal.send({ content: `${i.user}${destekVar ? ` <@&${destek}>` : ''}`, allowedMentions: { users: [i.user.id], roles: destekVar ? [destek] : [] },
          embeds: [E(`${KONULAR[konu][0]} Talep #${no} — ${KONULAR[konu][1]}`, 'Sorununu ayrıntılı şekilde yaz; varsa ekran görüntüsü ekle. Bir yetkili en kısa sürede ilgilenecek.').addFields({ name: 'Minecraft hesabı', value: mc ? `\`${mc}\`` : 'Bağlı değil', inline: true })],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:kapat').setLabel('Talebi kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger))] });
        return i.editReply({ embeds: [E(null, `✅ Talebin açıldı: ${kanal}`, R.ok)] });
      }
      // kapat
      const t = db.belge.liste(g.id, 'ticket').find((x) => x.kanal === i.channelId);
      if (!t) return hata(i, 'Bu kanal bir talep kanalı değil.');
      await i.reply({ embeds: [E(null, '🔒 Talep kapatılıyor, döküm kaydediliyor…', R.gri)] });
      const mesajlar = [...(await i.channel.messages.fetch({ limit: 100 })).values()].reverse();
      const dokum = mesajlar.map((m) => `[${new Date(m.createdTimestamp).toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content}${m.attachments.size ? ` [${m.attachments.map((a) => a.url).join(' ')}]` : ''}`).join('\n');
      await log(g, E(`🎫 Talep #${t.no} kapatıldı`, `**Konu:** ${KONULAR[t.konu]?.[1] || '—'}\n**Açan:** <@${t.ref}>\n**Kapatan:** ${i.user}\n**Mesaj:** ${mesajlar.length}`, R.gri),
        [new AttachmentBuilder(Buffer.from(dokum || '(boş)', 'utf8'), { name: `talep-${t.no}.txt` })]);
      db.belge.sil(t.id);
      setTimeout(() => i.channel.delete().catch(() => {}), 4000);
    },
  },
};
