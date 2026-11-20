// Moderasyon: ban, kick, zaman aşımı, uyarı sistemi, jail, toplu silme, kanal kilidi
const { SlashCommandBuilder } = require('discord.js');
const db = require('../core/db');
const { log } = require('../core/log');
const { E, R, hata, tamam, yanit, sureCoz, sureYaz, zd } = require('../core/util');
const yetki = require('../core/yetki');

// Hedef üye üzerinde işlem yapılabilir mi? (rol hiyerarşisi kontrolü)
function kontrol(i, hedef) {
  if (!hedef) return 'Üye sunucuda bulunamadı.';
  if (hedef.id === i.user.id) return 'Kendine işlem yapamazsın.';
  if (hedef.id === i.client.user.id) return 'Bana işlem yapamazsın 😅';
  if (hedef.id === i.guild.ownerId) return 'Sunucu sahibine işlem yapılamaz.';
  const ust = yetki.ustYetkili(i, hedef); if (ust) return ust;
  if (hedef.roles.highest.position >= i.guild.members.me.roles.highest.position) return 'Bu üyenin rolü benim rolümden yüksek; rolümü yukarı taşı.';
  return null;
}
// Mod-log'a yazar ve cezayı üyenin siciline işler (yetkili istatistikleri de buradan sayılır)
const kayit = (i, baslik, hedef, sebep, renk = R.hata, ek = '', tur = null, sure = null) => {
  if (tur) yetki.cezaKaydet(i.guild.id, hedef.id, i.user.id, tur, sebep, sure);
  return log(i.guild, E(baslik, `**Üye:** ${hedef} (\`${hedef.id}\`)\n**Yetkili:** ${i.user} • ${yetki.seviyeAdi(yetki.seviye(i.member))}\n**Sebep:** ${sebep}${ek}`, renk));
};
const izin = (i, islem) => { const h = yetki.gerek(i, islem); if (h) { hata(i, h); return false; } return true; };
const dm = (kullanici, metin) => kullanici.send({ embeds: [E(null, metin, R.hata)] }).catch(() => {});
const uyeSec = (b, zorunlu = true) => b.addUserOption((o) => o.setName('üye').setDescription('Hedef üye').setRequired(zorunlu));
const sebepSec = (b) => b.addStringOption((o) => o.setName('sebep').setDescription('Sebep').setMaxLength(300));

// Uyarı ekler; eşik aşılırsa otomatik zaman aşımı uygular (otomod da kullanır)
async function uyariEkle(guild, member, yetkiliId, sebep) {
  db.belge.ekle(guild.id, 'uyari', { yetkili: yetkiliId, sebep }, member.id);
  const toplam = db.belge.refHepsi(guild.id, 'uyari', member.id).length;
  const cezalar = { 3: 10 * 6e4, 5: 60 * 6e4, 7: 24 * 36e5 };
  let ceza = null;
  if (cezalar[toplam] && member.moderatable) {
    await member.timeout(cezalar[toplam], `${toplam}. uyarı`).catch(() => {});
    ceza = cezalar[toplam];
  }
  return { toplam, ceza };
}

