// Genel: yardım menüsü, tek komutla tam kurulum, ayarlar, duyuru, bilgi komutları
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, OverwriteType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const { E, R, yanit, hata, tamam, zd, sayi, sureYaz } = require('../core/util');

const KATEGORILER = {
  '⛏️ Minecraft': ['sunucu', 'oyuncular', 'ip', 'oy', 'skin', 'hesap'],
  '📈 Seviye & Profil': ['profil', 'seviye', 'sıralama', 'görevler', 'başarımlar', 'rep'],
  '🪙 Ekonomi': ['bakiye', 'günlük', 'çalış', 'gönder', 'market', 'kumar', 'ödül'],
  '🎲 Eğlence': ['düello', 'tkm', 'aim', 'trivia'],
  '🎵 Müzik & Ses': ['müzik', 'oda'],
  '👥 Topluluk': ['şikayet', 'klan', 'anket', 'öneri', 'hatırlat', 'zaman-kapsülü', 'afk', 'doğumgünü', 'davetler'],
  '🛡️ Moderasyon': ['ban', 'kick', 'sustur', 'susturma-kaldır', 'uyar', 'uyarılar', 'uyarı-sil', 'sil', 'jail', 'unjail', 'yavaşmod', 'kilit', 'yasak-kaldır', 'sicil', 'not', 'otomod'],
  '👮 Yetkili Ekibi': ['yetkili', 'mesai', 'yetkili-ayar'],
  '💎 VIP': ['vip'],
  '🎮 Oyun Yönetimi': ['oyun', 'mc', 'hesap-ayar'],
  '⚙️ Yönetim': ['teşhis', 'kurulum', 'ayar', 'duyuru', 'çekiliş', 'ticket-panel', 'kurallar-panel', 'rol-panel', 'seviye-rol', 'karne', 'nabız'],
  'ℹ️ Bilgi': ['yardım', 'ping', 'avatar', 'sunucu-bilgi', 'kullanıcı'],
};
const KANAL_AYAR = {
  log: 'Moderasyon kayıtları', hosgeldin: 'Hoş geldin / güle güle', duyuru: 'Duyurular', durum: 'Sunucu açıldı/kapandı bildirimleri', basvuru: 'Başvurular (yetkili)', hesap: 'Hesap bağlama paneli', sikayet: 'Şikayetler (yetkili)', yetkiliDuyuru: 'Yetkili duyuruları / rütbe değişimleri', yetkiliBasvuru: 'Yetkili başvuruları (yetkili)', kadro: 'Yetkili kadrosu panosu', sohbet: 'Genel sohbet (takviye teşekkürleri)',
  seviye: 'Seviye ve başarım duyuruları', oneri: 'Öneriler', yildiz: 'Yıldız panosu (⭐)', sayma: 'Sayı sayma oyunu', kelime: 'Kelime zinciri oyunu', dogumgunu: 'Doğum günü kutlamaları',
};
const ROL_AYAR = { bagli: 'Hesap bağlı (Minecraft hesabını doğrulayan)', uye: 'Üye (kuralları kabul eden)', oyuncu: 'Oyuncu (başvurusu onaylanan)', destek: 'Yetkili ekibi (tüm yetkililer; yetkili kanalları ve talepler)', gorevde: 'Görevde (mesaideki yetkililer)', jail: 'Cezalı', oto: 'Yeni üyeye otomatik rol' };
// Kurulumda markete konan hazır oyun içi ürünler (RCON ile envantere teslim edilir)
const VARSAYILAN_MARKET = [
  { ad: '💎 5 Elmas', fiyat: 2500, komut: 'give {oyuncu} minecraft:diamond 5' },
  { ad: '🍎 3 Altın Elma', fiyat: 1200, komut: 'give {oyuncu} minecraft:golden_apple 3' },
  { ad: '🧪 32 Tecrübe Şişesi', fiyat: 900, komut: 'give {oyuncu} minecraft:experience_bottle 32' },
  { ad: '🥩 32 Pişmiş Biftek', fiyat: 400, komut: 'give {oyuncu} minecraft:cooked_beef 32' },
  { ad: '🔥 16 Demir Külçe', fiyat: 700, komut: 'give {oyuncu} minecraft:iron_ingot 16' },
  { ad: '🎆 16 Havai Fişek Roketi', fiyat: 600, komut: 'give {oyuncu} minecraft:firework_rocket 16' },
];
const RUTBELER = [[5, 'Odun', 0x9c6b3f], [10, 'Taş', 0x9aa0a6], [20, 'Demir', 0xd8d8d8], [30, 'Altın', 0xffd166], [40, 'Elmas', 0x5eead4], [50, 'Netherite', 0x6b5b73]];

