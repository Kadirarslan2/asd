// Ortam değişkenlerini .env dosyasından yükler
const fs = require('node:fs');
const path = require('node:path');
const kok = path.join(__dirname, '..', '..');
const envYol = path.join(kok, '.env');
if (fs.existsSync(envYol)) process.loadEnvFile(envYol);
if (!process.env.TZ) process.env.TZ = 'Europe/Istanbul';

module.exports = {
  kok,
  token: process.env.DISCORD_TOKEN || '',
  guildId: process.env.GUILD_ID || '',
  sunucu: { ad: process.env.MC_AD || 'AuraCraft', adres: process.env.MC_ADRES || 'auracraft.net.tr', tur: process.env.MC_TUR === 'bedrock' ? 'bedrock' : 'java', sorgu: process.env.MC_SORGU_ADRES || '' },
  rcon: { host: process.env.MC_RCON_HOST || '', port: Number(process.env.MC_RCON_PORT || 25575), sifre: process.env.MC_RCON_PASSWORD || '' },
  dbYol: process.env.DB_PATH || path.join(kok, 'data', 'bot.sqlite'),
};
