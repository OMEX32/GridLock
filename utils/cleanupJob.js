const { cleanOldEvents } = require('./database');

// Run cleanup once per day
function startCleanupJob() {
  // Run immediately on startup
  runCleanup();
  
  // Then run every 24 hours
  setInterval(runCleanup, 24 * 60 * 60 * 1000);
}

async function runCleanup() {
  console.log('🧹 Running daily cleanup job...');
  try {
    const count = await cleanOldEvents();
    console.log(`✅ Cleanup complete. Removed ${count} old events.`);
  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
  }
}

module.exports = { startCleanupJob };