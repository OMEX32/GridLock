const { SlashCommandBuilder } = require('discord.js');
const { getOrCreateTeam, getUpcomingEvents } = require('../utils/database');
const { createRosterEmbed, createErrorEmbed, createWarningEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roster')
    .setDescription('View team roster and availability')
    .addStringOption(option =>
      option
        .setName('event')
        .setDescription('Specific event name to view (leave empty for all upcoming)')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const team = await getOrCreateTeam(
        interaction.guild.id,
        interaction.guild.name
      );

      const eventFilter = interaction.options.getString('event');
      const events = await getUpcomingEvents(team.id, 10);

      if (events.length === 0) {
        const embed = createWarningEmbed(
          'No Events Found',
          'There are no upcoming events. Create one with `/event create`!'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      // Filter by event name if specified
      let filteredEvents = events;
      if (eventFilter) {
        filteredEvents = events.filter(e => 
          e.name.toLowerCase().includes(eventFilter.toLowerCase())
        );

        if (filteredEvents.length === 0) {
          const embed = createErrorEmbed(
            'Event Not Found',
            `No event matching "${eventFilter}" was found.`
          );
          return await interaction.editReply({ embeds: [embed] });
        }
      }

      // Get all team members
      const guild = interaction.guild;
      const allMembers = await guild.members.fetch();
      const botMembers = allMembers.filter(m => !m.user.bot);

      // Generate roster for each event
      const embeds = [];

      for (const event of filteredEvents.slice(0, 3)) { // Show max 3 events
        const available = [];
        const unavailable = [];
        const maybe = [];
        const noResponse = [];

        // Get responses for this event
        const responseMap = new Map();
        event.responses.forEach(r => {
          responseMap.set(r.player.discordId, r.status);
        });

        // Categorize all members
        for (const [, member] of botMembers) {
          const status = responseMap.get(member.id);
          const displayName = member.nickname || member.user.username;

          if (status === 'available') {
            available.push(displayName);
          } else if (status === 'unavailable') {
            unavailable.push(displayName);
          } else if (status === 'maybe') {
            maybe.push(displayName);
          } else {
            noResponse.push(displayName);
          }
        }

        const embed = createRosterEmbed(
          event.name,
          `${event.date} at ${event.time}`,
          available,
          unavailable,
          maybe,
          noResponse
        );

        embeds.push(embed);
      }

      if (filteredEvents.length > 3) {
        embeds[embeds.length - 1].setFooter({
          text: `Showing 3 of ${filteredEvents.length} events. Use /roster event:name to filter.`
        });
      }

      await interaction.editReply({ embeds });

    } catch (error) {
      console.error('Error showing roster:', error);
      const errorEmbed = createErrorEmbed(
        'Failed to Show Roster',
        'There was an error retrieving the roster. Please try again.'
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};