require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader');
const { startCleanupJob } = require('./utils/cleanupJob');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// Load commands
loadCommands(client);

// Bot ready event
client.once('ready', () => {
  console.log('═══════════════════════════════════════');
  console.log('✅ Bot is online!');
  console.log(`📛 Logged in as: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`📊 Servers: ${client.guilds.cache.size}`);
  console.log(`👥 Users: ${client.users.cache.size}`);
  console.log(`📋 Commands loaded: ${client.commands.size}`);
  console.log('═══════════════════════════════════════');

  // Start cleanup job
  startCleanupJob();
});

// ============================================================================
// INTERACTION HANDLER - Handles all interactions
// ============================================================================

client.on('interactionCreate', async interaction => {
  console.log('\n🔔 Interaction:', {
    type: interaction.type,
    user: interaction.user.tag,
    id: interaction.customId || interaction.commandName
  });

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`❌ Command not found: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      console.log(`✅ Executed: /${interaction.commandName}`);
    } catch (error) {
      console.error(`❌ Command error:`, error);
      
      const errorResponse = { 
        content: '❌ An error occurred while executing this command!', 
        ephemeral: true 
      };
      
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorResponse);
        } else {
          await interaction.reply(errorResponse);
        }
      } catch (err) {
        console.error('Failed to send error message:', err);
      }
    }
  }
  
  // Handle modal submissions
  else if (interaction.isModalSubmit()) {
    console.log('📝 Modal submitted:', interaction.customId);
    
    if (interaction.customId === 'create_team_modal') {
      await handleTeamModalSubmit(interaction);
    } else if (interaction.customId.startsWith('create_event_modal_')) {
      await handleEventModalSubmit(interaction);
    }
  }
  
  // Handle dropdown/select menu interactions
  else if (interaction.isStringSelectMenu()) {
    console.log('📋 Dropdown:', interaction.customId, '→', interaction.values[0]);
    
    if (interaction.customId === 'delete_event_select') {
      await handleDeleteEventSelect(interaction);
    } else if (interaction.customId === 'delete_team_select') {
      await handleDeleteTeamSelect(interaction);
    } else if (interaction.customId === 'team_role_select') {
      await handleTeamRoleSelect(interaction);
    } else if (interaction.customId === 'team_select_create_event') {
      await handleTeamSelectForEvent(interaction);
    }
  }
});

// ============================================================================
// TEAM MODAL SUBMISSION HANDLER
// ============================================================================

