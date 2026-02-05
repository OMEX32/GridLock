const { PermissionFlagsBits } = require('discord.js');

function hasManageGuildPermission(member) {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function hasAdminPermission(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function canManageEvents(member) {
  // Allow admins and users with Manage Server permission
  return hasAdminPermission(member) || hasManageGuildPermission(member);
}

module.exports = {
  hasManageGuildPermission,
  hasAdminPermission,
  canManageEvents,
};