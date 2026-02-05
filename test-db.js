require('dotenv').config();
const { getOrCreateTeam, getOrCreatePlayer, prisma } = require('./utils/database');

async function test() {
  try {
    console.log('Testing database connection...');
    
    const team = await getOrCreateTeam('test-guild-123', 'Test Team');
    console.log('✅ Team created/retrieved:', team.name);

    const player = await getOrCreatePlayer('user-123', 'TestPlayer', team.id);
    console.log('✅ Player created/retrieved:', player.username);

    console.log('✅ Database connection successful!');
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();