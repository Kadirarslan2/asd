// Oyun sunucusu durumu (CS2/Source/Minecraft), kendini güncelleyen canlı panel ve Steam profili
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const db = require('../core/db');
const config = require('../core/config');
const { sorgula } = require('../core/sorgu');
const { E, R, hata, tamam, cubuk, zd, sayi } = require('../core/util');

function durumEmbed(s) {
  const e = E(`🟢 ${s.ad}`.slice(0, 250), null, R.ok).addFields(
    { name: 'Oyuncu', value: `**${s.oyuncu}/${s.max}**${s.bot ? ` (${s.bot} bot)` : ''}\n\`${cubuk(s.max ? s.oyuncu / s.max : 0, 12)}\``, inline: true },
    s.tur === 'source' ? { name: 'Harita', value: s.harita || '—', inline: true } : { name: 'Sürüm', value: s.surum, inline: true },
    { name: 'Ping', value: `${s.ping}ms`, inline: true }, { name: 'Adres', value: `\`${s.adres}\``, inline: true });
  if (s.tur === 'source') e.addFields({ name: 'Oyun', value: `${s.oyun || '—'}${s.sifreli ? ' 🔒' : ''}`, inline: true }, { name: 'Bağlan', value: `\`connect ${s.adres}\``, inline: true });
  if (s.liste?.length) e.addFields({ name: 'Çevrimiçi', value: s.liste.join(', ') });
  return e;
}
const kapaliEmbed = (adres, sebep) => E('🔴 Sunucu çevrimdışı', `\`${adres}\`\n${sebep}`, R.hata);

