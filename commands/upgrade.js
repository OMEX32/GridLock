const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upgrade')
    .setDescription('View premium plans and features'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('💎 GridLock Premium Plans')
      .setDescription(
        '**Currently in Free Beta** - Premium tiers coming soon!\n\n' +
        'We\'re building powerful features for competitive gaming teams. ' +
        'Here\'s what\'s coming:'
      )
      .addFields(
        {
          name: '🆓 FREE TIER (Current)',
          value: 
            '✅ **Available Now**\n' +
            '• Up to 15 players per team\n' +
            '• Unlimited events\n' +
            '• Unlimited teams per server\n' +
            '• 30-day event history\n' +
            '• Full availability tracking\n' +
            '• Multi-team support\n' +
            '• All core features',
          inline: false,
        },
        {
          name: '⭐ STARTER TIER - Coming Soon',
          value: 
            '🔒 **$14.99/month** _(Not yet available)_\n' +
            '• **Unlimited players** (no 15-player limit)\n' +
            '• Smart event reminders (24hr before)\n' +
            '• Recurring event templates\n' +
            '• Role auto-assignment based on availability\n' +
            '• 90-day event history\n' +
            '• Priority support',
          inline: false,
        },
        {
          name: '🚀 PRO TIER - Coming Soon',
          value: 
            '🔒 **$39/month** _(Not yet available)_\n' +
            '• Everything in Starter, plus:\n' +
            '• Advanced analytics & performance tracking\n' +
            '• Time-block availability (set recurring schedules)\n' +
            '• Tournament platform integrations\n' +
            '• Calendar sync (Google Calendar, Outlook)\n' +
            '• Custom bot branding\n' +
            '• Unlimited event history\n' +
            '• Advanced team management dashboard',
          inline: false,
        },
        {
          name: '🏢 ENTERPRISE TIER - Coming Soon',
          value: 
            '🔒 **Custom Pricing** _(Not yet available)_\n' +
            '• White-label bot for your league\n' +
            '• Multi-team tournament dashboard\n' +
            '• API access for custom integrations\n' +
            '• Custom feature development\n' +
            '• Dedicated support channel\n' +
            '• SLA guarantees\n\n' +
            '_Contact us for early enterprise access_',
          inline: false,
        },
        {
          name: '📢 Stay Updated',
          value: 
            'Want to be notified when premium tiers launch?\n\n' +
            '• Join our support server for updates\n' +
            '• Use `/info` to get the invite link\n' +
            '• Follow announcements for early bird discounts!',
          inline: false,
        }
      )
      .setFooter({ 
        text: '🆓 Enjoy FREE tier while we build premium features! | Beta v2.0.0' 
      })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};