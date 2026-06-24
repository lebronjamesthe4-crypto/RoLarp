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

/* =========================
   INITIALIZATION & CONFIG
========================= */
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

const CLIENT_ID = "1507541333219348570";
const GUILD_ID = "1507127260547645610";

// Role Configurations
const CUSTOMER_ROLE_ID = "1507145590528540822";
const MANAGEMENT_ROLE_ID = "1507127911897890856";
const ADMIN_ROLE_ID = "1507127797607432283";
const SUPPORT_ROLE_ID = "1507128660048478288"; 
const PERMITTED_ROLES = [ADMIN_ROLE_ID, MANAGEMENT_ROLE_ID, SUPPORT_ROLE_ID];

// Webhook Logging Targets
const BUY_TICKET_WEBHOOK_URL = "https://discord.com/api/webhooks/1519217845970538517/EkS7jMhdS9kPpIgdWXHseLn5H4oODTlueHF2K2hS3X03I71IeRToq8dfjjdEEDYcFeRO";
const GENERAL_LOG_WEBHOOK_URL = "https://discord.com/api/webhooks/1519131205088448644/Qqg0scKQyXUDL06h6dp3nJJvVcV0RAaA2JZTIcUk9SvLJKMMQYqQhmhKWak-RDhXw3ir";

const buyLogger = new WebhookClient({ url: BUY_TICKET_WEBHOOK_URL });
const generalLogger = new WebhookClient({ url: GENERAL_LOG_WEBHOOK_URL });

const bot = new Client({ intents: [GatewayIntentBits.Guilds] });

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
   MONGODB DATABASE
========================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB successfully linked"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

const KeySchema = new mongoose.Schema({
  userId: String,
  robloxId: String,
  key: String,
  expires: Number,
  duration: String,
  hwid: String,
  lastReset: Number
});

const LicenseKey = mongoose.model("LicenseKey", KeySchema);

/* =========================
   CORE HELPER FUNCTIONS
========================= */
async function sendActionLog(actionName, executor, descriptionFields = []) {
  try {
    const logEmbed = new EmbedBuilder()
      .setTitle(`🤖 Audit Log: /${actionName}`)
      .setColor(0x00FF00)
      .addFields(
        { name: "👤 Operator", value: `${executor} (\`${executor.id}\`)`, inline: false },
        ...descriptionFields
      )
      .setTimestamp();

    await generalLogger.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error("❌ Failed to forward system webhook log:", err);
  }
}

async function generateAndDeliverKey(userId, duration, fundingSource = "Manual", robloxId = null) {
  const key = "LARP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  let expires = null;
  let expiresText = "Never";

  if (duration === "1day") expires = Date.now() + (24 * 60 * 60 * 1000);
  else if (duration === "7days") expires = Date.now() + (7 * 24 * 60 * 60 * 1000);
  else if (duration === "1month") {
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
    .setDescription("Thank you for your purchase! Your payment authorization cleared successfully.")
    .setColor(0x1E3A8A)
    .addFields(
      { name: "🔑 License Key", value: `\`${key}\`` },
      { name: "📅 Expiration Date", value: expiresText },
      { name: "⬇️ Tool Download", value: DOWNLOAD_LINK },
      { name: "🛠️ Getting Started Guide", value: SETUP_LINK }
    )
    .setFooter({ text: "RoLarp Identity Guard" })
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
    console.warn(`⚠️ Warning: Role assignment / DM dispatch skipped for user ${userId}:`, err.message);
  }

  await sendActionLog("license_provision", { id: userId, toString: () => `<@${userId}>` }, [
    { name: "🔑 Token Distributed", value: `\`${key}\``, inline: true },
    { name: "⏱️ Validity Window", value: duration, inline: true },
    { name: "🧾 Settlement Origin", value: fundingSource, inline: false }
  ]);
}

