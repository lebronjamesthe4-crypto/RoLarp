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

// 🌟 LIVE CHANNEL & NEW WEBHOOK ROUTING 🌟
const STAFF_VERIFICATION_CHANNEL_ID = "1519216751844524152"; 

// Webhook A: Handles your /buy claims and approval logs (Updated to your new webhook)
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
    link: "https://www.g2a.com/paypal-gift-card-3-usd-by-rewarble-global-i10000339995140"
  },
  "1month": {
    name: "Monthly",
    expectedCost: "9",
    link: "https://www.g2a.com/paypal-gift-card-9-usd-by-rewarble-global-i10000339995081"
  },
  "lifetime": {
    name: "Lifetime",
    expectedCost: "20",
    link: "https://www.g2a.com/paypal-gift-card-20-usd-by-rewarble-global-i10000339995011"
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

    // ⚡ Auto-assign Customer Role to the target user
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
  intents: [GatewayIntentBits.Guilds]
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

    // /GENKEY COMMAND
    if (interaction.commandName === "genkey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const targetUser = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");
      
      // Fires generateAndDeliverKey helper which automatically grants CUSTOMER_ROLE_ID
      await generateAndDeliverKey(targetUser.id, duration, "Manual-Staff");
      return interaction.reply({ content: `✅ Key generated, Customer role assigned, and DM sent to <@${targetUser.id}>`, ephemeral: true });
    }

    // /LICENSE COMMAND
    if (interaction.commandName === "license") {
      const foundKey = await LicenseKey.findOne({ userId: interaction.user.id });
      if (!foundKey) return interaction.reply({ content: "❌ No license found", ephemeral: true });

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

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // /RESETHWID COMMAND
    if (interaction.commandName === "resethwid") {
      const inputKey = interaction.options.getString("key");
      const isStaff = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));

      if (inputKey && !isStaff) return interaction.reply({ content: "❌ No permission.", ephemeral: true });

      let foundKey;
      if (inputKey) {
        foundKey = await LicenseKey.findOne({ key: inputKey.trim().toUpperCase() });
        if (!foundKey) return interaction.reply({ content: "❌ Key not found.", ephemeral: true });
      } else {
        foundKey = await LicenseKey.findOne({ userId: interaction.user.id });
        if (!foundKey) return interaction.reply({ content: "❌ No key found on your account.", ephemeral: true });

        if (!isStaff) {
          const cooldown = 24 * 60 * 60 * 1000;
          if (Date.now() - (foundKey.lastReset || 0) < cooldown) {
            const remaining = cooldown - (Date.now() - foundKey.lastReset);
            return interaction.reply({ content: `⏳ Wait ${Math.ceil(remaining / 3600000)} hours.`, ephemeral: true });
          }
        }
      }

      foundKey.hwid = null;
      if (!inputKey && !isStaff) foundKey.lastReset = Date.now();
      await foundKey.save();

      return interaction.reply({ content: "✅ HWID reset successful.", ephemeral: true });
    }

    // /KEYS COMMAND
    if (interaction.commandName === "keys") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const keys = await LicenseKey.find().limit(20);
      const formatted = keys.map(k => `🔑 ${k.key}\n👤 <@${k.userId}>\n📅 ${k.expires ? new Date(k.expires).toLocaleDateString() : "Never"}\n`).join("\n");

      return interaction.reply({ content: formatted || "No keys found", ephemeral: true });
    }

    // /REVOKEKEY COMMAND
    if (interaction.commandName === "revokekey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const normalizedKey = interaction.options.getString("key").trim().toUpperCase();
      const foundKey = await LicenseKey.findOne({ key: normalizedKey });

      if (!foundKey) return interaction.reply({ content: "❌ Key not found.", ephemeral: true });

      await LicenseKey.deleteOne({ key: normalizedKey });
      return interaction.reply({ content: `✅ License key \`${normalizedKey}\` destroyed.`, ephemeral: true });
    }
  }

  /* --- MODAL INPUT SUBMISSION RECEIVER --- */
  if (interaction.isModalSubmit()) {
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
          new ButtonBuilder()
            .setCustomId(`v_approve_${interaction.user.id}_${duration}`)
            .setLabel("✅ Valid (Issue Key)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`v_deny_${interaction.user.id}`)
            .setLabel("❌ Fake / Wrong Amount")
            .setStyle(ButtonStyle.Danger)
        );

        // Dispatches right to Webhook A
        await buyLogger.send({ embeds: [ticketEmbed], components: [row] });

        return interaction.editReply({ 
          content: "✅ **Voucher successfully logged!** Your key code has been routed straight to our staff verification deck. You will automatically receive a direct DM with your system license as soon as it clears." 
        });

      } catch (err) {
        console.error("Modal submission pipeline crash:", err);
        return interaction.editReply({ content: "❌ Failed routing submission data pack. Reach out to management." });
      }
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
