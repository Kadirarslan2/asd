// Yetkili ekibi: rütbe ver/al (AuraCraft eklentisiyle oyun içi senkron), otomatik güncellenen kadro panosu,
// mesai (görev) takibi, yetkili profili ve istatistikleri, yetkili başvuru sistemi
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const rcon = require('../core/rcon');
const yetki = require('../core/yetki');
const { log } = require('../core/log');
const { E, R, yanit, hata, tamam, zd, sureYaz, madalya } = require('../core/util');

const satir = (...b) => new ActionRowBuilder().addComponents(...b);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const kanal = (g, a) => g.channels.cache.get(db.ayar(g.id, `kanal.${a}`));
const oncesi = (ms) => { const d = Math.floor((Date.now() - ms) / 6e4); return d < 60 ? `${Math.max(1, d)} dk önce` : d < 1440 ? `${Math.floor(d / 60)} saat önce` : `${Math.floor(d / 1440)} gün önce`; };
const oyunKomutu = (g, id) => { const o = db.ayar(g, 'yetki.oyun', {}); return id in o ? o[id] : yetki.rutbeBul(id)?.oyun || null; };
const oyunAlKomutu = (g) => db.ayar(g, 'yetki.oyunAl', 'yetki al {oyuncu}');

// ---------- Roller ----------
// Kurulumda: 6 yetkili rütbesi + Görevde + 4 VIP paketi. Yeni roller botun hemen altına dizilir.
async function rolleriKur(guild, yapilan = []) {
  const roller = yetki.rolHaritasi(guild.id), vipler = yetki.vipHaritasi(guild.id), sira = [];
  for (const r of yetki.RUTBELER) {
    let rol = guild.roles.cache.get(roller[r.id]);
    if (!rol) { rol = await guild.roles.create({ name: `${r.emoji} ${r.ad}`, color: r.renk, hoist: true, permissions: r.izin, reason: 'Yetkili rütbesi' }); roller[r.id] = rol.id; yapilan.push(`${rol}`); }
    sira.push(rol);
  }
  const destek = guild.roles.cache.get(db.ayar(guild.id, 'rol.destek'));
  if (destek) sira.push(destek);
  let gorevde = guild.roles.cache.get(db.ayar(guild.id, 'rol.gorevde'));
  if (!gorevde) { gorevde = await guild.roles.create({ name: '🟢 Görevde', color: 0x2ee66b, permissions: [] }); db.ayarYaz(guild.id, 'rol.gorevde', gorevde.id); yapilan.push(`${gorevde}`); }
  sira.push(gorevde);
  for (const v of yetki.VIPLER) {
    let rol = guild.roles.cache.get(vipler[v.id]);
    if (!rol) { rol = await guild.roles.create({ name: `${v.emoji} ${v.ad}`, color: v.renk, hoist: true, permissions: [] }); vipler[v.id] = rol.id; yapilan.push(`${rol}`); }
    sira.push(rol);
  }
  db.ayarYaz(guild.id, 'yetki.roller', roller); db.ayarYaz(guild.id, 'vip.roller', vipler);
  // Sıralama: Kurucu en üstte, VIP'ler altta; hepsi botun rolünün altında
  const ust = guild.members.me.roles.highest.position;
  if (guild.roles.setPositions && ust > sira.length) await guild.roles.setPositions(sira.map((r, k) => ({ role: r.id, position: ust - 1 - k }))).catch(() => yapilan.push('⚠️ Roller sıralanamadı; Sunucu Ayarları → Roller\'den yetkili rollerini üste taşı'));
  return { roller, vipler };
}

