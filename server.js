const express = require("express");

const cors = require("cors");

const crypto = require("crypto");

const mongoose = require("mongoose");



const {

  Client,

  GatewayIntentBits,

  SlashCommandBuilder,

  REST,

  Routes,

  EmbedBuilder,

  WebhookClient

} = require("discord.js");



const app = express();



app.use(cors());

app.use(express.json());



const PORT = process.env.PORT || 3000;



/* =========================

   MONGODB

========================= */



mongoose.connect(process.env.MONGO_URI)

  .then(() => console.log("✅ MongoDB connected"))

  .catch(err => console.error("MongoDB error:", err));



const KeySchema = new mongoose.Schema({

  userId: String,

  key: String,

  expires: Number,

  duration: String,

  hwid: String,

  lastReset: Number

});



const LicenseKey = mongoose.model("LicenseKey", KeySchema);



/* =========================

   DISCORD CONFIG

========================= */



const DISCORD_TOKEN = process.env.DISCORD_TOKEN;



const CLIENT_ID = "1519446433747570769";

const GUILD_ID = "1507127260547645610";



const CUSTOMER_ROLE_ID = "1507145590528540822";

const MANAGEMENT_ROLE_ID = "1507127911897890856";

const ADMIN_ROLE_ID = "1507127797607432283";

const SUPPORT_ROLE_ID = "1507128660048478288"; 



// Array of all roles authorized to run staff commands

const PERMITTED_ROLES = [ADMIN_ROLE_ID, MANAGEMENT_ROLE_ID, SUPPORT_ROLE_ID];



// Webhook Link for Logging

const WEBHOOK_URL = "https://discord.com/api/webhooks/1519131205088448644/Qqg0scKQyXUDL06h6dp3nJJvVcV0RAaA2JZTIcUk9SvLJKMMQYqQhmhKWak-RDhXw3ir";

const logger = new WebhookClient({ url: WEBHOOK_URL });



/* =========================

   HELPER FUNCTION: LOG TO WEBHOOK

========================= */

async function sendActionLog(actionName, executor, descriptionFields = []) {

  try {

    const logEmbed = new EmbedBuilder()

      .setTitle(`🤖 Command Log: /${actionName}`)

      .setColor(0x00FF00)

      .addFields(

        { name: "👤 Executed By", value: `${executor} (\`${executor.id}\`)`, inline: false },

        ...descriptionFields

      )

      .setTimestamp();



    await logger.send({ embeds: [logEmbed] });

  } catch (err) {

    console.error("❌ Failed to send webhook log:", err);

  }

}



/* =========================

   LINKS

========================= */



const DOWNLOAD_LINK =

  "https://www.mediafire.com/file/ql3law6gk4tizfa/RoLarpV4_Larp_Tool.zip/file";



const SETUP_LINK =

  "https://discordapp.com/channels/1507127260547645610/1507521673262534716";



/* =========================

   EXPRESS API

========================= */



app.post("/validate", async (req, res) => {

  const { key, hwid } = req.body;



  if (!key) {

    return res.json({

      valid: false,

      error: "No key provided"

    });

  }



  const normalized = key.trim().toUpperCase();



  const foundKey = await LicenseKey.findOne({

    key: normalized

  });



  if (!foundKey) {

    return res.json({

      valid: false,

      error: "Invalid key"

    });

  }



  if (foundKey.expires && Date.now() > foundKey.expires) {

    return res.json({

      valid: false,

      error: "License expired"

    });

  }



  if (foundKey.hwid && foundKey.hwid !== hwid) {

    return res.json({

      valid: false,

      error: "HWID mismatch"

    });

  }



  if (!foundKey.hwid && hwid) {

    foundKey.hwid = hwid;

    await foundKey.save();

  }



  return res.json({

    valid: true,

    discord: foundKey.userId,

    expires: foundKey.expires,

    sessionToken: crypto.randomUUID(),

    sessionExp: Date.now() + (15 * 60 * 1000)

  });

});



/* =========================

   DISCORD BOT

========================= */



const bot = new Client({

  intents: [GatewayIntentBits.Guilds]

});



bot.once("ready", () => {

  console.log(`✅ Logged in as ${bot.user.tag}`);

});



/* =========================

   SLASH COMMANDS

========================= */



const commands = [

  new SlashCommandBuilder()

    .setName("genkey")

    .setDescription("Generate a license key")

    .addUserOption(option =>

      option.setName("user")

        .setDescription("Customer")

        .setRequired(true)

    )

    .addStringOption(option =>

      option.setName("duration")

        .setDescription("License duration")

        .setRequired(true)

        .addChoices(

          { name: "1 Day", value: "1day" },

          { name: "7 Days", value: "7days" },

          { name: "1 Month", value: "1month" },

          { name: "Lifetime", value: "lifetime" }

        )

    )

    .addStringOption(option =>

      option.setName("reason")

        .setDescription("Reason for generating this key (Staff Logs)")

        .setRequired(false)

    ),



  new SlashCommandBuilder()

    .setName("license")

    .setDescription("View your license"),



  new SlashCommandBuilder()

    .setName("resethwid")

    .setDescription("Reset your HWID or target a specific license key")

    .addStringOption(option =>

      option.setName("key")

        .setDescription("The specific license key to reset (Staff Only)")

        .setRequired(false)

    ),



  new SlashCommandBuilder()

    .setName("keys")

    .setDescription("View all keys"),



  new SlashCommandBuilder()

    .setName("revokekey")

    .setDescription("Revoke a specific license key")

    .addStringOption(option =>

      option.setName("key")

        .setDescription("The license key you want to permanently revoke")

        .setRequired(true) // 👈 Changed option type to an explicit text field

    )

].map(cmd => cmd.toJSON());



