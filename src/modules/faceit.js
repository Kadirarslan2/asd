// FACEIT entegrasyonu: profil, son maçlar, karşılaştırma, hesap bağlama, sunucu ELO sıralaması,
// otomatik seviye rolleri ve maç takibi (yeni maç bitince kanala düşer; tilt/seri alarmı verir)
const { SlashCommandBuilder, PermissionFlagsBits: P } = require('discord.js');
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

async function profilEmbed(p) {
  const o = p.games?.[OYUN];
  if (!o) return E(p.nickname, 'Bu oyuncunun CS2 kaydı yok.', R.gri).setURL(profilUrl(p));
  const st = await api(`/players/${p.player_id}/stats/${OYUN}`);
  const l = st?.lifetime || {};
  const haritalar = (st?.segments || []).filter((s) => s.type === 'Map' && s.mode === '5v5').sort((a, b) => Number(b.stats.Matches) - Number(a.stats.Matches)).slice(0, 3);
  const e = E(`${p.nickname} ${p.country ? `:flag_${p.country.toLowerCase()}:` : ''}`, null, 0xff5500).setURL(profilUrl(p)).setThumbnail(p.avatar || null)
    .addFields(
      { name: 'ELO', value: `**${sayi(o.faceit_elo)}**`, inline: true }, { name: 'Seviye', value: lvlYaz(o.skill_level), inline: true }, { name: 'Bölge', value: o.region || '—', inline: true },
      { name: 'İlerleme', value: sonrakiSeviye(o.faceit_elo, o.skill_level) },
      { name: 'Maç', value: String(l.Matches ?? '—'), inline: true }, { name: 'Kazanma', value: `%${l['Win Rate %'] ?? '—'}`, inline: true }, { name: 'K/D', value: String(l['Average K/D Ratio'] ?? '—'), inline: true },
      { name: 'HS', value: `%${l['Average Headshots %'] ?? '—'}`, inline: true }, { name: 'ADR', value: String(l.ADR ?? '—'), inline: true }, { name: 'En uzun seri', value: String(l['Longest Win Streak'] ?? '—'), inline: true },
      { name: 'Son 5 maç', value: sonuclar(l['Recent Results']) || '—' });
  if (haritalar.length) e.addFields({ name: 'En çok oynanan haritalar', value: haritalar.map((h) => `**${h.label}** — ${h.stats.Matches} maç • %${h.stats['Win Rate %']} • ${h.stats['Average K/D Ratio']} K/D`).join('\n') });
  return e;
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
  api, sonrakiSeviye, ESIK,
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
            return i.editReply({ embeds: [await profilEmbed(p)] });
          }
          if (alt === 'maçlar') {
            const p = await hedefCoz(i);
            if (p === undefined) return;
            if (!p) return hata(i, 'Oyuncu bulunamadı.');
            const v = await api(`/players/${p.player_id}/games/${OYUN}/stats?offset=0&limit=10`);
            const m = (v?.items || []).map((x) => x.stats);
            if (!m.length) return hata(i, 'Bu oyuncunun kayıtlı CS2 maçı yok.');
            const ort = (alan) => (m.reduce((a, x) => a + Number(x[alan] || 0), 0) / m.length).toFixed(2);
            const satirlar = m.map((s) => `${s.Result === '1' ? '🟩' : '🟥'} \`${(s.Map || '?').replace('de_', '').padEnd(8)}\` \`${String(s.Score || '').replace(/\s/g, '').padEnd(5)}\` **${s.Kills}/${s.Deaths}/${s.Assists}** • K/D ${s['K/D Ratio']} • HS %${s['Headshots %']}${s.ADR ? ` • ADR ${Math.round(s.ADR)}` : ''}`);
            return i.editReply({ embeds: [E(`${p.nickname} — son ${m.length} maç`, satirlar.join('\n'), 0xff5500).setURL(profilUrl(p))
              .addFields({ name: 'Ortalama', value: `**${m.filter((s) => s.Result === '1').length}G / ${m.filter((s) => s.Result !== '1').length}M** • K/D ${ort('K/D Ratio')} • ${ort('Kills')} öldürme • HS %${ort('Headshots %')}` })] });
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
        await kanal.send({ embeds: [E(`${kazandi ? '🟩 Galibiyet' : '🟥 Mağlubiyet'} — ${p.nickname}`,
          `<@${u.user}> • **${(s.Map || '?').replace('de_', '')}** • ${String(s.Score || '').replace(/\s/g, '')}\n**${s.Kills}/${s.Deaths}/${s.Assists}** • K/D ${s['K/D Ratio']} • HS %${s['Headshots %']}${s.ADR ? ` • ADR ${Math.round(s.ADR)}` : ''}\nELO: **${sayi(o.faceit_elo)}** (${fark >= 0 ? '+' : ''}${fark})${ek}`, kazandi ? R.ok : R.hata)
          .setURL(`https://www.faceit.com/tr/cs2/room/${s['Match Id']}`).setThumbnail(p.avatar || null)] }).catch(() => {});
      } catch (e) { if (e.kod === 429) return; }
    }
  },
};