async function rutbeDegistir(guild, member, yeni, veren, sebep) {
  const roller = yetki.rolHaritasi(guild.id), eski = yetki.rutbe(member), notlar = [];
  const cikar = yetki.RUTBELER.map((r) => roller[r.id]).filter((id) => id && member.roles.cache.has(id) && id !== roller[yeni?.id]);
  if (cikar.length) await member.roles.remove(cikar).catch(() => notlar.push('⚠️ Eski rütbe rolü alınamadı'));
  const destek = db.ayar(guild.id, 'rol.destek'), gorevde = db.ayar(guild.id, 'rol.gorevde');
  if (yeni) {
    if (!roller[yeni.id] || !guild.roles.cache.has(roller[yeni.id])) throw new Error('Rütbe rolleri kurulmamış. `/kurulum` yaz.');
    await member.roles.add([roller[yeni.id], ...(destek && guild.roles.cache.has(destek) ? [destek] : [])]);
  } else {
    await member.roles.remove([destek, gorevde].filter((id) => id && member.roles.cache.has(id))).catch(() => {});
    mesaiBitir(guild.id, member.id);
  }
  // Oyun içi senkron: hesap doğrulanmış ve RCON açıksa AuraCraft eklentisine rütbe komutu gönderilir
  const u = db.uye(guild.id, member.id);
  const komut = yeni ? oyunKomutu(guild.id, yeni.id) : oyunAlKomutu(guild.id);
  if (komut && u.mc_nick && u.mc_dogrulandi && rcon.hazir()) {
    const k = komut.replaceAll('{oyuncu}', u.mc_nick);
    await rcon.calistir(k).then((c) => notlar.push(`🎮 Oyun: \`${k}\` → ${c || 'tamam'}`), (e) => notlar.push(`⚠️ Oyun içi rütbe verilemedi: ${e.message}`));
  } else if (komut) notlar.push(u.mc_nick && u.mc_dogrulandi ? '⚠️ RCON ayarlı değil; oyun içi rütbeyi elle ver' : '⚠️ Minecraft hesabı doğrulanmamış; oyun içi rütbeyi elle ver');
  db.belge.ekle(guild.id, 'yetkiGecmis', { eski: eski?.id || null, yeni: yeni?.id || null, veren, sebep: sebep || null }, member.id);
  if (yeni && !db.uye(guild.id, member.id).veri.yetkiliBaslangic) db.veri(guild.id, member.id, (v) => { v.yetkiliBaslangic = Date.now(); });
  if (!yeni) db.veri(guild.id, member.id, (v) => { delete v.yetkiliBaslangic; });

  const tur = !yeni ? 'YETKİSİ ALINDI' : !eski ? 'YENİ YETKİLİ' : yeni.seviye > eski.seviye ? 'TERFİ' : 'RÜTBE DEĞİŞTİ';
  const vurgu = yeni ? hex(yeni.renk) : cizim.RENK.kirmizi;
  const kart = await cizim.bannerKart({ ust: tur, baslik: member.displayName, alt: yeni ? `${eski ? `${eski.ad} → ` : ''}${yeni.ad}` : `${eski?.ad || 'Yetkili'} rütbesi alındı`, avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }), ad: member.displayName, vurgu, dosya: 'rutbe' });
  await kanal(guild, 'yetkiliDuyuru')?.send({ content: `${member}`, files: [kart], embeds: sebep ? [E(null, `**Not:** ${sebep}\n**Veren:** <@${veren}>`, yeni ? yeni.renk : R.hata)] : [] }).catch(() => {});
  await member.send({ files: [kart], content: yeni ? `**${guild.name}** sunucusunda rütben **${yeni.ad}** oldu. Kurallar ve yetkilerin için yetkili kanallarına göz at. Mesaiye başlamak için \`/mesai\`.` : `**${guild.name}** sunucusundaki yetkili rütben alındı.` }).catch(() => {});
  await log(guild, E(`👮 ${tur}`, `**Üye:** ${member}\n**Rütbe:** ${eski?.ad || '—'} → ${yeni?.ad || '—'}\n**Veren:** <@${veren}>${sebep ? `\n**Sebep:** ${sebep}` : ''}${notlar.length ? `\n${notlar.join('\n')}` : ''}`, yeni ? yeni.renk : R.hata));
  kadroYenile(guild).catch(() => {});
  return { eski, notlar };
}

// ---------- Mesai ----------
function mesaiBitir(g, userId) {
  return db.veri(g, userId, (v) => {
    const m = v.mesai; if (!m?.aktif) return 0;
    const sure = Date.now() - m.aktif;
    m.toplam = (m.toplam || 0) + sure; m.son = Date.now();
    m.gecmis = [...(m.gecmis || []), [m.aktif, Date.now()]].slice(-200); m.aktif = null;
    return sure;
  });
}
// Belirli bir tarihten bu yana mesai süresi (aktif oturum dahil)
function mesaiSuresi(veri, beri = 0) {
  const m = veri.mesai || {}; let t = 0;
  for (const [b, s] of m.gecmis || []) if (s > beri) t += s - Math.max(b, beri);
  if (m.aktif) t += Date.now() - Math.max(m.aktif, beri);
  return t;
}

