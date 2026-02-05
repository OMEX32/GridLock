const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands and how to use them'),
  
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🤖 RosterBot - Help & Commands')
      .setDescription('Manage your esports team availability and roster with ease!')
      .addFields(
        {
          name: '📅 /event create',
          value: '`/event create name:Tournament date:Feb 15 time:7PM game:Valorant`\nCreate a new event (scrim, tournament, practice session)',
          inline: false,
        },
        {
          name: '✅ /availability',
          value: '`/availability`\nMark your availability for upcoming events',
          inline: false,
        },
        {
          name: '📋 /roster',
          value: '`/roster`\nView team roster and who\'s available for events',
          inline: false,
        },
        {
          name: '🏓 /ping',
          value: '`/ping`\nCheck bot response time',
          inline: false,
        },
        {
          name: '❓ /help',
          value: '`/help`\nShow this help message',
          inline: false,
        }
      )
      .addFields(
        {
          name: '💡 How It Works',
          value: '1. Coach creates event with `/event create`\n2. Players react to mark availability (✅ ❌ ❓)\n3. Check roster with `/roster` to see who\'s coming',
          inline: false,
        }
      )
      .setFooter({ text: 'RosterBot - Free Tier | Upgrade for unlimited features' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};