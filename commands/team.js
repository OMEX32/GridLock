const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createSuccessEmbed, createErrorEmbed, createWarningEmbed } = require('../utils/embeds');
const { canManageEvents } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Manage teams in your server')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new team (Admin only)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all teams in this server')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a team (Admin only)')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('addplayer')
        .setDescription('Manually add a player to your team')
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('User to add to the team')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('switch')
        .setDescription('Switch to a different team (if you\'re in multiple teams)')
    ),
  
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      await handleCreateTeam(interaction);
    } else if (subcommand === 'list') {
      await handleListTeams(interaction);
    } else if (subcommand === 'delete') {
      await handleDeleteTeam(interaction);
    } else if (subcommand === 'addplayer') {
      await handleAddPlayer(interaction);
    } else if (subcommand === 'switch') {
      await handleSwitchTeam(interaction);
    }
  },
};

// ============================================================================
// CREATE TEAM
// ============================================================================

async function handleCreateTeam(interaction) {
  // Check permissions
  if (!canManageEvents(interaction.member)) {
    const embed = createErrorEmbed(
      'Permission Denied',
      'You need "Manage Server" permission to create teams.'
    );
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Show modal form
  const modal = new ModalBuilder()
    .setCustomId('create_team_modal')
    .setTitle('Create New Team');

  const nameInput = new TextInputBuilder()
    .setCustomId('team_name')
    .setLabel('Team Name')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Valorant Team, League Team, etc.')
    .setRequired(true)
    .setMaxLength(100)
    .setMinLength(3);

  const row = new ActionRowBuilder().addComponents(nameInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

// ============================================================================
// LIST TEAMS
// ============================================================================

async function handleListTeams(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const teams = await prisma.team.findMany({
      where: {
        guildId: interaction.guild.id
      },
      include: {
        players: true,
        events: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (teams.length === 0) {
      const embed = createWarningEmbed(
        'No Teams',
        'No teams have been created yet.\n\nCreate one with `/team create`!'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    const config = require('../config/config');
    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📋 Teams in This Server')
      .setDescription(`Total Teams: ${teams.length}`)
      .setTimestamp();

    for (const team of teams) {
      const role = interaction.guild.roles.cache.get(team.roleId);
      const roleName = role ? `@${role.name}` : 'Deleted Role';
      
      embed.addFields({
        name: `🏆 ${team.name}`,
        value: 
          `👥 Role: ${roleName}\n` +
          `📊 Players: ${team.players.length}\n` +
          `📅 Events: ${team.events.length}\n` +
          `💎 Tier: ${team.tier}\n` +
          `Created: <t:${Math.floor(team.createdAt.getTime() / 1000)}:R>`,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error listing teams:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to List Teams',
      'There was an error retrieving teams.'
    );
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// ============================================================================
// DELETE TEAM
// ============================================================================

async function handleDeleteTeam(interaction) {
  // Check permissions
  if (!canManageEvents(interaction.member)) {
    const embed = createErrorEmbed(
      'Permission Denied',
      'You need "Manage Server" permission to delete teams.'
    );
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  try {
    const teams = await prisma.team.findMany({
      where: {
        guildId: interaction.guild.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (teams.length === 0) {
      const embed = createWarningEmbed(
        'No Teams',
        'There are no teams to delete.'
      );
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Create dropdown
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('delete_team_select')
      .setPlaceholder('Choose a team to delete')
      .addOptions(
        teams.map(team => {
          const role = interaction.guild.roles.cache.get(team.roleId);
          return {
            label: team.name,
            description: `Role: ${role ? role.name : 'Deleted'} | Players: ${team.players?.length || 0}`,
            value: team.id
          };
        })
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      content: '🗑️ **Warning:** Deleting a team will delete all events and player data!\n\nSelect a team to delete:',
      components: [row],
      ephemeral: true
    });

  } catch (error) {
    console.error('Error showing delete menu:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Load Teams',
      'There was an error loading teams.'
    );
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

// ============================================================================
// ADD PLAYER
// ============================================================================

async function handleAddPlayer(interaction) {
  // Check permissions - Admin only
  if (!canManageEvents(interaction.member)) {
    const embed = createErrorEmbed(
      'Permission Denied',
      'You need "Manage Server" permission to manually add players.\n\n' +
      '**Players are automatically added when they:**\n' +
      '• Get assigned the team role\n' +
      '• React to an event message\n' +
      '• Mark availability with `/availability`\n' +
      '• Get synced via `/sync` command'
    );
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const userToAdd = interaction.options.getUser('user');

    // Get teams where the user is a member (has the role)
    const userTeams = await getUserTeams(interaction.member);

    if (userTeams.length === 0) {
      const embed = createErrorEmbed(
        'No Team Access',
        'You need to be in a team to add players.\n\nYou must have a team role assigned to you.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    if (userTeams.length === 1) {
      // Auto-select the only team
      await addPlayerToTeam(interaction, userToAdd, userTeams[0]);
    } else {
      // Let user choose which team
      await showTeamSelection(interaction, userToAdd, userTeams, 'addplayer');
    }

  } catch (error) {
    console.error('Error adding player:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Add Player',
      'There was an error adding the player.'
    );
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// ============================================================================
// SWITCH TEAM
// ============================================================================

async function handleSwitchTeam(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const userTeams = await getUserTeams(interaction.member);

    if (userTeams.length === 0) {
      const embed = createErrorEmbed(
        'No Teams',
        'You are not in any teams.\n\nAsk an admin to assign you a team role.'
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    if (userTeams.length === 1) {
      const embed = createWarningEmbed(
        'Only One Team',
        `You're only in one team: **${userTeams[0].name}**\n\nNo need to switch!`
      );
      return await interaction.editReply({ embeds: [embed] });
    }

    // Show team selection
    await showTeamSelection(interaction, null, userTeams, 'switch');

  } catch (error) {
    console.error('Error switching team:', error);
    const errorEmbed = createErrorEmbed(
      'Failed to Switch Team',
      'There was an error switching teams.'
    );
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserTeams(member) {
  const teams = await prisma.team.findMany({
    where: {
      guildId: member.guild.id
    }
  });

  // Filter teams where user has the role
  return teams.filter(team => member.roles.cache.has(team.roleId));
}

async function addPlayerToTeam(interaction, userToAdd, team) {
  const { getOrCreatePlayer } = require('../utils/database');
  
  await getOrCreatePlayer(userToAdd.id, userToAdd.username, team.id);

  const embed = createSuccessEmbed(
    'Player Added!',
    `**${userToAdd.username}** has been added to **${team.name}**!`
  );

  await interaction.editReply({ embeds: [embed] });
}

async function showTeamSelection(interaction, userToAdd, teams, action) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`team_select_${action}_${userToAdd?.id || 'self'}`)
    .setPlaceholder('Choose a team')
    .addOptions(
      teams.map(team => ({
        label: team.name,
        description: `Players: ${team.players?.length || 0}`,
        value: team.id
      }))
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const message = action === 'addplayer' 
    ? `Select which team to add **${userToAdd.username}** to:`
    : 'Select your active team:';

  await interaction.editReply({
    content: message,
    components: [row]
  });
}