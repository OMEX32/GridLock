const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { getGuildTeams, getUpcomingEvents, getOrCreatePlayer, setPlayerResponse, getEventById } = require('../utils/database');
const { createErrorEmbed, createWarningEmbed } = require('../utils/embeds');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('availability')
    .setDescription('Mark your availability for upcoming events'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const allTeams = await getGuildTeams(interaction.guild.id);
      const userTeams = allTeams.filter(team => interaction.member.roles.cache.has(team.roleId));

      if (userTeams.length === 0) {
        const embed = createErrorEmbed(
          'No Team Access',
          'You are not in any teams.\n\nAsk an admin to assign you a team role.'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      let allEvents = [];
      for (const team of userTeams) {
        const teamEvents = await getUpcomingEvents(team.id, 10);
        teamEvents.forEach(event => { event.teamName = team.name; });
        allEvents.push(...teamEvents);
      }

      if (allEvents.length === 0) {
        const embed = createWarningEmbed(
          'No Upcoming Events',
          'There are no upcoming events. Ask your admin to create one with `/event create`!'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      allEvents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const events = allEvents.slice(0, 25);

      const options = events.map(event => {
        const userResponse = event.responses.find(r => r.player.discordId === interaction.user.id);
        const statusEmoji = userResponse ? 
          (userResponse.status === 'available' ? '✅' : userResponse.status === 'unavailable' ? '❌' : '❓') : '⬜';
        const teamLabel = userTeams.length > 1 ? ` [${event.teamName}]` : '';
        return {
          label: `${event.name}${teamLabel}`.substring(0, 100),
          description: `${event.date} at ${event.time} ${statusEmoji}`.substring(0, 100),
          value: event.id,
        };
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('event_select')
        .setPlaceholder('Select an event')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('📋 Mark Your Availability')
        .setDescription('Select an event below.\n\n✅ Available | ❌ Unavailable | ❓ Maybe | ⬜ No Response')
        .setFooter({ text: 'Tip: You can also react to the event message!' });

      const response = await interaction.editReply({ embeds: [embed], components: [row] });
      const collector = response.createMessageComponentCollector({ time: 300000 });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return await i.reply({ content: 'This menu is not for you!', ephemeral: true });
        }
        
        // ONLY handle dropdown selections here
        if (i.isStringSelectMenu() && i.customId === 'event_select') {
          const selectedEventId = i.values[0];
          await handleStatusSelection(i, selectedEventId);
        }
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });

    } catch (error) {
      console.error('Error in availability:', error);
      const errorEmbed = createErrorEmbed('Failed to Load Events', `Error: ${error.message}`);
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

async function handleStatusSelection(interaction, eventId) {
  try {
    const event = await getEventById(eventId);
    if (!event) {
      return await interaction.update({ content: '❌ Event not found!', embeds: [], components: [] });
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`avail_yes_${eventId}`)
          .setLabel('Available')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`avail_no_${eventId}`)
          .setLabel('Unavailable')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`avail_maybe_${eventId}`)
          .setLabel('Maybe')
          .setEmoji('❓')
          .setStyle(ButtonStyle.Secondary)
      );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`Mark Availability: ${event.name}`)
      .setDescription(
        `📅 ${event.date}\n` +
        `🕐 ${event.time}\n` +
        (event.gameType ? `🎮 ${event.gameType}\n` : '') +
        `\n🏆 Team: ${event.team.name}`
      )
      .setFooter({ text: 'Click a button' });

    await interaction.update({ embeds: [embed], components: [row] });

    const message = await interaction.fetchReply();
    const buttonCollector = message.createMessageComponentCollector({ 
      time: 300000,
      filter: i => i.customId.startsWith('avail_')
    });

    buttonCollector.on('collect', async buttonInteraction => {
  if (buttonInteraction.user.id !== interaction.user.id) {
    return await buttonInteraction.reply({ content: 'Not for you!', ephemeral: true });
  }

  const buttonId = buttonInteraction.customId;
  let status;
  
  if (buttonId.startsWith('avail_yes_')) {
    status = 'available';
  } else if (buttonId.startsWith('avail_no_')) {
    status = 'unavailable';
  } else if (buttonId.startsWith('avail_maybe_')) {
    status = 'maybe';
  }

  console.log(`Saving response: ${buttonInteraction.user.tag} → ${status} for ${event.name}`);

  try {
    // Try to add player (with limit checking)
    const player = await getOrCreatePlayer(buttonInteraction.user.id, buttonInteraction.user.username, event.teamId);
    await setPlayerResponse(player.id, eventId, status);

    const statusText = {
      available: '✅ Available',
      unavailable: '❌ Unavailable',
      maybe: '❓ Maybe',
    };

    const confirmEmbed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle('✅ Availability Updated!')
      .setDescription(
        `You've been marked as **${statusText[status]}** for:\n\n` +
        `**${event.name}**\n` +
        `📅 ${event.date} at ${event.time}\n` +
        `🏆 Team: ${event.team.name}`
      );

    await buttonInteraction.update({ embeds: [confirmEmbed], components: [] });
    console.log('✅ Response saved successfully');
    buttonCollector.stop();

  } catch (error) {
    // Check if it's a limit error
    if (error.isLimitError) {
      const { createErrorEmbed } = require('../utils/embeds');
      const errorEmbed = createErrorEmbed(
        'Team at Player Limit',
        `❌ ${error.message}\n\n` +
        `The team **${event.team.name}** is at the free tier limit of ${error.limitInfo.limit} players.\n\n` +
        '**To join this team:**\n' +
        '• Ask a team admin to upgrade with `/upgrade`, or\n' +
        '• Wait for a slot to open up\n\n' +
        '💎 Upgrading to Starter unlocks unlimited players!'
      );

      await buttonInteraction.update({ embeds: [errorEmbed], components: [] });
      console.log(`❌ Player limit reached for team ${event.teamId}`);
    } else {
      // Other error
      console.error('Error saving response:', error);
      await buttonInteraction.update({ 
        content: `❌ Error: ${error.message}`, 
        embeds: [], 
        components: [] 
      });
    }
    buttonCollector.stop();
  }
});

  } catch (error) {
    console.error('Error in handleStatusSelection:', error);
    await interaction.update({ content: `❌ Error: ${error.message}`, embeds: [], components: [] });
  }
}
