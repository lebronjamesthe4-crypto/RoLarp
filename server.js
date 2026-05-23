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
   MONGO CONNECTION
========================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

/* =========================
   DATABASE SCHEMA
========================= */

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
   EXPRESS VALIDATION API
========================= */

app.post("/validate", async (req, res) => {

  const { key, hwid } = req.body;

  if (!key) {
    return res.json({ valid: false, error: "No key" });
  }

  const normalized = key.trim().toUpperCase();

  const foundKey = await LicenseKey.findOne({ key: normalized });

  if (!foundKey) {
    return res.json({ valid: false, error: "Invalid key" });
  }

  if (foundKey.expires && Date.now() > foundKey.expires) {
    return res.json({ valid: false, error: "Expired" });
  }

  if (foundKey.hwid && foundKey.hwid !== hwid) {
    return res.json({ valid: false, error: "HWID mismatch" });
  }

  if (!foundKey.hwid && hwid) {
    foundKey.hwid = hwid;
    await foundKey.save();
  }

  return res.json({
    valid: true,
    user: foundKey.userId,
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
  console.log(`✅ Bot logged in as ${bot.user.tag}`);
});

/* =========================
   COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate license key")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("duration")
        .setDescription("Duration")
        .setRequired(true)
        .addChoices(
          { name: "1 Month", value: "1month" },
          { name: "Lifetime", value: "lifetime" }
        )
    ),

  new SlashCommandBuilder()
    .setName("license")
    .setDescription("View license"),

  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Reset HWID")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
})();

/* =========================
   BOT LOGIC
========================= */

bot.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  /* =========================
     GENKEY
  ========================= */

  if (interaction.commandName === "genkey") {

    const member = interaction.member;

    if (
      !member.roles.cache.has(MANAGEMENT_ROLE_ID) &&
      !member.roles.cache.has(ADMIN_ROLE_ID)
    ) {
      return interaction.reply({
        content: "❌ No permission",
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser("user");
    const duration = interaction.options.getString("duration");

    const key =
      "LARP-" +
      crypto.randomBytes(4).toString("hex").toUpperCase() +
      "-" +
      crypto.randomBytes(2).toString("hex").toUpperCase();

    let expires = null;
    let expiresText = "Never";

    if (duration === "1month") {
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

    /* DM */

    const dmEmbed = new EmbedBuilder()
      .setTitle("🔐 License Key")
      .setColor(0x5865F2)
      .addFields(
        { name: "Key", value: `\`${key}\`` },
        { name: "Expires", value: expiresText },
        { name: "Download", value: DOWNLOAD_LINK },
        { name: "Setup Guide", value: SETUP_LINK }
      );

    /* TICKET */

    const ticketEmbed = new EmbedBuilder()
      .setTitle("✅ Key Generated")
      .setDescription(`${targetUser}`)
      .addFields(
        { name: "Key", value: `\`${key}\`` },
        { name: "Download", value: DOWNLOAD_LINK }
      );

    try {
      await targetUser.send({ embeds: [dmEmbed] });

      return interaction.reply({ embeds: [ticketEmbed] });

    } catch {
      return interaction.reply({
        content: "❌ Could not DM user",
        ephemeral: true
      });
    }
  }

  /* =========================
     LICENSE
  ========================= */

  if (interaction.commandName === "license") {

    const foundKey = await LicenseKey.findOne({
      userId: interaction.user.id
    });

    if (!foundKey) {
      return interaction.reply({
        content: "No license",
        ephemeral: true
      });
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("License")
          .addFields(
            { name: "Key", value: `\`${foundKey.key}\`` },
            { name: "Status", value: "Active" }
          )
      ],
      ephemeral: true
    });
  }

  /* =========================
     RESETHWID
  ========================= */

  if (interaction.commandName === "resethwid") {

    const foundKey = await LicenseKey.findOne({
      userId: interaction.user.id
    });

    if (!foundKey) {
      return interaction.reply({
        content: "No key",
        ephemeral: true
      });
    }

    const cooldown = 24 * 60 * 60 * 1000;
    const now = Date.now();

    if (now - (foundKey.lastReset || 0) < cooldown) {
      return interaction.reply({
        content: "Cooldown active",
        ephemeral: true
      });
    }

    foundKey.hwid = null;
    foundKey.lastReset = now;
    await foundKey.save();

    return interaction.reply({
      content: "HWID reset",
      ephemeral: true
    });
  }

});

bot.login(DISCORD_TOKEN);

/* =========================
   SERVER
========================= */

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
