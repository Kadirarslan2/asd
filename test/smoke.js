// Discord'a bağlanmadan çalışan duman testleri:  npm test
process.env.DB_PATH = ':memory:';
process.env.SORGU_OZEL_IZIN = '1';
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const net = require('node:net');
const { MessageFlags, Collection } = require('discord.js');
const { modulleriYukle } = require('../src/index');
const db = require('../src/core/db');
const oyuncu = require('../src/core/oyuncu');
const util = require('../src/core/util');
const sorgu = require('../src/core/sorgu');

let gecen = 0;
const test = async (ad, fn) => { try { await fn(); gecen++; console.log('  ✓', ad); } catch (e) { console.error('  ✗', ad, '\n', e); process.exitCode = 1; } };
const G = 'g1';

// Komutları gerçek Discord olmadan çalıştırmak için sahte etkileşim
function sahte(komut, { alt = null, secenek = {}, user = 'u1', voice = null } = {}) {
  const yanitlar = [];
  const al = (ad) => secenek[ad] ?? null;
  const kullanici = (id) => ({ id, username: `kullanici_${id}`, tag: `kullanici_${id}`, bot: false, displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png', toString: () => `<@${id}>` });
  const i = {
    commandName: komut, id: String(Math.random()).slice(2), guild: { id: G, name: 'Test', channels: { cache: new Map() }, roles: { cache: new Map() }, members: { fetch: async () => null, cache: new Map() } },
    user: kullanici(user), channel: { id: 'c1', send: async (p) => { yanitlar.push(p); return { id: 'm' }; }, isTextBased: () => true }, channelId: 'c1',
    member: { voice: { channel: voice }, roles: { cache: new Map() } }, memberPermissions: { has: () => true }, client: { ws: { ping: 42 }, uptime: 1000, user: { id: 'bot' } },
    replied: false, deferred: false, yanitlar,
    options: { getSubcommand: () => alt, getString: al, getInteger: al, getBoolean: al, getUser: (ad) => (secenek[ad] ? kullanici(secenek[ad]) : null), getMember: al, getRole: al, getChannel: al, getFocused: () => '' },
    reply: async (p) => { i.replied = true; yanitlar.push(p); }, editReply: async (p) => { yanitlar.push(p); return { id: 'm' }; }, followUp: async (p) => { yanitlar.push(p); },
    deferReply: async () => { i.deferred = true; }, fetchReply: async () => ({ id: 'm' + i.id }), update: async (p) => { yanitlar.push(p); }, deferUpdate: async () => {},
  };
  return i;
}
const metin = (i) => i.yanitlar.map((p) => JSON.stringify(p.embeds?.map((e) => e.toJSON?.() ?? e) ?? p.content ?? p)).join(' ');
const hataMi = (i) => i.yanitlar.some((p) => p.flags === MessageFlags.Ephemeral && JSON.stringify(p.embeds?.[0]?.toJSON?.() ?? '').includes('❌'));

(async () => {
  const y = modulleriYukle();
  const ctx = { ...y, db, client: {} };
  const kos = async (komut, ayar) => { const i = sahte(komut, ayar); await y.komutlar.get(komut).calistir(i, ctx); return i; };

  console.log('Yapı');
  await test('tüm komutlar Discord şemasına uygun ve 100 sınırının altında', () => {
    const veri = [...y.komutlar.values()].map((k) => k.data.toJSON());
    assert.ok(veri.length > 50 && veri.length <= 100);
    for (const k of veri) assert.ok(k.description.length <= 100, k.name);
  });
  await test('yardım menüsündeki her komut gerçekten var ve her komut menüde', () => {
    const { KATEGORILER } = require('../src/modules/genel');
    const listede = Object.values(KATEGORILER).flat();
    for (const ad of listede) assert.ok(y.komutlar.has(ad), `yardımda olup olmayan komut: ${ad}`);
    for (const ad of y.komutlar.keys()) assert.ok(listede.includes(ad), `yardımda eksik: ${ad}`);
  });

  console.log('Çekirdek');
  await test('süre çözümleme', () => {
    assert.equal(util.sureCoz('10dk'), 600000); assert.equal(util.sureCoz('2s'), 7200000); assert.equal(util.sureCoz('1g'), 86400000);
    assert.equal(util.sureCoz('1h30m'), 5400000); assert.equal(util.sureCoz('abc'), null); assert.equal(util.sureCoz('5 elma'), null);
  });
  await test('seviye hesabı', () => {
    assert.deepEqual(oyuncu.seviyeHesapla(0), { seviye: 0, kalan: 0, gereken: 100 });
    assert.equal(oyuncu.seviyeHesapla(100).seviye, 1); assert.equal(oyuncu.seviyeHesapla(99).seviye, 0);
  });
  await test('xp ekleme seviye atlatır ve ödül verir', async () => {
    await oyuncu.xpEkle({ id: G, channels: { cache: new Map() }, members: { fetch: async () => null } }, 'xp1', 300);
    const u = db.uye(G, 'xp1'); assert.equal(u.seviye, 2); assert.equal(u.para, 100); // ödül = ulaşılan seviye × 50
  });
  await test('günlük görevler belirlenimci ve 3 farklı görev', () => {
    const a = oyuncu.gununGorevleri('123', '2026-01-01');
    assert.deepEqual(a, oyuncu.gununGorevleri('123', '2026-01-01')); assert.equal(new Set(a).size, 3);
  });
  await test('görev tamamlanınca ödül bir kez verilir', async () => {
    const guild = { id: G, channels: { cache: new Map() }, members: { fetch: async () => null } };
    const [ilk] = oyuncu.gununGorevleri('q1'); const hedef = oyuncu.GOREVLER[ilk][2], odul = oyuncu.GOREVLER[ilk][3];
    for (let n = 0; n < hedef + 5; n++) await oyuncu.gorevIlerle(guild, 'q1', ilk, 1);
    assert.equal(db.uye(G, 'q1').para, odul); assert.deepEqual(oyuncu.gorevDurum(G, 'q1').biten, [ilk]);
  });
  await test('belge deposu', () => {
    const id = db.belge.ekle(G, 'deneme', { a: 1 }, 'r1');
    assert.equal(db.belge.al(id).a, 1); assert.equal(db.belge.ref('deneme', 'r1').id, id);
    db.belge.yaz(id, { ...db.belge.al(id), a: 2 }); assert.equal(db.belge.al(id).a, 2); assert.equal(db.belge.al(id).ref, 'r1');
    db.belge.sil(id); assert.equal(db.belge.al(id), null);
  });

  console.log('Oyun mantığı');
  await test('takım dengeleme en küçük farkı bulur', () => {
    const guc = { a: 2000, b: 1900, c: 1200, d: 1100, e: 1000, f: 900 };
    const d = require('../src/modules/mac').dengele(Object.keys(guc), (x) => guc[x]);
    assert.equal(d.a.length, 3); assert.equal(d.b.length, 3); assert.equal(d.fark, 100);
  });
  await test('elo: zayıf takım kazanınca daha çok puan', () => {
    const { eloFark } = require('../src/modules/mac');
    assert.equal(eloFark(1000, 1000), 16); assert.ok(eloFark(900, 1300) > eloFark(1300, 900));
  });
  await test('turnuva fikstürü: 5 kişi, baylar ve şampiyona kadar ilerleme', () => {
    const { fiksturKur, kazananYaz, aktifMac } = require('../src/modules/turnuva');
    const t = fiksturKur(['1', '2', '3', '4', '5']);
    assert.equal(t.length, 3); assert.equal(t[0].filter((m) => m.b === null).length, 3);
    let tur = 0;
    while (tur++ < 10) { const bekleyen = ['1', '2', '3', '4', '5'].map((id) => [id, aktifMac(t, id)]).find(([, m]) => m); if (!bekleyen) break; kazananYaz(t, bekleyen[1].tur, bekleyen[1].k, bekleyen[0]); }
    assert.ok(t[2][0].kazanan); assert.equal(t.flat().filter((m) => m.a && m.b && !m.kazanan).length, 0);
  });
  await test('tahmin borsası havuzu oranla dağıtır, kimse bilemezse iade eder', () => {
    const { dagit } = require('../src/modules/tahmin');
    const t = { bahis: { x: { s: 0, m: 100 }, y: { s: 0, m: 300 }, z: { s: 1, m: 400 } } };
    assert.deepEqual(dagit(t, 0), { x: 200, y: 600 }); assert.deepEqual(dagit(t, 2), { x: 100, y: 300, z: 400 });
  });
  await test('blackjack el değeri (as 1/11)', () => {
    const { elDeger } = require('../src/modules/ekonomi');
    assert.equal(elDeger([{ d: 'A' }, { d: 'K' }]), 21); assert.equal(elDeger([{ d: 'A' }, { d: 'A' }, { d: '9' }]), 21); assert.equal(elDeger([{ d: 'K' }, { d: 'Q' }, { d: '5' }]), 25);
  });
  await test('otomod ihlalleri yakalar', () => {
    const { ihlalBul } = require('../src/modules/otomod');
    const m = (content, n = 0) => ({ content, guild: { id: 'om' }, author: { id: 'a' + Math.random() }, mentions: { users: { size: n } } });
    const a = { davet: true, link: false, etiket: true, kufur: true, buyukharf: true, spam: true };
    db.ayarYaz('om', 'otomod.kelimeler', ['salak']);
    assert.equal(ihlalBul(m('gel discord.gg/abc123'), a), 'Davet linki paylaşımı');
    assert.equal(ihlalBul(m('sen bir s4l4k'), a), 'Yasaklı kelime');
    assert.equal(ihlalBul(m('BU MESAJ TAMAMEN BÜYÜK HARF'), a), 'Aşırı büyük harf');
    assert.equal(ihlalBul(m('selam', 7), a), 'Toplu etiketleme');
    assert.equal(ihlalBul(m('normal bir mesaj, salaklık yok'), a), null);
    const spamci = { content: 'x', guild: { id: 'om' }, author: { id: 'spam' }, mentions: { users: { size: 0 } } };
    let son; for (let n = 0; n < 6; n++) son = ihlalBul(spamci, a);
    assert.equal(son, 'Spam (çok hızlı mesaj)');
  });
  await test('FACEIT seviye ilerlemesi', () => {
    const { sonrakiSeviye } = require('../src/modules/faceit');
    assert.match(sonrakiSeviye(1100, 5), /\*\*101\*\* ELO/); assert.match(sonrakiSeviye(2500, 10), /Zirve/);
  });

  console.log('Komutlar (sahte etkileşimle)');
  await test('/günlük ilk seferde öder, ikincide reddeder', async () => {
    const i1 = await kos('günlük', { user: 'e1' }); const ilk = db.uye(G, 'e1').para;
    assert.ok(ilk === 200 || ilk === 300, String(ilk)); assert.ok(!hataMi(i1)); // 300: "günlük al" görevi o güne denk geldiyse
    assert.ok(hataMi(await kos('günlük', { user: 'e1' }))); assert.equal(db.uye(G, 'e1').para, ilk);
  });
  await test('/gönder bakiyeyi taşır, yetersiz bakiyede reddeder', async () => {
    const once = db.uye(G, 'e1').para;
    await kos('gönder', { user: 'e1', secenek: { üye: 'e2', miktar: 50 } });
    assert.equal(db.uye(G, 'e1').para, once - 50); assert.equal(db.uye(G, 'e2').para, 50);
    assert.ok(hataMi(await kos('gönder', { user: 'e2', secenek: { üye: 'e1', miktar: 5000 } })));
  });
  await test('/kumar slot ve yazıtura para üretmez/kaybetmez (muhasebe tutarlı)', async () => {
    db.arttir(G, 'k1', 'para', 100000);
    for (let n = 0; n < 200; n++) { await kos('kumar', { alt: 'slot', user: 'k1', secenek: { bahis: 100 } }); await kos('kumar', { alt: 'yazıtura', user: 'k1', secenek: { bahis: 100, seçim: 'yazi' } }); }
    const p = db.uye(G, 'k1').para; assert.ok(Number.isInteger(p) && p > 20000 && p < 250000, String(p));
  });
  await test('blackjack: el oynanır ve masa kapanır', async () => {
    db.arttir(G, 'bj', 'para', 1000);
    const i = await kos('kumar', { alt: 'blackjack', user: 'bj', secenek: { bahis: 100 } });
    const b = sahte('x', { user: 'bj' }); b.customId = 'bj:dur:bj';
    await y.bilesenler.get('bj')(b, ['dur', 'bj'], ctx);
    assert.ok([900, 1000, 1100, 1150, 1250, 1300].includes(db.uye(G, 'bj').para), String(db.uye(G, 'bj').para)); // +150: "oyun kazan" görevi assert.ok(i.yanitlar.length);
  });
  await test('bilgi komutları hatasız yanıt verir', async () => {
    for (const [k, a] of [['bakiye'], ['seviye'], ['profil'], ['sıralama', { secenek: { tür: 'para' } }], ['görevler'], ['başarımlar'], ['nabız'], ['yardım'], ['ping'], ['kamp', { alt: 'durum' }], ['klan', { alt: 'sıralama' }], ['ödül', { alt: 'liste' }], ['market', { alt: 'liste' }], ['faceit', { alt: 'sıralama' }], ['otomod', { alt: 'durum' }], ['davetler'], ['maç', { alt: 'geçmiş' }]]) {
      const i = await kos(k, a); assert.ok(i.yanitlar.length === 1 && !hataMi(i), k);
    }
  });
  await test('klan kur → bağış → ayrıl (dağıt) akışı', async () => {
    db.arttir(G, 'kl', 'para', 3000);
    await kos('klan', { alt: 'kur', user: 'kl', secenek: { ad: 'Kurtlar', etiket: 'krt' } });
    assert.equal(db.belge.liste(G, 'klan')[0].etiket, 'KRT'); assert.equal(db.uye(G, 'kl').para, 500);
    await kos('klan', { alt: 'bağış', user: 'kl', secenek: { miktar: 200 } });
    await kos('klan', { alt: 'ayrıl', user: 'kl' });
    assert.equal(db.belge.liste(G, 'klan').length, 0); assert.equal(db.uye(G, 'kl').para, 500); assert.equal(db.uye(G, 'kl').veri.klan, undefined);
  });
  await test('maç: 1v1 lobi → veto → sonuç, ELO ve geçmiş yazılır', async () => {
    const mac = y.bilesenler.get('mac');
    const i = await kos('maç', { alt: 'oluştur', user: 'm1', secenek: { boyut: 1, oyun: 'cs2', takımlar: 'rastgele' } });
    const id = String(db.belge.liste(G, 'mac')[0].id);
    const bas = async (user, islem, arg) => { const b = sahte('x', { user }); b.channel.parentId = null; b.guild.channels.create = async () => { throw new Error('yok'); }; await mac(b, [islem, id, arg], ctx); return b; };
    await bas('m2', 'katil');
    let m = db.belge.al(id); assert.equal(m.asama, 'veto');
    for (let n = 0; n < 6; n++) { m = db.belge.al(id); const kaptan = m.sira === 'a' ? m.a[0] : m.b[0]; await bas(kaptan, 'veto', m.haritalar.find((h) => !m.yasak.includes(h))); }
    m = db.belge.al(id); assert.equal(m.asama, 'oyun'); assert.equal(m.harita, 'Train');
    await bas('m1', 'sonuc', 'a');
    assert.equal(db.belge.al(id), null);
    const [k, kb] = [m.a[0], m.b[0]]; assert.equal(db.uye(G, k).elo, 1016); assert.equal(db.uye(G, kb).elo, 984);
    assert.equal(db.belge.liste(G, 'macGecmis').length, 1); assert.ok(i.yanitlar.length);
  });

  console.log('Görseller');
  const png = (ek) => { const b = ek.attachment; assert.ok(Buffer.isBuffer(b) && b.length > 5000 && b.subarray(1, 4).toString() === 'PNG', 'geçerli PNG değil'); };
  await test('/profil ve /sıralama resim kartı + buton/menü üretir', async () => {
    db.arttir(G, 'u1', 'xp', 5000);
    const p = await kos('profil'); png(p.yanitlar[0].files[0]); assert.equal(p.yanitlar[0].components[0].components.length, 3);
    const s = await kos('sıralama', { secenek: { tür: 'xp' } }); png(s.yanitlar[0].files[0]); assert.equal(s.yanitlar[0].components[0].components[0].options.length, 7);
  });
  await test('FACEIT maç verisi skor tablosuna dönüşür ve çizilir', () => {
    const o = (id, ad, k, d) => ({ player_id: id, nickname: ad, player_stats: { Kills: String(k), Deaths: String(d), Assists: '4', 'K/D Ratio': (k / d).toFixed(2), ADR: '81.3', 'Headshots %': '44', MVPs: '2', 'Penta Kills': id === 'p1' ? '1' : '0' } });
    const v = { rounds: [{ round_stats: { Map: 'de_mirage', Rounds: '24', Winner: 't1' }, teams: [
      { team_id: 't1', team_stats: { Team: 'team_a', 'Final Score': '13', 'Team Win': '1' }, players: [o('p2', 'iki', 10, 15), o('p1', 'bir', 25, 12)] },
      { team_id: 't2', team_stats: { Team: 'team_b', 'Final Score': '11', 'Team Win': '0' }, players: [o('p3', 'uc', 18, 17)] }] }] };
    const m = require('../src/modules/faceit').skorModel(v, new Map([['p1', '@Kadir']]));
    assert.equal(m.harita, 'Mirage'); assert.deepEqual([m.takimlar[0].skor, m.takimlar[1].skor], [13, 11]); assert.ok(m.takimlar[0].kazandi && !m.takimlar[1].kazandi);
    assert.equal(m.takimlar[0].oyuncular[0].ad, 'bir', 'öldürmeye göre sıralı'); assert.ok(m.takimlar[0].oyuncular[0].vurgu); assert.equal(m.takimlar[0].oyuncular[0].etiket, '@Kadir'); assert.equal(m.takimlar[0].oyuncular[0].ace, 1);
    png(require('../src/core/cizim').skorTablosu(m)); assert.equal(require('../src/modules/faceit').skorModel({}), null);
  });
  await test('kamp, müzik, karne ve afiş kartları çizilir (emoji/uzun ad dahil)', async () => {
    const c = require('../src/core/cizim');
    const uyeler = Array.from({ length: 15 }, (_, n) => ({ id: String(n), ad: n ? `Üye ${n}` : '🔥 Çok Uzun Bir Kullanıcı Adı Şğüöçİ 🔥', avatar: null, renk: null }));
    png(await c.kampKart({ kanal: 'Ateş', sunucu: 'Test', uyeler, ates: { yakit: 80, seri: 3 }, muzik: 'Şarkı' }));
    png(await c.kampKart({ kanal: 'Ateş', sunucu: 'Test', uyeler: [], ates: { yakit: 0, seri: 0 } }));
    png(await c.muzikKart({ baslik: 'Bir şarkı', kanal: 'Sanatçı', sure: 200, isteyen: 'x', sira: 2 }));
    png(await c.bannerKart({ ust: 'HOŞ GELDİN', baslik: '😀', alt: 'alt', ad: '😀' })); png(c.yardimKart(11, 61));
  });
  await test('müzik: ses kanalında değilken reddeder, radyo listesi menüye sığar', async () => {
    assert.ok(hataMi(await kos('müzik', { alt: 'geç' })));
    const { RADYOLAR, radyoMenu } = require('../src/modules/muzik');
    assert.ok(Object.keys(RADYOLAR).length <= 13); assert.equal(radyoMenu(G).components[0].options.length, Object.keys(RADYOLAR).length);
    for (const [, url] of Object.values(RADYOLAR)) assert.match(url, /^https:\/\//);
  });

  console.log('Sunucu sorguları (yerel sahte sunucularla)');
  await test('Source A2S_INFO (challenge dahil)', async () => {
    const s = dgram.createSocket('udp4');
    s.on('message', (b, r) => {
      if (b.length < 29) return s.send(Buffer.from([0xff, 0xff, 0xff, 0xff, 0x41, 1, 2, 3, 4]), r.port, r.address);
      assert.deepEqual([...b.subarray(-4)], [1, 2, 3, 4]);
      s.send(Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x49, 17]), Buffer.from('Test Sunucusu\0de_mirage\0csgo\0Counter-Strike 2\0'), Buffer.from([0xda, 0x02, 7, 10, 1, 0x64, 0x6c, 1, 1])]), r.port, r.address);
    });
    await new Promise((r) => s.bind(0, '127.0.0.1', r));
    const v = await sorgu.source(`127.0.0.1:${s.address().port}`); s.close();
    assert.deepEqual([v.ad, v.harita, v.oyuncu, v.max, v.bot, v.sifreli], ['Test Sunucusu', 'de_mirage', 7, 10, 1, true]);
  });
  await test('Minecraft sunucu listesi pingi', async () => {
    const vi = (n) => { const d = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; d.push(b); } while (n); return Buffer.from(d); };
    const srv = net.createServer((c) => c.once('data', () => { const j = Buffer.from(JSON.stringify({ version: { name: '1.21.1' }, players: { online: 3, max: 20, sample: [{ name: 'Steve' }] }, description: { text: '§aHoş ', extra: [{ text: 'geldin' }] } })); const g = Buffer.concat([vi(0), vi(j.length), j]); c.write(Buffer.concat([vi(g.length), g])); }));
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const v = await sorgu.minecraft(`127.0.0.1:${srv.address().port}`); srv.close();
    assert.deepEqual([v.ad, v.surum, v.oyuncu, v.max, v.liste], ['Hoş geldin', '1.21.1', 3, 20, ['Steve']]);
  });
  await test('özel ağ adresleri sorgulanamaz', () => {
    delete process.env.SORGU_OZEL_IZIN;
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1']) assert.ok(sorgu.ozelMi(ip), ip);
    assert.ok(!sorgu.ozelMi('8.8.8.8')); process.env.SORGU_OZEL_IZIN = '1';
  });

  console.log('Kamp ateşi');
  await test('web sunucusu: imzasız bağlantı reddedilir, imzalı bağlantı durumu alır, ifade yayınlanır', async () => {
    const kamp = require('../src/modules/kamp');
    const { sunucuBaslat } = require('../src/web/server');
    const { WebSocket } = require('ws');
    const uye = (id) => ({ id, displayName: 'Uye' + id, displayHexColor: '#000000', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png', user: { bot: false }, voice: {} });
    const botUye = { ...uye('99'), user: { bot: true } };
    const kanal = { name: 'Ateş', isVoiceBased: () => true, members: new Collection([['7', uye('7')], ['8', uye('8')], ['99', botUye]]) };
    const guild = { id: G, name: 'Test', channels: { cache: new Map([['55', kanal]]) }, members: { fetch: async () => null } };
    const web = await sunucuBaslat({ port: 0, saglayici: { dogrula: kamp.dogrula, durum: kamp.durum, eylem: (g, c, u, m) => kamp.ifade(g, c, u, String(m.ad)) } });
    kamp._kur({ guilds: { cache: new Map([[G, guild]]) } }, web);
    const ac = (u, k) => new Promise((res) => { const ws = new WebSocket(`ws://127.0.0.1:${web.port}/ws?g=${G}&c=55&u=${u}&k=${k}`); const gelen = []; ws.on('message', (d) => gelen.push(JSON.parse(d))); ws.on('open', () => setTimeout(() => res({ ws, gelen }), 100)); ws.on('error', () => res(null)); });
    assert.equal(await ac('7', 'yanlis'), null);
    assert.equal(await ac('8', kamp.imza(G, '55', '7')), null, 'başkasının imzasıyla girilemez');
    const a = await ac('7', kamp.imza(G, '55', '7'));
    assert.equal(a.gelen[0].t, 'durum'); assert.equal(a.gelen[0].uyeler.length, 2, 'botlar ateş başına oturmaz'); assert.equal(a.gelen[0].ben, '7');
    const once = kamp.ates(G).yakit;
    a.ws.send(JSON.stringify({ t: 'ifade', ad: 'odun' })); await new Promise((r) => setTimeout(r, 150));
    assert.ok(a.gelen.some((m) => m.t === 'ifade' && m.ad === 'odun' && m.id === '7')); assert.ok(kamp.ates(G).yakit > once + 5);
    a.ws.send(JSON.stringify({ t: 'ifade', ad: 'odun' })); await new Promise((r) => setTimeout(r, 100));
    assert.ok(a.gelen.some((m) => m.t === 'hata'), 'bekleme süresi uygulanır');
    const sayfa = await fetch(`http://127.0.0.1:${web.port}/kamp/1/2`); assert.equal(sayfa.status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${web.port}/static/..%2fserver.js`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${web.port}/avatar?u=http://169.254.169.254/x.png`)).status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${web.port}/vendor/build/three.module.js`)).status, 200);
    // Otomatik kart: kanala giriş olayı, kanalın sohbetine resimli kart + butonlar gönderir
    const gonderilen = [];
    kanal.send = async (p) => { gonderilen.push(p); return { id: 'kart1' }; }; kanal.messages = { edit: async (id, p) => { gonderilen.push({ duzenle: id, ...p }); }, delete: async () => {} };
    const olay = y.olaylar.get('voiceStateUpdate').find((d) => d.modul === 'kamp').fn;
    await olay({ channelId: null, guild }, { channelId: '55', id: '7', guild, member: uye('7'), channel: kanal });
    await new Promise((r) => setTimeout(r, 2800));
    assert.equal(gonderilen.length, 1); assert.match(gonderilen[0].content, /<@7> ateş başına oturdu/); png(gonderilen[0].files[0]);
    assert.equal(gonderilen[0].components.length, 2); assert.equal(gonderilen[0].components[0].components[0].data.custom_id, 'kamp:link');
    await olay({ channelId: '55', guild }, { channelId: '55', id: '8', guild, member: uye('8'), channel: kanal }); // susturma vb. durum değişimi: yeni mesaj atmaz, düzenler
    await new Promise((r) => setTimeout(r, 2800));
    assert.equal(gonderilen.length, 2); assert.equal(gonderilen[1].duzenle, 'kart1');
    await web.kapat();
  });

  console.log(`\n${gecen} test geçti${process.exitCode ? ', BAZI TESTLER BAŞARISIZ' : ''}`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
