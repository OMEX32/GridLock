require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader');
const { startCleanupJob } = require('./utils/cleanupJob');

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
  
  // Start cleanup job
  startCleanupJob();
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
  const { getEventByMessageId, getOrCreatePlayer, setPlayerResponse, prisma, checkTeamLimits } = require('./utils/database');
  const config = require('./config/config');

  const event = await getEventByMessageId(reaction.message.id);
  if (!event) return;

  let status = null;
  if (reaction.emoji.name === config.emojis.available) {
    status = 'available';
  } else if (reaction.emoji.name === config.emojis.unavailable) {
    status = 'unavailable';
  } else if (reaction.emoji.name === config.emojis.maybe) {
    status = 'maybe';
  } else {
    return;
  }

  if (action === 'add') {
    // Check team limits
    const limits = await checkTeamLimits(event.teamId);
    
    // Check if player already exists
    let existingPlayer = await prisma.player.findFirst({
      where: {
        discordId: user.id,
        teamId: event.teamId,
      },
    });

    // If player doesn't exist and team is at limit, block them
    if (!existingPlayer && limits.isAtPlayerLimit) {
      await reaction.users.remove(user.id);
      
      try {
        await user.send(
          `❌ **Team at Player Limit**\n\n` +
          `This team is at the free tier limit of ${limits.maxPlayers} players.\n\n` +
          `Ask your team admin to upgrade to add more players!\n\n` +
          `💎 Upgrade unlocks unlimited players and premium features.`
        );
      } catch (error) {
        console.log(`Could not DM ${user.username} about player limit`);
      }
      
      return;
    }

    const player = await getOrCreatePlayer(user.id, user.username, event.teamId);

    // Remove other reactions
    const message = reaction.message;
    for (const [, r] of message.reactions.cache) {
      if (r.emoji.name !== reaction.emoji.name) {
        await r.users.remove(user.id).catch(() => {});
      }
    }

    await setPlayerResponse(player.id, event.id, status);

    console.log(`✅ ${user.username} marked as ${status} for ${event.name}`);

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
      console.log(`Could not DM ${user.username}`);
    }

  } else if (action === 'remove') {
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