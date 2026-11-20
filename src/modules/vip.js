// VIP paketleri (VIP, VIP+, MVP, MVP+): süreli/kalıcı, XP ve günlük ödül çarpanı, süresi bitince otomatik düşer.
// Oyun içi karşılığı /vip ayarla ile tanımlanan konsol komutlarıyla verilir. Sunucu takviyecilerine (booster) teşekkür ve ödül.
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const db = require('../core/db');
const cizim = require('../core/cizim');
const rcon = require('../core/rcon');
const yetki = require('../core/yetki');
const { log } = require('../core/log');
const { E, R, yanit, hata, tamam, zd, sureCoz, sureYaz, para } = require('../core/util');

const PAKET_SECIM = yetki.VIPLER.map((v) => ({ name: `${v.emoji} ${v.ad}`, value: v.id }));
const paketBul = (id) => yetki.VIPLER.find((v) => v.id === id);
const komutlar = (g, id) => db.ayar(g, 'vip.komut', {})[id] || {};

async function oyunKomutu(g, userId, sablon) {
  const u = db.uye(g, userId);
  if (!sablon) return null;
  if (!u.mc_nick || !u.mc_dogrulandi) return '⚠️ Minecraft hesabı doğrulanmamış; oyun içi paketi elle ver';
  if (!rcon.hazir()) return '⚠️ RCON ayarlı değil; oyun içi paketi elle ver';
  const k = sablon.replaceAll('{oyuncu}', u.mc_nick);
  return rcon.calistir(k).then((c) => `🎮 \`${k}\` → ${c || 'tamam'}`, (e) => `⚠️ Oyun komutu çalışmadı: ${e.message}`);
}
async function vipKaldir(guild, userId, sebep) {
  const v = db.uye(guild.id, userId).veri.vip;
  if (!v) return null;
  db.veri(guild.id, userId, (x) => { delete x.vip; });
  const rol = yetki.vipHaritasi(guild.id)[v.paket], m = await guild.members.fetch(userId).catch(() => null);
  if (rol && m) await m.roles.remove(rol).catch(() => {});
  const not = await oyunKomutu(guild.id, userId, komutlar(guild.id, v.paket).al);
  await log(guild, E('💎 VIP sona erdi', `<@${userId}> • ${paketBul(v.paket)?.ad}\n**Sebep:** ${sebep}${not ? `\n${not}` : ''}`, R.gri));
  return v;
}

