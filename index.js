
// Paketler



const Discord = require("discord.js");
const client = new Discord.Client();
const config = require("./config.json");
var ffmpeg = require('ffmpeg-static');

// Değişen Durum

const activities_list = [
  " ", // boş kalacak
  "maXoz", // buraya bir durum yazın
  "maXXXoz" // buraya da durum yazın
  ]; 
 

  client.on('ready', () => {
    console.log("Bot Acildi.")
    setInterval(() => {
        const index = Math.floor(Math.random() * (activities_list.length - 1) + 1); 
        client.user.setActivity(activities_list[index], {
          type: "LISTENING", // dinliyor olarak gözükür "WATCHING" yazarsanız izliyor, "STREAMING" yazarsanız yayında olarak.
          url: "https://www.twitch.tv/maxoztv" // bir twitch linki yazın  
        });
    },4 * 1000); 
});
  
  



client.on("ready", async () => {
  let botVoiceChannel = client.channels.cache.get(""); // tırnaklar arasına bir ses kanalı id'si yazın bot açıldığı an o ses kanalına girecek.
  if (botVoiceChannel) botVoiceChannel.join().catch(err => console.error("Bot ses kanalına bağlanamadı!"));
});

// Mesaj Yanıt

      client.on("message", async message => {
        const zazaxd = message.content.toLowerCase(); // büyük küçük harf farkını kaldırır
        if(zazaxd === "maXoz") {  // isminizi yazınca emoji ile react atar
          message.react("😈")
        }
              //  mesajlara karşılık verir
            if(zazaxd === "sa") {
              message.reply("Aleyküm Selam, nasılsın?")
            }
            if(zazaxd === "selamın aleyküm")
            {
              message.reply("Aleyküm Selam, nasılsın?")

            }
           
            if(zazaxd === "merhaba") {
              message.reply("Merhabalar.")
            }
            if(zazaxd === "selam") {
              message.reply("Selamlar.")
            }

            if(zazaxd === "günaydın") {
              message.reply("Günaydın.")
            }

            if(zazaxd === "tünaydın") {
              message.reply("Tünaydın.")
            }

            if(zazaxd === "iyi akşamlar") {
              message.reply("İyi Akşamlar.")
            }

            if(zazaxd === "iyi geceler") {
              message.reply("İyi Geceler.")
            }
            if(zazaxd === "iyi") {
              message.reply("İyi olduğuna sevindim :slight_smile:")
            }
            if(zazaxd === "kötü") {
              message.reply("Bizimle alakalı bir sorunun varsa yetkililer ile iletişime geçebilirsin.")
            }
        if(message.author.bot) return;
        
        if(message.content.indexOf(config.prefix) !== 0) return;
      
        const args = message.content.slice(config.prefix.length).trim().split(/ +/g);
        const command = args.shift().toLowerCase();
      
     
        




// Admin

// ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ 
var modlogChannelID = '1234567890123'; // yapılan işlemlerin kayıt altına alınacağı mesaj kanalının id'si (log kanalı idsi)
// ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ ÖNEMLİ 



// jail komutu
if(command === "jail") {

  if(message.member.roles.cache.some(r=>["Yönetici", "Admin"].includes(r.name)) ) { // komutu kullanabilecek rollerin isimleri

  const user = message.mentions.users.first(); 
  let viprol = message.guild.roles.cache.find(r => r.name === "CEZALI"); // cezalı rolünüzün ismi

  let member = message.mentions.members.first();
  

  
  message.guild.member(user).roles.add([viprol]).catch(console.error);

  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('RED')
  .setDescription(`✅ ${user.tag} kullanıcısı başarıyla cezalandırıldı!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 

   // loglara aıtlacak olan mesaj VVV
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/599397901176799234/774264664426151977/prison_PNG21.png`)
  .setThumbnail(user.displayAvatarURL)
  .setColor('RED')
  .setTimestamp()
  .setDescription(`**Eylem**: Jail
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından cezalandırıldı.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  
} else {
  message.reply("Yetkin yetersiz.")
  }


}

if(command === "unjail") {

  if(message.member.roles.cache.some(r=>["Yönetici", "Admin"].includes(r.name)) ) { // komutu kullanabilecek rollerin isimleri

  const user = message.mentions.users.first(); 
  let viprol = message.guild.roles.cache.find(r => r.name === "CEZALI"); // cezalı rolünüzün ismi

  let member = message.mentions.members.first();
  

  
  message.guild.member(user).roles.remove([viprol]).catch(console.error);

  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('RED')
  .setDescription(`✅ ${user.tag} kullanıcısının cezasını kaldırdı!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 

   // loglara aıtlacak olan mesaj VVV
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/599397901176799234/774264664426151977/prison_PNG21.png`)
  .setThumbnail(user.displayAvatarURL)
  .setColor('RED')
  .setTimestamp()
  .setDescription(`**Eylem**: Unjail
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından cezalandırması kaldırıldı.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  
} else {
  message.reply("Yetkin yetersiz.")
  }


}



if(command === "duyuru") { // duyuru komutu yazdığınız mesajın duyuru kanalına bot tarafından atılmasını sağlar.
  if(message.member.roles.cache.some(r=>["Yönetici"].includes(r.name)) ) { // duyuru atabilecek rolün ismi
  const sayMessage = args.join(" ");
  message.delete().catch(O_o=>{}); 
  client.channels.cache.get(config.duyuru).send(sayMessage) // duyurru kanalı id'sini config üzerinden değiştirin
} 
else message.reply("Yetkin yetersizç")
}


const sahip = "" // bot sahibinin id si


      if(command === "bağlan") {  // bulunduğunuz ses kanalına botu sokar
        if(message.author.id === sahip) {
          if(!message.guild.voiceConnection){
            message.member.voice.channel.join()
             
                message.reply("Basarili.");
            
          }
      } else 
      message.reply("Yöneticiye özel.")
      }
    
     
   
      
      if(command === "söyle") { // yazdığınız şeyi siler ve bot yazar
        if(message.member.roles.cache.some(r=>["Yönetici", "Moderator", "Yetkili"].includes(r.name)) ) { // kulanabilecek rollerin ismi
        const sayMessage = args.join(" ");
        message.delete().catch(O_o=>{}); 
        message.channel.send(sayMessage);
      } else {
        message.reply("Yetkin yetersiz.")
        }
     
    }
    if(command === "sil") { // kanalda belirtilen sayıda mesaj siler
      if(message.member.roles.cache.some(r=>["Yönetici", "Yetkili"].includes(r.name)) ) { // kullanabilecek rollerin ismi
      const amount = args.join(' '); 
      if (!amount) return message.reply('Silinecek mesaj sayısını gir.');
      if (isNaN(amount)) return message.reply('Sayı olmak zorunda.');
      if (amount > 100) return message.reply('100 mesaj silebilirsin.');
      if (amount < 1) return message.reply('En az 1 mesaj silebilirsin.'); 
      await message.channel.messages.fetch({ limit: amount }).then(messages => { 
          message.channel.bulkDelete(messages 
      )});
    } else {
      message.reply("Yetkin yetersiz.")
      }
    }

  

if(command === "ban") // üyeyi banlar
{

  if(message.member.roles.cache.some(r=>["Yönetici", "Yetkili"].includes(r.name)) ) { // kullanabilecek rollerin ismi
   
   

    const user = message.mentions.users.first(); 
    const banReason = args.slice(1).join(' '); 

    if (!user) {
    try {
  
    if (!message.guild.members.get(args.slice(0, 1).join(' '))) throw new Error('Kullanıcı belirtin.');
 
    user = message.guild.members.get(args.slice(0, 1).join(' '));
    user = user.user;
    } catch (error) {
    return message.reply('Kullanıcı belirtin.');
    }
    }
    if (user === message.author) return message.channel.send('Kendini banlayamazsın :D'); 
    if (!banReason) return message.reply('Sebep yazmayı unuttun.');
    if (!message.guild.member(user).bannable) return message.reply('BOT gerekli yetkiye sahip değil.'); 
    await message.guild.members.ban(user, {reason: banReason}) 

    const Discord = require('discord.js'); 
    const banConfirmationEmbed = new Discord.MessageEmbed()
    .setColor('RED')
    .setDescription(`✅ ${user.tag} başarıyla yasaklandı!`);
    message.channel.send({
    embed: banConfirmationEmbed
    }); 
   
   
    const banembed = new Discord.MessageEmbed()
    .setImage(`attachment://banned.png`)
    .setThumbnail(user.displayAvatarURL)
    .setColor('RED')
    .setTimestamp()
    .attachFiles('./banned.png')
    .setDescription(`**Eylem**: Ban
    **Kullanıcı**: <@${user.id}> 
    ${user.username}#${user.discriminator} 
    (${user.id})
    **Sebep**: ${banReason}`)
    .setFooter(`${message.author.username}#${message.author.discriminator} tarafından yasaklandı.`, message.author.displayAvatarURL);
    client.channels.cache.get(modlogChannelID).send({
    embed: banembed
    }); 
    

  } else {
  message.reply("Yetkin yetersiz.")
  }

}



if(command === "sustur") // üyeyi sesli odada susturur
{

  if(message.member.roles.cache.some(r=>["Yönetici", "Yetkili"].includes(r.name)) ) { // kullanabilecek rollerin ismi
   

    const user = message.mentions.users.first(); 
    const banReason = args.slice(1).join(' '); 

    if (!user) {
    try {
  
    if (!message.guild.members.get(args.slice(0, 1).join(' '))) throw new Error('Kullanıcı belirtin.');
 
    user = message.guild.members.get(args.slice(0, 1).join(' '));
    user = user.user;
    } catch (error) {
    return message.reply('Kullanıcı belirtin.');
    }
    }
    if (user === message.author) return message.channel.send('Kendini susturamazsın :D'); 
    if (!banReason) return message.reply('Sebep yazmayı unuttun.');
    if (!message.guild.member(user).bannable) return message.reply('BOT gerekli yetkiye sahip değil.'); 
    message.guild.member(user).voice.setMute(true)

    const Discord = require('discord.js'); 
    const banConfirmationEmbed = new Discord.MessageEmbed()
    .setColor('RED')
    .setDescription(`✅ ${user.tag} başarıyla susturuldu!`);
    message.channel.send({
    embed: banConfirmationEmbed
    }); 
   
   
    const banembed = new Discord.MessageEmbed()
    .setImage(`https://cdn.discordapp.com/attachments/599397901176799234/774273088237862943/107037.png`)
    .setThumbnail(user.displayAvatarURL)
    .setColor('RED')
    .setTimestamp()
    .setDescription(`**Eylem**: Sustur
    **Kullanıcı**: <@${user.id}> 
    ${user.username}#${user.discriminator} 
    (${user.id})
    **Sebep**: ${banReason}`)
    .setFooter(`${message.author.username}#${message.author.discriminator} tarafından susturuldu.`, message.author.displayAvatarURL);
    client.channels.cache.get(modlogChannelID).send({
    embed: banembed
    }); 
    

  } else {
  message.reply("Yetkin yetersiz.")
  }

}


if(command === "susturma") // üyenin sesli susturmasını açar
{

  if(message.member.roles.cache.some(r=>["Yönetici", "Yetkili"].includes(r.name)) ) { // kullanabilecek rollerin ismi
   


    const user = message.mentions.users.first(); 
    const banReason = args.slice(1).join(' '); 

    if (!user) {
    try {
  
    if (!message.guild.members.get(args.slice(0, 1).join(' '))) throw new Error('Kullanıcı belirtin.');
 
    user = message.guild.members.get(args.slice(0, 1).join(' '));
    user = user.user;
    } catch (error) {
    return message.reply('Kullanıcı belirtin.');
    }
    }
    if (!banReason) return message.reply('Sebep yazmayı unuttun.');
    if (!message.guild.member(user).bannable) return message.reply('BOT gerekli yetkiye sahip değil.'); 
    message.guild.member(user).voice.setMute(false)

    const Discord = require('discord.js'); 
    const banConfirmationEmbed = new Discord.MessageEmbed()
    .setColor('RED')
    .setDescription(`✅ ${user.tag} başarıyla sesi açıldı!`);
    message.channel.send({
    embed: banConfirmationEmbed
    }); 
   
   
    const banembed = new Discord.MessageEmbed()
    .setImage(`https://cdn.discordapp.com/attachments/599397901176799234/774273088237862943/107037.png`)
    .setThumbnail(user.displayAvatarURL)
    .setColor('RED')
    .setTimestamp()
    .setDescription(`**Eylem**: Susturma
    **Kullanıcı**: <@${user.id}> 
    ${user.username}#${user.discriminator} 
    (${user.id})
    **Sebep**: ${banReason}`)
    .setFooter(`${message.author.username}#${message.author.discriminator} tarafından sesi açıldı.`, message.author.displayAvatarURL);
    client.channels.cache.get(modlogChannelID).send({
    embed: banembed
    }); 
    

  } else {
  message.reply("Yetkin yetersiz.")
  }

}



if(command === "sağırlaştır") // üyenin kulaklığını kapatır
{

  if(message.member.roles.cache.some(r=>["Yönetici", "Yetkili"].includes(r.name)) ) { // kullanabilecek rollerin ismi
   

    const user = message.mentions.users.first(); 
    const banReason = args.slice(1).join(' '); 

    if (!user) {
    try {
  
    if (!message.guild.members.get(args.slice(0, 1).join(' '))) throw new Error('Kullanıcı belirtin.');
 
    user = message.guild.members.get(args.slice(0, 1).join(' '));
    user = user.user;
    } catch (error) {
    return message.reply('Kullanıcı belirtin.');
    }
    }
    if (user === message.author) return message.channel.send('Kendini sağırlaştıramazsın :D'); 
    if (!banReason) return message.reply('Sebep yazmayı unuttun.');
    if (!message.guild.member(user).bannable) return message.reply('BOT gerekli yetkiye sahip değil.'); 
    message.guild.member(user).voice.setDeaf(true)
    const Discord = require('discord.js'); 
    const banConfirmationEmbed = new Discord.MessageEmbed()
    .setColor('RED')
    .setDescription(`✅ ${user.tag} başarıyla sağırlaştırıldı!`);
    message.channel.send({
    embed: banConfirmationEmbed
    }); 
   
   
    const banembed = new Discord.MessageEmbed()
    .setImage(`https://cdn.discordapp.com/attachments/599397901176799234/774272082799755274/mute-512.webp`)
    .setThumbnail(user.displayAvatarURL)
    .setColor('RED')
    .setTimestamp()
    .setDescription(`**Eylem**: Sağırlaştır
    **Kullanıcı**: <@${user.id}> 
    ${user.username}#${user.discriminator} 
    (${user.id})
    **Sebep**: ${banReason}`)
    .setFooter(`${message.author.username}#${message.author.discriminator} tarafından sağırlaştırıldı.`, message.author.displayAvatarURL);
    client.channels.cache.get(modlogChannelID).send({
    embed: banembed
    }); 
    

  } else {
  message.reply("Yetkin yetersiz.")
  }

}


if(command === "sağırlaştırma") // yüenin kulaklığını açar
{

  if(message.member.roles.cache.some(r=>["Yönetici", "Yetkili"].includes(r.name)) ) {  // kullanabilecek rollerin ismi
   

    const user = message.mentions.users.first(); 
    const banReason = args.slice(1).join(' '); 

    if (!user) {
    try {
  
    if (!message.guild.members.get(args.slice(0, 1).join(' '))) throw new Error('Kullanıcı belirtin.');
 
    user = message.guild.members.get(args.slice(0, 1).join(' '));
    user = user.user;
    } catch (error) {
    return message.reply('Kullanıcı belirtin.');
    }
    }
    if (!banReason) return message.reply('Sebep yazmayı unuttun.');
    if (!message.guild.member(user).bannable) return message.reply('BOT gerekli yetkiye sahip değil.'); 
    message.guild.member(user).voice.setDeaf(false)

    const Discord = require('discord.js'); 
    const banConfirmationEmbed = new Discord.MessageEmbed()
    .setColor('RED')
    .setDescription(`✅ ${user.tag} başarıyla kulaklığı açıldı!`);
    message.channel.send({
    embed: banConfirmationEmbed
    }); 
   
   
    const banembed = new Discord.MessageEmbed()
    .setImage(`https://cdn.discordapp.com/attachments/599397901176799234/774272082799755274/mute-512.webp`)
    .setThumbnail(user.displayAvatarURL)
    .setColor('RED')
    .setTimestamp()
    .setDescription(`**Eylem**: Sağırlaştırma
    **Kullanıcı**: <@${user.id}> 
    ${user.username}#${user.discriminator} 
    (${user.id})
    **Sebep**: ${banReason}`)
    .setFooter(`${message.author.username}#${message.author.discriminator} tarafından kulaklığı açıldı.`, message.author.displayAvatarURL);
    client.channels.cache.get(modlogChannelID).send({
    embed: banembed
    }); 
    

  } else {
  message.reply("Yetkin yetersiz.")
  }

}

// Bilgi




if(command === "ping") { // gecikmeyi gösterir
         
  const m = await message.channel.send(".");
  m.edit(`Pong!  ${m.createdTimestamp - message.createdTimestamp}ms.`);
}

// kullanıcın avatrını atar
if(command === "avatar") { 
  const user = message.mentions.users.first() || message.author;
  const avatarEmbed = new Discord.MessageEmbed()
      .setColor(0x333333)
      .setAuthor(user.username)
      .setImage(user.avatarURL());
  message.channel.send(avatarEmbed);
}
if(command === "avatar") {
  const user = message.mentions.users.first() || message.author;
  const avatarEmbed = new Discord.MessageEmbed()
      .setColor(0x333333)
      .setAuthor(user.username)
      .setImage(user.avatarURL({ format: 'gif', dynamic: true, size: 1024 }));
  message.channel.send(avatarEmbed);
}

if(command === `sunucubilgi`){ // sunucu bilgisini gösterir.

  function checkDays(date) {
    let now = new Date();
    let diff = now.getTime() - date.getTime();
    let days = Math.floor(diff / 86400000);
    return days + (days == 1 ? " day" : " days") + " ago";
};
  const embed = new Discord.MessageEmbed()
        .setAuthor(message.guild.name, message.guild.iconURL)
        .addField("İsim", message.guild.name, true)
        .addField("ID", message.guild.id, true)
        .addField("Kurucu", `${message.guild.owner.user.username}#${message.guild.owner.user.discriminator}`, true)
        .addField("Kullanıcı Sayısı", `${message.guild.members.cache.size}`, true)
        .addField("Kanallar", message.guild.channels.cache.size, true)
        .addField("Roller", message.guild.roles.cache.size, true)
        .addField("Kurulum Tarihi", `${message.channel.guild.createdAt.toUTCString().substr(0, 16)} (${checkDays(message.channel.guild.createdAt)})`, true)
        .addField("Katılma Tarihi", message.member.joinedAt)
        .setThumbnail(message.guild.iconURL)
    message.channel.send({embed});
}







// VIP Ver

if(command === "vipver") {

  if(message.member.roles.cache.some(r=>["Yönetici"].includes(r.name)) ) { // kullanabilecek rollerin ismi

  const user = message.mentions.users.first(); 
  let viprol = message.guild.roles.cache.find(r => r.name === "VIP"); // vip rolünün ismi

  let member = message.mentions.members.first();

  member.roles.add(viprol).catch(console.error);

  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('RED')
  .setDescription(`✅ ${user.tag} kullanıcısına VIP başarıyla verildi!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 

   
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/744988253098213397/773222131059130468/unnamed.png`)
  .setThumbnail(user.displayAvatarURL)
  .setColor('RED')
  .setTimestamp()
  .setDescription(`**Eylem**: VIP Ver
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından verildi.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  
} else {
  message.reply("Yetkin yetersiz.")
  }


}

if(command === "vipal") { // vip alır

  if(message.member.roles.cache.some(r=>["Yönetici"].includes(r.name)) ) { // kullanabilecek rolllerin ismi

  const user = message.mentions.users.first(); 
  let viprol = message.guild.roles.cache.find(r => r.name === "VIP"); // vip rolünün ismi

  let member = message.mentions.members.first();
 
  member.roles.remove(viprol).catch(console.error);
  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('RED')
  .setDescription(`✅ ${user.tag} kullanıcısından VIP başarıyla alındı!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 


   
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/744988253098213397/773222131059130468/unnamed.png`)
  .setThumbnail(user.displayAvatarURL)
  .setColor('RED')
  .setTimestamp()
  .setDescription(`**Eylem**: VIP Al
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından alındı.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  
} else {
  message.reply("Yetkin yetersiz.")
  }


}

// Yetkili Ver

if(command === "denemever") {  // deneme yetkili verir 

  if(message.member.roles.cache.some(r=>["Yönetici"].includes(r.name)) ) { // kullanabilecek rolün ismi

  const user = message.mentions.users.first(); 
  let viprol = message.guild.roles.cache.find(r => r.name === "Bekçi"); // deneme yetkili rolü
  let viprol2 = message.guild.roles.cache.find(r => r.name === "Yetkili"); // varsa yetkililer için özel rol
  let member = message.mentions.members.first();
  
  member.roles.add(viprol).catch(console.error);
  member.roles.add(viprol2).catch(console.error);
  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('YELLOW')
  .setDescription(`✅ ${user.tag} kullanıcısına Deneme Yetkili başarıyla verildi!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 

   
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/744988253098213397/773226471928889354/unnamed_1.png`)
  .setThumbnail(user.displayAvatarURL)
 .setColor('YELLOW')
  .setTimestamp()
  .setDescription(`**Eylem**: Deneme Yetkili Ver
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından verildi.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  } else {
  message.reply("Yetkin yetersiz.")
  }


}

if(command === "denemeal") { // deneme yetkili alır

  if(message.member.roles.cache.some(r=>["Yönetici"].includes(r.name)) ) { // kullanabilecek rolün ismi
    let viprol2 = message.guild.roles.cache.find(r => r.name === "Yetkili"); // varsa yetkililer için özel rol
  const user = message.mentions.users.first(); 
  let viprol = message.guild.roles.cache.find(r => r.name === "Bekçi"); // deneme yetkili rolü

  let member = message.mentions.members.first();
  member.roles.remove(viprol).catch(console.error);
  member.roles.remove(viprol2).catch(console.error);
  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('RED')
  .setDescription(`✅ ${user.tag} kullanıcısından Deneme Yetkili başarıyla alındı!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 


   
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/744988253098213397/773226471928889354/unnamed_1.png`)
  .setThumbnail(user.displayAvatarURL)
  .setColor('RED')
 .setTimestamp()
 .setDescription(`**Eylem**: Deneme Yetkili Al
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından alındı.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  
} else {
  message.reply("Yetkin yetersiz.")
  }


}

if(command === "i") { // isim değiştirir 
 

  const user = message.mentions.users.first(); 
  if(message.member.roles.cache.some(r=>["Yönetici"].includes(r.name)) ) { // kullanabilecek rolün ismi

    const banReason = args.slice(1).join(' '); 
  
let member = message.mentions.members.first();
member = await member.setNickname(banReason);


  const banConfirmationEmbed = new Discord.MessageEmbed()
  .setColor('BLACK')
  .setDescription(`✅ ${user.tag} kullanıcısının ismi başarıyla değiştirildi!`);
  message.channel.send({
  embed: banConfirmationEmbed
  }); 


   
  const banembed = new Discord.MessageEmbed()
  .setImage(`https://cdn.discordapp.com/attachments/744988253098213397/773232364166971436/img_251427.png`)
  .setThumbnail(user.displayAvatarURL)
  .setColor('BLACK')
  .setTimestamp()
  .setDescription(`**Eylem**: İsim Değişikliği
  **Kullanıcı**: <@${user.id}> 
  ${user.username}#${user.discriminator} 
  (${user.id})
  **Değişiklik:** ${banReason}`)
  .setFooter(`${message.author.username}#${message.author.discriminator} tarafından değiştirildi.`, message.author.displayAvatarURL);
  client.channels.cache.get(modlogChannelID).send({
  embed: banembed
  }); 
  
} else {
  message.reply("Yetkin yetersiz.")
  }


}




// connecting to discord
const Discord = require('discord.js')

// connect us to the config.json file

// create a new Discord Client 
const Client = new Discord.Client({disableEveryone: true});

// we make a new system for the cmds

// require the fs module

const db = require('quick.db')








// command kısmının sonu 
})

// level sistemi
const db = require('quick.db')


client.on("message", async (message, guild) => {

  if(message.author.Client || message.channel.type === "dm") return;



xp(message)
if(message.content.startsWith(`${config.prefix}rank`)) { // komutun ismi
if(message.author.bot) return;
var user = message.mentions.users.first() || message.author;
var level = db.fetch(`guild_${message.guild.id}_level_${user.id}`) || 0;
var currentxp = db.fetch(`guild_${message.guild.id}_xp_${user.id}`) || 0;
var xpNeeded = level * 500 + 500
const embedlvl = new Discord.MessageEmbed()
.setTitle(`${user.username} kişisinin leveli`)
.setThumbnail(user.displayAvatarURL({dynamic: true}))
.addFields(
  {name: `XP`, value: `${currentxp}/${xpNeeded}`, inline: true},
  {name: `Level`, value: `${level}`, inline: true}
)
message.channel.send(embedlvl)
}

function xp(message) {
  if(message.author.bot) return
  const randomNumber = Math.floor(Math.random() * 10) + 15;
  db.add(`guild_${message.guild.id}_xp_${message.author.id}`, randomNumber) 
  db.add(`guild_${message.guild.id}_xptotal_${message.author.id}`, randomNumber)
  var level = db.get(`guild_${message.guild.id}_level_${message.author.id}`) || 1
  var xp = db.get(`guild_${message.guild.id}_xp_${message.author.id}`)
  var xpNeeded = level * 500;
  if(xpNeeded < xp){
      var newLevel = db.add(`guild_${message.guild.id}_level_${message.author.id}`, 1) 
      db.subtract(`guild_${message.guild.id}_xp_${message.author.id}`, xpNeeded)
      message.channel.send(`Tebrikler, ${message.author}, level atladın. Artık ${newLevel} levelsin.`) // level atlama mesajı
      var leval = db.get(`guild_${message.guild.id}_level_${message.author.id}`)
      if(leval = 1) { // 1 yazan kısma istediğin leveli yaz o levele ulaşınca rol verecek
        let level1 = message.guild.roles.cache.find(r => r.name === "level 1"); // level rolünün ismi
        message.member.roles.add(level1).catch(console.error);
        message.channel.send(`Ayrıca 1 level rolün verildi. `) // level rolü kazandığında atılan mesaj
    }
    if(leval = 2) { // 2  yazan kısma istediğin leveli yaz o levele ulaşınca rol verecek
      let level1 = message.guild.roles.cache.find(r => r.name === "level 2");  // level rolünün ismi
      message.member.roles.add(level1).catch(console.error);
      message.channel.send(`Ayrıca 2 level rolün verildi. `) // level rolü kazandığında atılan mesaj
  }
  // a
  if(leval = 3) { // 3 yazan kısma istediğin leveli yaz o levele ulaşınca rol verecek
    let level1 = message.guild.roles.cache.find(r => r.name === "level 2"); // level rolünün ismi
    message.member.roles.add(level1).catch(console.error);
    message.channel.send(`Ayrıca 3 level rolün verildi. `) // level rolü kazandığında atılan mesaj
  // b
    // a ile b arasını kopyala yapıştır yaparak ödülleri artırabilirsin.

}
    }
}

})



client.login(config.token);
