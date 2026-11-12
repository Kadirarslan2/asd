// Müzik: şarkı adı / YouTube linki / doğrudan ses linki / canlı radyo. Sıra, döngü, ses, butonlu "şimdi çalıyor" kartı.
// YouTube araması için yt-dlp kullanılır; yoksa ilk kullanımda data/bin altına otomatik indirilir.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const voice = require('@discordjs/voice');
const prism = require('prism-media');
const db = require('../core/db');
const config = require('../core/config');
const cizim = require('../core/cizim');
const { E, R, hata, tamam, yanit, karistir, kisalt } = require('../core/util');

const RADYOLAR = {
  lofi: ['Lofi (çalışma/sohbet)', 'https://ice1.somafm.com/fluid-128-mp3'],
  chill: ['Groove Salad (chill)', 'https://ice1.somafm.com/groovesalad-128-mp3'],
  kamp: ['Kamp ateşi (akustik/folk)', 'https://ice1.somafm.com/folkfwd-128-mp3'],
  synth: ['Synthwave', 'https://ice1.somafm.com/synphaera-128-mp3'],
  rock: ['Indie Rock', 'https://ice1.somafm.com/indiepop-128-mp3'],
  metal: ['Metal', 'https://ice1.somafm.com/metal-128-mp3'],
  powerturk: ['Power Türk', 'https://listen.powerapp.com.tr/powerturk/mpeg/icecast.audio'],
  powerfm: ['Power FM', 'https://listen.powerapp.com.tr/powerfm/mpeg/icecast.audio'],
  superfm: ['Süper FM', 'https://playerservices.streamtheworld.com/api/livestream-redirect/SUPER_FM.mp3'],
  metrofm: ['Metro FM', 'https://playerservices.streamtheworld.com/api/livestream-redirect/METRO_FM.mp3'],
  joyturk: ['Joy Türk', 'https://playerservices.streamtheworld.com/api/livestream-redirect/JOY_TURK.mp3'],
};
const radyolar = (g) => ({ ...RADYOLAR, ...db.ayar(g, 'muzik.radyolar', {}) });
const oturumlar = new Map(); // guild -> oturum
const dinleyiciler = new Set(); // şarkı değişince haber verilecekler (kamp ateşi sahnesi)
const haberVer = (g) => { for (const fn of dinleyiciler) try { fn(g); } catch { /* yoksay */ } };

