// Otomatik moderasyon: spam, davet/link, küfür, büyük harf, toplu etiket ve baskın (raid) koruması
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
const db = require('../core/db');
const { log } = require('../core/log');
const { E, R, yanit, tamam, hata } = require('../core/util');

const FILTRELER = { spam: 'Spam (hızlı/tekrarlı mesaj)', davet: 'Discord davet linkleri', link: 'Tüm linkler', kufur: 'Yasaklı kelimeler', buyukharf: 'Aşırı büyük harf', etiket: 'Toplu etiketleme', baskin: 'Baskın (raid) koruması' };
const VARSAYILAN = { spam: true, davet: true, link: false, kufur: true, buyukharf: false, etiket: true, baskin: true };
const ayarlar = (g) => ({ ...VARSAYILAN, ...db.ayar(g, 'otomod', {}) });

const sonMesajlar = new Map(); // guild:user -> [{t, icerik}]
const ihlaller = new Map();    // guild:user -> {n, t}
const girisler = new Map();    // guild -> [zaman]
const normalize = (s) => s.toLowerCase().replace(/[0@]/g, 'o').replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5|\$/g, 's').replace(/(.)\1{2,}/g, '$1');

function ihlalBul(m, a) {
  const icerik = m.content;
  if (a.davet && /(discord\.gg|discord(app)?\.com\/invite)\/[\w-]+/i.test(icerik)) return 'Davet linki paylaşımı';
  if (a.link && /https?:\/\/\S+/i.test(icerik)) return 'Link paylaşımı';
  if (a.etiket && m.mentions.users.size >= 6) return 'Toplu etiketleme';
  if (a.kufur) {
    const liste = db.ayar(m.guild.id, 'otomod.kelimeler', []);
    if (liste.length) {
      const kelimeler = normalize(icerik).split(/[^a-zğüşıöç]+/);
      if (liste.some((k) => kelimeler.includes(k))) return 'Yasaklı kelime';
    }
  }
  if (a.buyukharf && icerik.length >= 12) {
    const harf = icerik.replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ]/g, '');
    if (harf.length >= 10 && harf.replace(/[^A-ZĞÜŞİÖÇ]/g, '').length / harf.length > 0.75) return 'Aşırı büyük harf';
  }
  if (a.spam) {
    const k = `${m.guild.id}:${m.author.id}`, simdi = Date.now();
    const l = (sonMesajlar.get(k) || []).filter((x) => simdi - x.t < 7000);
    l.push({ t: simdi, icerik });
    sonMesajlar.set(k, l);
    if (l.length >= 6) return 'Spam (çok hızlı mesaj)';
    if (icerik.length > 5 && l.filter((x) => x.icerik === icerik).length >= 4) return 'Spam (tekrarlı mesaj)';
  }
  return null;
}