module.exports = {
  ad: 'vip',
  vipKaldir,
  komutlar: [
    { data: new SlashCommandBuilder().setName('vip').setDescription('VIP paketleri')
        .addSubcommand((s) => s.setName('bilgi').setDescription('VIP paketlerini ve ayrıcalıklarını gösterir'))
        .addSubcommand((s) => s.setName('durum').setDescription('VIP durumunu ve kalan süreyi gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')))
        .addSubcommand((s) => s.setName('ver').setDescription('[Yönetici] Üyeye VIP paketi verir')
          .addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)).addStringOption((o) => o.setName('paket').setDescription('Paket').setRequired(true).addChoices(...PAKET_SECIM))
          .addStringOption((o) => o.setName('süre').setDescription('Örn: 30g, 1hafta (boşsa 30 gün, "kalıcı" yazarsan süresiz)')))
        .addSubcommand((s) => s.setName('al').setDescription('[Yönetici] Üyenin VIP paketini kaldırır').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('liste').setDescription('[Yetkili] Aktif VIP üyeleri listeler'))
        .addSubcommand((s) => s.setName('ayarla').setDescription('[Kurucu] Paket verilince/bitince oyunda çalışacak konsol komutları')
          .addStringOption((o) => o.setName('paket').setDescription('Paket').setRequired(true).addChoices(...PAKET_SECIM))
          .addStringOption((o) => o.setName('ver-komutu').setDescription('Örn: lp user {oyuncu} parent add vip').setMaxLength(150))
          .addStringOption((o) => o.setName('al-komutu').setDescription('Örn: lp user {oyuncu} parent remove vip').setMaxLength(150))),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild;
        if (alt === 'bilgi') {
          const ad = require('./minecraft').ayar(g.id).ad;
          return i.reply({ files: [cizim.vipKart({ sunucu: ad, paketler: yetki.VIPLER.slice().reverse() })], embeds: [E(null, `${yetki.VIPLER.slice().reverse().map((v) => `${v.emoji} **${v.ad}** <@&${yetki.vipHaritasi(g.id)[v.id] || '0'}> — **${v.carpan}x** XP ve günlük ödül`).join('\n')}\n🚀 **Sunucu takviyecileri** 1.25x XP ve takviye başına ödül alır.\n\nVIP satın almak için mağazayı ziyaret et ya da destek talebi aç.`, R.altin).setImage('attachment://vip.png')] });
        }
        if (alt === 'durum') {
          const user = i.options.getUser('üye') || i.user, v = yetki.vipBilgi(g.id, user.id), booster = db.uye(g.id, user.id).veri.booster;
          if (!v && !booster) return yanit(i, E(null, `${user.id === i.user.id ? 'VIP paketin yok.' : 'Bu üyenin VIP paketi yok.'} Paketleri görmek için \`/vip bilgi\`.`, R.gri), true);
          return yanit(i, E(v ? `${v.emoji} ${v.ad}` : '🚀 Sunucu takviyecisi', `${v ? `**Bitiş:** ${v.bitis ? `${zd(v.bitis)} (${zd(v.bitis, 'f')})` : 'süresiz ♾️'}\n**Başlangıç:** ${zd(v.zaman, 'D')}\n` : ''}**XP / günlük ödül çarpanı:** ${yetki.carpan(g.id, user.id)}x${booster ? '\n🚀 Sunucuyu takviye ettiğin için teşekkürler!' : ''}`, v?.renk || 0xff73fa).setThumbnail(user.displayAvatarURL()), true);
        }
        if (alt === 'liste') {
          const h = yetki.gerek(i, 'sicil'); if (h) return hata(i, h);
          const l = db.sql.prepare("SELECT user, veri FROM uye WHERE guild=? AND veri LIKE '%\"vip\"%'").all(g.id).map((u) => ({ user: u.user, v: JSON.parse(u.veri).vip })).filter((x) => x.v && (!x.v.bitis || x.v.bitis > Date.now()));
          return yanit(i, E(`💎 Aktif VIP üyeler (${l.length})`, l.slice(0, 40).map((x) => `${paketBul(x.v.paket)?.emoji} **${paketBul(x.v.paket)?.ad}** <@${x.user}> — ${x.v.bitis ? `bitiş ${zd(x.v.bitis)}` : 'süresiz'}`).join('\n') || 'Aktif VIP yok.', R.altin), true);
        }
        if (alt === 'ayarla') {
          if (!i.memberPermissions.has(P.Administrator)) return hata(i, 'Konsol komutlarını yalnızca **Yönetici** izni olanlar ayarlayabilir.');
          const ver = i.options.getString('ver-komutu')?.trim().replace(/^\//, ''), al = i.options.getString('al-komutu')?.trim().replace(/^\//, '');
          if ([ver, al].some((k) => k && !k.includes('{oyuncu}'))) return hata(i, 'Komutlarda `{oyuncu}` yer tutucusu olmalı.');
          const o = db.ayar(g.id, 'vip.komut', {}), id = i.options.getString('paket');
          o[id] = { ver: ver || null, al: al || null }; db.ayarYaz(g.id, 'vip.komut', o);
          return tamam(i, `**${paketBul(id).ad}** oyun komutları kaydedildi.\nVerince: ${ver ? `\`${ver}\`` : '—'}\nBitince: ${al ? `\`${al}\`` : '—'}`, true);
        }
        const h = yetki.gerek(i, 'vip'); if (h) return hata(i, h);
        const m = i.options.getMember('üye');
        if (!m || m.user.bot) return hata(i, 'Geçerli bir üye seç.');
        if (alt === 'al') {
          await i.deferReply();
          const v = await vipKaldir(g, m.id, `${i.user.tag} tarafından kaldırıldı`);
          return i.editReply({ embeds: [E(null, v ? `✅ ${m} kullanıcısının **${paketBul(v.paket)?.ad}** paketi kaldırıldı.` : '❌ Bu üyenin VIP paketi yok.', v ? R.ok : R.hata)] });
        }
        const p = paketBul(i.options.getString('paket')), sMetin = (i.options.getString('süre') || '30g').trim().toLocaleLowerCase('tr');
        const kalici = ['kalıcı', 'kalici', 'süresiz', 'suresiz'].includes(sMetin), ms = kalici ? null : sureCoz(sMetin);
        if (!kalici && (!ms || ms < 36e5)) return hata(i, 'Geçersiz süre. Örnek: `30g`, `1hafta` ya da `kalıcı`.');
        const roller = yetki.vipHaritasi(g.id);
        if (!roller[p.id] || !g.roles.cache.has(roller[p.id])) return hata(i, 'VIP rolleri kurulmamış. `/kurulum` yaz.');
        await i.deferReply();
        // Aynı paket uzatılırsa kalan süreye eklenir
        const eski = yetki.vipBilgi(g.id, m.id);
        if (eski && eski.paket !== p.id) await vipKaldir(g, m.id, `${p.ad} paketine geçildi`);
        const bitis = kalici ? null : (eski?.paket === p.id && eski.bitis ? eski.bitis : Date.now()) + ms;
        db.veri(g.id, m.id, (x) => { x.vip = { paket: p.id, bitis, zaman: eski?.paket === p.id ? eski.zaman : Date.now(), veren: i.user.id }; });
        const notlar = [];
        await m.roles.add(roller[p.id]).catch(() => notlar.push('⚠️ Rol verilemedi; bot rolü VIP rollerinin üstünde olmalı'));
        const oyun = eski?.paket === p.id ? null : await oyunKomutu(g.id, m.id, komutlar(g.id, p.id).ver);
        if (oyun) notlar.push(oyun);
        const kart = await cizim.bannerKart({ ust: eski?.paket === p.id ? 'VIP UZATILDI' : 'YENİ VIP', baslik: m.displayName, alt: `${p.ad} • ${bitis ? `${sureYaz(bitis - Date.now())} kaldı` : 'süresiz'} • ${p.carpan}x XP`, avatarUrl: m.displayAvatarURL({ extension: 'png', size: 256 }), ad: m.displayName, vurgu: `#${p.renk.toString(16).padStart(6, '0')}`, dosya: 'vip' });
        await m.send({ content: `💎 **${g.name}** sunucusunda **${p.ad}** paketin aktif! Teşekkürler.`, files: [kart] }).catch(() => {});
        await log(g, E('💎 VIP verildi', `**Üye:** ${m}\n**Paket:** ${p.ad}\n**Bitiş:** ${bitis ? zd(bitis) : 'süresiz'}\n**Veren:** ${i.user}${notlar.length ? `\n${notlar.join('\n')}` : ''}`, p.renk));
        return i.editReply({ content: `${m}`, files: [kart], embeds: notlar.length ? [E(null, notlar.join('\n'), R.altin)] : [] });
      } },
  ],
  olaylar: {
    // Sunucu takviyesi (boost) başladı/bitti
    guildMemberUpdate: async (eski, yeni) => {
      const once = Boolean(eski.premiumSince), simdi = Boolean(yeni.premiumSince), g = yeni.guild;
      if (once === simdi || eski.partial) return;
      db.veri(g.id, yeni.id, (v) => { v.booster = simdi || undefined; });
      if (!simdi) return;
      const v = db.uye(g.id, yeni.id).veri, odul = !v.boostOdul || Date.now() - v.boostOdul > 30 * 864e5;
      if (odul) { db.arttir(g.id, yeni.id, 'para', 2500); db.veri(g.id, yeni.id, (x) => { x.boostOdul = Date.now(); }); }
      const k = g.channels.cache.get(db.ayar(g.id, 'kanal.sohbet')) || g.channels.cache.get(db.ayar(g.id, 'kanal.duyuru'));
      const kart = await cizim.bannerKart({ ust: 'SUNUCUYU TAKVİYE ETTİ', baslik: yeni.displayName, alt: `Teşekkürler! 1.25x XP${odul ? ' + 2.500 coin' : ''}`, avatarUrl: yeni.displayAvatarURL({ extension: 'png', size: 256 }), ad: yeni.displayName, vurgu: '#ff73fa', dosya: 'boost' });
      await k?.send({ content: `🚀 ${yeni} sunucuyu takviye etti!`, files: [kart] }).catch(() => {});
    },
  },
  // Süresi biten VIP'leri düşür, 3 gün kala hatırlat
  async tik(ctx) {
    for (const g of ctx.client.guilds.cache.values()) {
      for (const u of db.sql.prepare("SELECT user, veri FROM uye WHERE guild=? AND veri LIKE '%\"vip\"%'").all(g.id)) {
        const v = JSON.parse(u.veri).vip;
        if (!v?.bitis) continue;
        if (v.bitis < Date.now()) {
          await vipKaldir(g, u.user, 'süresi doldu');
          await (await g.members.fetch(u.user).catch(() => null))?.send(`💎 **${g.name}** sunucusundaki **${paketBul(v.paket)?.ad}** paketinin süresi doldu. Yenilemek için mağazaya göz at!`).catch(() => {});
        } else if (v.bitis - Date.now() < 3 * 864e5 && !v.hatirlatildi) {
          db.veri(g.id, u.user, (x) => { if (x.vip) x.vip.hatirlatildi = true; });
          await (await g.members.fetch(u.user).catch(() => null))?.send(`⏳ **${g.name}** sunucusundaki **${paketBul(v.paket)?.ad}** paketinin bitmesine ${sureYaz(v.bitis - Date.now())} kaldı.`).catch(() => {});
        }
      }
    }
  },
};
