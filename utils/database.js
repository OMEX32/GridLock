const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ============================================================================
// TEAM FUNCTIONS
// ============================================================================

// NOTE: In multi-team system, we don't use "getOrCreateTeam" by guildId anymore
// because multiple teams can exist per server. Instead, we get teams by role or list all teams.

// Get team by ID
async function getTeamById(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: true,
      events: true,
    },
  });
  return team;
}

// Get team by role ID
async function getTeamByRoleId(roleId) {
  const team = await prisma.team.findUnique({
    where: { roleId: roleId },
    include: {
      players: true,
      events: true,
    },
  });
  return team;
}

// Get all teams in a guild
async function getGuildTeams(guildId) {
  const teams = await prisma.team.findMany({
    where: { guildId: guildId },
    include: {
      players: true,
      events: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  return teams;
}

// ============================================================================
// PLAYER FUNCTIONS
// ============================================================================

// Get or create player
async function getOrCreatePlayer(discordId, username, teamId) {
  // First check if player already exists
  let player = await prisma.player.findFirst({
    where: {
      discordId: discordId,
      teamId: teamId,
    },
  });

  if (player) {
    // Player exists, just update username if changed
    if (player.username !== username) {
      player = await prisma.player.update({
        where: { id: player.id },
        data: { username: username },
      });
    }
    return player;
  }

  // Player doesn't exist, check if we can add them
  const { canAddPlayer } = require('./limits');
  const limitCheck = await canAddPlayer(teamId);

  if (!limitCheck.allowed) {
    // Hit the limit!
    console.log(`❌ Cannot add player ${username} to team ${teamId}: ${limitCheck.reason}`);
    
    // Throw error with helpful message
    const error = new Error(limitCheck.reason);
    error.isLimitError = true;
    error.limitInfo = limitCheck;
    throw error;
  }

  // Limit OK, create the player
  player = await prisma.player.create({
    data: {
      discordId: discordId,
      username: username,
      teamId: teamId,
    },
  });

  console.log(`✅ Added player: ${username} to team (${limitCheck.currentCount + 1}/${limitCheck.limit || '∞'})`);

  // Warn if approaching limit
  if (limitCheck.limit && (limitCheck.currentCount + 1) >= limitCheck.limit - 2) {
    console.log(`⚠️ Team approaching player limit: ${limitCheck.currentCount + 1}/${limitCheck.limit}`);
  }

  return player;
}

// ============================================================================
// EVENT FUNCTIONS
// ============================================================================

// Create event (kept for backwards compatibility)
async function createEvent(teamId, name, date, time, gameType, createdBy, messageId, channelId) {
  const event = await prisma.event.create({
    data: {
      teamId,
      name,
      date,
      time,
      gameType,
      createdBy,
      messageId,
      channelId,
    },
  });

  console.log(`✅ Created event: ${name}`);
  return event;
}

// Get upcoming events for a team
async function getUpcomingEvents(teamId, limit = 10) {
  const events = await prisma.event.findMany({
    where: { teamId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      responses: {
        include: {
          player: true,
        },
      },
    },
  });

  return events;
}

// Get event by ID
async function getEventById(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      responses: {
        include: {
          player: true,
        },
      },
      team: {
        include: {
          players: true,
        },
      },
    },
  });

  return event;
}

// Get event by message ID
async function getEventByMessageId(messageId) {
  const event = await prisma.event.findFirst({
    where: { messageId },
    include: {
      responses: {
        include: {
          player: true,
        },
      },
      team: {
        include: {
          players: true,
        },
      },
    },
  });

  return event;
}

// ============================================================================
// RESPONSE FUNCTIONS
// ============================================================================

// Set player response
async function setPlayerResponse(playerId, eventId, status) {
  const response = await prisma.response.upsert({
    where: {
      playerId_eventId: {
        playerId,
        eventId,
      },
    },
    update: {
      status,
      updatedAt: new Date(),
    },
    create: {
      playerId,
      eventId,
      status,
    },
  });

  return response;
}

// Get all players in a team
async function getTeamPlayers(teamId) {
  const players = await prisma.player.findMany({
    where: { teamId },
    orderBy: { username: 'asc' },
  });

  return players;
}

// ============================================================================
// TEAM LIMITS
// ============================================================================

// Check team limits
async function checkTeamLimits(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      _count: {
        select: {
          players: true,
          events: true
        }
      }
    },
  });

  const config = require('../config/config');
  const limits = config.limits[team.tier];

  return {
    tier: team.tier,
    playerCount: team._count.players,
    eventCount: team._count.events,
    maxPlayers: limits.maxPlayers,
    maxEvents: limits.maxEvents,
    isAtPlayerLimit: limits.maxPlayers ? team._count.players >= limits.maxPlayers : false,
    isAtEventLimit: limits.maxEvents ? team._count.events >= limits.maxEvents : false,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

// Clean old events (for free tier 30-day limit)
async function cleanOldEvents() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const deleted = await prisma.event.deleteMany({
    where: {
      createdAt: {
        lt: thirtyDaysAgo,
      },
      team: {
        tier: 'free',
      },
    },
  });

  console.log(`🧹 Cleaned ${deleted.count} old events`);
  return deleted.count;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  prisma,
  // Team functions
  getTeamById,
  getTeamByRoleId,
  getGuildTeams,
  // Player functions
  getOrCreatePlayer,
  getTeamPlayers,
  // Event functions
  createEvent,
  getUpcomingEvents,
  getEventById,
  getEventByMessageId,
  // Response functions
  setPlayerResponse,
  // Limits
  checkTeamLimits,
  // Cleanup
  cleanOldEvents,
};