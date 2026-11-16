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

const KURALLAR = ['Herkese saygılı ol; küfür, hakaret ve ayrımcılık yasak.', 'Hile, makro, x-ray ve hata (bug) istismarı yasaktır.', 'Başkalarının yapılarına zarar verme (grief) ve hırsızlık yapma.', 'Reklam ve başka sunucu davetleri paylaşma.', 'Spam, flood ve gereksiz etiket atma.', 'Hesap güvenliğin senin sorumluluğunda; şifreni kimseyle paylaşma.', 'Yetkililerin kararlarına uy; itirazın varsa destek talebi aç.'];
async function kurallarPanelGonder(kanal) {
  const liste = db.ayar(kanal.guild.id, 'kurallar', KURALLAR);
  return kanal.send({ files: [await cizim.bannerKart({ ust: 'OKUMADAN GEÇME', baslik: 'Sunucu Kuralları', alt: 'Discord ve Minecraft sunucumuzda geçerlidir', logo: true, dosya: 'kurallar' })],
    embeds: [E(null, liste.map((k, n) => `**${n + 1}.** ${k}`).join('\n\n'), R.ana).setImage('attachment://kurallar.png').setFooter({ text: 'Kuralları kabul edince Üye rolünü alırsın' })],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('kural:kabul').setLabel('Kuralları okudum, kabul ediyorum').setEmoji('✅').setStyle(ButtonStyle.Success))] });
}

module.exports = {
  ad: 'karsilama',
  kurallarPanelGonder,
  komutlar: [
    { data: new SlashCommandBuilder().setName('kurallar-panel').setDescription('[Yönetici] Bu kanala butonlu kurallar panelini gönderir').setDefaultMemberPermissions(P.ManageGuild)
        .addStringOption((o) => o.setName('kurallar').setDescription('Kendi kuralların: her kuralı | ile ayır (boşsa hazır kurallar)').setMaxLength(1800)),
      calistir: async (i) => {
        const ozel = i.options.getString('kurallar')?.split('|').map((k) => k.trim()).filter(Boolean);
        if (ozel?.length) db.ayarYaz(i.guild.id, 'kurallar', ozel.slice(0, 20));
        await i.deferReply({ flags: 64 });
        await kurallarPanelGonder(i.channel);
        return i.editReply('Kurallar paneli gönderildi.');
      } },
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
    kural: async (i) => {
      const rol = db.ayar(i.guild.id, 'rol.uye');
      if (!rol || !i.guild.roles.cache.has(rol)) return i.reply({ content: '✅ Kuralları kabul ettin, iyi eğlenceler!', flags: 64 });
      if (i.member.roles.cache.has(rol)) return i.reply({ content: 'Kuralları zaten kabul etmişsin ✅', flags: 64 });
      const oldu = await i.member.roles.add(rol).then(() => true, () => false);
      return i.reply({ content: oldu ? `✅ Kuralları kabul ettin ve <@&${rol}> rolünü aldın. \`/ip\` ile sunucu adresini öğrenebilirsin!` : '⚠️ Rolü veremedim; yetkililere haber ver (bot rolü daha üstte olmalı).', flags: 64 });
    },
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
      const sablon = db.ayar(g.id, 'hosgeldin.mesaj', 'Hoş geldin {üye}! Seninle birlikte **{sayı}** kişi olduk. Kuralları okuyup `/ip` ile sunucuya katılabilirsin ⛏️');
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
