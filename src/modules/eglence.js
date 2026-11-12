// Eğlence: refleks düellosu, taş-kağıt-makas, aim antrenmanı, trivia, sayı sayma ve kelime zinciri kanalları
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { E, R, yanit, hata, para, rast, sec, karistir } = require('../core/util');

const SORULAR = [
  ['CS2\'de bombanın patlama süresi kaç saniyedir?', ['40', '35', '45', '30']],
  ['Hangi harita CS serisinin en eski bomba haritalarından biridir?', ['Dust II', 'Ancient', 'Anubis', 'Vertigo']],
  ['Valorant\'ta bir takımda kaç oyuncu bulunur?', ['5', '6', '4', '3']],
  ['Minecraft\'ta Nether portalı hangi bloktan yapılır?', ['Obsidyen', 'Elmas', 'Netherrack', 'Taş']],
  ['League of Legends\'ta haritanın adı nedir?', ['Sihirdar Vadisi', 'Uçurum', 'Kristal Koru', 'Ruh Çiçeği']],
  ['FACEIT\'te en yüksek seviye kaçtır?', ['10', '20', '8', '15']],
  ['CS2\'de AWP\'nin fiyatı kaç dolardır?', ['4750', '4500', '5000', '4250']],
  ['"The cake is a lie" sözü hangi oyundandır?', ['Portal', 'Half-Life', 'Bioshock', 'Fallout']],
  ['GTA V\'te kaç oynanabilir ana karakter vardır?', ['3', '2', '4', '1']],
  ['Hangi şirket Fortnite\'ı geliştirdi?', ['Epic Games', 'Valve', 'Riot Games', 'Ubisoft']],
  ['Dota 2\'de bir maçta toplam kaç kahraman seçilir?', ['10', '8', '12', '5']],
  ['The Witcher serisinin ana karakteri kimdir?', ['Geralt', 'Vesemir', 'Jaskier', 'Eskel']],
  ['CS\'de "eco" turu ne demektir?', ['Para biriktirmek için az harcama', 'Hızlı saldırı', 'Sadece bıçak', 'Savunma taktiği']],
  ['Rocket League\'de standart maçta top kaç araçla oynanır (toplam)?', ['6', '4', '8', '10']],
  ['Valve\'ın dağıtım platformunun adı nedir?', ['Steam', 'Origin', 'Uplay', 'Battle.net']],
  ['Among Us\'ta hain oyuncuya ne denir?', ['Impostor', 'Traitor', 'Spy', 'Hunter']],
  ['Minecraft\'ın yaratıcısı kimdir?', ['Notch', 'Jeb', 'Gabe Newell', 'Dinnerbone']],
  ['CS2\'de bir yarıda (MR12) kaç tur oynanır?', ['12', '15', '13', '16']],
  ['Hangi oyun "battle royale" türünü popülerleştiren ilk büyük yapımlardandır?', ['PUBG', 'Overwatch', 'Destiny', 'Paladins']],
  ['Valorant\'ta spike\'ı kim kurar?', ['Saldıran takım', 'Savunan takım', 'Her iki takım', 'Hakem']],
  ['Elden Ring\'i hangi stüdyo geliştirdi?', ['FromSoftware', 'CD Projekt', 'Bethesda', 'Capcom']],
  ['CS\'de "ace" ne anlama gelir?', ['Tek oyuncunun 5 rakibi öldürmesi', 'İlk kanı almak', 'Bombayı çözmek', 'Bıçakla öldürmek']],
  ['Hangisi bir MOBA oyunudur?', ['Dota 2', 'Apex Legends', 'Rust', 'Tarkov']],
  ['Pac-Man\'deki hayaletlerden biri hangisidir?', ['Blinky', 'Bowser', 'Ganon', 'Ridley']],
  ['Half-Life\'ın ana karakteri kimdir?', ['Gordon Freeman', 'Alyx Vance', 'Barney', 'G-Man']],
];

const duellolar = new Map(), aimler = new Map(), triviaAcik = new Map();
const satir = (...b) => new ActionRowBuilder().addComponents(...b);
const buton = (id, etiket, stil = ButtonStyle.Secondary, kapali = false) => new ButtonBuilder().setCustomId(id).setLabel(etiket).setStyle(stil).setDisabled(kapali);