// ---------- Kadro panosu ----------
let sonUyeCekme = 0;
async function kadroVerisi(guild) {
  if (Date.now() - sonUyeCekme > 10 * 6e4) { sonUyeCekme = Date.now(); await guild.members.fetch().catch(() => {}); }
  const roller = yetki.rolHaritasi(guild.id), gorevdeRol = db.ayar(guild.id, 'rol.gorevde'), gorulen = new Set();
  let toplam = 0, gorevde = 0;
  const gruplar = yetki.RUTBELER.map((r) => {
    const uyeler = [...guild.members.cache.values()].filter((m) => roller[r.id] && m.roles.cache.has(roller[r.id]) && !gorulen.has(m.id)).map((m) => {
      gorulen.add(m.id); toplam++;
      const v = db.uye(guild.id, m.id).veri, aktif = Boolean(v.mesai?.aktif) || Boolean(gorevdeRol && m.roles.cache.has(gorevdeRol));
      if (aktif) gorevde++;
      return { ad: m.displayName, avatar: m.displayAvatarURL({ extension: 'png', size: 128 }), gorevde: aktif, alt: aktif ? 'Görevde' : v.mesai?.son ? oncesi(v.mesai.son) : 'Mesai yok' };
    }).sort((a, b) => b.gorevde - a.gorevde);
    return { ad: r.ad, renk: r.renk, uyeler };
  });
  return { sunucu: require('./minecraft').ayar(guild.id).ad, gruplar, toplam, gorevde };
}
// Art arda gelen rütbe/mesai değişikliklerini birleştirip birkaç saniye sonra tek seferde günceller
const bekleyenKadro = new Map();
function kadroYenile(guild, zorla = false) {
  if (zorla) return kadroCiz(guild);
  clearTimeout(bekleyenKadro.get(guild.id));
  bekleyenKadro.set(guild.id, setTimeout(() => { bekleyenKadro.delete(guild.id); kadroCiz(guild).catch((e) => console.error('Kadro panosu:', e.message)); }, Number(process.env.KADRO_GECIKME_MS || 5000)));
  return Promise.resolve();
}
async function kadroCiz(guild) {
  const k = kanal(guild, 'kadro');
  if (!k) return;
  const yuk = { files: [await cizim.kadroKart(await kadroVerisi(guild))], embeds: [E(null, `Yetkili ekibimiz. 🟢 işaretliler şu an görevde.\nBir sorunda \`/şikayet\` kullanabilir ya da destek talebi açabilirsin.\n*Son güncelleme: ${zd(Date.now())}*`, R.ana).setImage('attachment://kadro.png')] };
  const id = db.ayar(guild.id, 'kadro.mesaj');
  if (id && await k.messages.edit(id, { ...yuk, attachments: [] }).then(() => true, () => false)) return;
  const m = await k.send(yuk).catch(() => null);
  if (m) db.ayarYaz(guild.id, 'kadro.mesaj', m.id);
}

// ---------- Başvuru ----------
const basvuruPanelGonder = async (k) => k.send({
  files: [await cizim.bannerKart({ ust: 'EKİBE KATIL', baslik: 'Yetkili Başvurusu', alt: 'Deneme Rehber olarak başla, emeğinle yüksel', logo: true, dosya: 'ybasvuru' })],
  embeds: [E(null, '**Şartlar**\n• En az 14 yaşında olmak\n• Doğrulanmış Minecraft hesabı (`/hesap bağla`)\n• Günde en az 2 saat aktif olmak\n• Temiz sicil\n\n**Rütbe yolu:** 🌱 Deneme Rehber → 🧭 Rehber → 💬 Discord Yetkilisi / ⚔️ Moderatör → 🛡️ Yönetici', R.ana).setImage('attachment://ybasvuru.png')],
  components: [satir(new ButtonBuilder().setCustomId('ybasvuru:ac').setLabel('Yetkili başvurusu yap').setEmoji('📝').setStyle(ButtonStyle.Success))],
});
const ybasvuruModal = () => new ModalBuilder().setCustomId('ybasvuru:gonder').setTitle('Yetkili Başvurusu').addComponents(
  satir(new TextInputBuilder().setCustomId('yas').setLabel('Yaşın').setStyle(TextInputStyle.Short).setMaxLength(2).setRequired(true)),
  satir(new TextInputBuilder().setCustomId('saat').setLabel('Günde kaç saat aktif olabilirsin?').setStyle(TextInputStyle.Short).setMaxLength(20).setRequired(true)),
  satir(new TextInputBuilder().setCustomId('deneyim').setLabel('Daha önce yetkili oldun mu? Nerede?').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)),
  satir(new TextInputBuilder().setCustomId('neden').setLabel('Neden seni seçmeliyiz?').setStyle(TextInputStyle.Paragraph).setMaxLength(800).setRequired(true)),
  satir(new TextInputBuilder().setCustomId('durum').setLabel('Bir oyuncu küfür ederse ne yaparsın?').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)));

