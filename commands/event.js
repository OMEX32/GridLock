const { SlashCommandBuilder } = require('discord.js');
const { getOrCreateTeam, createEvent } = require('../utils/database');
const { createSuccessEmbed, createErrorEmbed, createEventEmbed } = require('../utils/embeds');
const config = require('../config/config');

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
    const name = interaction.options.getString('name');
    const date = interaction.options.getString('date');
    const time = interaction.options.getString('time');
    const gameType = interaction.options.getString('game');

    // Get or create team
    const team = await getOrCreateTeam(
      interaction.guild.id,
      interaction.guild.name
    );

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