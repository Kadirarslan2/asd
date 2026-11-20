// Oyun içi yönetim (RCON): çevrimiçi oyuncular, at, ban, ban kaldır, whitelist, oyuna duyuru.
// Vanilla komutlar kullanılır; AuraCraft eklentisi dahil her Paper/Spigot sunucusunda çalışır.
const { SlashCommandBuilder } = require('discord.js');
const db = require('../core/db');
const rcon = require('../core/rcon');
const cizim = require('../core/cizim');
const { log } = require('../core/log');
const { E, R, hata, yanit } = require('../core/util');

const oyuncuSec = (b) => b.addStringOption((o) => o.setName('oyuncu').setDescription('Minecraft adı').setRequired(true).setMaxLength(17).setAutocomplete(true));
const sebepSec = (b) => b.addStringOption((o) => o.setName('sebep').setDescription('Sebep').setMaxLength(150));
// Sebep metni komuta gömülür: satır sonu ve § gibi kontrol karakterlerini at
const temizSebep = (s) => String(s || 'Kurallara aykırı davranış').replace(/[\r\n§]/g, ' ').slice(0, 150);

let onbellek = { t: 0, l: [] };
async function cevrimiciler() {
  if (Date.now() - onbellek.t < 10_000) return onbellek.l;
  onbellek = { t: Date.now(), l: await rcon.oyuncular() };
  return onbellek.l;
}

