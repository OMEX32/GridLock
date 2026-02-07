const { SlashCommandBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embeds');
const { canManageEvents } = require('../utils/permissions');
const { getOrCreatePlayer } = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Sync team members from Discord roles to database (Admin only)')
    .addStringOption(option =>
      option
        .setName('team')
        .setDescription('Team name to sync (leave empty to sync all teams)')
        .setRequired(false)
    ),
  
  async execute(interaction) {
    // Check permissions
    if (!canManageEvents(interaction.member)) {
      const embed = createErrorEmbed(
        'Permission Denied',
        'You need "Manage Server" permission to sync teams.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const teamFilter = interaction.options.getString('team');

      // Get teams to sync
      let teams;
      if (teamFilter) {
        teams = await prisma.team.findMany({
          where: {
            guildId: interaction.guild.id,
            name: {
              contains: teamFilter,
              mode: 'insensitive'
            }
          }
        });

        if (teams.length === 0) {
          const embed = createErrorEmbed(
            'Team Not Found',
            `No team matching "${teamFilter}" was found.`
          );
          return await interaction.editReply({ embeds: [embed] });
        }
      } else {
        teams = await prisma.team.findMany({
          where: {
            guildId: interaction.guild.id
          }
        });
      }

      if (teams.length === 0) {
        const embed = createErrorEmbed(
          'No Teams',
          'There are no teams to sync. Create one with `/team create` first.'
        );
        return await interaction.editReply({ embeds: [embed] });
      }

      console.log(`🔄 Syncing ${teams.length} team(s)...`);

      let totalAdded = 0;
      let totalRemoved = 0;
      const results = [];

      for (const team of teams) {
        console.log(`Syncing team: ${team.name} (Role: ${team.roleId})`);

        // Get the Discord role
        const role = interaction.guild.roles.cache.get(team.roleId);

        if (!role) {
          results.push(`⚠️ **${team.name}**: Role not found (may have been deleted)`);
          continue;
        }

        // Get members with this role
        const roleMembers = role.members.map(m => ({
          id: m.user.id,
          username: m.user.username
        }));

        console.log(`Found ${roleMembers.length} members with role ${role.name}`);

        // Get current players in database
        const dbPlayers = await prisma.player.findMany({
          where: {
            teamId: team.id
          }
        });

        // Add members who have the role but aren't in database
        let added = 0;
        for (const member of roleMembers) {
          const exists = dbPlayers.find(p => p.discordId === member.id);
          if (!exists) {
            await getOrCreatePlayer(member.id, member.username, team.id);
            added++;
            console.log(`➕ Added ${member.username} to ${team.name}`);
          }
        }

        // Remove players who are in database but don't have the role anymore
        let removed = 0;
        for (const dbPlayer of dbPlayers) {
          const hasRole = roleMembers.find(m => m.id === dbPlayer.discordId);
          if (!hasRole) {
            await prisma.player.delete({
              where: { id: dbPlayer.id }
            });
            removed++;
            console.log(`➖ Removed ${dbPlayer.username} from ${team.name}`);
          }
        }

        totalAdded += added;
        totalRemoved += removed;

        const finalCount = roleMembers.length;
        results.push(
          `✅ **${team.name}**\n` +
          `   • ${added} added\n` +
          `   • ${removed} removed\n` +
          `   • ${finalCount} total players`
        );
      }

      console.log(`✅ Sync complete: +${totalAdded} -${totalRemoved}`);

      const embed = createSuccessEmbed(
        'Teams Synced!',
        `**Summary:**\n` +
        `• Teams synced: ${teams.length}\n` +
        `• Players added: ${totalAdded}\n` +
        `• Players removed: ${totalRemoved}\n\n` +
        `**Details:**\n${results.join('\n\n')}`
      );

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error syncing teams:', error);
      const errorEmbed = createErrorEmbed(
        'Sync Failed',
        `Error: ${error.message}\n\nPlease try again.`
      );
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};