async function duelloBitir(i, d, kazananId, ms) {
  duellolar.delete(d.id);
  const kaybeden = kazananId === d.a ? d.b : d.a, g = i.guild;
  let ek = '';
  if (d.bahis) { db.arttir(g.id, kazananId, 'para', d.bahis * 2); ek += `\n💰 Kazanç: ${para(d.bahis)}`; }
  const oduller = db.ayar(g.id, 'oduller', {});
  if (oduller[kaybeden]) {
    db.arttir(g.id, kazananId, 'para', oduller[kaybeden]);
    ek += `\n🤠 **Ödül avı!** <@${kaybeden}> başındaki ${para(oduller[kaybeden])} ödül tahsil edildi.`;
    delete oduller[kaybeden]; db.ayarYaz(g.id, 'oduller', oduller);
  }
  await i.update({ content: '', embeds: [E('🤠 Düello bitti', `🏆 <@${kazananId}> **${ms}ms** ile daha hızlı çekti ve <@${kaybeden}> yere serildi!${ek}`, R.altin)], components: [] });
  await oyuncu.gorevIlerle(g, kazananId, 'oyun', 1, i.channel);
  await oyuncu.sayac(g, kazananId, 'duello', 1, 10, 'duellocu', i.channel);
}

function aimIzgara(a) {
  return [0, 1, 2, 3].map((r) => satir(...[0, 1, 2, 3, 4].map((c) => {
    const n = r * 5 + c;
    return n === a.hedef ? buton(`aim:${a.uid}:${n}`, '🎯', ButtonStyle.Danger) : buton(`aim:${a.uid}:${n}`, '​', ButtonStyle.Secondary);
  })));
}

