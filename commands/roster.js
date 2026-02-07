const { SlashCommandBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getGuildTeams } = require('../utils/database');
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
      const eventFilter = interaction.options.getString('event');

      // Get user's teams (teams where they have the role)
      const allTeams = await getGuildTeams(interaction.guild.id);
      
      const userTeams = allTeams.filter(team => 
        interaction.member.roles.cache.has(team.roleId)
      );

      if (userTeams.length === 0) {
        const embed = createErrorEmbed(
          'No Team Access',
          'You are not in any teams.\n\n' +
          'You need to have a team role assigned to view rosters.\n' +
          'Ask an admin to assign you a team role or create a team with `/team create`.'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`User is in ${userTeams.length} team(s)`);

      // Get events from user's teams
      let events = [];
      
      if (eventFilter) {
        // Get specific event(s) matching the filter
        for (const team of userTeams) {
          const teamEvents = await prisma.event.findMany({
            where: {
              teamId: team.id,
              name: {
                contains: eventFilter,
                mode: 'insensitive'
              }
            },
            include: {
              responses: {
                include: {
                  player: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 3
          });
          events.push(...teamEvents.map(e => ({ ...e, team })));
        }
      } else {
        // Get all upcoming events from user's teams
        for (const team of userTeams) {
          const teamEvents = await prisma.event.findMany({
            where: {
              teamId: team.id
            },
            include: {
              responses: {
                include: {
                  player: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 3
          });
          events.push(...teamEvents.map(e => ({ ...e, team })));
        }
      }

      if (events.length === 0) {
        const embed = eventFilter
          ? createErrorEmbed(
              'Event Not Found',
              `No event matching "${eventFilter}" was found in your teams.`
            )
          : createWarningEmbed(
              'No Events Found',
              'There are no events yet in your teams.\n\nCreate one with `/event create`!'
            );
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`Found ${events.length} event(s)`);

      // Sort by creation date
      events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Generate roster for each event (max 3)
      const embeds = [];

      for (const event of events.slice(0, 3)) {
        const available = [];
        const unavailable = [];
        const maybe = [];
        const noResponse = [];

        // Get all players on this team
        const allPlayers = await prisma.player.findMany({
          where: {
            teamId: event.teamId
          }
        });

        // Get responses for this event
        const responseMap = new Map();
        event.responses.forEach(r => {
          responseMap.set(r.player.discordId, r.status);
        });

        // Categorize all players on the team
        for (const player of allPlayers) {
          const status = responseMap.get(player.discordId);
          const displayName = player.username;

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

        // Add team name to footer
        embed.setFooter({ 
          text: `Team: ${event.team.name}` 
        });

        embeds.push(embed);
      }

      if (events.length > 3) {
        const lastEmbed = embeds[embeds.length - 1];
        const currentFooter = lastEmbed.data.footer?.text || '';
        lastEmbed.setFooter({ 
          text: `${currentFooter} | Showing 3 of ${events.length} events` 
        });
      }

      await interaction.editReply({ embeds });

    } catch (error) {
      console.error('Error showing roster:', error);
      const errorEmbed = createErrorEmbed(
        'Failed to Show Roster',
        `There was an error retrieving the roster: ${error.message}\n\nPlease try again.`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};