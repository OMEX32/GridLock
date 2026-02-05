const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { getOrCreateTeam, getUpcomingEvents, getOrCreatePlayer, setPlayerResponse } = require('../utils/database');
const { createErrorEmbed, createWarningEmbed } = require('../utils/embeds');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('availability')
    .setDescription('Mark your availability for upcoming events'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const team = await getOrCreateTeam(
        interaction.guild.id,
        interaction.guild.name
      );

      const events = await getUpcomingEvents(team.id, 10);

      if (events.length === 0) {
        const embed = createWarningEmbed(
          'No Upcoming Events',
          'There are no upcoming events to mark availability for.\n\nAsk your coach to create an event with `/event create`!'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      // Create event selection menu
      const options = events.map(event => {
        // Find user's current response
        const userResponse = event.responses.find(r => r.player.discordId === interaction.user.id);
        const statusEmoji = userResponse ? 
          (userResponse.status === 'available' ? '✅' : 
           userResponse.status === 'unavailable' ? '❌' : '❓') : '⬜';

        return {
          label: event.name,
          description: `${event.date} at ${event.time} ${statusEmoji}`,
          value: event.id,
        };
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('event_select')
        .setPlaceholder('Select an event to mark availability')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📋 Mark Your Availability')
        .setDescription('Select an event below to mark your availability.\n\n' +
          '✅ = Available | ❌ = Unavailable | ❓ = Maybe | ⬜ = No Response')
        .setFooter({ text: 'Tip: You can also react directly to the event message!' });

      const response = await interaction.editReply({ 
        embeds: [embed], 
        components: [row] 
      });

      // Create collector for the select menu
      const collector = response.createMessageComponentCollector({ 
        time: 300000 // 5 minutes
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return await i.reply({ 
            content: 'This menu is not for you!', 
            ephemeral: true 
          });
        }

        const eventId = i.values[0];
        
        // Show status selection buttons
        await showStatusSelection(i, eventId);
      });

      collector.on('end', () => {
        // Remove components when time expires
        interaction.editReply({ components: [] }).catch(() => {});
      });

    } catch (error) {
      console.error('Error showing availability:', error);
      const errorEmbed = createErrorEmbed(
        'Failed to Load Events',
        'There was an error loading events. Please try again.'
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

async function showStatusSelection(interaction, eventId) {
  const { getEventById, getOrCreatePlayer, setPlayerResponse } = require('../utils/database');
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
  const config = require('../config/config');

  const event = await getEventById(eventId);

  if (!event) {
    return await interaction.reply({
      content: '❌ Event not found!',
      ephemeral: true
    });
  }

  // Create status buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`status_available_${eventId}`)
        .setLabel('Available')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`status_unavailable_${eventId}`)
        .setLabel('Unavailable')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`status_maybe_${eventId}`)
        .setLabel('Maybe')
        .setEmoji('❓')
        .setStyle(ButtonStyle.Secondary)
    );

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`Mark Availability: ${event.name}`)
    .setDescription(`📅 ${event.date} at ${event.time}\n${event.gameType ? `🎮 ${event.gameType}` : ''}`)
    .setFooter({ text: 'Click a button below to mark your status' });

  await interaction.update({ 
    embeds: [embed], 
    components: [row] 
  });

  // Create collector for status buttons
  const message = await interaction.fetchReply();
  const buttonCollector = message.createMessageComponentCollector({ 
    time: 300000 
  });

  buttonCollector.on('collect', async i => {
    if (i.user.id !== interaction.user.id) {
      return await i.reply({ 
        content: 'These buttons are not for you!', 
        ephemeral: true 
      });
    }

    const [, status, ] = i.customId.split('_');

    // Save response
    const player = await getOrCreatePlayer(i.user.id, i.user.username, event.teamId);
    await setPlayerResponse(player.id, eventId, status);

    const statusText = {
      available: '✅ Available',
      unavailable: '❌ Unavailable',
      maybe: '❓ Maybe',
    };

    const confirmEmbed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Availability Updated!')
      .setDescription(`You've been marked as **${statusText[status]}** for:\n\n` +
        `**${event.name}**\n` +
        `📅 ${event.date} at ${event.time}`)
      .setFooter({ text: 'You can change this anytime with /availability' });

    await i.update({ 
      embeds: [confirmEmbed], 
      components: [] 
    });

    buttonCollector.stop();
  });
}