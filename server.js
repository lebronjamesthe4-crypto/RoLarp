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
  EmbedBuilder
} = require("discord.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* =========================
   MONGODB
========================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
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

const CLIENT_ID = "1507541333219348570";
const GUILD_ID = "1507127260547645610";

const CUSTOMER_ROLE_ID = "1507145590528540822";
const MANAGEMENT_ROLE_ID = "1507127911897890856";
const ADMIN_ROLE_ID = "1507127797607432283";

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
  console.log(`Logged in as ${bot.user.tag}`);
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
    ),

  new SlashCommandBuilder()
    .setName("license")
    .setDescription("View your license"),

  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Reset your HWID"),

  new SlashCommandBuilder()
    .setName("keys")
    .setDescription("View all keys"),

  new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Revoke a user's license")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("User")
        .setRequired(true)
    )

].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {

  try {

    console.log("Registering commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      { body: commands }
    );

    console.log("Commands registered");

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

    const member = interaction.member;

    const allowed =
      member.roles.cache.has(MANAGEMENT_ROLE_ID) ||
      member.roles.cache.has(ADMIN_ROLE_ID);

    if (!allowed) {
      return interaction.reply({
        content: "No permission",
        ephemeral: true
      });
    }

    const targetUser =
      interaction.options.getUser("user");

    const duration =
      interaction.options.getString("duration");

    const key =
      "LARP-" +
      crypto.randomBytes(4)
        .toString("hex")
        .toUpperCase();

    let expires = null;
    let expiresText = "Never";

    /* =========================
       1 DAY
    ========================= */

    if (duration === "1day") {

      const d = new Date();

      d.setDate(d.getDate() + 1);

      expires = d.getTime();

      expiresText =
        d.toLocaleDateString();
    }

    /* =========================
       7 DAYS
    ========================= */

    else if (duration === "7days") {

      const d = new Date();

      d.setDate(d.getDate() + 7);

      expires = d.getTime();

      expiresText =
        d.toLocaleDateString();
    }

    /* =========================
       1 MONTH
    ========================= */

    else if (duration === "1month") {

      const d = new Date();

      d.setMonth(d.getMonth() + 1);

      expires = d.getTime();

      expiresText =
        d.toLocaleDateString();
    }

    await LicenseKey.create({
      userId: targetUser.id,
      key,
      expires,
      duration,
      hwid: null,
      lastReset: 0
    });

    /* =========================
       DM EMBED
    ========================= */

    const dmEmbed = new EmbedBuilder()
      .setTitle("Your License")
      .setColor(0x5865F2)
      .addFields(
        {
          name: "License Key",
          value: `\`${key}\``
        },
        {
          name: "Expires",
          value: expiresText
        },
        {
          name: "Download",
          value: DOWNLOAD_LINK
        },
        {
          name: "Setup Guide",
          value: SETUP_LINK
        }
      )
      .setFooter({
        text: "RoLarp Licensing"
      })
      .setTimestamp();

    /* =========================
       CHANNEL EMBED
    ========================= */

    const channelEmbed =
      new EmbedBuilder()
        .setTitle("License Generated")
        .setColor(0x57F287)
        .addFields(
          {
            name: "User",
            value: `${targetUser}`
          },
          {
            name: "License Key",
            value: `\`${key}\``
          },
          {
            name: "Expires",
            value: expiresText
          }
        )
        .setTimestamp();

    try {

      await targetUser.send({
        embeds: [dmEmbed]
      });

    } catch {

      console.log(
        "Could not DM user"
      );

    }

    return interaction.reply({
      embeds: [channelEmbed]
    });
  }

  /* =========================
     /LICENSE
  ========================= */

  if (interaction.commandName === "license") {

    const foundKey =
      await LicenseKey.findOne({
        userId: interaction.user.id
      });

    if (!foundKey) {
      return interaction.reply({
        content: "No license found",
        ephemeral: true
      });
    }

    const expired =
      foundKey.expires &&
      Date.now() > foundKey.expires;

    const expiresText =
      foundKey.expires
        ? new Date(
            foundKey.expires
          ).toLocaleDateString()
        : "Never";

    const embed =
      new EmbedBuilder()
        .setTitle("Your License")
        .setColor(0x5865F2)
        .addFields(
          {
            name: "License Key",
            value: `\`${foundKey.key}\``
          },
          {
            name: "Expires",
            value: expiresText,
            inline: true
          },
          {
            name: "Status",
            value: expired
              ? "Expired"
              : "Active",
            inline: true
          },
          {
            name: "HWID",
            value:
              foundKey.hwid ||
              "Not Bound"
          }
        )
        .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }

  /* =========================
     /RESETHWID
  ========================= */

  if (
    interaction.commandName ===
    "resethwid"
  ) {

    const foundKey =
      await LicenseKey.findOne({
        userId: interaction.user.id
      });

    if (!foundKey) {
      return interaction.reply({
        content: "No key found",
        ephemeral: true
      });
    }

    const cooldown =
      24 * 60 * 60 * 1000;

    const now = Date.now();

    if (
      now -
        (foundKey.lastReset || 0) <
      cooldown
    ) {

      const remaining =
        cooldown -
        (now -
          foundKey.lastReset);

      return interaction.reply({
        content:
          `Wait ${Math.ceil(
            remaining / 3600000
          )} hours before resetting again.`,
        ephemeral: true
      });
    }

    foundKey.hwid = null;

    foundKey.lastReset = now;

    await foundKey.save();

    return interaction.reply({
      content:
        "HWID reset successfully",
      ephemeral: true
    });
  }

  /* =========================
     /KEYS
  ========================= */

  if (interaction.commandName === "keys") {

    const member = interaction.member;

    const allowed =
      member.roles.cache.has(
        MANAGEMENT_ROLE_ID
      ) ||
      member.roles.cache.has(
        ADMIN_ROLE_ID
      );

    if (!allowed) {
      return interaction.reply({
        content: " No permission",
        ephemeral: true
      });
    }

    const keys =
      await LicenseKey.find().limit(20);

    const formatted = keys.map(k => {

      const expires =
        k.expires
          ? new Date(
              k.expires
            ).toLocaleDateString()
          : "Never";

      return `🔑 ${k.key}
 <@${k.userId}>
 ${expires}
 ${k.hwid ? "Bound" : "Unbound"}
`;

    }).join("\n");

    return interaction.reply({
      content:
        formatted ||
        "No keys found",
      ephemeral: true
    });
  }

  /* =========================
     /REVOKEKEY
  ========================= */

  if (
    interaction.commandName ===
    "revokekey"
  ) {

    const member = interaction.member;

    const allowed =
      member.roles.cache.has(
        MANAGEMENT_ROLE_ID
      ) ||
      member.roles.cache.has(
        ADMIN_ROLE_ID
      );

    if (!allowed) {
      return interaction.reply({
        content: "❌ No permission",
        ephemeral: true
      });
    }

    const targetUser =
      interaction.options.getUser(
        "user"
      );

    const foundKey =
      await LicenseKey.findOne({
        userId: targetUser.id
      });

    if (!foundKey) {
      return interaction.reply({
        content:
          "❌ No key found for that user",
        ephemeral: true
      });
    }

    const revokedKey =
      foundKey.key;

    await LicenseKey.deleteOne({
      userId: targetUser.id
    });

    try {

      await targetUser.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "❌ License Revoked"
            )
            .setDescription(
              "Your RoLarp license has been revoked."
            )
            .addFields({
              name:
                "🔑 Revoked Key",
              value:
                `\`${revokedKey}\``
            })
            .setColor(0xED4245)
        ]
      });

    } catch {

      console.log(
        "❌ Could not DM revoked user"
      );

    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(
            "✅ License Revoked"
          )
          .setDescription(
            `${targetUser}'s license was revoked.`
          )
          .addFields({
            name:
              "🔑 Revoked Key",
            value:
              `\`${revokedKey}\``
          })
          .setColor(0xED4245)
      ]
    });
  }

});

bot.login(DISCORD_TOKEN);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(
    `🚀 Server running on ${PORT}`
  );
});
