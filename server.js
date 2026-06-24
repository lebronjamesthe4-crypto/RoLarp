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
  WebhookClient,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

const CLIENT_ID = "1507541333219348570";
const GUILD_ID = "1507127260547645610";

const CUSTOMER_ROLE_ID = "1507145590528540822";
const MANAGEMENT_ROLE_ID = "1507127911897890856";
const ADMIN_ROLE_ID = "1507127797607432283";
const SUPPORT_ROLE_ID = "1507128660048478288"; 

const PERMITTED_ROLES = [ADMIN_ROLE_ID, MANAGEMENT_ROLE_ID, SUPPORT_ROLE_ID];

// Webhook A: Handles your /buy claims and approval logs
const BUY_TICKET_WEBHOOK_URL = "https://discord.com/api/webhooks/1519217845970538517/EkS7jMhdS9kPpIgdWXHseLn5H4oODTlueHF2K2hS3X03I71IeRToq8dfjjdEEDYcFeRO";
const buyLogger = new WebhookClient({ url: BUY_TICKET_WEBHOOK_URL });

// Webhook B: Handles regular management command audits (/genkey, /revokekey)
const GENERAL_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1519131205088448644/Qqg0scKQyXUDL06h6dp3nJJvVcV0RAaA2JZTIcUk9SvLJKMMQYqQhmhKWak-RDhXw3ir";
const generalLogger = new WebhookClient({ url: GENERAL_LOG_WEBHOOK_URL });

/* =========================
   SHOP LINKS & PRICING
========================= */
const TIER_CONFIG = {
  "7days": {
    name: "Weekly",
    expectedCost: "3",
    link: "https://www.g2a.com/paypal-gift-card-3-usd-by-rewarble-global-i10000339995140",
    robuxPrice: "450",
    gamepassId: "1873036358",
    gamepassLink: "https://www.roblox.com/game-pass/1873036358/Weekly-Key"
  },
  "1month": {
    name: "Monthly",
    expectedCost: "9",
    link: "https://www.g2a.com/paypal-gift-card-9-usd-by-rewarble-global-i10000339995081",
    robuxPrice: "900",
    gamepassId: "1891480404",
    gamepassLink: "https://www.roblox.com/game-pass/1891480404/Monthly-Key"
  },
  "lifetime": {
    name: "Lifetime",
    expectedCost: "20",
    link: "https://www.g2a.com/paypal-gift-card-20-usd-by-rewarble-global-i10000339995011",
    robuxPrice: "1900",
    gamepassId: "1883628287",
    gamepassLink: "https://www.roblox.com/game-pass/1883628287/Lifetime-Key"
  }
};

const DOWNLOAD_LINK = "https://www.mediafire.com/file/ql3law6gk4tizfa/RoLarpV4_Larp_Tool.zip/file";
const SETUP_LINK = "https://discordapp.com/channels/1507127260547645610/1507521673262534716";

