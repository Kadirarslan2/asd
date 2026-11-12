// FACEIT entegrasyonu: profil, son maçlar, karşılaştırma, hesap bağlama, sunucu ELO sıralaması,
// otomatik seviye rolleri ve maç takibi (yeni maç bitince kanala düşer; tilt/seri alarmı verir)
const { SlashCommandBuilder, PermissionFlagsBits: P, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const cizim = require('../core/cizim');
const db = require('../core/db');
const config = require('../core/config');
const oyuncu = require('../core/oyuncu');
const { E, R, yanit, hata, tamam, sayi, madalya, cubuk } = require('../core/util');

const API = 'https://open.faceit.com/data/v4';
const OYUN = 'cs2';
const ESIK = [0, 100, 501, 751, 901, 1051, 1201, 1351, 1531, 1751, 2001]; // seviye -> minimum ELO
const LVL_EMOJI = ['', '⚪', '🟢', '🟢', '🟡', '🟡', '🟡', '🟡', '🟠', '🟠', '🔴'];
const onbellek = new Map();

async function api(yol, ttl = 60_000) {
  if (!config.faceitKey) throw Object.assign(new Error('anahtar'), { kod: 'anahtar' });
  const o = onbellek.get(yol);
  if (o && Date.now() - o.t < ttl) return o.v;
  const r = await fetch(API + yol, { headers: { Authorization: `Bearer ${config.faceitKey}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error(`FACEIT ${r.status}`), { kod: r.status });
  const v = await r.json();
  onbellek.set(yol, { t: Date.now(), v });
  if (onbellek.size > 500) onbellek.delete(onbellek.keys().next().value);
  return v;
}
// Takma ad büyük/küçük harfe duyarlı olduğundan bulunamazsa aramaya düşer
async function oyuncuBul(nick) {
  let p = await api(`/players?nickname=${encodeURIComponent(nick)}`);
  if (!p) {
    const a = await api(`/search/players?nickname=${encodeURIComponent(nick)}&game=${OYUN}&offset=0&limit=5`);
    const es = a?.items?.find((x) => x.nickname.toLowerCase() === nick.toLowerCase()) || a?.items?.[0];
    if (es) p = await api(`/players/${es.player_id}`);
  }
  return p;
}
const lvlYaz = (l) => `${LVL_EMOJI[l] || ''} Seviye ${l}`;
const profilUrl = (p) => (p.faceit_url || `https://www.faceit.com/tr/players/${p.nickname}`).replace('{lang}', 'tr');
const sonuclar = (dizi) => (dizi || []).map((x) => (String(x) === '1' ? '🟩' : '🟥')).join('');
function sonrakiSeviye(elo, lvl) {
  if (lvl >= 10) return `Zirve! (${sayi(elo - ESIK[10])} ELO fazlası)`;
  const alt = ESIK[lvl], ust = ESIK[lvl + 1];
  return `\`${cubuk((elo - alt) / (ust - alt), 10)}\` Seviye ${lvl + 1}'e **${ust - elo}** ELO`;
}

const haritaAd = (m) => { const a = String(m || '?').replace(/^de_/, ''); return a.charAt(0).toUpperCase() + a.slice(1); };
const satir = (...b) => new ActionRowBuilder().addComponents(...b);

// Profil kartı + butonlar
async function profilMesaj(p) {
  const o = p.games?.[OYUN];
  if (!o) return { embeds: [E(p.nickname, 'Bu oyuncunun CS2 kaydı yok.', R.gri).setURL(profilUrl(p))] };
  const st = await api(`/players/${p.player_id}/stats/${OYUN}`);
  const l = st?.lifetime || {}, lvl = o.skill_level, elo = o.faceit_elo;
  const haritalar = (st?.segments || []).filter((s) => s.type === 'Map' && s.mode === '5v5').sort((a, b) => Number(b.stats.Matches) - Number(a.stats.Matches)).slice(0, 3)
    .map((h) => ({ ad: haritaAd(h.label), mac: h.stats.Matches, kazanma: h.stats['Win Rate %'], kd: h.stats['Average K/D Ratio'] }));
  const kd = Number(l['Average K/D Ratio']), wr = Number(l['Win Rate %']);
  const kart = await cizim.faceitKart({ nick: p.nickname, avatar: p.avatar || null, ulke: (p.country || '').toUpperCase(), bolge: o.region, lvl, elo,
    oran: lvl >= 10 ? 1 : (elo - ESIK[lvl]) / (ESIK[lvl + 1] - ESIK[lvl]), ilerleme: lvl >= 10 ? 'En yüksek seviye' : `Seviye ${lvl + 1}'e ${ESIK[lvl + 1] - elo} ELO`,
    kutular: [['MAÇ', sayi(l.Matches)], ['KAZANMA', `%${l['Win Rate %'] ?? '-'}`, wr >= 50 ? cizim.RENK.yesil : cizim.RENK.kirmizi], ['K/D', String(l['Average K/D Ratio'] ?? '-'), kd >= 1 ? cizim.RENK.yesil : cizim.RENK.kirmizi],
      ['HS', `%${l['Average Headshots %'] ?? '-'}`], ['ADR', String(l.ADR ?? '-')], ['EN UZUN SERİ', String(l['Longest Win Streak'] ?? '-'), cizim.RENK.altin]],
    son: (l['Recent Results'] || []).map((x) => String(x) === '1'), haritalar });
  const b = (id, ad, emoji, stil = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`faceit:${id}:${p.player_id}`).setLabel(ad).setEmoji(emoji).setStyle(stil);
  return { files: [kart], attachments: [], components: [satir(b('sonmac', 'Son maçın skor tablosu', '📋', ButtonStyle.Primary), b('maclar', 'Son 10 maç', '🕹️'), b('yenile', 'Yenile', '🔄'), new ButtonBuilder().setLabel('FACEIT').setStyle(ButtonStyle.Link).setURL(profilUrl(p)))] };
}

// Son maçlar: özet + açılır menüden maç seçince tüm oyuncuların skor tablosu
async function maclarMesaj(p) {
  const v = await api(`/players/${p.player_id}/games/${OYUN}/stats?offset=0&limit=10`);
  const m = (v?.items || []).map((x) => x.stats).filter((x) => x['Match Id']);
  if (!m.length) return null;
  const ort = (alan) => (m.reduce((a, x) => a + Number(x[alan] || 0), 0) / m.length).toFixed(2);
  const g = m.filter((s) => s.Result === '1').length;
  const e = E(`${p.nickname} — son ${m.length} maç`, m.map((s) => `${s.Result === '1' ? '🟩' : '🟥'} **${haritaAd(s.Map)}** \`${String(s.Score || '').replace(/\s/g, '')}\` — **${s.Kills}/${s.Deaths}/${s.Assists}** • K/D ${s['K/D Ratio']} • HS %${s['Headshots %']}`).join('\n'), 0xff5500)
    .setURL(profilUrl(p)).setThumbnail(p.avatar || null)
    .addFields({ name: 'Form', value: `**${g}G / ${m.length - g}M**`, inline: true }, { name: 'Ort. K/D', value: ort('K/D Ratio'), inline: true }, { name: 'Ort. öldürme', value: ort('Kills'), inline: true })
    .setFooter({ text: 'Bir maçı seç: iki takımın tüm oyuncularıyla skor tablosu gelir' });
  const menu = new StringSelectMenuBuilder().setCustomId('faceit:mac').setPlaceholder('📋 Skor tablosunu görmek için maç seç')
    .addOptions(m.map((s, k) => ({ label: `${haritaAd(s.Map)} ${String(s.Score || '').replace(/\s/g, '')}`.slice(0, 100), description: `${s.Kills}/${s.Deaths}/${s.Assists} • K/D ${s['K/D Ratio']}`.slice(0, 100), value: s['Match Id'], emoji: s.Result === '1' ? '🟩' : '🟥' })).filter((o, k, d) => d.findIndex((x) => x.value === o.value) === k));
  return { embeds: [e], components: [satir(menu)] };
}

// FACEIT maç istatistiğini skor tablosu modeline çevirir; sunucuya bağlı oyuncular vurgulanır
function skorModel(v, bagli = new Map()) {
  const tur = v?.rounds?.[0];
  if (!tur) return null;
  const n = (x) => Number(x) || 0;
  const takimlar = tur.teams.map((t) => ({
    ad: t.team_stats?.Team || 'Takım', skor: n(t.team_stats?.['Final Score']), kazandi: t.team_stats?.['Team Win'] === '1' || tur.round_stats?.Winner === t.team_id,
    oyuncular: t.players.map((o) => { const s = o.player_stats || {}, k = n(s.Kills), d = n(s.Deaths); return { ad: o.nickname, k, d, a: n(s.Assists), kd: n(s['K/D Ratio']) || k / Math.max(1, d), adr: n(s.ADR), hs: n(s['Headshots %']), mvp: n(s.MVPs), ace: n(s['Penta Kills']), vurgu: bagli.has(o.player_id), etiket: bagli.get(o.player_id) || null }; }).sort((a, b) => b.k - a.k),
  }));
  return { harita: haritaAd(tur.round_stats?.Map), alt: `FACEIT 5v5  •  ${tur.round_stats?.Rounds || takimlar[0].skor + takimlar[1].skor} tur`, takimlar, dipnot: bagli.size ? 'Turuncu satırlar bu sunucunun üyeleri' : '' };
}
async function skorMesaj(guild, macId) {
  const v = await api(`/matches/${macId}/stats`, 10 * 6e4);
  const bagli = new Map(db.faceitBagli(guild.id).map((u) => [u.faceit_id, `@${guild.members.cache.get(u.user)?.displayName || u.faceit_nick}`]));
  const model = skorModel(v, bagli);
  if (!model) return null;
  return { files: [cizim.skorTablosu(model)], components: [satir(new ButtonBuilder().setLabel('Maç odası').setStyle(ButtonStyle.Link).setURL(`https://www.faceit.com/tr/cs2/room/${macId}`))] };
}
// Profil kartındaki FACEIT butonu için: üyenin bağlı hesabını gönderir
async function profilGonder(i, userId) {
  const u = db.uye(i.guild.id, userId);
  if (!u.faceit_id) return hata(i, 'Bağlı FACEIT hesabı yok.');
  await i.deferReply();
  try { const p = await api(`/players/${u.faceit_id}`); return i.editReply(p ? await profilMesaj(p) : { content: 'Oyuncu bulunamadı.' }); } catch (e) { return hataYaz(i, e); }
}

function hataYaz(i, e) {
  if (e.kod === 'anahtar') return hata(i, 'FACEIT API anahtarı tanımlı değil. Sunucu sahibi `.env` dosyasına `FACEIT_API_KEY` eklemeli (developers.faceit.com).');
  if (e.kod === 429) return hata(i, 'FACEIT istek sınırına takıldık, biraz sonra tekrar dene.');
  if (e.kod === 401 || e.kod === 403) return hata(i, 'FACEIT API anahtarı geçersiz.');
  if (e.name === 'TimeoutError' || typeof e.kod === 'number') return hata(i, 'FACEIT şu an yanıt vermiyor.');
  throw e;
}
// Seçenek verilmezse üyenin bağlı hesabını kullanır
async function hedefCoz(i, secenek = 'nick') {
  const nick = i.options.getString(secenek), uye = i.options.getUser('üye') || (!nick ? i.user : null);
  if (nick) return oyuncuBul(nick.trim());
  const u = db.uye(i.guild.id, uye.id);
  if (!u.faceit_id) { await hata(i, `${uye.id === i.user.id ? 'Bağlı FACEIT hesabın yok. `/faceit bağla` kullan ya da bir takma ad yaz.' : 'Bu üyenin bağlı FACEIT hesabı yok.'}`); return undefined; }
  return api(`/players/${u.faceit_id}`);
}
async function rolGuncelle(guild, userId, lvl) {
  const roller = db.ayar(guild.id, 'faceit.roller');
  if (!roller) return;
  const m = await guild.members.fetch(userId).catch(() => null);
  if (!m) return;
  const hedef = roller[lvl];
  const cikar = Object.values(roller).filter((r) => r !== hedef && m.roles.cache.has(r));
  if (cikar.length) await m.roles.remove(cikar).catch(() => {});
  if (hedef && !m.roles.cache.has(hedef)) await m.roles.add(hedef).catch(() => {});
}

let tur = 0;
module.exports = {
  ad: 'faceit',
  api, sonrakiSeviye, ESIK, skorModel, profilGonder,
  bilesenler: {
    faceit: async (i, [islem, id]) => {
      try {
        if (islem === 'mac' || islem === 'sonmac') {
          await i.deferReply();
          let macId = islem === 'mac' ? i.values[0] : null;
          if (!macId) macId = (await api(`/players/${id}/games/${OYUN}/stats?offset=0&limit=1`))?.items?.[0]?.stats?.['Match Id'];
          const mesaj = macId && await skorMesaj(i.guild, macId);
          return i.editReply(mesaj || { content: 'Bu maçın istatistikleri bulunamadı.' });
        }
        const p = await api(`/players/${id}`, islem === 'yenile' ? 0 : 60_000);
        if (!p) return hata(i, 'Oyuncu bulunamadı.');
        if (islem === 'maclar') { await i.deferReply(); return i.editReply((await maclarMesaj(p)) || { content: 'Kayıtlı CS2 maçı yok.' }); }
        await i.deferUpdate();
        return i.editReply(await profilMesaj(p));
      } catch (e) { return hataYaz(i, e); }
    },
  },
  komutlar: [
    { data: new SlashCommandBuilder().setName('faceit').setDescription('FACEIT CS2 istatistikleri')
        .addSubcommand((s) => s.setName('profil').setDescription('Oyuncu profili: ELO, seviye, K/D, kazanma oranı')
          .addStringOption((o) => o.setName('nick').setDescription('FACEIT takma adı')).addUserOption((o) => o.setName('üye').setDescription('Hesabı bağlı bir üye')))
        .addSubcommand((s) => s.setName('maçlar').setDescription('Son 10 maçın detayları')
          .addStringOption((o) => o.setName('nick').setDescription('FACEIT takma adı')).addUserOption((o) => o.setName('üye').setDescription('Hesabı bağlı bir üye')))
        .addSubcommand((s) => s.setName('karşılaştır').setDescription('İki oyuncuyu kafa kafaya karşılaştırır')
          .addStringOption((o) => o.setName('nick1').setDescription('1. oyuncu').setRequired(true)).addStringOption((o) => o.setName('nick2').setDescription('2. oyuncu (boşsa bağlı hesabın)')))
        .addSubcommand((s) => s.setName('bağla').setDescription('FACEIT hesabını Discord profiline bağlar').addStringOption((o) => o.setName('nick').setDescription('FACEIT takma adın').setRequired(true)))
        .addSubcommand((s) => s.setName('ayır').setDescription('Bağlı FACEIT hesabını kaldırır'))
        .addSubcommand((s) => s.setName('sıralama').setDescription('Sunucudaki bağlı hesapların ELO sıralaması'))
        .addSubcommand((s) => s.setName('roller').setDescription('[Yönetici] FACEIT 1-10 seviye rollerini oluşturur ve otomatik dağıtır')),
      calistir: async (i) => {
        const alt = i.options.getSubcommand(), g = i.guild;
        try {
          if (alt === 'ayır') {
            db.uyeYaz(g.id, i.user.id, { faceit_id: null, faceit_nick: null, faceit_elo: 0, faceit_lvl: 0 });
            await rolGuncelle(g, i.user.id, 0);
            return tamam(i, 'FACEIT hesabının bağlantısı kaldırıldı.', true);
          }
          if (alt === 'sıralama') {
            const l = db.sirala(g.id, 'faceit_elo', 15);
            return yanit(i, E('🎯 FACEIT Sunucu Sıralaması', l.map((u, k) => `${madalya(k)} <@${u.user}> — **${sayi(u.faceit_elo)}** ELO • ${lvlYaz(u.faceit_lvl)} • \`${u.faceit_nick}\``).join('\n') || 'Henüz kimse hesabını bağlamamış. `/faceit bağla`', 0xff5500));
          }
          if (alt === 'roller') {
            if (!i.memberPermissions.has(P.ManageRoles)) return hata(i, 'Bunun için **Rolleri Yönet** yetkisi gerekir.');
            await i.deferReply();
            const roller = db.ayar(g.id, 'faceit.roller') || {};
            const RENK = [0, 0xeeeeee, 0x1ce400, 0x1ce400, 0xffc800, 0xffc800, 0xffc800, 0xffc800, 0xff6309, 0xff6309, 0xfe1f00];
            for (let l = 1; l <= 10; l++) {
              if (roller[l] && g.roles.cache.get(roller[l])) continue;
              roller[l] = (await g.roles.create({ name: `FACEIT ${l}`, color: RENK[l], permissions: [] })).id;
            }
            db.ayarYaz(g.id, 'faceit.roller', roller);
            for (const u of db.faceitBagli(g.id)) await rolGuncelle(g, u.user, u.faceit_lvl);
            return i.editReply({ embeds: [E(null, '✅ FACEIT 1-10 rolleri hazır. Hesabını bağlayan üyelere seviyelerine göre otomatik verilecek ve maçlardan sonra güncellenecek.', R.ok)] });
          }
          await i.deferReply({ flags: alt === 'bağla' ? 64 : undefined });
          if (alt === 'bağla') {
            const p = await oyuncuBul(i.options.getString('nick').trim());
            if (!p) return hata(i, 'Bu takma adla bir FACEIT oyuncusu bulunamadı.');
            const o = p.games?.[OYUN];
            db.uyeYaz(g.id, i.user.id, { faceit_id: p.player_id, faceit_nick: p.nickname, faceit_elo: o?.faceit_elo || 0, faceit_lvl: o?.skill_level || 0 });
            await rolGuncelle(g, i.user.id, o?.skill_level || 0);
            await i.editReply({ embeds: [E(null, `✅ **${p.nickname}** hesabı bağlandı${o ? ` — ${sayi(o.faceit_elo)} ELO • ${lvlYaz(o.skill_level)}` : ''}.\nArtık \`/faceit profil\` yazman yeterli; maçların bitince takip kanalına düşecek.`, R.ok)] });
            return oyuncu.basarimVer(g, i.user.id, 'faceit', i.channel);
          }
          if (alt === 'profil') {
            const p = await hedefCoz(i);
            if (p === undefined) return;
            if (!p) return hata(i, 'Oyuncu bulunamadı.');
            return i.editReply(await profilMesaj(p));
          }
          if (alt === 'maçlar') {
            const p = await hedefCoz(i);
            if (p === undefined) return;
            if (!p) return hata(i, 'Oyuncu bulunamadı.');
            const mesaj = await maclarMesaj(p);
            if (!mesaj) return hata(i, 'Bu oyuncunun kayıtlı CS2 maçı yok.');
            return i.editReply(mesaj);
          }
          // karşılaştır
          const p1 = await oyuncuBul(i.options.getString('nick1').trim());
          const p2 = await hedefCoz(i, 'nick2');
          if (p2 === undefined) return;
          if (!p1 || !p2) return hata(i, 'Oyunculardan biri bulunamadı.');
          const [s1, s2] = await Promise.all([p1, p2].map((p) => api(`/players/${p.player_id}/stats/${OYUN}`)));
          const sat = (ad, a, b, buyukIyi = true) => {
            const x = Number(a), y = Number(b);
            const k1 = x === y ? '▫️' : (x > y) === buyukIyi ? '🟢' : '🔴', k2 = x === y ? '▫️' : (y > x) === buyukIyi ? '🟢' : '🔴';
            return `${k1} **${a ?? '—'}** — ${ad} — **${b ?? '—'}** ${k2}`;
          };
          const l1 = s1?.lifetime || {}, l2 = s2?.lifetime || {}, o1 = p1.games?.[OYUN] || {}, o2 = p2.games?.[OYUN] || {};
          return i.editReply({ embeds: [E(`${p1.nickname}  ⚔️  ${p2.nickname}`, [
            sat('ELO', o1.faceit_elo, o2.faceit_elo), sat('Seviye', o1.skill_level, o2.skill_level), sat('Maç', l1.Matches, l2.Matches),
            sat('Kazanma %', l1['Win Rate %'], l2['Win Rate %']), sat('K/D', l1['Average K/D Ratio'], l2['Average K/D Ratio']),
            sat('HS %', l1['Average Headshots %'], l2['Average Headshots %']), sat('En uzun seri', l1['Longest Win Streak'], l2['Longest Win Streak']),
          ].join('\n'), 0xff5500).addFields({ name: 'Son 5', value: `${sonuclar(l1['Recent Results']) || '—'}  vs  ${sonuclar(l2['Recent Results']) || '—'}` })] });
        } catch (e) { return hataYaz(i, e); }
      } },
  ],
  // Maç takibi: 3 dakikada bir, tur başına en fazla 25 bağlı hesap kontrol edilir
  async tik(ctx) {
    if (!config.faceitKey || ++tur % 3 !== 0) return;
    const hepsi = db.faceitBagli().filter((u) => ctx.client.guilds.cache.has(u.guild));
    if (!hepsi.length) return;
    const bas = (Math.floor(tur / 3) * 25) % hepsi.length;
    for (const u of [...hepsi, ...hepsi].slice(bas, bas + Math.min(25, hepsi.length))) {
      try {
        const v = await api(`/players/${u.faceit_id}/games/${OYUN}/stats?offset=0&limit=1`, 0);
        const s = v?.items?.[0]?.stats;
        if (!s?.['Match Id']) continue;
        const veri = JSON.parse(u.veri || '{}');
        if (veri.faceitSon === s['Match Id']) continue;
        const ilk = !veri.faceitSon;
        const p = await api(`/players/${u.faceit_id}`, 0);
        const o = p?.games?.[OYUN];
        const guild = ctx.client.guilds.cache.get(u.guild);
        const kazandi = s.Result === '1';
        const seri = db.veri(u.guild, u.user, (d) => {
          d.faceitSon = s['Match Id'];
          d.faceitSeri = ilk ? 0 : kazandi ? Math.max(1, (d.faceitSeri || 0) + 1) : Math.min(-1, (d.faceitSeri || 0) - 1);
          return d.faceitSeri;
        });
        if (o) db.uyeYaz(u.guild, u.user, { faceit_elo: o.faceit_elo, faceit_lvl: o.skill_level, faceit_nick: p.nickname });
        if (ilk || !o) continue; // ilk turda yalnızca referans noktası alınır
        if (o.skill_level !== u.faceit_lvl) await rolGuncelle(guild, u.user, o.skill_level);
        const kanal = guild.channels.cache.get(db.ayar(u.guild, 'kanal.faceit'));
        if (!kanal) continue;
        const fark = o.faceit_elo - u.faceit_elo;
        let ek = '';
        if (o.skill_level > u.faceit_lvl) ek += `\n🎉 **Seviye atladı → ${lvlYaz(o.skill_level)}**`;
        if (o.skill_level < u.faceit_lvl) ek += `\n📉 Seviye düştü → ${lvlYaz(o.skill_level)}`;
        if (seri <= -3) ek += `\n🧊 **Tilt alarmı:** üst üste ${-seri} mağlubiyet. Bir su iç, mola ver, ateşin başına gel 🔥`;
        if (seri >= 3) ek += `\n🔥 **Seride:** üst üste ${seri} galibiyet!`;
        // Aynı maçta birden çok üye varsa skor tablosu bir kez gönderilir
        const gonderilen = db.ayar(u.guild, 'faceit.sonMaclar', []);
        let ekMesaj = null;
        if (!gonderilen.includes(s['Match Id'])) {
          db.ayarYaz(u.guild, 'faceit.sonMaclar', [...gonderilen, s['Match Id']].slice(-40));
          ekMesaj = await skorMesaj(guild, s['Match Id']).catch(() => null);
        }
        await kanal.send({ files: ekMesaj?.files || [], components: ekMesaj?.components || [], embeds: [E(`${kazandi ? '🟩 Galibiyet' : '🟥 Mağlubiyet'} — ${p.nickname}`,
          `<@${u.user}> • **${(s.Map || '?').replace('de_', '')}** • ${String(s.Score || '').replace(/\s/g, '')}\n**${s.Kills}/${s.Deaths}/${s.Assists}** • K/D ${s['K/D Ratio']} • HS %${s['Headshots %']}${s.ADR ? ` • ADR ${Math.round(s.ADR)}` : ''}\nELO: **${sayi(o.faceit_elo)}** (${fark >= 0 ? '+' : ''}${fark})${ek}`, kazandi ? R.ok : R.hata)
          .setURL(`https://www.faceit.com/tr/cs2/room/${s['Match Id']}`).setThumbnail(p.avatar || null).setImage(ekMesaj ? 'attachment://skor.png' : null)] }).catch(() => {});
      } catch (e) { if (e.kod === 429) return; }
    }
  },
};
