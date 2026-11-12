// Topluluk araçları: anket, öneri, yıldız panosu, hatırlatıcı, zaman kapsülü, AFK, doğum günü, rol paneli
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const { E, R, yanit, hata, tamam, sureCoz, zd, cubuk, gun, kisalt } = require('../core/util');

function anketGorunum(a) {
  const toplam = Object.keys(a.oylar).length;
  const say = a.secenekler.map((_, k) => Object.values(a.oylar).filter((v) => v === k).length);
  const e = E(`📊 ${a.soru}`, a.secenekler.map((s, k) => `**${s}**\n\`${cubuk(toplam ? say[k] / toplam : 0, 16)}\` ${say[k]} oy (%${toplam ? Math.round((say[k] / toplam) * 100) : 0})`).join('\n\n') + `\n\nToplam **${toplam}** oy${a.bitis ? ` • ${a.bitti ? 'bitti' : `bitiş ${zd(a.bitis)}`}` : ''}`, a.bitti ? R.gri : R.bilgi);
  return { embeds: [e], components: a.bitti ? [] : [new ActionRowBuilder().addComponents(a.secenekler.map((s, k) => new ButtonBuilder().setCustomId(`anket:${a.id}:${k}`).setLabel(kisalt(s, 80)).setStyle(ButtonStyle.Primary)))] };
}
function oneriGorunum(o) {
  const arti = Object.values(o.oylar).filter((v) => v === 1).length, eksi = Object.values(o.oylar).filter((v) => v === -1).length;
  const D = { bekliyor: ['⏳ Değerlendiriliyor', R.bilgi], kabul: ['✅ Kabul edildi', R.ok], red: ['❌ Reddedildi', R.hata] }[o.durum];
  return { embeds: [E(`💡 Öneri #${o.no}`, `${o.metin}\n\n**Öneren:** <@${o.yazan}>\n**Durum:** ${D[0]}${o.yanit ? `\n**Yetkili notu:** ${o.yanit}` : ''}`, D[1])],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`oneri:${o.id}:1`).setLabel(String(arti)).setEmoji('👍').setStyle(ButtonStyle.Success).setDisabled(o.durum !== 'bekliyor'),
      new ButtonBuilder().setCustomId(`oneri:${o.id}:-1`).setLabel(String(eksi)).setEmoji('👎').setStyle(ButtonStyle.Danger).setDisabled(o.durum !== 'bekliyor'))] };
}
const afk = new Map(); // guild:user -> {sebep, t}  (hız için bellekte; db'den yüklenir)

