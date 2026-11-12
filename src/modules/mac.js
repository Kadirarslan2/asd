// Sunucu içi maç (scrim) sistemi: lobi → takım kurma (rastgele / ELO dengeli / kaptan seçimi)
// → harita vetosu → takım ses odaları → sonuç ve sunucu ELO'su
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../core/db');
const oyuncu = require('../core/oyuncu');
const { geciciOda } = require('./sesoda');
const { E, R, hata, para, karistir } = require('../core/util');

const HAVUZ = {
  cs2: ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Dust II', 'Train'],
  valorant: ['Ascent', 'Bind', 'Haven', 'Split', 'Lotus', 'Sunset', 'Icebox'],
  diger: [],
};
const MODLAR = { dengeli: '⚖️ ELO dengeli', rastgele: '🎲 Rastgele', kaptan: '👑 Kaptan seçimi' };
const guc = (g, id) => { const u = db.uye(g, id); return u.faceit_elo > 0 ? u.faceit_elo : u.elo; };
const toplam = (g, t) => t.reduce((a, id) => a + guc(g, id), 0);
const ort = (g, t) => Math.round(toplam(g, t) / t.length);
const etiket = (l) => l.map((id) => `<@${id}>`).join('\n') || '—';

// Tüm bölünmeleri deneyip güç farkı en az olan takımları bulur (10 kişi için 126 olasılık)
function dengele(oyuncular, gucFn) {
  const n = oyuncular.length, yari = n / 2;
  let enIyi = null;
  const dene = (bas, secilen) => {
    if (secilen.length === yari) {
      const a = secilen, b = oyuncular.filter((x) => !a.includes(x));
      const fark = Math.abs(a.reduce((s, x) => s + gucFn(x), 0) - b.reduce((s, x) => s + gucFn(x), 0));
      if (!enIyi || fark < enIyi.fark) enIyi = { a: [...a], b, fark };
      return;
    }
    for (let k = bas; k < n; k++) dene(k + 1, [...secilen, oyuncular[k]]);
  };
  dene(1, [oyuncular[0]]); // ilk oyuncu hep A'da: simetrik olasılıkları ele
  return enIyi;
}
// Takım ortalamalarına göre Elo değişimi (K=32)
function eloFark(ortKazanan, ortKaybeden) {
  const beklenen = 1 / (1 + 10 ** ((ortKaybeden - ortKazanan) / 400));
  return Math.max(1, Math.round(32 * (1 - beklenen)));
}

const btn = (id, ad, stil = ButtonStyle.Secondary, kapali = false) => new ButtonBuilder().setCustomId(id).setLabel(ad).setStyle(stil).setDisabled(kapali);
const satirlar = (butonlar) => { const r = []; for (let k = 0; k < butonlar.length; k += 5) r.push(new ActionRowBuilder().addComponents(butonlar.slice(k, k + 5))); return r; };