/* =========================
   EXPRESS REST ENDPOINTS
========================= */
app.post("/validate", async (req, res) => {
  try {
    const { key, hwid } = req.body;
    if (!key) return res.status(400).json({ valid: false, error: "Missing identity token field" });

    const normalized = key.trim().toUpperCase();
    const foundKey = await LicenseKey.findOne({ key: normalized });

    if (!foundKey) return res.status(404).json({ valid: false, error: "License signature mismatch" });
    if (foundKey.expires && Date.now() > foundKey.expires) return res.status(403).json({ valid: false, error: "License window has run out" });
    if (foundKey.hwid && foundKey.hwid !== hwid) return res.status(401).json({ valid: false, error: "Hardware footprint mismatch (HWID)" });

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
  } catch (err) {
    return res.status(500).json({ valid: false, error: "Internal processing vault failure" });
  }
});

/* =========================
   COMMAND DESCRIPTOR SETUP
========================= */
const commands = [
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Purchase or redeem an access pass tier access voucher")
    .addStringOption(opt =>
      opt.setName("duration")
        .setDescription("Select the subscription length")
        .setRequired(true)
        .addChoices(
          { name: "7 Days (Weekly - $3 / Robux)", value: "7days" },
          { name: "1 Month (Monthly - $9 / Robux)", value: "1month" },
          { name: "Lifetime Pass ($20 / Robux)", value: "lifetime" }
        )
    )
    .addStringOption(opt =>
      opt.setName("method")
        .setDescription("Select payment clearing route")
        .setRequired(true)
        .addChoices(
          { name: "G2A / Rewarble Voucher Code", value: "voucher" },
          { name: "Roblox Gamepass Purchase", value: "roblox" }
        )
    ),

  new SlashCommandBuilder()
    .setName("genkey")
    .setDescription("Force-generate an entitlement license (Staff Overrides)")
    .addUserOption(opt => opt.setName("user").setDescription("Target client account").setRequired(true))
    .addStringOption(opt =>
      opt.setName("duration")
        .setDescription("License window span")
        .setRequired(true)
        .addChoices(
          { name: "1 Day", value: "1day" },
          { name: "7 Days", value: "7days" },
          { name: "1 Month", value: "1month" },
          { name: "Lifetime", value: "lifetime" }
        )
    )
    .addStringOption(opt => opt.setName("reason").setDescription("Audit tracking context").setRequired(false)),

  new SlashCommandBuilder().setName("license").setDescription("Inspect your account active core license tracking data"),
  
  new SlashCommandBuilder()
    .setName("resethwid")
    .setDescription("Clear bound machine profile tracking parameters")
    .addStringOption(opt => opt.setName("key").setDescription("Target key value (Staff Only Override)").setRequired(false)),
    
  new SlashCommandBuilder().setName("keys").setDescription("Review top cluster registry access tracking logs"),
  
  new SlashCommandBuilder()
    .setName("revokekey")
    .setDescription("De-authorize and purge an active license record")
    .addStringOption(opt => opt.setName("key").setDescription("Target registration hash value").setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Re-indexing structural application commands...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Infrastructure command indices injected");
  } catch (err) {
    console.error("❌ Critical command syncing aborted:", err);
  }
})();

