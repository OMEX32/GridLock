const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and how to use them'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🏆 GridLock Bot - Command Guide')
      .setDescription('Complete guide to managing your esports team with GridLock!\n\n**🔰 Legend:** 👑 = Admin Only | 👥 = Team Member')
      .addFields(
        {
          name: '🏆 Team Management',
          value: 
            '**👑 `/team create`**\nCreate a new team and link it to a Discord role\n' +
            '_Example: `/team create` → Fill form → Select role_\n\n' +
            '**👑 `/team delete`**\nPermanently delete a team and all its data\n\n' +
            '**`/team list`**\nView all teams in this server\n\n' +
            '**👑 `/team addplayer @user`**\nManually add a player to a team (Admin only)\n\n' +
            '**`/team switch`**\nSwitch between your teams (if you\'re in multiple)',
          inline: false,
        },
        {
          name: '📅 Event Management',
          value: 
            '**👥 `/event create`**\nCreate a new event (scrim, tournament, practice)\n' +
            '_Example: `/event create` → Fill form with name, date, time, game_\n\n' +
            '**👥 `/event list`**\nList all upcoming events for your team(s)\n\n' +
            '**👑 `/event delete`**\nDelete an event (Admin only)',
          inline: false,
        },
        {
          name: '✅ Availability & Roster',
          value: 
            '**👥 `/availability`**\nMark your availability for upcoming events\n' +
            '_Select event → Choose Available/Unavailable/Maybe_\n\n' +
            '**👥 `/roster [event]`**\nView who\'s available for events\n' +
            '_Example: `/roster` or `/roster event:Tournament`_\n\n' +
            '**📜 `/history`**\nView past events (30 days for free, unlimited for premium)',
          inline: false,
        },
        {
          name: '⚙️ Utilities',
          value: 
            '**👑 `/sync [team]`**\nSync Discord role members to database\n' +
            '_Run this after creating a team with existing role members_\n\n' +
            '**`/info`**\nView bot statistics and information\n\n' +
            '**`/ping`**\nCheck bot response time\n\n' +
            '**`/upgrade`**\nView premium plans and pricing',
          inline: false,
        },
        {
          name: '💡 Quick Start Guide',
          value: 
            '**For Admins:**\n' +
            '1️⃣ Create a Discord role (e.g., @Valorant Team)\n' +
            '2️⃣ Run `/team create` and select that role\n' +
            '3️⃣ Assign players the role in Discord\n' +
            '4️⃣ Run `/sync` to add them to database\n' +
            '5️⃣ Create events with `/event create`\n\n' +
            '**For Players:**\n' +
            '1️⃣ Get assigned a team role by admin\n' +
            '2️⃣ React to events (✅ ❌ ❓) or use `/availability`\n' +
            '3️⃣ Check rosters with `/roster`',
          inline: false,
        },
        {
          name: '🎯 Pro Tips',
          value: 
            '• React directly to event messages for quick availability marking\n' +
            '• Use `/roster event:name` to filter specific events\n' +
            '• Players auto-join teams when they react to events\n' +
            '• Free tier supports up to 15 players per team\n' +
            '• Multiple teams can exist in one server',
          inline: false,
        },
        {
          name: '🆓 Free vs 💎 Premium',
          value: 
            '**Free Tier:**\n' +
            '✅ Up to 15 players per team\n' +
            '✅ Unlimited events & teams\n' +
            '✅ 30-day event history\n' +
            '✅ All core features\n\n' +
            '**Premium Tiers:**\n' +
            '💎 Unlimited players\n' +
            '💎 Event reminders\n' +
            '💎 Recurring events\n' +
            '💎 Advanced analytics\n\n' +
            '_Use `/upgrade` to see full pricing!_',
          inline: false,
        }
      )
      .setFooter({ 
        text: 'GridLock Bot v2.0.0 | Need more help? Use /info for links to support server' 
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};