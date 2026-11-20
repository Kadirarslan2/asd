// Minecraft topluluk botu — giriş noktası: modülleri yükler, komutları kaydeder, olayları dağıtır
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
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

// Komutları sunucu bazında kaydeder (anında görünür). Eski sürümlerden kalan global komutları siler:
// onlar listede durup tıklanınca "uygulama yanıt vermedi" hatası verir.
const KAYIT_IPUCU = {
  50001: 'Botun bu sunucuda komut ekleme izni yok. Botu sunucudan atıp Developer Portal > OAuth2 > URL Generator ile "bot" ve "applications.commands" seçerek yeniden ekle.',
  10004: 'Bu ID ile bir sunucu bulunamadı. .env içindeki GUILD_ID yanlış olabilir.',
  30034: 'Discord günlük komut oluşturma sınırına ulaşıldı. Birkaç saat sonra botu yeniden başlat.',
};
async function sunucuyaKaydet(guild, veri) {
  try {
    await guild.commands.set(veri);
    console.log(`✅ ${veri.length} komut "${guild.name}" sunucusuna kaydedildi`);
    return true;
  } catch (e) {
    console.error(`❌ "${guild.name}" sunucusuna komut kaydedilemedi (${e.code || e.message}). ${KAYIT_IPUCU[e.code] || e.message}`);
    return false;
  }
}
async function komutlariKaydet(client, veri) {
  try {
    const globaller = await client.application.commands.fetch();
    if (globaller.size) { await client.application.commands.set([]); console.log(`🧹 Eski sürümden kalan ${globaller.size} global komut silindi (Discord'da Ctrl+R ile listeyi yenile)`); }
  } catch (e) { console.error('Global komutlar temizlenemedi:', e.message); }
  if (config.guildId && !client.guilds.cache.has(config.guildId)) {
    console.error(`❌ .env içindeki GUILD_ID (${config.guildId}) botun bulunduğu sunuculardan biri değil. Bot şu sunucularda: ${[...client.guilds.cache.values()].map((g) => `${g.name} (${g.id})`).join(', ') || 'hiçbiri — botu sunucuna davet et'}. Komutlar botun bulunduğu tüm sunuculara kaydediliyor.`);
  }
  const hedefler = config.guildId && client.guilds.cache.has(config.guildId) ? [client.guilds.cache.get(config.guildId)] : [...client.guilds.cache.values()];
  if (!hedefler.length) console.error('❌ Bot hiçbir sunucuda değil. Developer Portal > OAuth2 > URL Generator ile davet linki oluşturup botu sunucuna ekle.');
  for (const g of hedefler) await sunucuyaKaydet(g, veri);
}

async function etkilesimIsle(i, ctx) {
  try {
    if (i.isChatInputCommand() || i.isAutocomplete() || i.isContextMenuCommand?.()) {
      const k = ctx.komutlar.get(i.commandName);
      if (!k) {
        // Eski bir sürümden kalmış, artık olmayan komut: sessiz kalırsa Discord "uygulama yanıt vermedi" gösterir
        if (i.isAutocomplete()) return i.respond([]);
        return hata(i, `\`/${i.commandName}\` eski bir sürümden kalmış ve artık yok. Discord'u yeniden başlatırsan (Ctrl+R) komut listesi yenilenir. Tüm komutlar için \`/yardım\`.`);
      }
      if (i.isAutocomplete()) return k.tamamla ? await k.tamamla(i, ctx) : i.respond([]);
      if (!i.inGuild()) return hata(i, 'Bu bot yalnızca sunucularda çalışır.');
      return await k.calistir(i, ctx);
    }
    if (i.isMessageComponent() || i.isModalSubmit()) {
      const [onek, ...arg] = i.customId.split(':');
      const fn = ctx.bilesenler.get(onek);
      if (fn) return await fn(i, arg, ctx);
      return hata(i, 'Bu buton eski bir sürümden kalmış. İlgili komutu tekrar kullan.');
    }
  } catch (e) {
    console.error('Etkileşim hatası:', i.commandName || i.customId, e);
    const mesaj = e?.code === 50013 ? 'Bunu yapmak için yetkim yok. Rolümün yeterince yukarıda ve gerekli izinlere sahip olduğundan emin ol. (`/teşhis`)' : 'Beklenmeyen bir hata oluştu. Yetkililer `/teşhis` ile kontrol edebilir.';
    if (i.isRepliable()) await hata(i, mesaj).catch(() => {});
  }
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

  client.on(Events.InteractionCreate, (i) => etkilesimIsle(i, ctx));

  client.once(Events.ClientReady, async () => {
    console.log(`✅ ${client.user.tag} olarak giriş yapıldı — ${client.guilds.cache.size} sunucu`);
    const veri = [...y.komutlar.values()].map((k) => k.data.toJSON());
    await komutlariKaydet(client, veri);
    client.on(Events.GuildCreate, (g) => { console.log(`➕ Yeni sunucuya eklendim: ${g.name}`); sunucuyaKaydet(g, veri); });
    for (const m of y.moduller) {
      try { await m.hazir?.(ctx); } catch (e) { console.error(`[${m.ad}] hazir hatası:`, e); }
    }
    const tik = (alan) => async () => {
      for (const m of y.moduller) {
        try { await m[alan]?.(ctx); } catch (e) { console.error(`[${m.ad}] ${alan} hatası:`, e); }
      }
    };
    setInterval(tik('hizliTik'), 15_000); // çekiliş bitişi, hatırlatıcı vb.
    setInterval(tik('tik'), 60_000);      // ses XP'si, sunucu durumu, paneller
    // Logoyu bir kez botun profil fotoğrafı yap
    if (!db.ayar('_', 'logo')) {
      await client.user.setAvatar(require('./core/cizim').logoDosya(512)).then(() => { db.ayarYaz('_', 'logo', 1); console.log('✅ Logo botun profil fotoğrafı yapıldı'); }).catch((e) => console.error('Logo ayarlanamadı:', e.message));
    }
  });

  process.on('unhandledRejection', (e) => console.error('Yakalanmamış hata:', e));
  client.login(config.token).catch((e) => {
    if (/disallowed intents/i.test(e.message)) console.error('❌ Bot giriş yapamadı: Developer Portal > Bot sayfasında "Server Members Intent" ve "Message Content Intent" açık olmalı.');
    else if (/invalid token|TokenInvalid/i.test(e.message + e.code)) console.error('❌ Bot giriş yapamadı: .env dosyasındaki DISCORD_TOKEN geçersiz. Developer Portal > Bot > Reset Token ile yenisini al.');
    else console.error('❌ Bot giriş yapamadı:', e.message);
    process.exit(1);
  });
}

if (require.main === module) baslat();
module.exports = { modulleriYukle, komutlariKaydet, etkilesimIsle };
