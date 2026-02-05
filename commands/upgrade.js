const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('upgrade')
    .setDescription('View premium plans and features'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('💎 Upgrade to Premium')
      .setDescription('Unlock powerful features to manage your esports team!')
      .addFields(
        {
          name: '🆓 FREE (Current)',
          value: '• Up to 15 players\n• Basic availability tracking\n• 30-day event history\n• Event creation',
          inline: false,
        },
        {
          name: '⭐ STARTER - $14.99/month',
          value: '• **Unlimited players**\n• Smart reminders (24hr before events)\n• Recurring events\n• Role auto-assignment\n• 90-day history\n• Priority support',
          inline: false,
        },
        {
          name: '🚀 PRO - $39/month',
          value: '• Everything in Starter, plus:\n• Multi-team management\n• Performance tracking\n• Time-block availability\n• Tournament platform integrations\n• Calendar sync\n• Custom branding\n• Unlimited history',
          inline: false,
        },
        {
          name: '🏢 ENTERPRISE - Custom Pricing',
          value: '• White-label bot for your league\n• Multi-team dashboard\n• API access\n• Custom features\n• Dedicated support\n\n📧 Contact us for enterprise pricing',
          inline: false,
        }
      )
      .setFooter({ text: 'Pricing coming soon! Currently in beta.' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};