// ---------- yt-dlp ----------
const BIN = path.join(config.kok, 'data', 'bin');
let ytdlpYol = null, indiriliyor = null;
async function ytdlp() {
  if (ytdlpYol) return ytdlpYol;
  const yerel = path.join(BIN, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  for (const aday of [process.env.YTDLP_PATH, yerel, 'yt-dlp'].filter(Boolean)) {
    const calisiyor = await new Promise((r) => execFile(aday, ['--version'], { timeout: 15_000 }, (e) => r(!e)));
    if (calisiyor) return (ytdlpYol = aday);
  }
  if (process.env.YTDLP_OTOMATIK_INDIR === '0') throw new Error('yt-dlp bulunamadı ve otomatik indirme kapalı');
  indiriliyor ??= (async () => {
    const dosya = process.platform === 'win32' ? 'yt-dlp.exe' : process.platform === 'darwin' ? 'yt-dlp_macos' : process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
    console.log('🎵 yt-dlp indiriliyor…');
    const r = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${dosya}`, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`yt-dlp indirilemedi (${r.status})`);
    fs.mkdirSync(BIN, { recursive: true });
    fs.writeFileSync(yerel, Buffer.from(await r.arrayBuffer()), { mode: 0o755 });
    return yerel;
  })().finally(() => { indiriliyor = null; });
  return (ytdlpYol = await indiriliyor);
}
const calistir = (bin, arg) => new Promise((res, rej) => execFile(bin, arg, { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 }, (e, cikti) => (e ? rej(e) : res(cikti))));

// Sorguyu çalınabilir parçalara çevirir
async function coz(sorgu, isteyen) {
  const link = /^https?:\/\//i.test(sorgu);
  if (link && /\.(mp3|ogg|opus|wav|flac|m4a|aac|m3u8|pls)(\?|$)/i.test(sorgu)) return [{ baslik: decodeURIComponent(sorgu.split('/').pop().split('?')[0]).slice(0, 80), url: sorgu, tur: 'dogrudan', isteyen }];
  const bin = await ytdlp();
  const liste = link && /[?&]list=/.test(sorgu);
  const cikti = await calistir(bin, ['--dump-single-json', '--no-warnings', '--flat-playlist', ...(liste ? ['--playlist-end', '25'] : ['--no-playlist']), '--default-search', 'ytsearch1', sorgu]);
  const j = JSON.parse(cikti);
  const girdiler = j.entries ? j.entries.filter(Boolean) : [j];
  return girdiler.map((v) => ({ baslik: (v.title || 'Bilinmeyen').slice(0, 100), kanal: v.uploader || v.channel || '', sure: v.duration || 0, url: v.webpage_url || v.url, kapak: v.thumbnail || v.thumbnails?.at(-1)?.url || null, tur: 'ytdlp', isteyen }));
}

// ---------- Oynatma ----------
function kaynak(parca, ses) {
  const ortak = ['-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2'];
  let ffmpeg, surec = null;
  if (parca.tur === 'ytdlp') {
    surec = spawn(ytdlpYol, ['-f', 'bestaudio/best', '--no-playlist', '--no-warnings', '-q', '-o', '-', parca.url], { stdio: ['ignore', 'pipe', 'ignore'] });
    ffmpeg = new prism.FFmpeg({ args: ['-i', 'pipe:0', ...ortak] });
    surec.stdout.on('error', () => {}); ffmpeg.on('error', () => {});
    surec.stdout.pipe(ffmpeg);
  } else {
    ffmpeg = new prism.FFmpeg({ args: ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5', '-i', parca.url, ...ortak] });
    ffmpeg.on('error', () => {});
  }
  const kaynak_ = voice.createAudioResource(ffmpeg, { inputType: voice.StreamType.Raw, inlineVolume: true });
  kaynak_.volume.setVolume(ses);
  return { kaynak: kaynak_, kapat: () => { surec?.kill('SIGKILL'); ffmpeg.destroy(); } };
}
const butonlar = (o) => [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('muzik:duraklat').setEmoji(o.duraklatildi ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('muzik:gec').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('muzik:dongu').setEmoji('🔁').setLabel({ kapali: 'Kapalı', sarki: 'Şarkı', sira: 'Sıra' }[o.dongu]).setStyle(o.dongu === 'kapali' ? ButtonStyle.Secondary : ButtonStyle.Success),
  new ButtonBuilder().setCustomId('muzik:karistir').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('muzik:durdur').setEmoji('⏹️').setStyle(ButtonStyle.Danger)),
new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('muzik:ses:-').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('muzik:bos').setLabel(`Ses %${Math.round(o.ses * 100)}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
  new ButtonBuilder().setCustomId('muzik:ses:+').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('muzik:sira').setEmoji('📜').setLabel('Sıra').setStyle(ButtonStyle.Secondary))];

async function kartGonder(o, yeniMesaj = true) {
  const p = o.simdi, kanal = o.guild.channels.cache.get(o.metinKanal);
  if (!p || !kanal) return;
  const yuk = { files: [await cizim.muzikKart({ baslik: p.baslik, kanal: p.kanal, sure: p.sure, kapak: p.kapak, isteyen: p.isteyenAd, sira: o.sira.length, canli: p.tur === 'radyo', durum: o.duraklatildi ? 'DURAKLATILDI' : null })], components: butonlar(o), attachments: [] };
  if (!yeniMesaj && o.mesaj) return kanal.messages.edit(o.mesaj, yuk).catch(() => {});
  if (o.mesaj) kanal.messages.delete(o.mesaj).catch(() => {});
  const { attachments, ...gonder } = yuk;
  o.mesaj = (await kanal.send(gonder).catch(() => null))?.id || null;
}
async function sonraki(o) {
  o.kapat?.(); o.kapat = null;
  if (o.simdi && o.dongu === 'sarki' && !o.gecildi) o.sira.unshift(o.simdi);
  else if (o.simdi && o.dongu === 'sira' && o.simdi.tur !== 'radyo') o.sira.push(o.simdi);
  o.gecildi = false;
  o.simdi = o.sira.shift() || null;
  haberVer(o.guild.id);
  if (!o.simdi) {
    const kanal = o.guild.channels.cache.get(o.metinKanal);
    if (o.mesaj) kanal?.messages.edit(o.mesaj, { components: [] }).catch(() => {});
    o.bosZaman = Date.now();
    return;
  }
  try {
    const k = kaynak(o.simdi, o.ses);
    o.kaynak = k.kaynak; o.kapat = k.kapat; o.hataSayisi = 0;
    o.player.play(k.kaynak);
    await kartGonder(o);
  } catch (e) {
    console.error('Müzik oynatma hatası:', e.message);
    if (++o.hataSayisi < 3) return sonraki(o);
  }
}
async function oturumAc(i) {
  let o = oturumlar.get(i.guild.id);
  const kanal = i.member.voice.channel;
  if (o) return o;
  const baglanti = voice.joinVoiceChannel({ channelId: kanal.id, guildId: i.guild.id, adapterCreator: i.guild.voiceAdapterCreator, selfDeaf: true });
  const player = voice.createAudioPlayer({ behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play } });
  o = { guild: i.guild, baglanti, player, sira: [], simdi: null, dongu: 'kapali', ses: db.ayar(i.guild.id, 'muzik.ses', 0.5), metinKanal: i.channelId, mesaj: null, sesKanal: kanal.id, duraklatildi: false, hataSayisi: 0, bosZaman: Date.now() };
  oturumlar.set(i.guild.id, o);
  baglanti.subscribe(player);
  player.on(voice.AudioPlayerStatus.Idle, () => { if (!o.kapandi) sonraki(o); });
  player.on('error', (e) => console.error('Oynatıcı hatası:', e.message));
  baglanti.on(voice.VoiceConnectionStatus.Disconnected, async () => {
    try { await Promise.race([voice.entersState(baglanti, voice.VoiceConnectionStatus.Signalling, 5000), voice.entersState(baglanti, voice.VoiceConnectionStatus.Connecting, 5000)]); } catch { kapat(i.guild.id); }
  });
  try { await voice.entersState(baglanti, voice.VoiceConnectionStatus.Ready, 20_000); } catch { kapat(i.guild.id); throw Object.assign(new Error('baglanti'), { kod: 'baglanti' }); }
  return o;
}
function kapat(g) {
  const o = oturumlar.get(g);
  if (!o) return;
  o.kapandi = true; oturumlar.delete(g);
  o.kapat?.(); o.player.stop(true);
  try { o.baglanti.destroy(); } catch { /* zaten kapalı */ }
  if (o.mesaj) o.guild.channels.cache.get(o.metinKanal)?.messages.edit(o.mesaj, { components: [] }).catch(() => {});
  haberVer(g);
}
// Komutu kullanan, botla aynı ses kanalında mı?
function denetle(i, oturumSart = true) {
  const kanal = i.member.voice.channel, o = oturumlar.get(i.guild.id);
  if (!kanal) { hata(i, 'Önce bir ses kanalına gir.'); return null; }
  if (o && o.sesKanal !== kanal.id) { hata(i, `Şu an <#${o.sesKanal}> kanalında çalıyorum; oraya gel.`); return null; }
  if (oturumSart && !o) { hata(i, 'Şu an bir şey çalmıyor. `/müzik çal` ile başlat.'); return null; }
  return o || true;
}
async function ekle(i, parcalar, basaAl = false) {
  const o = await oturumAc(i);
  for (const p of parcalar) p.isteyenAd = i.member.displayName;
  if (basaAl) { o.sira.unshift(...parcalar); o.gecildi = true; o.player.stop(true); if (!o.simdi) await sonraki(o); }
  else { o.sira.push(...parcalar); if (!o.simdi) await sonraki(o); else kartGonder(o, false); }
  return o;
}
const siraEmbed = (o) => E('📜 Çalma sırası', `**Şimdi:** ${o.simdi ? o.simdi.baslik : '—'}\n\n${o.sira.slice(0, 15).map((p, k) => `\`${k + 1}.\` ${kisalt(p.baslik, 60)}${p.sure ? ` \`${Math.floor(p.sure / 60)}:${String(Math.floor(p.sure % 60)).padStart(2, '0')}\`` : ''} — ${p.isteyenAd}`).join('\n') || '*Sırada şarkı yok*'}${o.sira.length > 15 ? `\n…ve ${o.sira.length - 15} şarkı daha` : ''}`, R.mor).setFooter({ text: `Döngü: ${o.dongu} • Ses: %${Math.round(o.ses * 100)}` });
const radyoMenu = (g) => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('muzik:radyo').setPlaceholder('📻 Radyo seç').addOptions(Object.entries(radyolar(g)).slice(0, 25).map(([value, [label]]) => ({ label: label.slice(0, 100), value }))));