/* =========================
   ROUTING ROUTINE INTERCHANGES
========================= */
bot.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    
    // 🛒 /BUY ENTRY INTERFACE
    if (interaction.commandName === "buy") {
      const duration = interaction.options.getString("duration");
      const method = interaction.options.getString("method");
      const config = TIER_CONFIG[duration];

      if (method === "roblox") {
        const modal = new ModalBuilder()
          .setCustomId(`buy_modal_roblox_${duration}`)
          .setTitle(`🎒 Claim ${config.name} Roblox Status`);

        const usernameInput = new TextInputBuilder()
          .setCustomId("roblox_username_input")
          .setLabel("Roblox Account Username:")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Exact name (Not system display alias)")
          .setRequired(true);

        const linkNotice = new TextInputBuilder()
          .setCustomId("roblox_link_notice")
          .setLabel("Reference Item Ledger Link:")
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
          .setTitle(`🛒 Clearing ${config.name} ($${config.expectedCost})`);

        const codeInput = new TextInputBuilder()
          .setCustomId("voucher_code_input")
          .setLabel("Voucher Code String (G2A / Rewarble):")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Enter token values here...")
          .setMinLength(10)
          .setMaxLength(50)
          .setRequired(true);

        const amountInput = new TextInputBuilder()
          .setCustomId("voucher_amount_input")
          .setLabel(`Claimed Valuation (Must match: ${config.expectedCost}):`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`e.g. ${config.expectedCost}`)
          .setMaxLength(3)
          .setRequired(true);

        const noticeInput = new TextInputBuilder()
          .setCustomId("link_notice")
          .setLabel("Procurement Shop Portal:")
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

    // 🔨 /GENKEY OVERRIDE ENTRY
    if (interaction.commandName === "genkey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ Access denied: Elevated privileges required.", ephemeral: true });

      const targetUser = interaction.options.getUser("user");
      const duration = interaction.options.getString("duration");
      
      await generateAndDeliverKey(targetUser.id, duration, "Manual-Staff-Override");
      return interaction.reply({ content: `✅ Key provision complete. Member role mapped and dispatch cataloged for <@${targetUser.id}>`, ephemeral: true });
    }

    // 📋 /LICENSE VIEW INTERFACE
    if (interaction.commandName === "license") {
      const foundKey = await LicenseKey.findOne({ userId: interaction.user.id });
      if (!foundKey) return interaction.reply({ content: "❌ No active license signature registered to your account identity.", ephemeral: true });

      const expired = foundKey.expires && Date.now() > foundKey.expires;
      const expiresText = foundKey.expires ? new Date(foundKey.expires).toLocaleDateString() : "Never";

      const embed = new EmbedBuilder()
        .setTitle("🔐 License Configuration Diagnostic")
        .setColor(0x1E3A8A)
        .addFields(
          { name: "🔑 Verification Token", value: `\`${foundKey.key}\`` },
          { name: "📅 Termination Window", value: expiresText, inline: true },
          { name: "⚡ Status Integrity", value: expired ? "⛔ Terminated / Expired" : "🟢 Authorized / Active", inline: true },
          { name: "🖥️ Machine Lock Identity", value: foundKey.hwid || "Not Linked" }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ⚡ /RESETHWID MANAGEMENT INTERFACE
    if (interaction.commandName === "resethwid") {
      const inputKey = interaction.options.getString("key");
      const isStaff = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));

      if (inputKey && !isStaff) return interaction.reply({ content: "❌ Privilege validation failure: Security flag mismatch.", ephemeral: true });

      let foundKey;
      if (inputKey) {
        foundKey = await LicenseKey.findOne({ key: inputKey.trim().toUpperCase() });
        if (!foundKey) return interaction.reply({ content: "❌ Registry index missing: Value string not found.", ephemeral: true });
      } else {
        foundKey = await LicenseKey.findOne({ userId: interaction.user.id });
        if (!foundKey) return interaction.reply({ content: "❌ Account signature doesn't possess a bound tracking token.", ephemeral: true });

        if (!isStaff) {
          const cooldown = 24 * 60 * 60 * 1000;
          if (Date.now() - (foundKey.lastReset || 0) < cooldown) {
            const remaining = cooldown - (Date.now() - foundKey.lastReset);
            return interaction.reply({ content: `⏳ Security lock Active. Please wait ${Math.ceil(remaining / 3600000)} hours before requesting another profile reset.`, ephemeral: true });
          }
        }
      }

      foundKey.hwid = null;
      if (!inputKey && !isStaff) foundKey.lastReset = Date.now();
      await foundKey.save();

      return interaction.reply({ content: "✅ System hardware pairing reset cleared cleanly.", ephemeral: true });
    }

    // 🔍 /KEYS INDEX VIEWER
    if (interaction.commandName === "keys") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ Authorization error.", ephemeral: true });

      const keys = await LicenseKey.find().limit(20);
      const formatted = keys.map(k => `🔑 \`${k.key}\`\n👤 Member: <@${k.userId}>\n📅 Limit: ${k.expires ? new Date(k.expires).toLocaleDateString() : "Never"}\n`).join("\n");

      return interaction.reply({ content: formatted || "Database structural log records returned null.", ephemeral: true });
    }

    // ❌ /REVOKEKEY SYSTEM TERMINATOR
    if (interaction.commandName === "revokekey") {
      const allowed = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
      if (!allowed) return interaction.reply({ content: "❌ Authorization entry flag missing.", ephemeral: true });

      const normalizedKey = interaction.options.getString("key").trim().toUpperCase();
      const foundKey = await LicenseKey.findOne({ key: normalizedKey });

      if (!foundKey) return interaction.reply({ content: "❌ Target key profile mismatch.", ephemeral: true });

      await LicenseKey.deleteOne({ key: normalizedKey });
      return interaction.reply({ content: `✅ De-authorization verified: Token block \`${normalizedKey}\` removed from storage.`, ephemeral: true });
    }
  }

  /* =========================
     MODAL CAPTURE INTERCHANGES
  ========================= */
  if (interaction.isModalSubmit()) {
    
    // 🤖 METHOD A: ROBLOX AUTOMATED PIPELINE
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
        
        if (!userRes.ok) throw new Error(`Roblox lookup returned system status code: ${userRes.status}`);
        const userData = await userRes.json();

        if (!userData.data || userData.data.length === 0) {
          return interaction.editReply({ content: `❌ Verification process halted: Unable to trace account profile under name \`${robloxUsername}\`.` });
        }

        const robloxId = userData.data[0].id;
        const realUsername = userData.data[0].name;

        const duplicateRobloxCheck = await LicenseKey.findOne({ robloxId: robloxId.toString() });
        if (duplicateRobloxCheck) {
          return interaction.editReply({ content: `❌ Claim conflict: This Roblox identity ledger entry (\`${realUsername}\`) is already tied to a pre-existing license key.` });
        }

        const invRes = await fetch(`https://inventory.${ROBLOX_PROXY}/v1/users/${robloxId}/items/GamePass/${config.gamepassId}`);
        if (!invRes.ok) throw new Error(`Roblox API cluster returned validation rejection code: ${invRes.status}`);
        
        const invData = await invRes.json();
        const ownsPass = invData.data && invData.data.length > 0;

        if (!ownsPass) {
          return interaction.editReply({ 
            content: `❌ **Inventory Status Verification Denied**\n\n\`\`\`Property Match Fail: Asset matching the required entitlement pass signature is absent.\`\`\`\nPlease confirm that your Roblox account privacy settings are configured to **Public Inventory** to let the checking engine audit item visibility.` 
          });
        }

        await generateAndDeliverKey(interaction.user.id, duration, `Automated-Roblox (${realUsername})`, robloxId.toString());

        const logEmbed = new EmbedBuilder()
          .setTitle("⚡ Automated Roblox Transfer Asserted")
          .setColor(0x00FF00)
          .setDescription("Entitlement confirmation processed cleanly over high-availability networks.")
          .addFields(
            { name: "👤 Client User", value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: "🎮 Target Profile", value: `[${realUsername}](https://www.roblox.com/users/${robloxId}/profile) (\`${robloxId}\`)` },
            { name: "⏱️ Product Mapped", value: `${config.name.toUpperCase()} License Pass`, inline: true },
            { name: "🛡️ Integrity Evaluation Logs", value: `\`\`\`✅ MATCH SUCCESS: Item status confirmed. Distribution engine complete.\`\`\`` }
          )
          .setTimestamp();

        await buyLogger.send({ embeds: [logEmbed] });

        return interaction.editReply({ 
          content: "🎉 **Entitlement Authenticated!** Your new generation product key is active, guild profile roles have synchronized, and initialization parameters are waiting in your DMs." 
        });

      } catch (err) {
        console.error("🚨 CRITICAL DISRUPTIVE PIPE EXCEPTION:", err.message);
        return interaction.editReply({ 
          content: `❌ **Network pipeline processing checkpoint failure.**\nTrace context data: \`${err.message}\`\nForward this code string snippet to an administrator.` 
        });
      }
    }

    // 🛒 METHOD B: VOUCHER ASSERTER ROUTINE
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
          fraudWarning = `\n\n⚠️ **SECURITY WARNING: ASSERTION VALUATION MISMATCH!**\nSelected access tier requires a **$${config.expectedCost}** voucher profile, but submission stated valuation at **$${userClaimedAmount}**! Verify with extra caution.`;
        }

        const ticketEmbed = new EmbedBuilder()
          .setTitle("🎟️ Manual Voucher Settlement Authorization Requested")
          .setColor(alertColor)
          .setDescription(`A consumer has submitted a code verification challenge block.${fraudWarning}\n\n*Review token validation parameters over settlement systems before confirming issuance indicators!*`)
          .addFields(
            { name: "👤 Request Account", value: `${interaction.user} (\`${interaction.user.id}\`)` },
            { name: "⏱️ Target Scope Pass", value: `${config.name.toUpperCase()} ($${config.expectedCost})`, inline: true },
            { name: "💵 Stated Declared Value", value: `**$${userClaimedAmount}**`, inline: true },
            { name: "📋 Code Context String", value: `\`${codeValue}\``, inline: false }
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`v_approve_${interaction.user.id}_${duration}`)
            .setLabel("✅ Approve Assertion & Ship Key")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`v_deny_${interaction.user.id}`)
            .setLabel("❌ Terminate Request / Fraud Block")
            .setStyle(ButtonStyle.Danger)
        );

        await buyLogger.send({ embeds: [ticketEmbed], components: [row] });

        return interaction.editReply({ 
          content: "✅ **Settlement ticket logged.** Your token signature has been routed to the validation processing engine deck. System notification parameters will hit your direct messaging inbox immediately upon clearance review." 
        });

      } catch (err) {
        console.error("❌ Component routing pipeline crash:", err);
        return interaction.editReply({ content: "❌ Data pipeline exception: Routing packet dropped. Submit an issue file to staff." });
      }
    }
  }

  /* =========================
     INTERACTIVE STAFF DECK CONTROLS
  ========================= */
  if (interaction.isButton()) {
    const parts = interaction.customId.split("_");
    if (parts[0] !== "v") return; 

    const isStaff = interaction.member.roles.cache.some(role => PERMITTED_ROLES.includes(role.id));
    if (!isStaff) return interaction.reply({ content: "❌ Rejection: Account flags don't possess adequate security validation rights.", ephemeral: true });

    const [ , action, targetUserId, duration] = parts;

    try {
      // Remove the buttons to lock interaction state
      await interaction.update({ components: [] });

      if (action === "approve") {
        await generateAndDeliverKey(targetUserId, duration, "Manual-G2A-Voucher-Verified");
        return interaction.followUp({ content: `⚡ **Verification Clearance Approved:** Provisioned a **${duration}** licensing tracking element to <@${targetUserId}>.` });
      }

      if (action === "deny") {
        try {
          const customerUser = await bot.users.fetch(targetUserId);
          if (customerUser) {
            await customerUser.send("❌ **Purchase Verification Challenge Terminated:** Your submitted voucher confirmation index was marked as **empty**, **used**, or **fraudulent** by checking staff.");
          }
        } catch (dmErr) {
          console.warn(`Could not DM user ${targetUserId} regarding rejection notification.`);
        }
        return interaction.followUp({ content: `🛑 **Entitlement Blocked:** Cancelled registration request originating from <@${targetUserId}>.` });
      }
    } catch (err) {
      console.error("Button handling malfunction:", err);
    }
  }
});

/* =========================
   SERVER BOOT SEQUENCE
========================= */
bot.once("ready", () => {
  console.log(`✅ Gateway Connection Established: Authorized as ${bot.user.tag}`);
});

bot.login(DISCORD_TOKEN);

app.listen(PORT, () => {
  console.log(`🚀 API Microservice listening on port [${PORT}]`);
});