/* =========================
   HELPER FUNCTIONS
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

    await generalLogger.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error("❌ Failed to send webhook log:", err);
  }
}

async function generateAndDeliverKey(userId, duration, fundingSource = "Manual") {
  const key = "LARP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  let expires = null;
  let expiresText = "Never";

  if (duration === "1day") {
    expires = Date.now() + (24 * 60 * 60 * 1000);
  } else if (duration === "7days") {
    expires = Date.now() + (7 * 24 * 60 * 60 * 1000);
  } else if (duration === "1month") {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    expires = d.getTime();
  }

  if (expires) expiresText = new Date(expires).toLocaleDateString();

  await LicenseKey.create({
    userId,
    key,
    expires,
    duration,
    hwid: null,
    lastReset: 0
  });

  const dmEmbed = new EmbedBuilder()
    .setTitle("🔐 Your License Key Received!")
    .setDescription("Thank you for your purchase! Your payment verification was approved.")
    .setColor(0x1E3A8A)
    .addFields(
      { name: "🔑 License Key", value: `\`${key}\`` },
      { name: "📅 Expires", value: expiresText },
      { name: "⬇️ Download", value: DOWNLOAD_LINK },
      { name: "🛠️ Setup Guide", value: SETUP_LINK }
    )
    .setFooter({ text: "RoLarp Licensing" })
    .setTimestamp();

  try {
    const targetUser = await bot.users.fetch(userId);
    await targetUser.send({ embeds: [dmEmbed] });

    const guild = await bot.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      await member.roles.add(CUSTOMER_ROLE_ID);
    }
  } catch (err) {
    console.log(`❌ Couldn't execute user roles/DMs for ${userId}:`, err.message);
  }

  await sendActionLog("license_provision", { id: userId, toString: () => `<@${userId}>` }, [
    { name: "🔑 Generated Key", value: `\`${key}\``, inline: true },
    { name: "⏱️ Duration", value: duration, inline: true },
    { name: "🧾 Method", value: fundingSource, inline: false }
  ]);
}

// 🎮 Roblox User ID Fetcher Helper
async function getRobloxUserId(username) {
  try {
    const response = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username.trim()], excludeBannedUsers: false })
    });
    const data = await response.json();
    if (data && data.data && data.data.length > 0) {
      return data.data[0].id;
    }
    return null;
  } catch (err) {
    console.error("Roblox User API error:", err);
    return null;
  }
}

// 🎮 Fixed Roblox Inventory Gamepass Verification Lookup
async function checkGamepassOwnership(robloxUserId, gamepassId) {
  try {
    // 34 is the internal Roblox asset category ID path parameter for Gamepasses
    const response = await fetch(`https://inventory.roblox.com/v2/users/${robloxUserId}/inventory/34?limit=100&sortOrder=Desc`);
    const data = await response.json();
    
    if (data && data.data) {
      // Direct array validation check matching the assetId string
      return data.data.some(item => String(item.assetId) === String(gamepassId));
    }
    return false;
  } catch (err) {
    console.error("Roblox Inventory Gamepass Check error:", err);
    return false;
  }
}

/* =========================
   EXPRESS API
========================= */
app.post("/validate", async (req, res) => {
  const { key, hwid } = req.body;
  if (!key) return res.json({ valid: false, error: "No key provided" });

  const normalized = key.trim().toUpperCase();
  const foundKey = await LicenseKey.findOne({ key: normalized });

  if (!foundKey) return res.json({ valid: false, error: "Invalid key" });
  if (foundKey.expires && Date.now() > foundKey.expires) return res.json({ valid: false, error: "License expired" });
  if (foundKey.hwid && foundKey.hwid !== hwid) return res.json({ valid: false, error: "HWID mismatch" });

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
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

bot.once("ready", () => {
  console.log(`✅ Logged in as ${bot.user.tag}`);
});

/* =========================
   SLASH COMMANDS REGISTRATION
========================= */
const commands = [
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Purchase or redeem a pass tier access voucher")
    .addStringOption(option =>
      option.setName("duration")
        .setDescription("Select the time pass you want to obtain")
        .setRequired(true)
        .addChoices(
          { name: "7 Days (Weekly - $3)", value: "7days" },
          { name: "1 Month (Monthly - $9)", value: "1month" },
          { name: "Lifetime Pass ($20)", value: "lifetime" }
        )
    ),

  new SlashCommandBuilder()
    .setName("claimrobux")
    .setDescription("Auto-claim your license key via Roblox Gamepass purchase verification")
    .addStringOption(option =>
      option.setName("duration")
        .setDescription("Select the gamepass duration tier you purchased")
        .setRequired(true)
        .addChoices(
          { name: "7 Days (Weekly - 450 Robux)", value: "7days" },
          { name: "1 Month (Monthly - 900 Robux)", value: "1month" },
          { name: "Lifetime Pass (1900 Robux)", value: "lifetime" }
        )
    ),

  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Generate a license key (Staff Only)")
    .addUserOption(option => option.setName("user").setDescription("Customer").setRequired(true))
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
    .addStringOption(option => option.setName("reason").setDescription("Reason for logging logs").setRequired(false)),

  new SlashCommandBuilder().setName("license").setDescription("View your active license pass"),
  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Reset your HWID binding or target a specific key link")
    .addStringOption(option => option.setName("key").setDescription("Target license key string (Staff Only)").setRequired(false)),
  new SlashCommandBuilder().setName("keys").setDescription("View active database entries list"),
  new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("Destroy a license token permanently")
    .addStringOption(option => option.setName("key").setDescription("Key code string target").setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Registering commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Commands successfully injected");
  } catch (err) {
    console.error(err);
  }
})();

/* =========================
   MAIN INTERACTION DISPATCHER
========================= */
bot.on("interactionCreate", async interaction => {
  
  if (interaction.isChatInputCommand()) {

    // /BUY COMMAND WITH MODAL TRIGGER
    if (interaction.commandName === "buy") {
      const duration = interaction.options.getString("duration");
      const config = TIER_CONFIG[duration];

      const modal = new ModalBuilder()
        .setCustomId(`buy_modal_${duration}`)
        .setTitle(`🛒 Complete ${config.name} Pass ($${config.expectedCost})`);

      const codeInput = new TextInputBuilder()
        .setCustomId("voucher_code_input")
        .setLabel("Paste your G2A / Rewarble Code Below:")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Paste your 16-digit voucher token code here...")
        .setMinLength(10)
        .setMaxLength(50)
        .setRequired(true);

      const amountInput = new TextInputBuilder()
        .setCustomId("voucher_amount_input")
        .setLabel(`Verify Card Value (Should be ${config.expectedCost}):`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(`Enter your card's dollar value (e.g. ${config.expectedCost})`)
        .setMaxLength(3)
        .setRequired(true);

      const noticeInput = new TextInputBuilder()
        .setCustomId("link_notice")
        .setLabel("G2A Shop Purchasing Link:")
        .setStyle(TextInputStyle.Short)
        .setValue(config.link)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(noticeInput),
        new ActionRowBuilder().addComponents(codeInput),
        new ActionRowBuilder().addComponents(amountInput)
      );

      return interaction.showModal(modal);
    }

    // /CLAIMROBUX COMMAND WITH MODAL TRIGGER
    if (interaction.commandName === "claimrobux") {
      const duration = interaction.options.getString("duration");
      const config = TIER_CONFIG[duration];

      const modal = new ModalBuilder()
        .setCustomId(`robux_modal_${duration}`)
        .setTitle(`🎮 Claim ${config.name} Pass (${config.robuxPrice} Robux)`);

      const robloxInput = new TextInputBuilder()
        .setCustomId("roblox_username_input")
        .setLabel("Enter your EXACT Roblox Username:")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Enter your real username (Not Display Name)")
        .setMinLength(3)
        .setMaxLength(20)
        .setRequired(true);

      const noticeLinkInput = new TextInputBuilder()
        .setCustomId("gamepass_notice")
        .setLabel("Roblox Gamepass Purchase Link:")
        .setStyle(TextInputStyle.Short)
        .setValue(config.gamepassLink)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(noticeLinkInput),
        new ActionRowBuilder().addComponents(robloxInput)
      );

      return interaction.showModal(modal);
    }

    // --- DEFER OTHER SYSTEM COMMANDS SAFELY ---
    await interaction.deferReply({ ephemeral: true });

    // /GENKEY COMMAND
    if (interaction.commandName === "genkey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.editReply({ content: "❌ No permission" });

      const targetUser = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");
      
      await generateAndDeliverKey(targetUser.id, duration, "Manual-Staff");
      return interaction.editReply({ content: `✅ Key generated, Customer role assigned, and DM sent to <@${targetUser.id}>` });
    }

    // /LICENSE COMMAND
    if (interaction.commandName === "license") {
      const foundKey = await LicenseKey.findOne({ userId: interaction.user.id });
      if (!foundKey) return interaction.editReply({ content: "❌ No license found" });

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

      return interaction.editReply({ embeds: [embed] });
    }

    // /RESETHWID COMMAND
    if (interaction.commandName === "resethwid") {
      const inputKey = interaction.options.getString("key");
      const isStaff = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));

      if (inputKey && !isStaff) return interaction.editReply({ content: "❌ No permission." });

      let foundKey;
      if (inputKey) {
        foundKey = await LicenseKey.findOne({ key: inputKey.trim().toUpperCase() });
        if (!foundKey) return interaction.editReply({ content: "❌ Key not found." });
      } else {
        foundKey = await LicenseKey.findOne({ userId: interaction.user.id });
        if (!foundKey) return interaction.editReply({ content: "❌ No key found on your account." });

        if (!isStaff) {
          const cooldown = 24 * 60 * 60 * 1000;
          if (Date.now() - (foundKey.lastReset || 0) < cooldown) {
            const remaining = cooldown - (Date.now() - foundKey.lastReset);
            return interaction.editReply({ content: `⏳ Wait ${Math.ceil(remaining / 3600000)} hours.` });
          }
        }
      }

      foundKey.hwid = null;
      if (!inputKey && !isStaff) foundKey.lastReset = Date.now();
      await foundKey.save();

      return interaction.editReply({ content: "✅ HWID reset successful." });
    }

    // /KEYS COMMAND
    if (interaction.commandName === "keys") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.editReply({ content: "❌ No permission" });

      const keys = await LicenseKey.find().limit(20);
      const formatted = keys.map(k => `🔑 ${k.key}\n👤 <@${k.userId}>\n📅 ${k.expires ? new Date(k.expires).toLocaleDateString() : "Never"}\n`).join("\n");

      return interaction.editReply({ content: formatted || "No keys found" });
    }

    // /REVOKEKEY COMMAND
    if (interaction.commandName === "revokekey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.editReply({ content: "❌ No permission" });

      const normalizedKey = interaction.options.getString("key").trim().toUpperCase();
      const foundKey = await LicenseKey.findOne({ key: normalizedKey });

      if (!foundKey) return interaction.editReply({ content: "❌ Key not found." });

      await LicenseKey.deleteOne({ key: normalizedKey });
      return interaction.editReply({ content: `✅ License key \`${normalizedKey}\` destroyed.` });
    }
  }

  /* --- MODAL INPUT SUBMISSION RECEIVER --- */
  if (interaction.isModalSubmit()) {
    
    // G2A Voucher Pipeline
    if (interaction.customId.startsWith("buy_modal_")) {
      const duration = interaction.customId.split("_")[2];
      const codeValue = interaction.fields.getTextInputValue("voucher_code_input").trim();
      const userClaimedAmount = interaction.fields.getTextInputValue("voucher_amount_input").trim();

      const config = TIER_CONFIG[duration];

      await interaction.deferReply({ ephemeral: true });

      try {
        let alertColor = 0xF59E0B; 
        let fraudWarning = "";

        if (userClaimedAmount !== config.expectedCost) {
          alertColor = 0xFF0000; 
          fraudWarning = `\n\n⚠️ **EXPECTED VALUE MISMATCH!**\nThis tier requires a **$${config.expectedCost}** card, but the user typed **$${userClaimedAmount}**! Double check carefully.`;
        }

        const ticketEmbed = new EmbedBuilder()
          .setTitle("🎟️ New Voucher Verification Request")
          .setColor(alertColor)
          .setDescription(`A user has submitted a checkout code token.${fraudWarning}\n\n*Make sure to copy the code below and look at its true value on Rewarble before clicking Approve!*`)
          .addFields(
            { name: "👤 User Account", value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: "⏱️ Tier Wanted", value: `${config.name.toUpperCase()} ($${config.expectedCost})`, inline: true },
            { name: "💵 User Stated Value", value: `**$${userClaimedAmount}**`, inline: true },
            { name: "📋 Code (Click to Copy)", value: `\`${codeValue}\``, inline: false }
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`v_approve_${interaction.user.id}_${duration}`).setLabel("✅ Valid (Issue Key)").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`v_deny_${interaction.user.id}`).setLabel("❌ Fake / Wrong Amount").setStyle(ButtonStyle.Danger)
        );

        await buyLogger.send({ embeds: [ticketEmbed], components: [row] });

        return interaction.editReply({ 
          content: "✅ **Voucher successfully logged!** Your key code has been routed straight to our staff verification deck. You will automatically receive a direct DM with your system license as soon as it clears." 
        });

      } catch (err) {
        console.error("Modal submission pipeline crash:", err);
        return interaction.editReply({ content: "❌ Failed routing submission data pack. Reach out to management." });
      }
    }

    // AUTOMATED Roblox Gamepass Claims
    if (interaction.customId.startsWith("robux_modal_")) {
      const duration = interaction.customId.split("_")[2];
      const robloxUsername = interaction.fields.getTextInputValue("roblox_username_input").trim();
      const config = TIER_CONFIG[duration];

      await interaction.deferReply({ ephemeral: true });

      // 1. Get Roblox User ID
      const robloxUserId = await getRobloxUserId(robloxUsername);
      if (!robloxUserId) {
        return interaction.editReply({ content: `❌ Could not find a Roblox account matching the username \`${robloxUsername}\`. Please check your spelling.` });
      }

      // 2. Check Ownership status via v2 path matching
      const ownsPass = await checkGamepassOwnership(robloxUserId, config.gamepassId);
      if (!ownsPass) {
        return interaction.editReply({ 
          content: `❌ **Verification Failed:** The account \`${robloxUsername}\` does not own the required Gamepass in their inventory.\n\n*Note: Make sure your Roblox settings have your Inventory Privacy set to Public so the bot can see it!*` 
        });
      }

      // 3. Prevent structural active lifetime overrides
      const keyExists = await LicenseKey.findOne({ userId: interaction.user.id });
      if (keyExists && !keyExists.expires) {
        return interaction.editReply({ content: "⚠️ You already have an active Lifetime license pass on this account!" });
      }

      // 4. Automation check cleared: Deliver key instantly
      await generateAndDeliverKey(interaction.user.id, duration, `Roblox Gamepass (${robloxUsername})`);

      // 5. Fire automated validation log card
      const robuxLog = new EmbedBuilder()
        .setTitle("🎮 Automated Robux License Verification")
        .setColor(0x00FF7F)
        .addFields(
          { name: "👤 Discord User", value: `${interaction.user} (\`${interaction.user.id}\`)` },
          { name: "🖥️ Roblox Account", value: `\`${robloxUsername}\` (${robloxUserId})` },
          { name: "🎟️ Pass Claimed", value: `**${config.name}** (${config.robuxPrice} Robux)` }
        )
        .setTimestamp();

      await buyLogger.send({ embeds: [robuxLog] });

      return interaction.editReply({ content: `🎉 **Success!** Your purchase was verified. Your license key has been auto-generated and sent straight to your DMs!` });
    }
  }

  /* --- STAFF BUTTON MANIPULATOR PIPELINE --- */
  if (interaction.isButton()) {
    const parts = interaction.customId.split("_");
    if (parts[0] !== "v") return; 

    const isStaff = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
    if (!isStaff) return interaction.reply({ content: "❌ Only authorized team accounts can interact with payment tickets.", ephemeral: true });

    const [ , action, targetUserId, duration] = parts;

    await interaction.update({ components: [] });

    if (action === "approve") {
      await generateAndDeliverKey(targetUserId, duration, "G2A-Voucher-Verified");
      return interaction.followUp({ content: `⚡ **Clear:** Issued a **${duration}** access license token straight to <@${targetUserId}>.` });
    }

    if (action === "deny") {
      try {
        const customerUser = await bot.users.fetch(targetUserId);
        if (customerUser) {
          await customerUser.send("❌ **Payment Rejected:** The code voucher input you passed was verified as **invalid**, **empty**, or **already redeemed** on the payout network.");
        }
      } catch {}
      return interaction.followUp({ content: `🛑 **Reject:** Blocked payment assertion claim from <@${targetUserId}>.` });
    }
  }
});

bot.login(DISCORD_TOKEN);

/* =========================
   START EXPRESS SERVER
========================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
