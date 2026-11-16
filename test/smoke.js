// Discord'a bağlanmadan çalışan testler (sahte sunucu, sahte Minecraft ve RCON sunucularıyla):  npm test
process.env.DB_PATH = ':memory:';
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const net = require('node:net');
const { MessageFlags, Collection, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const config = require('../src/core/config');
const { modulleriYukle } = require('../src/index');
const db = require('../src/core/db');
const oyuncu = require('../src/core/oyuncu');
const util = require('../src/core/util');
const sorgu = require('../src/core/sorgu');
const rcon = require('../src/core/rcon');
const cizim = require('../src/core/cizim');

let gecen = 0, sayac = 1000;
const test = async (ad, fn) => { try { await fn(); gecen++; console.log('  ✓', ad); } catch (e) { console.error('  ✗', ad, '\n', e); process.exitCode = 1; } };
const png = (ek) => { const b = ek.attachment ?? ek; assert.ok(Buffer.isBuffer(b) && b.length > 3000 && b.subarray(1, 4).toString() === 'PNG', 'geçerli PNG değil'); };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Sahte Discord ----------
function sahteKanal(guild, veri) {
  const k = { id: String(++sayac), name: veri.name, type: veri.type ?? ChannelType.GuildText, parentId: veri.parent || null, guild, userLimit: veri.userLimit || 0, gonderilen: [], silindi: false, members: new Collection(),
    children: { cache: { get size() { return guild.channels.cache.filter((c) => c.parentId === k.id).size; } } },
    permissionOverwrites: { cache: new Collection(),
      edit: async (hedef, izin) => { const id = hedef.id || hedef, o = k.permissionOverwrites.cache.get(id) || { izin: {} }; Object.assign(o.izin, izin); for (const [ad, v] of Object.entries(izin)) if (v === null) delete o.izin[ad]; o.deny = { has: (f) => Object.entries(o.izin).some(([ad, v]) => v === false && P[ad] === f) }; k.permissionOverwrites.cache.set(id, o); },
      delete: async (id) => { k.permissionOverwrites.cache.delete(id); } },
    isVoiceBased: () => k.type === ChannelType.GuildVoice, isTextBased: () => true,
    send: async (p) => { const m = { id: String(++sayac), ...p }; k.gonderilen.push(m); return m; },
    messages: { edit: async (id, p) => { k.gonderilen.push({ duzenle: id, ...p }); }, delete: async () => {}, fetch: async () => new Collection() },
    setName: async (n) => { k.name = n; }, setUserLimit: async (n) => { k.userLimit = n; }, setRateLimitPerUser: async () => {},
    delete: async () => { k.silindi = true; guild.channels.cache.delete(k.id); }, toString: () => `<#${k.id}>` };
  for (const o of veri.permissionOverwrites || []) { assert.ok(o.type !== undefined || o.id === guild.id, 'izin türü belirtilmeli'); k.permissionOverwrites.cache.set(o.id, { izin: {}, deny: { has: (f) => (o.deny || []).includes(f) } }); }
  guild.channels.cache.set(k.id, k);
  return k;
}
function sahteSunucu(id = 'g1') {
  const g = { id, name: 'Test Sunucusu', memberCount: 42, afkChannelId: null, ownerId: 'sahip', iconURL: () => null, premiumTier: 0, createdTimestamp: Date.now(), voiceStates: { cache: new Collection() },
    roles: { cache: new Collection() }, channels: { cache: new Collection() }, members: { cache: new Collection() }, client: null };
  g.roles.create = async (v) => { const r = { id: String(++sayac), name: v.name, position: 1, managed: false, editable: true, permissions: { has: () => false }, toString: () => `<@&${r.id}>` }; g.roles.cache.set(r.id, r); return r; };
  g.roles.everyone = { id };
  g.channels.create = async (v) => sahteKanal(g, v);
  g.members.fetch = async (a) => (typeof a === 'string' ? g.members.cache.get(a) ?? null : new Collection([...g.members.cache].filter(([k]) => !a?.user || a.user.includes(k))));
  g.members.me = sahteUye(g, 'bot', { yetkili: true, bot: true });
  g.members.me.roles.highest = { position: 100 };
  return g;
}
function sahteUye(guild, id, { yetkili = false, bot = false } = {}) {
  const user = { id, bot, username: `kullanici_${id}`, tag: `kullanici_${id}`, createdTimestamp: Date.now() - 1e10, displayAvatarURL: () => null, toString: () => `<@${id}>`, send: async (p) => { m.dm.push(p); } };
  const m = { id, user, guild, displayName: `Üye ${id}`, displayHexColor: '#000000', joinedTimestamp: Date.now(), dm: [], displayAvatarURL: () => null, toString: () => `<@${id}>`, send: user.send,
    permissions: { has: () => yetkili }, roles: { cache: new Collection(), highest: { position: 1 }, add: async (r) => { for (const x of [].concat(r)) m.roles.cache.set(x.id || x, true); }, remove: async (r) => { for (const x of [].concat(r)) m.roles.cache.delete(x.id || x); } },
    voice: { channelId: null, get channel() { return guild.channels.cache.get(m.voice.channelId) || null; },
      setChannel: async (k) => { guild.channels.cache.get(m.voice.channelId)?.members.delete(id); m.voice.channelId = k.id; k.members.set(id, m); },
      disconnect: async () => { guild.channels.cache.get(m.voice.channelId)?.members.delete(id); m.voice.channelId = null; } } };
  guild.members.cache.set(id, m);
  return m;
}
function etkilesim(guild, member, { komut = null, alt = null, secenek = {}, kanal = null, degerler = null, alanlar = null, tur = 'komut' } = {}) {
  const yanitlar = [], al = (ad) => secenek[ad] ?? null;
  const i = { commandName: komut, id: String(++sayac), guild, member, user: member.user, channel: kanal, channelId: kanal?.id ?? 'yok', yanitlar, replied: false, deferred: false, modal: null, values: degerler, message: { embeds: [] },
    client: { ws: { ping: 42 }, uptime: 1000, user: { id: 'bot' }, users: { fetch: async (id) => guild.members.cache.get(id)?.user ?? null }, channels: guild.channels },
    memberPermissions: { has: () => member.permissions.has() }, members: degerler ? new Collection(degerler.map((d) => [d, guild.members.cache.get(d)])) : null,
    fields: { getTextInputValue: (ad) => alanlar?.[ad] ?? '' },
    isModalSubmit: () => tur === 'modal', isUserSelectMenu: () => tur === 'uyesec', isMessageComponent: () => tur !== 'komut' && tur !== 'modal',
    options: { getSubcommand: () => alt, getString: al, getInteger: al, getBoolean: al, getUser: (ad) => (secenek[ad] ? guild.members.cache.get(secenek[ad])?.user ?? sahteUye(guild, secenek[ad]).user : null), getMember: (ad) => guild.members.cache.get(secenek[ad]) ?? null, getRole: al, getChannel: al, getFocused: () => '' },
    reply: async (p) => { i.replied = true; yanitlar.push(p); }, editReply: async (p) => { yanitlar.push(p); return { id: 'm' + i.id }; }, followUp: async (p) => { yanitlar.push(p); },
    deferReply: async () => { i.deferred = true; }, fetchReply: async () => ({ id: 'm' + i.id }), update: async (p) => { yanitlar.push(p); }, deferUpdate: async () => { i.deferred = true; }, showModal: async (m) => { i.modal = m; } };
  return i;
}
const duzMetin = (i) => JSON.stringify(i.yanitlar.map((p) => (typeof p === 'string' ? p : [p.content, ...(p.embeds || []).map((e) => e.toJSON?.() ?? e)])));
const hataMi = (i) => i.yanitlar.some((p) => p.flags === MessageFlags.Ephemeral && JSON.stringify(p.embeds?.[0]?.toJSON?.() ?? '').includes('❌'));

(async () => {
  const y = modulleriYukle();
  const guild = sahteSunucu(), G = guild.id;
  const ctx = { ...y, db, config, client: { guilds: { cache: new Collection([[G, guild]]) }, channels: guild.channels, user: { setActivity: () => {} } } };
  const kos = async (komut, uye, ayar = {}) => { const i = etkilesim(guild, uye, { komut, ...ayar }); await y.komutlar.get(komut).calistir(i, ctx); return i; };
  const bas = async (onek, arg, uye, ayar = {}) => { const i = etkilesim(guild, uye, { tur: 'buton', ...ayar }); await y.bilesenler.get(onek)(i, arg, ctx); return i; };
  const olay = (ad, modul) => y.olaylar.get(ad).find((d) => d.modul === modul).fn;
  const yonetici = sahteUye(guild, 'admin', { yetkili: true }), ali = sahteUye(guild, 'ali'), veli = sahteUye(guild, 'veli');

  console.log('Yapı');
  await test('tüm komutlar Discord şemasına uygun, yardım menüsü eksiksiz', () => {
    const veri = [...y.komutlar.values()].map((k) => k.data.toJSON());
    assert.ok(veri.length >= 50 && veri.length <= 100);
    const liste = Object.values(require('../src/modules/genel').KATEGORILER).flat();
    for (const ad of liste) assert.ok(y.komutlar.has(ad), `yardımda olup olmayan komut: ${ad}`);
    for (const ad of y.komutlar.keys()) assert.ok(liste.includes(ad), `yardımda eksik: ${ad}`);
  });
  await test('logo ve tüm kartlar çizilir (emoji ve uzun adlar dahil)', async () => {
    png(cizim.logoDosya(256));
    png(await cizim.sunucuKart({ ad: '🔥 Çok Uzun Bir Sunucu Adı Şğüöçİ', adres: 'play.x.com', motd: 'motd', oyuncu: 5, max: 100, surum: 'Paper 1.21', ping: 30, rekor: 9, liste: ['a', 'b'] }));
    png(await cizim.sunucuKart({ ad: 'X', adres: 'play.x.com', acik: false, sebep: 'Sunucu yanıt vermedi.' }));
    png(await cizim.odaKart({ ad: 'oda', sahip: '😀', kisi: 2, limit: 5, kilitli: true, gizli: true }));
    png(await cizim.muzikKart({ baslik: 'Şarkı', kanal: 'Sanatçı', sure: 200, isteyen: 'x', sira: 2 }));
    png(await cizim.bannerKart({ ust: 'DUYURU', baslik: 'Başlık', alt: 'alt', logo: true })); png(cizim.yardimKart('Sunucu', 9, 61));
  });

  console.log('Kurulum');
  await test('/kurulum roller, kategoriler, kanallar ve panelleri kurar; ikinci kez çalışınca tekrar oluşturmaz', async () => {
    const i = await kos('kurulum', yonetici, { secenek: { ad: 'Örnek Craft' } });
    assert.ok(!hataMi(i)); png(i.yanitlar[0].files[0]);
    for (const a of ['kanal.kurallar', 'kanal.duyuru', 'kanal.durum', 'kanal.hosgeldin', 'kanal.log', 'kanal.basvuru', 'kanal.destek', 'kanal.seviye', 'ses.olustur', 'kategori.ticket']) assert.ok(guild.channels.cache.has(db.ayar(G, a)), a);
    for (const a of ['rol.oyuncu', 'rol.uye', 'rol.destek', 'rol.jail']) assert.ok(guild.roles.cache.has(db.ayar(G, a)), a);
    assert.equal(Object.keys(db.ayar(G, 'seviyeRolleri')).length, 6);
    const panel = (a) => guild.channels.cache.get(db.ayar(G, a)).gonderilen;
    assert.equal(panel('kanal.kurallar').length, 1); assert.equal(panel('kanal.destek')[0].components[0].components[0].options.length, 5); assert.equal(panel('kanal.basvuruPanel').length, 1);
    const kanalSayisi = guild.channels.cache.size, rolSayisi = guild.roles.cache.size;
    await kos('kurulum', yonetici);
    assert.equal(guild.channels.cache.size, kanalSayisi); assert.equal(guild.roles.cache.size, rolSayisi); assert.equal(panel('kanal.kurallar').length, 1);
  });
  await test('kuralları kabul et butonu Üye rolünü verir', async () => {
    await bas('kural', ['kabul'], ali);
    assert.ok(ali.roles.cache.has(db.ayar(G, 'rol.uye')));
  });

  console.log('Özel odalar');
  const olusturKanal = guild.channels.cache.get(db.ayar(G, 'ses.olustur'));
  const sesOlay = olay('voiceStateUpdate', 'sesoda');
  const gir = async (uye, kanal) => { const eskiId = uye.voice.channelId; guild.channels.cache.get(eskiId)?.members.delete(uye.id); uye.voice.channelId = kanal?.id ?? null; kanal?.members.set(uye.id, uye); await sesOlay({ id: uye.id, channelId: eskiId, channel: guild.channels.cache.get(eskiId), guild }, { id: uye.id, channelId: uye.voice.channelId, channel: kanal, member: uye, guild }); };
  let oda;
  await test('oluşturma kanalına giren üyeye oda açılır, taşınır ve resimli panel gönderilir', async () => {
    await gir(ali, olusturKanal);
    const kayit = db.belge.liste(G, 'oda'); assert.equal(kayit.length, 1);
    oda = guild.channels.cache.get(kayit[0].ref);
    assert.ok(oda && oda.type === ChannelType.GuildVoice); assert.equal(oda.parentId, olusturKanal.parentId); assert.equal(ali.voice.channelId, oda.id); assert.equal(kayit[0].sahip, 'ali');
    assert.equal(oda.gonderilen.length, 1); png(oda.gonderilen[0].files[0]); assert.equal(oda.gonderilen[0].components.length, 4); assert.ok(db.belge.al(kayit[0].id).panel);
    assert.equal(olusturKanal.members.size, 0, 'üye oluşturma kanalında kalmamalı');
  });
  await test('panel: kilitle, limit, isim, izin ver, at; sahibi olmayan yönetemez', async () => {
    await gir(veli, oda);
    assert.ok(hataMi(await bas('oda', ['kilit'], veli, { kanal: oda })), 'sahibi olmayan kilitleyemez');
    await bas('oda', ['kilit'], ali, { kanal: oda }); assert.ok(oda.permissionOverwrites.cache.get(G).deny.has(P.Connect));
    await bas('oda', ['kilit'], ali, { kanal: oda }); assert.ok(!oda.permissionOverwrites.cache.get(G).deny.has(P.Connect));
    const m = await bas('oda', ['limit'], ali, { kanal: oda }); assert.ok(m.modal, 'limit butonu form açar');
    await bas('oda', ['limit'], ali, { kanal: oda, tur: 'modal', alanlar: { deger: '4' } }); assert.equal(oda.userLimit, 4);
    await bas('oda', ['isim'], ali, { kanal: oda, tur: 'modal', alanlar: { deger: 'Elmas Madeni' } }); assert.equal(oda.name, '🔊 Elmas Madeni');
    const can = sahteUye(guild, 'can');
    await bas('oda', ['izin'], ali, { kanal: oda, tur: 'uyesec', degerler: ['can'] }); assert.equal(oda.permissionOverwrites.cache.get('can').izin.Connect, true);
    await bas('oda', ['at'], ali, { kanal: oda, tur: 'uyesec', degerler: ['veli'] }); assert.equal(veli.voice.channelId, null); assert.equal(oda.permissionOverwrites.cache.get('veli').izin.Connect, false);
  });
  await test('sahip çıkınca oda sıradaki kişiye geçer; oda boşalınca silinir', async () => {
    const can = guild.members.cache.get('can');
    await gir(can, oda); await gir(ali, null);
    assert.equal(db.belge.ref('oda', oda.id).sahip, 'can'); assert.ok(!oda.silindi);
    await gir(can, null);
    assert.ok(oda.silindi); assert.equal(db.belge.liste(G, 'oda').length, 0);
  });
  await test('bot yetkisi eksikse oda açılmaz, sebep kayıt kanalına yazılır', async () => {
    guild.members.me.permissions.has = (izin) => izin !== P.MoveMembers;
    sahteUye(guild, 'eda'); await bekle(1);
    await gir(guild.members.cache.get('eda'), olusturKanal);
    assert.equal(db.belge.liste(G, 'oda').length, 0);
    assert.match(JSON.stringify(guild.channels.cache.get(db.ayar(G, 'kanal.log')).gonderilen.at(-1).embeds[0].toJSON()), /Üyeleri Taşı/);
    guild.members.me.permissions.has = () => true;
  });

  console.log('Minecraft');
  const vi = (n) => { const d = []; do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; d.push(b); } while (n); return Buffer.from(d); };
  const javaSrv = net.createServer((c) => { c.on('error', () => {}); c.once('data', () => { const j = Buffer.from(JSON.stringify({ version: { name: 'Paper 1.21.4' }, players: { online: 37, max: 200, sample: [{ name: 'Steve' }, { name: '§cGeçersiz ad!' }] }, description: { text: '§aHoş ', extra: [{ text: 'geldin' }] } })); const g = Buffer.concat([vi(0), vi(j.length), j]); c.write(Buffer.concat([vi(g.length), g])); }); });
  await new Promise((r) => javaSrv.listen(0, '127.0.0.1', r));
  const javaAdres = `127.0.0.1:${javaSrv.address().port}`;
  await test('Java sunucu pingi', async () => {
    const v = await sorgu.java(javaAdres);
    assert.deepEqual([v.motd, v.surum, v.oyuncu, v.max, v.liste], ['Hoş geldin', 'Paper 1.21.4', 37, 200, ['Steve']]);
  });
  await test('Bedrock sunucu pingi', async () => {
    const s = dgram.createSocket('udp4');
    s.on('message', (b, r) => { const metin = Buffer.from('MCPE;§bBedrock Sunucu;712;1.21.50;12;60;123;Dünya;Survival;1;19132;19133;'); const bas = Buffer.alloc(35); bas[0] = 0x1c; bas.writeUInt16BE(metin.length, 33); s.send(Buffer.concat([bas, metin]), r.port, r.address); });
    await new Promise((r) => s.bind(0, '127.0.0.1', r));
    const v = await sorgu.bedrock(`127.0.0.1:${s.address().port}`); s.close();
    assert.deepEqual([v.surum, v.oyuncu, v.max], ['Bedrock 1.21.50', 12, 60]); assert.match(v.motd, /Bedrock Sunucu/);
  });
  await test('/mc ayarla + /sunucu durum kartı; kapalı sunucuda çevrimdışı kartı; rekor tutulur', async () => {
    assert.ok(hataMi(await kos('sunucu', ali)), 'adres yokken yönlendirir');
    await kos('mc', yonetici, { alt: 'ayarla', secenek: { adres: javaAdres, site: 'https://ornek.com' } });
    const i = await kos('sunucu', ali); png(i.yanitlar[0].files[0]); assert.equal(i.yanitlar[0].components[0].components.length, 3);
    assert.equal(db.ayar(G, 'mc.rekor'), 37);
    const d = await require('../src/modules/minecraft').durumAl(guild); assert.ok(d.acik && d.oyuncu === 37 && d.ad === 'Örnek Craft');
    assert.ok(hataMi(await kos('mc', yonetici, { alt: 'ayarla', secenek: { site: 'javascript:alert(1)' } })), 'https olmayan link reddedilir');
  });
  await test('canlı panel kurulur ve dakikalık güncellemede düzenlenir; kapanınca bildirim gider', async () => {
    const kanal = guild.channels.cache.get(db.ayar(G, 'kanal.durum'));
    await kos('mc', yonetici, { alt: 'panel', kanal });
    const panel = db.belge.liste(G, 'mcpanel')[0]; assert.ok(panel);
    const mc = require('../src/modules/minecraft');
    await mc.tik(ctx); await mc.tik(ctx);
    assert.ok(kanal.gonderilen.some((m) => m.duzenle === panel.mesaj));
    await new Promise((r) => javaSrv.close(r)); mc.onbellekSil(G);
    await mc.tik(ctx); await mc.tik(ctx);
    assert.ok(kanal.gonderilen.some((m) => /şu an kapalı/.test(JSON.stringify(m.embeds?.[0]?.toJSON?.() ?? ''))), 'kapandı bildirimi');
  });

  // Sahte RCON sunucusu
  const rconKomutlar = [];
  const paket = (id, tip, govde) => { const g = Buffer.from(govde), b = Buffer.alloc(14 + g.length); b.writeInt32LE(10 + g.length, 0); b.writeInt32LE(id, 4); b.writeInt32LE(tip, 8); g.copy(b, 12); return b; };
  const rconSrv = net.createServer((c) => { c.on('error', () => {}); c.on('data', (d) => { const id = d.readInt32LE(4), tip = d.readInt32LE(8), govde = d.toString('utf8', 12, d.length - 2); if (tip === 3) return c.write(paket(govde === 'gizli' ? id : -1, 2, '')); rconKomutlar.push(govde); c.write(paket(id, 0, `§aTamam: ${govde}`)); }); });
  await new Promise((r) => rconSrv.listen(0, '127.0.0.1', r));
  await test('RCON: komut çalışır, yanlış şifre ve ayarsız durum anlaşılır hata verir', async () => {
    const ayar = { host: '127.0.0.1', port: rconSrv.address().port, sifre: 'gizli' };
    assert.equal(await rcon.calistir('list', ayar), 'Tamam: list');
    await assert.rejects(rcon.calistir('list', { ...ayar, sifre: 'yanlis' }), /şifresi yanlış/);
    await assert.rejects(rcon.calistir('list', { host: '', sifre: '' }), /ayarlı değil/);
    for (const kotu of ['a b', 'x;op', 'ab', '../../x', 'ad\nop']) assert.ok(!rcon.nickGecerli(kotu), kotu);
    assert.ok(rcon.nickGecerli('Kadir_TR') && rcon.nickGecerli('.BedrockOyuncu'));
    Object.assign(config.rcon, ayar);
  });
  await test('başvuru: form → yetkili kanalı → onay: rol, hesap bağlama, whitelist komutu, özel mesaj', async () => {
    rconKomutlar.length = 0;
    const m = await bas('basvuru', ['ac'], veli); assert.ok(m.modal);
    assert.ok(hataMi(await bas('basvuru', ['gonder'], veli, { tur: 'modal', alanlar: { nick: 'kötü ad;', yas: '15', neden: 'x' } })), 'geçersiz ad reddedilir');
    await bas('basvuru', ['gonder'], veli, { tur: 'modal', alanlar: { nick: 'Veli_MC', yas: '16', neden: 'Arkadaşım önerdi' } });
    const kanal = guild.channels.cache.get(db.ayar(G, 'kanal.basvuru')), b = db.belge.liste(G, 'basvuru')[0];
    assert.equal(kanal.gonderilen.length, 1); assert.equal(b.durum, 'bekliyor');
    assert.ok(hataMi(await bas('basvuru', ['ac'], veli)), 'bekleyen başvuru varken ikinci açılmaz');
    assert.ok(hataMi(await bas('basvuru', ['onay', String(b.id)], ali)), 'yetkisiz üye onaylayamaz');
    const onay = await bas('basvuru', ['onay', String(b.id)], yonetici);
    assert.ok(veli.roles.cache.has(db.ayar(G, 'rol.oyuncu'))); assert.equal(db.uye(G, 'veli').mc_nick, 'Veli_MC');
    assert.deepEqual(rconKomutlar, ['whitelist add Veli_MC']); assert.equal(veli.dm.length, 1); assert.equal(db.belge.al(b.id).durum, 'onay');
    assert.match(duzMetin(onay), /Whitelist: Tamam/);
  });
  await test('market: konsol komutlu ürün oyun içinde teslim edilir; hesap bağlı değilse ya da para yoksa satılmaz', async () => {
    assert.ok(hataMi(await kos('market', yonetici, { alt: 'ekle', secenek: { fiyat: 100, ad: 'x', komut: 'give @a diamond 64' } })), '{oyuncu} zorunlu');
    await kos('market', yonetici, { alt: 'ekle', secenek: { fiyat: 100, ad: '5 Elmas', komut: '/give {oyuncu} diamond 5' } });
    const urun = db.ayar(G, 'market')[0];
    db.arttir(G, 'ali', 'para', 150); db.arttir(G, 'veli', 'para', 150 - db.uye(G, 'veli').para); // veli'nin bakiyesi tam 150 olsun
    assert.ok(hataMi(await kos('market', ali, { alt: 'al', secenek: { ürün: urun.id } })), 'hesap bağlı değil'); assert.ok(db.uye(G, 'ali').para >= 150, 'para kesilmedi');
    rconKomutlar.length = 0;
    await kos('market', veli, { alt: 'al', secenek: { ürün: urun.id } });
    assert.deepEqual(rconKomutlar, ['give Veli_MC diamond 5']); assert.equal(db.uye(G, 'veli').para, 50);
    assert.ok(hataMi(await kos('market', veli, { alt: 'al', secenek: { ürün: urun.id } })), 'para yetmez'); assert.equal(rconKomutlar.length, 1);
    await new Promise((r) => rconSrv.close(r));
    db.arttir(G, 'veli', 'para', 100);
    const i = await kos('market', veli, { alt: 'al', secenek: { ürün: urun.id } });
    assert.match(duzMetin(i), /iade edildi/); assert.equal(db.uye(G, 'veli').para, 150, 'teslim edilemeyince para iade');
  });
  await test('/hesap bağla: geçersiz ad ve başkasına bağlı ad reddedilir', async () => {
    assert.ok(hataMi(await kos('hesap', ali, { alt: 'bağla', secenek: { oyuncu: 'a b' } })));
    assert.ok(hataMi(await kos('hesap', ali, { alt: 'bağla', secenek: { oyuncu: 'veli_mc' } })), 'büyük/küçük harf fark etmez');
    await kos('hesap', ali, { alt: 'bağla', secenek: { oyuncu: 'Ali_MC' } }); assert.equal(db.uye(G, 'ali').mc_nick, 'Ali_MC');
  });

  console.log('Destek');
  await test('talep: konu seçilince özel kanal açılır, ikinci talep engellenir', async () => {
    const i = await bas('ticket', ['ac'], ali, { degerler: ['sikayet'] });
    const t = db.belge.liste(G, 'ticket')[0], kanal = guild.channels.cache.get(t.kanal);
    assert.ok(kanal && kanal.parentId === db.ayar(G, 'kategori.ticket')); assert.equal(t.konu, 'sikayet'); assert.match(kanal.name, /talep-0001/);
    assert.ok(kanal.permissionOverwrites.cache.get(G).deny.has(P.ViewChannel)); assert.equal(kanal.gonderilen.length, 1); assert.ok(!hataMi(i));
    assert.ok(hataMi(await bas('ticket', ['ac'], ali, { degerler: ['destek'] })));
  });

  console.log('Seviye ve ekonomi');
  await test('süre çözümleme ve seviye hesabı', () => {
    assert.equal(util.sureCoz('10dk'), 600000); assert.equal(util.sureCoz('1h30m'), 5400000); assert.equal(util.sureCoz('abc'), null);
    assert.equal(oyuncu.seviyeHesapla(100).seviye, 1); assert.equal(oyuncu.seviyeHesapla(99).seviye, 0);
  });
  await test('seviye atlayınca rütbe rolü verilir ve resimli duyuru gider', async () => {
    const seviyeKanal = guild.channels.cache.get(db.ayar(G, 'kanal.seviye'));
    await oyuncu.xpEkle(guild, 'ali', 2000);
    const u = db.uye(G, 'ali'); assert.ok(u.seviye >= 5);
    assert.ok(ali.roles.cache.has(db.ayar(G, 'seviyeRolleri')[5]), 'Odun rütbesi'); png(seviyeKanal.gonderilen.find((m) => m.files?.length).files[0]);
  });
  await test('/profil ve /sıralama resim kartı + buton/menü üretir', async () => {
    const p = await kos('profil', ali); png(p.yanitlar[0].files[0]); assert.equal(p.yanitlar[0].components[0].components.length, 3);
    const s = await kos('sıralama', ali, { secenek: { tür: 'xp' } }); png(s.yanitlar[0].files[0]); assert.equal(s.yanitlar[0].components[0].components[0].options.length, 5);
  });
  await test('/günlük bir kez öder; /gönder bakiyeyi taşır; görevler belirlenimci', async () => {
    const once = db.uye(G, 'ali').para;
    await kos('günlük', ali); const sonra = db.uye(G, 'ali').para; assert.ok(sonra >= once + 200);
    assert.ok(hataMi(await kos('günlük', ali))); assert.equal(db.uye(G, 'ali').para, sonra);
    const veliOnce = db.uye(G, 'veli').para;
    await kos('gönder', ali, { secenek: { üye: 'veli', miktar: 50 } }); assert.equal(db.uye(G, 'veli').para, veliOnce + 50);
    assert.deepEqual(oyuncu.gununGorevleri('1', '2026-01-01'), oyuncu.gununGorevleri('1', '2026-01-01')); assert.equal(new Set(oyuncu.gununGorevleri('1', '2026-01-01')).size, 3);
  });
  await test('kumar muhasebesi tutarlı; blackjack eli kapanır', async () => {
    db.arttir(G, 'can', 'para', 100000);
    const can = guild.members.cache.get('can');
    for (let n = 0; n < 150; n++) { await kos('kumar', can, { alt: 'slot', secenek: { bahis: 100 } }); await kos('kumar', can, { alt: 'yazıtura', secenek: { bahis: 100, seçim: 'yazi' } }); }
    const p = db.uye(G, 'can').para; assert.ok(Number.isInteger(p) && p > 30000 && p < 250000, String(p));
    await kos('kumar', can, { alt: 'blackjack', secenek: { bahis: 100 } });
    await bas('bj', ['dur', 'can'], can);
    assert.ok(hataMi(await kos('kumar', can, { alt: 'blackjack', secenek: { bahis: 10 ** 9 } })), 'el kapandı; yeni el açılabilir ama para yetmez');
    assert.equal(require('../src/modules/ekonomi').elDeger([{ d: 'A' }, { d: 'A' }, { d: '9' }]), 21);
  });
  await test('bilgi/topluluk komutları hatasız yanıt verir', async () => {
    for (const [k, a] of [['bakiye'], ['seviye'], ['görevler'], ['başarımlar'], ['nabız'], ['yardım'], ['ping'], ['ip'], ['skin', { secenek: { oyuncu: 'Notch' } }], ['sunucu-bilgi'], ['kullanıcı'], ['klan', { alt: 'sıralama' }], ['ödül', { alt: 'liste' }], ['market', { alt: 'liste' }], ['otomod', { alt: 'durum' }], ['davetler'], ['ayar', { alt: 'göster' }], ['hesap', { alt: 'bak' }]]) {
      const i = await kos(k, ali, a); assert.ok(i.yanitlar.length === 1 && !hataMi(i), k);
    }
  });
  await test('otomod ihlalleri yakalar', () => {
    const { ihlalBul } = require('../src/modules/otomod');
    const m = (content, n = 0) => ({ content, guild: { id: 'om' }, author: { id: 'a' + Math.random() }, mentions: { users: { size: n } } });
    const a = { davet: true, link: false, etiket: true, kufur: true, buyukharf: true, spam: true };
    db.ayarYaz('om', 'otomod.kelimeler', ['salak']);
    assert.equal(ihlalBul(m('gel discord.gg/abc123'), a), 'Davet linki paylaşımı'); assert.equal(ihlalBul(m('sen bir s4l4k'), a), 'Yasaklı kelime');
    assert.equal(ihlalBul(m('BU MESAJ TAMAMEN BÜYÜK HARF'), a), 'Aşırı büyük harf'); assert.equal(ihlalBul(m('selam', 7), a), 'Toplu etiketleme'); assert.equal(ihlalBul(m('normal mesaj'), a), null);
  });
  await test('müzik: ses kanalında değilken reddeder, radyo menüsü geçerli', async () => {
    assert.ok(hataMi(await kos('müzik', ali, { alt: 'geç' })));
    const { RADYOLAR, radyoMenu } = require('../src/modules/muzik');
    assert.equal(radyoMenu(G).components[0].options.length, Object.keys(RADYOLAR).length);
  });

  console.log(`\n${gecen} test geçti${process.exitCode ? ', BAZI TESTLER BAŞARISIZ' : ''}`);
  setTimeout(() => process.exit(process.exitCode || 0), 100);
})();
