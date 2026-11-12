// Oyuncu servisi: XP, para, günlük görevler ve başarımlar — tüm modüller buradan geçer
const db = require('./db');
const { E, R, gun, para, sayi } = require('./util');
const cizim = require('./cizim');

const seviyeXp = (l) => 5 * l * l + 50 * l + 100; // l -> l+1 için gereken XP
function seviyeHesapla(xp) {
  let l = 0;
  while (xp >= seviyeXp(l)) { xp -= seviyeXp(l); l++; }
  return { seviye: l, kalan: xp, gereken: seviyeXp(l) };
}

const BASARIMLAR = {
  ilkmesaj: ['💬', 'İlk Adım', 'İlk mesajını gönder'],
  seviye5: ['🌱', 'Filiz', '5. seviyeye ulaş'],
  seviye10: ['⚔️', 'Savaşçı', '10. seviyeye ulaş'],
  seviye25: ['👑', 'Efsane', '25. seviyeye ulaş'],
  ses10: ['🎙️', 'Sohbet Kuşu', 'Seste 10 saat geçir'],
  ses100: ['📻', 'Radyo', 'Seste 100 saat geçir'],
  gecekusu: ['🦉', 'Gece Kuşu', 'Gece 03:00-05:00 arası seste ol'],
  zengin: ['💰', 'Zengin', '10.000 coin biriktir'],
  jackpot: ['🎰', 'Jackpot', 'Slotta büyük ikramiyeyi vur'],
  atesbekcisi: ['🔥', 'Ateş Bekçisi', 'Kamp ateşine 50 odun at'],
  duellocu: ['🤠', 'Silahşör', '10 düello kazan'],
  faceit: ['🎯', 'Bağlantı Kuruldu', 'FACEIT hesabını bağla'],
  seri7: ['📅', 'Sadık', '7 gün üst üste günlük ödül al'],
  sampiyon: ['🏆', 'Şampiyon', 'Bir turnuva kazan'],
  scrim10: ['🎮', 'Scrim Kurdu', '10 sunucu içi maç kazan'],
  gorevci: ['📜', 'Görev Adamı', '25 günlük görev tamamla'],
  keskin: ['🎯', 'Keskin Nişancı', 'Aim antrenmanında 300ms altı ortalama yap'],
  comert: ['🎁', 'Cömert', 'Başkasına toplam 5.000 coin gönder'],
  kahin: ['🔮', 'Kâhin', '5 tahmini doğru bil'],
  bilgin: ['🧠', 'Bilgin', '20 trivia sorusunu doğru cevapla'],
};

const GOREVLER = {
  mesaj: ['💬', '30 mesaj gönder', 30, 150],
  ses: ['🎙️', 'Seste 30 dakika geçir', 30, 200],
  oyun: ['🎲', 'Bir mini oyun/kumar kazan', 1, 150],
  gunluk: ['📅', 'Günlük ödülünü al', 1, 100],
  odun: ['🪵', 'Kamp ateşine 3 odun at', 3, 150],
  rep: ['⭐', 'Birine itibar puanı ver', 1, 120],
  trivia: ['🧠', '2 trivia sorusunu doğru bil', 2, 180],
  calis: ['⛏️', '2 kez çalış', 2, 130],
  aim: ['🎯', 'Bir aim antrenmanı tamamla', 1, 120],
};

// Her kullanıcıya her gün belirlenimci (tarih+id tohumlu) 3 görev
function gununGorevleri(userId, tarih = gun()) {
  let tohum = 0;
  for (const c of tarih + userId) tohum = (tohum * 31 + c.charCodeAt(0)) >>> 0;
  const anahtarlar = Object.keys(GOREVLER);
  const secilen = [];
  while (secilen.length < 3) {
    tohum = (tohum * 1664525 + 1013904223) >>> 0;
    const a = anahtarlar[tohum % anahtarlar.length];
    if (!secilen.includes(a)) secilen.push(a);
  }
  return secilen;
}

async function duyur(guild, kanal, embed, icerik, dosyalar) {
  try {
    const id = db.ayar(guild.id, 'kanal.seviye');
    const hedef = (id && guild.channels.cache.get(id)) || kanal;
    if (hedef?.isTextBased?.()) await hedef.send({ content: icerik, embeds: embed ? [embed] : [], files: dosyalar || [], allowedMentions: { users: [] } });
  } catch { /* kanal silinmiş ya da yetki yok: sessizce geç */ }
}