async function handleTeamModalSubmit(interaction) {
  console.log('🏆 Processing team creation...');
  
  try {
    const { sanitizeInput } = require('./utils/validation');
    const { createSuccessEmbed, createErrorEmbed } = require('./utils/embeds');
    const { StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');

    let teamName = interaction.fields.getTextInputValue('team_name');
    teamName = sanitizeInput(teamName, 100);

    console.log('Team name:', teamName);

    // Validate team name
    if (!teamName || teamName.length < 3) {
      const embed = createErrorEmbed(
        'Invalid Team Name',
        'Team name must be at least 3 characters long.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Get all server roles (exclude @everyone and bot roles)
    const roles = interaction.guild.roles.cache
      .filter(role => 
        !role.managed && // Not a bot role
        role.id !== interaction.guild.id && // Not @everyone
        role.name !== '@everyone'
      )
      .sort((a, b) => b.position - a.position)
      .first(25); // Discord dropdown limit

    if (roles.length === 0) {
      const embed = createErrorEmbed(
        'No Roles Available',
        'There are no available roles in this server.\n\n' +
        '**To create a team:**\n' +
        '1. Create a Discord role first (Server Settings → Roles)\n' +
        '2. Then run `/team create` again'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    console.log(`Found ${roles.length} available roles`);

    // Create role selection dropdown
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('team_role_select')
      .setPlaceholder('Select the role that represents this team')
      .addOptions(
        roles.map(role => ({
          label: role.name.length > 100 ? role.name.substring(0, 97) + '...' : role.name,
          description: `${role.members.size} members with this role`,
          value: `${teamName}|||${role.id}` // Store both team name and role ID
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: `🏆 **Creating Team: ${teamName}**\n\nWhich Discord role should be linked to this team?\nMembers with this role will automatically be added to the team.`,
      components: [row],
      ephemeral: true
    });

    console.log('✅ Role selection menu sent');

  } catch (error) {
    console.error('❌ Team modal error:', error);
    const { createErrorEmbed } = require('./utils/embeds');
    const errorEmbed = createErrorEmbed(
      'Failed to Create Team',
      `Error: ${error.message}\n\nPlease try again or contact support.`
    );
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [errorEmbed] });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}

// ============================================================================
// TEAM ROLE SELECTION HANDLER
// ============================================================================

async function handleTeamRoleSelect(interaction) {
  await interaction.deferUpdate();

  try {
    console.log('🎯 Creating team with role:', interaction.values[0]);
    
    const { createSuccessEmbed, createErrorEmbed } = require('./utils/embeds');
    const [teamName, roleId] = interaction.values[0].split('|||');

    console.log('Team details:', { teamName, roleId, guildId: interaction.guild.id });

    // Check if team with this role already exists
    const existingTeam = await prisma.team.findUnique({
      where: { roleId: roleId }
    });

    if (existingTeam) {
      const embed = createErrorEmbed(
        'Role Already Linked',
        `This role is already linked to the team: **${existingTeam.name}**\n\n` +
        'Each role can only be linked to one team.\n\n' +
        'Either:\n' +
        '• Choose a different role\n' +
        '• Delete the existing team with `/team delete`'
      );
      return await interaction.editReply({ embeds: [embed], components: [] });
    }

    // Create the team
    const team = await prisma.team.create({
      data: {
        guildId: interaction.guild.id,
        name: teamName,
        roleId: roleId,
        createdBy: interaction.user.id
      }
    });

    console.log('✅ Team created:', team.id);

    // Get the role for display
    const role = interaction.guild.roles.cache.get(roleId);

    const embed = createSuccessEmbed(
      'Team Created Successfully!',
      `🏆 **${teamName}** has been created!\n\n` +
      `👥 **Team Role:** ${role ? `@${role.name}` : 'Unknown'}\n` +
      `📊 **Current Members:** ${role ? role.members.size : 0}\n\n` +
      `**What's Next?**\n` +
      `• Members with the ${role ? `@${role.name}` : 'team'} role are automatically part of this team\n` +
      `• Create events with \`/event create\`\n` +
      `• View your team with \`/team list\``
    );

    await interaction.editReply({ embeds: [embed], components: [] });

  } catch (error) {
    console.error('❌ Team creation error:', error);
    const { createErrorEmbed } = require('./utils/embeds');
    const errorEmbed = createErrorEmbed(
      'Failed to Create Team',
      `Database error: ${error.message}\n\nPlease try again or contact support.`
    );
    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

// ============================================================================
// DELETE TEAM HANDLER
// ============================================================================

async function handleDeleteTeamSelect(interaction) {
  await interaction.deferUpdate();

  try {
    console.log('🗑️ Deleting team:', interaction.values[0]);
    
    const { createSuccessEmbed, createErrorEmbed } = require('./utils/embeds');
    const teamId = interaction.values[0];

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        _count: {
          select: { players: true, events: true }
        }
      }
    });

    if (!team) {
      const embed = createErrorEmbed(
        'Team Not Found',
        'This team no longer exists.'
      );
      return await interaction.editReply({ embeds: [embed], components: [] });
    }

    // Delete the team (cascades to players and events)
    await prisma.team.delete({
      where: { id: teamId }
    });

    console.log(`✅ Team deleted: ${team.name} (${team._count.events} events, ${team._count.players} players)`);

    const embed = createSuccessEmbed(
      'Team Deleted',
      `**${team.name}** has been permanently deleted.\n\n` +
      `📊 **Removed:**\n` +
      `• ${team._count.players} player${team._count.players !== 1 ? 's' : ''}\n` +
      `• ${team._count.events} event${team._count.events !== 1 ? 's' : ''}\n\n` +
      `All associated data has been removed.`
    );

    await interaction.editReply({ embeds: [embed], components: [] });

  } catch (error) {
    console.error('❌ Team deletion error:', error);
    const { createErrorEmbed } = require('./utils/embeds');
    const errorEmbed = createErrorEmbed(
      'Failed to Delete Team',
      `Error: ${error.message}\n\nPlease try again.`
    );
    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

// ============================================================================
// EVENT MODAL SUBMISSION HANDLER
// ============================================================================

async function handleEventModalSubmit(interaction) {
  await interaction.deferReply();

  try {
    const { isValidDate, isValidTime, sanitizeInput } = require('./utils/validation');
    const { checkTeamLimits } = require('./utils/database');
    const { createSuccessEmbed, createErrorEmbed, createEventEmbed, createWarningEmbed } = require('./utils/embeds');
    const config = require('./config/config');

    // Extract team ID from modal custom ID (format: create_event_modal_TEAM_ID)
    const teamId = interaction.customId.replace('create_event_modal_', '');

    console.log('📅 Creating event for team:', teamId);

    // Get form values
    let name = interaction.fields.getTextInputValue('event_name');
    let date = interaction.fields.getTextInputValue('event_date');
    let time = interaction.fields.getTextInputValue('event_time');
    let gameType = interaction.fields.getTextInputValue('event_game') || null;
    let notes = interaction.fields.getTextInputValue('event_notes') || null;

    // Sanitize inputs
    name = sanitizeInput(name, 100);
    date = sanitizeInput(date, 50);
    time = sanitizeInput(time, 50);
    if (gameType) gameType = sanitizeInput(gameType, 50);
    if (notes) notes = sanitizeInput(notes, 500);

    console.log('Event details:', { name, date, time, gameType });

    // Validate event name
    if (!name || name.length < 3) {
      const embed = createErrorEmbed(
        'Invalid Event Name',
        'Event name must be at least 3 characters long.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Validate date
    if (!isValidDate(date)) {
      const embed = createErrorEmbed(
        'Invalid Date Format',
        'Please use a format like:\n' +
        '• "Feb 15"\n' +
        '• "February 15, 2025"\n' +
        '• "2025-02-15"'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Validate time
    if (!isValidTime(time)) {
      const embed = createErrorEmbed(
        'Invalid Time Format',
        'Please use a format like:\n' +
        '• "7PM"\n' +
        '• "7:00 PM EST"\n' +
        '• "19:00"'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get team
    const team = await prisma.team.findUnique({
      where: { id: teamId }
    });

    if (!team) {
      const embed = createErrorEmbed(
        'Team Not Found',
        'The team no longer exists. Please try again.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    console.log('Team found:', team.name);

    // Check team limits
    try {
      const limits = await checkTeamLimits(teamId);

      if (limits.isAtPlayerLimit) {
        const warningEmbed = createWarningEmbed(
          'Team at Player Limit',
          `⚠️ Your team is at the free tier limit of ${limits.maxPlayers} players.\n\n` +
          'The event will be created, but new members won\'t be able to mark availability.\n\n' +
          '💎 Use `/upgrade` to unlock unlimited players!'
        );
        await interaction.followUp({ embeds: [warningEmbed], ephemeral: true });
      }
    } catch (limitError) {
      console.log('Could not check team limits:', limitError.message);
      // Continue anyway - limits are not critical for event creation
    }

    // Create the event embed message
    const eventEmbed = createEventEmbed({
      name,
      date,
      time,
      gameType,
      notes
    });

    console.log('Sending event message to channel...');

    const eventMessage = await interaction.channel.send({ embeds: [eventEmbed] });

    console.log('Event message sent:', eventMessage.id);

    // Add reactions
    try {
      await eventMessage.react(config.emojis.available);
      await eventMessage.react(config.emojis.unavailable);
      await eventMessage.react(config.emojis.maybe);
      console.log('✅ Reactions added');
    } catch (reactionError) {
      console.error('⚠️ Could not add reactions:', reactionError.message);
      // Continue anyway - reactions are helpful but not critical
    }

    // Save event to database
    const event = await prisma.event.create({
      data: {
        teamId: teamId,
        name: name,
        date: date,
        time: time,
        gameType: gameType,
        notes: notes,
        createdBy: interaction.user.id,
        messageId: eventMessage.id,
        channelId: interaction.channel.id
      }
    });

    console.log(`✅ Event created: ${name} (${event.id}) for team ${team.name}`);

    // Send confirmation
    const confirmEmbed = createSuccessEmbed(
      'Event Created!',
      `✅ **${name}** has been created for **${team.name}**!\n\n` +
      `📅 **Date:** ${date}\n` +
      `🕐 **Time:** ${time}\n` +
      (gameType ? `🎮 **Game:** ${gameType}\n` : '') +
      (notes ? `📝 **Notes:** ${notes}\n` : '') +
      `\n**What's Next?**\n` +
      `• Players can react to mark their availability\n` +
      `• View responses with \`/roster event:${name.substring(0, 20)}\`\n` +
      `• Manage with \`/event list\` or \`/event delete\``
    );

    await interaction.editReply({ embeds: [confirmEmbed] });

  } catch (error) {
    console.error('❌ Event creation error:', error);
    const { createErrorEmbed } = require('./utils/embeds');
    const errorEmbed = createErrorEmbed(
      'Failed to Create Event',
      `An error occurred: ${error.message}\n\nPlease try again or contact support.`
    );
    
    try {
      await interaction.editReply({ embeds: [errorEmbed] });
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError);
    }
  }
}

// ============================================================================
// TEAM SELECTION FOR EVENT HANDLER
// ============================================================================

async function handleTeamSelectForEvent(interaction) {
  try {
    const teamId = interaction.values[0];
    
    console.log('📋 Team selected for event:', teamId);

    // Get the team
    const team = await prisma.team.findUnique({
      where: { id: teamId }
    });

    if (!team) {
      const { createErrorEmbed } = require('./utils/embeds');
      const embed = createErrorEmbed(
        'Team Not Found',
        'This team no longer exists. Please try again.'
      );
      return await interaction.update({ embeds: [embed], components: [] });
    }

    console.log('Showing event modal for team:', team.name);

    // Show the event creation modal
    const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

    const modal = new ModalBuilder()
      .setCustomId(`create_event_modal_${teamId}`)
      .setTitle(`Create Event - ${team.name.substring(0, 30)}`);

    const nameInput = new TextInputBuilder()
      .setCustomId('event_name')
      .setLabel('Event Name')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Tournament Week 5, Scrim vs Team X, Practice Session')
      .setRequired(true)
      .setMaxLength(100)
      .setMinLength(3);

    const dateInput = new TextInputBuilder()
      .setCustomId('event_date')
      .setLabel('Event Date')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Feb 15, February 15 2025, or 2025-02-15')
      .setRequired(true)
      .setMaxLength(50);

    const timeInput = new TextInputBuilder()
      .setCustomId('event_time')
      .setLabel('Event Time')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('7:00 PM EST, 19:00, 7PM')
      .setRequired(true)
      .setMaxLength(50);

    const gameInput = new TextInputBuilder()
      .setCustomId('event_game')
      .setLabel('Game Type (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Valorant, CS2, League of Legends, etc.')
      .setRequired(false)
      .setMaxLength(50);

    const notesInput = new TextInputBuilder()
      .setCustomId('event_notes')
      .setLabel('Additional Notes (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Map pool, special instructions, prize pool, etc.')
      .setRequired(false)
      .setMaxLength(500);

    const rows = [
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(dateInput),
      new ActionRowBuilder().addComponents(timeInput),
      new ActionRowBuilder().addComponents(gameInput),
      new ActionRowBuilder().addComponents(notesInput)
    ];

    modal.addComponents(...rows);

    await interaction.showModal(modal);
    
    console.log('✅ Event creation modal shown');

  } catch (error) {
    console.error('❌ Error showing event modal:', error);
    const { createErrorEmbed } = require('./utils/embeds');
    const errorEmbed = createErrorEmbed(
      'Failed to Show Modal',
      `Error: ${error.message}`
    );
    
    try {
      await interaction.update({ embeds: [errorEmbed], components: [] });
    } catch (updateError) {
      console.error('Failed to update interaction:', updateError);
    }
  }
}

// ============================================================================
// DELETE EVENT HANDLER
// ============================================================================

async function handleDeleteEventSelect(interaction) {
  await interaction.deferUpdate();

  try {
    console.log('🗑️ Deleting event:', interaction.values[0]);
    
    const { createSuccessEmbed, createErrorEmbed } = require('./utils/embeds');
    const eventId = interaction.values[0];

    // Find the event
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        team: true,
        _count: {
          select: { responses: true }
        }
      }
    });

    if (!event) {
      const embed = createErrorEmbed(
        'Event Not Found',
        'This event no longer exists.'
      );
      return await interaction.editReply({ embeds: [embed], components: [] });
    }

    // Delete the event (cascades to responses)
    await prisma.event.delete({
      where: { id: eventId }
    });

    console.log(`✅ Event deleted: ${event.name} (${event._count.responses} responses)`);

    // Try to delete the Discord message
    if (event.messageId && event.channelId) {
      try {
        const channel = await interaction.guild.channels.fetch(event.channelId);
        const message = await channel.messages.fetch(event.messageId);
        await message.delete();
        console.log('✅ Deleted event message from Discord');
      } catch (msgError) {
        console.log('⚠️ Could not delete event message:', msgError.message);
      }
    }

    const embed = createSuccessEmbed(
      'Event Deleted',
      `✅ **${event.name}** has been deleted.\n\n` +
      `📊 **Removed:**\n` +
      `• ${event._count.responses} player response${event._count.responses !== 1 ? 's' : ''}\n` +
      `• Event message from Discord\n\n` +
      `Team: ${event.team.name}`
    );

    await interaction.editReply({ 
      embeds: [embed], 
      components: []
    });

  } catch (error) {
    console.error('❌ Event deletion error:', error);
    const { createErrorEmbed } = require('./utils/embeds');
    const errorEmbed = createErrorEmbed(
      'Failed to Delete Event',
      `Error: ${error.message}\n\nPlease try again.`
    );
    await interaction.editReply({ embeds: [errorEmbed], components: [] });
  }
}

// ============================================================================
// ERROR HANDLERS
// ============================================================================

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});





client.on('messageReactionAdd', async (reaction, user) => {
  // Ignore bot reactions
  if (user.bot) return;

  try {
    // Fetch partial messages
    if (reaction.partial) {
      await reaction.fetch();
    }
    if (reaction.message.partial) {
      await reaction.message.fetch();
    }

    console.log(`👍 Reaction from ${user.tag}: ${reaction.emoji.name}`);

    // Check if this is an event message
    const { getEventByMessageId, getOrCreatePlayer, setPlayerResponse } = require('./utils/database');
    
    const event = await getEventByMessageId(reaction.message.id);
    
    if (!event) {
      console.log('Not an event message, ignoring');
      return; // Not an event message
    }

    console.log(`📅 Event reaction: ${event.name} (Team: ${event.team.name})`);

    // Check if user has the team role
    const member = await reaction.message.guild.members.fetch(user.id);
    const hasTeamRole = member.roles.cache.has(event.team.roleId);

    if (!hasTeamRole) {
      console.log(`⚠️ User ${user.tag} doesn't have team role ${event.team.roleId}`);
      
      // Remove their reaction
      await reaction.users.remove(user.id);
      
      // Send them a message
      try {
        await user.send(
          `❌ You don't have the required role for **${event.team.name}**.\n\n` +
          `Only members with the team role can mark availability for this event.`
        );
      } catch (dmError) {
        console.log('Could not DM user:', dmError.message);
      }
      
      return;
    }

    // Determine status based on emoji
    const config = require('./config/config');
    let status = null;

    if (reaction.emoji.name === config.emojis.available || reaction.emoji.toString() === '✅') {
      status = 'available';
    } else if (reaction.emoji.name === config.emojis.unavailable || reaction.emoji.toString() === '❌') {
      status = 'unavailable';
    } else if (reaction.emoji.name === config.emojis.maybe || reaction.emoji.toString() === '❓') {
      status = 'maybe';
    }

    if (!status) {
      console.log(`Unknown emoji: ${reaction.emoji.name}, ignoring`);
      return; // Not a status emoji
    }

    console.log(`Status: ${status}`);

    // Get or create player (auto-adds to database)
    const player = await getOrCreatePlayer(user.id, user.username, event.team.id);
    
    console.log(`✅ Player ensured in database: ${player.username}`);

    // Remove other status reactions from this user
    const message = reaction.message;
    for (const [, messageReaction] of message.reactions.cache) {
      if (messageReaction.emoji.name !== reaction.emoji.name) {
        await messageReaction.users.remove(user.id).catch(() => {});
      }
    }

    // Save their response
    await setPlayerResponse(player.id, event.id, status);

    console.log(`✅ Response saved: ${user.tag} → ${status} for ${event.name}`);

  } catch (error) {
    console.error('❌ Error handling reaction:', error);
  }
});

// ============================================================================
// REACTION REMOVE HANDLER - Remove availability when reaction removed
// ============================================================================

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    console.log(`👎 Reaction removed from ${user.tag}: ${reaction.emoji.name}`);

    const { getEventByMessageId } = require('./utils/database');
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    const event = await getEventByMessageId(reaction.message.id);
    
    if (!event) return;

    console.log(`📅 Reaction removed from event: ${event.name}`);

    // Find the player
    const player = await prisma.player.findFirst({
      where: {
        discordId: user.id,
        teamId: event.teamId
      }
    });

    if (!player) {
      console.log('Player not found in database');
      return;
    }

    // Delete their response
    await prisma.response.deleteMany({
      where: {
        playerId: player.id,
        eventId: event.id
      }
    });

    console.log(`✅ Response removed: ${user.tag} for ${event.name}`);

  } catch (error) {
    console.error('❌ Error handling reaction removal:', error);
  }
});
// ============================================================================
// LOGIN
// ============================================================================

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔐 Login successful'))
  .catch(error => {
    console.error('❌ Login failed:', error);
    process.exit(1);
  });