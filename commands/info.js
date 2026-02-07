const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show information about GridLock Bot'),
  
  async execute(interaction) {
    await interaction.deferReply();

    try {
      const { prisma } = require('../utils/database');

      // Get comprehensive stats
      const teamCount = await prisma.team.count();
      const eventCount = await prisma.event.count();
      const playerCount = await prisma.player.count();
      const responseCount = await prisma.response.count();

      // Get tier breakdown
      const freeTeams = await prisma.team.count({ where: { tier: 'free' } });
      const premiumTeams = teamCount - freeTeams;

      // Calculate uptime
      const uptime = process.uptime();
      const days = Math.floor(uptime / 86400);
      const hours = Math.floor((uptime % 86400) / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const uptimeString = days > 0 ? `${days}d ${hours}h ${minutes}m` : 
                          hours > 0 ? `${hours}h ${minutes}m` : 
                          `${minutes}m`;

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle('🏆 GridLock Bot - Esports Team Management')
        .setDescription(
          '**The ultimate Discord bot for competitive gaming teams**\n\n' +
          'GridLock helps esports teams manage player availability, schedule events, ' +
          'and track rosters across multiple teams in one server.'
        )
        .addFields(
          {
            name: '📊 Global Statistics',
            value: 
              `🏆 **Teams:** ${teamCount} (${freeTeams} free, ${premiumTeams} premium)\n` +
              `📅 **Events Created:** ${eventCount.toLocaleString()}\n` +
              `👥 **Players Registered:** ${playerCount.toLocaleString()}\n` +
              `✅ **Total Responses:** ${responseCount.toLocaleString()}`,
            inline: false,
          },
          {
            name: '✨ Core Features',
            value: 
              '• **Multi-Team Support** - Multiple teams per server\n' +
              '• **Event Management** - Create & schedule scrims/tournaments\n' +
              '• **Availability Tracking** - React or use commands\n' +
              '• **Smart Rosters** - See who\'s available instantly\n' +
              '• **Event History** - 30 days free, unlimited premium\n' +
              '• **Auto-Sync** - Role-based team membership',
            inline: false,
          },
          {
            name: '💎 Premium Features',
            value: 
              '• **Unlimited Players** (Free: 15 max)\n' +
              '• **Event Reminders** - 24hr before events\n' +
              '• **Recurring Events** - Templates for weekly scrims\n' +
              '• **Advanced Analytics** - Performance tracking\n' +
              '• **Platform Integrations** - Connect to tournament sites\n' +
              '• **Priority Support** - Faster help when you need it',
            inline: false,
          },
          {
            name: '🚀 Quick Start',
            value: 
              '1️⃣ Run `/team create` to set up your team\n' +
              '2️⃣ Create events with `/event create`\n' +
              '3️⃣ Players mark availability with reactions\n' +
              '4️⃣ Check rosters with `/roster`\n\n' +
              'Use `/help` for all commands!',
            inline: false,
          },
          {
            name: '🔗 Important Links',
            value: 
              `[📥 Invite Bot](https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID || 'YOUR_CLIENT_ID'}&permissions=277025770496&scope=bot%20applications.commands) • ` +
              '[💬 Support Server](https://discord.gg/your_support) • ' +
              '[📖 Documentation](https://gridlock.gg/docs) • ' +
              '[💎 Upgrade](https://gridlock.gg/pricing)',
            inline: false,
          },
          {
            name: '⚡ System Info',
            value: 
              `🟢 **Status:** Online\n` +
              `⏱️ **Uptime:** ${uptimeString}\n` +
              `📡 **Latency:** ${interaction.client.ws.ping}ms\n` +
              `📊 **Servers:** ${interaction.client.guilds.cache.size}`,
            inline: true,
          },
          {
            name: '💻 Tech Stack',
            value: 
              `• Discord.js v14\n` +
              `• Prisma ORM\n` +
              `• PostgreSQL\n` +
              `• Node.js`,
            inline: true,
          }
        )
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setFooter({ 
          text: `GridLock Bot v2.0.0 • Made with ❤️ for esports teams` 
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error showing info:', error);
      const errorEmbed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Error')
        .setDescription('Failed to load bot information. Please try again.');
      
      await interaction.editReply({ embeds: [errorEmbed] });
    }
  },
};