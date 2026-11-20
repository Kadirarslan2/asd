// Minecraft: sunucu durumu kartı, canlı panel, açıldı/kapandı bildirimi, IP/oy bağlantıları,
// skin görüntüleme, whitelist başvuruları ve RCON konsolu
const { SlashCommandBuilder, PermissionFlagsBits: P, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const rcon = require('../core/rcon');
const oyuncu = require('../core/oyuncu');
const { sorgula, adresAyir } = require('../core/sorgu');
const { log } = require('../core/log');
const { E, R, yanit, hata, tamam, zd, sayi } = require('../core/util');

// Sunucu ayarları: varsayılan AuraCraft (auracraft.net.tr); /mc ayarla ile değişir
const config = require('../core/config');
const ayar = (g) => { const a = db.ayar(g, 'mc', {}); return { ...a, ad: a.ad || config.sunucu.ad, adres: a.adres || config.sunucu.adres, tur: a.tur || config.sunucu.tur }; };
const onbellek = new Map(); // guild -> { t, veri }
const satir = (...b) => new ActionRowBuilder().addComponents(...b);
const linkBtn = (ad, url, emoji) => new ButtonBuilder().setLabel(ad).setURL(url).setStyle(ButtonStyle.Link).setEmoji(emoji);
const urlGecerli = (u) => /^https:\/\/[^\s<>"]{4,200}$/i.test(u || '');

// Sunucunun güncel durumu (30 sn önbellekli). Kapalıysa { acik: false, sebep } döner.
async function durumAl(guild, zorla = false) {
  const a = ayar(guild.id);
  if (!a.adres) return null;
  const o = onbellek.get(guild.id);
  if (!zorla && o && Date.now() - o.t < 30_000) return o.veri;
  let veri;
  try {
    const s = await sorgula(a.tur, a.adres);
    const rekor = Math.max(db.ayar(guild.id, 'mc.rekor', 0), s.oyuncu);
    if (rekor > db.ayar(guild.id, 'mc.rekor', 0)) db.ayarYaz(guild.id, 'mc.rekor', rekor);
    veri = { acik: true, ...s, rekor };
  } catch (e) { veri = { acik: false, sebep: e.message }; }
  veri = { ...veri, ad: a.ad || guild.name, adres: a.adres };
  onbellek.set(guild.id, { t: Date.now(), veri });
  return veri;
}
function baglantiButonlari(g) {
  const a = ayar(g), l = [];
  if (a.site) l.push(linkBtn('Web sitesi', a.site, '🌐'));
  if (a.magaza) l.push(linkBtn('Mağaza', a.magaza, '🛒'));
  for (const o of (a.oy || []).slice(0, 2)) l.push(linkBtn(o.ad, o.url, '🗳️'));
  return l;
}
async function durumMesaj(guild, zorla = false) {
  const d = await durumAl(guild, zorla);
  if (!d) return null;
  const butonlar = [new ButtonBuilder().setCustomId('mc:yenile').setLabel('Yenile').setEmoji('🔄').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('mc:ip').setLabel('Nasıl girerim?').setEmoji('🎮').setStyle(ButtonStyle.Success), ...baglantiButonlari(guild.id)];
  return { files: [await cizim.sunucuKart(d)], components: [satir(...butonlar.slice(0, 5))], attachments: [] };
}
const ayarsiz = (i) => hata(i, 'Minecraft sunucu adresi henüz ayarlanmamış. Bir yönetici `/mc ayarla` komutunu kullanmalı.');
function girisEmbed(guild) {
  const a = ayar(guild.id), bedrock = a.tur === 'bedrock';
  return E(`🎮 ${a.ad || guild.name} — Nasıl girilir?`, `**Sunucu adresi**\n\`\`\`\n${a.adres}\n\`\`\`\n${bedrock
    ? '**Bedrock (telefon / konsol / Windows)**\n1. Minecraft\'ı aç → **Oyna** → **Sunucular**\n2. En alttan **Sunucu Ekle**\'ye bas\n3. Adresi yapıştır, portu gir ve kaydet'
    : '**Java Edition**\n1. Minecraft\'ı aç → **Çok Oyunculu**\n2. **Sunucu Ekle**\'ye bas\n3. Adresi yapıştır → **Bitti** → sunucuya çift tıkla'}${a.surum ? `\n\n**Sürüm:** ${a.surum}` : ''}`, R.ana);
}

// ---------- Başvuru ----------
const basvuruModal = () => new ModalBuilder().setCustomId('basvuru:gonder').setTitle('Sunucu Başvurusu').addComponents(
  satir(new TextInputBuilder().setCustomId('nick').setLabel('Minecraft kullanıcı adın').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(17).setRequired(true)),
  satir(new TextInputBuilder().setCustomId('yas').setLabel('Yaşın').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)),
  satir(new TextInputBuilder().setCustomId('neden').setLabel('Neden katılmak istiyorsun?').setPlaceholder('Bizi nereden buldun, sunucuda ne yapmak istiyorsun?').setStyle(TextInputStyle.Paragraph).setMaxLength(600).setRequired(true)));
const basvuruButonlari = (id, kapali = false) => [satir(
  new ButtonBuilder().setCustomId(`basvuru:onay:${id}`).setLabel('Onayla').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(kapali),
  new ButtonBuilder().setCustomId(`basvuru:red:${id}`).setLabel('Reddet').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(kapali))];

async function canliPanelKur(guild, kanal) {
  for (const p of db.belge.liste(guild.id, 'mcpanel')) { db.belge.sil(p.id); guild.channels.cache.get(p.kanal)?.messages.delete(p.mesaj).catch(() => {}); }
  const { attachments, ...mesaj } = await durumMesaj(guild, true);
  const m = await kanal.send(mesaj);
  db.belge.ekle(guild.id, 'mcpanel', { kanal: kanal.id, mesaj: m.id });
}
const basvuruPanelGonder = async (kanal) => kanal.send({ files: [await cizim.bannerKart({ ust: 'SUNUCUYA KATIL', baslik: 'Başvuru', alt: 'Butona bas, kısa formu doldur, yetkililer onaylasın', logo: true, dosya: 'basvuru' })],
  components: [satir(new ButtonBuilder().setCustomId('basvuru:ac').setLabel('Başvuru yap').setEmoji('📝').setStyle(ButtonStyle.Success))] });

module.exports = {
  ad: 'minecraft',
  durumAl, ayar, canliPanelKur, basvuruPanelGonder, onbellekSil: (g) => onbellek.delete(g),
  komutlar: [
    { data: new SlashCommandBuilder().setName('sunucu').setDescription('Minecraft sunucusunun canlı durumunu gösterir'),
      calistir: async (i) => {
        if (!ayar(i.guild.id).adres) return ayarsiz(i);
        await i.deferReply();
        return i.editReply(await durumMesaj(i.guild));
      } },
    { data: new SlashCommandBuilder().setName('ip').setDescription('Sunucu adresini ve nasıl girileceğini gösterir'),
      calistir: (i) => (ayar(i.guild.id).adres ? i.reply({ embeds: [girisEmbed(i.guild)], components: baglantiButonlari(i.guild.id).length ? [satir(...baglantiButonlari(i.guild.id))] : [] }) : ayarsiz(i)) },
    { data: new SlashCommandBuilder().setName('oy').setDescription('Sunucuya oy verme bağlantılarını gösterir'),
      calistir: (i) => {
        const l = ayar(i.guild.id).oy || [];
        if (!l.length) return hata(i, 'Henüz oy bağlantısı eklenmemiş. (Yönetici: `/mc oy-ekle`)');
        return i.reply({ embeds: [E('🗳️ Sunucuya oy ver', 'Oy vererek sunucunun listelerde yükselmesine yardım et. Her bağlantıdan günde bir kez oy verebilirsin.', R.altin)], components: [satir(...l.slice(0, 5).map((o) => linkBtn(o.ad, o.url, '🗳️')))] });
      } },
    { data: new SlashCommandBuilder().setName('skin').setDescription('Bir Minecraft oyuncusunun skinini gösterir')
        .addStringOption((o) => o.setName('oyuncu').setDescription('Minecraft kullanıcı adı (boşsa bağlı hesabın)').setMaxLength(17)),
      calistir: (i) => {
        const nick = i.options.getString('oyuncu')?.trim() || db.uye(i.guild.id, i.user.id).mc_nick;
        if (!nick) return hata(i, 'Bir oyuncu adı yaz ya da `/hesap bağla` ile hesabını bağla.');
        if (!rcon.nickGecerli(nick)) return hata(i, 'Geçersiz Minecraft kullanıcı adı.');
        const n = encodeURIComponent(nick);
        return i.reply({ embeds: [E(`🧍 ${nick}`, null, R.ana).setImage(`https://mc-heads.net/body/${n}/300`).setThumbnail(`https://mc-heads.net/avatar/${n}/128`)],
          components: [satir(linkBtn('Skini indir', `https://mc-heads.net/download/${n}`, '⬇️'), linkBtn('NameMC', `https://namemc.com/profile/${n}`, '🔎'))] });
      } },
    { data: new SlashCommandBuilder().setName('mc').setDescription('[Yönetici] Minecraft sunucu ayarları').setDefaultMemberPermissions(P.ManageGuild)
        .addSubcommand((s) => s.setName('ayarla').setDescription('Sunucu adresini ve bağlantıları ayarlar')
          .addStringOption((o) => o.setName('adres').setDescription('Örn: play.sunucum.com ya da 1.2.3.4:25565'))
          .addStringOption((o) => o.setName('tür').setDescription('Sunucu türü').addChoices({ name: 'Java', value: 'java' }, { name: 'Bedrock', value: 'bedrock' }))
          .addStringOption((o) => o.setName('ad').setDescription('Sunucunun görünen adı').setMaxLength(40))
          .addStringOption((o) => o.setName('sürüm').setDescription('Örn: 1.8 - 1.21 (bilgi amaçlı)').setMaxLength(40))
          .addStringOption((o) => o.setName('site').setDescription('Web sitesi (https://…)'))
          .addStringOption((o) => o.setName('mağaza').setDescription('Mağaza linki (https://…)')))
        .addSubcommand((s) => s.setName('oy-ekle').setDescription('Oy verme bağlantısı ekler')
          .addStringOption((o) => o.setName('ad').setDescription('Site adı').setRequired(true).setMaxLength(40)).addStringOption((o) => o.setName('link').setDescription('https://…').setRequired(true)))
        .addSubcommand((s) => s.setName('oy-temizle').setDescription('Tüm oy bağlantılarını siler'))
        .addSubcommand((s) => s.setName('panel').setDescription('Bu kanala her dakika güncellenen canlı durum paneli kurar'))
        .addSubcommand((s) => s.setName('başvuru-panel').setDescription('Bu kanala sunucu başvuru panelini gönderir'))
        .addSubcommand((s) => s.setName('rcon').setDescription('Minecraft konsolunda komut çalıştırır (yalnızca Yönetici)').addStringOption((o) => o.setName('komut').setDescription('Örn: say Merhaba').setRequired(true).setMaxLength(300))),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id, a = ayar(g);
        if (alt === 'ayarla') {
          const adres = i.options.getString('adres')?.trim();
          if (adres) { try { adresAyir(adres, 25565); } catch (e) { return hata(i, e.message); } a.adres = adres; }
          for (const [sec, alan] of [['site', 'site'], ['mağaza', 'magaza']]) { const v = i.options.getString(sec)?.trim(); if (v) { if (!urlGecerli(v)) return hata(i, `\`${sec}\` için https:// ile başlayan geçerli bir link gir.`); a[alan] = v; } }
          for (const [sec, alan] of [['tür', 'tur'], ['ad', 'ad'], ['sürüm', 'surum']]) { const v = i.options.getString(sec); if (v) a[alan] = v; }
          db.ayarYaz(g, 'mc', a); onbellek.delete(g);
          if (!a.adres) return tamam(i, 'Ayarlar kaydedildi. Durum kartı için bir de `adres` gir.', true);
          await i.deferReply({ flags: 64 });
          const d = await durumAl(i.guild, true);
          return i.editReply({ embeds: [E(null, `✅ Ayarlar kaydedildi.\n${d.acik ? `Sunucuya ulaşıldı: **${d.oyuncu}/${d.max}** oyuncu, ${d.surum}.` : `⚠️ Sunucuya şu an ulaşılamadı (${d.sebep}) Adres ve tür doğru mu?`}\n\nSıradaki: \`/mc panel\` ile canlı durum paneli kur.`, d.acik ? R.ok : R.altin)] });
        }
        if (alt === 'oy-ekle') {
          const link = i.options.getString('link').trim();
          if (!urlGecerli(link)) return hata(i, 'https:// ile başlayan geçerli bir link gir.');
          a.oy = [...(a.oy || []), { ad: i.options.getString('ad'), url: link }].slice(-5);
          db.ayarYaz(g, 'mc', a);
          return tamam(i, `Oy bağlantısı eklendi (${a.oy.length}/5). Üyeler \`/oy\` ile görebilir.`, true);
        }
        if (alt === 'oy-temizle') { a.oy = []; db.ayarYaz(g, 'mc', a); return tamam(i, 'Oy bağlantıları silindi.', true); }
        if (alt === 'panel') {
          if (!a.adres) return ayarsiz(i);
          await i.deferReply({ flags: 64 });
          await canliPanelKur(i.guild, i.channel);
          return i.editReply('Canlı panel kuruldu; her dakika güncellenecek.');
        }
        if (alt === 'başvuru-panel') {
          await basvuruPanelGonder(i.channel);
          return tamam(i, `Başvuru paneli gönderildi. Başvurular ${db.ayar(g, 'kanal.basvuru') ? `<#${db.ayar(g, 'kanal.basvuru')}>` : '**başvuru kanalına** (`/ayar kanal` ile ayarla)'} düşer.`, true);
        }
        // rcon
        if (!i.memberPermissions.has(P.Administrator)) return hata(i, 'Konsol komutlarını yalnızca **Yönetici** yetkisi olanlar çalıştırabilir.');
        await i.deferReply({ flags: 64 });
        const komut = i.options.getString('komut').replace(/^\//, '');
        try {
          const cikti = await rcon.calistir(komut);
          await log(i.guild, E('🖥️ RCON', `**Yetkili:** ${i.user}\n**Komut:** \`${komut}\``, R.gri));
          return i.editReply({ embeds: [E('🖥️ Konsol', `\`> ${komut}\`\n\`\`\`\n${(cikti || '(çıktı yok)').slice(0, 3500)}\n\`\`\``, R.ok)] });
        } catch (e) { return i.editReply({ embeds: [E(null, `❌ ${e.message}`, R.hata)] }); }
      } },
  ],
  bilesenler: {
    mc: async (i, [islem]) => {
      if (islem === 'ip') return yanit(i, girisEmbed(i.guild), true);
      await i.deferUpdate();
      const m = await durumMesaj(i.guild, true);
      if (m) await i.editReply(m);
    },
    basvuru: async (i, [islem, id]) => {
      const g = i.guild;
      if (islem === 'ac') {
        if (db.belge.refHepsi(g.id, 'basvuru', i.user.id).some((b) => b.durum === 'bekliyor')) return hata(i, 'Zaten değerlendirilmeyi bekleyen bir başvurun var.');
        const rol = db.ayar(g.id, 'rol.oyuncu');
        if (rol && i.member.roles.cache.has(rol)) return hata(i, 'Zaten onaylı bir oyuncusun 🎉');
        return i.showModal(basvuruModal());
      }
      if (islem === 'gonder') {
        const nick = i.fields.getTextInputValue('nick').trim(), yas = i.fields.getTextInputValue('yas').trim(), neden = i.fields.getTextInputValue('neden').trim();
        if (!rcon.nickGecerli(nick)) return hata(i, 'Geçersiz Minecraft kullanıcı adı. 3-16 karakter; harf, rakam ve alt çizgi.');
        if (!/^\d{1,2}$/.test(yas)) return hata(i, 'Yaşını sayı olarak yaz.');
        const kanal = g.channels.cache.get(db.ayar(g.id, 'kanal.basvuru'));
        if (!kanal) return hata(i, 'Başvuru kanalı ayarlı değil; yetkililere haber ver. (`/ayar kanal` → Başvurular)');
        const bid = db.belge.ekle(g.id, 'basvuru', { nick, yas, neden, durum: 'bekliyor' }, i.user.id);
        const m = await kanal.send({ embeds: [E('📝 Yeni başvuru', neden, R.bilgi).setThumbnail(cizim.kafaUrl(nick)).addFields(
          { name: 'Üye', value: `${i.user} (\`${i.user.id}\`)`, inline: true }, { name: 'Minecraft', value: `\`${nick}\``, inline: true }, { name: 'Yaş', value: yas, inline: true },
          { name: 'Discord hesabı', value: zd(i.user.createdTimestamp), inline: true }, { name: 'Sunucuya katılış', value: zd(i.member.joinedTimestamp), inline: true })], components: basvuruButonlari(bid) }).catch(() => null);
        if (!m) { db.belge.sil(bid); return hata(i, 'Başvuru kanalına yazamıyorum; yetkililere haber ver.'); }
        return yanit(i, E(null, '✅ Başvurun alındı! Sonuç sana özel mesajla bildirilecek.', R.ok), true);
      }
      // onay / red
      if (!i.memberPermissions.has(P.ManageRoles)) return hata(i, 'Başvuruları yalnızca yetkililer değerlendirebilir.');
      const b = db.belge.al(id);
      if (!b || b.tur !== 'basvuru' || b.durum !== 'bekliyor') return i.update({ components: [] });
      await i.deferUpdate();
      const uye = await g.members.fetch(b.ref).catch(() => null), onay = islem === 'onay';
      const notlar = [];
      if (onay) {
        const rol = db.ayar(g.id, 'rol.oyuncu');
        if (uye && rol) await uye.roles.add(rol).then(() => notlar.push(`<@&${rol}> rolü verildi`), () => notlar.push('⚠️ Rol verilemedi (rolüm daha aşağıda olabilir)'));
        const sahip = db.mcBul(g.id, b.nick);
        if (!sahip || sahip.user === b.ref) db.uyeYaz(g.id, b.ref, { mc_nick: b.nick });
        if (rcon.hazir()) await rcon.calistir(`whitelist add ${b.nick}`).then((c) => notlar.push(`Whitelist: ${c || 'eklendi'}`), (e) => notlar.push(`⚠️ Whitelist eklenemedi: ${e.message}`));
        else notlar.push('RCON ayarlı değil: whitelist\'e elle ekle');
        if (uye) await oyuncu.basarimVer(g, b.ref, 'onayli');
      }
      db.belge.yaz(b.id, { ...b, durum: onay ? 'onay' : 'red', karar: i.user.id });
      await uye?.send({ embeds: [E(onay ? '🎉 Başvurun onaylandı!' : 'Başvurun reddedildi', onay ? `**${g.name}** sunucusuna hoş geldin **${b.nick}**! \`/ip\` komutuyla adresi öğrenip hemen girebilirsin.` : `**${g.name}** başvurun bu sefer kabul edilmedi. Daha sonra tekrar başvurabilirsin.`, onay ? R.ok : R.hata)] }).catch(() => notlar.push('Üyeye özel mesaj gönderilemedi'));
      const e = E(onay ? '✅ Başvuru onaylandı' : '❌ Başvuru reddedildi', i.message.embeds[0]?.description || null, onay ? R.ok : R.hata).setThumbnail(cizim.kafaUrl(b.nick))
        .addFields({ name: 'Üye', value: `<@${b.ref}>`, inline: true }, { name: 'Minecraft', value: `\`${b.nick}\``, inline: true }, { name: 'Karar veren', value: `${i.user}`, inline: true }, ...(notlar.length ? [{ name: 'İşlemler', value: notlar.join('\n').slice(0, 1000) }] : []));
      return i.editReply({ embeds: [e], components: [] });
    },
  },
  // Her dakika: durumu yenile, panelleri güncelle, açıldı/kapandı bildir, botun durum yazısını ayarla
  async tik(ctx) {
    let ilk = null;
    for (const guild of ctx.client.guilds.cache.values()) {
      if (!ayar(guild.id).adres) continue;
      const d = await durumAl(guild, true);
      ilk ??= d;
      // Tek seferlik kopmalarda yanlış alarm vermemek için durum iki kez üst üste aynı gelmeli
      const iz = db.ayar(guild.id, 'mc.iz', { acik: null, say: 0 });
      if (iz.aday === d.acik) iz.say++; else { iz.aday = d.acik; iz.say = 1; }
      if (iz.say >= 2 && iz.acik !== d.acik) {
        const once = iz.acik; iz.acik = d.acik;
        const kanal = guild.channels.cache.get(db.ayar(guild.id, 'kanal.durum'));
        if (once !== null && kanal) await kanal.send({ embeds: [E(null, d.acik ? `🟢 **${d.ad}** tekrar açıldı! \`${d.adres}\`` : `🔴 **${d.ad}** şu an kapalı. Açılınca buradan haber vereceğim.`, d.acik ? R.ok : R.hata)] }).catch(() => {});
      }
      db.ayarYaz(guild.id, 'mc.iz', iz);
      for (const p of db.belge.liste(guild.id, 'mcpanel')) {
        const kanal = guild.channels.cache.get(p.kanal);
        if (!kanal) { db.belge.sil(p.id); continue; }
        await kanal.messages.edit(p.mesaj, await durumMesaj(guild)).catch((e) => { if (e.code === 10008) db.belge.sil(p.id); });
      }
    }
    ctx.client.user?.setActivity(ilk ? (ilk.acik ? `${ilk.oyuncu}/${ilk.max} oyuncu • ${ilk.adres}` : `${ilk.adres} • bakımda`) : '/yardım • /kurulum', { type: ilk ? ActivityType.Watching : ActivityType.Playing });
  },
  hazir: (ctx) => module.exports.tik(ctx),
};