module.exports = {
  ad: 'moderasyon',
  uyariEkle,
  komutlar: [
    { data: sebepSec(uyeSec(new SlashCommandBuilder().setName('ban').setDescription('Üyeyi sunucudan yasaklar')))
        .addIntegerOption((o) => o.setName('mesaj-sil').setDescription('Kaç günlük mesajı silinsin (0-7)').setMinValue(0).setMaxValue(7))
        .addBooleanOption((o) => o.setName('oyundan-da').setDescription('Bağlı Minecraft hesabını oyundan da yasakla'))
        .addStringOption((o) => o.setName('süre').setDescription('Süreli ban: örn 3g, 1hafta (boşsa kalıcı)')),
      calistir: async (i) => {
        if (!izin(i, 'ban')) return;
        const u = i.options.getUser('üye'), sebep = i.options.getString('sebep') || 'Belirtilmedi';
        const sureMetin = i.options.getString('süre'), ms = sureCoz(sureMetin), lvl = yetki.seviye(i.member);
        if (sureMetin && (!ms || ms < 6e4)) return hata(i, 'Geçersiz süre. Örnek: `3g`, `12s`, `1hafta`.');
        if ((ms || Infinity) > yetki.banMax(lvl)) return hata(i, `Rütben en fazla **${sureYaz(yetki.banMax(lvl))}** süreli ban atabilir. Kalıcı ban için Yönetici gerekir; \`süre\` gir.`);
        const m = await i.guild.members.fetch(u.id).catch(() => null);
        if (m) { const h = kontrol(i, m); if (h) return hata(i, h); }
        await dm(u, `**${i.guild.name}** sunucusundan ${ms ? `**${sureYaz(ms)}** süreyle ` : ''}yasaklandın.\nSebep: ${sebep}\nİtiraz için yetkililere ulaşabilirsin.`);
        await i.guild.members.ban(u.id, { reason: `${i.user.tag}: ${sebep}`, deleteMessageSeconds: (i.options.getInteger('mesaj-sil') || 0) * 86400 });
        let oyunNotu = '';
        const mc = db.uye(i.guild.id, u.id).mc_nick, rcon = require('../core/rcon');
        if (i.options.getBoolean('oyundan-da') && mc) {
          oyunNotu = rcon.hazir() ? await rcon.calistir(`ban ${mc} ${require('./oyun').temizSebep(sebep)}`).then(() => `\n🎮 \`${mc}\` oyundan da yasaklandı.`, (e) => `\n⚠️ Oyun yasağı uygulanamadı: ${e.message}`) : '\n⚠️ RCON ayarlı değil; oyun yasağı uygulanamadı.';
        }
        for (const t of db.belge.refHepsi(i.guild.id, 'tempban', u.id)) db.belge.sil(t.id);
        if (ms) db.belge.ekle(i.guild.id, 'tempban', { bitis: Date.now() + ms }, u.id);
        await tamam(i, `${u} ${ms ? `**${sureYaz(ms)}** ` : 'kalıcı olarak '}yasaklandı. Sebep: ${sebep}${oyunNotu}`);
        await kayit(i, '🔨 Yasaklama', u, sebep, R.hata, `${ms ? `\n**Süre:** ${sureYaz(ms)} (bitiş ${zd(Date.now() + ms)})` : '\n**Süre:** kalıcı'}${oyunNotu}`, 'ban', ms);
      } },
    { data: sebepSec(uyeSec(new SlashCommandBuilder().setName('kick').setDescription('Üyeyi sunucudan atar'))),
      calistir: async (i) => {
        if (!izin(i, 'kick')) return;
        const m = i.options.getMember('üye'), sebep = i.options.getString('sebep') || 'Belirtilmedi';
        const h = kontrol(i, m); if (h) return hata(i, h);
        await dm(m.user, `**${i.guild.name}** sunucusundan atıldın.\nSebep: ${sebep}`);
        await m.kick(`${i.user.tag}: ${sebep}`);
        await tamam(i, `${m.user} atıldı. Sebep: ${sebep}`);
        await kayit(i, '👢 Atma', m.user, sebep, R.altin, '', 'kick');
      } },
    { data: sebepSec(uyeSec(new SlashCommandBuilder().setName('sustur').setDescription('Üyeye zaman aşımı uygular'))
        .addStringOption((o) => o.setName('süre').setDescription('Örn: 10dk, 2s, 1g').setRequired(true))),
      calistir: async (i) => {
        const m = i.options.getMember('üye'), sebep = i.options.getString('sebep') || 'Belirtilmedi';
        if (!izin(i, 'sustur')) return;
        const ms = sureCoz(i.options.getString('süre')), max = yetki.susturMax(yetki.seviye(i.member));
        if (!ms || ms < 5000 || ms > 28 * 864e5) return hata(i, 'Geçersiz süre. Örnek: `10dk`, `2s`, `1g` (en fazla 28 gün).');
        if (ms > max) return hata(i, `Rütben en fazla **${sureYaz(max)}** susturabilir.`);
        const h = kontrol(i, m); if (h) return hata(i, h);
        await m.timeout(ms, `${i.user.tag}: ${sebep}`);
        await tamam(i, `${m} **${sureYaz(ms)}** susturuldu. Sebep: ${sebep}`);
        await kayit(i, '🔇 Susturma', m.user, sebep, R.altin, `\n**Süre:** ${sureYaz(ms)}`, 'sustur', ms);
      } },
    { data: uyeSec(new SlashCommandBuilder().setName('susturma-kaldır').setDescription('Üyenin zaman aşımını kaldırır')),
      calistir: async (i) => {
        if (!izin(i, 'susturma-kaldır')) return;
        const m = i.options.getMember('üye');
        if (!m) return hata(i, 'Üye bulunamadı.');
        await m.timeout(null);
        await tamam(i, `${m} artık susturulmuş değil.`);
        await kayit(i, '🔊 Susturma kaldırıldı', m.user, '—', R.ok);
      } },
    { data: uyeSec(new SlashCommandBuilder().setName('uyar').setDescription('Üyeye uyarı verir (3/5/7. uyarıda otomatik susturma)'))
        .addStringOption((o) => o.setName('sebep').setDescription('Sebep').setRequired(true).setMaxLength(300)),
      calistir: async (i) => {
        if (!izin(i, 'uyar')) return;
        const m = i.options.getMember('üye'), sebep = i.options.getString('sebep');
        const h = kontrol(i, m); if (h) return hata(i, h);
        const { toplam, ceza } = await uyariEkle(i.guild, m, i.user.id, sebep);
        await dm(m.user, `**${i.guild.name}** sunucusunda uyarıldın (${toplam}. uyarı).\nSebep: ${sebep}`);
        await tamam(i, `${m} uyarıldı (**${toplam}.** uyarı).${ceza ? ` Otomatik susturma: **${sureYaz(ceza)}**` : ''}`);
        await kayit(i, '⚠️ Uyarı', m.user, sebep, R.altin, `\n**Toplam uyarı:** ${toplam}`, 'uyari');
      } },
    { data: uyeSec(new SlashCommandBuilder().setName('uyarılar').setDescription('Üyenin uyarılarını listeler')),
      calistir: (i) => {
        if (!izin(i, 'sicil')) return;
        const u = i.options.getUser('üye');
        const l = db.belge.refHepsi(i.guild.id, 'uyari', u.id);
        if (!l.length) return yanit(i, E(null, `${u} için uyarı yok.`, R.ok), true);
        return yanit(i, E(`⚠️ ${u.username} — ${l.length} uyarı`, l.slice(-15).map((w) => `\`#${w.id}\` ${zd(w.zaman, 'd')} • <@${w.yetkili}> — ${w.sebep}`).join('\n'), R.altin), true);
      } },
    { data: new SlashCommandBuilder().setName('uyarı-sil').setDescription('Bir uyarıyı ya da üyenin tüm uyarılarını siler')
        .addIntegerOption((o) => o.setName('id').setDescription('Uyarı numarası'))
        .addUserOption((o) => o.setName('üye').setDescription('Tüm uyarıları silinecek üye')),
      calistir: (i) => {
        if (!izin(i, 'uyari-sil')) return;
        const id = i.options.getInteger('id'), u = i.options.getUser('üye');
        if (id) {
          const w = db.belge.al(id);
          if (!w || w.tur !== 'uyari' || w.guild !== i.guild.id) return hata(i, 'Uyarı bulunamadı.');
          db.belge.sil(id);
          return tamam(i, `\`#${id}\` numaralı uyarı silindi.`, true);
        }
        if (!u) return hata(i, 'Bir uyarı numarası ya da üye belirt.');
        const l = db.belge.refHepsi(i.guild.id, 'uyari', u.id);
        l.forEach((w) => db.belge.sil(w.id));
        return tamam(i, `${u} için ${l.length} uyarı silindi.`, true);
      } },
    { data: new SlashCommandBuilder().setName('sil').setDescription('Kanaldan toplu mesaj siler')
        .addIntegerOption((o) => o.setName('adet').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption((o) => o.setName('üye').setDescription('Yalnızca bu üyenin mesajları')),
      calistir: async (i) => {
        if (!izin(i, 'sil')) return;
        await i.deferReply({ flags: 64 });
        const u = i.options.getUser('üye');
        let mesajlar = await i.channel.messages.fetch({ limit: 100 });
        if (u) mesajlar = mesajlar.filter((m) => m.author.id === u.id);
        const hedef = [...mesajlar.values()].slice(0, i.options.getInteger('adet'));
        const silinen = await i.channel.bulkDelete(hedef, true);
        await i.editReply({ embeds: [E(null, `🧹 **${silinen.size}** mesaj silindi.${silinen.size < hedef.length ? ' (14 günden eski mesajlar silinemez)' : ''}`, R.ok)] });
        await log(i.guild, E('🧹 Toplu silme', `${i.user}, ${i.channel} kanalında **${silinen.size}** mesaj sildi.`, R.gri));
      } },
    { data: sebepSec(uyeSec(new SlashCommandBuilder().setName('jail').setDescription('Üyeyi cezalıya atar (rolleri saklanır)'))
        .addStringOption((o) => o.setName('süre').setDescription('Örn: 1s, 1g (boşsa süresiz)'))),
      calistir: async (i) => {
        if (!izin(i, 'jail')) return;
        const m = i.options.getMember('üye'), sebep = i.options.getString('sebep') || 'Belirtilmedi';
        const rolId = db.ayar(i.guild.id, 'rol.jail');
        if (!rolId || !i.guild.roles.cache.get(rolId)) return hata(i, 'Cezalı rolü ayarlı değil. `/kurulum` ya da `/ayar rol` kullan.');
        const h = kontrol(i, m); if (h) return hata(i, h);
        if (db.belge.refHepsi(i.guild.id, 'jail', m.id).length) return hata(i, 'Bu üye zaten cezalı.');
        const ms = sureCoz(i.options.getString('süre'));
        await i.deferReply();
        const eski = m.roles.cache.filter((r) => r.id !== i.guild.id && !r.managed && r.editable).map((r) => r.id);
        await m.roles.remove(eski).catch(() => {});
        await m.roles.add(rolId);
        if (m.voice.channelId) await m.voice.disconnect().catch(() => {});
        db.belge.ekle(i.guild.id, 'jail', { roller: eski, bitis: ms ? Date.now() + ms : null }, m.id);
        await tamam(i, `${m} cezalıya atıldı${ms ? ` (**${sureYaz(ms)}**)` : ''}. Sebep: ${sebep}`);
        await kayit(i, '⛓️ Jail', m.user, sebep, R.hata, ms ? `\n**Süre:** ${sureYaz(ms)}` : '', 'jail', ms);
      } },
    { data: uyeSec(new SlashCommandBuilder().setName('unjail').setDescription('Üyeyi cezalıdan çıkarır, rollerini geri verir')),
      calistir: async (i) => {
        if (!izin(i, 'unjail')) return;
        const m = i.options.getMember('üye');
        const j = m && db.belge.refHepsi(i.guild.id, 'jail', m.id)[0];
        if (!j) return hata(i, 'Bu üye cezalı değil.');
        await i.deferReply();
        await jailBitir(i.guild, j);
        await tamam(i, `${m} cezalıdan çıkarıldı.`);
        await kayit(i, '🔓 Unjail', m.user, '—', R.ok);
      } },
    { data: new SlashCommandBuilder().setName('yavaşmod').setDescription('Kanalın yavaş modunu ayarlar')
        .addIntegerOption((o) => o.setName('saniye').setDescription('0 = kapalı').setRequired(true).setMinValue(0).setMaxValue(21600)),
      calistir: async (i) => {
        if (!izin(i, 'yavasmod')) return;
        const s = i.options.getInteger('saniye');
        await i.channel.setRateLimitPerUser(s);
        return tamam(i, s ? `Yavaş mod **${s} saniye** olarak ayarlandı.` : 'Yavaş mod kapatıldı.');
      } },
    { data: new SlashCommandBuilder().setName('kilit').setDescription('Kanalı mesaj gönderimine kapatır/açar')
        .addStringOption((o) => o.setName('durum').setDescription('Durum').setRequired(true).addChoices({ name: 'Kilitle', value: 'kapat' }, { name: 'Aç', value: 'ac' })),
      calistir: async (i) => {
        if (!izin(i, 'kilit')) return;
        const kapat = i.options.getString('durum') === 'kapat';
        await i.channel.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: kapat ? false : null });
        return yanit(i, E(null, kapat ? '🔒 Kanal kilitlendi.' : '🔓 Kanal kilidi açıldı.', kapat ? R.hata : R.ok));
      } },
    { data: new SlashCommandBuilder().setName('yasak-kaldır').setDescription('[Yetkili] Bir kullanıcının sunucu yasağını kaldırır')
        .addStringOption((o) => o.setName('kullanıcı-id').setDescription('Yasaklı kullanıcının ID\'si').setRequired(true).setMaxLength(20)).addStringOption((o) => o.setName('sebep').setDescription('Sebep').setMaxLength(300)),
      calistir: async (i) => {
        if (!izin(i, 'unban')) return;
        const id = i.options.getString('kullanıcı-id').trim();
        if (!/^\d{17,20}$/.test(id)) return hata(i, 'Geçerli bir kullanıcı ID\'si gir.');
        const oldu = await i.guild.members.unban(id, `${i.user.tag}: ${i.options.getString('sebep') || 'yasak kaldırıldı'}`).then(() => true, () => false);
        if (!oldu) return hata(i, 'Bu ID ile yasaklı bir kullanıcı bulunamadı.');
        for (const t of db.belge.refHepsi(i.guild.id, 'tempban', id)) db.belge.sil(t.id);
        await tamam(i, `<@${id}> kullanıcısının yasağı kaldırıldı.`);
        await kayit(i, '🔓 Yasak kaldırıldı', { id, toString: () => `<@${id}>` }, i.options.getString('sebep') || '—', R.ok);
      } },
    { data: uyeSec(new SlashCommandBuilder().setName('sicil').setDescription('[Yetkili] Üyenin tüm ceza geçmişi, notları ve hesap bilgisi')),
      calistir: async (i) => {
        if (!izin(i, 'sicil')) return;
        const u = i.options.getUser('üye'), g = i.guild.id, uye = db.uye(g, u.id);
        const cezalar = db.belge.refHepsi(g, 'ceza', u.id), uyarilar = db.belge.refHepsi(g, 'uyari', u.id), notlar = db.belge.refHepsi(g, 'not', u.id);
        const say = (t) => cezalar.filter((c) => c.tur === t).length;
        const ETIKET = { uyari: '⚠️ Uyarı', sustur: '🔇 Susturma', kick: '👢 Atma', ban: '🔨 Ban', jail: '⛓️ Jail', 'oyun-ban': '🎮 Oyun banı', 'oyun-at': '🎮 Oyundan atma' };
        const gecmis = cezalar.slice(-12).reverse().map((c) => `${ETIKET[c.tur] || c.tur} • ${zd(c.zaman, 'd')} • <@${c.yetkili}>${c.sure ? ` • ${sureYaz(c.sure)}` : ''}\n> ${c.sebep || '—'}`);
        const puan = uyarilar.length + say('sustur') * 2 + say('kick') * 3 + say('jail') * 3 + say('ban') * 5;
        const durum = puan === 0 ? '🟢 Temiz' : puan < 5 ? '🟡 Dikkat' : puan < 12 ? '🟠 Sorunlu' : '🔴 Riskli';
        const e = E(`📁 Sicil — ${u.username}`, gecmis.join('\n') || '*Hiç cezası yok.*', puan < 5 ? R.ok : R.hata).setThumbnail(u.displayAvatarURL?.() || null).addFields(
          { name: 'Durum', value: `${durum} (${puan} puan)`, inline: true }, { name: 'Uyarı', value: String(uyarilar.length), inline: true }, { name: 'Susturma', value: String(say('sustur')), inline: true },
          { name: 'Atma / Ban', value: `${say('kick')} / ${say('ban')}`, inline: true }, { name: 'Jail', value: String(say('jail')), inline: true },
          { name: 'Minecraft', value: uye.mc_nick ? `\`${uye.mc_nick}\` ${uye.mc_dogrulandi ? '✅' : '⚠️'}` : '—', inline: true });
        if (notlar.length) e.addFields({ name: `📝 Yetkili notları (${notlar.length})`, value: notlar.slice(-5).map((n) => `\`#${n.id}\` <@${n.yazan}>: ${n.metin}`).join('\n').slice(0, 1024) });
        return yanit(i, e, true);
      } },
    { data: new SlashCommandBuilder().setName('not').setDescription('[Yetkili] Üye hakkında yalnızca yetkililerin göreceği not')
        .addSubcommand((s) => s.setName('ekle').setDescription('Not ekler').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)).addStringOption((o) => o.setName('metin').setDescription('Not').setRequired(true).setMaxLength(300)))
        .addSubcommand((s) => s.setName('sil').setDescription('Notu siler').addIntegerOption((o) => o.setName('id').setDescription('Not numarası').setRequired(true))),
      calistir: (i) => {
        if (!izin(i, 'not')) return;
        if (i.options.getSubcommand() === 'ekle') {
          const u = i.options.getUser('üye');
          const id = db.belge.ekle(i.guild.id, 'not', { yazan: i.user.id, metin: i.options.getString('metin') }, u.id);
          return tamam(i, `📝 ${u} için not eklendi (\`#${id}\`). \`/sicil\` ile görülebilir.`, true);
        }
        const n = db.belge.al(i.options.getInteger('id'));
        if (!n || n.tur !== 'not' || n.guild !== i.guild.id) return hata(i, 'Not bulunamadı.');
        if (n.yazan !== i.user.id && yetki.seviye(i.member) < 5) return hata(i, 'Başkasının notunu yalnızca Yönetici silebilir.');
        db.belge.sil(n.id);
        return tamam(i, 'Not silindi.', true);
      } },
  ],
  // Süreli jail ve banları bitir
  async tik(ctx) {
    for (const t of db.belge.hepsi('tempban')) {
      if (t.bitis > Date.now()) continue;
      db.belge.sil(t.id);
      const g = ctx.client.guilds.cache.get(t.guild);
      if (g) { await g.members.unban(t.ref, 'Süreli ban bitti').catch(() => {}); await log(g, E('⏰ Süreli ban bitti', `<@${t.ref}> kullanıcısının yasağı kendiliğinden kalktı.`, R.ok)); }
    }
    for (const j of db.belge.hepsi('jail')) {
      if (!j.bitis || j.bitis > Date.now()) continue;
      const g = ctx.client.guilds.cache.get(j.guild);
      if (g) await jailBitir(g, j);
      else db.belge.sil(j.id);
    }
  },
  olaylar: {
    // Cezalıyken çıkıp girenlere rolü geri ver
    guildMemberAdd: async (m) => {
      const j = db.belge.refHepsi(m.guild.id, 'jail', m.id)[0];
      const rolId = db.ayar(m.guild.id, 'rol.jail');
      if (j && rolId) await m.roles.add(rolId).catch(() => {});
    },
    messageDelete: async (m) => {
      if (!m.guild || m.partial || m.author?.bot || !m.content) return;
      await log(m.guild, E('🗑️ Mesaj silindi', `**Yazan:** ${m.author} • **Kanal:** ${m.channel}\n${m.content.slice(0, 1500)}`, R.gri));
    },
    messageUpdate: async (eski, yeni) => {
      if (!yeni.guild || eski.partial || yeni.author?.bot || eski.content === yeni.content || !eski.content) return;
      await log(yeni.guild, E('✏️ Mesaj düzenlendi', `**Yazan:** ${yeni.author} • [Mesaja git](${yeni.url})\n**Önce:** ${eski.content.slice(0, 700)}\n**Sonra:** ${(yeni.content || '').slice(0, 700)}`, R.gri));
    },
  },
};

async function jailBitir(guild, j) {
  db.belge.sil(j.id);
  const m = await guild.members.fetch(j.ref).catch(() => null);
  if (!m) return;
  const rolId = db.ayar(guild.id, 'rol.jail');
  if (rolId) await m.roles.remove(rolId).catch(() => {});
  const geri = (j.roller || []).filter((r) => guild.roles.cache.get(r)?.editable);
  if (geri.length) await m.roles.add(geri).catch(() => {});
}
