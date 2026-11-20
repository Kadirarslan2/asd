// Hesap bağlama: oyuncu Minecraft adını yazar, bot oyunda yalnızca ona görünen bir kod gönderir (RCON tellraw),
// oyuncu kodu Discord'a girer → hesap doğrulanmış olarak bağlanır, rol + coin + oyun içi ödül verilir.
// Ödül her Minecraft hesabı ve her Discord üyesi için yalnızca bir kez verilir.
const crypto = require('node:crypto');
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const rcon = require('../core/rcon');
const oyuncu = require('../core/oyuncu');
const { log } = require('../core/log');
const { E, R, yanit, hata, tamam, para, sayi } = require('../core/util');

const KOD_SURESI = 5 * 6e4;
// Varsayılan bağlama ödülü: her Paper/Spigot sunucusunda çalışan vanilla komutlar. /hesap-ayar ile değiştirilebilir.
const VARSAYILAN = {
  para: 1000,
  komutlar: ['give {oyuncu} minecraft:diamond 3', 'give {oyuncu} minecraft:golden_apple 2', 'give {oyuncu} minecraft:experience_bottle 16'],
  isimEsitle: false,
};
const ayar = (g) => ({ ...VARSAYILAN, ...db.ayar(g, 'hesap', {}) });
const bekleyen = new Map(); // guild:user -> { nick, kod, bitis, deneme }
const satir = (...b) => new ActionRowBuilder().addComponents(...b);
const kodButonu = () => satir(new ButtonBuilder().setCustomId('hesap:kodgir').setLabel('Kodu gir').setEmoji('🔑').setStyle(ButtonStyle.Success));
const sunucuAdres = (g) => require('./minecraft').ayar(g).adres;

async function baglamaBaslat(i, nickHam) {
  const g = i.guild.id, nick = String(nickHam || '').trim();
  if (!rcon.nickGecerli(nick)) return hata(i, 'Geçersiz Minecraft adı. 3-16 karakter; harf, rakam ve alt çizgi (Bedrock için başta nokta olabilir).');
  const u = db.uye(g, i.user.id);
  if (u.mc_nick && u.mc_dogrulandi && u.mc_nick.toLowerCase() === nick.toLowerCase()) return hata(i, `**${u.mc_nick}** zaten hesabına bağlı ve doğrulanmış ✅`);
  const sahip = db.mcBul(g, nick);
  if (sahip && sahip.user !== i.user.id && sahip.mc_dogrulandi) return hata(i, 'Bu Minecraft hesabı başka bir üyeye bağlı ve doğrulanmış. Senin hesabınsa destek talebi aç.');

  if (!rcon.hazir()) {
    // Sunucu konsol bağlantısı yoksa doğrulama yapılamaz: hesap "doğrulanmamış" bağlanır, oyun içi ödül verilmez
    if (sahip && sahip.user !== i.user.id) return hata(i, 'Bu Minecraft adı başka bir üyede kayıtlı.');
    db.uyeYaz(g, i.user.id, { mc_nick: nick, mc_dogrulandi: 0 });
    return yanit(i, E(null, `🔗 **${nick}** profiline bağlandı, ancak **doğrulanmadı**.\nSunucu konsol bağlantısı (RCON) henüz ayarlanmadığı için oyun içi doğrulama ve bağlama ödülü şu an kapalı. Yetkililer açınca \`/hesap bağla\` ile tekrar doğrulayabilirsin.`, R.altin).setThumbnail(cizim.kafaUrl(nick)), true);
  }
  await i.deferReply({ flags: 64 });
  let cevrimici;
  try { cevrimici = await rcon.cevrimici(nick); } catch (e) { return i.editReply({ embeds: [E(null, `❌ Oyun sunucusuna ulaşılamadı: ${e.message}`, R.hata)] }); }
  if (!cevrimici) return i.editReply({ embeds: [E('🎮 Önce oyuna gir', `Doğrulama kodu oyun içinde gönderilir. **${nick}** hesabıyla \`${sunucuAdres(g)}\` adresine bağlan, sonra bu komutu tekrar kullan.`, R.altin).setThumbnail(cizim.kafaUrl(nick))] });
  const kod = String(crypto.randomInt(100000, 1000000));
  try {
    await rcon.tellraw(nick, ['', { text: `\n[${require('./minecraft').ayar(g).ad}] `, color: 'green', bold: true }, { text: 'Discord doğrulama kodun: ', color: 'white' }, { text: kod, color: 'gold', bold: true },
      { text: `\nBu kodu Discord'daki "Kodu gir" butonuna yaz. 5 dakika geçerli, kimseyle paylaşma.\n`, color: 'gray' }]);
  } catch (e) { return i.editReply({ embeds: [E(null, `❌ Kod oyuna gönderilemedi: ${e.message}`, R.hata)] }); }
  bekleyen.set(`${g}:${i.user.id}`, { nick, kod, bitis: Date.now() + KOD_SURESI, deneme: 0 });
  return i.editReply({ embeds: [E('🔑 Kod oyuna gönderildi', `**${nick}** olarak oyunda sohbete 6 haneli bir kod düştü.\nAşağıdaki butona basıp kodu yaz. Kod **5 dakika** geçerli.`, R.ana).setThumbnail(cizim.kafaUrl(nick))], components: [kodButonu()] });
}

