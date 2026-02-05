require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

// Initialize commands collection
client.commands = new Collection();

// Load commands
console.log('═══════════════════════════════════════');
console.log('🔄 Loading commands...');
console.log('═══════════════════════════════════════');
loadCommands(client);

client.once('ready', () => {
  console.log('═══════════════════════════════════════');
  console.log(`✅ Bot is online!`);
  console.log(`📛 Logged in as: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`📊 Servers: ${client.guilds.cache.size}`);
  console.log(`👥 Users: ${client.users.cache.size}`);
  console.log(`📋 Commands loaded: ${client.commands.size}`);
  console.log('═══════════════════════════════════════');
});

// Handle slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
    console.log(`✅ ${interaction.user.tag} used /${interaction.commandName}`);
  } catch (error) {
    console.error(`❌ Error executing ${interaction.commandName}:`, error);
    
    const errorMessage = {
      content: '❌ There was an error executing this command!',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Error handling
process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Handle reactions for availability
client.on('messageReactionAdd', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;

  // Fetch partial reactions
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Error fetching reaction:', error);
      return;
    }
  }

  await handleReaction(reaction, user, 'add');
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('Error fetching reaction:', error);
      return;
    }
  }

  await handleReaction(reaction, user, 'remove');
});

async function handleReaction(reaction, user, action) {
  const { getEventByMessageId, getOrCreatePlayer, setPlayerResponse, prisma } = require('./utils/database');
  const config = require('./config/config');

  // Check if this is an event message
  const event = await getEventByMessageId(reaction.message.id);
  if (!event) return;

  // Map emoji to status
  let status = null;
  if (reaction.emoji.name === config.emojis.available) {
    status = 'available';
  } else if (reaction.emoji.name === config.emojis.unavailable) {
    status = 'unavailable';
  } else if (reaction.emoji.name === config.emojis.maybe) {
    status = 'maybe';
  } else {
    return; // Not a valid availability emoji
  }

  if (action === 'add') {
    // Get or create player
    const player = await getOrCreatePlayer(user.id, user.username, event.teamId);

    // Remove other reactions from this user
    const message = reaction.message;
    for (const [, r] of message.reactions.cache) {
      if (r.emoji.name !== reaction.emoji.name) {
        await r.users.remove(user.id).catch(() => {});
      }
    }

    // Save response
    await setPlayerResponse(player.id, event.id, status);

    console.log(`✅ ${user.username} marked as ${status} for ${event.name}`);

    // Send DM confirmation
    try {
      const statusEmoji = {
        available: '✅ Available',
        unavailable: '❌ Unavailable',
        maybe: '❓ Maybe',
      };

      await user.send(
        `You've been marked as **${statusEmoji[status]}** for **${event.name}** on ${event.date} at ${event.time}`
      );
    } catch (error) {
      // User has DMs disabled
      console.log(`Could not DM ${user.username}`);
    }

  } else if (action === 'remove') {
    // Delete response if user removes all reactions
    const player = await prisma.player.findFirst({
      where: {
        discordId: user.id,
        teamId: event.teamId,
      },
    });

    if (player) {
      await prisma.response.deleteMany({
        where: {
          playerId: player.id,
          eventId: event.id,
        },
      });

      console.log(`🗑️ ${user.username} removed response for ${event.name}`);
    }
  }
}

client.login(process.env.DISCORD_TOKEN);