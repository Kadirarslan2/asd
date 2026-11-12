// Karşılama: hoş geldin / güle güle mesajları, otomatik rol ve davet takibi
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const { E, R, yanit, zd, madalya, sayi } = require('../core/util');
const cizim = require('../core/cizim');

const davetOnbellek = new Map(); // guild -> Map(kod -> kullanım)
async function davetleriYukle(guild) {
  if (!guild.members.me?.permissions.has(P.ManageGuild)) return null;
  const d = await guild.invites.fetch().catch(() => null);
  if (!d) return null;
  const harita = new Map(d.map((x) => [x.code, { n: x.uses || 0, kim: x.inviterId }]));
  davetOnbellek.set(guild.id, harita);
  return harita;
}

module.exports = {
  ad: 'karsilama',
  komutlar: [
    { data: new SlashCommandBuilder().setName('davetler').setDescription('Davet istatistikleri')
        .addUserOption((o) => o.setName('üye').setDescription('Bu üyenin davetleri (boşsa sıralama)')),
      calistir: (i) => {
        const u = i.options.getUser('üye');
        const tum = db.ayar(i.guild.id, 'davetSayac', {});
        if (u) return yanit(i, E(null, `📨 ${u} toplam **${tum[u.id] || 0}** kişiyi davet etti.`, R.bilgi));
        const s = Object.entries(tum).sort((a, b) => b[1] - a[1]).slice(0, 10);
        return yanit(i, E('📨 Davet Sıralaması', s.map(([id, n], k) => `${madalya(k)} <@${id}> — **${n}** davet`).join('\n') || 'Henüz kayıtlı davet yok.', R.bilgi));
      } },
  ],
  bilesenler: {
    // "Selam ver" butonu: yeni üyeyi karşılayan herkes küçük bir ödül alır (üye başına bir kez)
    selamla: async (i, [hedefId]) => {
      if (i.user.id === hedefId) return i.reply({ content: 'Kendine selam veremezsin 🙂', flags: 64 });
      const veren = db.ayar(i.guild.id, `selam.${hedefId}`, []);
      if (veren.includes(i.user.id)) return i.reply({ content: 'Zaten selam verdin.', flags: 64 });
      db.ayarYaz(i.guild.id, `selam.${hedefId}`, [...veren, i.user.id].slice(-50));
      db.arttir(i.guild.id, i.user.id, 'para', 15);
      return i.reply({ content: `👋 ${i.user}, <@${hedefId}> kullanıcısına hoş geldin dedi! (+15 🪙)`, allowedMentions: { users: [hedefId] } });
    },
  },
  hazir: async (ctx) => { for (const g of ctx.client.guilds.cache.values()) await davetleriYukle(g); },
  olaylar: {
    inviteCreate: (inv) => { davetOnbellek.get(inv.guild?.id)?.set(inv.code, { n: inv.uses || 0, kim: inv.inviterId }); },
    guildMemberAdd: async (m) => {
      const g = m.guild;
      // Kimin davet ettiğini bul: kullanım sayısı artan davet
      let davetEden = null;
      const eski = davetOnbellek.get(g.id);
      const yeni = await davetleriYukle(g);
      if (eski && yeni) {
        for (const [kod, v] of yeni) if (v.n > (eski.get(kod)?.n ?? 0)) { davetEden = v.kim; break; }
      }
      if (davetEden && davetEden !== m.id) {
        const s = db.ayar(g.id, 'davetSayac', {});
        s[davetEden] = (s[davetEden] || 0) + 1;
        db.ayarYaz(g.id, 'davetSayac', s);
        db.arttir(g.id, davetEden, 'para', 100);
      }
      const otoRol = db.ayar(g.id, 'rol.oto');
      if (otoRol && !m.user.bot) await m.roles.add(otoRol).catch(() => {});
      const kanal = g.channels.cache.get(db.ayar(g.id, 'kanal.hosgeldin'));
      if (!kanal) return;
      const sablon = db.ayar(g.id, 'hosgeldin.mesaj', 'Hoş geldin {üye}! Seninle birlikte **{sayı}** kişi olduk. Ateşin başında yerin hazır 🔥');
      const metin = sablon.replaceAll('{üye}', `${m}`).replaceAll('{sunucu}', g.name).replaceAll('{sayı}', String(g.memberCount));
      const kart = await cizim.bannerKart({ ust: 'HOŞ GELDİN', baslik: m.displayName, alt: `${g.name}  •  ${sayi(g.memberCount)}. üye`, avatarUrl: m.user.displayAvatarURL({ extension: 'png', size: 256 }), ad: m.displayName, dosya: 'hosgeldin' });
      await kanal.send({ content: `${metin}${davetEden ? `\n📨 Davet eden: <@${davetEden}> (+100 🪙)` : ''}`, files: [kart],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`selamla:${m.id}`).setLabel('Selam ver').setEmoji('👋').setStyle(ButtonStyle.Secondary))] }).catch(() => {});
    },
    guildMemberRemove: async (m) => {
      const kanal = m.guild.channels.cache.get(db.ayar(m.guild.id, 'kanal.hosgeldin'));
      if (kanal) await kanal.send({ embeds: [E(null, `👋 **${m.user?.username || 'Bir üye'}** aramızdan ayrıldı. ${m.joinedTimestamp ? `(katılış: ${zd(m.joinedTimestamp)})` : ''}`, R.gri)] }).catch(() => {});
    },
  },
};
