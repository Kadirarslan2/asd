// Ekonomi: bakiye, günlük ödül (seri bonuslu), çalışma, transfer, market, kumar ve ödül avı
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { E, R, yanit, hata, tamam, sayi, para, rast, sec, karistir, gun, sureYaz, madalya } = require('../core/util');

const ISLER = ['CS2 sunucusunda adminlik yaptın', 'Turnuvada yayın moderatörlüğü yaptın', 'Yeni başlayanlara smoke öğrettin', 'LAN partisi için kablo çektin', 'Kasa açıp skin sattın', 'Takım için demo analizi yaptın', 'Kamp ateşi için odun topladın', 'Minecraft sunucusuna spawn inşa ettin'];
const bahisSec = (b) => b.addIntegerOption((o) => o.setName('bahis').setDescription('Bahis miktarı').setRequired(true).setMinValue(10).setMaxValue(50000));

function bahisAl(i, miktar) {
  if (db.uye(i.guild.id, i.user.id).para < miktar) { hata(i, `Yeterli paran yok. Bakiyen: ${para(db.uye(i.guild.id, i.user.id).para)}`); return false; }
  db.arttir(i.guild.id, i.user.id, 'para', -miktar);
  return true;
}
async function kazandi(i, miktar) {
  db.arttir(i.guild.id, i.user.id, 'para', miktar);
  await oyuncu.gorevIlerle(i.guild, i.user.id, 'oyun', 1, i.channel);
  if (db.uye(i.guild.id, i.user.id).para >= 10000) await oyuncu.basarimVer(i.guild, i.user.id, 'zengin', i.channel);
}

// --- Blackjack ---
const masalar = new Map();
const desteYap = () => karistir(['♠', '♥', '♦', '♣'].flatMap((s) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map((d) => ({ d, s }))));
function elDeger(el) {
  let t = 0, as = 0;
  for (const k of el) { if (k.d === 'A') { as++; t += 11; } else t += ['J', 'Q', 'K'].includes(k.d) ? 10 : Number(k.d); }
  while (t > 21 && as--) t -= 10;
  return t;
}
const elYaz = (el) => el.map((k) => `\`${k.d}${k.s}\``).join(' ');
function bjEmbed(m, bitti, sonuc) {
  const e = E('🃏 Blackjack', `**Senin elin** (${elDeger(m.oyuncu)}): ${elYaz(m.oyuncu)}\n**Kasa** (${bitti ? elDeger(m.kasa) : '?'}): ${bitti ? elYaz(m.kasa) : `${elYaz([m.kasa[0]])} \`??\``}\n\nBahis: ${para(m.bahis)}${sonuc ? `\n\n${sonuc}` : ''}`, bitti ? R.gri : R.ana);
  const butonlar = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bj:cek:${m.uid}`).setLabel('Kart çek').setStyle(ButtonStyle.Primary).setDisabled(bitti),
    new ButtonBuilder().setCustomId(`bj:dur:${m.uid}`).setLabel('Dur').setStyle(ButtonStyle.Secondary).setDisabled(bitti));
  return { embeds: [e], components: [butonlar] };
}
async function bjBitir(i, m) {
  masalar.delete(m.uid);
  const o = elDeger(m.oyuncu);
  if (o <= 21) while (elDeger(m.kasa) < 17) m.kasa.push(m.deste.pop());
  const k = elDeger(m.kasa);
  let sonuc;
  if (o > 21) sonuc = `💥 Battın! ${para(m.bahis)} kaybettin.`;
  else if (k > 21 || o > k) { await kazandi(i, m.bahis * 2); sonuc = `🎉 Kazandın! +${para(m.bahis)}`; }
  else if (o === k) { db.arttir(i.guild.id, m.uid, 'para', m.bahis); sonuc = '🤝 Berabere, bahsin iade edildi.'; }
  else sonuc = `😔 Kasa kazandı. ${para(m.bahis)} kaybettin.`;
  return bjEmbed(m, true, sonuc);
}

const yerlesik = [{ id: 'boost', ad: '⚡ 2x XP Takviyesi (1 saat)', fiyat: 750 }];
const urunler = (g) => [...yerlesik, ...db.ayar(g, 'market', [])];

