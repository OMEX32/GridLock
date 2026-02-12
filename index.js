require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { loadCommands } = require('./utils/commandLoader');
const { startCleanupJob } = require('./utils/cleanupJob');
const { prisma } = require('./utils/database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// Reaction debounce queue
const reactionQueue = new Map();

// Load commands
console.log('═══════════════════════════════════════');
console.log('🔄 Loading commands...');
console.log('═══════════════════════════════════════');
loadCommands(client);

// ============================================================================
// BOT READY EVENT
// ============================================================================

client.once('clientReady', () => {
  console.log('═══════════════════════════════════════');
  console.log('✅ Bot is online!');
  console.log(`📛 Logged in as: ${client.user.tag}`);
  console.log(`🆔 Bot ID: ${client.user.id}`);
  console.log(`📊 Servers: ${client.guilds.cache.size}`);
  console.log(`👥 Users: ${client.users.cache.size}`);
  console.log(`📋 Commands loaded: ${client.commands.size}`);
  console.log(`💾 Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log('═══════════════════════════════════════');

  // Update bot status
  client.user.setActivity(`/help | ${client.guilds.cache.size} servers`, { 
    type: 'WATCHING' 
  });

  // Start cleanup job
  startCleanupJob();
  
  // Log stats every 6 hours
  setInterval(() => {
    const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const uptime = (process.uptime() / 3600).toFixed(2);
    console.log('📊 Performance Stats:');
    console.log(`  Servers: ${client.guilds.cache.size}`);
    console.log(`  Users: ${client.users.cache.size}`);
    console.log(`  Memory: ${memory} MB`);
    console.log(`  Uptime: ${uptime} hours`);
  }, 6 * 60 * 60 * 1000);
});

// ============================================================================
// INTERACTION HANDLER - Handles all slash commands and interactions
// ============================================================================

client.on('interactionCreate', async interaction => {
  console.log('\n' + '═'.repeat(50));
  console.log('🔔 INTERACTION DETECTED');
  console.log('Type:', interaction.type);
  console.log('Is Command?', interaction.isChatInputCommand());
  console.log('Command Name:', interaction.commandName || 'N/A');
  console.log('User:', interaction.user.tag);
  console.log('Guild:', interaction.guild?.name || 'DM');
  console.log('Channel:', interaction.channel?.name || 'Unknown');
  console.log('═'.repeat(50));

  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    console.log('📋 Command in collection?', command ? 'YES ✅' : 'NO ❌');

    if (!command) {
      console.error(`❌ Command "${interaction.commandName}" not found in collection!`);
      
      try {
        await interaction.reply({
          content: `❌ Command \`/${interaction.commandName}\` is not available!\n\n**Available commands:**\n${Array.from(client.commands.keys()).map(cmd => `\`/${cmd}\``).join(', ')}`,
          ephemeral: true
        });
      } catch (replyError) {
        console.error('❌ Failed to reply:', replyError.message);
      }
      return;
    }

    try {
      console.log(`🚀 EXECUTING COMMAND: ${interaction.commandName}`);
      const startTime = Date.now();
      
      await command.execute(interaction);
      
      const duration = Date.now() - startTime;
      console.log(`✅ COMMAND COMPLETED: ${interaction.commandName} (${duration}ms)`);
      
    } catch (error) {
      console.error('❌ COMMAND EXECUTION ERROR:');
      console.error('Command:', interaction.commandName);
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      
      const errorResponse = { 
        content: `❌ An error occurred while executing this command!\n\n**Error:** \`${error.message}\`\n\nThis has been logged. Please try again or contact support.`, 
        ephemeral: true 
      };
      
      try {
        if (interaction.replied) {
          console.log('Already replied, sending followUp...');
          await interaction.followUp(errorResponse);
        } else if (interaction.deferred) {
          console.log('Deferred, editing reply...');
          await interaction.editReply(errorResponse);
        } else {
          console.log('Not replied yet, sending reply...');
          await interaction.reply(errorResponse);
        }
      } catch (err) {
        console.error('❌ Failed to send error message:', err.message);
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

    if (!teamName || teamName.length < 3) {
      const embed = createErrorEmbed(
        'Invalid Team Name',
        'Team name must be at least 3 characters long.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const roles = interaction.guild.roles.cache
      .filter(role => 
        !role.managed &&
        role.id !== interaction.guild.id &&
        role.name !== '@everyone'
      )
      .sort((a, b) => b.position - a.position)
      .first(25);

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

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('team_role_select')
      .setPlaceholder('Select the role that represents this team')
      .addOptions(
        roles.map(role => ({
          label: role.name.length > 100 ? role.name.substring(0, 97) + '...' : role.name,
          description: `${role.members.size} members with this role`,
          value: `${teamName}|||${role.id}`
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: `🏆 **Creating Team: ${teamName}**\n\nWhich Discord role should be linked to this team?\nMembers with this role will automatically be part of the team.`,
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

    const existingTeam = await prisma.team.findFirst({
      where: { 
        guildId: interaction.guild.id,
        roleId: roleId 
      }
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

    const team = await prisma.team.create({
      data: {
        guildId: interaction.guild.id,
        name: teamName,
        roleId: roleId,
        createdBy: interaction.user.id
      }
    });

    console.log('✅ Team created:', team.id);

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

    const teamId = interaction.customId.replace('create_event_modal_', '');

    console.log('📅 Creating event for team:', teamId);

    let name = interaction.fields.getTextInputValue('event_name');
    let date = interaction.fields.getTextInputValue('event_date');
    let time = interaction.fields.getTextInputValue('event_time');
    let gameType = interaction.fields.getTextInputValue('event_game') || null;
    let notes = interaction.fields.getTextInputValue('event_notes') || null;

    name = sanitizeInput(name, 100);
    date = sanitizeInput(date, 50);
    time = sanitizeInput(time, 50);
    if (gameType) gameType = sanitizeInput(gameType, 50);
    if (notes) notes = sanitizeInput(notes, 500);

    console.log('Event details:', { name, date, time, gameType });

    if (!name || name.length < 3) {
      const embed = createErrorEmbed(
        'Invalid Event Name',
        'Event name must be at least 3 characters long.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

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
    }

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

    try {
      await eventMessage.react(config.emojis.available);
      await eventMessage.react(config.emojis.unavailable);
      await eventMessage.react(config.emojis.maybe);
      console.log('✅ Reactions added');
    } catch (reactionError) {
      console.error('⚠️ Could not add reactions:', reactionError.message);
    }

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

    await prisma.event.delete({
      where: { id: eventId }
    });

    console.log(`✅ Event deleted: ${event.name} (${event._count.responses} responses)`);

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
// REACTION ADD HANDLER
// ============================================================================

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  const key = `${user.id}-${reaction.message.id}`;
  
  if (reactionQueue.has(key)) {
    clearTimeout(reactionQueue.get(key));
  }
  
  const timeout = setTimeout(async () => {
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      console.log(`👍 Reaction from ${user.tag}: ${reaction.emoji.name}`);

      const { getEventByMessageId, getOrCreatePlayer, setPlayerResponse } = require('./utils/database');
      
      const event = await getEventByMessageId(reaction.message.id);
      
      if (!event) {
        console.log('Not an event message, ignoring');
        return;
      }

      console.log(`📅 Event reaction: ${event.name} (Team: ${event.team.name})`);

      const member = await reaction.message.guild.members.fetch(user.id);
      const hasTeamRole = member.roles.cache.has(event.team.roleId);

      if (!hasTeamRole) {
        console.log(`⚠️ User ${user.tag} doesn't have team role`);
        
        await reaction.users.remove(user.id);
        
        try {
          await user.send(
            `❌ You don't have the required role for **${event.team.name}**.\n\n` +
            `Only members with the team role can mark availability.`
          );
        } catch (dmError) {
          console.log('Could not DM user:', dmError.message);
        }
        
        return;
      }

      const emojiStr = reaction.emoji.toString();
      let status = null;

      if (emojiStr === '✅') {
        status = 'available';
      } else if (emojiStr === '❌') {
        status = 'unavailable';
      } else if (emojiStr === '❓') {
        status = 'maybe';
      } else {
        console.log(`Unknown emoji: ${emojiStr}, ignoring`);
        return;
      }

      console.log(`Status: ${status}`);

      try {
        const player = await getOrCreatePlayer(user.id, user.username, event.team.id);
        console.log(`✅ Player ensured in database: ${player.username}`);

        const message = reaction.message;
        for (const [, messageReaction] of message.reactions.cache) {
          if (messageReaction.emoji.toString() !== emojiStr) {
            await messageReaction.users.remove(user.id).catch(() => {});
          }
        }

        await setPlayerResponse(player.id, event.id, status);

        console.log(`✅ Response saved: ${user.tag} → ${status} for ${event.name}`);

      } catch (playerError) {
        if (playerError.isLimitError) {
          console.log(`⚠️ Player limit reached: ${user.tag}`);
          
          await reaction.users.remove(user.id);
          
          try {
            await user.send(
              `❌ **Team at Player Limit**\n\n` +
              `The team **${event.team.name}** is at the free tier limit.\n\n` +
              `Ask your team admin to upgrade!`
            );
          } catch (dmError) {
            console.log('Could not DM user about limit:', dmError.message);
          }
        } else {
          throw playerError;
        }
      }

    } catch (error) {
      console.error('❌ Error handling reaction:', error);
    } finally {
      reactionQueue.delete(key);
    }
  }, 500);
  
  reactionQueue.set(key, timeout);
});

// ============================================================================
// REACTION REMOVE HANDLER
// ============================================================================

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    console.log(`👎 Reaction removed from ${user.tag}: ${reaction.emoji.name}`);

    const { getEventByMessageId } = require('./utils/database');
    
    const event = await getEventByMessageId(reaction.message.id);
    
    if (!event) return;

    console.log(`📅 Reaction removed from event: ${event.name}`);

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
// GRACEFUL SHUTDOWN
// ============================================================================

async function shutdown() {
  console.log('\n🛑 Shutting down gracefully...');
  
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected');
    
    client.destroy();
    console.log('✅ Discord client destroyed');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

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

// ============================================================================
// LOGIN
// ============================================================================

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔐 Login successful'))
  .catch(error => {
    console.error('❌ Login failed:', error);
    process.exit(1);
  });