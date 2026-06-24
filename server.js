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
mongoose.connect(process.env.MONGO_URI || "mongodb+srv://braxakaD1:5P3MuihDfiyCLU@rolarp.32myf7e.mongodb.net/?appName=RoLarp")
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err));

const KeySchema = new mongoose.Schema({
  userId: String,       // Discord User ID
  robloxId: String,     // Roblox User ID
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
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || "MTUwNzU0MTMzMzIxOTM0ODU3MA.G9SIDJ.Nn2qoDw3UQXZ1I7oaoBjCN-uEzauGL9DmNBzZU";

const CLIENT_ID = "1507541333219348570";
const GUILD_ID = "1507127260547645610";

const CUSTOMER_ROLE_ID = "1507145590528540822";
const MANAGEMENT_ROLE_ID = "1507127911897890856";
const ADMIN_ROLE_ID = "1507127797607432283";
const SUPPORT_ROLE_ID = "1507128660048478288"; 

const PERMITTED_ROLES = [ADMIN_ROLE_ID, MANAGEMENT_ROLE_ID, SUPPORT_ROLE_ID];

// 🌟 LIVE CHANNEL & WEBHOOK ROUTING (WITH DIRECT INLINE STRINGS FALLBACK) 🌟
const BUY_TICKET_WEBHOOK_URL = process.env.BUY_TICKET_WEBHOOK_URL || "https://discord.com/api/webhooks/1519217845970538517/EkS7jMhdS9kPpIgdWXHseLn5H4oODTlueHF2K2hS3X03I71IeRToq8dfjjdEEDYcFeRO";
const GENERAL_LOG_WEBHOOK_URL = process.env.GENERAL_LOG_WEBHOOK_URL || "https://discord.com/api/webhooks/1519131205088448644/Qqg0scKQyXUDL06h6dp3nJJvVcV0RAaA2JZTIcUk9SvLJKMMQYqQhmhKWak-RDhXw3ir";

const buyLogger = new WebhookClient({ url: BUY_TICKET_WEBHOOK_URL });
const generalLogger = new WebhookClient({ url: GENERAL_LOG_WEBHOOK_URL });

/* =========================
   SHOP LINKS & PRICING
========================= */
const TIER_CONFIG = {
  "7days": {
    name: "Weekly",
    expectedCost: "3",
    link: "https://www.g2a.com/paypal-gift-card-3-usd-by-rewarble-global-i10000339995140",
    gamepassId: "1873036358",
    gamepassLink: "https://www.roblox.com/game-pass/1873036358/Weekly-Key"
  },
  "1month": {
    name: "Monthly",
    expectedCost: "9",
    link: "https://www.g2a.com/paypal-gift-card-9-usd-by-rewarble-global-i10000339995081",
    gamepassId: "1891480404",
    gamepassLink: "https://www.roblox.com/game-pass/1891480404/Monthly-Key"
  },
  "lifetime": {
    name: "Lifetime",
    expectedCost: "20",
    link: "https://www.g2a.com/paypal-gift-card-20-usd-by-rewarble-global-i10000339995011",
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

async function generateAndDeliverKey(userId, duration, fundingSource = "Manual", robloxId = null) {
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
    robloxId,
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
    .setDescription("Purchase or redeem an access pass tier access voucher")
    .addStringOption(option =>
      option.setName("duration")
        .setDescription("Select the time pass you want to obtain")
        .setRequired(true)
        .addChoices(
          { name: "7 Days (Weekly - $3 / Robux)", value: "7days" },
          { name: "1 Month (Monthly - $9 / Robux)", value: "1month" },
          { name: "Lifetime Pass ($20 / Robux)", value: "lifetime" }
        )
    )
    .addStringOption(option =>
      option.setName("method")
        .setDescription("Select how you paid for your purchase")
        .setRequired(true)
        .addChoices(
          { name: "G2A / Rewarble Voucher", value: "voucher" },
          { name: "Roblox Gamepass", value: "roblox" }
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
    if (interaction.commandName === "buy") {
      const duration = interaction.options.getString("duration");
      const method = interaction.options.getString("method");
      const config = TIER_CONFIG[duration];

      if (method === "roblox") {
        const modal = new ModalBuilder()
          .setCustomId(`buy_modal_roblox_${duration}`)
          .setTitle(`🎒 Verify ${config.name} Gamepass Purchase`);

        const usernameInput = new TextInputBuilder()
          .setCustomId("roblox_username_input")
          .setLabel("Your Roblox Username:")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter your exact Roblox username (NOT display name)")
          .setRequired(true);

        const linkNotice = new TextInputBuilder()
          .setCustomId("roblox_link_notice")
          .setLabel("Roblox Gamepass Purchase Link:")
          .setStyle(TextInputStyle.Short)
          .setValue(config.gamepassLink)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(linkNotice),
          new ActionRowBuilder().addComponents(usernameInput)
        );

        return interaction.showModal(modal);
      } else {
        const modal = new ModalBuilder()
          .setCustomId(`buy_modal_voucher_${duration}`)
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
    }

    if (interaction.commandName === "genkey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const targetUser = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");
      
      await generateAndDeliverKey(targetUser.id, duration, "Manual-Staff");
      return interaction.reply({ content: `✅ Key generated, Customer role assigned, and DM sent to <@${targetUser.id}>`, ephemeral: true });
    }

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

    if (interaction.commandName === "keys") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ No permission", ephemeral: true });

      const keys = await LicenseKey.find().limit(20);
      const formatted = keys.map(k => `🔑 ${k.key}\n👤 <@${k.userId}>\n📅 ${k.expires ? new Date(k.expires).toLocaleDateString() : "Never"}\n`).join("\n");

      return interaction.reply({ content: formatted || "No keys found", ephemeral: true });
    }

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

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("buy_modal_roblox_")) {
      const duration = interaction.customId.split("_")[3];
      const robloxUsername = interaction.fields.getTextInputValue("roblox_username_input").trim();
      const config = TIER_CONFIG[duration];

      await interaction.deferReply({ ephemeral: true });

      try {
        const ROBLOX_PROXY = "roproxy.com"; 

        const userRes = await fetch(`https://users.${ROBLOX_PROXY}/v1/usernames/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: false })
        });
        
        if (!userRes.ok) throw new Error(`Roblox Account Lookup Server responded with code: ${userRes.status}`);
        const userData = await userRes.json();

        if (!userData.data || userData.data.length === 0) {
          return interaction.editReply({ content: `❌ Could not find an active Roblox account named \`${robloxUsername}\`.` });
        }

        const robloxId = userData.data[0].id;
        const realUsername = userData.data[0].name;

        const duplicateRobloxCheck = await LicenseKey.findOne({ robloxId: robloxId.toString() });
        if (duplicateRobloxCheck) {
          return interaction.editReply({ content: `❌ This Roblox account (\`${realUsername}\`) has already been used to claim a license key.` });
        }

        const invRes = await fetch(`https://inventory.${ROBLOX_PROXY}/v1/users/${robloxId}/items/GamePass/${config.gamepassId}`);
        if (!invRes.ok) throw new Error(`Roblox Inventory Database Server responded with code: ${invRes.status}`);
        
        const invData = await invRes.json();
        const ownsPass = invData.data && invData.data.length > 0;

        if (!ownsPass) {
          return interaction.editReply({ 
            content: `❌ **Verification Failed!**\n\n\`\`\`❌ NOT OWNED: The specified gamepass could not be found in your inventory.\`\`\`\nMake sure your Roblox privacy settings are configured to **Public Inventory**.` 
          });
        }

        await generateAndDeliverKey(interaction.user.id, duration, `Automated-Roblox (${realUsername})`, robloxId.toString());

        const logEmbed = new EmbedBuilder()
          .setTitle("⚡ Automated Roblox Purchase Verified")
          .setColor(0x00FF00)
          .setDescription("The system successfully verified a valid Gamepass item transfer.")
          .addFields(
            { name: "👤 Discord Client", value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: "🎮 Roblox Profile", value: `[${realUsername}](https://www.roblox.com/users/${robloxId}/profile) (\`${robloxId}\`)` },
            { name: "⏱️ Product Distributed", value: `${config.name.toUpperCase()} License Pass`, inline: true }
          )
          .setTimestamp();

        await buyLogger.send({ embeds: [logEmbed] });

        return interaction.editReply({ 
          content: "🎉 **Purchase Verified Successfully!** Your system license key has been instantly generated and sent to your DMs!" 
        });

      } catch (err) {
        console.error("🚨 ROBLOX AUTOMATION PIPELINE CRASH:", err.message);
        return interaction.editReply({ 
          content: `❌ **Internal system pipeline failure.**\nDetails: \`${err.message}\`` 
        });
      }
    }

    if (interaction.customId.startsWith("buy_modal_voucher_")) {
      const duration = interaction.customId.split("_")[3];
      const codeValue = interaction.fields.getTextInputValue("voucher_code_input").trim();
      const userClaimedAmount = interaction.fields.getTextInputValue("voucher_amount_input").trim();
      const config = TIER_CONFIG[duration];

      await interaction.deferReply({ ephemeral: true });

      try {
        let alertColor = 0xF59E0B; 
        let fraudWarning = "";

        if (userClaimedAmount !== config.expectedCost) {
          alertColor = 0xFF0000; 
          fraudWarning = `\n\n⚠️ **EXPECTED VALUE MISMATCH!**\nThis tier requires a **$${config.expectedCost}** card, but the user typed **$${userClaimedAmount}**!`;
        }

        const ticketEmbed = new EmbedBuilder()
          .setTitle("🎟️ New Voucher Verification Request")
          .setColor(alertColor)
          .setDescription(`A user has submitted a checkout code token.${fraudWarning}`)
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

        await buyLogger.send({ embeds: [ticketEmbed], components: [row] });

        return interaction.editReply({ 
          content: "✅ **Voucher successfully logged!** Your key code has been routed straight to our staff verification deck." 
        });

      } catch (err) {
        console.error("Modal submission pipeline crash:", err);
        return interaction.editReply({ content: "❌ Failed routing submission data pack." });
      }
    }
  }

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
          await customerUser.send("❌ **Payment Rejected:** The code voucher input you passed was verified as invalid.");
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
  console.log(`🚀 Server running on port ${PORT}`);
});