async function islem(i, tur, arg) {
  const o = denetle(i);
  if (!o) return;
  if (tur === 'sira') return yanit(i, siraEmbed(o), true);
  if (tur === 'gec') { if (!o.simdi) return hata(i, 'Geçilecek şarkı yok.'); o.gecildi = true; o.player.stop(true); return tamam(i, `⏭️ ${i.user} şarkıyı geçti.`); }
  if (tur === 'durdur') { kapat(i.guild.id); return tamam(i, `⏹️ ${i.user} müziği durdurdu.`); }
  if (tur === 'duraklat') { o.duraklatildi ? o.player.unpause() : o.player.pause(); o.duraklatildi = !o.duraklatildi; }
  else if (tur === 'dongu') o.dongu = arg || { kapali: 'sarki', sarki: 'sira', sira: 'kapali' }[o.dongu];
  else if (tur === 'karistir') o.sira = karistir(o.sira);
  else if (tur === 'ses') { o.ses = Math.min(1.5, Math.max(0, typeof arg === 'number' ? arg : o.ses + (arg === '+' ? 0.1 : -0.1))); o.kaynak?.volume?.setVolume(o.ses); db.ayarYaz(i.guild.id, 'muzik.ses', o.ses); }
  if (i.isMessageComponent()) { await i.deferUpdate(); return kartGonder(o, false); }
  await kartGonder(o, false);
  return tamam(i, 'Tamam.', true);
}