// Tek komutla: roller, kategoriler, kanallar, paneller. Var olanlara dokunmaz, eksikleri tamamlar.
async function kurulum(i) {
  await i.deferReply();
  const g = i.guild, ben = i.client.user.id, yapilan = [], uyarilar = [];
  const mcMod = require('./minecraft');
  const adres = i.options.getString('adres')?.trim(), ad = i.options.getString('ad')?.trim();
  if (adres || ad) { const a = mcMod.ayar(g.id); if (adres) a.adres = adres; if (ad) a.ad = ad; a.tur ??= i.options.getString('tür') || 'java'; if (i.options.getString('tür')) a.tur = i.options.getString('tür'); db.ayarYaz(g.id, 'mc', a); mcMod.onbellekSil(g.id); }

  // --- Roller
  const rolAl = async (anahtar, veri) => {
    const mevcut = g.roles.cache.get(db.ayar(g.id, anahtar));
    if (mevcut) return mevcut;
    const r = await g.roles.create({ permissions: [], ...veri }); db.ayarYaz(g.id, anahtar, r.id); yapilan.push(`${r}`); return r;
  };
  const destek = await rolAl('rol.destek', { name: '🛡️ Yetkili Ekibi', color: 0x5ad1ff });
  const oyuncu = await rolAl('rol.oyuncu', { name: 'Oyuncu', color: 0x2ee66b, hoist: true });
  await rolAl('rol.uye', { name: 'Üye', color: 0x8fd9a8 });
  await rolAl('rol.bagli', { name: '🔗 Hesap Bağlı', color: 0x5eead4 });
  const cezali = await rolAl('rol.jail', { name: 'Cezalı', color: 0x555555 });
  await require('./yetkili').rolleriKur(g, yapilan);
  const seviyeRol = db.ayar(g.id, 'seviyeRolleri', {});
  for (const [lvl, isim, renk] of RUTBELER) {
    if (seviyeRol[lvl] && g.roles.cache.has(seviyeRol[lvl])) continue;
    seviyeRol[lvl] = (await g.roles.create({ name: `⛏️ ${isim}`, color: renk, permissions: [] })).id; yapilan.push(`<@&${seviyeRol[lvl]}> (seviye ${lvl})`);
  }
  db.ayarYaz(g.id, 'seviyeRolleri', seviyeRol);

  // --- Kategoriler ve kanallar
  const herkes = { id: g.id, type: OverwriteType.Role }, bot = { id: ben, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles, P.ManageChannels, P.ManageMessages, P.Connect] };
  const saltOkunur = [{ ...herkes, deny: [P.SendMessages, P.AddReactions] }, bot];
  const gizli = [{ ...herkes, deny: [P.ViewChannel] }, bot, { id: destek.id, type: OverwriteType.Role, allow: [P.ViewChannel, P.SendMessages] }];
  const yeniler = new Set();
  const kanalAl = async (anahtar, veri) => {
    const mevcut = g.channels.cache.get(db.ayar(g.id, anahtar));
    if (mevcut) return mevcut;
    const k = await g.channels.create(veri); db.ayarYaz(g.id, anahtar, k.id); yeniler.add(k.id);
    if (veri.type !== ChannelType.GuildCategory) yapilan.push(`${k}`);
    return k;
  };
  const kat = (anahtar, name, izin) => kanalAl(anahtar, { name, type: ChannelType.GuildCategory, permissionOverwrites: izin });
  const metin = (anahtar, name, parent, izin) => kanalAl(anahtar, { name, type: ChannelType.GuildText, parent: parent.id, ...(izin ? { permissionOverwrites: izin } : {}) });
  const ses = (anahtar, name, parent) => kanalAl(anahtar, { name, type: ChannelType.GuildVoice, parent: parent.id });

  const kBilgi = await kat('kategori.bilgi', '📢 BİLGİ', saltOkunur);
  const kKurallar = await metin('kanal.kurallar', '📜・kurallar', kBilgi, saltOkunur);
  await metin('kanal.duyuru', '📢・duyurular', kBilgi, saltOkunur);
  const kDurum = await metin('kanal.durum', '🟢・sunucu-durumu', kBilgi, saltOkunur);
  await metin('kanal.hosgeldin', '👋・hoş-geldin', kBilgi, saltOkunur);
  const kBasvuruPanel = await metin('kanal.basvuruPanel', '📝・başvuru', kBilgi, saltOkunur);
  const kHesap = await metin('kanal.hesap', '🔗・hesap-bağla', kBilgi, saltOkunur);
  const kKadro = await metin('kanal.kadro', '👮・yetkili-kadrosu', kBilgi, saltOkunur);
  const kVip = await metin('kanal.vip', '💎・vip-avantajları', kBilgi, saltOkunur);
  const kYBasvuru = await metin('kanal.yetkiliBasvuruPanel', '📝・yetkili-başvurusu', kBilgi, saltOkunur);

  const kTopluluk = await kat('kategori.topluluk', '💬 TOPLULUK');
  await metin('kanal.sohbet', '💬・sohbet', kTopluluk);
  await metin('kanal.medya', '📸・ekran-görüntüleri', kTopluluk);
  await metin('kanal.komut', '🤖・bot-komut', kTopluluk);
  await metin('kanal.seviye', '📈・seviye', kTopluluk, saltOkunur);
  await metin('kanal.oneri', '💡・öneriler', kTopluluk, saltOkunur);
  await metin('kanal.yildiz', '⭐・yıldızlar', kTopluluk, saltOkunur);
  await metin('kanal.sayma', '🔢・sayı-sayma', kTopluluk);
  await metin('kanal.kelime', '🔤・kelime-oyunu', kTopluluk);

  const kSes = await kat('kategori.ses', '🔊 SES');
  await ses('ses.olustur', '➕ Oda Oluştur', kSes);
  await ses('ses.genel', '🔊 Genel Sohbet', kSes);
  await ses('ses.muzik', '🎵 Müzik', kSes);

  const kDestek = await kat('kategori.destek', '🎫 DESTEK', saltOkunur);
  const kTicket = await metin('kanal.destek', '🎫・destek-talebi', kDestek, saltOkunur);
  await kat('kategori.ticket', '📂 AÇIK TALEPLER', gizli);

  const kYetkili = await kat('kategori.yetkili', '🛡️ YETKİLİ', gizli);
  await metin('kanal.log', '🛡️・mod-log', kYetkili, gizli);
  await metin('kanal.basvuru', '📥・başvurular', kYetkili, gizli);
  await metin('kanal.yetkiliSohbet', '💬・yetkili-sohbet', kYetkili, gizli);
  await metin('kanal.yetkiliDuyuru', '📣・yetkili-duyuru', kYetkili, gizli);
  await metin('kanal.sikayet', '🚨・şikayetler', kYetkili, gizli);
  await metin('kanal.yetkiliBasvuru', '🗂️・yetkili-başvuruları', kYetkili, gizli);
  await kanalAl('ses.toplanti', { name: '🎙️ Yetkili Toplantı', type: ChannelType.GuildVoice, parent: kYetkili.id, permissionOverwrites: gizli.map((o) => (o.id === destek.id ? { ...o, allow: [P.ViewChannel, P.Connect, P.Speak] } : o)) });
  const hucreYeni = !g.channels.cache.get(db.ayar(g.id, 'kanal.cezali'));
  await metin('kanal.cezali', '⛓️・cezalı', kYetkili, [{ ...herkes, deny: [P.ViewChannel] }, bot, { id: cezali.id, type: OverwriteType.Role, allow: [P.ViewChannel, P.SendMessages] }]);
  if (hucreYeni) for (const k of g.channels.cache.values()) if (k.type === ChannelType.GuildCategory || !k.parentId) { if (k.id !== db.ayar(g.id, 'kanal.cezali')) await k.permissionOverwrites?.edit(cezali, { ViewChannel: false }).catch(() => {}); }

  // --- Paneller (yalnızca yeni açılan kanallara)
  const dene = async (ad_, fn) => { try { await fn(); } catch (e) { uyarilar.push(`${ad_}: ${e.message}`); } };
  if (yeniler.has(kKurallar.id)) await dene('Kurallar paneli', () => require('./karsilama').kurallarPanelGonder(kKurallar));
  if (yeniler.has(kTicket.id)) await dene('Destek paneli', () => require('./ticket').panelGonder(kTicket));
  if (yeniler.has(kBasvuruPanel.id)) await dene('Başvuru paneli', () => mcMod.basvuruPanelGonder(kBasvuruPanel));
  if (yeniler.has(kHesap.id)) await dene('Hesap bağlama paneli', () => require('./hesap').panelGonder(kHesap));
  if (yeniler.has(kYBasvuru.id)) await dene('Yetkili başvuru paneli', () => require('./yetkili').basvuruPanelGonder(kYBasvuru));
  if (yeniler.has(kVip.id)) await dene('VIP paneli', async () => { const yt = require('../core/yetki'); await kVip.send({ files: [cizim.vipKart({ sunucu: mcMod.ayar(g.id).ad, paketler: yt.VIPLER.slice().reverse() })], embeds: [E(null, `${yt.VIPLER.slice().reverse().map((v) => `${v.emoji} **${v.ad}** — **${v.carpan}x** XP ve günlük ödül, özel rol ve renk`).join('\n')}\n🚀 **Sunucu takviyecileri** 1.25x XP ve takviye başına 2.500 coin alır.\n\nKendi durumun için \`/vip durum\`.`, R.altin).setImage('attachment://vip.png')] }); });
  if (yeniler.has(kKadro.id)) await dene('Kadro panosu', () => require('./yetkili').kadroYenile(g, true));
  if (db.ayar(g.id, 'market') === null) db.ayarYaz(g.id, 'market', VARSAYILAN_MARKET.map((u, n) => ({ id: `v${n}`, ...u })));
  const mcAdres = mcMod.ayar(g.id).adres;
  if (mcAdres && !db.belge.liste(g.id, 'mcpanel').length) await dene('Durum paneli', () => mcMod.canliPanelKur(g, kDurum));
  if (g.members.me.roles.highest.position <= oyuncu.position) uyarilar.push('Bot rolü yeni rollerin altında kaldı: Sunucu Ayarları → Roller\'den bot rolünü en üste taşı, yoksa rol veremem.');

  const kart = await cizim.bannerKart({ ust: 'KURULUM TAMAMLANDI', baslik: mcMod.ayar(g.id).ad || g.name, alt: yapilan.length ? `${yapilan.length} rol ve kanal oluşturuldu` : 'Her şey zaten kuruluydu', logo: true, dosya: 'kurulum' });
  await i.editReply({ files: [kart], embeds: [E(null, (yapilan.length ? `**Oluşturulanlar**\n${yapilan.join(' ').slice(0, 1800)}\n\n` : '') +
    `**Sıradaki adımlar**\n✅ \`${mcAdres}\` için canlı durum paneli kuruldu\n${require('../core/rcon').hazir() ? '✅ Konsol bağlantısı (RCON) çalışıyor: hesap doğrulama, ödüller ve oyun içi yönetim açık' : '➡️ `.env` dosyasına RCON bilgilerini gir: hesap doğrulama, oyun içi ödüller ve market teslimatı bununla çalışır'}\n➡️ Yetkililerine \`/yetkili ver\` ile rütbe ver (🌱 Deneme Rehber → 👑 Kurucu)\n➡️ \`/mc oy-ekle\` ile oy sitelerini, \`/hesap-ayar göster\` ile hesap bağlama ödüllerini kontrol et\n➡️ \`/otomod durum\` ile korumaları gözden geçir` +
    (uyarilar.length ? `\n\n**⚠️ Dikkat**\n${uyarilar.map((u) => `• ${u}`).join('\n')}` : ''), uyarilar.length ? R.altin : R.ok).setImage('attachment://kurulum.png')] });
}

