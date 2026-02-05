function handleCommandError(error, interaction, commandName) {
  console.error(`❌ Error in /${commandName}:`, error);

  const errorMessage = {
    content: '❌ An error occurred while executing this command. Please try again or contact support if the issue persists.',
    ephemeral: true
  };

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(errorMessage);
  } else {
    return interaction.reply(errorMessage);
  }
}

function logError(context, error) {
  console.error(`❌ Error in ${context}:`, error);
}

module.exports = {
  handleCommandError,
  logError,
};