const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);



(async () => {

  try {

    console.log("🔄 Registering commands...");

    await rest.put(

      Routes.applicationGuildCommands(

        CLIENT_ID,

        GUILD_ID

      ),

      { body: commands }

    );

    console.log("✅ Commands registered");

  } catch (err) {

    console.error(err);

  }

})();



/* =========================

   COMMAND HANDLER

========================= */



bot.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;



  /* =========================

     /GENKEY

  ========================= */



  if (interaction.commandName === "genkey") {

    const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));



    if (!allowed) {

      return interaction.reply({

        content: "❌ No permission",

        ephemeral: true

      });

    }



    const targetUser = interaction.options.getUser("user");

    const duration = interaction.options.getString("duration");

    const reasonText = interaction.options.getString("reason") || "No reason provided.";



    const key = "LARP-" + crypto.randomBytes(4).toString("hex").toUpperCase();



    let expires = null;

    let expiresText = "Never";



    if (duration === "1day") {

      const d = new Date();

      d.setDate(d.getDate() + 1);

      expires = d.getTime();

      expiresText = d.toLocaleDateString();

    } else if (duration === "7days") {

      const d = new Date();

      d.setDate(d.getDate() + 7);

      expires = d.getTime();

      expiresText = d.toLocaleDateString();

    } else if (duration === "1month") {

      const d = new Date();

      d.setMonth(d.getMonth() + 1);

      expires = d.getTime();

      expiresText = d.toLocaleDateString();

    }



    await LicenseKey.create({

      userId: targetUser.id,

      key,

      expires,

      duration,

      hwid: null,

      lastReset: 0

    });



    const dmEmbed = new EmbedBuilder()

      .setTitle("🔐 Your License")

      .setColor(0x1E3A8A)

      .addFields(

        { name: "🔑 License Key", value: `\`${key}\`` },

        { name: "📅 Expires", value: expiresText },

        { name: "⬇️ Download", value: DOWNLOAD_LINK },

        { name: "🛠️ Setup Guide", value: SETUP_LINK }

      )

      .setFooter({ text: "RoLarp Licensing" })

      .setTimestamp();



    const channelEmbed = new EmbedBuilder()

      .setTitle("✅ License Generated")

      .setColor(0x1E3A8A)

      .addFields(

        { name: "👤 User", value: `${targetUser}` },

        { name: "🔑 License Key", value: `\`${key}\`` },

        { name: "📅 Expires", value: expiresText }

      )

      .setTimestamp();



    try {

      await targetUser.send({ embeds: [dmEmbed] });

    } catch {

      console.log("❌ Could not DM user");

    }



    await sendActionLog("genkey", interaction.user, [

      { name: "🎯 For User", value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },

      { name: "🔑 Generated Key", value: `\`${key}\``, inline: true },

      { name: "⏱️ Duration", value: duration, inline: true },

      { name: "📝 Reason Given", value: reasonText, inline: false }

    ]);



    return interaction.reply({ embeds: [channelEmbed] });

  }



  /* =========================

     /LICENSE

  ========================= */



  if (interaction.commandName === "license") {

    const foundKey = await LicenseKey.findOne({ userId: interaction.user.id });



    if (!foundKey) {

      return interaction.reply({

        content: "❌ No license found",

        ephemeral: true

      });

    }



    const expired = foundKey.expires && Date.now() > foundKey.expires;

    const expiresText = foundKey.expires ? new Date(foundKey.expires).toLocaleDateString() : "Never";



    const embed = new EmbedBuilder()

      .setTitle("🔐 Your License")

      .setColor(0x1E3A8A)

      .addFields(

        { name: "🔑 License Key", value: `\`${foundKey.key}\`` },

        { name: "📅 Expires", value: expiresText, inline: true },

        { name: "✅ Status", value: expired ? "Expired" : "Active", inline: true },

        { name: "🖥️ HWID", value: foundKey.hwid || "Not Bound" }

      )

      .setTimestamp();



    await sendActionLog("license", interaction.user, [

      { name: "ℹ️ Action", value: "Checked their own license status.", inline: false }

    ]);



    return interaction.reply({ embeds: [embed], ephemeral: true });

  }



  /* =========================

     /RESETHWID

  ========================= */



  if (interaction.commandName === "resethwid") {

    const inputKey = interaction.options.getString("key");

    const isStaff = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));



    if (inputKey && !isStaff) {

      return interaction.reply({

        content: "❌ You do not have permission to reset specific license keys.",

        ephemeral: true

      });

    }



    let foundKey;



    if (inputKey) {

      const normalizedKey = inputKey.trim().toUpperCase();

      foundKey = await LicenseKey.findOne({ key: normalizedKey });



      if (!foundKey) {

        return interaction.reply({

          content: `❌ Could not find the license key: \`${normalizedKey}\``,

          ephemeral: true

        });

      }

    } else {

      foundKey = await LicenseKey.findOne({ userId: interaction.user.id });



      if (!foundKey) {

        return interaction.reply({

          content: "❌ You don't have a license key assigned to your account.",

          ephemeral: true

        });

      }



      if (!isStaff) {

        const cooldown = 24 * 60 * 60 * 1000;

        const now = Date.now();



        if (now - (foundKey.lastReset || 0) < cooldown) {

          const remaining = cooldown - (now - foundKey.lastReset);

          return interaction.reply({

            content: `⏳ Wait ${Math.ceil(remaining / 3600000)} hours before resetting your HWID again.`,

            ephemeral: true

          });

        }

      }

    }



    foundKey.hwid = null;

    

    if (!inputKey && !isStaff) {

      foundKey.lastReset = Date.now();

    }

    

    await foundKey.save();



    await sendActionLog("resethwid", interaction.user, [

      { name: "🔑 Key Impacted", value: `\`${foundKey.key}\``, inline: true },

      { name: "👤 Key Holder ID", value: `<@${foundKey.userId}>`, inline: true },

      { name: "🛠️ Mode", value: inputKey ? "Staff Force-Reset" : "Self-Reset", inline: true }

    ]);



    return interaction.reply({

      content: inputKey 

        ? `✅ Successfully reset HWID for license key \`${foundKey.key}\`.`

        : "✅ Your license key's HWID has been reset successfully.",

      ephemeral: true

    });

  }



  /* =========================

     /KEYS

  ========================= */



  if (interaction.commandName === "keys") {

    const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));



    if (!allowed) {

      return interaction.reply({

        content: "❌ No permission",

        ephemeral: true

      });

    }



    const keys = await LicenseKey.find().limit(20);



    const formatted = keys.map(k => {

      const expires = k.expires ? new Date(k.expires).toLocaleDateString() : "Never";

      return `🔑 ${k.key}\n👤 <@${k.userId}>\n📅 ${expires}\n🖥️ ${k.hwid ? "Bound" : "Unbound"}\n`;

    }).join("\n");



    await sendActionLog("keys", interaction.user, [

      { name: "ℹ️ Action", value: "Viewed the active key log list.", inline: false }

    ]);



    return interaction.reply({

      content: formatted || "No keys found",

      ephemeral: true

    });

  }



  /* =========================

     /REVOKEKEY

  ========================= */



  if (interaction.commandName === "revokekey") {

    const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));



    if (!allowed) {

      return interaction.reply({

        content: "❌ No permission",

        ephemeral: true

      });

    }



    const inputKey = interaction.options.getString("key"); // 👈 Capture text key instead of user mention

    const normalizedKey = inputKey.trim().toUpperCase();



    const foundKey = await LicenseKey.findOne({ key: normalizedKey });



    if (!foundKey) {

      return interaction.reply({

        content: `❌ Could not find the license key: \`${normalizedKey}\``,

        ephemeral: true

      });

    }



    const assignedUserId = foundKey.userId;

    await LicenseKey.deleteOne({ key: normalizedKey });



    // Attempt to DM the user if they're still in the guild

    try {

      const targetUser = await bot.users.fetch(assignedUserId);

      if (targetUser) {

        await targetUser.send({

          embeds: [

            new EmbedBuilder()

              .setTitle("❌ License Revoked")

              .setDescription("Your RoLarp license has been revoked.")

              .addFields({ name: "🔑 Revoked Key", value: `\`${normalizedKey}\`` })

              .setColor(0x1E3A8A)

          ]

        });

      }

    } catch {

      console.log("❌ Could not DM user (User left the server or has DMs off)");

    }



    // Log action to Webhook

    await sendActionLog("revokekey", interaction.user, [

      { name: "🔑 Key Destroyed", value: `\`${normalizedKey}\``, inline: true },

      { name: "👤 Original Key Owner", value: `<@${assignedUserId}>`, inline: true }

    ]);



    return interaction.reply({

      embeds: [

        new EmbedBuilder()

          .setTitle("✅ License Revoked")

          .setDescription(`License key \`${normalizedKey}\` was successfully destroyed.`)

          .addFields({ name: "👤 Original Owner ID", value: `<@${assignedUserId}> (\`${assignedUserId}\`)` })

          .setColor(0x1E3A8A)

      ]

    });

  }

});



bot.login(DISCORD_TOKEN);



/* =========================

   START SERVER

========================= */



app.listen(PORT, () => {

  console.log(`🚀 Server running on ${PORT}`);

});