// Doğrulama sonrası: hesabı bağla, rol/isim ayarla, ödülü bir kez ver
async function baglamaTamamla(i, nick) {
  const g = i.guild, a = ayar(g.id);
  const eski = db.mcBul(g.id, nick);
  if (eski && eski.user !== i.user.id) db.uyeYaz(g.id, eski.user, { mc_nick: null, mc_dogrulandi: 0 }); // doğrulanmamış eski sahiplikten düşür
  db.uyeYaz(g.id, i.user.id, { mc_nick: nick, mc_dogrulandi: 1 });
  const notlar = [];
  const rol = db.ayar(g.id, 'rol.bagli');
  if (rol && g.roles.cache.has(rol)) await i.member.roles.add(rol).then(() => notlar.push(`<@&${rol}> rolü verildi`), () => notlar.push('⚠️ Rol verilemedi (bot rolü daha üstte olmalı)'));
  if (a.isimEsitle && i.member.manageable) await i.member.setNickname(nick, 'Minecraft hesabı bağlandı').then(() => notlar.push(`Sunucu takma adın **${nick}** yapıldı`), () => {});

  // Ödül: hem bu Discord üyesi hem bu Minecraft hesabı daha önce almadıysa
  const verilenler = db.ayar(g.id, 'hesap.odulVerilen', {});
  const odulHakki = !verilenler[nick.toLowerCase()] && !db.uye(g.id, i.user.id).veri.hesapOdul;
  let oyunIci = null;
  if (odulHakki) {
    verilenler[nick.toLowerCase()] = i.user.id;
    db.ayarYaz(g.id, 'hesap.odulVerilen', verilenler);
    db.veri(g.id, i.user.id, (v) => { v.hesapOdul = Date.now(); });
    if (a.para) db.arttir(g.id, i.user.id, 'para', a.para);
    oyunIci = await oyunIciOdul(g.id, i.user.id, nick, a.komutlar);
  }
  await oyuncu.basarimVer(g, i.user.id, 'hesap', i.channel);
  rcon.tellraw(nick, ['', { text: `[${require('./minecraft').ayar(g.id).ad}] `, color: 'green', bold: true }, { text: `Discord hesabın (${i.user.username}) bağlandı!`, color: 'white' }, ...(odulHakki && a.komutlar.length ? [{ text: ' Ödüllerin envanterinde.', color: 'gold' }] : [])]).catch(() => {});
  await log(g, E('🔗 Hesap bağlandı', `**Üye:** ${i.user}\n**Minecraft:** \`${nick}\` ✅ doğrulandı${odulHakki ? `\n**Ödül:** ${sayi(a.para)} coin${oyunIci ? ` + oyun içi (${oyunIci.basarili}/${oyunIci.toplam})` : ''}` : '\n*Ödül daha önce alınmış.*'}`, R.ok));
  return { odulHakki, oyunIci, notlar, a };
}
async function oyunIciOdul(g, userId, nick, komutlar) {
  if (!komutlar.length) return null;
  let basarili = 0;
  const kalan = [];
  for (const k of komutlar) {
    try { await rcon.calistir(k.replaceAll('{oyuncu}', nick)); basarili++; } catch { kalan.push(k); }
  }
  if (kalan.length) db.veri(g, userId, (v) => { v.bekleyenOdul = [...(v.bekleyenOdul || []), ...kalan]; });
  return { basarili, toplam: komutlar.length };
}

