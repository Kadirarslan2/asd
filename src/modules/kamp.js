// 🔥 Kamp Ateşi: ses kanalındaki üyeler tarayıcıda canlı bir 3D sahnede ateşin başında oturur.
// Ateş sunucunun ortak ateşidir: seste zaman geçtikçe ve odun atıldıkça büyür, kimse yokken söner.
// Her gün seste biri oldukça "ateş serisi" uzar.
const crypto = require('node:crypto');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits: P } = require('discord.js');
const cizim = require('../core/cizim');
const muzik = require('./muzik');
const db = require('../core/db');
const config = require('../core/config');
const oyuncu = require('../core/oyuncu');
const { sunucuBaslat } = require('../web/server');
const { E, R, yanit, hata, gun, cubuk, sayi } = require('../core/util');

let web = null, client = null;
const sira = new Map();     // "g:c" -> [üye id'leri] (oturma düzeni sabit kalsın diye)
const bekleme = new Map();  // "u:tür" -> son kullanım
const IFADELER = { selam: 1500, dans: 5000, marshmallow: 5000, odun: 20_000, hikaye: 120_000, alkis: 1500 };

function gizli() {
  let s = db.ayar('_', 'gizli');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); db.ayarYaz('_', 'gizli', s); }
  return s;
}
const imza = (g, c, u = '') => crypto.createHmac('sha256', gizli()).update(`${g}:${c}:${u}`).digest('hex').slice(0, 24);
function dogrula(g, c, u, k) {
  const beklenen = imza(g, c, u);
  return k.length === beklenen.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(beklenen));
}
const baglanti = (g, c, u = '') => `${config.publicUrl}/kamp/${g}/${c}?${u ? `u=${u}&` : ''}k=${imza(g, c, u)}`;

// Ateşin güncel hâli: yakıt dakikada 0.35 azalır
function ates(g) {
  const a = db.ayar(g, 'ates', { yakit: 30, t: Date.now(), seri: 0, sonGun: null, toplam: 0 });
  const dk = (Date.now() - a.t) / 60000;
  a.yakit = Math.max(0, a.yakit - dk * 0.35);
  a.t = Date.now();
  if (a.sonGun && a.sonGun !== gun() && a.sonGun !== gun(Date.now() - 864e5)) a.seri = 0; // bir gün atlandıysa seri bozulur
  return a;
}
const atesOzet = (a) => ({ yakit: Math.round(a.yakit), seri: a.seri, toplam: a.toplam });
function yakitEkle(g, n, odun = 0) {
  const a = ates(g);
  a.yakit = Math.min(100, a.yakit + n);
  a.toplam += odun;
  db.ayarYaz(g, 'ates', a);
  return a;
}

