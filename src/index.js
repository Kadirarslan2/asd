// KampAteş Bot — giriş noktası: modülleri yükler, komutları kaydeder, olayları dağıtır
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, Events, ActivityType } = require('discord.js');
const config = require('./core/config');
const db = require('./core/db');
const { hata } = require('./core/util');

function modulleriYukle() {
  const dizin = path.join(__dirname, 'modules');
  const moduller = fs.readdirSync(dizin).filter((f) => f.endsWith('.js')).sort().map((f) => require(path.join(dizin, f)));
  const komutlar = new Map(), bilesenler = new Map(), olaylar = new Map();
  for (const m of moduller) {
    for (const k of m.komutlar || []) {
      if (komutlar.has(k.data.name)) throw new Error(`Yinelenen komut: ${k.data.name}`);
      komutlar.set(k.data.name, { ...k, modul: m.ad });
    }
    for (const [onek, fn] of Object.entries(m.bilesenler || {})) {
      if (bilesenler.has(onek)) throw new Error(`Yinelenen bileşen öneki: ${onek}`);
      bilesenler.set(onek, fn);
    }
    for (const [olay, fn] of Object.entries(m.olaylar || {})) {
      if (!olaylar.has(olay)) olaylar.set(olay, []);
      olaylar.get(olay).push({ fn, modul: m.ad });
    }
  }
  return { moduller, komutlar, bilesenler, olaylar };
}

function baslat() {
  if (!config.token) {
    console.error('❌ DISCORD_TOKEN bulunamadı. .env.example dosyasını .env olarak kopyalayıp token\'ı gir.');
    process.exit(1);
  }
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildInvites,
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel],
    allowedMentions: { parse: ['users'], repliedUser: true },
  });
  const y = modulleriYukle();
  const ctx = { client, db, config, ...y };

  for (const [olay, dinleyiciler] of y.olaylar) {
    client.on(olay, (...args) => {
      for (const d of dinleyiciler) {
        Promise.resolve().then(() => d.fn(...args, ctx)).catch((e) => console.error(`[${d.modul}] ${olay} hatası:`, e));
      }
    });
  }

  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (i.isChatInputCommand() || i.isAutocomplete()) {
        const k = y.komutlar.get(i.commandName);
        if (!k) return;
        if (i.isAutocomplete()) return k.tamamla ? await k.tamamla(i, ctx) : i.respond([]);
        if (!i.inGuild()) return hata(i, 'Bu bot yalnızca sunucularda çalışır.');
        return await k.calistir(i, ctx);
      }
      if (i.isMessageComponent() || i.isModalSubmit()) {
        const [onek, ...arg] = i.customId.split(':');
        const fn = y.bilesenler.get(onek);
        if (fn) await fn(i, arg, ctx);
      }
    } catch (e) {
      console.error('Etkileşim hatası:', i.commandName || i.customId, e);
      const mesaj = e?.code === 50013 ? 'Bunu yapmak için yetkim yok. Rolümün yeterince yukarıda ve gerekli izinlere sahip olduğundan emin ol.' : 'Beklenmeyen bir hata oluştu.';
      if (i.isRepliable()) await hata(i, mesaj).catch(() => {});
    }
  });

  client.once(Events.ClientReady, async () => {
    console.log(`✅ ${client.user.tag} olarak giriş yapıldı — ${client.guilds.cache.size} sunucu`);
    const veri = [...y.komutlar.values()].map((k) => k.data.toJSON());
    try {
      if (config.guildId) await client.application.commands.set(veri, config.guildId);
      else await client.application.commands.set(veri);
      console.log(`✅ ${veri.length} slash komutu kaydedildi (${config.guildId ? 'sunucuya özel' : 'global'})`);
    } catch (e) { console.error('Komut kaydı başarısız:', e); }
    for (const m of y.moduller) {
      try { await m.hazir?.(ctx); } catch (e) { console.error(`[${m.ad}] hazir hatası:`, e); }
    }
    const tik = (alan) => async () => {
      for (const m of y.moduller) {
        try { await m[alan]?.(ctx); } catch (e) { console.error(`[${m.ad}] ${alan} hatası:`, e); }
      }
    };
    setInterval(tik('hizliTik'), 15_000); // çekiliş bitişi, hatırlatıcı vb.
    setInterval(tik('tik'), 60_000);      // ses XP'si, ateş, paneller
    const durumlar = ['/yardım', '🔥 /kamp ile ateş başına', '🎯 /faceit profil', '⚔️ /maç oluştur'];
    let d = 0;
    setInterval(() => client.user.setActivity(durumlar[d++ % durumlar.length], { type: ActivityType.Playing }), 30_000);
  });

  process.on('unhandledRejection', (e) => console.error('Yakalanmamış hata:', e));
  client.login(config.token);
}

if (require.main === module) baslat();
module.exports = { modulleriYukle };
