require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Initialize commands collection
client.commands = new Collection();

client.once('ready', () => {
  console.log('═══════════════════════════════════════');
  console.log(`✅ Bot is online!`);
  console.log(`📛 Logged in as: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`📊 Servers: ${client.guilds.cache.size}`);
  console.log(`👥 Users: ${client.users.cache.size}`);
  console.log('═══════════════════════════════════════');
});

client.login(process.env.DISCORD_TOKEN);