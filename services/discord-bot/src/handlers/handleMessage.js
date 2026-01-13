/**
 * Message Handler
 * Main entry point for processing Discord messages
 */

const { getCommand } = require('../commands');
const { security, logger } = require('../middleware');
const { PREFIX, AI_PREFIXES, MESSAGES } = require('../config');

/**
 * Parse command from message content
 */
function parseMessage(content) {
    const args = content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    return { commandName, args };
}

/**
 * Check if message starts with AI prefix (zra, ezra)
 */
function isAIMessage(content) {
    const lower = content.toLowerCase();
    return AI_PREFIXES.some(prefix => lower.startsWith(prefix));
}

/**
 * Handle incoming Discord messages
 * @param {Message} message - Discord.js Message object
 */
async function handleMessage(message) {
    try {
        // Layer 1: Ignore bots
        if (security.isBot(message)) return;

        // Layer 2: Security check (global)
        const securityCheck = security.checkDangerousMentions(message);
        if (securityCheck.blocked) {
            return message.reply(securityCheck.reason);
        }

        // Layer 3: Check if it's a command
        if (message.content.startsWith(PREFIX)) {
            const { commandName, args } = parseMessage(message.content);

            // Get command from registry
            const command = getCommand(commandName);

            if (command) {
                logger.debug(`Executing command: ${commandName}`, {
                    user: message.author.tag,
                    guild: message.guild?.name
                });

                return await command.execute(message, args);
            }

            // Unknown command - just ignore (or could reply with help)
            return;
        }

        // Layer 4: AI Chat (prefix: zra, ezra)
        if (isAIMessage(message.content)) {
            logger.info('AI chat attempted (disabled)', { user: message.author.tag });
            return message.reply(MESSAGES.AI_DISABLED);
        }

    } catch (error) {
        logger.error('Error handling message', {
            error: error.message,
            stack: error.stack,
            content: message.content
        });

        return message.reply(MESSAGES.ERROR_GENERIC);
    }
}

module.exports = handleMessage;