module.exports = {
  ad: 'muzik',
  RADYOLAR, radyoMenu,
  simdiCalan: (g, c) => { const o = oturumlar.get(g); return o && (!c || o.sesKanal === c) ? o.simdi?.baslik || null : null; },
  degisince: (fn) => dinleyiciler.add(fn),
  // Kamp kartındaki radyo menüsü de bunu kullanır
  async radyoAc(i, anahtar) {
    if (!denetle(i, false)) return;
    const r = radyolar(i.guild.id)[anahtar];
    if (!r) return hata(i, 'Radyo bulunamadı.');
    await i.deferReply();
    try {
      await ekle(i, [{ baslik: r[0], kanal: 'Canlı radyo', url: r[1], tur: 'radyo' }], true);
      return i.editReply({ embeds: [E(null, `📻 ${i.user} **${r[0]}** radyosunu açtı.`, R.mor)] });
    } catch (e) { return i.editReply({ embeds: [E(null, e.kod === 'baglanti' ? '❌ Ses kanalına bağlanamadım; **Bağlan** ve **Konuş** yetkilerimi kontrol et.' : '❌ Radyo açılamadı.', R.hata)] }); }
  },
  komutlar: [
    { data: new SlashCommandBuilder().setName('müzik').setDescription('Müzik çalar')
        .addSubcommand((s) => s.setName('çal').setDescription('Şarkı adı, YouTube linki/listesi ya da ses dosyası linki çalar').addStringOption((o) => o.setName('sorgu').setDescription('Şarkı adı ya da link').setRequired(true).setMaxLength(300)))
        .addSubcommand((s) => s.setName('radyo').setDescription('Canlı radyo açar (boş bırakırsan menü gelir)').addStringOption((o) => o.setName('istasyon').setDescription('İstasyon').setAutocomplete(true)))
        .addSubcommand((s) => s.setName('panel').setDescription('Şimdi çalan kartını ve kontrol butonlarını yeniden gönderir'))
        .addSubcommand((s) => s.setName('sıra').setDescription('Çalma sırasını gösterir'))
        .addSubcommand((s) => s.setName('geç').setDescription('Sıradaki şarkıya geçer'))
        .addSubcommand((s) => s.setName('duraklat').setDescription('Duraklatır / devam ettirir'))
        .addSubcommand((s) => s.setName('durdur').setDescription('Müziği durdurur ve kanaldan çıkar'))
        .addSubcommand((s) => s.setName('ses').setDescription('Ses seviyesini ayarlar').addIntegerOption((o) => o.setName('yüzde').setDescription('0-150').setRequired(true).setMinValue(0).setMaxValue(150)))
        .addSubcommand((s) => s.setName('döngü').setDescription('Döngü modunu ayarlar').addStringOption((o) => o.setName('mod').setDescription('Mod').setRequired(true).addChoices({ name: 'Kapalı', value: 'kapali' }, { name: 'Şarkıyı tekrarla', value: 'sarki' }, { name: 'Sırayı tekrarla', value: 'sira' })))
        .addSubcommand((s) => s.setName('karıştır').setDescription('Sırayı karıştırır'))
        .addSubcommand((s) => s.setName('radyo-ekle').setDescription('[Yönetici] Listeye özel radyo yayını ekler')
          .addStringOption((o) => o.setName('ad').setDescription('Radyo adı').setRequired(true).setMaxLength(40)).addStringOption((o) => o.setName('link').setDescription('Yayın linki (mp3/aac/m3u8)').setRequired(true))),
      tamamla: (i) => { const y = i.options.getFocused().toLowerCase(); return i.respond(Object.entries(radyolar(i.guild.id)).filter(([, [ad]]) => ad.toLowerCase().includes(y)).slice(0, 25).map(([value, [name]]) => ({ name, value }))); },
      calistir: async (i) => {
        const alt = i.options.getSubcommand();
        if (alt === 'radyo-ekle') {
          if (!i.memberPermissions.has('ManageGuild')) return hata(i, 'Bunun için **Sunucuyu Yönet** yetkisi gerekir.');
          const link = i.options.getString('link').trim();
          if (!/^https:\/\/[^\s]+$/i.test(link)) return hata(i, 'Geçerli bir https yayın linki gir.');
          const l = db.ayar(i.guild.id, 'muzik.radyolar', {});
          if (Object.keys(l).length >= 12) return hata(i, 'En fazla 12 özel radyo eklenebilir.');
          l[`ozel${Date.now().toString(36)}`] = [i.options.getString('ad'), link];
          db.ayarYaz(i.guild.id, 'muzik.radyolar', l);
          return tamam(i, 'Radyo eklendi.', true);
        }
        if (alt === 'radyo') {
          const ist = i.options.getString('istasyon');
          if (!ist) return i.reply({ embeds: [E('📻 Radyo', 'Bir istasyon seç; bulunduğun ses kanalında çalmaya başlar.', R.mor)], components: [radyoMenu(i.guild.id)] });
          return module.exports.radyoAc(i, ist);
        }
        if (alt === 'çal') {
          if (!denetle(i, false)) return;
          await i.deferReply();
          try {
            const parcalar = await coz(i.options.getString('sorgu').trim(), i.user.id);
            if (!parcalar.length) return i.editReply({ embeds: [E(null, '❌ Sonuç bulunamadı.', R.hata)] });
            const o = await ekle(i, parcalar);
            return i.editReply({ embeds: [E(null, parcalar.length > 1 ? `🎶 **${parcalar.length} şarkı** sıraya eklendi.` : `🎶 **${parcalar[0].baslik}** ${o.simdi === parcalar[0] ? 'çalıyor' : `sıraya eklendi (#${o.sira.length})`}.`, R.mor)] });
          } catch (e) {
            console.error('Müzik:', e.message);
            return i.editReply({ embeds: [E(null, e.kod === 'baglanti' ? '❌ Ses kanalına bağlanamadım; **Bağlan** ve **Konuş** yetkilerimi kontrol et.' : '❌ Şarkı bulunamadı ya da açılamadı. (YouTube aramaları için sunucuda `yt-dlp` çalışabilmeli; `/müzik radyo` her zaman çalışır.)', R.hata)] });
          }
        }
        if (alt === 'panel') { const o = denetle(i); if (!o) return; await kartGonder(o); return tamam(i, 'Panel gönderildi.', true); }
        const es = { 'sıra': 'sira', 'geç': 'gec', 'karıştır': 'karistir', 'döngü': 'dongu' }[alt] || alt;
        return islem(i, es, alt === 'ses' ? i.options.getInteger('yüzde') / 100 : alt === 'döngü' ? i.options.getString('mod') : undefined);
      } },
  ],
  bilesenler: {
    muzik: (i, [tur, arg]) => (tur === 'radyo' ? module.exports.radyoAc(i, i.values[0]) : islem(i, tur, arg)),
  },
  olaylar: {
    // Bot kanaldan atılırsa oturumu kapat
    voiceStateUpdate: (eski, yeni) => { if (yeni.id === yeni.client.user.id && eski.channelId && !yeni.channelId) kapat(yeni.guild.id); else if (yeni.id === yeni.client.user.id && yeni.channelId) { const o = oturumlar.get(yeni.guild.id); if (o) o.sesKanal = yeni.channelId; } },
  },
  // Kanalda kimse kalmadıysa ya da 5 dakikadır bir şey çalmıyorsa çık
  async tik() {
    for (const [g, o] of oturumlar) {
      const kanal = o.guild.channels.cache.get(o.sesKanal);
      const insan = kanal?.members.filter((m) => !m.user.bot).size || 0;
      if (insan) o.yalnizZaman = null; else o.yalnizZaman ??= Date.now();
      if ((o.yalnizZaman && Date.now() - o.yalnizZaman > 2 * 6e4) || (!o.simdi && Date.now() - o.bosZaman > 5 * 6e4)) kapat(g);
    }
  },
};
