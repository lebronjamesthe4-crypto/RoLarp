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

const PORT = process.env.PORT || 3000;

/* =========================
   MONGODB
========================= */

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("🟢 MongoDB connected"))
  .catch(err => console.error("Mongo error:", err));

const keySchema = new mongoose.Schema({
  userId: String,
  key: String,
  expires: Number,
  duration: String
});

const Key = mongoose.model("Key", keySchema);

/* =========================
   DISCORD CONFIG
========================= */

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1507541333219348570";
const GUILD_ID = "1507127260547645610";

/* =========================
   ROLE IDS
========================= */

const CUSTOMER_ROLE_ID = "1507145590528540822";
const MANAGEMENT_ROLE_ID = "1507127911897890856";
const ADMIN_ROLE_ID = "1507127797607432283";

/* =========================
   EXPRESS API (/validate)
========================= */

app.post("/validate", async (req, res) => {
  try {
    const { key } = req.body;

    const foundKey = await Key.findOne({ key });

    if (!foundKey) {
      return res.json({ valid: false, error: "Invalid key" });
    }

    if (foundKey.expires && Date.now() > foundKey.expires) {
      return res.json({ valid: false, error: "License expired" });
    }

    return res.json({
      valid: true,
      userId: foundKey.userId,
      expires: foundKey.expires,
      sessionToken: crypto.randomUUID(),
      sessionExp: Date.now() + 15 * 60 * 1000
    });

  } catch (err) {
    console.error(err);
    return res.json({ valid: false, error: "Server error" });
  }
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
    .addUserOption(opt =>
      opt.setName("user").setDescription("User").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("duration")
        .setDescription("Duration")
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
  try {
    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("✅ Slash commands registered.");
  } catch (err) {
    console.error(err);
  }
})();

/* =========================
   INTERACTIONS
========================= */

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {

    /* =========================
       /GENKEY
    ========================= */
    if (interaction.commandName === "genkey") {

      await interaction.deferReply();

      const member = interaction.member;

      const canGenerate =
        member.roles.cache.has(MANAGEMENT_ROLE_ID) ||
        member.roles.cache.has(ADMIN_ROLE_ID);

      if (!canGenerate) {
        return interaction.editReply("❌ No permission.");
      }

      const targetUser = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");

      const guildMember = await interaction.guild.members.fetch(targetUser.id);

      const key =
        "LARP-" +
        crypto.randomBytes(4).toString("hex").toUpperCase() +
        "-" +
        crypto.randomBytes(2).toString("hex").toUpperCase() +
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

      await Key.create({
        userId: targetUser.id,
        key,
        expires,
        duration
      });

      // GIVE ROLE
      if (!guildMember.roles.cache.has(CUSTOMER_ROLE_ID)) {
        await guildMember.roles.add(CUSTOMER_ROLE_ID);
      }

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔑 Key Generated")
            .setDescription(`Key sent to ${targetUser}`)
            .addFields(
              { name: "Key", value: `\`${key}\`` },
              { name: "Duration", value: duration },
              { name: "Expires", value: expiresText }
            )
            .setColor(0x5865F2)
        ]
      });
    }

    /* =========================
       /LICENSE
    ========================= */
    if (interaction.commandName === "license") {

      await interaction.deferReply({ ephemeral: true });

      const foundKey = await Key.findOne({
        userId: interaction.user.id
      });

      if (!foundKey) {
        return interaction.editReply("❌ No license found.");
      }

      const expired =
        foundKey.expires && Date.now() > foundKey.expires;

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔐 Your License")
            .addFields(
              { name: "Key", value: `\`${foundKey.key}\`` },
              { name: "Duration", value: foundKey.duration },
              { name: "Status", value: expired ? "Expired" : "Active" }
            )
            .setColor(0x5865F2)
        ]
      });
    }

  } catch (err) {
    console.error("COMMAND ERROR:", err);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("❌ Error occurred.");
    } else {
      await interaction.reply({ content: "❌ Error occurred.", ephemeral: true });
    }
  }
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

bot.login(DISCORD_TOKEN);
