// Tahmin borsası: yetkili bir soru açar, üyeler coin yatırır; kazananlar havuzu paylarına göre bölüşür
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { E, R, hata, tamam, para, sayi, cubuk, sureCoz, zd } = require('../core/util');

const havuz = (t, k) => Object.values(t.bahis).filter((b) => b.s === k).reduce((a, b) => a + b.m, 0);
const toplam = (t) => Object.values(t.bahis).reduce((a, b) => a + b.m, 0);
// Parimutuel dağıtım: kazanan seçeneğe yatıranlar toplam havuzu yatırdıkları oranda paylaşır
function dagit(t, kazanan) {
  const hepsi = toplam(t), kazananHavuz = havuz(t, kazanan);
  if (!kazananHavuz) return Object.fromEntries(Object.entries(t.bahis).map(([id, b]) => [id, b.m])); // kimse bilemedi: iade
  return Object.fromEntries(Object.entries(t.bahis).filter(([, b]) => b.s === kazanan).map(([id, b]) => [id, Math.floor((b.m / kazananHavuz) * hepsi)]));
}
function gorunum(t) {
  const hepsi = toplam(t);
  const satirlar = t.secenekler.map((s, k) => {
    const h = havuz(t, k), oran = hepsi ? h / hepsi : 0;
    return `**${k + 1}. ${s}**${t.sonuc === k ? ' ✅' : ''}\n\`${cubuk(oran, 14)}\` %${Math.round(oran * 100)} • ${sayi(h)} 🪙${h ? ` • oran **${(hepsi / h).toFixed(2)}x**` : ''}`;
  });
  const durum = t.sonuc !== undefined ? '🏁 Sonuçlandı' : t.kapali ? '🔒 Bahisler kapandı, sonuç bekleniyor' : `🟢 Bahisler açık${t.bitis ? ` • kapanış ${zd(t.bitis)}` : ''}`;
  const e = E(`🔮 ${t.soru}`, `${satirlar.join('\n\n')}\n\n**Havuz:** ${para(hepsi)} • **Katılım:** ${Object.keys(t.bahis).length}\n${durum}`, t.sonuc !== undefined ? R.gri : R.mor);
  if (t.sonuc !== undefined) return { embeds: [e], components: [] };
  const sec = new ActionRowBuilder().addComponents(t.secenekler.map((s, k) => new ButtonBuilder().setCustomId(`tahmin:bahis:${t.id}:${k}`).setLabel(`${k + 1}. ${s}`.slice(0, 80)).setStyle(ButtonStyle.Primary).setDisabled(Boolean(t.kapali))));
  const yonet = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tahmin:kapat:${t.id}`).setLabel('Bahisleri kapat').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(t.kapali)),
    new ButtonBuilder().setCustomId(`tahmin:sonuc:${t.id}`).setLabel('Sonuçlandır').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tahmin:iade:${t.id}`).setLabel('İptal et (iade)').setStyle(ButtonStyle.Danger));
  return { embeds: [e], components: [sec, yonet] };
}
const mesajGuncelle = async (i, t) => { const k = i.guild.channels.cache.get(t.kanal); await k?.messages.edit(t.mesaj, gorunum(t)).catch(() => {}); };

