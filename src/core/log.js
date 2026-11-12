const db = require('./db');
// Moderasyon/olay kaydını sunucunun log kanalına yollar
async function log(guild, embed, dosyalar) {
  const id = db.ayar(guild.id, 'kanal.log');
  const kanal = id && guild.channels.cache.get(id);
  if (!kanal) return;
  await kanal.send({ embeds: [embed.setTimestamp()], files: dosyalar || [] }).catch(() => {});
}
module.exports = { log };
