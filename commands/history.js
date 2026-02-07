const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getGuildTeams } = require('../utils/database');
const { createErrorEmbed, createWarningEmbed } = require('../utils/embeds');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('View event history for your team (30 days for free tier)'),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Get user's teams
      const allTeams = await getGuildTeams(interaction.guild.id);
      const userTeams = allTeams.filter(team => 
        interaction.member.roles.cache.has(team.roleId)
      );

      if (userTeams.length === 0) {
        const embed = createErrorEmbed(
          'No Team Access',
          'You are not in any teams.\n\nAsk an admin to assign you a team role.'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`User is in ${userTeams.length} team(s)`);

      // If user is only in one team, show history directly
      if (userTeams.length === 1) {
        await showTeamHistory(interaction, userTeams[0]);
      } else {
        // Show team selection dropdown
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('history_team_select')
          .setPlaceholder('Select a team to view history')
          .addOptions(
            userTeams.map(team => ({
              label: team.name,
              description: `View ${team.tier === 'free' ? '30' : 'unlimited'} days of event history`,
              value: team.id
            }))
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📜 Event History')
          .setDescription('Select a team to view their event history:')
          .setFooter({ text: 'Free tier: 30 days | Premium: Unlimited' });

        const response = await interaction.editReply({ 
          embeds: [embed], 
          components: [row] 
        });

        // Collector for team selection
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

          if (i.isStringSelectMenu() && i.customId === 'history_team_select') {
            const teamId = i.values[0];
            const selectedTeam = userTeams.find(t => t.id === teamId);
            
            if (selectedTeam) {
              await i.deferUpdate();
              await showTeamHistory(i, selectedTeam);
            }
          }
        });

        collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });
      }

    } catch (error) {
      console.error('Error showing history:', error);
      const errorEmbed = createErrorEmbed(
        'Failed to Load History',
        `Error: ${error.message}\n\nPlease try again.`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};

async function showTeamHistory(interaction, team) {
  try {
    // Calculate date cutoff based on tier
    const daysLimit = team.tier === 'free' ? 30 : 9999; // 9999 = unlimited for premium
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysLimit);

    console.log(`Fetching history for ${team.name} (${team.tier} tier, ${daysLimit} days)`);

    // Get events within the time range
    const events = await prisma.event.findMany({
      where: {
        teamId: team.id,
        createdAt: {
          gte: cutoffDate
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
      }
    });

    if (events.length === 0) {
      const embed = createWarningEmbed(
        'No Event History',
        `No events found in the last ${daysLimit} days for **${team.name}**.\n\n` +
        'Events will appear here after you create them with `/event create`.'
      );
      
      if (interaction.deferred) {
        return await interaction.editReply({ embeds: [embed], components: [] });
      } else {
        return await interaction.update({ embeds: [embed], components: [] });
      }
    }

    console.log(`Found ${events.length} events in history`);

    // Create embeds (max 10 per message due to Discord limit)
    const embeds = [];
    const eventsToShow = events.slice(0, 10); // Show latest 10 events

    // Summary embed
    const summaryEmbed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`📜 Event History - ${team.name}`)
      .setDescription(
        `Showing ${eventsToShow.length} of ${events.length} events from the last ${daysLimit} days.\n\n` +
        `**Team Tier:** ${team.tier === 'free' ? '🆓 Free (30 days)' : '💎 Premium (Unlimited)'}`
      )
      .addFields({
        name: '📊 Statistics',
        value: 
          `• Total Events: ${events.length}\n` +
          `• Total Responses: ${events.reduce((sum, e) => sum + e.responses.length, 0)}\n` +
          `• Avg Attendance: ${calculateAverageAttendance(events)}%`,
        inline: false
      })
      .setTimestamp();

    embeds.push(summaryEmbed);

    // Event detail embeds
    eventsToShow.forEach((event, index) => {
      const availableCount = event.responses.filter(r => r.status === 'available').length;
      const unavailableCount = event.responses.filter(r => r.status === 'unavailable').length;
      const maybeCount = event.responses.filter(r => r.status === 'maybe').length;
      const totalResponses = event.responses.length;

      // Format date for display
      const eventDate = new Date(event.createdAt);
      const daysAgo = Math.floor((new Date() - eventDate) / (1000 * 60 * 60 * 24));
      const dateDisplay = daysAgo === 0 ? 'Today' : 
                          daysAgo === 1 ? 'Yesterday' : 
                          `${daysAgo} days ago`;

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`${index + 1}. ${event.name}`)
        .setDescription(
          `📅 **Scheduled:** ${event.date} at ${event.time}\n` +
          (event.gameType ? `🎮 **Game:** ${event.gameType}\n` : '') +
          (event.notes ? `📝 **Notes:** ${event.notes.substring(0, 200)}${event.notes.length > 200 ? '...' : ''}\n` : '') +
          `\n⏰ Created: ${dateDisplay} (<t:${Math.floor(eventDate.getTime() / 1000)}:R>)`
        )
        .addFields(
          {
            name: '📊 Attendance',
            value: 
              `✅ Available: ${availableCount}\n` +
              `❌ Unavailable: ${unavailableCount}\n` +
              `❓ Maybe: ${maybeCount}\n` +
              `📝 Total Responses: ${totalResponses}`,
            inline: true
          },
          {
            name: '👥 Top Responders',
            value: getTopResponders(event.responses),
            inline: true
          }
        );

      // Add response rate
      const responseRate = totalResponses > 0 ? 
        Math.round((availableCount / totalResponses) * 100) : 0;
      
      embed.setFooter({ 
        text: `Availability Rate: ${responseRate}% | Event ID: ${event.id.substring(0, 8)}` 
      });

      embeds.push(embed);
    });

    // Add upgrade prompt for free tier users
    if (team.tier === 'free' && events.length >= 5) {
      const upgradeEmbed = new EmbedBuilder()
        .setColor(config.colors.warning)
        .setTitle('💎 Upgrade to Premium')
        .setDescription(
          'Want to see unlimited event history?\n\n' +
          '**Premium Benefits:**\n' +
          '• Unlimited event history (not just 30 days)\n' +
          '• Advanced analytics and reports\n' +
          '• Smart reminders 24hr before events\n' +
          '• Recurring event templates\n' +
          '• Priority support\n\n' +
          'Use `/upgrade` to see pricing and features!'
        );
      
      embeds.push(upgradeEmbed);
    }

    // Send response
    if (interaction.deferred) {
      await interaction.editReply({ embeds, components: [] });
    } else {
      await interaction.update({ embeds, components: [] });
    }

  } catch (error) {
    console.error('Error showing team history:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Load History',
      `Error: ${error.message}`
    );
    
    if (interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    } else {
      await interaction.update({ embeds: [errorEmbed], components: [] });
    }
  }
}