const panelGonder = async (kanal) => kanal.send({
  files: [await cizim.bannerKart({ ust: 'HESAP BAĞLA', baslik: 'Ödülünü al', alt: 'Minecraft hesabını bağla: rol, coin ve oyun içi ödül kazan', logo: true, dosya: 'hesap' })],
  embeds: [E(null, `**Nasıl bağlanır?**\n1. \`${sunucuAdres(kanal.guild.id)}\` sunucusuna gir\n2. Aşağıdaki **Hesabımı bağla** butonuna bas, Minecraft adını yaz\n3. Oyunda sohbete düşen 6 haneli kodu **Kodu gir** butonuna yaz\n\n🎁 **İlk bağlamaya özel ödül:** ${sayi(ayar(kanal.guild.id).para)} coin, özel rol${ayar(kanal.guild.id).komutlar.length ? ' ve oyun içi eşyalar' : ''}`, R.ana).setImage('attachment://hesap.png')],
  components: [satir(new ButtonBuilder().setCustomId('hesap:bagla').setLabel('Hesabımı bağla').setEmoji('🔗').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('hesap:kodgir').setLabel('Kodu gir').setEmoji('🔑').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('hesap:durum').setLabel('Hesabım').setEmoji('👤').setStyle(ButtonStyle.Secondary))],
});