const oyuncu = {
  seviyeXp, seviyeHesapla, BASARIMLAR, GOREVLER, gununGorevleri,

  paraEkle(guildId, userId, n) {
    db.arttir(guildId, userId, 'para', n);
    return db.uye(guildId, userId).para;
  },

  async xpEkle(guild, userId, miktar, kanal = null) {
    const u = db.uye(guild.id, userId);
    if (u.veri.boost > Date.now()) miktar *= 2;
    const yeniXp = u.xp + Math.round(miktar);
    const { seviye } = seviyeHesapla(yeniXp);
    db.uyeYaz(guild.id, userId, { xp: yeniXp, seviye });
    if (seviye <= u.seviye) return;
    const odul = seviye * 50;
    db.arttir(guild.id, userId, 'para', odul);
    // Seviye rolleri
    const roller = db.ayar(guild.id, 'seviyeRolleri', {});
    const verilen = [];
    const member = await guild.members.fetch(userId).catch(() => null);
    for (const [lvl, rolId] of Object.entries(roller)) {
      if (Number(lvl) <= seviye && member && !member.roles.cache.has(rolId)) {
        await member.roles.add(rolId).then(() => verilen.push(`<@&${rolId}>`)).catch(() => {});
      }
    }
    if (member) {
      const kart = await cizim.bannerKart({ ust: 'SEVİYE ATLADI', baslik: `Seviye ${seviye}`, alt: `${member.displayName}  •  Ödül: ${sayi(odul)} coin`, avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }), ad: member.displayName, vurgu: cizim.RENK.altin, dosya: 'seviye' });
      await duyur(guild, kanal, null, `🎉 <@${userId}> **${seviye}. seviyeye** ulaştı!${verilen.length ? ` Yeni rol: ${verilen.join(', ')}` : ''}`, [kart]);
    } else await duyur(guild, kanal, E(null, `🎉 <@${userId}> **${seviye}. seviyeye** ulaştı! Ödül: ${para(odul)}`, R.altin));
    if (seviye >= 5) await oyuncu.basarimVer(guild, userId, 'seviye5', kanal);
    if (seviye >= 10) await oyuncu.basarimVer(guild, userId, 'seviye10', kanal);
    if (seviye >= 25) await oyuncu.basarimVer(guild, userId, 'seviye25', kanal);
  },

  async basarimVer(guild, userId, id, kanal = null) {
    if (!BASARIMLAR[id]) return false;
    const yeni = db.veri(guild.id, userId, (v) => {
      v.basarim ??= [];
      if (v.basarim.includes(id)) return false;
      v.basarim.push(id);
      return true;
    });
    if (!yeni) return false;
    db.arttir(guild.id, userId, 'para', 250);
    const [emoji, ad, aciklama] = BASARIMLAR[id];
    await duyur(guild, kanal, E(null, `${emoji} <@${userId}> **${ad}** başarımını açtı! *(${aciklama})* +${para(250)}`, R.mor));
    return true;
  },

  // Sayaç tabanlı başarımlar için: sayaç eşiğe ulaşınca başarımı verir
  async sayac(guild, userId, ad, n, esik, basarimId, kanal = null) {
    const deger = db.veri(guild.id, userId, (v) => { v.sayac ??= {}; v.sayac[ad] = (v.sayac[ad] || 0) + n; return v.sayac[ad]; });
    if (deger >= esik) await oyuncu.basarimVer(guild, userId, basarimId, kanal);
    return deger;
  },

  gorevDurum(guildId, userId) {
    const bugun = gun();
    const u = db.uye(guildId, userId);
    const g = u.veri.gorev?.gun === bugun ? u.veri.gorev : { gun: bugun, ilerleme: {}, biten: [], bonus: false };
    return { ...g, liste: gununGorevleri(userId, bugun) };
  },

  async gorevIlerle(guild, userId, anahtar, n = 1, kanal = null) {
    const bugun = gun();
    const liste = gununGorevleri(userId, bugun);
    if (!liste.includes(anahtar)) return;
    const [emoji, ad, hedef, odul] = GOREVLER[anahtar];
    const sonuc = db.veri(guild.id, userId, (v) => {
      if (v.gorev?.gun !== bugun) v.gorev = { gun: bugun, ilerleme: {}, biten: [], bonus: false };
      const g = v.gorev;
      if (g.biten.includes(anahtar)) return null;
      g.ilerleme[anahtar] = (g.ilerleme[anahtar] || 0) + n;
      if (g.ilerleme[anahtar] < hedef) return null;
      g.biten.push(anahtar);
      const hepsi = g.biten.length === 3 && !g.bonus;
      if (hepsi) g.bonus = true;
      return { hepsi };
    });
    if (!sonuc) return;
    db.arttir(guild.id, userId, 'para', odul + (sonuc.hepsi ? 300 : 0));
    await oyuncu.xpEkle(guild, userId, 40, kanal);
    await duyur(guild, kanal, E(null, `${emoji} <@${userId}> günlük görevi tamamladı: **${ad}** → ${para(odul)}${sonuc.hepsi ? `\n🌟 Günün tüm görevleri bitti! Bonus: ${para(300)}` : ''}`, R.ok));
    await oyuncu.sayac(guild, userId, 'gorev', 1, 25, 'gorevci', kanal);
  },
};
module.exports = oyuncu;