// Helper function to calculate average attendance rate
function calculateAverageAttendance(events) {
  if (events.length === 0) return 0;

  const totalRate = events.reduce((sum, event) => {
    const available = event.responses.filter(r => r.status === 'available').length;
    const total = event.responses.length;
    return sum + (total > 0 ? (available / total) * 100 : 0);
  }, 0);

  return Math.round(totalRate / events.length);
}

// Helper function to get top responders
function getTopResponders(responses) {
  if (responses.length === 0) return 'No responses yet';

  // Group by player and count
  const playerCounts = {};
  responses.forEach(r => {
    const name = r.player.username;
    if (!playerCounts[name]) {
      playerCounts[name] = { available: 0, unavailable: 0, maybe: 0 };
    }
    playerCounts[name][r.status]++;
  });

  // Get top 3 most active players
  const sorted = Object.entries(playerCounts)
    .sort((a, b) => {
      const totalA = a[1].available + a[1].unavailable + a[1].maybe;
      const totalB = b[1].available + b[1].unavailable + b[1].maybe;
      return totalB - totalA;
    })
    .slice(0, 3);

  if (sorted.length === 0) return 'No responses';

  return sorted.map(([name, counts]) => {
    const emoji = counts.available > 0 ? '✅' : counts.unavailable > 0 ? '❌' : '❓';
    return `${emoji} ${name}`;
  }).join('\n') || 'No responses';
}