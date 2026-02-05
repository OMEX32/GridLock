const { SlashCommandBuilder } = require('discord.js');
const { getOrCreateTeam, createEvent, checkTeamLimits } = require('../utils/database');
const { createSuccessEmbed, createErrorEmbed, createEventEmbed, createWarningEmbed } = require('../utils/embeds');
const config = require('../config/config');
const { isValidDate, isValidTime, sanitizeInput } = require('../utils/validation');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Manage team events')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new event')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Event name (e.g., "Tournament Week 5")')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('date')
            .setDescription('Event date (e.g., "Feb 15" or "February 15, 2025")')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('time')
            .setDescription('Event time (e.g., "7:00 PM EST" or "19:00")')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('game')
            .setDescription('Game type')
            .setRequired(false)
            .addChoices(
              ...config.games.map(game => ({ name: game, value: game }))
            )
        )
    ),
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreateEvent(interaction);
    }
  },
};

async function handleCreateEvent(interaction) {
  await interaction.deferReply();

  try {
    let name = interaction.options.getString('name');
    let date = interaction.options.getString('date');
    let time = interaction.options.getString('time');
    const gameType = interaction.options.getString('game');

    name = sanitizeInput(name, 100);
    date = sanitizeInput(date, 50);
    time = sanitizeInput(time, 50);

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
        'Please use a format like: "Feb 15" or "February 15, 2025"'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    if (!isValidTime(time)) {
      const embed = createErrorEmbed(
        'Invalid Time Format',
        'Please use a format like: "7PM", "7:00 PM EST", or "19:00"'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Get or create team
    const team = await getOrCreateTeam(
      interaction.guild.id,
      interaction.guild.name
    );

    // Check team limits
    const limits = await checkTeamLimits(team.id);

    // Check if at player limit (only matters for reactions, but warn early)
    if (limits.isAtPlayerLimit) {
      const warningEmbed = createWarningEmbed(
        'Team at Player Limit',
        `Your team is at the free tier limit of ${limits.maxPlayers} players.\n\n` +
        'New members won\'t be able to mark availability until you upgrade.\n\n' +
        '💎 Use `/upgrade` to unlock unlimited players and features!'
      );
      await interaction.followUp({ embeds: [warningEmbed], ephemeral: true });
    }

    // Create the event message first
    const eventEmbed = createEventEmbed({
      name,
      date,
      time,
      gameType,
    });

    const eventMessage = await interaction.channel.send({ embeds: [eventEmbed] });

    // Add reactions
    await eventMessage.react(config.emojis.available);
    await eventMessage.react(config.emojis.unavailable);
    await eventMessage.react(config.emojis.maybe);

    // Save event to database
    const event = await createEvent(
      team.id,
      name,
      date,
      time,
      gameType,
      interaction.user.id,
      eventMessage.id,
      interaction.channel.id
    );

    // Send confirmation
    const confirmEmbed = createSuccessEmbed(
      'Event Created!',
      `**${name}** has been created!\n\n` +
      `📅 Date: ${date}\n` +
      `🕐 Time: ${time}\n` +
      (gameType ? `🎮 Game: ${gameType}\n` : '') +
      `\nPlayers can now react to the message above to mark their availability.`
    );

    await interaction.editReply({ embeds: [confirmEmbed] });

  } catch (error) {
    console.error('Error creating event:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Create Event',
      'There was an error creating the event. Please try again.'
    );
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}