function durum(g, c) {
  const guild = client.guilds.cache.get(g), kanal = guild?.channels.cache.get(c);
  if (!kanal?.isVoiceBased()) return null;
  const anahtar = `${g}:${c}`;
  const mevcut = [...kanal.members.filter((m) => !m.user.bot).keys()]; // botlar ateş başına oturmaz
  const duzen = (sira.get(anahtar) || []).filter((id) => mevcut.includes(id));
  for (const id of mevcut) if (!duzen.includes(id)) duzen.push(id);
  sira.set(anahtar, duzen);
  const uyeler = duzen.slice(0, 25).map((id) => {
    const m = kanal.members.get(id), v = m.voice, u = m.user.bot ? null : db.uye(g, id);
    const klan = u?.veri.klan && db.belge.al(u.veri.klan);
    return { id, ad: m.displayName.slice(0, 24), avatar: m.displayAvatarURL({ extension: 'png', size: 128 }), renk: m.displayHexColor === '#000000' ? null : m.displayHexColor,
      sessiz: Boolean(v.selfMute || v.serverMute), sagir: Boolean(v.selfDeaf || v.serverDeaf), yayin: Boolean(v.streaming), kamera: Boolean(v.selfVideo), bot: m.user.bot,
      seviye: u?.seviye ?? 0, faceit: u?.faceit_lvl || 0, klan: klan?.etiket || null };
  });
  return { kanal: kanal.name, sunucu: guild.name, uyeler, ates: atesOzet(ates(g)), muzik: muzik.simdiCalan(g, c) };
}
// ---- Otomatik kamp kartı: biri ses kanalına girince kanalın sohbetine resimli kart düşer, komut yazmaya gerek kalmaz ----
const kartlar = new Map(); // kanal id -> { mesaj, z, katilan }
const kartButonlari = (g) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('kamp:link').setLabel('3D ateş başına otur').setEmoji('🔥').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('kamp:odun').setLabel('Odun at').setEmoji('🪵').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('kamp:foto').setLabel('Hatıra fotoğrafı').setEmoji('📸').setStyle(ButtonStyle.Secondary)), muzik.radyoMenu(g)];
function kartPlanla(guild, c, katilan = null) {
  if (!db.ayar(guild.id, 'kamp.oto', true)) return;
  const k = kartlar.get(c) || {};
  if (katilan) k.katilan = katilan;
  clearTimeout(k.z);
  k.z = setTimeout(() => kartCiz(guild, c).catch(() => {}), 2500); // art arda giriş çıkışları tek güncellemede topla
  kartlar.set(c, k);
}
async function kartCiz(guild, c) {
  const g = guild.id, k = kartlar.get(c) || {}, kanal = guild.channels.cache.get(c);
  const eski = k.mesaj || db.ayar(g, `kamp.kart.${c}`);
  const d = kanal && durum(g, c);
  if (!d || !d.uyeler.length) {
    if (eski) kanal?.messages.delete(eski).catch(() => {});
    db.ayarYaz(g, `kamp.kart.${c}`, null); kartlar.delete(c);
    return;
  }
  const yuk = { files: [await cizim.kampKart(d)], components: kartButonlari(g) };
  if (eski && !k.katilan) {
    const oldu = await kanal.messages.edit(eski, { ...yuk, attachments: [] }).then(() => true, () => false);
    if (oldu) return;
  }
  if (eski) kanal.messages.delete(eski).catch(() => {});
  const m = await kanal.send({ content: k.katilan ? `🔥 <@${k.katilan}> ateş başına oturdu` : undefined, allowedMentions: { users: [] }, ...yuk }).catch(() => null);
  k.katilan = null; k.mesaj = m?.id || null; kartlar.set(c, k);
  db.ayarYaz(g, `kamp.kart.${c}`, k.mesaj);
}

const guncelle = (g, c) => { if (web?.izlenen(g, c)) { const d = durum(g, c); if (d) web.yayin(g, c, { t: 'durum', ...d }); } };

// Web'den ya da /kamp odun komutundan gelen ifade
async function ifade(g, c, u, ad) {
  if (!IFADELER[ad]) return { t: 'hata', mesaj: 'Bilinmeyen ifade.' };
  const guild = client.guilds.cache.get(g), kanal = guild?.channels.cache.get(c);
  if (!kanal?.members?.has(u)) return { t: 'hata', mesaj: 'İfade kullanmak için ses kanalında olmalısın.' };
  const k = ad === 'hikaye' ? `${g}:${c}:hikaye` : `${u}:${ad}`;
  const kalan = (bekleme.get(k) || 0) + IFADELER[ad] - Date.now();
  if (kalan > 0) return { t: 'hata', mesaj: `Biraz bekle (${Math.ceil(kalan / 1000)} sn).` };
  bekleme.set(k, Date.now());
  web?.yayin(g, c, { t: 'ifade', id: u, ad });
  if (ad === 'odun') {
    const a = yakitEkle(g, 6, 1);
    web?.yayinSunucu(g, () => ({ t: 'ates', ates: atesOzet(a) }));
    await oyuncu.gorevIlerle(guild, u, 'odun', 1);
    await oyuncu.sayac(guild, u, 'odun', 1, 50, 'atesbekcisi');
  }
  return null;
}
const atesYaz = (a) => {
  const hal = a.yakit >= 75 ? 'harlı 🔥🔥🔥' : a.yakit >= 40 ? 'canlı 🔥🔥' : a.yakit >= 10 ? 'sakin 🔥' : 'közde 🪨';
  return `**Ateş:** ${hal}\n\`${cubuk(a.yakit / 100, 18)}\` %${Math.round(a.yakit)}\n**Ateş serisi:** ${a.seri} gün • **Atılan odun:** ${sayi(a.toplam)}`;
};
const linkButonu = (g, c, u) => new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ateş başına otur').setEmoji('🔥').setStyle(ButtonStyle.Link).setURL(baglanti(g, c, u)));

