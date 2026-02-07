const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { checkTeamLimits, getUpcomingEvents } = require('../utils/database');
const { createSuccessEmbed, createErrorEmbed, createEventEmbed, createWarningEmbed } = require('../utils/embeds');
const config = require('../config/config');
const { canManageEvents } = require('../utils/permissions');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Manage team events')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new event for your team')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all upcoming events for your team')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete an event (Admin only)')
    ),
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreateEvent(interaction);
    } else if (subcommand === 'list') {
      await handleListEvents(interaction);
    } else if (subcommand === 'delete') {
      await handleDeleteEvent(interaction);
    }
  },
};

// ============================================================================
// CREATE EVENT - Requires team selection first
// ============================================================================

async function handleCreateEvent(interaction) {
  try {
    // Get user's teams
    const userTeams = await getUserTeams(interaction.member);

    if (userTeams.length === 0) {
      const embed = createErrorEmbed(
        'No Team Access',
        'You need to be in a team to create events.\n\n' +
        'Ask an admin to:\n' +
        '1. Create a team with `/team create`\n' +
        '2. Assign you the team role'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (userTeams.length === 1) {
      // Auto-select the only team and show modal
      await showEventCreationModal(interaction, userTeams[0]);
    } else {
      // Let user choose which team
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('team_select_create_event')
        .setPlaceholder('Choose a team for this event')
        .addOptions(
          userTeams.map(team => ({
            label: team.name,
            description: `Players: ${team.players?.length || 0} | Events: ${team.events?.length || 0}`,
            value: team.id
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.reply({
        content: '📋 Select which team this event is for:',
        components: [row],
        ephemeral: true
      });
    }

  } catch (error) {
    console.error('Error in create event:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Create Event',
      'There was an error starting event creation.'
    );
    
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed] });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
}

// ============================================================================
// LIST EVENTS
// ============================================================================

async function handleListEvents(interaction) {
  await interaction.deferReply();

  try {
    const userTeams = await getUserTeams(interaction.member);

    if (userTeams.length === 0) {
      const embed = createErrorEmbed(
        'No Team Access',
        'You are not in any teams.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get events from all user's teams
    const allEvents = [];
    for (const team of userTeams) {
      const teamEvents = await getUpcomingEvents(team.id, 10);
      allEvents.push(...teamEvents.map(e => ({ ...e, teamName: team.name })));
    }

    if (allEvents.length === 0) {
      const embed = createWarningEmbed(
        'No Events',
        'There are no upcoming events for your teams.\n\nCreate one with `/event create`!'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Sort by creation date
    allEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📅 Your Upcoming Events')
      .setDescription(`Showing events from ${userTeams.length} team(s)`)
      .setTimestamp();

    allEvents.slice(0, 10).forEach((event, index) => {
      const responseCount = event.responses?.length || 0;
      const availableCount = event.responses?.filter(r => r.status === 'available').length || 0;

      embed.addFields({
        name: `${index + 1}. ${event.name}`,
        value: 
          `🏆 Team: **${event.teamName}**\n` +
          `📅 ${event.date} at ${event.time}\n` +
          (event.gameType ? `🎮 ${event.gameType}\n` : '') +
          `📊 ${availableCount}/${responseCount} responded`,
        inline: false,
      });
    });

    if (allEvents.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${allEvents.length} events` });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error listing events:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to List Events',
      'There was an error retrieving events.'
    );
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// ============================================================================
// DELETE EVENT
// ============================================================================

async function handleDeleteEvent(interaction) {
  if (!canManageEvents(interaction.member)) {
    const embed = createErrorEmbed(
      'Permission Denied',
      'You need "Manage Server" permission to delete events.'
    );
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  try {
    const userTeams = await getUserTeams(interaction.member);

    if (userTeams.length === 0) {
      const embed = createErrorEmbed(
        'No Team Access',
        'You are not in any teams.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Get all events from user's teams
    const allEvents = [];
    for (const team of userTeams) {
      const teamEvents = await prisma.event.findMany({
        where: { teamId: team.id },
        orderBy: { createdAt: 'desc' },
        take: 25
      });
      allEvents.push(...teamEvents.map(e => ({ ...e, teamName: team.name })));
    }

    if (allEvents.length === 0) {
      const embed = createWarningEmbed(
        'No Events',
        'There are no events to delete.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Create dropdown
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('delete_event_select')
      .setPlaceholder('Choose an event to delete')
      .addOptions(
        allEvents.slice(0, 25).map(event => ({
          label: event.name.length > 100 ? event.name.substring(0, 97) + '...' : event.name,
          description: `${event.teamName} | ${event.date} at ${event.time}`.substring(0, 100),
          value: event.id
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '🗑️ Select an event to delete:',
      components: [row],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error showing delete menu:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Load Events',
      'There was an error loading events.'
    );
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserTeams(member) {
  const teams = await prisma.team.findMany({
    where: {
      guildId: member.guild.id
    },
    include: {
      players: true,
      events: true
    }
  });

  // Filter teams where user has the role
  return teams.filter(team => member.roles.cache.has(team.roleId));
}

async function showEventCreationModal(interaction, team) {
  const modal = new ModalBuilder()
    .setCustomId(`create_event_modal_${team.id}`)
    .setTitle(`Create Event - ${team.name}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('event_name')
    .setLabel('Event Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Tournament Week 5')
    .setRequired(true)
    .setMaxLength(100)
    .setMinLength(3);

  const dateInput = new TextInputBuilder()
    .setCustomId('event_date')
    .setLabel('Event Date')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Feb 15 or February 15, 2025')
    .setRequired(true)
    .setMaxLength(50);

  const timeInput = new TextInputBuilder()
    .setCustomId('event_time')
    .setLabel('Event Time')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('7:00 PM EST or 19:00')
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
    .setPlaceholder('Any extra details about the event...')
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
}