/**
 * Message Handler
 * Main entry point for processing Discord messages
 */

const { ChannelType } = require('discord.js');
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
 * Check if message is a DM (Direct Message)
 * Discord.js v14: Use ChannelType.DM
 */
function isDM(message) {
    return message.channel.type === ChannelType.DM;
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
 * Process AI chat request (shared logic for DM and server)
 */
async function processAIChat(message, query, isDMChannel = false) {
    // Check if there's actually a question
    if (!query || query.length < 2) {
        return message.reply(isDMChannel 
            ? 'Halo! Langsung aja tanya, gak perlu pake "zra" di DM 😊' 
            : 'Halo! Ada yang bisa kubantu? 😊'
        );
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Get AI response
    const result = await aiClient.chat(query, {
        username: message.author.username,
        userId: message.author.id,
        serverId: message.guild?.id || 'DM',
        serverName: message.guild?.name || 'Direct Message',
        channelId: message.channel.id,
        channelName: message.channel.name || 'DM',
        isDM: isDMChannel,
    });

    if (result.success) {
        // Send response
        await message.reply(result.response);

        // Log conversation for RAG
        await aiClient.logConversation({
            server: message.guild?.id || 'DM',
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
            responseLength: result.response.length,
            isDM: isDMChannel,
        });
    } else {
        // AI failed
        logger.error('AI chat failed', { error: result.error });
        return message.reply(MESSAGES.AI_UNAVAILABLE || '😵 Maaf, AI sedang tidak tersedia. Coba lagi nanti ya!');
    }
}

/**
 * Handle incoming Discord messages
 * @param {Message} message - Discord.js Message object
 */
async function handleMessage(message) {
    try {
        // Layer 1: Ignore bots
        if (security.isBot(message)) return;

        // Layer 2: Check if it's a DM - respond without prefix!
        if (isDM(message)) {
            // In DMs, respond to everything (no prefix needed)
            const query = message.content.trim();
            
            // Strip prefix if they still use it in DM
            const cleanQuery = isAIMessage(query) ? extractAIQuery(query) : query;
            
            logger.debug('DM received', {
                user: message.author.tag,
                query: cleanQuery.substring(0, 50)
            });
            
            return await processAIChat(message, cleanQuery, true);
        }

        // Layer 3: Security check (servers only)
        const securityCheck = security.checkDangerousMentions(message);
        if (securityCheck.blocked) {
            return message.channel.send(`${message.author}, ${securityCheck.reason}`);
        }

        // Layer 4: Check if it's a command
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

            // Unknown command - just ignore
            return;
        }

        // Layer 5: AI Chat in server (requires prefix: zra, ezra)
        if (isAIMessage(message.content)) {
            const query = extractAIQuery(message.content);
            return await processAIChat(message, query, false);
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
