/**
 * Message Handler v2
 * Enhanced with:
 * - Reply context awareness
 * - Image/sticker reading
 * - Better conversation flow
 */

const { ChannelType, MessageType } = require('discord.js');
const { getCommand } = require('../commands');
const { security, logger } = require('../middleware');
const { PREFIX, AI_PREFIXES, MESSAGES } = require('../config');
const wintercodeClient = require('../services/wintercodeClient');

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
 * Check if message is a DM
 */
function isDM(message) {
    return message.channel.type === ChannelType.DM;
}

/**
 * Extract the actual question from AI message
 */
function extractAIQuery(content) {
    const lower = content.toLowerCase();
    for (const prefix of AI_PREFIXES) {
        if (lower.startsWith(prefix)) {
            return content.slice(prefix.length).replace(/^[,\s]+/, '').trim();
        }
    }
    return content;
}

/**
 * Get image from message (attachment or sticker)
 */
function getMessageImage(message) {
    // Check for attachments (images)
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        // Only process image attachments
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            return {
                url: attachment.url,
                contentType: attachment.contentType,
                name: attachment.name
            };
        }
    }

    // Check for stickers
    if (message.stickers.size > 0) {
        const sticker = message.stickers.first();
        return {
            url: sticker.url,
            contentType: 'image/png', // Stickers are usually PNG
            name: sticker.name
        };
    }

    return null;
}

/**
 * Get replied message content (for context)
 */
async function getRepliedMessage(message) {
    if (message.type === MessageType.Reply && message.reference) {
        try {
            const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
            return {
                content: repliedMessage.content,
                author: repliedMessage.author.username,
                image: getMessageImage(repliedMessage)
            };
        } catch (error) {
            logger.debug('Failed to fetch replied message', { error: error.message });
        }
    }
    return null;
}

/**
 * Build enhanced context for AI
 */
async function buildAIContext(message, query, isDMChannel) {
    const context = {
        username: message.author.username,
        userId: message.author.id,
        guildId: message.guild?.id || 'DM',
        serverId: message.guild?.id || 'DM',
        serverName: message.guild?.name || 'Direct Message',
        channelId: message.channel.id,
        channelName: message.channel.name || 'DM',
        isDM: isDMChannel,
    };

    // Get image if present
    const image = getMessageImage(message);
    if (image) {
        context.image = image;
        logger.debug('Image detected in message', {
            type: image.contentType,
            name: image.name
        });
    }

    // Get replied message for context
    const repliedMessage = await getRepliedMessage(message);
    if (repliedMessage) {
        context.replyTo = `${repliedMessage.author}: "${repliedMessage.content || '[image/sticker]'}"`;

        // If the replied message has an image, mention it
        if (repliedMessage.image) {
            context.replyTo += ` [${repliedMessage.image.contentType}]`;

            // If current message is just asking about the replied image, use that image
            if (!context.image && query.toLowerCase().includes('ini') && query.length < 50) {
                context.image = repliedMessage.image;
                logger.debug('Using image from replied message');
            }
        }

        logger.debug('Reply context', { replyTo: context.replyTo });
    }

    return context;
}

/**
 * Process AI chat request
 */
async function processAIChat(message, query, isDMChannel = false) {
    // Check if there's actually content
    const hasText = query && query.length > 0;
    const hasImage = getMessageImage(message) !== null;

    if (!hasText && !hasImage) {
        return message.reply(isDMChannel
            ? 'Halo! Kirim pesan atau gambar ya, aku akan bantu jawab 😊'
            : 'Halo! Ada yang bisa kubantu? 😊'
        );
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Build enhanced context
    const context = await buildAIContext(message, query, isDMChannel);

    // Build full query with context
    let fullQuery = query;
    if (context.replyTo) {
        fullQuery = `[Context: Membalas pesan "${context.replyTo}"]\n\n${query || 'Jelaskan gambar ini.'}`;
    }

    // If only image without text, provide default prompt
    if (!hasText && hasImage) {
        fullQuery = 'Jelaskan gambar ini dengan detail.';
    }

    // Get AI response
    const result = await wintercodeClient.chat(fullQuery, context);

    if (result.success) {
        // Send response
        await message.reply(result.response);

        // Log conversation
        await wintercodeClient.logConversation({
            server: message.guild?.id || 'DM',
            user: message.author.id,
            username: message.author.username,
            query: fullQuery,
            reply: result.response,
            hasImage: !!context.image,
        });

        // Log info
        logger.info('AI response sent', {
            user: message.author.tag,
            provider: result.provider,
            queryLength: fullQuery.length,
            responseLength: result.response.length,
            isDM: isDMChannel,
            hasImage: !!context.image
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
            const query = message.content.trim();
            const cleanQuery = isAIMessage(query) ? extractAIQuery(query) : query;

            logger.debug('DM received', {
                user: message.author.tag,
                query: cleanQuery.substring(0, 50),
                hasImage: getMessageImage(message) !== null
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
                // Check if command is disabled
                if (command.meta && command.meta.disabled) {
                    return message.reply(`❌ Command !${commandName} sedang dinonaktifkan.`);
                }

                logger.debug(`Executing command: ${commandName}`, {
                    user: message.author.tag,
                    guild: message.guild?.name
                });

                return await command.execute(message, args);
            }

            // Unknown command - just ignore
            return;
        }

        // Layer 5: GTID Help Channel - respond without prefix
        const GTID_HELP_CHANNEL = '1084384617605382184';
        if (message.channel.id === GTID_HELP_CHANNEL) {
            const query = message.content.trim();

            if (query.startsWith(PREFIX) || query.length < 3) return;

            logger.debug('GTID Help Channel message', {
                user: message.author.tag,
                query: query.substring(0, 50),
                hasImage: getMessageImage(message) !== null
            });

            return await processAIChat(message, query, false);
        }

        // Layer 6: AI Chat in server (requires prefix: zra, ezra)
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
