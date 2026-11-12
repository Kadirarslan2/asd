// Takım arama (LFG): ilan aç, butonla katıl; kadro dolunca herkes etiketlenir ve geçici ses odası açılır
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const { geciciOda } = require('./sesoda');
const { E, R, hata, zd } = require('../core/util');

const OYUNLAR = ['CS2', 'CS2 FACEIT', 'CS2 Premier', 'Valorant', 'League of Legends', 'Minecraft', 'Rust', 'GTA V / FiveM', 'PUBG', 'Apex Legends', 'Fortnite', 'Rocket League', 'Dota 2', 'Among Us'];

function gorunum(t) {
  const dolu = t.oyuncular.length >= t.kisi;
  const e = E(`🔎 ${t.oyun} — ${dolu ? 'kadro tamam!' : `${t.kisi - t.oyuncular.length} kişi aranıyor`}`,
    `${t.not ? `> ${t.not}\n\n` : ''}**Kadro (${t.oyuncular.length}/${t.kisi})**\n${t.oyuncular.map((id, k) => `${k === 0 ? '👑' : '•'} <@${id}>${t.bilgi?.[id] ? ` — ${t.bilgi[id]}` : ''}`).join('\n')}${t.ses ? `\n\n🔊 Oda: <#${t.ses}>` : ''}`, dolu ? R.ok : R.bilgi)
    .setFooter({ text: dolu ? 'İyi oyunlar!' : 'İlan 2 saat sonra kapanır' });
  const b = (id, ad, stil) => new ButtonBuilder().setCustomId(`takim:${id}:${t.id}`).setLabel(ad).setStyle(stil).setDisabled(t.kapali === true);
  return { embeds: [e], components: t.kapali ? [] : [new ActionRowBuilder().addComponents(b('katil', 'Katıl', ButtonStyle.Success).setDisabled(dolu), b('ayril', 'Ayrıl', ButtonStyle.Secondary), b('kapat', 'İlanı kapat', ButtonStyle.Danger))] };
}
// Üyenin FACEIT seviyesi bağlıysa ilanda adının yanında görünür
const bilgi = (g, id) => { const u = db.uye(g, id); return u.faceit_lvl ? `FACEIT ${u.faceit_lvl} (${u.faceit_elo})` : null; };

module.exports = {
  ad: 'takim',
  komutlar: [
    { data: new SlashCommandBuilder().setName('takım-ara').setDescription('Birlikte oynayacak takım arkadaşı ilanı açar')
        .addStringOption((o) => o.setName('oyun').setDescription('Oyun').setRequired(true).setAutocomplete(true).setMaxLength(40))
        .addIntegerOption((o) => o.setName('kişi').setDescription('Sen dahil toplam kadro (varsayılan 5)').setMinValue(2).setMaxValue(10))
        .addStringOption((o) => o.setName('not').setDescription('Rank, mikrofon şartı, saat vb.').setMaxLength(200)),
      tamamla: (i) => { const y = i.options.getFocused().toLowerCase(); return i.respond(OYUNLAR.filter((o) => o.toLowerCase().includes(y)).slice(0, 25).map((o) => ({ name: o, value: o }))); },
      calistir: async (i) => {
        if (db.belge.liste(i.guild.id, 'takim').some((t) => t.oyuncular[0] === i.user.id)) return hata(i, 'Zaten açık bir ilanın var; önce onu kapat.');
        const t = { oyun: i.options.getString('oyun'), kisi: i.options.getInteger('kişi') || 5, not: i.options.getString('not'), oyuncular: [i.user.id], bilgi: {}, kanal: i.channelId };
        const b = bilgi(i.guild.id, i.user.id); if (b) t.bilgi[i.user.id] = b;
        t.id = db.belge.ekle(i.guild.id, 'takim', t);
        await i.reply(gorunum(t));
      } },
  ],
  bilesenler: {
    takim: async (i, [islem, id]) => {
      const t = db.belge.al(id);
      if (!t || t.tur !== 'takim') return i.update({ components: [] });
      const var_ = t.oyuncular.includes(i.user.id), kurucu = t.oyuncular[0] === i.user.id;
      if (islem === 'kapat') {
        if (!kurucu && !i.memberPermissions.has('ManageMessages')) return hata(i, 'İlanı yalnızca açan kişi kapatabilir.');
        db.belge.sil(t.id);
        return i.update({ embeds: [E(null, `🔒 **${t.oyun}** ilanı kapatıldı.`, R.gri)], components: [] });
      }
      if (islem === 'katil') {
        if (var_) return hata(i, 'Zaten kadrodasın.');
        if (t.oyuncular.length >= t.kisi) return hata(i, 'Kadro dolu.');
        t.oyuncular.push(i.user.id);
        const b = bilgi(i.guild.id, i.user.id); if (b) t.bilgi[i.user.id] = b;
      } else {
        if (!var_) return hata(i, 'Kadroda değilsin.');
        if (kurucu) return hata(i, 'İlan sahibi ayrılamaz; ilanı kapatabilirsin.');
        t.oyuncular = t.oyuncular.filter((x) => x !== i.user.id);
      }
      await i.deferUpdate();
      const doldu = t.oyuncular.length >= t.kisi && !t.ses;
      if (doldu) {
        const oda = await geciciOda(i.guild, `🎮 ${t.oyun} • ${i.guild.members.cache.get(t.oyuncular[0])?.displayName || 'takım'}`, { limit: t.kisi, sahip: t.oyuncular[0], parent: i.channel.parentId }).catch(() => null);
        if (oda) t.ses = oda.id;
      }
      db.belge.yaz(t.id, t);
      await i.editReply(gorunum(t));
      if (doldu) await i.followUp({ content: `${t.oyuncular.map((x) => `<@${x}>`).join(' ')} kadro tamam! ${t.ses ? `Odanız hazır: <#${t.ses}>` : ''}` });
    },
  },
  async tik() {
    for (const t of db.belge.hepsi('takim')) if (Date.now() - t.zaman > 2 * 36e5) db.belge.sil(t.id);
  },
};
