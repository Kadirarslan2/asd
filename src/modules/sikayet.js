// Şikayet sistemi: üye ya da oyuncu şikayeti (kanıtlı), mesaja sağ tıkla "Şikayet et".
// Şikayetler yetkili kanalına düşer: Üstlen → Çözüldü / Geçersiz; şikayet edene sonuç bildirilir.
const { SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const rcon = require('../core/rcon');
const yetki = require('../core/yetki');
const { E, R, yanit, hata, zd } = require('../core/util');

const bekleme = new Map();
const butonlar = (id, durum) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`sikayet:ustlen:${id}`).setLabel(durum === 'acik' ? 'Üstlen' : 'Üstlenildi').setEmoji('🙋').setStyle(ButtonStyle.Primary).setDisabled(durum !== 'acik'),
  new ButtonBuilder().setCustomId(`sikayet:coz:${id}`).setLabel('Çözüldü').setEmoji('✅').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`sikayet:gecersiz:${id}`).setLabel('Geçersiz').setEmoji('🚫').setStyle(ButtonStyle.Secondary))];

async function gonder(i, veri) {
  const g = i.guild, k = g.channels.cache.get(db.ayar(g.id, 'kanal.sikayet'));
  if (!k) return hata(i, 'Şikayet kanalı ayarlı değil; yetkililere haber ver.');
  const kalan = (bekleme.get(i.user.id) || 0) + 2 * 6e4 - Date.now();
  if (kalan > 0) return hata(i, `Çok sık şikayet gönderiyorsun. ${Math.ceil(kalan / 1000)} sn sonra tekrar dene.`);
  bekleme.set(i.user.id, Date.now());
  const no = db.ayar(g.id, 'sikayet.sayac', 0) + 1;
  db.ayarYaz(g.id, 'sikayet.sayac', no);
  const id = db.belge.ekle(g.id, 'sikayet', { no, durum: 'acik', ...veri }, i.user.id);
  const e = E(`🚨 Şikayet #${no}`, veri.sebep, R.hata).addFields(
    { name: 'Şikayet eden', value: `${i.user}`, inline: true },
    ...(veri.hedef ? [{ name: 'Şikayet edilen', value: `<@${veri.hedef}>${veri.hedefSicil ? ` • sicil: ${veri.hedefSicil}` : ''}`, inline: true }] : []),
    ...(veri.oyuncu ? [{ name: 'Oyuncu', value: `\`${veri.oyuncu}\`${veri.cevrimici ? ' 🟢 oyunda' : ''}`, inline: true }] : []),
    ...(veri.mesaj ? [{ name: 'Mesaj', value: `${veri.mesaj.slice(0, 900)}\n[Mesaja git](${veri.link})` }] : []));
  if (veri.oyuncu) e.setThumbnail(cizim.kafaUrl(veri.oyuncu));
  if (veri.kanit) e.setImage(veri.kanit);
  await k.send({ embeds: [e], components: butonlar(id, 'acik') });
  return yanit(i, E(null, `✅ Şikayetin (#${no}) yetkililere iletildi. Sonuç sana bildirilecek.`, R.ok), true);
}

module.exports = {
  ad: 'sikayet',
  komutlar: [
    { data: new SlashCommandBuilder().setName('şikayet').setDescription('Bir üyeyi ya da oyuncuyu yetkililere şikayet et')
        .addStringOption((o) => o.setName('sebep').setDescription('Ne oldu?').setRequired(true).setMaxLength(800))
        .addUserOption((o) => o.setName('üye').setDescription('Discord üyesi'))
        .addStringOption((o) => o.setName('oyuncu').setDescription('Minecraft adı').setMaxLength(17))
        .addAttachmentOption((o) => o.setName('kanıt').setDescription('Ekran görüntüsü')),
      calistir: async (i) => {
        const u = i.options.getUser('üye'), nick = i.options.getString('oyuncu')?.trim(), kanit = i.options.getAttachment('kanıt');
        if (!u && !nick) return hata(i, 'Bir `üye` ya da `oyuncu` belirt.');
        if (u?.id === i.user.id) return hata(i, 'Kendini şikayet edemezsin.');
        if (nick && !rcon.nickGecerli(nick)) return hata(i, 'Geçersiz Minecraft adı.');
        const cevrimici = nick && rcon.hazir() ? await rcon.cevrimici(nick).catch(() => false) : false;
        const sicil = u ? db.belge.refHepsi(i.guild.id, 'ceza', u.id).length + db.belge.refHepsi(i.guild.id, 'uyari', u.id).length : 0;
        return gonder(i, { sebep: i.options.getString('sebep'), hedef: u?.id || db.mcBul(i.guild.id, nick || '')?.user || null, hedefSicil: sicil || null, oyuncu: nick || null, cevrimici, kanit: kanit?.contentType?.startsWith('image/') ? kanit.url : null });
      } },
    { menu: true, data: new ContextMenuCommandBuilder().setName('Mesajı şikayet et').setType(ApplicationCommandType.Message),
      calistir: (i) => {
        const m = i.targetMessage;
        if (m.author.id === i.user.id) return hata(i, 'Kendi mesajını şikayet edemezsin.');
        if (m.author.bot) return hata(i, 'Bot mesajları şikayet edilemez.');
        return gonder(i, { sebep: 'Mesaj şikayeti', hedef: m.author.id, mesaj: m.content || '(içerik yok / ek)', link: m.url, kanit: m.attachments.find((a) => a.contentType?.startsWith('image/'))?.url || null });
      } },
  ],
  bilesenler: {
    sikayet: async (i, [islem, id]) => {
      const h = yetki.gerek(i, 'sikayet'); if (h) return hata(i, h);
      const s = db.belge.al(id);
      if (!s || s.tur !== 'sikayet' || s.durum === 'kapali') return i.update({ components: [] });
      const e = i.message.embeds[0];
      if (islem === 'ustlen') {
        db.belge.yaz(s.id, { ...s, durum: 'ustlenildi', ilgilenen: i.user.id });
        return i.update({ embeds: [{ ...e.toJSON(), color: R.altin, footer: { text: `🙋 ${i.member.displayName} ilgileniyor` } }], components: butonlar(id, 'ustlenildi') });
      }
      const cozuldu = islem === 'coz';
      db.belge.yaz(s.id, { ...s, durum: 'kapali', sonuc: islem, ilgilenen: s.ilgilenen || i.user.id });
      db.belge.ekle(i.guild.id, 'islem', { is: 'ticket', sikayet: s.no }, i.user.id);
      const sikayetci = await i.client.users.fetch(s.ref).catch(() => null);
      await sikayetci?.send({ embeds: [E(`Şikayet #${s.no}`, cozuldu ? `✅ **${i.guild.name}** sunucusundaki şikayetin incelendi ve gereği yapıldı. Teşekkürler!` : `🚫 **${i.guild.name}** sunucusundaki şikayetin incelendi; işlem gerektiren bir durum bulunmadı.`, cozuldu ? R.ok : R.gri)] }).catch(() => {});
      return i.update({ embeds: [{ ...e.toJSON(), color: cozuldu ? R.ok : R.gri, footer: { text: `${cozuldu ? '✅ Çözüldü' : '🚫 Geçersiz'} • ${i.member.displayName}` }, timestamp: new Date().toISOString() }], components: [] });
    },
  },
};
