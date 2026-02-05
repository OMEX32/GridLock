const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get or create team
async function getOrCreateTeam(guildId, guildName) {
  let team = await prisma.team.findUnique({
    where: { guildId: guildId },
    include: {
      players: true,
      events: true,
    },
  });

  if (!team) {
    team = await prisma.team.create({
      data: {
        guildId: guildId,
        name: guildName,
      },
      include: {
        players: true,
        events: true,
      },
    });
    console.log(`✅ Created new team: ${guildName}`);
  }

  return team;
}

// Get or create player
async function getOrCreatePlayer(discordId, username, teamId) {
  let player = await prisma.player.findFirst({
    where: {
      discordId: discordId,
      teamId: teamId,
    },
  });

  if (!player) {
    player = await prisma.player.create({
      data: {
        discordId: discordId,
        username: username,
        teamId: teamId,
      },
    });
    console.log(`✅ Added player: ${username} to team`);
  } else if (player.username !== username) {
    // Update username if changed
    player = await prisma.player.update({
      where: { id: player.id },
      data: { username: username },
    });
  }

  return player;
}

// Create event
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

// Check team limits
async function checkTeamLimits(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      players: true,
      events: true,
    },
  });

  const config = require('../config/config');
  const limits = config.limits[team.tier];

  return {
    tier: team.tier,
    playerCount: team.players.length,
    maxPlayers: limits.maxPlayers,
    isAtPlayerLimit: limits.maxPlayers ? team.players.length >= limits.maxPlayers : false,
  };
}

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

module.exports = {
  prisma,
  getOrCreateTeam,
  getOrCreatePlayer,
  createEvent,
  getUpcomingEvents,
  getEventById,
  getEventByMessageId,
  setPlayerResponse,
  getTeamPlayers,
  checkTeamLimits,
  cleanOldEvents,
};