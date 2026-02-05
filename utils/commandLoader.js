const fs = require('fs');
const path = require('path');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '../commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  let loadedCount = 0;

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`✅ Loaded command: ${command.data.name}`);
      loadedCount++;
    } else {
      console.log(`⚠️  Skipping ${file}: missing 'data' or 'execute' property`);
    }
  }

  console.log(`📋 Total commands loaded: ${loadedCount}`);
}

module.exports = { loadCommands };