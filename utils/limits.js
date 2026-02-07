const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const config = require('../config/config');
const { createErrorEmbed, createWarningEmbed } = require('./embeds');

/**
 * Check if a team can add more players
 * @param {string} teamId - Team ID to check
 * @returns {Promise<{allowed: boolean, reason?: string, currentCount: number, limit: number|null}>}
 */
async function canAddPlayer(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      _count: {
        select: { players: true }
      }
    }
  });

  if (!team) {
    return { allowed: false, reason: 'Team not found', currentCount: 0, limit: 0 };
  }

  const limits = config.limits[team.tier];
  const currentCount = team._count.players;
  const maxPlayers = limits.maxPlayers;

  if (maxPlayers === null) {
    // Unlimited
    return { allowed: true, currentCount, limit: null };
  }

  if (currentCount >= maxPlayers) {
    return { 
      allowed: false, 
      reason: `Team is at the ${team.tier} tier limit of ${maxPlayers} players`,
      currentCount,
      limit: maxPlayers
    };
  }

  return { allowed: true, currentCount, limit: maxPlayers };
}

/**
 * Check if a team can create more events
 * @param {string} teamId - Team ID to check
 * @returns {Promise<{allowed: boolean, reason?: string, currentCount: number, limit: number|null}>}
 */
async function canCreateEvent(teamId) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      _count: {
        select: { events: true }
      }
    }
  });

  if (!team) {
    return { allowed: false, reason: 'Team not found', currentCount: 0, limit: 0 };
  }

  const limits = config.limits[team.tier];
  const currentCount = team._count.events;
  const maxEvents = limits.maxEvents;

  if (maxEvents === null) {
    // Unlimited
    return { allowed: true, currentCount, limit: null };
  }

  if (currentCount >= maxEvents) {
    return { 
      allowed: false, 
      reason: `Team is at the ${team.tier} tier limit of ${maxEvents} events`,
      currentCount,
      limit: maxEvents
    };
  }

  return { allowed: true, currentCount, limit: maxEvents };
}

/**
 * Get warning embed when approaching player limit
 * @param {number} currentCount - Current player count
 * @param {number} limit - Player limit
 * @returns {EmbedBuilder|null}
 */
function getPlayerLimitWarning(currentCount, limit) {
  if (limit === null) return null; // Unlimited
  
  const remaining = limit - currentCount;
  
  if (remaining <= 0) {
    return createErrorEmbed(
      'Player Limit Reached',
      `🚫 Your team has reached the free tier limit of ${limit} players.\n\n` +
      '**To add more players, upgrade to Starter or Pro:**\n' +
      '• Starter: Unlimited players + reminders\n' +
      '• Pro: All features + analytics\n\n' +
      'Use `/upgrade` to see pricing!'
    );
  }

  if (remaining <= 3) {
    return createWarningEmbed(
      'Approaching Player Limit',
      `⚠️ You have ${remaining} player slot${remaining !== 1 ? 's' : ''} remaining (${currentCount}/${limit}).\n\n` +
      'Upgrade to unlock unlimited players with `/upgrade`!'
    );
  }

  return null;
}

/**
 * Get warning embed when approaching event limit
 * @param {number} currentCount - Current event count
 * @param {number} limit - Event limit
 * @returns {EmbedBuilder|null}
 */
function getEventLimitWarning(currentCount, limit) {
  if (limit === null) return null; // Unlimited
  
  const remaining = limit - currentCount;
  
  if (remaining <= 0) {
    return createErrorEmbed(
      'Event Limit Reached',
      `🚫 Your team has reached the limit of ${limit} events.\n\n` +
      '**To create more events, upgrade your plan:**\n' +
      'Use `/upgrade` to see pricing!'
    );
  }

  if (remaining <= 5) {
    return createWarningEmbed(
      'Approaching Event Limit',
      `⚠️ You have ${remaining} event${remaining !== 1 ? 's' : ''} remaining (${currentCount}/${limit}).\n\n` +
      'Upgrade to unlock unlimited events with `/upgrade`!'
    );
  }

  return null;
}

/**
 * Check if team has access to a specific feature
 * @param {string} teamId - Team ID
 * @param {string} feature - Feature name (e.g., 'reminders', 'analytics')
 * @returns {Promise<boolean>}
 */
async function hasFeatureAccess(teamId, feature) {
  const team = await prisma.team.findUnique({
    where: { id: teamId }
  });

  if (!team) return false;

  const limits = config.limits[team.tier];
  return limits.features[feature] === true;
}

/**
 * Get upgrade embed for when a feature is locked
 * @param {string} feature - Feature name
 * @param {string} tier - Current tier
 * @returns {EmbedBuilder}
 */
function getFeatureLockedEmbed(feature, tier) {
  const featureNames = {
    reminders: 'Event Reminders',
    recurring: 'Recurring Events',
    analytics: 'Advanced Analytics',
    integrations: 'Platform Integrations',
    customBranding: 'Custom Branding',
    apiAccess: 'API Access'
  };

  const requiredTier = getRequiredTierForFeature(feature);

  return createWarningEmbed(
    `${featureNames[feature] || feature} - Premium Feature`,
    `🔒 This feature requires ${requiredTier} tier or higher.\n\n` +
    `You are currently on the **${tier}** tier.\n\n` +
    '**Upgrade to unlock:**\n' +
    '• Event reminders\n' +
    '• Recurring events\n' +
    '• Advanced analytics\n' +
    '• And more!\n\n' +
    'Use `/upgrade` to see all plans and pricing!'
  );
}

/**
 * Get the minimum tier required for a feature
 * @param {string} feature - Feature name
 * @returns {string}
 */
function getRequiredTierForFeature(feature) {
  if (feature === 'reminders' || feature === 'recurring') return 'Starter';
  if (feature === 'analytics' || feature === 'integrations' || feature === 'customBranding') return 'Pro';
  if (feature === 'apiAccess' || feature === 'sla') return 'Enterprise';
  return 'Premium';
}

/**
 * Log a limit violation for monitoring
 * @param {string} teamId - Team ID
 * @param {string} limitType - Type of limit ('player', 'event', 'feature')
 * @param {string} action - Action attempted
 */
async function logLimitViolation(teamId, limitType, action) {
  console.log(`⚠️ LIMIT VIOLATION: Team ${teamId} - ${limitType} limit - Action: ${action}`);
  // In production, you might want to log this to a database or monitoring service
}

module.exports = {
  canAddPlayer,
  canCreateEvent,
  getPlayerLimitWarning,
  getEventLimitWarning,
  hasFeatureAccess,
  getFeatureLockedEmbed,
  logLimitViolation
};
