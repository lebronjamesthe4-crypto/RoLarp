const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");

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
   KEY STORAGE (FIXED)
========================= */

const KEYS_FILE = "./keys.json";

/* load keys from disk */
function loadKeys() {
  try {
    if (!fs.existsSync(KEYS_FILE)) {
      fs.writeFileSync(KEYS_FILE, "[]");
    }
    return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch (e) {
    console.error("loadKeys error:", e);
    return [];
  }
}

/* save keys to disk */
function saveKeys(keys) {
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
  } catch (e) {
    console.error("saveKeys error:", e);
  }
}

/* =========================
   EXPRESS API
========================= */

app.post("/validate", (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.json({ valid: false, error: "No key provided" });
  }

  const normalized = key.trim().toUpperCase();
  const keys = loadKeys();

  const foundKey = keys.find(k =>
    k.key.toUpperCase() === normalized
  );

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

  return res.json({
    valid: true,
    discord: foundKey.userId || "Licensed User",
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
          { name: "1 Month", value: "1month" },
          { name: "Lifetime", value: "lifetime" }
        )
    ),

  new SlashCommandBuilder()
    .setName("license")
    .setDescription("View your license")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

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
   COMMAND HANDLER
========================= */

bot.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  /* =========================
     /GENKEY
  ========================= */

  if (interaction.commandName === "genkey") {
    const member = interaction.member;

    const canGenerate =
      member.roles.cache.has(MANAGEMENT_ROLE_ID) ||
      member.roles.cache.has(ADMIN_ROLE_ID);

    if (!canGenerate) {
      return interaction.reply({
        content: "❌ You do not have permission to generate keys.",
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser("user");
    const duration = interaction.options.getString("duration");

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
      const expireDate = new Date();
      expireDate.setMonth(expireDate.getMonth() + 1);
      expires = expireDate.getTime();
      expiresText = expireDate.toLocaleDateString();
    }

    const keys = loadKeys();

    keys.push({
      userId: targetUser.id,
      key,
      expires,
      duration
    });

    saveKeys(keys);

    const embed = new EmbedBuilder()
      .setTitle("🔑 License Delivered")
      .setDescription(`${targetUser} has received a license key.`)
      .addFields(
        { name: "📦 License Key", value: `\`${key}\`` },
        {
          name: "⏳ Duration",
          value: duration === "1month" ? "1 Month" : "Lifetime",
          inline: true
        },
        { name: "📅 Expires", value: expiresText, inline: true },
        { name: "✅ Status", value: "Active", inline: true }
      )
      .setColor(0x5865F2)
      .setFooter({ text: "RoLarp Licensing System" })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }

  /* =========================
     /LICENSE
  ========================= */

  if (interaction.commandName === "license") {
    const member = interaction.member;

    if (!member.roles.cache.has(CUSTOMER_ROLE_ID)) {
      return interaction.reply({
        content: "❌ You do not have access to this command.",
        ephemeral: true
      });
    }

    const keys = loadKeys();

    const foundKey = keys.find(k =>
      k.userId === interaction.user.id
    );

    if (!foundKey) {
      return interaction.reply({
        content: "❌ No license found.",
        ephemeral: true
      });
    }

    const expired =
      foundKey.expires && Date.now() > foundKey.expires;

    const expiresText = foundKey.expires
      ? new Date(foundKey.expires).toLocaleDateString()
      : "Never";

    const embed = new EmbedBuilder()
      .setTitle("🔐 Your License")
      .addFields(
        { name: "📦 License Key", value: `\`${foundKey.key}\`` },
        {
          name: "⏳ Duration",
          value: foundKey.duration === "1month" ? "1 Month" : "Lifetime",
          inline: true
        },
        { name: "📅 Expires", value: expiresText, inline: true },
        {
          name: "✅ Status",
          value: expired ? "Expired" : "Active",
          inline: true
        }
      )
      .setColor(0x5865F2)
      .setFooter({ text: "RoLarp Licensing System" })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
});

bot.login(DISCORD_TOKEN);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`🚀 Key server running on port ${PORT}`);
});