module.exports = {
  ad: 'kamp',
  imza, dogrula, durum, ifade, ates, baglanti,
  _kur: (c, w) => { client = c; web = w; }, // testler için
  komutlar: [
    { data: new SlashCommandBuilder().setName('kamp').setDescription('3D kamp ateşi: ses kanalındakiler ateşin başında oturur')
        .addSubcommand((s) => s.setName('aç').setDescription('Bulunduğun ses kanalının 3D kamp ateşi bağlantısını verir'))
        .addSubcommand((s) => s.setName('durum').setDescription('Sunucu ateşinin durumunu ve ateş serisini gösterir'))
        .addSubcommand((s) => s.setName('odun').setDescription('Ateşe odun atar (seste olmalısın)'))
        .addSubcommand((s) => s.setName('otomatik').setDescription('[Yönetici] Ses kanalına girince otomatik kamp kartını açar/kapatır').addBooleanOption((o) => o.setName('açık').setDescription('Açık mı?').setRequired(true))),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'durum') return yanit(i, E('🔥 Sunucu Ateşi', `${atesYaz(ates(g))}\n\n*Seste zaman geçirdikçe ve odun attıkça ateş büyür; kimse yokken yavaşça söner. Her gün seste biri olursa seri uzar.*`));
        if (alt === 'otomatik') {
          if (!i.memberPermissions.has(P.ManageGuild)) return hata(i, 'Bunun için **Sunucuyu Yönet** yetkisi gerekir.');
          db.ayarYaz(g, 'kamp.oto', i.options.getBoolean('açık'));
          return yanit(i, E(null, `✅ Otomatik kamp kartı ${i.options.getBoolean('açık') ? 'açık: ses kanalına giren herkes için kart kendiliğinden gelir' : 'kapalı'}.`, R.ok), true);
        }
        const kanal = i.member.voice.channel;
        if (!kanal) return hata(i, 'Önce bir ses kanalına gir.');
        if (alt === 'odun') {
          const h = await ifade(g, kanal.id, i.user.id, 'odun');
          if (h) return hata(i, h.mesaj);
          return yanit(i, E(null, `🪵 ${i.user} ateşe odun attı!\n${atesYaz(ates(g))}`));
        }
        return yanit(i, { embeds: [E('🔥 Ateş başına hoş geldin', `**${kanal.name}** kanalındaki herkes 3D sahnede ateşin etrafında oturuyor.\n\n• Biri girip çıktıkça sahne canlı güncellenir\n• Kanalın sohbetine yazılanlar konuşma balonu olur\n• Odun at, marshmallow kızart, selam ver, dans et, korku hikâyesi anlat\n\n*Bu bağlantı sana özeldir; başkasıyla paylaşma.*`)], components: [linkButonu(g, kanal.id, i.user.id)] }, true);
      } },
  ],
  bilesenler: {
    kamp: async (i, [islem]) => {
      const kanal = i.member.voice.channel;
      if (!kanal) return hata(i, 'Önce ses kanalına gir.');
      if (islem === 'odun') {
        const h = await ifade(i.guild.id, kanal.id, i.user.id, 'odun');
        if (h) return hata(i, h.mesaj);
        kartPlanla(i.guild, kanal.id);
        return yanit(i, E(null, `🪵 ${i.user} ateşe odun attı!`), false);
      }
      if (islem === 'foto') {
        await i.deferReply();
        const d = durum(i.guild.id, kanal.id);
        return i.editReply({ content: `📸 **${kanal.name}** hatırası — ${new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`, files: [await cizim.kampKart(d)] });
      }
      return yanit(i, { embeds: [E(null, 'Sana özel 3D sahne bağlantın hazır. Aç, ateşin başındaki yerini al 🔥\n*Bağlantı kişiye özeldir; paylaşma.*')], components: [linkButonu(i.guild.id, kanal.id, i.user.id)] }, true);
    },
  },
  hazir: async (ctx) => {
    client = ctx.client;
    muzik.degisince((g) => { const guild = client.guilds.cache.get(g); if (!guild) return; for (const c of kartlar.keys()) if (guild.channels.cache.has(c)) { kartPlanla(guild, c); guncelle(g, c); } });
    try {
      web = await sunucuBaslat({ port: config.port, saglayici: { dogrula, durum, eylem: (g, c, u, m) => (m.t === 'ifade' ? ifade(g, c, u, String(m.ad)) : null) } });
      console.log(`🔥 Kamp ateşi web sunucusu: ${config.publicUrl} (port ${web.port})`);
    } catch (e) { console.error(`Kamp ateşi web sunucusu başlatılamadı (port ${config.port}):`, e.message); }
  },
  olaylar: {
    voiceStateUpdate: async (eski, yeni) => {
      const g = yeni.guild.id;
      if (eski.channelId) guncelle(g, eski.channelId);
      if (yeni.channelId && yeni.channelId !== eski.channelId) guncelle(g, yeni.channelId);
      else if (yeni.channelId) guncelle(g, yeni.channelId);
      // Otomatik kart: giren/çıkan oldukça kanalın sohbetindeki kamp kartı güncellenir
      const guild = yeni.guild, atla = [db.ayar(g, 'ses.olustur'), guild.afkChannelId];
      if (eski.channelId && eski.channelId !== yeni.channelId && !atla.includes(eski.channelId)) kartPlanla(guild, eski.channelId);
      if (yeni.channelId && !atla.includes(yeni.channelId)) kartPlanla(guild, yeni.channelId, yeni.channelId !== eski.channelId && !yeni.member?.user.bot ? yeni.id : null);
    },
    // Ses kanalının sohbetine yazılanlar sahnede konuşma balonu olur
    messageCreate: (m) => {
      if (!m.guild || m.author.bot || !m.channel.isVoiceBased?.() || !m.content) return;
      if (web?.izlenen(m.guild.id, m.channelId)) web.yayin(m.guild.id, m.channelId, { t: 'sohbet', id: m.author.id, metin: m.cleanContent.slice(0, 90) });
    },
    guildMemberUpdate: (_e, yeni) => { if (yeni.voice?.channelId) guncelle(yeni.guild.id, yeni.voice.channelId); },
  },
  // Her dakika: sesteki insan sayısı kadar yakıt, günlük seri takibi
  async tik(ctx) {
    for (const guild of ctx.client.guilds.cache.values()) {
      const insan = guild.voiceStates.cache.filter((v) => v.channelId && !v.member?.user.bot).size;
      if (!insan && !db.ayar(guild.id, 'ates')) continue;
      const a = ates(guild.id);
      if (insan) {
        a.yakit = Math.min(100, a.yakit + 0.35 + Math.min(insan, 10) * 0.25);
        const bugun = gun();
        if (a.sonGun !== bugun) { a.seri = a.sonGun === gun(Date.now() - 864e5) ? a.seri + 1 : 1; a.sonGun = bugun; }
      }
      db.ayarYaz(guild.id, 'ates', a);
      web?.yayinSunucu(guild.id, () => ({ t: 'ates', ates: atesOzet(a) }));
    }
  },
};
