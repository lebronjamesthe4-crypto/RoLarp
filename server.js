const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require("discord.js");

// 1. Initialize the Bot Client
const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = "1519446433747570769";
const GUILD_ID = "1507127260547645610";

// 2. Define a Simple Command
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong to test if the bot is alive!")
].map(cmd => cmd.toJSON());

// 3. Register the Command with Discord
const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered successfully!");
  } catch (err) {
    console.error("❌ Error registering commands:", err);
  }
})();

// 4. Handle Command Interactions
bot.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    return interaction.reply({ content: "🏓 Pong! The bot is fully online and responsive.", ephemeral: true });
  }
});

// 5. Fire it Up
bot.once("ready", () => {
  console.log(`🚀 Logged in as ${bot.user.tag}! Ready to build.`);
});

bot.login(DISCORD_TOKEN);