module.exports = {
  ad: 'eglence',
  SORULAR,
  komutlar: [
    { data: new SlashCommandBuilder().setName('düello').setDescription('Refleks düellosu: "ATEŞ!" yazınca butona ilk basan kazanır')
        .addUserOption((o) => o.setName('rakip').setDescription('Rakip').setRequired(true))
        .addIntegerOption((o) => o.setName('bahis').setDescription('Bahis (isteğe bağlı)').setMinValue(10).setMaxValue(50000)),
      calistir: async (i) => {
        const rakip = i.options.getUser('rakip'), bahis = i.options.getInteger('bahis') || 0;
        if (rakip.bot || rakip.id === i.user.id) return hata(i, 'Geçersiz rakip.');
        if (bahis && db.uye(i.guild.id, i.user.id).para < bahis) return hata(i, 'Bu bahis için yeterli paran yok.');
        const id = i.id;
        duellolar.set(id, { id, a: i.user.id, b: rakip.id, bahis, durum: 'davet' });
        setTimeout(() => duellolar.delete(id), 3 * 6e4);
        return i.reply({ content: `${rakip}`, embeds: [E('🤠 Düello daveti', `${i.user}, ${rakip} kullanıcısını düelloya çağırıyor!${bahis ? `\nBahis: ${para(bahis)}` : ''}`)],
          components: [satir(buton(`duello:kabul:${id}`, 'Kabul et', ButtonStyle.Success), buton(`duello:red:${id}`, 'Reddet', ButtonStyle.Danger))] });
      } },
    { data: new SlashCommandBuilder().setName('tkm').setDescription('Taş kağıt makas')
        .addStringOption((o) => o.setName('seçim').setDescription('Seçimin').setRequired(true).addChoices({ name: '🪨 Taş', value: '0' }, { name: '📄 Kağıt', value: '1' }, { name: '✂️ Makas', value: '2' })),
      calistir: async (i) => {
        const A = ['🪨 Taş', '📄 Kağıt', '✂️ Makas'], ben = Number(i.options.getString('seçim')), bot = rast(0, 2);
        const sonuc = (ben - bot + 3) % 3; // 0 berabere, 1 kazandın, 2 kaybettin
        if (sonuc === 1) { db.arttir(i.guild.id, i.user.id, 'para', 20); await oyuncu.gorevIlerle(i.guild, i.user.id, 'oyun', 1, i.channel); }
        return yanit(i, E(null, `Sen: **${A[ben]}** • Ben: **${A[bot]}**\n${['🤝 Berabere!', `🎉 Kazandın! +${para(20)}`, '😎 Ben kazandım!'][sonuc]}`, [R.gri, R.ok, R.hata][sonuc]));
      } },
    { data: new SlashCommandBuilder().setName('aim').setDescription('Aim antrenmanı: 8 hedefi olabildiğince hızlı vur'),
      calistir: async (i) => {
        const a = { uid: i.user.id, hedef: rast(0, 19), vurus: 0, iska: 0, sureler: [], son: 0 };
        aimler.set(i.user.id, a);
        await i.reply({ embeds: [E('🎯 Aim Antrenmanı', '8 hedef çıkacak. 🎯 butonuna olabildiğince hızlı bas, boş karelere basma!')], components: aimIzgara(a) });
        a.son = Date.now();
      } },
    { data: new SlashCommandBuilder().setName('trivia').setDescription('Oyun kültürü sorusu — ilk doğru cevaplayan ödülü alır'),
      calistir: async (i) => {
        if (triviaAcik.has(i.channelId)) return hata(i, 'Bu kanalda zaten açık bir soru var.');
        const [soru, siklar] = sec(SORULAR);
        const karisik = karistir(siklar.map((s, k) => ({ s, dogru: k === 0 })));
        const t = { dogru: karisik.findIndex((x) => x.dogru), deneyen: new Set(), siklar: karisik.map((x) => x.s) };
        triviaAcik.set(i.channelId, t);
        const butonlar = () => satir(...t.siklar.map((s, k) => buton(`trivia:${k}`, s.slice(0, 80), ButtonStyle.Primary)));
        await i.reply({ embeds: [E('🧠 Trivia', `**${soru}**\n\nİlk doğru cevap ${para(75)} kazanır. Herkesin tek hakkı var! (20 sn)`, R.bilgi)], components: [butonlar()] });
        setTimeout(async () => {
          if (triviaAcik.get(i.channelId) !== t) return;
          triviaAcik.delete(i.channelId);
          await i.editReply({ embeds: [E('🧠 Trivia', `**${soru}**\n\n⏰ Süre doldu! Doğru cevap: **${t.siklar[t.dogru]}**`, R.gri)], components: [] }).catch(() => {});
        }, 20_000);
      } },
  ],
  bilesenler: {
    duello: async (i, [islem, id]) => {
      const d = duellolar.get(id);
      if (!d) return i.update({ components: [] });
      if (islem === 'red' || islem === 'kabul') {
        if (i.user.id !== d.b) return hata(i, 'Bu davet sana değil.');
        if (islem === 'red') { duellolar.delete(id); return i.update({ content: '', embeds: [E(null, `🏳️ <@${d.b}> düelloyu reddetti.`, R.gri)], components: [] }); }
        if (d.bahis) {
          if (db.uye(i.guild.id, d.a).para < d.bahis || db.uye(i.guild.id, d.b).para < d.bahis) { duellolar.delete(id); return i.update({ content: '', embeds: [E(null, '❌ Taraflardan birinin parası bahse yetmiyor.', R.hata)], components: [] }); }
          db.arttir(i.guild.id, d.a, 'para', -d.bahis); db.arttir(i.guild.id, d.b, 'para', -d.bahis);
        }
        d.durum = 'bekle';
        await i.update({ content: `<@${d.a}> <@${d.b}>`, embeds: [E('🤠 Düello', 'Eller silahta… **"ATEŞ!"** yazısını bekleyin.\nErken basan kaybeder!')], components: [satir(buton(`duello:ates:${id}`, '🔫 …', ButtonStyle.Secondary))] });
        setTimeout(async () => {
          if (duellolar.get(id) !== d || d.durum !== 'bekle') return;
          d.durum = 'ates'; d.t = Date.now();
          await i.editReply({ embeds: [E('🤠 Düello', '# 🔥 ATEŞ!', R.hata)], components: [satir(buton(`duello:ates:${id}`, '🔫 ATEŞ!', ButtonStyle.Danger))] }).catch(() => {});
        }, rast(2500, 7000));
        return;
      }
      if (i.user.id !== d.a && i.user.id !== d.b) return hata(i, 'Bu düelloda değilsin.');
      if (d.durum === 'bekle') return duelloBitir(i, d, i.user.id === d.a ? d.b : d.a, 0).then(() => i.followUp({ content: `${i.user} erken ateş etti ve diskalifiye oldu! 🤦` }));
      if (d.durum === 'ates') return duelloBitir(i, d, i.user.id, Date.now() - d.t);
    },
    aim: async (i, [uid, n]) => {
      if (i.user.id !== uid) return hata(i, 'Bu antrenman sana ait değil. `/aim` ile kendininkini başlat.');
      const a = aimler.get(uid);
      if (!a) return i.update({ components: [] });
      if (Number(n) === a.hedef) { a.vurus++; a.sureler.push(Date.now() - a.son); } else a.iska++;
      if (a.vurus >= 8) {
        aimler.delete(uid);
        const ort = Math.round(a.sureler.reduce((x, y) => x + y, 0) / a.sureler.length);
        const isabet = Math.round((a.vurus / (a.vurus + a.iska)) * 100);
        const odul = Math.max(10, Math.round((1500 - Math.min(1400, ort)) / 10) - a.iska * 10);
        db.arttir(i.guild.id, uid, 'para', odul);
        const rekor = db.veri(i.guild.id, uid, (v) => { const eski = v.aimRekor; if (!eski || ort < eski) v.aimRekor = ort; return !eski || ort < eski; });
        await i.update({ embeds: [E('🎯 Antrenman bitti', `Ortalama tepki: **${ort}ms**${rekor ? ' 🆕 *kişisel rekor!*' : ''}\nİsabet: **%${isabet}** (${a.iska} ıska)\nÖdül: ${para(odul)}\n\n*Not: süreye Discord gecikmesi de dahildir.*`, R.ok)], components: [] });
        await oyuncu.gorevIlerle(i.guild, uid, 'aim', 1, i.channel);
        if (ort < 300 && a.iska === 0) await oyuncu.basarimVer(i.guild, uid, 'keskin', i.channel);
        return;
      }
      let yeni; do { yeni = rast(0, 19); } while (yeni === a.hedef);
      a.hedef = yeni;
      await i.update({ embeds: [E('🎯 Aim Antrenmanı', `Vuruş: **${a.vurus}/8** • Iska: **${a.iska}**`)], components: aimIzgara(a) });
      a.son = Date.now();
    },
    trivia: async (i, [k]) => {
      const t = triviaAcik.get(i.channelId);
      if (!t) return i.update({ components: [] });
      if (t.deneyen.has(i.user.id)) return hata(i, 'Hakkını kullandın.');
      t.deneyen.add(i.user.id);
      if (Number(k) !== t.dogru) return hata(i, 'Yanlış cevap!');
      triviaAcik.delete(i.channelId);
      db.arttir(i.guild.id, i.user.id, 'para', 75);
      await i.update({ embeds: [E('🧠 Trivia', `${i.message.embeds[0].description.split('\n')[0]}\n\n✅ ${i.user} doğru bildi: **${t.siklar[t.dogru]}** → +${para(75)}`, R.ok)], components: [] });
      await oyuncu.gorevIlerle(i.guild, i.user.id, 'trivia', 1, i.channel);
      await oyuncu.sayac(i.guild, i.user.id, 'trivia', 1, 20, 'bilgin', i.channel);
    },
  },
  olaylar: {
    messageCreate: async (m) => {
      if (!m.guild || m.author.bot) return;
      const g = m.guild.id;
      // Sayı sayma: sırayla 1, 2, 3… aynı kişi üst üste yazamaz
      if (m.channelId === db.ayar(g, 'kanal.sayma')) {
        const d = db.ayar(g, 'sayma', { n: 0, son: null, rekor: 0 });
        const yazilan = Number(m.content.trim());
        if (!Number.isInteger(yazilan)) return;
        if (yazilan === d.n + 1 && m.author.id !== d.son) {
          d.n++; d.son = m.author.id; d.rekor = Math.max(d.rekor, d.n);
          db.ayarYaz(g, 'sayma', d);
          await m.react(d.n % 100 === 0 ? '💯' : '✅').catch(() => {});
          if (d.n % 50 === 0) db.arttir(g, m.author.id, 'para', 100);
        } else {
          await m.react('❌').catch(() => {});
          await m.channel.send({ embeds: [E(null, `💥 ${m.author} zinciri **${d.n}** sayısında bozdu! ${m.author.id === d.son ? '(Üst üste yazamazsın)' : `(Beklenen: ${d.n + 1})`}\nRekor: **${d.rekor}** • Yeniden **1**'den başlıyoruz.`, R.hata)] }).catch(() => {});
          db.ayarYaz(g, 'sayma', { n: 0, son: null, rekor: d.rekor });
        }
        return;
      }
      // Kelime zinciri: her kelime öncekinin son harfiyle başlar
      if (m.channelId === db.ayar(g, 'kanal.kelime')) {
        const kelime = m.content.trim().toLocaleLowerCase('tr');
        if (!/^[a-zçğıöşü]{2,}$/.test(kelime)) return;
        const d = db.ayar(g, 'kelime', { son: null, yazan: null, kullanilan: [], n: 0 });
        const harf = d.son ? d.son.at(-1) === 'ğ' ? 'g' : d.son.at(-1) : null;
        let sebep = null;
        if (m.author.id === d.yazan) sebep = 'Üst üste yazamazsın';
        else if (harf && kelime[0] !== harf) sebep = `Kelime **${harf.toLocaleUpperCase('tr')}** ile başlamalıydı`;
        else if (d.kullanilan.includes(kelime)) sebep = 'Bu kelime zaten kullanıldı';
        if (sebep) {
          await m.react('❌').catch(() => {});
          const uyari = await m.reply({ embeds: [E(null, `❌ ${sebep}. Son kelime: **${d.son}**`, R.hata)] }).catch(() => null);
          if (uyari) setTimeout(() => uyari.delete().catch(() => {}), 5000);
          return;
        }
        d.son = kelime; d.yazan = m.author.id; d.n++; d.kullanilan = [...d.kullanilan, kelime].slice(-300);
        db.ayarYaz(g, 'kelime', d);
        db.arttir(g, m.author.id, 'para', 3);
        await m.react('✅').catch(() => {});
      }
    },
  },
};
