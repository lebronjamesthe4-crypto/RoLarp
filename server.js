const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
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
   VALID KEYS
========================= */

const VALID_KEYS = [];

/* =========================
   EXPRESS API
========================= */

app.post("/validate", (req, res) => {

  const { key } = req.body;

  const foundKey = VALID_KEYS.find(k => k.key === key);

  if (!foundKey) {

    return res.json({
      valid: false,
      error: "Invalid key"
    });

  }

  res.json({
    valid: true,
    discord: "Licensed User",
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

    .addStringOption(option =>
      option
        .setName("duration")
        .setDescription("Choose license duration")
        .setRequired(true)
        .addChoices(
          {
            name: "1 Month",
            value: "1month"
          },
          {
            name: "Lifetime",
            value: "lifetime"
          }
        )
    )

    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )

].map(cmd => cmd.toJSON());

const rest = new REST({
  version: "10"
}).setToken(DISCORD_TOKEN);

(async () => {

  try {

    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands
      }
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

    const duration =
      interaction.options.getString("duration");

    const key =
      "LARP-" +
      crypto.randomBytes(4)
        .toString("hex")
        .toUpperCase() +
      "-" +
      crypto.randomBytes(2)
        .toString("hex")
        .toUpperCase() +
      "-" +
      crypto.randomBytes(2)
        .toString("hex")
        .toUpperCase();

    let expires = null;
    let expiresText = "Never";

    if (duration === "1month") {

      const expireDate = new Date();

      expireDate.setMonth(
        expireDate.getMonth() + 1
      );

      expires = expireDate.getTime();

      expiresText =
        expireDate.toLocaleDateString();

    }

    VALID_KEYS.push({
      key,
      expires
    });

    const embed = new EmbedBuilder()

      .setTitle("🔑 License Delivered")

      .setDescription(
        "A new extension key has been generated successfully."
      )

      .addFields(

        {
          name: "📦 License Key",
          value: `\`${key}\``
        },

        {
          name: "⏳ Duration",
          value:
            duration === "1month"
              ? "1 Month"
              : "Lifetime",
          inline: true
        },

        {
          name: "📅 Expires",
          value: expiresText,
          inline: true
        },

        {
          name: "✅ Status",
          value: "Active",
          inline: true
        }

      )

      .setColor(0x5865F2)

      .setFooter({
        text: "RoLarp Licensing System"
      })

      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });

  }

});

bot.login(DISCORD_TOKEN);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {

  console.log(
    `🚀 Key server running on port ${PORT}`
  );

});
