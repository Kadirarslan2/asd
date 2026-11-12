// Klan sistemi: kur, davet et, kasa, sıralama. Klan gücü = üyelerin toplam XP'si
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const { E, R, yanit, hata, tamam, para, sayi, madalya } = require('../core/util');

const KURULUS = 2500, MAX = 20;
const klanim = (g, u) => { const id = db.uye(g, u).veri.klan; const k = id && db.belge.al(id); return k && k.tur === 'klan' ? k : null; };
const guc = (g, k) => k.uyeler.reduce((a, id) => a + db.uye(g, id).xp, 0);

module.exports = {
  ad: 'klan',
  komutlar: [
    { data: new SlashCommandBuilder().setName('klan').setDescription('Klan sistemi')
        .addSubcommand((s) => s.setName('kur').setDescription(`Yeni klan kurar (${KURULUS} coin)`)
          .addStringOption((o) => o.setName('ad').setDescription('Klan adı').setRequired(true).setMinLength(3).setMaxLength(24))
          .addStringOption((o) => o.setName('etiket').setDescription('2-5 harflik etiket').setRequired(true).setMinLength(2).setMaxLength(5)))
        .addSubcommand((s) => s.setName('davet').setDescription('Klanına üye davet eder').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('ayrıl').setDescription('Klanından ayrılır (lider ayrılırsa klan dağılır)'))
        .addSubcommand((s) => s.setName('at').setDescription('[Lider] Üyeyi klandan atar').addUserOption((o) => o.setName('üye').setDescription('Üye').setRequired(true)))
        .addSubcommand((s) => s.setName('bilgi').setDescription('Klan bilgilerini gösterir').addUserOption((o) => o.setName('üye').setDescription('Bu üyenin klanı')))
        .addSubcommand((s) => s.setName('bağış').setDescription('Klan kasasına coin yatırır').addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)))
        .addSubcommand((s) => s.setName('sıralama').setDescription('En güçlü klanlar')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id, k = klanim(g, i.user.id);
        if (alt === 'sıralama') {
          const l = db.belge.liste(g, 'klan').map((x) => ({ ...x, guc: guc(g, x) })).sort((a, b) => b.guc - a.guc).slice(0, 10);
          return yanit(i, E('🛡️ Klan Sıralaması', l.map((x, n) => `${madalya(n)} **[${x.etiket}] ${x.ad}** — ${sayi(x.guc)} güç • ${x.uyeler.length} üye • kasa ${sayi(x.kasa)} 🪙`).join('\n') || 'Henüz klan kurulmamış. `/klan kur`', R.altin));
        }
        if (alt === 'bilgi') {
          const hedef = i.options.getUser('üye');
          const kl = hedef ? klanim(g, hedef.id) : k;
          if (!kl) return hata(i, hedef ? 'Bu üyenin klanı yok.' : 'Bir klanda değilsin.');
          return yanit(i, E(`🛡️ [${kl.etiket}] ${kl.ad}`, `**Lider:** <@${kl.lider}>\n**Güç:** ${sayi(guc(g, kl))} XP\n**Kasa:** ${para(kl.kasa)}\n\n**Üyeler (${kl.uyeler.length}/${MAX})**\n${kl.uyeler.map((id) => `<@${id}>`).join(' ')}`));
        }
        if (alt === 'kur') {
          if (k) return hata(i, 'Zaten bir klandasın.');
          const ad = i.options.getString('ad').trim(), etiket = i.options.getString('etiket').trim().toLocaleUpperCase('tr');
          if (!/^[\p{L}\p{N}]+$/u.test(etiket)) return hata(i, 'Etiket yalnızca harf ve rakam içerebilir.');
          if (db.belge.liste(g, 'klan').some((x) => x.ad.toLowerCase() === ad.toLowerCase() || x.etiket === etiket)) return hata(i, 'Bu ad ya da etiket kullanılıyor.');
          if (db.uye(g, i.user.id).para < KURULUS) return hata(i, `Klan kurmak ${para(KURULUS)} tutar; paran yetmiyor.`);
          db.arttir(g, i.user.id, 'para', -KURULUS);
          const id = db.belge.ekle(g, 'klan', { ad, etiket, lider: i.user.id, uyeler: [i.user.id], kasa: 0 });
          db.veri(g, i.user.id, (v) => { v.klan = id; });
          return tamam(i, `🛡️ **[${etiket}] ${ad}** klanı kuruldu! \`/klan davet\` ile üye topla.`);
        }
        if (!k) return hata(i, 'Bir klanda değilsin.');
        if (alt === 'davet') {
          const hedef = i.options.getUser('üye');
          if (k.lider !== i.user.id) return hata(i, 'Yalnızca lider davet edebilir.');
          if (hedef.bot || klanim(g, hedef.id)) return hata(i, 'Bu üye davet edilemez (bot ya da zaten bir klanda).');
          if (k.uyeler.length >= MAX) return hata(i, 'Klan dolu.');
          return i.reply({ content: `${hedef}`, embeds: [E(null, `🛡️ ${i.user} seni **[${k.etiket}] ${k.ad}** klanına davet ediyor!`)],
            components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`klan:kabul:${k.id}:${hedef.id}`).setLabel('Katıl').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`klan:red:${k.id}:${hedef.id}`).setLabel('Reddet').setStyle(ButtonStyle.Secondary))] });
        }
        if (alt === 'ayrıl') {
          if (k.lider === i.user.id) {
            for (const id of k.uyeler) db.veri(g, id, (v) => { delete v.klan; });
            if (k.kasa) db.arttir(g, i.user.id, 'para', k.kasa);
            db.belge.sil(k.id);
            return tamam(i, `**[${k.etiket}] ${k.ad}** dağıtıldı.${k.kasa ? ` Kasadaki ${para(k.kasa)} lidere iade edildi.` : ''}`);
          }
          k.uyeler = k.uyeler.filter((x) => x !== i.user.id);
          db.belge.yaz(k.id, k); db.veri(g, i.user.id, (v) => { delete v.klan; });
          return tamam(i, `**${k.ad}** klanından ayrıldın.`);
        }
        if (alt === 'at') {
          const hedef = i.options.getUser('üye');
          if (k.lider !== i.user.id) return hata(i, 'Yalnızca lider üye atabilir.');
          if (hedef.id === i.user.id || !k.uyeler.includes(hedef.id)) return hata(i, 'Bu üye klanında değil.');
          k.uyeler = k.uyeler.filter((x) => x !== hedef.id);
          db.belge.yaz(k.id, k); db.veri(g, hedef.id, (v) => { delete v.klan; });
          return tamam(i, `${hedef} klandan atıldı.`);
        }
        // bağış
        const miktar = i.options.getInteger('miktar');
        if (db.uye(g, i.user.id).para < miktar) return hata(i, 'Yeterli paran yok.');
        db.arttir(g, i.user.id, 'para', -miktar);
        k.kasa += miktar; db.belge.yaz(k.id, k);
        return tamam(i, `${i.user} klan kasasına ${para(miktar)} yatırdı. Kasa: ${para(k.kasa)}`);
      } },
  ],
  bilesenler: {
    klan: (i, [islem, id, hedefId]) => {
      if (i.user.id !== hedefId) return hata(i, 'Bu davet sana değil.');
      const k = db.belge.al(id), g = i.guild.id;
      if (islem === 'red' || !k || k.tur !== 'klan') return i.update({ content: '', embeds: [E(null, '🏳️ Davet reddedildi ya da artık geçersiz.', R.gri)], components: [] });
      if (klanim(g, i.user.id)) return hata(i, 'Zaten bir klandasın.');
      if (k.uyeler.length >= MAX) return hata(i, 'Klan dolmuş.');
      k.uyeler.push(i.user.id);
      db.belge.yaz(k.id, k); db.veri(g, i.user.id, (v) => { v.klan = k.id; });
      return i.update({ content: '', embeds: [E(null, `🛡️ ${i.user} **[${k.etiket}] ${k.ad}** klanına katıldı!`, R.ok)], components: [] });
    },
  },
  olaylar: {
    // Sunucudan çıkan üyeyi klanından düş
    guildMemberRemove: (m) => {
      const k = klanim(m.guild.id, m.id);
      if (!k || k.lider === m.id) return;
      k.uyeler = k.uyeler.filter((x) => x !== m.id);
      db.belge.yaz(k.id, k); db.veri(m.guild.id, m.id, (v) => { delete v.klan; });
    },
  },
};
