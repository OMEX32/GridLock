const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  
  async execute(interaction) {
    const sent = await interaction.reply({ 
      content: '🏓 Pinging...', 
      fetchReply: true 
    });
    
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    
    await interaction.editReply(
      `🏓 Pong!\n⏱️ Latency: ${latency}ms\n📡 API: ${interaction.client.ws.ping}ms`
    );
  },
};