// Yetkili istatistikleri: ceza kayıtları + kapatılan destek talepleri + mesai
function istatistik(g, userId, beri = 0) {
  const cezalar = db.belge.hepsi('ceza').filter((c) => c.guild === g && c.yetkili === userId && c.zaman > beri);
  const talepler = db.belge.hepsi('islem').filter((c) => c.guild === g && c.ref === userId && c.zaman > beri && c.is === 'ticket').length;
  const say = (t) => cezalar.filter((c) => c.tur === t || c.tur?.startsWith?.(t)).length;
  return { toplam: cezalar.length + talepler, uyari: say('uyari'), sustur: say('sustur'), kick: say('kick'), ban: say('ban'), jail: say('jail'), oyun: say('oyun-'), talepler, mesai: mesaiSuresi(db.uye(g, userId).veri, beri) };
}

const RUTBE_SECIM = yetki.RUTBELER.map((r) => ({ name: `${r.emoji} ${r.ad}`, value: r.id }));
module.exports = {
  ad: 'yetkili',
  rolleriKur, kadroYenile, basvuruPanelGonder, istatistik, mesaiSuresi,
  komutlar: [
    { data: new SlashCommandBuilder().setName('yetkili').setDescription('Yetkili ekibi')
        .addSubcommand((s) => s.setName('ver').setDescription('[Yönetici] Üyeye yetkili rütbesi verir (oyunda da verilir)')
          .addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)).addStringOption((o) => o.setName('rütbe').setDescription('Rütbe').setRequired(true).addChoices(...RUTBE_SECIM)).addStringOption((o) => o.setName('not').setDescription('Not/sebep').setMaxLength(200)))
        .addSubcommand((s) => s.setName('al').setDescription('[Yönetici] Üyenin yetkili rütbesini alır').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)).addStringOption((o) => o.setName('sebep').setDescription('Sebep').setMaxLength(200)))
        .addSubcommand((s) => s.setName('liste').setDescription('Yetkili kadrosunu resimli gösterir'))
        .addSubcommand((s) => s.setName('profil').setDescription('Bir yetkilinin rütbesi, işlemleri ve mesai süresi').addUserOption((o) => o.setName('üye').setDescription('Yetkili')))
        .addSubcommand((s) => s.setName('istatistik').setDescription('Yetkili performans sıralaması').addStringOption((o) => o.setName('dönem').setDescription('Dönem').addChoices({ name: 'Bu hafta', value: 'hafta' }, { name: 'Bu ay', value: 'ay' }, { name: 'Tüm zamanlar', value: 'tum' })))
        .addSubcommand((s) => s.setName('rütbeler').setDescription('Rütbeleri ve her rütbenin yetkilerini gösterir')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild;
        if (alt === 'rütbeler') {
          const S = (lvl) => sureYaz(yetki.susturMax(lvl));
          return yanit(i, E('👮 Rütbeler ve yetkileri', yetki.RUTBELER.slice().reverse().map((r) => `${r.emoji} **${r.ad}** <@&${yetki.rolHaritasi(g.id)[r.id] || '0'}>\n> ${[
            'uyarı', `${S(r.seviye)} susturma`, r.seviye >= 2 && 'atma, mesaj silme, oyundan atma', r.seviye >= 3 && 'jail, kanal kilidi, whitelist',
            r.seviye >= 4 && `${r.seviye >= 5 ? 'kalıcı' : '7 güne kadar'} ban, oyun banı`, r.seviye >= 5 && 'rütbe ve VIP verme, başvuru onayı', r.seviye >= 6 && 'her şey'].filter(Boolean).join(' • ')}`).join('\n\n'), R.ana));
        }
        if (alt === 'liste') { await i.deferReply(); const v = await kadroVerisi(g); return i.editReply({ files: [await cizim.kadroKart(v)] }); }
        if (alt === 'profil') {
          const user = i.options.getUser('üye') || i.user, m = await g.members.fetch(user.id).catch(() => null);
          const r = m && yetki.rutbe(m);
          if (!r) return hata(i, `${user.id === i.user.id ? 'Yetkili değilsin.' : 'Bu üye yetkili değil.'}`);
          const v = db.uye(g.id, user.id).veri, tum = istatistik(g.id, user.id), hafta = istatistik(g.id, user.id, Date.now() - 7 * 864e5);
          const gecmis = db.belge.refHepsi(g.id, 'yetkiGecmis', user.id).slice(-5).reverse().map((h) => `${zd(h.zaman, 'd')} • ${yetki.rutbeBul(h.eski)?.ad || '—'} → **${yetki.rutbeBul(h.yeni)?.ad || 'alındı'}**`);
          return yanit(i, E(`${r.emoji} ${m.displayName} — ${r.ad}`, null, r.renk).setThumbnail(user.displayAvatarURL()).addFields(
            { name: 'Durum', value: v.mesai?.aktif ? `🟢 Görevde (${sureYaz(Date.now() - v.mesai.aktif)})` : `⚫ Görevde değil${v.mesai?.son ? ` • son ${zd(v.mesai.son)}` : ''}`, inline: true },
            { name: 'Yetkili olalı', value: v.yetkiliBaslangic ? zd(v.yetkiliBaslangic) : '—', inline: true },
            { name: 'Minecraft', value: db.uye(g.id, user.id).mc_nick ? `\`${db.uye(g.id, user.id).mc_nick}\`` : '—', inline: true },
            { name: 'Bu hafta', value: `**${hafta.toplam}** işlem • ${sureYaz(hafta.mesai)} mesai`, inline: true },
            { name: 'Toplam', value: `**${tum.toplam}** işlem • ${sureYaz(tum.mesai)} mesai`, inline: true },
            { name: 'Dağılım', value: `⚠️ ${tum.uyari} • 🔇 ${tum.sustur} • 👢 ${tum.kick} • 🔨 ${tum.ban} • ⛓️ ${tum.jail} • 🎮 ${tum.oyun} • 🎫 ${tum.talepler}` },
            ...(gecmis.length ? [{ name: 'Rütbe geçmişi', value: gecmis.join('\n') }] : [])));
        }
        if (alt === 'istatistik') {
          const donem = i.options.getString('dönem') || 'hafta', beri = { hafta: Date.now() - 7 * 864e5, ay: Date.now() - 30 * 864e5, tum: 0 }[donem];
          await g.members.fetch().catch(() => {});
          const l = [...g.members.cache.values()].filter((m) => yetki.rutbe(m)).map((m) => ({ m, s: istatistik(g.id, m.id, beri) })).sort((a, b) => b.s.toplam - a.s.toplam || b.s.mesai - a.s.mesai);
          return yanit(i, E(`📊 Yetkili istatistikleri — ${{ hafta: 'bu hafta', ay: 'bu ay', tum: 'tüm zamanlar' }[donem]}`, l.slice(0, 15).map(({ m, s }, k) => `${madalya(k)} ${yetki.rutbe(m).emoji} **${m.displayName}** — **${s.toplam}** işlem • ${sureYaz(s.mesai)} mesai`).join('\n') || 'Henüz yetkili yok.', R.altin).setFooter({ text: 'İşlem = uyarı, susturma, atma, ban, jail, oyun içi işlem ve kapatılan destek talepleri' }));
        }
        // ver / al
        if (yetki.seviye(i.member) < 5) return hata(i, 'Rütbe işlemleri için en az **Yönetici** olmalısın.');
        const m = i.options.getMember('üye');
        if (!m || m.user.bot) return hata(i, 'Geçerli bir üye seç.');
        if (m.id === i.user.id) return hata(i, 'Kendi rütbeni değiştiremezsin.');
        const benim = yetki.seviye(i.member);
        if (yetki.seviye(m) >= benim) return hata(i, 'Kendi rütbende ya da üstündeki birinin rütbesini değiştiremezsin.');
        if (alt === 'al') {
          if (!yetki.rutbe(m)) return hata(i, 'Bu üye yetkili değil.');
          await i.deferReply();
          const { eski, notlar } = await rutbeDegistir(g, m, null, i.user.id, i.options.getString('sebep'));
          return i.editReply({ embeds: [E(null, `✅ ${m} kullanıcısının **${eski.ad}** rütbesi alındı.${notlar.length ? `\n${notlar.join('\n')}` : ''}`, R.ok)] });
        }
        const r = yetki.rutbeBul(i.options.getString('rütbe'));
        if (r.seviye >= benim) return hata(i, `**${r.ad}** rütbesini verebilmek için daha yüksek bir rütbede olmalısın.`);
        if (yetki.rutbe(m)?.id === r.id) return hata(i, `${m} zaten **${r.ad}**.`);
        await i.deferReply();
        try {
          const { eski, notlar } = await rutbeDegistir(g, m, r, i.user.id, i.options.getString('not'));
          return i.editReply({ embeds: [E(null, `${r.emoji} ${m} artık **${r.ad}**${eski ? ` (önceki: ${eski.ad})` : ''}.${notlar.length ? `\n${notlar.join('\n')}` : ''}`, r.renk)] });
        } catch (e) { return i.editReply({ embeds: [E(null, `❌ ${e.code === 50013 ? 'Rolü veremedim: bot rolü yetkili rollerinin üstünde olmalı.' : e.message}`, R.hata)] }); }
      } },
    { data: new SlashCommandBuilder().setName('mesai').setDescription('[Yetkili] Göreve başlar ya da görevi bitirir (Görevde rolü)'),
      calistir: async (i) => {
        const h = yetki.gerek(i, 'mesai'); if (h) return hata(i, h);
        const g = i.guild, rol = db.ayar(g.id, 'rol.gorevde'), v = db.uye(g.id, i.user.id).veri;
        if (v.mesai?.aktif) {
          const sure = mesaiBitir(g.id, i.user.id);
          if (rol) await i.member.roles.remove(rol).catch(() => {});
          kadroYenile(g).catch(() => {});
          return yanit(i, E(null, `⚫ Görevi bitirdin. Bu oturum: **${sureYaz(sure)}** • Bu hafta toplam: **${sureYaz(mesaiSuresi(db.uye(g.id, i.user.id).veri, Date.now() - 7 * 864e5))}**`, R.gri));
        }
        db.veri(g.id, i.user.id, (x) => { x.mesai = { ...(x.mesai || {}), aktif: Date.now() }; });
        if (rol) await i.member.roles.add(rol).catch(() => {});
        kadroYenile(g).catch(() => {});
        return yanit(i, E(null, `🟢 ${i.user} göreve başladı. Bitirmek için tekrar \`/mesai\`.`, R.ok));
      } },
    { data: new SlashCommandBuilder().setName('yetkili-ayar').setDescription('[Kurucu] Yetkili sistemi ayarları').setDefaultMemberPermissions(P.Administrator)
        .addSubcommand((s) => s.setName('oyun-komutu').setDescription('Rütbe verilince oyunda çalışacak konsol komutu ({oyuncu}; boşsa kapalı)')
          .addStringOption((o) => o.setName('rütbe').setDescription('Rütbe').setRequired(true).addChoices(...RUTBE_SECIM)).addStringOption((o) => o.setName('komut').setDescription('Örn: yetki ver {oyuncu} moderator').setMaxLength(150)))
        .addSubcommand((s) => s.setName('oyun-al-komutu').setDescription('Rütbe alınınca oyunda çalışacak komut (boşsa kapalı)').addStringOption((o) => o.setName('komut').setDescription('Örn: yetki al {oyuncu}').setMaxLength(150)))
        .addSubcommand((s) => s.setName('göster').setDescription('Oyun içi rütbe komutlarını gösterir'))
        .addSubcommand((s) => s.setName('kadro-yenile').setDescription('Kadro panosunu hemen yeniler')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'kadro-yenile') { await i.deferReply({ flags: 64 }); await kadroYenile(i.guild, true); return i.editReply('Kadro panosu yenilendi.'); }
        const kontrol = (k) => (k && !k.includes('{oyuncu}') ? 'Komutta `{oyuncu}` yer tutucusu olmalı.' : null);
        if (alt === 'oyun-komutu') {
          const k = i.options.getString('komut')?.trim().replace(/^\//, '') || null;
          if (kontrol(k)) return hata(i, kontrol(k));
          const o = db.ayar(g, 'yetki.oyun', {}); o[i.options.getString('rütbe')] = k; db.ayarYaz(g, 'yetki.oyun', o);
          return tamam(i, k ? `Oyun komutu ayarlandı: \`${k}\`` : 'Bu rütbe için oyun senkronu kapatıldı.', true);
        }
        if (alt === 'oyun-al-komutu') {
          const k = i.options.getString('komut')?.trim().replace(/^\//, '') || null;
          if (kontrol(k)) return hata(i, kontrol(k));
          db.ayarYaz(g, 'yetki.oyunAl', k);
          return tamam(i, k ? `Rütbe alma komutu: \`${k}\`` : 'Rütbe alınınca oyunda komut çalışmayacak.', true);
        }
        return yanit(i, E('🎮 Oyun içi rütbe senkronu', `${yetki.RUTBELER.map((r) => `${r.emoji} **${r.ad}**: ${oyunKomutu(g, r.id) ? `\`${oyunKomutu(g, r.id)}\`` : '— kapalı'}`).join('\n')}\n🗑️ **Rütbe alınınca:** ${oyunAlKomutu(g) ? `\`${oyunAlKomutu(g)}\`` : '— kapalı'}\n\nKomutlar yalnızca hesabı doğrulanmış yetkililer için ve RCON açıksa çalışır. Sunucu yanıtı mod-log kanalına yazılır; rütbe adı eklentidekiyle uyuşmazsa buradan düzelt.`, R.bilgi), true);
      } },
  ],
  bilesenler: {
    ybasvuru: async (i, [islem, id]) => {
      const g = i.guild;
      if (islem === 'ac') {
        if (yetki.rutbe(i.member)) return hata(i, 'Zaten yetkilisin.');
        const onceki = db.belge.refHepsi(g.id, 'ybasvuru', i.user.id).at(-1);
        if (onceki?.durum === 'bekliyor') return hata(i, 'Değerlendirilmeyi bekleyen bir başvurun var.');
        if (onceki?.durum === 'red' && Date.now() - onceki.zaman < 7 * 864e5) return hata(i, `Son başvurun reddedildi. Yeniden başvurabilmen için ${zd(onceki.zaman + 7 * 864e5)} beklemelisin.`);
        const u = db.uye(g.id, i.user.id);
        if (!u.mc_nick || !u.mc_dogrulandi) return hata(i, 'Yetkili başvurusu için önce Minecraft hesabını doğrulayarak bağla: `/hesap bağla`');
        return i.showModal(ybasvuruModal());
      }
      if (islem === 'gonder') {
        const f = (k) => i.fields.getTextInputValue(k).trim();
        if (!/^\d{1,2}$/.test(f('yas'))) return hata(i, 'Yaşını sayı olarak yaz.');
        const k = kanal(g, 'yetkiliBasvuru');
        if (!k) return hata(i, 'Yetkili başvuru kanalı ayarlı değil; yetkililere haber ver.');
        const u = db.uye(g.id, i.user.id), cezalar = db.belge.refHepsi(g.id, 'ceza', i.user.id).length + db.belge.refHepsi(g.id, 'uyari', i.user.id).length;
        const bid = db.belge.ekle(g.id, 'ybasvuru', { durum: 'bekliyor', yas: f('yas') }, i.user.id);
        await k.send({ embeds: [E('📝 Yetkili başvurusu', null, R.bilgi).setThumbnail(cizim.kafaUrl(u.mc_nick)).addFields(
          { name: 'Üye', value: `${i.user}`, inline: true }, { name: 'Minecraft', value: `\`${u.mc_nick}\` ✅`, inline: true }, { name: 'Yaş', value: f('yas'), inline: true },
          { name: 'Seviye', value: String(u.seviye), inline: true }, { name: 'Sicil', value: cezalar ? `⚠️ ${cezalar} kayıt (\`/sicil\`)` : '🟢 Temiz', inline: true }, { name: 'Sunucuda', value: zd(i.member.joinedTimestamp), inline: true },
          { name: 'Günlük aktiflik', value: f('saat') }, { name: 'Deneyim', value: f('deneyim') }, { name: 'Neden o?', value: f('neden') }, { name: 'Senaryo: küfür eden oyuncu', value: f('durum') })],
          components: [satir(new ButtonBuilder().setCustomId(`ybasvuru:onay:${bid}`).setLabel('Kabul et (Deneme Rehber)').setEmoji('✅').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`ybasvuru:red:${bid}`).setLabel('Reddet').setEmoji('❌').setStyle(ButtonStyle.Danger))] });
        return yanit(i, E(null, '✅ Yetkili başvurun alındı. Sonuç sana özel mesajla bildirilecek. Bol şans!', R.ok), true);
      }
      const h = yetki.gerek(i, 'yetkili-basvuru'); if (h) return hata(i, h);
      const b = db.belge.al(id);
      if (!b || b.tur !== 'ybasvuru' || b.durum !== 'bekliyor') return i.update({ components: [] });
      await i.deferUpdate();
      const m = await g.members.fetch(b.ref).catch(() => null), onay = islem === 'onay';
      db.belge.yaz(b.id, { ...b, durum: onay ? 'onay' : 'red', karar: i.user.id });
      let not = '';
      if (onay && m) { try { const s = await rutbeDegistir(g, m, yetki.rutbeBul('deneme'), i.user.id, 'Yetkili başvurusu kabul edildi'); not = s.notlar.join('\n'); } catch (e) { not = `⚠️ ${e.message}`; } }
      if (!onay) await m?.send({ embeds: [E('Yetkili başvurun', `**${g.name}** yetkili başvurun bu sefer kabul edilmedi. 7 gün sonra tekrar başvurabilirsin.`, R.hata)] }).catch(() => {});
      const e = E(onay ? '✅ Yetkili başvurusu kabul edildi' : '❌ Yetkili başvurusu reddedildi', `<@${b.ref}> • Karar: ${i.user}${not ? `\n${not}` : ''}`, onay ? R.ok : R.hata);
      return i.editReply({ embeds: [...i.message.embeds, e].slice(-10), components: [] });
    },
  },
  olaylar: {
    // Yetkili sunucudan çıkarsa mesaisini kapat, kadroyu güncelle
    guildMemberRemove: (m) => { if (db.uye(m.guild.id, m.id).veri.mesai?.aktif) mesaiBitir(m.guild.id, m.id); kadroYenile(m.guild).catch(() => {}); },
    guildMemberUpdate: (eski, yeni) => {
      const roller = Object.values(yetki.rolHaritasi(yeni.guild.id));
      if (roller.some((r) => eski.roles?.cache?.has(r) !== yeni.roles.cache.has(r))) kadroYenile(yeni.guild).catch(() => {});
    },
  },
  // 30 dakikada bir kadro panosunu tazele; 12 saati aşan unutulmuş mesaileri kapat
  async tik(ctx) {
    const dk = new Date().getMinutes();
    for (const g of ctx.client.guilds.cache.values()) {
      for (const u of db.sql.prepare("SELECT user, veri FROM uye WHERE guild=? AND veri LIKE '%\"aktif\":1%'").all(g.id)) {
        const v = JSON.parse(u.veri);
        if (v.mesai?.aktif && Date.now() - v.mesai.aktif > 12 * 36e5) {
          mesaiBitir(g.id, u.user);
          const rol = db.ayar(g.id, 'rol.gorevde'), m = g.members.cache.get(u.user);
          if (rol && m) await m.roles.remove(rol).catch(() => {});
          await m?.send('⏰ Mesain 12 saati geçtiği için otomatik bitirildi. Göreve devam ediyorsan tekrar `/mesai` yaz.').catch(() => {});
        }
      }
      if (dk % 30 === 0) await kadroYenile(g, true).catch(() => {});
    }
  },
};
