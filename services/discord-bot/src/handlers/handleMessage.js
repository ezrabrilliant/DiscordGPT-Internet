/**
 * Message Handler
 * Main entry point for processing Discord messages
 */

const { getCommand } = require('../commands');
const { security, logger } = require('../middleware');
const { PREFIX, AI_PREFIXES, MESSAGES } = require('../config');
const aiClient = require('../services/aiClient');

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
 * Extract the actual question from AI message
 * Removes the prefix (zra, ezra) from the message
 */
function extractAIQuery(content) {
    const lower = content.toLowerCase();
    for (const prefix of AI_PREFIXES) {
        if (lower.startsWith(prefix)) {
            // Remove prefix and trim, handle cases like "zra," or "ezra "
            return content.slice(prefix.length).replace(/^[,\s]+/, '').trim();
        }
    }
    return content;
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
            return message.channel.send(`${message.author}, ${securityCheck.reason}`);
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
            const query = extractAIQuery(message.content);
            
            // Check if there's actually a question
            if (!query || query.length < 2) {
                return message.reply('Halo! Ada yang bisa kubantu? 😊');
            }

            // Show typing indicator
            await message.channel.sendTyping();

            // Get AI response
            const result = await aiClient.chat(query, {
                username: message.author.username,
                userId: message.author.id,
                serverId: message.guild?.id,
                serverName: message.guild?.name,
                channelId: message.channel.id,
                channelName: message.channel.name,
            });

            if (result.success) {
                // Send response
                const reply = await message.reply(result.response);

                // Log conversation for RAG
                await aiClient.logConversation({
                    server: message.guild?.id,
                    user: message.author.id,
                    username: message.author.username,
                    query: query,
                    reply: result.response,
                });

                // Log provider info
                logger.info('AI response sent', {
                    user: message.author.tag,
                    provider: result.provider,
                    queryLength: query.length,
                    responseLength: result.response.length
                });
            } else {
                // AI failed
                logger.error('AI chat failed', { error: result.error });
                return message.reply(MESSAGES.AI_UNAVAILABLE || '😵 Maaf, AI sedang tidak tersedia. Coba lagi nanti ya!');
            }

            return;
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