const sunucuAdi = (g) => require('./minecraft').ayar(g.id).ad;
function yardimEmbed(ctx, kategori) {
  if (!kategori) return E(null, 'Aşağıdaki menüden bir **kategori seç**; o kategorideki tüm komutlar açıklamalarıyla listelenir.\n\n' + Object.entries(KATEGORILER).map(([k, v]) => `**${k}** · ${v.length} komut`).join('\n')).setImage('attachment://yardim.png');
  const satirlar = [];
  for (const ad of KATEGORILER[kategori] || []) {
    const k = ctx.komutlar.get(ad);
    if (k?.menu) continue;
    if (!k) continue;
    const j = k.data.toJSON(), altlar = (j.options || []).filter((o) => o.type === 1 || o.type === 2);
    if (altlar.length) for (const a of altlar) satirlar.push(`\`/${ad} ${a.name}\` — ${a.description}`);
    else satirlar.push(`\`/${ad}\` — ${j.description}`);
  }
  return E(kategori, satirlar.join('\n') || 'Komut yok.').setImage('attachment://yardim.png');
}
const yardimMenu = () => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('yardim').setPlaceholder('📚 Kategori seç…')
  .addOptions(Object.entries(KATEGORILER).map(([k, v]) => ({ label: k.replace(/^\S+\s/, ''), value: k, emoji: k.split(' ')[0], description: v.map((c) => `/${c}`).join(' ').slice(0, 100) }))));

