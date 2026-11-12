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
  faceitKey: process.env.FACEIT_API_KEY || '',
  steamKey: process.env.STEAM_API_KEY || '',
  port: Number(process.env.WEB_PORT || 3000),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
  dbYol: process.env.DB_PATH || path.join(kok, 'data', 'bot.sqlite'),
};
