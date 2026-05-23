const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits
} = require("discord.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* =========================
   DISCORD CONFIG
========================= */

const DISCORD_TOKEN = process.env.MTUwNzU0MTMzMzIxOTM0ODU3MA.GsaNtj.sXfz-VVJezwQQAdrrrufRLcGeUtQ6yzTK8izRU;

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

  if (!VALID_KEYS.includes(key)) {
    return res.json({
      valid: false,
      error: "Invalid key"
    });
  }

  res.json({
    valid: true,
    discord: "Licensed User",
    expires: null,
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
  console.log(`Bot logged in as ${bot.user.tag}`);
});

/* =========================
   SLASH COMMANDS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate a license key")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" })
  .setToken(DISCORD_TOKEN);

(async () => {

  try {

    console.log("Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("Slash commands registered.");

  } catch (err) {
    console.error(err);
  }

})();

/* =========================
   COMMAND HANDLER
========================= */

bot.on("interactionCreate", async interaction => {

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "genkey") {

    const key =
      "LARP-" +
      crypto.randomBytes(4).toString("hex").toUpperCase() +
      "-" +
      crypto.randomBytes(2).toString("hex").toUpperCase() +
      "-" +
      crypto.randomBytes(2).toString("hex").toUpperCase();

    VALID_KEYS.push(key);

    await interaction.reply({
      content:
`✅ Generated Key:

\`${key}\``,
      ephemeral: true
    });

  }

});

bot.login(DISCORD_TOKEN);

/* =========================
   START SERVER
========================= */

app.listen(PORT, () => {
  console.log(`Key server running on port ${PORT}`);
});