module.exports = {
  ad: 'tahmin',
  dagit,
  komutlar: [
    { data: new SlashCommandBuilder().setName('tahmin').setDescription('[Yetkili] Coin ile oynanan tahmin borsası açar (örn. "Derbiyi kim kazanır?")').setDefaultMemberPermissions(P.ManageMessages)
        .addStringOption((o) => o.setName('soru').setDescription('Soru').setRequired(true).setMaxLength(200))
        .addStringOption((o) => o.setName('seçenek1').setDescription('1. seçenek').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('seçenek2').setDescription('2. seçenek').setRequired(true).setMaxLength(60))
        .addStringOption((o) => o.setName('seçenek3').setDescription('3. seçenek').setMaxLength(60))
        .addStringOption((o) => o.setName('seçenek4').setDescription('4. seçenek').setMaxLength(60))
        .addStringOption((o) => o.setName('süre').setDescription('Bahisler ne kadar açık kalsın (örn. 30dk, 2s)')),
      calistir: async (i) => {
        const ms = sureCoz(i.options.getString('süre'));
        const t = { soru: i.options.getString('soru'), secenekler: [1, 2, 3, 4].map((n) => i.options.getString(`seçenek${n}`)).filter(Boolean), bahis: {}, bitis: ms ? Date.now() + ms : null, kanal: i.channelId };
        t.id = db.belge.ekle(i.guild.id, 'tahmin', t);
        await i.reply(gorunum(t));
        t.mesaj = (await i.fetchReply()).id;
        db.belge.yaz(t.id, t);
      } },
  ],
  bilesenler: {
    tahmin: async (i, [islem, id, arg]) => {
      const t = db.belge.al(id);
      if (!t || t.tur !== 'tahmin') return hata(i, 'Bu tahmin artık geçerli değil.');
      const g = i.guild.id;
      if (islem === 'bahis') {
        if (t.kapali) return hata(i, 'Bahisler kapandı.');
        const mevcut = t.bahis[i.user.id];
        if (mevcut && mevcut.s !== Number(arg)) return hata(i, `Zaten **${t.secenekler[mevcut.s]}** seçeneğine oynadın; yalnızca ona ekleme yapabilirsin.`);
        return i.showModal(new ModalBuilder().setCustomId(`tahmin:yatir:${id}:${arg}`).setTitle(`Tahmin: ${t.secenekler[arg]}`.slice(0, 45)).addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('miktar').setLabel(`Kaç coin? (Bakiye: ${sayi(db.uye(g, i.user.id).para)})`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7))));
      }
      if (islem === 'yatir') {
        if (t.kapali) return hata(i, 'Bahisler kapandı.');
        const miktar = Number(i.fields.getTextInputValue('miktar').trim());
        if (!Number.isInteger(miktar) || miktar < 10) return hata(i, 'En az 10 coin yatırabilirsin.');
        if (db.uye(g, i.user.id).para < miktar) return hata(i, 'Yeterli paran yok.');
        const mevcut = t.bahis[i.user.id];
        if (mevcut && mevcut.s !== Number(arg)) return hata(i, 'Farklı bir seçeneğe oynamışsın.');
        db.arttir(g, i.user.id, 'para', -miktar);
        t.bahis[i.user.id] = { s: Number(arg), m: (mevcut?.m || 0) + miktar };
        db.belge.yaz(t.id, t);
        await i.deferUpdate();
        return i.editReply(gorunum(t));
      }
      if (!i.memberPermissions.has(P.ManageMessages)) return hata(i, 'Bu buton yetkililer için.');
      if (islem === 'kapat') { t.kapali = true; db.belge.yaz(t.id, t); return i.update(gorunum(t)); }
      if (islem === 'iade') {
        for (const [uid, b] of Object.entries(t.bahis)) db.arttir(g, uid, 'para', b.m);
        db.belge.sil(t.id);
        return i.update({ embeds: [E(`🔮 ${t.soru}`, '🚫 Tahmin iptal edildi, tüm bahisler iade edildi.', R.gri)], components: [] });
      }
      if (islem === 'sonuc') {
        return i.reply({ flags: 64, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`tahmin:bitir:${id}`).setPlaceholder('Kazanan seçeneği seç')
          .addOptions(t.secenekler.map((s, k) => ({ label: `${k + 1}. ${s}`.slice(0, 100), value: String(k) }))))] });
      }
      if (islem === 'bitir') {
        const kazanan = Number(i.values[0]);
        const odeme = dagit(t, kazanan), bilenVar = havuz(t, kazanan) > 0;
        for (const [uid, m] of Object.entries(odeme)) db.arttir(g, uid, 'para', m);
        t.sonuc = kazanan; t.kapali = true;
        db.belge.sil(t.id);
        await mesajGuncelle(i, t);
        await i.update({ content: 'Sonuçlandırıldı.', components: [] });
        const enCok = Object.entries(odeme).sort((a, b) => b[1] - a[1]).slice(0, 5);
        await i.channel.send({ embeds: [E(`🔮 Sonuç: ${t.secenekler[kazanan]}`, bilenVar ? `**${t.soru}**\n\nEn çok kazananlar:\n${enCok.map(([uid, m]) => `<@${uid}> → ${para(m)}`).join('\n')}` : `**${t.soru}**\n\nKimse doğru bilemedi; bahisler iade edildi.`, R.altin)] }).catch(() => {});
        if (bilenVar) for (const uid of Object.keys(odeme)) await oyuncu.sayac(i.guild, uid, 'tahmin', 1, 5, 'kahin', i.channel);
      }
    },
  },
  // Süresi dolan tahminlerde bahisleri kapat
  async hizliTik(ctx) {
    for (const t of db.belge.hepsi('tahmin')) {
      if (t.kapali || !t.bitis || t.bitis > Date.now()) continue;
      t.kapali = true; db.belge.yaz(t.id, t);
      const k = ctx.client.channels.cache.get(t.kanal);
      await k?.messages.edit(t.mesaj, gorunum(t)).catch(() => {});
    }
  },
};