module.exports = {
  ad: 'oyun',
  temizSebep,
  komutlar: [
    { data: new SlashCommandBuilder().setName('oyuncular').setDescription('Şu an oyunda olan oyuncuları gösterir'),
      calistir: async (i) => {
        if (!rcon.hazir()) return require('./minecraft').durumAl(i.guild).then((d) => yanit(i, E(`🎮 ${d?.ad || 'Sunucu'}`, d?.acik ? `**${d.oyuncu}/${d.max}** oyuncu çevrimiçi${d.liste?.length ? `\n${d.liste.map((n) => `\`${n}\``).join(' ')}` : ''}` : 'Sunucuya ulaşılamıyor.', R.ana)));
        await i.deferReply();
        let l;
        try { l = await cevrimiciler(); } catch (e) { return i.editReply({ embeds: [E(null, `❌ ${e.message}`, R.hata)] }); }
        const bagli = new Map(db.bagliHesaplar(i.guild.id).map((u) => [u.mc_nick.toLowerCase(), u.user]));
        return i.editReply({ embeds: [E(`🎮 Oyunda ${l.length} oyuncu`, l.length ? l.map((n) => `• \`${n}\`${bagli.has(n.toLowerCase()) ? ` — <@${bagli.get(n.toLowerCase())}>` : ''}`).join('\n').slice(0, 4000) : 'Şu an kimse oyunda değil.', R.ana).setThumbnail(l[0] ? cizim.kafaUrl(l[0]) : null)] });
      } },
    { data: new SlashCommandBuilder().setName('oyun').setDescription('[Yetkili] Oyun içi yönetim')
        .addSubcommand((s) => sebepSec(oyuncuSec(s.setName('at').setDescription('Oyuncuyu sunucudan atar'))))
        .addSubcommand((s) => sebepSec(oyuncuSec(s.setName('ban').setDescription('Oyuncuyu oyundan yasaklar'))))
        .addSubcommand((s) => oyuncuSec(s.setName('ban-kaldır').setDescription('Oyun yasağını kaldırır')))
        .addSubcommand((s) => oyuncuSec(s.setName('whitelist-ekle').setDescription('Oyuncuyu beyaz listeye ekler')))
        .addSubcommand((s) => oyuncuSec(s.setName('whitelist-sil').setDescription('Oyuncuyu beyaz listeden çıkarır')))
        .addSubcommand((s) => s.setName('duyur').setDescription('Oyundaki herkese renkli duyuru gönderir').addStringOption((o) => o.setName('mesaj').setDescription('Mesaj').setRequired(true).setMaxLength(200))),
      tamamla: async (i) => {
        const y = i.options.getFocused().toLowerCase();
        const l = rcon.hazir() ? await cevrimiciler().catch(() => []) : [];
        return i.respond(l.filter((n) => n.toLowerCase().includes(y)).slice(0, 25).map((n) => ({ name: n, value: n })));
      },
      calistir: async (i) => {
        if (!rcon.hazir()) return hata(i, 'Oyun içi yönetim için konsol bağlantısı (RCON) gerekir. Kurulum: README → "RCON\'u açmak".');
        const alt = i.options.getSubcommand(), nick = i.options.getString('oyuncu')?.trim(), sebep = temizSebep(i.options.getString('sebep'));
        if (alt !== 'duyur' && !rcon.nickGecerli(nick)) return hata(i, 'Geçersiz Minecraft adı.');
        const islem = { at: 'oyun-at', ban: 'oyun-ban', 'ban-kaldır': 'oyun-ban', 'whitelist-ekle': 'oyun-whitelist', 'whitelist-sil': 'oyun-whitelist', duyur: 'oyun-duyur' }[alt];
        const yetki = require('../core/yetki'), engel = yetki.gerek(i, islem);
        if (engel) return hata(i, engel);
        await i.deferReply();
        const komut = { at: `kick ${nick} ${sebep}`, ban: `ban ${nick} ${sebep}`, 'ban-kaldır': `pardon ${nick}`, 'whitelist-ekle': `whitelist add ${nick}`, 'whitelist-sil': `whitelist remove ${nick}` }[alt];
        try {
          if (alt === 'duyur') {
            const mesaj = i.options.getString('mesaj').replace(/[\r\n]/g, ' ');
            await rcon.tellraw('@a', ['', { text: '\n[DUYURU] ', color: 'green', bold: true }, { text: mesaj, color: 'white' }, { text: `\n— ${i.member.displayName} (Discord)\n`, color: 'gray', italic: true }]);
            return i.editReply({ embeds: [E(null, `📢 Oyuna duyuruldu: ${mesaj}`, R.ok)] });
          }
          const cikti = await rcon.calistir(komut);
          // Sicile işle: hesap bağlıysa Discord üyesine, değilse Minecraft adına
          const bagli = db.mcBul(i.guild.id, nick), tur = `oyun-${alt === 'ban-kaldır' ? 'pardon' : alt.startsWith('whitelist') ? 'whitelist' : alt}`;
          yetki.cezaKaydet(i.guild.id, bagli?.user || `mc:${nick.toLowerCase()}`, i.user.id, tur, alt === 'at' || alt === 'ban' ? sebep : null);
          const BASLIK = { at: '👢 Oyundan atıldı', ban: '🔨 Oyundan yasaklandı', 'ban-kaldır': '🔓 Oyun yasağı kaldırıldı', 'whitelist-ekle': '📋 Beyaz listeye eklendi', 'whitelist-sil': '📋 Beyaz listeden çıkarıldı' }[alt];
          await log(i.guild, E(`🎮 ${BASLIK}`, `**Oyuncu:** \`${nick}\`\n**Yetkili:** ${i.user}${alt === 'at' || alt === 'ban' ? `\n**Sebep:** ${sebep}` : ''}\n**Sunucu yanıtı:** ${cikti || '—'}`, alt === 'ban' ? R.hata : R.altin));
          return i.editReply({ embeds: [E(BASLIK, `\`${nick}\`${alt === 'at' || alt === 'ban' ? ` — ${sebep}` : ''}\n> ${cikti || 'Komut çalıştırıldı.'}`, alt === 'ban' ? R.hata : R.ok).setThumbnail(cizim.kafaUrl(nick))] });
        } catch (e) { return i.editReply({ embeds: [E(null, `❌ ${e.message}`, R.hata)] }); }
      } },
  ],
};
