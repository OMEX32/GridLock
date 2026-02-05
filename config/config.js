module.exports = {
  colors: {
    primary: 0x5865F2,    // Discord blurple
    success: 0x57F287,    // Green
    warning: 0xFEE75C,    // Yellow
    error: 0xED4245,      // Red
  },
  emojis: {
    available: '✅',
    unavailable: '❌',
    maybe: '❓',
    event: '📅',
    roster: '📋',
    players: '👥',
    time: '🕐',
    game: '🎮',
  },
  limits: {
    free: {
      maxPlayers: 15,
      historyDays: 30,
    },
    starter: {
      maxPlayers: null, // unlimited
      historyDays: 90,
    },
    pro: {
      maxPlayers: null,
      historyDays: null, // unlimited
    },
  },
  games: [
    'Valorant',
    'League of Legends',
    'CS2',
    'Rocket League',
    'Dota 2',
    'Overwatch 2',
    'Rainbow Six Siege',
    'Apex Legends',
    'Fortnite',
    'Other',
  ],
};