function gorunum(m, adlar = {}) {
  const g = m.guild, hedef = m.boyut * 2;
  const ad = (id) => (adlar[id] || `Oyuncu ${id.slice(-4)}`).slice(0, 70);
  if (m.asama === 'lobi') {
    return { embeds: [E(`⚔️ ${m.boyut}v${m.boyut} Maç Lobisi`, `**Oyun:** ${m.oyun.toUpperCase()} • **Takımlar:** ${MODLAR[m.mod]}\n**Kurucu:** <@${m.kurucu}>\n\n**Oyuncular (${m.oyuncular.length}/${hedef})**\n${etiket(m.oyuncular)}`)
      .setFooter({ text: 'Lobi dolunca maç otomatik başlar' })],
      components: satirlar([btn(`mac:katil:${m.id}`, 'Katıl', ButtonStyle.Success), btn(`mac:ayril:${m.id}`, 'Ayrıl'), btn(`mac:iptal:${m.id}`, 'İptal', ButtonStyle.Danger)]) };
  }
  const takimlar = [{ name: `🅰️ Takım A${m.a.length ? ` (ort. ${ort(g, m.a)})` : ''}`, value: `👑 ${etiket(m.a)}`, inline: true }, { name: `🅱️ Takım B${m.b.length ? ` (ort. ${ort(g, m.b)})` : ''}`, value: `👑 ${etiket(m.b)}`, inline: true }];
  if (m.asama === 'secim') {
    const sira = m.sira === 'a' ? m.a[0] : m.b[0];
    return { content: `<@${sira}>`, embeds: [E('👑 Kaptan seçimi', `Sıra: <@${sira}> — bir oyuncu seç.`).addFields(...takimlar)],
      components: satirlar(m.havuzOyuncu.map((id) => btn(`mac:sec:${m.id}:${id}`, `${ad(id)} (${guc(g, id)})`, ButtonStyle.Primary))) };
  }
  if (m.asama === 'veto') {
    const sira = m.sira === 'a' ? m.a[0] : m.b[0];
    return { content: `<@${sira}>`, embeds: [E('🗺️ Harita vetosu', `Sıra: <@${sira}> (${m.sira === 'a' ? '🅰️' : '🅱️'} kaptanı) — bir haritayı **yasakla**.\nSon kalan harita oynanır.`).addFields(...takimlar)],
      components: satirlar(m.haritalar.map((h) => btn(`mac:veto:${m.id}:${h}`, h, ButtonStyle.Danger, m.yasak.includes(h)))) };
  }
  if (m.asama === 'oyun') {
    return { content: [...m.a, ...m.b].map((id) => `<@${id}>`).join(' '),
      embeds: [E('🎮 Maç başladı!', `${m.harita ? `**Harita:** 🗺️ ${m.harita}\n` : ''}${m.ses ? `**Odalar:** <#${m.ses[0]}> • <#${m.ses[1]}>\n` : ''}\nMaç bitince <@${m.kurucu}> (ya da bir yetkili) kazananı işaretlesin.`, R.ok).addFields(...takimlar)],
      components: satirlar([btn(`mac:sonuc:${m.id}:a`, '🅰️ kazandı', ButtonStyle.Success), btn(`mac:sonuc:${m.id}:b`, '🅱️ kazandı', ButtonStyle.Success), btn(`mac:iptal:${m.id}`, 'İptal', ButtonStyle.Danger)]) };
  }
  return { content: '', embeds: [E(m.asama === 'bitti' ? '🏁 Maç bitti' : '🚫 Maç iptal edildi', m.ozet || null, m.asama === 'bitti' ? R.altin : R.gri)], components: [] };
}

function takimKur(m) {
  const g = m.guild;
  if (m.mod === 'kaptan' && m.boyut > 1) {
    const sirali = [...m.oyuncular].sort((x, y) => guc(g, y) - guc(g, x));
    m.a = [sirali[0]]; m.b = [sirali[1]]; m.havuzOyuncu = sirali.slice(2); m.sira = 'b'; m.secimNo = 0; m.asama = 'secim';
    return;
  }
  if (m.mod === 'dengeli') { const d = dengele(karistir(m.oyuncular), (id) => guc(g, id)); m.a = d.a; m.b = d.b; }
  else { const k = karistir(m.oyuncular); m.a = k.slice(0, m.boyut); m.b = k.slice(m.boyut); }
  // Kaptan = takımın en güçlüsü
  for (const t of [m.a, m.b]) t.sort((x, y) => guc(g, y) - guc(g, x));
  vetoyaGec(m);
}
function vetoyaGec(m) {
  m.haritalar = HAVUZ[m.oyun] || [];
  if (m.haritalar.length < 2) { m.asama = 'oyun'; return; }
  m.yasak = []; m.sira = 'a'; m.asama = 'veto';
}
async function odalariAc(i, m) {
  try {
    const parent = i.channel.parentId;
    const a = await geciciOda(i.guild, `🅰️ Takım A • #${m.id}`, { limit: m.boyut, parent });
    const b = await geciciOda(i.guild, `🅱️ Takım B • #${m.id}`, { limit: m.boyut, parent });
    m.ses = [a.id, b.id];
    for (const [takim, kanal] of [[m.a, a], [m.b, b]]) {
      for (const id of takim) { const uye = i.guild.members.cache.get(id); if (uye?.voice.channelId) await uye.voice.setChannel(kanal).catch(() => {}); }
    }
  } catch { m.ses = null; }
}
async function adlar(guild, idler) {
  const uyeler = await guild.members.fetch({ user: idler }).catch(() => null);
  return Object.fromEntries(idler.map((id) => [id, uyeler?.get(id)?.displayName]));
}

module.exports = {
  ad: 'mac',
  dengele, eloFark, HAVUZ,
  komutlar: [
    { data: new SlashCommandBuilder().setName('maç').setDescription('Sunucu içi maç (scrim) sistemi')
        .addSubcommand((s) => s.setName('oluştur').setDescription('Maç lobisi açar: takım dengeleme, harita vetosu, ses odaları, ELO')
          .addIntegerOption((o) => o.setName('boyut').setDescription('Takım başına oyuncu (varsayılan 5)').setMinValue(1).setMaxValue(6))
          .addStringOption((o) => o.setName('oyun').setDescription('Oyun (harita havuzu için)').addChoices({ name: 'CS2', value: 'cs2' }, { name: 'Valorant', value: 'valorant' }, { name: 'Diğer (veto yok)', value: 'diger' }))
          .addStringOption((o) => o.setName('takımlar').setDescription('Takımlar nasıl kurulsun').addChoices(...Object.entries(MODLAR).map(([value, name]) => ({ name, value })))))
        .addSubcommand((s) => s.setName('geçmiş').setDescription('Son oynanan maçları listeler')),
      calistir: async (i) => {
        if (i.options.getSubcommand() === 'geçmiş') {
          const l = db.belge.liste(i.guild.id, 'macGecmis').slice(-8).reverse();
          return i.reply({ embeds: [E('📜 Son Maçlar', l.map((x) => `**#${x.no}** ${x.harita ? `🗺️ ${x.harita} • ` : ''}🏆 ${x.kazanan.map((id) => `<@${id}>`).join(' ')} **vs** ${x.kaybeden.map((id) => `<@${id}>`).join(' ')} (±${x.fark})`).join('\n') || 'Henüz maç oynanmadı.')] });
        }
        const m = { asama: 'lobi', boyut: i.options.getInteger('boyut') || 5, oyun: i.options.getString('oyun') || 'cs2', mod: i.options.getString('takımlar') || 'dengeli', kurucu: i.user.id, oyuncular: [i.user.id], a: [], b: [] };
        m.id = db.belge.ekle(i.guild.id, 'mac', m);
        m.guild = i.guild.id;
        await i.reply(gorunum(m));
      } },
  ],
  bilesenler: {
    mac: async (i, [islem, id, arg]) => {
      const m = db.belge.al(id);
      if (!m || m.tur !== 'mac') return i.update({ components: [] });
      const yetkili = i.user.id === m.kurucu || i.memberPermissions.has(P.ManageGuild);
      const kaydet = async () => { db.belge.yaz(m.id, m); return i.editReply(gorunum(m, m.asama === 'secim' ? await adlar(i.guild, m.havuzOyuncu) : {})); };

      if (islem === 'iptal') {
        if (!yetkili) return hata(i, 'Maçı yalnızca kurucu ya da yetkililer iptal edebilir.');
        await i.deferUpdate();
        for (const k of m.ses || []) await i.guild.channels.cache.get(k)?.delete().catch(() => {});
        m.asama = 'iptal'; m.ozet = `<@${i.user.id}> maçı iptal etti.`;
        await i.editReply(gorunum(m));
        return db.belge.sil(m.id);
      }
      if (islem === 'katil' || islem === 'ayril') {
        if (m.asama !== 'lobi') return i.deferUpdate();
        const var_ = m.oyuncular.includes(i.user.id);
        if (islem === 'katil' && var_) return hata(i, 'Zaten lobidesin.');
        if (islem === 'ayril' && !var_) return hata(i, 'Lobide değilsin.');
        if (islem === 'ayril' && i.user.id === m.kurucu) return hata(i, 'Kurucu ayrılamaz; maçı iptal edebilirsin.');
        await i.deferUpdate();
        m.oyuncular = islem === 'katil' ? [...m.oyuncular, i.user.id] : m.oyuncular.filter((x) => x !== i.user.id);
        if (m.oyuncular.length >= m.boyut * 2) { takimKur(m); if (m.asama === 'oyun') await odalariAc(i, m); }
        return kaydet();
      }
      if (islem === 'sec') {
        const kaptan = m.sira === 'a' ? m.a[0] : m.b[0];
        if (m.asama !== 'secim' || i.user.id !== kaptan) return hata(i, 'Sıra sende değil.');
        if (!m.havuzOyuncu.includes(arg)) return i.deferUpdate();
        await i.deferUpdate();
        m[m.sira].push(arg);
        m.havuzOyuncu = m.havuzOyuncu.filter((x) => x !== arg);
        m.secimNo++;
        // Seçim sırası: B A A B B A A B … (ikinci kaptan ilk seçer, sonra ikişer)
        m.sira = ['b', 'a', 'a', 'b'][m.secimNo % 4];
        if (m.havuzOyuncu.length === 1) { m[m.sira].push(m.havuzOyuncu.pop()); }
        if (!m.havuzOyuncu.length) { vetoyaGec(m); if (m.asama === 'oyun') await odalariAc(i, m); }
        return kaydet();
      }
      if (islem === 'veto') {
        const kaptan = m.sira === 'a' ? m.a[0] : m.b[0];
        if (m.asama !== 'veto' || i.user.id !== kaptan) return hata(i, 'Sıra sende değil (yalnızca kaptanlar yasaklar).');
        if (m.yasak.includes(arg) || !m.haritalar.includes(arg)) return i.deferUpdate();
        await i.deferUpdate();
        m.yasak.push(arg);
        m.sira = m.sira === 'a' ? 'b' : 'a';
        const kalan = m.haritalar.filter((h) => !m.yasak.includes(h));
        if (kalan.length === 1) { m.harita = kalan[0]; m.asama = 'oyun'; await odalariAc(i, m); }
        return kaydet();
      }
      if (islem === 'sonuc') {
        if (m.asama !== 'oyun') return i.deferUpdate();
        if (!yetkili) return hata(i, 'Sonucu yalnızca kurucu ya da yetkililer girebilir.');
        await i.deferUpdate();
        const g = i.guild.id, kazanan = arg === 'a' ? m.a : m.b, kaybeden = arg === 'a' ? m.b : m.a;
        const eloOrt = (t) => t.reduce((s, x) => s + db.uye(g, x).elo, 0) / t.length;
        const fark = eloFark(eloOrt(kazanan), eloOrt(kaybeden));
        for (const x of kazanan) { db.arttir(g, x, 'elo', fark); db.arttir(g, x, 'galibiyet', 1); db.arttir(g, x, 'para', 150); }
        for (const x of kaybeden) { db.arttir(g, x, 'elo', -fark); db.arttir(g, x, 'maglubiyet', 1); db.arttir(g, x, 'para', 40); }
        for (const k of m.ses || []) await i.guild.channels.cache.get(k)?.delete().catch(() => {});
        db.belge.ekle(g, 'macGecmis', { no: m.id, harita: m.harita || null, kazanan, kaybeden, fark });
        m.asama = 'bitti';
        m.ozet = `🏆 **Takım ${arg.toUpperCase()} kazandı!**${m.harita ? ` • 🗺️ ${m.harita}` : ''}\n\n**Kazananlar** (+${fark} ELO, +${para(150)})\n${etiket(kazanan)}\n\n**Kaybedenler** (-${fark} ELO, +${para(40)})\n${etiket(kaybeden)}\n\nSıralama: \`/sıralama tür:Sunucu ELO\``;
        await i.editReply(gorunum(m));
        db.belge.sil(m.id);
        for (const x of kazanan) {
          await oyuncu.xpEkle(i.guild, x, 120, i.channel);
          await oyuncu.sayac(i.guild, x, 'scrim', 1, 10, 'scrim10', i.channel);
        }
        for (const x of kaybeden) await oyuncu.xpEkle(i.guild, x, 50, i.channel);
      }
    },
  },
  // 6 saatten eski, sonuçlanmamış maçları temizle
  async tik(ctx) {
    for (const m of db.belge.hepsi('mac')) {
      if (Date.now() - m.zaman < 6 * 36e5) continue;
      const g = ctx.client.guilds.cache.get(m.guild);
      for (const k of m.ses || []) await g?.channels.cache.get(k)?.delete().catch(() => {});
      db.belge.sil(m.id);
    }
  },
};