module.exports = {
  ad: 'hesap',
  panelGonder, ayar, VARSAYILAN,
  komutlar: [
    { data: new SlashCommandBuilder().setName('hesap').setDescription('Minecraft hesabını bağla ve ödülünü al')
        .addSubcommand((s) => s.setName('bağla').setDescription('Hesabını oyun içi kodla doğrulayarak bağlar').addStringOption((o) => o.setName('oyuncu').setDescription('Minecraft adın').setRequired(true).setMaxLength(17)))
        .addSubcommand((s) => s.setName('ayır').setDescription('Bağlı hesabını kaldırır'))
        .addSubcommand((s) => s.setName('bak').setDescription('Bir üyenin bağlı hesabını gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')))
        .addSubcommand((s) => s.setName('ödül-al').setDescription('Teslim edilemeyen oyun içi ödüllerini tekrar dener')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'bağla') return baglamaBaslat(i, i.options.getString('oyuncu'));
        if (alt === 'ayır') {
          const u = db.uye(g, i.user.id);
          if (!u.mc_nick) return hata(i, 'Bağlı bir hesabın yok.');
          db.uyeYaz(g, i.user.id, { mc_nick: null, mc_dogrulandi: 0 });
          const rol = db.ayar(g, 'rol.bagli');
          if (rol) await i.member.roles.remove(rol).catch(() => {});
          return tamam(i, `**${u.mc_nick}** bağlantısı kaldırıldı. (Bağlama ödülü tekrar verilmez.)`, true);
        }
        if (alt === 'ödül-al') {
          const u = db.uye(g, i.user.id), l = u.veri.bekleyenOdul || [];
          if (!l.length) return hata(i, 'Bekleyen ödülün yok.');
          if (!u.mc_nick || !u.mc_dogrulandi) return hata(i, 'Önce hesabını doğrulayarak bağla.');
          await i.deferReply({ flags: 64 });
          if (!(await rcon.cevrimici(u.mc_nick).catch(() => false))) return i.editReply({ embeds: [E(null, '🎮 Ödüller envanterine teslim edileceği için önce oyuna gir.', R.altin)] });
          db.veri(g, i.user.id, (v) => { v.bekleyenOdul = []; });
          const s = await oyunIciOdul(g, i.user.id, u.mc_nick, l);
          return i.editReply({ embeds: [E(null, `🎁 ${s.basarili}/${s.toplam} ödül teslim edildi.${s.basarili < s.toplam ? ' Kalanlar için birazdan tekrar dene.' : ''}`, s.basarili ? R.ok : R.hata)] });
        }
        const user = i.options.getUser('üye') || i.user, u = db.uye(g, user.id);
        if (!u.mc_nick) return hata(i, user.id === i.user.id ? 'Bağlı hesabın yok. `/hesap bağla` kullan.' : 'Bu üyenin bağlı hesabı yok.');
        return yanit(i, E(null, `🔗 ${user} → **${u.mc_nick}** ${u.mc_dogrulandi ? '✅ doğrulandı' : '⚠️ doğrulanmadı'}`, R.ana).setThumbnail(cizim.kafaUrl(u.mc_nick)));
      } },
    { data: new SlashCommandBuilder().setName('hesap-ayar').setDescription('[Yönetici] Hesap bağlama ödülleri ve ayarları').setDefaultMemberPermissions(P.ManageGuild)
        .addSubcommand((s) => s.setName('göster').setDescription('Mevcut ödülleri ve bağlı hesap sayısını gösterir'))
        .addSubcommand((s) => s.setName('para').setDescription('Bağlayana verilecek Discord coin miktarı').addIntegerOption((o) => o.setName('miktar').setDescription('0 = yok').setRequired(true).setMinValue(0).setMaxValue(1000000)))
        .addSubcommand((s) => s.setName('komut-ekle').setDescription('Oyun içi ödül komutu ekler ({oyuncu} = oyuncu adı)').addStringOption((o) => o.setName('komut').setDescription('Örn: give {oyuncu} minecraft:diamond 5').setRequired(true).setMaxLength(200)))
        .addSubcommand((s) => s.setName('komut-sil').setDescription('Oyun içi ödül komutunu siler').addIntegerOption((o) => o.setName('sıra').setDescription('Listedeki sıra numarası').setRequired(true).setMinValue(1)))
        .addSubcommand((s) => s.setName('isim-eşitle').setDescription('Bağlayanın Discord takma adını Minecraft adı yapar').addBooleanOption((o) => o.setName('açık').setDescription('Açık mı?').setRequired(true)))
        .addSubcommand((s) => s.setName('kaldır').setDescription('Bir üyenin hesap bağlantısını kaldırır').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('panel').setDescription('Bu kanala hesap bağlama panelini gönderir')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id, a = db.ayar(g, 'hesap', {});
        const komutlar = () => a.komutlar ?? [...VARSAYILAN.komutlar];
        if (alt === 'göster') {
          const s = ayar(g), l = db.bagliHesaplar(g);
          return yanit(i, E('🔗 Hesap bağlama', `**Coin ödülü:** ${para(s.para)}\n**Oyun içi ödül komutları:**\n${s.komutlar.map((k, n) => `\`${n + 1}.\` \`${k}\``).join('\n') || '— yok'}\n**İsim eşitleme:** ${s.isimEsitle ? 'açık' : 'kapalı'}\n**Bağlı rol:** ${db.ayar(g, 'rol.bagli') ? `<@&${db.ayar(g, 'rol.bagli')}>` : '—'}\n**Konsol bağlantısı (RCON):** ${rcon.hazir() ? '✅ ayarlı' : '❌ ayarlı değil: doğrulama ve oyun içi ödül kapalı'}\n\n**Bağlı hesap:** ${l.length} (${l.filter((x) => x.mc_dogrulandi).length} doğrulanmış)`, R.bilgi), true);
        }
        if (alt === 'para') { a.para = i.options.getInteger('miktar'); db.ayarYaz(g, 'hesap', a); return tamam(i, `Bağlama ödülü ${para(a.para)} oldu.`, true); }
        if (alt === 'isim-eşitle') { a.isimEsitle = i.options.getBoolean('açık'); db.ayarYaz(g, 'hesap', a); return tamam(i, `İsim eşitleme ${a.isimEsitle ? 'açıldı' : 'kapatıldı'}.`, true); }
        if (alt === 'komut-ekle') {
          if (!i.memberPermissions.has(P.Administrator)) return hata(i, 'Konsol komutlarını yalnızca **Yönetici** ekleyebilir.');
          const k = i.options.getString('komut').trim().replace(/^\//, '');
          if (!k.includes('{oyuncu}')) return hata(i, 'Komutta `{oyuncu}` yer tutucusu olmalı. Örnek: `give {oyuncu} minecraft:diamond 5`');
          a.komutlar = [...komutlar(), k].slice(0, 10); db.ayarYaz(g, 'hesap', a);
          return tamam(i, `Ödül komutu eklendi (${a.komutlar.length}/10).`, true);
        }
        if (alt === 'komut-sil') {
          const l = komutlar(), n = i.options.getInteger('sıra');
          if (n > l.length) return hata(i, 'Bu sırada komut yok. `/hesap-ayar göster` ile listeye bak.');
          l.splice(n - 1, 1); a.komutlar = l; db.ayarYaz(g, 'hesap', a);
          return tamam(i, 'Ödül komutu silindi.', true);
        }
        if (alt === 'kaldır') {
          const user = i.options.getUser('üye'), u = db.uye(g, user.id);
          if (!u.mc_nick) return hata(i, 'Bu üyenin bağlı hesabı yok.');
          db.uyeYaz(g, user.id, { mc_nick: null, mc_dogrulandi: 0 });
          const rol = db.ayar(g, 'rol.bagli'), m = await i.guild.members.fetch(user.id).catch(() => null);
          if (rol && m) await m.roles.remove(rol).catch(() => {});
          await log(i.guild, E('🔗 Hesap bağlantısı kaldırıldı', `**Üye:** ${user}\n**Minecraft:** \`${u.mc_nick}\`\n**Yetkili:** ${i.user}`, R.gri));
          return tamam(i, `${user} kullanıcısının **${u.mc_nick}** bağlantısı kaldırıldı.`, true);
        }
        await i.deferReply({ flags: 64 });
        await panelGonder(i.channel);
        return i.editReply('Hesap bağlama paneli gönderildi.');
      } },
  ],
  bilesenler: {
    hesap: async (i, [islem]) => {
      const g = i.guild.id, k = `${g}:${i.user.id}`;
      if (islem === 'durum') {
        const u = db.uye(g, i.user.id);
        return yanit(i, u.mc_nick ? E(null, `🔗 Bağlı hesabın: **${u.mc_nick}** ${u.mc_dogrulandi ? '✅ doğrulandı' : '⚠️ doğrulanmadı'}${u.veri.bekleyenOdul?.length ? `\n🎁 Teslim edilmeyi bekleyen ${u.veri.bekleyenOdul.length} ödülün var: \`/hesap ödül-al\`` : ''}`, R.ana).setThumbnail(cizim.kafaUrl(u.mc_nick)) : E(null, 'Bağlı hesabın yok. **Hesabımı bağla** butonuna bas.', R.gri), true);
      }
      if (islem === 'bagla') {
        if (!i.isModalSubmit()) {
          return i.showModal(new ModalBuilder().setCustomId('hesap:bagla').setTitle('Minecraft hesabını bağla').addComponents(satir(
            new TextInputBuilder().setCustomId('nick').setLabel('Minecraft adın').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(17).setRequired(true))));
        }
        return baglamaBaslat(i, i.fields.getTextInputValue('nick'));
      }
      // kodgir
      const b = bekleyen.get(k);
      if (!i.isModalSubmit()) {
        if (!b || b.bitis < Date.now()) return hata(i, 'Bekleyen bir doğrulaman yok ya da süresi doldu. Önce **Hesabımı bağla** butonuna bas.');
        return i.showModal(new ModalBuilder().setCustomId('hesap:kodgir').setTitle(`Doğrulama: ${b.nick}`).addComponents(satir(
          new TextInputBuilder().setCustomId('kod').setLabel('Oyunda gelen 6 haneli kod').setStyle(TextInputStyle.Short).setMinLength(6).setMaxLength(6).setRequired(true))));
      }
      if (!b || b.bitis < Date.now()) { bekleyen.delete(k); return hata(i, 'Kodun süresi doldu. Baştan başla.'); }
      const girilen = i.fields.getTextInputValue('kod').trim();
      if (girilen !== b.kod) {
        if (++b.deneme >= 3) { bekleyen.delete(k); return hata(i, 'Kod 3 kez yanlış girildi; doğrulama iptal edildi. Baştan başla.'); }
        return hata(i, `Kod yanlış. ${3 - b.deneme} hakkın kaldı.`);
      }
      bekleyen.delete(k);
      const sahip = db.mcBul(g, b.nick);
      if (sahip && sahip.user !== i.user.id && sahip.mc_dogrulandi) return hata(i, 'Bu hesap bu arada başka bir üyeye bağlandı.');
      await i.deferReply();
      const s = await baglamaTamamla(i, b.nick);
      const kart = await cizim.bannerKart({ ust: 'HESAP BAĞLANDI', baslik: b.nick, alt: s.odulHakki ? `Ödül: ${sayi(s.a.para)} coin${s.oyunIci ? ' + oyun içi eşyalar' : ''}` : 'Discord ve Minecraft hesapları eşleşti', avatarUrl: cizim.kafaUrl(b.nick), ad: b.nick, dosya: 'baglandi' });
      return i.editReply({ content: `🎉 ${i.user} Minecraft hesabını bağladı!`, files: [kart],
        embeds: s.notlar.length || s.oyunIci?.basarili < s.oyunIci?.toplam ? [E(null, [...s.notlar, ...(s.oyunIci && s.oyunIci.basarili < s.oyunIci.toplam ? [`⚠️ ${s.oyunIci.toplam - s.oyunIci.basarili} oyun içi ödül teslim edilemedi; \`/hesap ödül-al\` ile tekrar dene.`] : [])].join('\n'), R.ok)] : [] });
    },
  },
  // Süresi dolan kodları temizle
  hizliTik() { const t = Date.now(); for (const [k, b] of bekleyen) if (b.bitis < t) bekleyen.delete(k); },
};