module.exports = {
  ad: 'genel',
  KATEGORILER,
  komutlar: [
    { data: new SlashCommandBuilder().setName('yardım').setDescription('Tüm komutları kategorilere göre gösterir'),
      calistir: (i, ctx) => i.reply({ embeds: [yardimEmbed(ctx)], components: [yardimMenu()], files: [cizim.yardimKart(sunucuAdi(i.guild), Object.keys(KATEGORILER).length, ctx.komutlar.size)] }) },
    { data: new SlashCommandBuilder().setName('ping').setDescription('Botun gecikmesini gösterir'),
      calistir: (i) => yanit(i, E(null, `🏓 Gecikme: **${Math.max(0, Math.round(i.client.ws.ping))}ms** • Çalışma süresi: **${sureYaz(i.client.uptime)}**`, R.bilgi)) },
    { data: new SlashCommandBuilder().setName('avatar').setDescription('Bir üyenin avatarını gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => { const u = i.options.getUser('üye') || i.user; return yanit(i, E(`${u.username} avatarı`).setImage(u.displayAvatarURL({ size: 1024 }))); } },
    { data: new SlashCommandBuilder().setName('sunucu-bilgi').setDescription('Discord sunucusunun bilgilerini gösterir'),
      calistir: (i) => {
        const g = i.guild, ses = g.voiceStates.cache.filter((v) => v.channelId).size;
        return yanit(i, E(g.name).setThumbnail(g.iconURL({ size: 256 })).addFields(
          { name: 'Üye', value: sayi(g.memberCount), inline: true }, { name: 'Seste', value: String(ses), inline: true }, { name: 'Takviye', value: `${g.premiumSubscriptionCount || 0} (Seviye ${g.premiumTier})`, inline: true },
          { name: 'Kanal', value: String(g.channels.cache.size), inline: true }, { name: 'Rol', value: String(g.roles.cache.size), inline: true }, { name: 'Kuruluş', value: zd(g.createdTimestamp, 'D'), inline: true }));
      } },
    { data: new SlashCommandBuilder().setName('kullanıcı').setDescription('Bir üyenin hesap bilgilerini gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: async (i) => {
        const u = i.options.getUser('üye') || i.user, m = await i.guild.members.fetch(u.id).catch(() => null);
        const e = E(u.tag).setThumbnail(u.displayAvatarURL({ size: 256 })).addFields({ name: 'ID', value: u.id, inline: true }, { name: 'Hesap açılış', value: zd(u.createdTimestamp, 'D'), inline: true });
        if (m) e.addFields({ name: 'Sunucuya katılış', value: zd(m.joinedTimestamp, 'D'), inline: true }, { name: 'Minecraft', value: db.uye(i.guild.id, u.id).mc_nick || 'Bağlı değil', inline: true },
          { name: `Roller (${m.roles.cache.size - 1})`, value: m.roles.cache.filter((r) => r.id !== i.guild.id).sort((a, b) => b.position - a.position).first(15).join(' ') || 'Yok' });
        return yanit(i, e);
      } },
    { data: new SlashCommandBuilder().setName('kurulum').setDescription('Tüm kanalları, rolleri ve panelleri tek komutla kurar').setDefaultMemberPermissions(P.Administrator)
        .addStringOption((o) => o.setName('adres').setDescription('Minecraft sunucu adresi (örn: play.sunucun.com)'))
        .addStringOption((o) => o.setName('ad').setDescription('Sunucunun görünen adı').setMaxLength(40))
        .addStringOption((o) => o.setName('tür').setDescription('Sunucu türü').addChoices({ name: 'Java', value: 'java' }, { name: 'Bedrock', value: 'bedrock' })),
      calistir: kurulum },
    { data: new SlashCommandBuilder().setName('duyuru').setDescription('Duyuru kanalına resimli duyuru gönderir').setDefaultMemberPermissions(P.ManageGuild)
        .addStringOption((o) => o.setName('başlık').setDescription('Başlık').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('metin').setDescription('Duyuru metni (satır başı için \\n yaz)').setRequired(true).setMaxLength(1800))
        .addStringOption((o) => o.setName('etiket').setDescription('Kimler etiketlensin').addChoices({ name: 'Kimse', value: 'yok' }, { name: '@everyone', value: 'everyone' }, { name: '@here', value: 'here' }))
        .addBooleanOption((o) => o.setName('oyuna-da').setDescription('Duyuru oyundaki herkese de gönderilsin (RCON gerekir)')),
      calistir: async (i) => {
        const kanal = i.guild.channels.cache.get(db.ayar(i.guild.id, 'kanal.duyuru')) || i.channel, etiket = i.options.getString('etiket') || 'yok';
        await i.deferReply({ flags: 64 });
        const kart = await cizim.bannerKart({ ust: 'DUYURU', baslik: i.options.getString('başlık'), alt: sunucuAdi(i.guild), logo: true, dosya: 'duyuru' });
        await kanal.send({ content: etiket === 'yok' ? undefined : `@${etiket}`, allowedMentions: { parse: etiket === 'yok' ? [] : ['everyone'] }, files: [kart],
          embeds: [E(null, i.options.getString('metin').replaceAll('\\n', '\n'), R.ana).setImage('attachment://duyuru.png').setFooter({ text: `Duyuran: ${i.member.displayName}` }).setTimestamp()] });
        let oyun = '';
        if (i.options.getBoolean('oyuna-da')) {
          const rcon = require('../core/rcon');
          oyun = !rcon.hazir() ? ' ⚠️ RCON ayarlı değil, oyuna gönderilemedi.' : await rcon.tellraw('@a', ['', { text: '\n[DUYURU] ', color: 'green', bold: true }, { text: `${i.options.getString('başlık')}: `, color: 'gold', bold: true }, { text: i.options.getString('metin').replaceAll('\\n', ' ').slice(0, 250), color: 'white' }, { text: '\n' }]).then(() => ' Oyuna da gönderildi.', (e) => ` ⚠️ Oyuna gönderilemedi: ${e.message}`);
        }
        return i.editReply(`Duyuru ${kanal} kanalına gönderildi.${oyun}`);
      } },
    { data: new SlashCommandBuilder().setName('ayar').setDescription('Bot ayarları').setDefaultMemberPermissions(P.ManageGuild)
        .addSubcommand((s) => s.setName('kanal').setDescription('Bir özelliğin kanalını ayarlar (kanal boşsa kapatır)')
          .addStringOption((o) => o.setName('tür').setDescription('Hangi özellik').setRequired(true).addChoices(...Object.entries(KANAL_AYAR).map(([value, name]) => ({ name, value }))))
          .addChannelOption((o) => o.setName('kanal').setDescription('Kanal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
        .addSubcommand((s) => s.setName('rol').setDescription('Bir özelliğin rolünü ayarlar (rol boşsa kapatır)')
          .addStringOption((o) => o.setName('tür').setDescription('Hangi rol').setRequired(true).addChoices(...Object.entries(ROL_AYAR).map(([value, name]) => ({ name, value }))))
          .addRoleOption((o) => o.setName('rol').setDescription('Rol')))
        .addSubcommand((s) => s.setName('oda-kanalı').setDescription('Girince özel oda açılan ses kanalını ayarlar').addChannelOption((o) => o.setName('kanal').setDescription('Ses kanalı').addChannelTypes(ChannelType.GuildVoice)))
        .addSubcommand((s) => s.setName('mesaj').setDescription('Hoş geldin mesajını ayarlar ({üye} {sunucu} {sayı} kullanılabilir)').addStringOption((o) => o.setName('metin').setDescription('Mesaj metni').setRequired(true).setMaxLength(500)))
        .addSubcommand((s) => s.setName('göster').setDescription('Mevcut ayarları listeler')),
      calistir: (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'göster') {
          const k = Object.entries(KANAL_AYAR).map(([a, ad]) => `${ad}: ${db.ayar(g, `kanal.${a}`) ? `<#${db.ayar(g, `kanal.${a}`)}>` : '—'}`);
          const r = Object.entries(ROL_AYAR).map(([a, ad]) => `${ad}: ${db.ayar(g, `rol.${a}`) ? `<@&${db.ayar(g, `rol.${a}`)}>` : '—'}`);
          const mc = require('./minecraft').ayar(g);
          return yanit(i, E('⚙️ Ayarlar', [`**Minecraft:** ${mc.adres ? `\`${mc.adres}\` (${mc.tur || 'java'})` : '— (`/mc ayarla`)'}`, `**Oda oluşturma kanalı:** ${db.ayar(g, 'ses.olustur') ? `<#${db.ayar(g, 'ses.olustur')}>` : '—'}`, '', ...k, '', ...r].join('\n'), R.bilgi), true);
        }
        if (alt === 'mesaj') { db.ayarYaz(g, 'hosgeldin.mesaj', i.options.getString('metin')); return tamam(i, 'Hoş geldin mesajı güncellendi.', true); }
        if (alt === 'oda-kanalı') { const k = i.options.getChannel('kanal'); db.ayarYaz(g, 'ses.olustur', k?.id ?? null); return tamam(i, k ? `${k} kanalına giren herkese özel oda açılacak.` : 'Özel oda sistemi kapatıldı.', true); }
        const hedef = alt === 'rol' ? i.options.getRole('rol') : i.options.getChannel('kanal');
        db.ayarYaz(g, `${alt}.${i.options.getString('tür')}`, hedef?.id ?? null);
        return tamam(i, hedef ? `Ayarlandı → ${hedef}` : 'Ayar kapatıldı.', true);
      } },
    { data: new SlashCommandBuilder().setName('teşhis').setDescription('Botun neden çalışmadığını kontrol eder: komutlar, yetkiler, Minecraft, RCON').setDefaultMemberPermissions(P.ManageGuild),
      calistir: async (i, ctx) => {
        await i.deferReply({ flags: 64 });
        const config = require('../core/config'), rcon = require('../core/rcon'), mc = require('./minecraft');
        const satir = [], ok = (v) => (v ? '✅' : '❌');
        // Komutlar
        const kayitli = await i.guild.commands.fetch().catch(() => null);
        satir.push(`${ok(kayitli?.size === ctx.komutlar.size)} **Komutlar:** ${kayitli ? `${kayitli.size}/${ctx.komutlar.size} kayıtlı` : 'okunamadı'}${config.guildId && config.guildId !== i.guild.id ? `\n   ⚠️ .env içindeki GUILD_ID (${config.guildId}) bu sunucunun ID'si değil (${i.guild.id}). Düzeltip botu yeniden başlat.` : ''}`);
        // Yetkiler
        const ben = i.guild.members.me;
        const GEREK = [[P.Administrator, 'Yönetici'], [P.ManageChannels, 'Kanalları Yönet'], [P.ManageRoles, 'Rolleri Yönet'], [P.MoveMembers, 'Üyeleri Taşı'], [P.ModerateMembers, 'Üyelere Zaman Aşımı'], [P.BanMembers, 'Üyeleri Yasakla'], [P.ManageMessages, 'Mesajları Yönet'], [P.EmbedLinks, 'Bağlantı Yerleştir'], [P.AttachFiles, 'Dosya Ekle']];
        const eksik = ben.permissions.has(P.Administrator) ? [] : GEREK.slice(1).filter(([f]) => !ben.permissions.has(f)).map(([, ad]) => ad);
        satir.push(`${ok(!eksik.length)} **Bot yetkileri:** ${eksik.length ? `eksik → ${eksik.join(', ')}` : 'tamam'}`);
        const ustRoller = i.guild.roles.cache.filter((r) => r.position > ben.roles.highest.position && !r.managed).size;
        satir.push(`${ok(ustRoller === 0)} **Bot rolünün sırası:** ${ustRoller ? `${ustRoller} rol botun üstünde. Sunucu Ayarları → Roller'den bot rolünü en üste sürükle.` : 'en üstte'}`);
        // Kanal yetkisi
        const buKanal = i.channel?.permissionsFor?.(ben);
        if (buKanal) satir.push(`${ok(buKanal.has(P.SendMessages) && buKanal.has(P.EmbedLinks) && buKanal.has(P.AttachFiles))} **Bu kanal:** ${buKanal.has(P.SendMessages) && buKanal.has(P.EmbedLinks) && buKanal.has(P.AttachFiles) ? 'mesaj, bağlantı ve dosya gönderebiliyorum' : 'bu kanalda mesaj/dosya gönderme iznim eksik'}`);
        // Minecraft
        const a = mc.ayar(i.guild.id);
        mc.onbellekSil(i.guild.id);
        const d = await mc.durumAl(i.guild, true);
        satir.push(`${ok(d.acik)} **Minecraft (${a.adres}):** ${d.acik ? `açık, ${d.oyuncu}/${d.max} oyuncu${d.kaynak === 'rcon' ? ' (RCON üzerinden; ping atılamadı)' : ''}` : `ulaşılamadı → ${d.sebep}\n   Bot ile Minecraft aynı bilgisayardaysa .env'e \`MC_SORGU_ADRES=127.0.0.1:25565\` yaz. Değilse adresin ve portun doğru, sunucunun açık olduğundan emin ol.`}`);
        // RCON
        if (!rcon.hazir()) satir.push('⚠️ **RCON:** ayarlı değil → hesap doğrulama, oyun içi ödül ve oyun yönetimi kapalı. `.env` → `MC_RCON_HOST`, `MC_RCON_PASSWORD`');
        else {
          const r = await rcon.calistir('list').then(() => null, (e) => e.message);
          satir.push(`${ok(!r)} **RCON (${config.rcon.host}:${config.rcon.port}):** ${r || 'bağlantı çalışıyor'}`);
        }
        satir.push(`${ok(i.guild.channels.cache.has(db.ayar(i.guild.id, 'kanal.log')))} **Kurulum:** ${i.guild.channels.cache.has(db.ayar(i.guild.id, 'kanal.log')) ? 'yapılmış' : 'yapılmamış → `/kurulum` yaz'}`);
        const sorunlu = satir.filter((x) => x.startsWith('❌')).length;
        return i.editReply({ embeds: [E(`🩺 Teşhis — ${sorunlu ? `${sorunlu} sorun bulundu` : 'her şey yolunda'}`, satir.join('\n\n'), sorunlu ? R.altin : R.ok).setFooter({ text: `Discord gecikmesi ${Math.round(i.client.ws.ping)}ms • Node ${process.versions.node}` })] });
      } },
    { data: new SlashCommandBuilder().setName('nabız').setDescription('Sunucunun son 24 saatlik aktivite grafiğini gösterir'),
      calistir: (i) => {
        const v = db.aktiviteSon(i.guild.id, 24);
        const ciz = (alan) => { const mx = Math.max(1, ...v.map((x) => x[alan])); return v.map((x) => ' ▁▂▃▄▅▆▇█'[Math.ceil((x[alan] / mx) * 8)]).join(''); };
        const top = (alan) => v.reduce((a, x) => a + x[alan], 0);
        const zirve = v.reduce((a, x) => (x.mesaj + x.ses > a.mesaj + a.ses ? x : a), v[0]);
        return yanit(i, E('💓 Sunucu Nabzı — son 24 saat', `💬 Mesaj (${sayi(top('mesaj'))})\n\`${ciz('mesaj')}\`\n🎙️ Ses dakikası (${sayi(top('ses'))})\n\`${ciz('ses')}\`\n\nEn hareketli saat: ${zd(zirve.saat * 3600000, 't')}`, R.bilgi));
      } },
  ],
  bilesenler: { yardim: (i, _a, ctx) => i.update({ embeds: [yardimEmbed(ctx, i.values[0])], components: [yardimMenu()] }) },
  olaylar: { messageCreate: (m) => { if (m.guild && !m.author?.bot) db.aktivite(m.guild.id, 'mesaj'); } },
  RUTBELER,
};
