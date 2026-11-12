// Destek talepleri: panel butonu → özel kanal; kapatınca döküm dosyası log kanalına gider
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const db = require('../core/db');
const { log } = require('../core/log');
const { E, R, hata, tamam } = require('../core/util');

module.exports = {
  ad: 'ticket',
  komutlar: [
    { data: new SlashCommandBuilder().setName('ticket-panel').setDescription('Bu kanala destek talebi paneli gönderir').setDefaultMemberPermissions(P.ManageGuild)
        .addStringOption((o) => o.setName('mesaj').setDescription('Panel açıklaması').setMaxLength(500)),
      calistir: async (i) => {
        await i.channel.send({ embeds: [E('🎫 Destek', i.options.getString('mesaj') || 'Yetkililerle özel olarak görüşmek için aşağıdaki butona bas. Sana özel bir kanal açılacak.')],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:ac').setLabel('Talep aç').setEmoji('📩').setStyle(ButtonStyle.Primary))] });
        return tamam(i, 'Panel gönderildi.', true);
      } },
  ],
  bilesenler: {
    ticket: async (i, [islem]) => {
      const g = i.guild;
      if (islem === 'ac') {
        const acik = db.belge.refHepsi(g.id, 'ticket', i.user.id).find((t) => g.channels.cache.has(t.kanal));
        if (acik) return hata(i, `Zaten açık bir talebin var: <#${acik.kanal}>`);
        await i.deferReply({ flags: 64 });
        const destek = db.ayar(g.id, 'rol.destek');
        const no = (db.ayar(g.id, 'ticket.sayac', 0) || 0) + 1;
        db.ayarYaz(g.id, 'ticket.sayac', no);
        const kat = g.channels.cache.get(db.ayar(g.id, 'kategori.ticket'));
        const kanal = await g.channels.create({
          name: `talep-${String(no).padStart(4, '0')}`, type: ChannelType.GuildText, parent: kat?.id, topic: `${i.user.tag} (${i.user.id})`,
          permissionOverwrites: [{ id: g.roles.everyone.id, deny: [P.ViewChannel] }, { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory] },
            { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory] },
            ...(destek && g.roles.cache.has(destek) ? [{ id: destek, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }] : [])],
        });
        db.belge.ekle(g.id, 'ticket', { kanal: kanal.id, no }, i.user.id);
        await kanal.send({ content: `${i.user}${destek ? ` <@&${destek}>` : ''}`, allowedMentions: { users: [i.user.id], roles: destek ? [destek] : [] },
          embeds: [E(`🎫 Talep #${no}`, 'Sorununu ayrıntılı şekilde yaz; bir yetkili en kısa sürede ilgilenecek.')],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:kapat').setLabel('Talebi kapat').setEmoji('🔒').setStyle(ButtonStyle.Danger))] });
        return i.editReply({ embeds: [E(null, `✅ Talebin açıldı: ${kanal}`, R.ok)] });
      }
      // kapat
      const t = db.belge.liste(g.id, 'ticket').find((x) => x.kanal === i.channelId);
      if (!t) return hata(i, 'Bu kanal bir talep kanalı değil.');
      await i.reply({ embeds: [E(null, '🔒 Talep kapatılıyor, döküm kaydediliyor…', R.gri)] });
      const mesajlar = [...(await i.channel.messages.fetch({ limit: 100 })).values()].reverse();
      const dokum = mesajlar.map((m) => `[${new Date(m.createdTimestamp).toLocaleString('tr-TR')}] ${m.author.tag}: ${m.content}${m.attachments.size ? ` [${m.attachments.map((a) => a.url).join(' ')}]` : ''}`).join('\n');
      await log(g, E(`🎫 Talep #${t.no} kapatıldı`, `**Açan:** <@${t.ref}>\n**Kapatan:** ${i.user}\n**Mesaj:** ${mesajlar.length}`, R.gri),
        [new AttachmentBuilder(Buffer.from(dokum || '(boş)', 'utf8'), { name: `talep-${t.no}.txt` })]);
      db.belge.sil(t.id);
      setTimeout(() => i.channel.delete().catch(() => {}), 4000);
    },
  },
};
