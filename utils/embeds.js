const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

function createSuccessEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function createErrorEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.error)
    .setTitle(`❌ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function createWarningEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setTimestamp();
}

function createEventEmbed(event) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${config.emojis.event} ${event.name}`)
    .setDescription('React below to mark your availability')
    .addFields(
      { name: '📅 Date', value: event.date, inline: true },
      { name: '🕐 Time', value: event.time, inline: true }
    )
    .setFooter({ text: 'React with ✅ (Available) | ❌ (Unavailable) | ❓ (Maybe)' })
    .setTimestamp();

  if (event.gameType) {
    embed.addFields({ name: '🎮 Game', value: event.gameType, inline: true });
  }

  return embed;
}

function createRosterEmbed(eventName, eventDate, available, unavailable, maybe, noResponse) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${config.emojis.roster} ROSTER: ${eventName}`)
    .setDescription(`📅 ${eventDate}`)
    .setTimestamp();

  if (available.length > 0) {
    embed.addFields({
      name: `✅ AVAILABLE (${available.length})`,
      value: available.map(p => `• ${p}`).join('\n') || 'None',
    });
  }

  if (unavailable.length > 0) {
    embed.addFields({
      name: `❌ UNAVAILABLE (${unavailable.length})`,
      value: unavailable.map(p => `• ${p}`).join('\n') || 'None',
    });
  }

  if (maybe.length > 0) {
    embed.addFields({
      name: `❓ MAYBE (${maybe.length})`,
      value: maybe.map(p => `• ${p}`).join('\n') || 'None',
    });
  }

  if (noResponse.length > 0) {
    embed.addFields({
      name: `👥 NO RESPONSE (${noResponse.length})`,
      value: noResponse.map(p => `• ${p}`).join('\n') || 'None',
    });
  }

  return embed;
}

module.exports = {
  createSuccessEmbed,
  createErrorEmbed,
  createWarningEmbed,
  createEventEmbed,
  createRosterEmbed,
};