module.exports = {
  ad: 'topluluk',
  komutlar: [
    { data: new SlashCommandBuilder().setName('anket').setDescription('Butonlu anket açar')
        .addStringOption((o) => o.setName('soru').setDescription('Soru').setRequired(true).setMaxLength(200))
        .addStringOption((o) => o.setName('seçenekler').setDescription('Seçenekleri | ile ayır (2-5). Örn: Mirage | Inferno | Nuke').setRequired(true).setMaxLength(400))
        .addStringOption((o) => o.setName('süre').setDescription('Örn: 1s, 1g (boşsa süresiz)')),
      calistir: async (i) => {
        const secenekler = [...new Set(i.options.getString('seçenekler').split('|').map((s) => s.trim()).filter(Boolean))];
        if (secenekler.length < 2 || secenekler.length > 5) return hata(i, '2 ile 5 arasında seçenek gir, `|` ile ayır.');
        const ms = sureCoz(i.options.getString('süre'));
        const a = { soru: i.options.getString('soru'), secenekler, oylar: {}, bitis: ms ? Date.now() + ms : null, kanal: i.channelId };
        a.id = db.belge.ekle(i.guild.id, 'anket', a);
        await i.reply(anketGorunum(a));
        a.mesaj = (await i.fetchReply()).id;
        db.belge.yaz(a.id, a);
      } },
    { data: new SlashCommandBuilder().setName('öneri').setDescription('Öneri sistemi')
        .addSubcommand((s) => s.setName('yap').setDescription('Sunucu için öneride bulun').addStringOption((o) => o.setName('metin').setDescription('Önerin').setRequired(true).setMaxLength(1000)))
        .addSubcommand((s) => s.setName('yanıtla').setDescription('[Yetkili] Öneriyi kabul/ret eder')
          .addIntegerOption((o) => o.setName('no').setDescription('Öneri numarası').setRequired(true))
          .addStringOption((o) => o.setName('karar').setDescription('Karar').setRequired(true).addChoices({ name: 'Kabul', value: 'kabul' }, { name: 'Ret', value: 'red' }))
          .addStringOption((o) => o.setName('not').setDescription('Açıklama').setMaxLength(300))),
      calistir: async (i) => {
        const g = i.guild, kanal = g.channels.cache.get(db.ayar(g.id, 'kanal.oneri'));
        if (!kanal) return hata(i, 'Öneri kanalı ayarlı değil. `/kurulum` ya da `/ayar kanal` kullanılmalı.');
        if (i.options.getSubcommand() === 'yap') {
          const no = db.ayar(g.id, 'oneri.sayac', 0) + 1;
          db.ayarYaz(g.id, 'oneri.sayac', no);
          const o = { no, metin: i.options.getString('metin'), yazan: i.user.id, oylar: {}, durum: 'bekliyor' };
          o.id = db.belge.ekle(g.id, 'oneri', o, String(no));
          const m = await kanal.send(oneriGorunum(o));
          o.mesaj = m.id; db.belge.yaz(o.id, o);
          return tamam(i, `Önerin ${kanal} kanalına gönderildi (#${no}).`, true);
        }
        if (!i.memberPermissions.has(P.ManageGuild)) return hata(i, 'Bunun için **Sunucuyu Yönet** yetkisi gerekir.');
        const o = db.belge.refHepsi(g.id, 'oneri', String(i.options.getInteger('no')))[0];
        if (!o) return hata(i, 'Öneri bulunamadı.');
        o.durum = i.options.getString('karar'); o.yanit = i.options.getString('not');
        db.belge.yaz(o.id, o);
        await kanal.messages.edit(o.mesaj, oneriGorunum(o)).catch(() => {});
        if (o.durum === 'kabul') db.arttir(g.id, o.yazan, 'para', 300);
        return tamam(i, `Öneri #${o.no} ${o.durum === 'kabul' ? 'kabul edildi (önerene +300 🪙)' : 'reddedildi'}.`, true);
      } },
    { data: new SlashCommandBuilder().setName('hatırlat').setDescription('Belirtilen süre sonra seni etiketleyerek hatırlatır')
        .addStringOption((o) => o.setName('süre').setDescription('Örn: 20dk, 2s, 1g').setRequired(true))
        .addStringOption((o) => o.setName('mesaj').setDescription('Ne hatırlatayım?').setRequired(true).setMaxLength(500)),
      calistir: (i) => {
        const ms = sureCoz(i.options.getString('süre'));
        if (!ms || ms < 10_000 || ms > 365 * 864e5) return hata(i, 'Geçersiz süre. Örnek: `20dk`, `2s`, `1g`.');
        if (db.belge.refHepsi(i.guild.id, 'hatirlatici', i.user.id).length >= 10) return hata(i, 'En fazla 10 bekleyen hatırlatıcın olabilir.');
        db.belge.ekle(i.guild.id, 'hatirlatici', { kanal: i.channelId, mesaj: i.options.getString('mesaj'), bitis: Date.now() + ms }, i.user.id);
        return tamam(i, `Tamam, ${zd(Date.now() + ms)} hatırlatacağım.`, true);
      } },
    { data: new SlashCommandBuilder().setName('zaman-kapsülü').setDescription('Geleceğe mesaj bırak: süre dolunca bu kanalda açılır')
        .addStringOption((o) => o.setName('süre').setDescription('Örn: 30g, 26hafta (en az 1 gün)').setRequired(true))
        .addStringOption((o) => o.setName('mesaj').setDescription('Gelecekteki sunucuya mesajın').setRequired(true).setMaxLength(1500)),
      calistir: async (i) => {
        const ms = sureCoz(i.options.getString('süre'));
        if (!ms || ms < 864e5 || ms > 5 * 365 * 864e5) return hata(i, 'Süre 1 gün ile 5 yıl arasında olmalı. Örnek: `30g`, `52hafta`.');
        if (db.belge.refHepsi(i.guild.id, 'kapsul', i.user.id).length >= 5) return hata(i, 'En fazla 5 gömülü kapsülün olabilir.');
        db.belge.ekle(i.guild.id, 'kapsul', { kanal: i.channelId, mesaj: i.options.getString('mesaj'), bitis: Date.now() + ms }, i.user.id);
        await tamam(i, 'Kapsülün mühürlendi.', true);
        await i.channel.send({ embeds: [E(null, `⏳ ${i.user} bir **zaman kapsülü** gömdü. ${zd(Date.now() + ms, 'D')} tarihinde burada açılacak.`, R.mor)] }).catch(() => {});
      } },
    { data: new SlashCommandBuilder().setName('afk').setDescription('AFK olduğunu bildirir; etiketleyenlere haber verilir').addStringOption((o) => o.setName('sebep').setDescription('Sebep').setMaxLength(150)),
      calistir: (i) => {
        const v = { sebep: i.options.getString('sebep') || 'AFK', t: Date.now() };
        afk.set(`${i.guild.id}:${i.user.id}`, v);
        db.veri(i.guild.id, i.user.id, (d) => { d.afk = v; });
        return yanit(i, E(null, `💤 ${i.user} artık AFK: ${v.sebep}`, R.gri));
      } },
    { data: new SlashCommandBuilder().setName('doğumgünü').setDescription('Doğum gününü kaydet; o gün kutlanırsın ve hediye coin alırsın')
        .addIntegerOption((o) => o.setName('gün').setDescription('Gün').setRequired(true).setMinValue(1).setMaxValue(31))
        .addIntegerOption((o) => o.setName('ay').setDescription('Ay').setRequired(true).setMinValue(1).setMaxValue(12)),
      calistir: (i) => {
        const g = i.options.getInteger('gün'), a = i.options.getInteger('ay');
        if (g > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][a - 1]) return hata(i, 'Geçersiz tarih.');
        db.veri(i.guild.id, i.user.id, (d) => { d.dogum = `${String(a).padStart(2, '0')}-${String(g).padStart(2, '0')}`; });
        return tamam(i, `Doğum günün **${g}.${a}** olarak kaydedildi 🎂`, true);
      } },
    { data: (() => { const b = new SlashCommandBuilder().setName('rol-panel').setDescription('Üyelerin butonla rol alıp bırakabileceği panel gönderir').setDefaultMemberPermissions(P.ManageRoles)
        .addStringOption((o) => o.setName('başlık').setDescription('Panel başlığı').setRequired(true).setMaxLength(100));
        for (let n = 1; n <= 5; n++) b.addRoleOption((o) => o.setName(`rol${n}`).setDescription(`${n}. rol`).setRequired(n === 1));
        return b; })(),
      calistir: async (i) => {
        const roller = [1, 2, 3, 4, 5].map((n) => i.options.getRole(`rol${n}`)).filter(Boolean);
        const ben = i.guild.members.me.roles.highest.position;
        const sorunlu = roller.find((r) => r.managed || r.position >= ben || r.id === i.guild.id || r.permissions.has(P.Administrator) || r.permissions.has(P.ManageGuild));
        if (sorunlu) return hata(i, `${sorunlu} rolü panele eklenemez (benim rolümden yüksek, bot rolü ya da yönetici yetkili).`);
        await i.channel.send({ embeds: [E(`🎭 ${i.options.getString('başlık')}`, `Rol almak ya da bırakmak için butona bas.\n\n${roller.map((r) => `${r}`).join('\n')}`)],
          components: [new ActionRowBuilder().addComponents(roller.map((r) => new ButtonBuilder().setCustomId(`rol:${r.id}`).setLabel(kisalt(r.name, 80)).setStyle(ButtonStyle.Secondary)))] });
        return tamam(i, 'Rol paneli gönderildi.', true);
      } },
  ],
  bilesenler: {
    anket: (i, [id, k]) => {
      const a = db.belge.al(id);
      if (!a || a.bitti) return hata(i, 'Bu anket sona erdi.');
      if (a.oylar[i.user.id] === Number(k)) delete a.oylar[i.user.id]; else a.oylar[i.user.id] = Number(k);
      db.belge.yaz(a.id, a);
      return i.update(anketGorunum(a));
    },
    oneri: (i, [id, oy]) => {
      const o = db.belge.al(id);
      if (!o || o.durum !== 'bekliyor') return hata(i, 'Bu öneri oylamaya kapalı.');
      if (o.oylar[i.user.id] === Number(oy)) delete o.oylar[i.user.id]; else o.oylar[i.user.id] = Number(oy);
      db.belge.yaz(o.id, o);
      return i.update(oneriGorunum(o));
    },
    rol: async (i, [rolId]) => {
      const rol = i.guild.roles.cache.get(rolId);
      if (!rol || rol.permissions.has(P.Administrator) || rol.permissions.has(P.ManageGuild)) return hata(i, 'Bu rol artık verilemiyor.');
      const var_ = i.member.roles.cache.has(rolId);
      await (var_ ? i.member.roles.remove(rolId) : i.member.roles.add(rolId));
      return tamam(i, var_ ? `${rol} rolü bırakıldı.` : `${rol} rolü verildi.`, true);
    },
  },
  hazir: () => { for (const u of db.sql.prepare("SELECT guild, user, veri FROM uye WHERE veri LIKE '%\"afk\"%'").all()) { const v = JSON.parse(u.veri).afk; if (v) afk.set(`${u.guild}:${u.user}`, v); } },
  olaylar: {
    messageCreate: async (m) => {
      if (!m.guild || m.author.bot) return;
      const k = `${m.guild.id}:${m.author.id}`;
      if (afk.has(k) && Date.now() - afk.get(k).t > 5000) {
        afk.delete(k);
        db.veri(m.guild.id, m.author.id, (d) => { delete d.afk; });
        const b = await m.reply({ embeds: [E(null, '👋 Tekrar hoş geldin, AFK durumun kaldırıldı.', R.ok)] }).catch(() => null);
        if (b) setTimeout(() => b.delete().catch(() => {}), 5000);
      }
      const afklar = [...m.mentions.users.values()].filter((u) => afk.has(`${m.guild.id}:${u.id}`)).slice(0, 3);
      if (afklar.length) await m.reply({ embeds: [E(null, afklar.map((u) => { const v = afk.get(`${m.guild.id}:${u.id}`); return `💤 **${u.username}** AFK: ${v.sebep} (${zd(v.t)})`; }).join('\n'), R.gri)], allowedMentions: { repliedUser: false } }).catch(() => {});
    },
    // Yıldız panosu: 3+ ⭐ alan mesajlar yıldız kanalına taşınır
    messageReactionAdd: async (tepki) => {
      if (tepki.emoji.name !== '⭐') return;
      if (tepki.partial) tepki = await tepki.fetch().catch(() => null);
      if (!tepki) return;
      const m = tepki.message.partial ? await tepki.message.fetch().catch(() => null) : tepki.message;
      if (!m?.guild || m.author?.bot) return;
      const kanal = m.guild.channels.cache.get(db.ayar(m.guild.id, 'kanal.yildiz'));
      if (!kanal || kanal.id === m.channelId || tepki.count < 3) return;
      const kayit = db.belge.ref('yildiz', m.id);
      const icerik = `⭐ **${tepki.count}** • ${m.channel}`;
      if (kayit) return kanal.messages.edit(kayit.pano, { content: icerik }).catch(() => {});
      const e = E(null, `${m.content || ''}\n\n[Mesaja git](${m.url})`, R.altin).setAuthor({ name: m.author.username, iconURL: m.author.displayAvatarURL() }).setTimestamp(m.createdTimestamp);
      const resim = m.attachments.find((a) => a.contentType?.startsWith('image/'));
      if (resim) e.setImage(resim.url);
      const pano = await kanal.send({ content: icerik, embeds: [e] }).catch(() => null);
      if (pano) { db.belge.ekle(m.guild.id, 'yildiz', { pano: pano.id }, m.id); db.arttir(m.guild.id, m.author.id, 'para', 100); }
    },
  },
  async hizliTik(ctx) {
    const simdi = Date.now();
    for (const h of db.belge.hepsi('hatirlatici')) {
      if (h.bitis > simdi) continue;
      db.belge.sil(h.id);
      await ctx.client.channels.cache.get(h.kanal)?.send({ content: `<@${h.ref}>`, embeds: [E('⏰ Hatırlatma', h.mesaj, R.bilgi).setFooter({ text: 'Bunu sen istemiştin' })] }).catch(() => {});
    }
    for (const k of db.belge.hepsi('kapsul')) {
      if (k.bitis > simdi) continue;
      db.belge.sil(k.id);
      await ctx.client.channels.cache.get(k.kanal)?.send({ content: `<@${k.ref}>`, embeds: [E('⏳ Zaman kapsülü açıldı!', `${zd(k.zaman, 'D')} tarihinde <@${k.ref}> şunu yazmıştı:\n\n>>> ${k.mesaj}`, R.mor)] }).catch(() => {});
    }
    for (const a of db.belge.hepsi('anket')) {
      if (!a.bitis) { if (simdi - a.zaman > 30 * 864e5) db.belge.sil(a.id); continue; }
      if (a.bitis > simdi) continue;
      a.bitti = true;
      await ctx.client.channels.cache.get(a.kanal)?.messages.edit(a.mesaj, anketGorunum(a)).catch(() => {});
      db.belge.sil(a.id);
    }
  },
  // Doğum günleri: her gün ilk dakikada kontrol
  async tik(ctx) {
    const bugun = gun();
    for (const g of ctx.client.guilds.cache.values()) {
      if (db.ayar(g.id, 'dogum.son') === bugun) continue;
      db.ayarYaz(g.id, 'dogum.son', bugun);
      const kanal = g.channels.cache.get(db.ayar(g.id, 'kanal.dogumgunu'));
      const liste = db.sql.prepare("SELECT user FROM uye WHERE guild=? AND json_extract(veri, '$.dogum') = ?").all(g.id, bugun.slice(5));
      for (const { user } of liste) {
        if (!(await g.members.fetch(user).catch(() => null))) continue;
        db.arttir(g.id, user, 'para', 500);
        await kanal?.send({ content: `<@${user}>`, embeds: [E('🎂 İyi ki doğdun!', `Bugün <@${user}> kullanıcısının doğum günü! Hediyen: **500** 🪙\nHerkes ateşin başına toplansın 🔥`, R.altin)] }).catch(() => {});
      }
    }
  },
};