module.exports = {
  ad: 'otomod',
  ihlalBul, normalize,
  komutlar: [
    { data: new SlashCommandBuilder().setName('otomod').setDescription('Otomatik moderasyon ayarları').setDefaultMemberPermissions(P.ManageGuild)
        .addSubcommand((s) => s.setName('filtre').setDescription('Bir filtreyi açar/kapatır')
          .addStringOption((o) => o.setName('tür').setDescription('Filtre').setRequired(true).addChoices(...Object.entries(FILTRELER).map(([value, name]) => ({ name, value }))))
          .addBooleanOption((o) => o.setName('açık').setDescription('Açık mı?').setRequired(true)))
        .addSubcommand((s) => s.setName('kelime').setDescription('Yasaklı kelime ekler/çıkarır')
          .addStringOption((o) => o.setName('kelime').setDescription('Kelime').setRequired(true).setMaxLength(40)))
        .addSubcommand((s) => s.setName('muaf').setDescription('Bir rolü otomoddan muaf tutar/muafiyeti kaldırır')
          .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true)))
        .addSubcommand((s) => s.setName('durum').setDescription('Otomod durumunu gösterir'))
        .addSubcommand((s) => s.setName('baskın-bitir').setDescription('Baskın modunu elle kapatır')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'filtre') {
          const a = db.ayar(g, 'otomod', {});
          a[i.options.getString('tür')] = i.options.getBoolean('açık');
          db.ayarYaz(g, 'otomod', a);
          return tamam(i, `**${FILTRELER[i.options.getString('tür')]}** → ${i.options.getBoolean('açık') ? 'açık' : 'kapalı'}`, true);
        }
        if (alt === 'kelime') {
          const k = normalize(i.options.getString('kelime').trim());
          const l = db.ayar(g, 'otomod.kelimeler', []);
          const var_ = l.includes(k);
          db.ayarYaz(g, 'otomod.kelimeler', var_ ? l.filter((x) => x !== k) : [...l, k]);
          return tamam(i, var_ ? 'Kelime listeden çıkarıldı.' : `Kelime eklendi. (Toplam ${l.length + 1})`, true);
        }
        if (alt === 'muaf') {
          const r = i.options.getRole('rol'), l = db.ayar(g, 'otomod.muaf', []);
          const var_ = l.includes(r.id);
          db.ayarYaz(g, 'otomod.muaf', var_ ? l.filter((x) => x !== r.id) : [...l, r.id]);
          return tamam(i, `${r} ${var_ ? 'artık muaf değil' : 'otomoddan muaf'}.`, true);
        }
        if (alt === 'baskın-bitir') {
          if (!db.ayar(g, 'otomod.baskinAktif')) return hata(i, 'Baskın modu aktif değil.');
          db.ayarYaz(g, 'otomod.baskinAktif', null);
          return tamam(i, 'Baskın modu kapatıldı; yeni üyeler normal şekilde katılabilir.');
        }
        const a = ayarlar(g);
        return yanit(i, E('🛡️ Otomod', Object.entries(FILTRELER).map(([k, ad]) => `${a[k] ? '🟢' : '⚫'} ${ad}`).join('\n') +
          `\n\nYasaklı kelime: **${db.ayar(g, 'otomod.kelimeler', []).length}** • Muaf rol: ${db.ayar(g, 'otomod.muaf', []).map((r) => `<@&${r}>`).join(' ') || '—'}` +
          `\nBaskın modu: ${db.ayar(g, 'otomod.baskinAktif') ? '🚨 **AKTİF**' : 'pasif'}\n\n*İhlalde mesaj silinir; 10 dk içinde 3. ihlalde 5 dk, 5. ihlalde 1 saat susturma uygulanır.*`, R.bilgi), true);
      } },
  ],
  olaylar: {
    messageCreate: async (m) => {
      if (!m.guild || m.author.bot || !m.member || !m.content) return;
      if (m.member.permissions.has(P.ManageMessages)) return;
      const muaf = db.ayar(m.guild.id, 'otomod.muaf', []);
      if (muaf.some((r) => m.member.roles.cache.has(r))) return;
      const sebep = ihlalBul(m, ayarlar(m.guild.id));
      if (!sebep) return;
      await m.delete().catch(() => {});
      const k = `${m.guild.id}:${m.author.id}`, simdi = Date.now();
      const v = ihlaller.get(k);
      const n = v && simdi - v.t < 10 * 6e4 ? v.n + 1 : 1;
      ihlaller.set(k, { n, t: simdi });
      let ceza = '';
      if ((n === 3 || n >= 5) && m.member.moderatable) {
        const ms = n >= 5 ? 36e5 : 5 * 6e4;
        await m.member.timeout(ms, `Otomod: ${sebep}`).catch(() => {});
        ceza = ` • ${n >= 5 ? '1 saat' : '5 dakika'} susturuldu`;
      }
      const uyari = await m.channel.send({ embeds: [E(null, `🛡️ ${m.author}, mesajın kaldırıldı: **${sebep}**${ceza}`, R.hata)] }).catch(() => null);
      if (uyari) setTimeout(() => uyari.delete().catch(() => {}), 6000);
      await log(m.guild, E('🛡️ Otomod', `**Üye:** ${m.author}\n**Kanal:** ${m.channel}\n**İhlal:** ${sebep} (${n}.)${ceza}\n**Mesaj:** ${m.content.slice(0, 800)}`, R.hata));
    },
    // Baskın koruması: 20 saniyede 8+ giriş olursa baskın modu açılır, yeni hesaplar atılır
    guildMemberAdd: async (m) => {
      const g = m.guild;
      if (!ayarlar(g.id).baskin) return;
      const simdi = Date.now();
      const l = (girisler.get(g.id) || []).filter((t) => simdi - t < 20_000);
      l.push(simdi);
      girisler.set(g.id, l);
      let aktif = db.ayar(g.id, 'otomod.baskinAktif');
      if (aktif && simdi - aktif > 15 * 6e4) { db.ayarYaz(g.id, 'otomod.baskinAktif', null); aktif = null; }
      if (!aktif && l.length >= 8) {
        db.ayarYaz(g.id, 'otomod.baskinAktif', simdi);
        aktif = simdi;
        await log(g, E('🚨 BASKIN ALGILANDI', '20 saniye içinde 8+ üye katıldı. **15 dakika** boyunca 7 günden yeni hesaplar otomatik atılacak.\nElle kapatmak için: `/otomod baskın-bitir`', R.hata));
      }
      if (aktif && simdi - m.user.createdTimestamp < 7 * 864e5 && m.kickable) {
        await m.send(`**${g.name}** şu an baskın koruması altında. Lütfen 15 dakika sonra tekrar dene.`).catch(() => {});
        await m.kick('Baskın koruması: yeni hesap').catch(() => {});
      }
    },
  },
};