module.exports = {
  ad: 'ekonomi',
  elDeger,
  komutlar: [
    { data: new SlashCommandBuilder().setName('bakiye').setDescription('Bakiyeni gösterir').addUserOption((o) => o.setName('üye').setDescription('Üye')),
      calistir: (i) => { const u = i.options.getUser('üye') || i.user; return yanit(i, E(null, `🪙 **${u.username}** bakiyesi: ${para(db.uye(i.guild.id, u.id).para)} • Sıra **#${db.sira(i.guild.id, u.id, 'para')}**`, R.altin)); } },
    { data: new SlashCommandBuilder().setName('günlük').setDescription('Günlük ödülünü al (üst üste aldıkça artar)'),
      calistir: async (i) => {
        const bugun = gun(), dun = gun(Date.now() - 864e5);
        const u = db.uye(i.guild.id, i.user.id);
        if (u.veri.gunluk?.gun === bugun) {
          const yarin = new Date(); yarin.setHours(24, 0, 0, 0);
          return hata(i, `Bugünkü ödülünü aldın. Yenilenmesine **${sureYaz(yarin - Date.now())}** var.`);
        }
        const seri = u.veri.gunluk?.gun === dun ? u.veri.gunluk.seri + 1 : 1;
        const miktar = 200 + Math.min(seri - 1, 14) * 25;
        db.veri(i.guild.id, i.user.id, (v) => { v.gunluk = { gun: bugun, seri }; });
        db.arttir(i.guild.id, i.user.id, 'para', miktar);
        await yanit(i, E(null, `📅 Günlük ödül: ${para(miktar)}\n🔥 Seri: **${seri} gün**${seri < 15 ? ` (yarın ${sayi(miktar + 25)} 🪙)` : ' (maksimum bonus!)'}`, R.altin));
        await oyuncu.gorevIlerle(i.guild, i.user.id, 'gunluk', 1, i.channel);
        if (seri >= 7) await oyuncu.basarimVer(i.guild, i.user.id, 'seri7', i.channel);
      } },
    { data: new SlashCommandBuilder().setName('çalış').setDescription('Çalışıp para kazan (30 dakikada bir)'),
      calistir: async (i) => {
        const u = db.uye(i.guild.id, i.user.id), kalan = (u.veri.calis || 0) + 30 * 6e4 - Date.now();
        if (kalan > 0) return hata(i, `Dinlenmen gerek. **${sureYaz(kalan)}** sonra tekrar çalışabilirsin.`);
        const miktar = rast(60, 180);
        db.veri(i.guild.id, i.user.id, (v) => { v.calis = Date.now(); });
        db.arttir(i.guild.id, i.user.id, 'para', miktar);
        await yanit(i, E(null, `⛏️ ${sec(ISLER)} ve ${para(miktar)} kazandın.`, R.ok));
        await oyuncu.gorevIlerle(i.guild, i.user.id, 'calis', 1, i.channel);
      } },
    { data: new SlashCommandBuilder().setName('gönder').setDescription('Başka bir üyeye para gönderir')
        .addUserOption((o) => o.setName('üye').setDescription('Alıcı').setRequired(true))
        .addIntegerOption((o) => o.setName('miktar').setDescription('Miktar').setRequired(true).setMinValue(1)),
      calistir: async (i) => {
        const hedef = i.options.getUser('üye'), miktar = i.options.getInteger('miktar');
        if (hedef.bot || hedef.id === i.user.id) return hata(i, 'Geçersiz alıcı.');
        if (!bahisAl(i, miktar)) return;
        db.arttir(i.guild.id, hedef.id, 'para', miktar);
        await tamam(i, `${i.user} → ${hedef}: ${para(miktar)}`);
        await oyuncu.sayac(i.guild, i.user.id, 'gonderilen', miktar, 5000, 'comert', i.channel);
      } },
    { data: new SlashCommandBuilder().setName('market').setDescription('Sunucu marketi')
        .addSubcommand((s) => s.setName('liste').setDescription('Ürünleri listeler'))
        .addSubcommand((s) => s.setName('al').setDescription('Ürün satın alır').addStringOption((o) => o.setName('ürün').setDescription('Ürün').setRequired(true).setAutocomplete(true)))
        .addSubcommand((s) => s.setName('ekle').setDescription('[Yönetici] Markete rol ürünü ekler')
          .addRoleOption((o) => o.setName('rol').setDescription('Satılacak rol').setRequired(true))
          .addIntegerOption((o) => o.setName('fiyat').setDescription('Fiyat').setRequired(true).setMinValue(1)))
        .addSubcommand((s) => s.setName('sil').setDescription('[Yönetici] Marketten ürün kaldırır').addStringOption((o) => o.setName('ürün').setDescription('Ürün').setRequired(true).setAutocomplete(true))),
      tamamla: (i) => {
        const yazi = i.options.getFocused().toLowerCase();
        return i.respond(urunler(i.guild.id).filter((u) => u.ad.toLowerCase().includes(yazi)).slice(0, 25).map((u) => ({ name: `${u.ad} — ${u.fiyat} coin`.slice(0, 100), value: u.id })));
      },
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild.id;
        if (alt === 'liste') return yanit(i, E('🛒 Market', urunler(g).map((u) => `**${u.ad}** — ${para(u.fiyat)}${u.rol ? ` → <@&${u.rol}>` : ''}`).join('\n') + '\n\nSatın almak için: `/market al`', R.altin));
        if (alt === 'ekle' || alt === 'sil') {
          if (!i.memberPermissions.has(P.ManageGuild)) return hata(i, 'Bunun için **Sunucuyu Yönet** yetkisi gerekir.');
          const l = db.ayar(g, 'market', []);
          if (alt === 'ekle') {
            const rol = i.options.getRole('rol');
            if (rol.managed || rol.position >= i.guild.members.me.roles.highest.position) return hata(i, 'Bu rolü veremem; rolümü onun üstüne taşı.');
            if (l.length >= 24) return hata(i, 'Market dolu (en fazla 24 ürün).');
            l.push({ id: `rol${rol.id}`, ad: `🎭 ${rol.name}`, fiyat: i.options.getInteger('fiyat'), rol: rol.id });
            db.ayarYaz(g, 'market', l);
            return tamam(i, `${rol} markete eklendi.`, true);
          }
          const id = i.options.getString('ürün');
          db.ayarYaz(g, 'market', l.filter((u) => u.id !== id));
          return tamam(i, 'Ürün kaldırıldı.', true);
        }
        const urun = urunler(g).find((u) => u.id === i.options.getString('ürün'));
        if (!urun) return hata(i, 'Ürün bulunamadı. Listeden seç.');
        if (urun.rol && i.member.roles.cache.has(urun.rol)) return hata(i, 'Bu role zaten sahipsin.');
        if (!bahisAl(i, urun.fiyat)) return;
        if (urun.rol) {
          const oldu = await i.member.roles.add(urun.rol).then(() => true).catch(() => false);
          if (!oldu) { db.arttir(g, i.user.id, 'para', urun.fiyat); return hata(i, 'Rolü veremedim, paran iade edildi.'); }
        } else if (urun.id === 'boost') {
          db.veri(g, i.user.id, (v) => { v.boost = Math.max(Date.now(), v.boost || 0) + 36e5; });
        }
        return tamam(i, `**${urun.ad}** satın alındı! (-${sayi(urun.fiyat)} 🪙)`);
      } },
    { data: new SlashCommandBuilder().setName('kumar').setDescription('Şans oyunları')
        .addSubcommand((s) => bahisSec(s.setName('slot').setDescription('Slot makinesi')))
        .addSubcommand((s) => bahisSec(s.setName('yazıtura').setDescription('Yazı tura'))
          .addStringOption((o) => o.setName('seçim').setDescription('Seçimin').setRequired(true).addChoices({ name: 'Yazı', value: 'yazi' }, { name: 'Tura', value: 'tura' })))
        .addSubcommand((s) => bahisSec(s.setName('blackjack').setDescription('Kasaya karşı 21'))),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), bahis = i.options.getInteger('bahis');
        if (alt === 'blackjack' && masalar.has(i.user.id)) return hata(i, 'Zaten açık bir blackjack elin var.');
        if (!bahisAl(i, bahis)) return;
        if (alt === 'slot') {
          const S = ['🍒', '🍋', '🍇', '🔔', '💎', '7️⃣'], A = [30, 25, 20, 13, 8, 4];
          const cek = () => { let r = Math.random() * 100; for (let k = 0; k < S.length; k++) { if ((r -= A[k]) < 0) return k; } return 0; };
          const c = [cek(), cek(), cek()];
          const CARPAN = [4, 6, 10, 18, 40, 100];
          let carpan = 0;
          if (c[0] === c[1] && c[1] === c[2]) carpan = CARPAN[c[0]];
          else if (c[0] === c[1] || c[1] === c[2] || c[0] === c[2]) carpan = 1.5;
          const kazanc = Math.floor(bahis * carpan);
          if (kazanc) await kazandi(i, kazanc);
          await yanit(i, E('🎰 Slot', `**[ ${c.map((x) => S[x]).join(' | ')} ]**\n\n${kazanc ? `🎉 **${carpan}x** → +${para(kazanc - bahis)}` : `😔 ${para(bahis)} kaybettin.`}`, kazanc ? R.ok : R.hata));
          if (carpan === 100) await oyuncu.basarimVer(i.guild, i.user.id, 'jackpot', i.channel);
          return;
        }
        if (alt === 'yazıtura') {
          const sonuc = Math.random() < 0.5 ? 'yazi' : 'tura', bildi = sonuc === i.options.getString('seçim');
          if (bildi) await kazandi(i, Math.floor(bahis * 1.95));
          return yanit(i, E('🪙 Yazı Tura', `Para havada döndü… **${sonuc === 'yazi' ? 'YAZI' : 'TURA'}**!\n${bildi ? `🎉 +${para(Math.floor(bahis * 0.95))}` : `😔 ${para(bahis)} kaybettin.`}`, bildi ? R.ok : R.hata));
        }
        const deste = desteYap();
        const m = { uid: i.user.id, bahis, deste, oyuncu: [deste.pop(), deste.pop()], kasa: [deste.pop(), deste.pop()] };
        masalar.set(i.user.id, m);
        setTimeout(() => { if (masalar.get(i.user.id) === m) { masalar.delete(i.user.id); } }, 5 * 6e4);
        if (elDeger(m.oyuncu) === 21) {
          masalar.delete(i.user.id);
          await kazandi(i, Math.floor(bahis * 2.5));
          return i.reply(bjEmbed(m, true, `🂡 **BLACKJACK!** +${para(Math.floor(bahis * 1.5))}`));
        }
        return i.reply(bjEmbed(m, false));
      } },
    { data: new SlashCommandBuilder().setName('ödül').setDescription('Ödül avı: bir oyuncunun başına ödül koy, onu düelloda yenen alır')
        .addSubcommand((s) => s.setName('koy').setDescription('Bir üyenin başına ödül koyar')
          .addUserOption((o) => o.setName('üye').setDescription('Hedef').setRequired(true))
          .addIntegerOption((o) => o.setName('miktar').setDescription('Ödül').setRequired(true).setMinValue(100)))
        .addSubcommand((s) => s.setName('liste').setDescription('Arananlar listesi')),
      calistir: async (i) => {
        const odul = db.ayar(i.guild.id, 'oduller', {});
        if (i.options.getSubcommand() === 'liste') {
          const l = Object.entries(odul).sort((a, b) => b[1] - a[1]).slice(0, 10);
          return yanit(i, E('🤠 ARANANLAR', l.map(([id, n], k) => `${madalya(k)} <@${id}> — ${para(n)}`).join('\n') || 'Kimsenin başına ödül konmamış.', R.hata).setFooter({ text: 'Ödülü almak için hedefi /düello ile yen' }));
        }
        const hedef = i.options.getUser('üye'), miktar = i.options.getInteger('miktar');
        if (hedef.bot || hedef.id === i.user.id) return hata(i, 'Geçersiz hedef.');
        if (!bahisAl(i, miktar)) return;
        odul[hedef.id] = (odul[hedef.id] || 0) + miktar;
        db.ayarYaz(i.guild.id, 'oduller', odul);
        return yanit(i, { content: `${hedef}`, embeds: [E('🤠 ARANIYOR', `${i.user}, ${hedef} kullanıcısının başına ${para(miktar)} ödül koydu!\nToplam ödül: ${para(odul[hedef.id])}\n\nOnu \`/düello\` ile yenen ödülü kapar.`, R.hata).setThumbnail(hedef.displayAvatarURL())] });
      } },
  ],
  bilesenler: {
    bj: async (i, [islem, uid]) => {
      if (i.user.id !== uid) return hata(i, 'Bu el sana ait değil.');
      const m = masalar.get(uid);
      if (!m) return i.update({ components: [] });
      if (islem === 'cek') {
        m.oyuncu.push(m.deste.pop());
        if (elDeger(m.oyuncu) < 21) return i.update(bjEmbed(m, false));
      }
      return i.update(await bjBitir(i, m));
    },
  },
};
