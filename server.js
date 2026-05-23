require("dotenv").config();

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

/* =========================
   CONFIG
========================= */

const {
  DISCORD_TOKEN,
  MONGO_URI,
  CLIENT_ID,
  GUILD_ID,
  PORT
} = process.env;

/* =========================
   ROLES
========================= */

const CUSTOMER_ROLE_ID = "1507145590528540822";
const MANAGEMENT_ROLE_ID = "1507127911897890856";
const ADMIN_ROLE_ID = "1507127797607432283";

/* =========================
   DATABASE
========================= */

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log(err));

const keySchema = new mongoose.Schema({
  userId: String,
  key: String,
  duration: String,
  expires: Number,

  // 🔐 HWID LOCK
  hwid: { type: String, default: null }
});

const Key = mongoose.model("Key", keySchema);

/* =========================
   EXPRESS VALIDATION
========================= */

app.post("/validate", async (req, res) => {
  const { key, hwid } = req.body;

  if (!key || !hwid) {
    return res.json({
      valid: false,
      error: "Missing key or HWID"
    });
  }

  const data = await Key.findOne({ key });

  if (!data) {
    return res.json({ valid: false, error: "Invalid key" });
  }

  // ⛔ expired check
  if (data.expires && Date.now() > data.expires) {
    return res.json({ valid: false, error: "License expired" });
  }

  // 🔐 FIRST TIME LOCK
  if (!data.hwid) {
    data.hwid = hwid;
    await data.save();
  }

  // ⛔ HWID CHECK
  if (data.hwid !== hwid) {
    return res.json({
      valid: false,
      error: "HWID mismatch (different device)"
    });
  }

  return res.json({
    valid: true,
    sessionToken: crypto.randomUUID(),
    expires: data.expires || null
  });
});

/* =========================
   DISCORD BOT
========================= */

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

/* =========================
   SLASH COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate license key")
    .addUserOption(o =>
      o.setName("user").setRequired(true).setDescription("User")
    )
    .addStringOption(o =>
      o.setName("duration")
        .setRequired(true)
        .addChoices(
          { name: "1 Month", value: "1month" },
          { name: "Lifetime", value: "lifetime" }
        )
    ),

  new SlashCommandBuilder()
    .setName("license")
    .setDescription("View your license")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

/* =========================
   REGISTER COMMANDS
========================= */

(async () => {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash commands registered");
})();

/* =========================
   BOT READY
========================= */

bot.once("ready", () => {
  console.log(`✅ Logged in as ${bot.user.tag}`);
});

/* =========================
   COMMAND HANDLER
========================= */

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  /* =========================
     /GENKEY
  ========================= */

  if (interaction.commandName === "genkey") {
    await interaction.deferReply();

    const member = interaction.member;

    if (
      !member.roles.cache.has(MANAGEMENT_ROLE_ID) &&
      !member.roles.cache.has(ADMIN_ROLE_ID)
    ) {
      return interaction.editReply("❌ No permission.");
    }

    const user = interaction.options.getUser("user");
    const duration = interaction.options.getString("duration");

    const key =
      "LARP-" +
      crypto.randomBytes(4).toString("hex").toUpperCase();

    let expires = null;

    if (duration === "1month") {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      expires = d.getTime();
    }

    await Key.create({
      userId: user.id,
      key,
      duration,
      expires
    });

    // 🔐 GIVE ROLE
    const guildMember = await interaction.guild.members.fetch(user.id);
    guildMember.roles.add(CUSTOMER_ROLE_ID);

    const embed = new EmbedBuilder()
      .setTitle("🔑 Key Generated")
      .setDescription(`Sent to ${user}`)
      .addFields(
        { name: "Key", value: `\`${key}\`` },
        { name: "Duration", value: duration },
        { name: "Expires", value: expires ? new Date(expires).toLocaleDateString() : "Never" }
      )
      .setColor(0x00ff99);

    return interaction.editReply({ embeds: [embed] });
  }

  /* =========================
     /LICENSE
  ========================= */

  if (interaction.commandName === "license") {
    await interaction.deferReply({ ephemeral: true });

    const data = await Key.findOne({ userId: interaction.user.id });

    if (!data) {
      return interaction.editReply("❌ No license found.");
    }

    const expired =
      data.expires && Date.now() > data.expires;

    const embed = new EmbedBuilder()
      .setTitle("🔐 Your License")
      .addFields(
        { name: "Key", value: `\`${data.key}\`` },
        { name: "Status", value: expired ? "Expired" : "Active" }
      )
      .setColor(0x5865f2);

    return interaction.editReply({ embeds: [embed] });
  }
});

/* =========================
   LOGIN + SERVER
========================= */

bot.login(DISCORD_TOKEN);

app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
