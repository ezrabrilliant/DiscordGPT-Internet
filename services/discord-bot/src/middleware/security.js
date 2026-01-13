/**
 * Security Middleware
 * Validates messages for dangerous mentions before processing
 */

const { MESSAGES } = require('../config');

/**
 * Check if message contains dangerous mentions
 * @param {Message} message - Discord message object
 * @returns {{ blocked: boolean, reason?: string }}
 */
function checkDangerousMentions(message) {
    // Block @everyone and @here
    if (message.mentions.everyone) {
        console.log(`[SECURITY] Blocked @everyone/@here from ${message.author.tag} in ${message.guild?.name}`);
        return { blocked: true, reason: MESSAGES.ERROR_EVERYONE };
    }

    // Block role mentions
    if (message.mentions.roles.size > 0) {
        const roles = message.mentions.roles.map(r => r.name).join(', ');
        console.log(`[SECURITY] Blocked role mention (${roles}) from ${message.author.tag}`);
        return { blocked: true, reason: MESSAGES.ERROR_ROLE };
    }

    return { blocked: false };
}

/**
 * Check if message author is a bot
 * @param {Message} message 
 * @returns {boolean}
 */
function isBot(message) {
    return message.author.bot;
}

module.exports = {
    checkDangerousMentions,
    isBot,
};