async function steam(yol, param) {
  const r = await fetch(`https://api.steampowered.com/${yol}/?${new URLSearchParams({ key: config.steamKey, ...param })}`, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Steam ${r.status}`);
  return r.json();
}
const turSec = (o) => o.setName('tür').setDescription('Sunucu türü').setRequired(true).addChoices({ name: 'CS2 / CS:GO / Source (Rust, GMod, TF2…)', value: 'source' }, { name: 'Minecraft (Java)', value: 'minecraft' });

module.exports = {
  ad: 'oyun',
  durumEmbed,
  komutlar: [
    { data: new SlashCommandBuilder().setName('oyun-sunucu').setDescription('Oyun sunucusu durumu')
        .addSubcommand((s) => s.setName('sorgula').setDescription('Bir oyun sunucusunun anlık durumunu gösterir')
          .addStringOption(turSec).addStringOption((o) => o.setName('adres').setDescription('IP:port ya da alan adı').setRequired(true)))
        .addSubcommand((s) => s.setName('panel').setDescription('[Yönetici] Bu kanala her dakika güncellenen canlı durum paneli kurar')
          .addStringOption(turSec).addStringOption((o) => o.setName('adres').setDescription('IP:port ya da alan adı').setRequired(true)))
        .addSubcommand((s) => s.setName('panel-sil').setDescription('[Yönetici] Bu kanaldaki canlı panelleri kaldırır')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand();
        if (alt !== 'sorgula' && !i.memberPermissions.has(P.ManageGuild)) return hata(i, 'Bunun için **Sunucuyu Yönet** yetkisi gerekir.');
        if (alt === 'panel-sil') {
          const l = db.belge.liste(i.guild.id, 'panel').filter((p) => p.kanal === i.channelId);
          for (const p of l) { db.belge.sil(p.id); await i.channel.messages.delete(p.mesaj).catch(() => {}); }
          return tamam(i, `${l.length} panel kaldırıldı.`, true);
        }
        const tur = i.options.getString('tür'), adres = i.options.getString('adres');
        await i.deferReply();
        let embed;
        try { embed = durumEmbed(await sorgula(tur, adres)); } catch (e) {
          if (alt === 'panel') return i.editReply({ embeds: [kapaliEmbed(adres, `${e.message}\nPanel kurmak için sunucunun şu an açık olması gerekir.`)] });
          embed = kapaliEmbed(adres, e.message);
        }
        const mesaj = await i.editReply({ embeds: [embed] });
        if (alt === 'panel') {
          if (db.belge.liste(i.guild.id, 'panel').length >= 5) return i.followUp({ content: 'En fazla 5 canlı panel kurulabilir; bu mesaj güncellenmeyecek.', flags: 64 });
          db.belge.ekle(i.guild.id, 'panel', { kanal: i.channelId, mesaj: mesaj.id, tur, adres, hata: 0 });
        }
      } },
    { data: new SlashCommandBuilder().setName('steam').setDescription('Steam profili: seviye, CS2 saati, ban durumu')
        .addStringOption((o) => o.setName('profil').setDescription('SteamID64, özel URL adı ya da profil linki').setRequired(true)),
      calistir: async (i) => {
        if (!config.steamKey) return hata(i, 'Steam API anahtarı tanımlı değil. `.env` dosyasına `STEAM_API_KEY` eklenmeli.');
        await i.deferReply();
        let girdi = i.options.getString('profil').trim().replace(/\/+$/, '');
        const link = girdi.match(/steamcommunity\.com\/(?:id|profiles)\/([^/?#]+)/);
        if (link) girdi = link[1];
        try {
          let id = /^\d{17}$/.test(girdi) ? girdi : (await steam('ISteamUser/ResolveVanityURL/v1', { vanityurl: girdi })).response?.steamid;
          if (!id) return hata(i, 'Steam profili bulunamadı.');
          const [ozet, ban, lvl, oyunlar] = await Promise.all([
            steam('ISteamUser/GetPlayerSummaries/v2', { steamids: id }), steam('ISteamUser/GetPlayerBans/v1', { steamids: id }),
            steam('IPlayerService/GetSteamLevel/v1', { steamid: id }).catch(() => null),
            steam('IPlayerService/GetOwnedGames/v1', { steamid: id, include_played_free_games: 1, include_appinfo: 1 }).catch(() => null)]);
          const p = ozet.response?.players?.[0], b = ban.players?.[0];
          if (!p) return hata(i, 'Steam profili bulunamadı.');
          const liste = oyunlar?.response?.games || [];
          const cs = liste.find((o) => o.appid === 730);
          const enCok = [...liste].sort((x, y) => y.playtime_forever - x.playtime_forever).slice(0, 5);
          const DURUM = ['Çevrimdışı', 'Çevrimiçi', 'Meşgul', 'Uzakta', 'Uyukluyor', 'Takas arıyor', 'Oyun arıyor'];
          const e = E(p.personaname, null, 0x1b2838).setURL(p.profileurl).setThumbnail(p.avatarfull)
            .addFields({ name: 'Durum', value: p.gameextrainfo ? `🎮 ${p.gameextrainfo}` : DURUM[p.personastate] || '—', inline: true },
              { name: 'Seviye', value: String(lvl?.response?.player_level ?? '—'), inline: true },
              { name: 'Hesap açılış', value: p.timecreated ? zd(p.timecreated * 1000, 'D') : 'Gizli', inline: true },
              { name: 'CS2 süresi', value: cs ? `${sayi(cs.playtime_forever / 60)} saat${cs.playtime_2weeks ? ` (son 2 hafta: ${sayi(cs.playtime_2weeks / 60)})` : ''}` : 'Gizli / yok', inline: true },
              { name: 'Banlar', value: b ? `VAC: ${b.VACBanned ? `⛔ ${b.NumberOfVACBans}` : '✅ temiz'} • Oyun: ${b.NumberOfGameBans ? `⛔ ${b.NumberOfGameBans}` : '✅'}${b.VACBanned || b.NumberOfGameBans ? ` • son ban ${b.DaysSinceLastBan} gün önce` : ''}` : '—', inline: true },
              { name: 'SteamID64', value: `\`${id}\``, inline: true });
          if (enCok.length) e.addFields({ name: 'En çok oynananlar', value: enCok.map((o) => `**${o.name}** — ${sayi(o.playtime_forever / 60)} saat`).join('\n') });
          return i.editReply({ embeds: [e] });
        } catch { return hata(i, 'Steam şu an yanıt vermiyor ya da API anahtarı geçersiz.'); }
      } },
  ],
  // Canlı panelleri dakikada bir güncelle
  async tik(ctx) {
    for (const p of db.belge.hepsi('panel')) {
      const kanal = ctx.client.channels.cache.get(p.kanal);
      if (!kanal) { db.belge.sil(p.id); continue; }
      const embed = await sorgula(p.tur, p.adres).then(durumEmbed, (e) => kapaliEmbed(p.adres, e.message));
      embed.setFooter({ text: 'Canlı panel • her dakika güncellenir' }).setTimestamp();
      await kanal.messages.edit(p.mesaj, { embeds: [embed] }).catch((e) => { if (e.code === 10008) db.belge.sil(p.id); }); // mesaj silinmişse paneli kaldır
    }
  },
};
