// Çekiliş: butonla katılım, isteğe bağlı seviye şartı, süre dolunca otomatik çekim, yeniden çekme
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const { E, R, hata, tamam, sureCoz, zd, karistir } = require('../core/util');

function gorunum(c) {
  const bitti = Boolean(c.bitti);
  const e = E(`🎉 ${c.odul}`, `${bitti ? `**Kazanan${c.kazananlar.length > 1 ? 'lar' : ''}:** ${c.kazananlar.map((id) => `<@${id}>`).join(', ') || 'Katılım olmadı'}` : `Katılmak için butona bas!\n**Bitiş:** ${zd(c.bitis)} (${zd(c.bitis, 'f')})`}\n**Kazanan sayısı:** ${c.adet}${c.seviye ? `\n**Şart:** en az ${c.seviye}. seviye` : ''}\n**Düzenleyen:** <@${c.kurucu}>\n**Katılımcı:** ${c.katilan.length}`, bitti ? R.gri : R.altin);
  return { embeds: [e], components: bitti ? [] : [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`cekilis:${c.id}`).setLabel(`Katıl (${c.katilan.length})`).setEmoji('🎉').setStyle(ButtonStyle.Success))] };
}
async function bitir(client, c) {
  c.kazananlar = karistir(c.katilan).slice(0, c.adet);
  c.bitti = Date.now();
  db.belge.yaz(c.id, c);
  const kanal = client.channels.cache.get(c.kanal);
  if (!kanal) return;
  await kanal.messages.edit(c.mesaj, gorunum(c)).catch(() => {});
  await kanal.send(c.kazananlar.length ? { content: `🎉 Tebrikler ${c.kazananlar.map((id) => `<@${id}>`).join(', ')}! **${c.odul}** kazandınız.`, reply: { messageReference: c.mesaj, failIfNotExists: false } } : { content: `**${c.odul}** çekilişine kimse katılmadı.` }).catch(() => {});
}

module.exports = {
  ad: 'cekilis',
  komutlar: [
    { data: new SlashCommandBuilder().setName('çekiliş').setDescription('Çekiliş sistemi').setDefaultMemberPermissions(P.ManageGuild)
        .addSubcommand((s) => s.setName('başlat').setDescription('Yeni çekiliş başlatır')
          .addStringOption((o) => o.setName('ödül').setDescription('Ödül').setRequired(true).setMaxLength(200))
          .addStringOption((o) => o.setName('süre').setDescription('Örn: 30dk, 2s, 3g').setRequired(true))
          .addIntegerOption((o) => o.setName('kazanan').setDescription('Kazanan sayısı').setMinValue(1).setMaxValue(20))
          .addIntegerOption((o) => o.setName('seviye').setDescription('Katılmak için gereken en düşük seviye').setMinValue(1)))
        .addSubcommand((s) => s.setName('bitir').setDescription('Çekilişi hemen bitirir').addStringOption((o) => o.setName('mesaj-id').setDescription('Çekiliş mesajının ID\'si').setRequired(true)))
        .addSubcommand((s) => s.setName('yeniden').setDescription('Bitmiş çekilişte yeni kazanan çeker').addStringOption((o) => o.setName('mesaj-id').setDescription('Çekiliş mesajının ID\'si').setRequired(true))),
      calistir: async (i) => {
        const alt = i.options.getSubcommand();
        if (alt === 'başlat') {
          const ms = sureCoz(i.options.getString('süre'));
          if (!ms || ms < 10_000 || ms > 60 * 864e5) return hata(i, 'Geçersiz süre. Örnek: `30dk`, `2s`, `3g`.');
          const c = { odul: i.options.getString('ödül'), adet: i.options.getInteger('kazanan') || 1, seviye: i.options.getInteger('seviye') || 0, bitis: Date.now() + ms, kurucu: i.user.id, kanal: i.channelId, katilan: [] };
          c.id = db.belge.ekle(i.guild.id, 'cekilis', c);
          await i.reply(gorunum(c));
          c.mesaj = (await i.fetchReply()).id;
          return db.belge.yaz(c.id, c, c.mesaj);
        }
        const c = db.belge.ref('cekilis', i.options.getString('mesaj-id').trim());
        if (!c || c.guild !== i.guild.id) return hata(i, 'Bu mesaj ID\'siyle bir çekiliş bulunamadı.');
        if (alt === 'bitir') {
          if (c.bitti) return hata(i, 'Bu çekiliş zaten bitti.');
          await bitir(i.client, c);
          return tamam(i, 'Çekiliş bitirildi.', true);
        }
        if (!c.bitti) return hata(i, 'Çekiliş henüz bitmedi.');
        const aday = c.katilan.filter((id) => !c.kazananlar.includes(id));
        if (!aday.length) return hata(i, 'Yeniden çekilecek başka katılımcı yok.');
        const yeni = karistir(aday)[0];
        c.kazananlar = [yeni]; db.belge.yaz(c.id, c);
        return i.reply({ content: `🎉 Yeni kazanan: <@${yeni}>! **${c.odul}**` });
      } },
  ],
  bilesenler: {
    cekilis: async (i, [id]) => {
      const c = db.belge.al(id);
      if (!c || c.bitti) return hata(i, 'Bu çekiliş sona erdi.');
      if (c.katilan.includes(i.user.id)) {
        c.katilan = c.katilan.filter((x) => x !== i.user.id);
        db.belge.yaz(c.id, c);
        await i.update(gorunum(c));
        return i.followUp({ content: 'Çekilişten ayrıldın.', flags: 64 });
      }
      if (c.seviye && db.uye(i.guild.id, i.user.id).seviye < c.seviye) return hata(i, `Katılmak için en az **${c.seviye}. seviye** olmalısın.`);
      c.katilan.push(i.user.id);
      db.belge.yaz(c.id, c);
      return i.update(gorunum(c));
    },
  },
  async hizliTik(ctx) {
    for (const c of db.belge.hepsi('cekilis')) {
      if (!c.bitti && c.bitis <= Date.now()) await bitir(ctx.client, c);
      else if (c.bitti && Date.now() - c.bitti > 7 * 864e5) db.belge.sil(c.id); // yeniden çekme hakkı 7 gün
    }
  },
};
