/**
 * Message Handler v3 - Enhanced
 * Features:
 * - Memory system (user profiles & history)
 * - Mention detection (@Ezra's, @Ezra)
 * - Multi-image support
 * - Conversation threads (context retention)
 * - Mood detection
 * - Reply context awareness
 * - Smart embeds/buttons
 */

const { ChannelType, MessageType } = require('discord.js');
const { getCommand } = require('../commands');
const { security, logger } = require('../middleware');
const { PREFIX, AI_PREFIXES, MESSAGES } = require('../config');
const wintercodeClient = require('../services/wintercodeClient');
const memoryService = require('../services/memoryService');
const conversationService = require('../services/conversationService');
const aiRouterService = require('../services/aiRouterService');

// ============================================
// Helper Functions
// ============================================

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
 * Check if bot is mentioned
 */
function isBotMentioned(message) {
    // Check if message mentions the bot
    if (message.mentions.users.has(message.client.user.id)) {
        return true;
    }

    // Check for @Ezra's or @Ezra in text (partial match)
    const content = message.content.toLowerCase();
    if (content.includes('@ezra') || content.includes('@ezra\'s')) {
        return true;
    }

    return false;
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
 * Get all images from message (attachments + stickers)
 */
function getMessageImages(message) {
    const images = [];

    // Check for attachments (images)
    message.attachments.forEach(attachment => {
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            images.push({
                url: attachment.url,
                contentType: attachment.contentType,
                name: attachment.name
            });
        }
    });

    // Check for stickers
    message.stickers.forEach(sticker => {
        images.push({
            url: sticker.url,
            contentType: 'image/png',
            name: sticker.name
        });
    });

    return images;
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
                authorId: repliedMessage.author.id,
                images: getMessageImages(repliedMessage)
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

    // Get images (multiple support)
    const images = getMessageImages(message);
    if (images.length > 0) {
        context.images = images;
        logger.debug('Images detected in message', {
            count: images.length,
            types: images.map(i => i.contentType)
        });
    }

    // Get replied message for context
    const repliedMessage = await getRepliedMessage(message);
    if (repliedMessage) {
        context.replyTo = `${repliedMessage.author}: "${repliedMessage.content || '[image/sticker]'}"`;

        // If the replied message has images and current message is short, use those images
        if (repliedMessage.images.length > 0 && !context.images.length && query.length < 50) {
            context.images = repliedMessage.images;
            logger.debug('Using images from replied message');
        }

        logger.debug('Reply context', { replyTo: context.replyTo });
    }

    // Get user profile from memory
    try {
        const profileContext = await memoryService.formatProfileForContext(message.author.id);
        if (profileContext) {
            context.profileInfo = profileContext;
        }
    } catch (error) {
        logger.debug('Failed to load user profile', { error: error.message });
    }

    // Get conversation thread history
    try {
        const threadHistory = conversationService.formatThreadForAI(message.author.id);
        if (threadHistory) {
            context.threadHistory = threadHistory;
        }
    } catch (error) {
        logger.debug('Failed to load thread history', { error: error.message });
    }

    return context;
}

/**
 * Process AI chat request
 */
async function processAIChat(message, query, isDMChannel = false) {
    // Check if there's actually content
    const hasText = query && query.length > 0;
    const images = getMessageImages(message);
    const hasImages = images.length > 0;

    if (!hasText && !hasImages) {
        return message.reply(isDMChannel
            ? 'Halo! Kirim pesan atau gambar ya, aku akan bantu jawab 😊'
            : 'Halo! Ada yang bisa kubantu? 😊'
        );
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Build enhanced context first (for router)
    const context = await buildAIContext(message, query, isDMChannel);

    // Use AI Router for decision making
    let routingDecision;
    try {
        routingDecision = await aiRouterService.makeRoutingDecision(query || '[image]', {
            username: message.author.username,
            hasImages: hasImages,
            isReplying: context.replyTo !== undefined,
            previousContext: context.threadHistory || 'None'
        });
    } catch (error) {
        logger.debug('AI Router exception, using heuristic fallback', { error: error.message });
        routingDecision = aiRouterService.makeHeuristicDecision(query || '[image]', {
            username: message.author.username,
            hasImages: hasImages,
            isReplying: context.replyTo !== undefined,
            previousContext: context.threadHistory || 'None'
        });
    }

    logger.debug('AI Router decision', {
        mood: routingDecision.mood,
        shouldUseEmbed: routingDecision.shouldUseEmbed,
        confidence: routingDecision.confidence,
        reasoning: routingDecision.reasoning
    });

    // Update user profile with extracted info
    if (routingDecision.extractedInfo && routingDecision.confidence > 0.6) {
        try {
            const profileUpdates = aiRouterService.processExtractedInfo(routingDecision.extractedInfo);
            if (Object.keys(profileUpdates).length > 0) {
                await memoryService.updateProfile(message.author.id, profileUpdates);
                logger.debug('Profile updated from router', { updates: profileUpdates });
            }
        } catch (error) {
            logger.debug('Failed to update profile', { error: error.message });
        }
    }

    // Add mood to context from router
    context.mood = routingDecision.mood;
    context.moodAdjustment = aiRouterService.getMoodPromptAdjustment(routingDecision.mood);

    // Build full query with context
    let fullQuery = query;

    if (context.replyTo) {
        fullQuery = `[Context: Membalas pesan "${context.replyTo}"]\n\n${query || 'Jelaskan gambar ini.'}`;
    }

    // If only images without text, provide default prompt
    if (!hasText && hasImages) {
        fullQuery = hasImages > 1
            ? `Jelaskan ${hasImages} gambar ini secara detail.`
            : 'Jelaskan gambar ini dengan detail.';
    }

    // Check if we should use buttons (recommendation flow)
    if (routingDecision.shouldUseButtons && routingDecision.buttonOptions.length > 0) {
        // Send button selection UI
        const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

        // Build embed with options
        const optionsText = routingDecision.buttonOptions
            .map((opt, i) => `${i + 1}. ${opt}`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle('Silahkan pilih rekomendasi:')
            .setDescription(optionsText)
            .setColor(0x00FF00)
            .setFooter({ text: 'Klik tombol di bawah untuk memilih' });

        // Build button row
        const buttonRow = new ActionRowBuilder();
        routingDecision.buttonOptions.forEach((option, index) => {
            const customId = `select_option_${message.author.id}_${index}_${encodeURIComponent(query)}`;
            buttonRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(`${index + 1}`)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        await message.reply({ embeds: [embed], components: [buttonRow] });

        // Save to memory
        await memoryService.addConversation(message.author.id, {
            query: query,
            reply: `[Button selection offered: ${routingDecision.buttonOptions.join(', ')}]`,
            hasImage: hasImages,
            mood: routingDecision.mood
        });

        return;
    }

    // Get AI response (normal flow without buttons)
    const result = await wintercodeClient.chat(fullQuery, context);

    if (result.success) {
        // Use router's decision for embed
        const useEmbed = routingDecision.shouldUseEmbed;

        if (useEmbed) {
            // Send embed response
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor(hasImages ? 0x0099FF : 0x00FF00)
                .setDescription(result.response.slice(0, 4096))
                .setFooter({ text: `Powered by ${result.provider} ${aiRouterService.getMoodEmoji(routingDecision.mood)}` });

            if (hasImages && images.length > 0) {
                embed.setImage(images[0].url);
            }

            await message.reply({ embeds: [embed] });
        } else {
            // Plain text response
            let responseText = result.response;

            // Add follow-up suggestions if needed
            if (routingDecision.shouldOfferFollowUp && routingDecision.followUpSuggestions.length > 0) {
                responseText += '\n\n**Mau lanjut:**\n' + routingDecision.followUpSuggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
            }

            await message.reply(responseText);
        }

        // Save to memory
        try {
            await memoryService.addConversation(
                message.author.id,
                message.author.username,
                query || '[image]',
                result.response,
                hasImages,
                routingDecision.mood
            );
        } catch (error) {
            logger.debug('Failed to save conversation', { error: error.message });
        }

        // Add to conversation thread
        try {
            conversationService.addToThread(message.author.id, 'user', query || '[image]', hasImages);
            conversationService.addToThread(message.author.id, 'assistant', result.response, false);
        } catch (error) {
            logger.debug('Failed to update thread', { error: error.message });
        }

        // Log conversation
        await wintercodeClient.logConversation({
            server: message.guild?.id || 'DM',
            user: message.author.id,
            username: message.author.username,
            query: fullQuery,
            reply: result.response,
            hasImage: hasImages,
            mood: routingDecision.mood
        });

        // Log info
        logger.info('AI response sent', {
            user: message.author.tag,
            provider: result.provider,
            queryLength: fullQuery.length,
            responseLength: result.response.length,
            isDM: isDMChannel,
            hasImages,
            mood: routingDecision.mood,
            routerConfidence: routingDecision.confidence
        });
    } else {
        // AI failed
        logger.error('AI chat failed', { error: result.error });
        return message.reply(MESSAGES.AI_UNAVAILABLE || '😵 Maaf, AI sedang tidak tersedia. Coba lagi nanti ya!');
    }
}

// ============================================
// Main Handler
// ============================================

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
                hasImages: getMessageImages(message).length
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
                hasImages: getMessageImages(message).length
            });

            return await processAIChat(message, query, false);
        }

        // Layer 6: Bot mention detection
        if (isBotMentioned(message)) {
            // Remove mention from query
            const query = message.content
                .replace(/<@!?(\d+)>/g, '')
                .replace(/@ezra[''s]?/gi, '')
                .trim();

            if (query.length < 2) {
                return message.reply('Halo! Ada yang bisa kubantu? 😊');
            }

            logger.debug('Bot mentioned', {
                user: message.author.tag,
                query: query.substring(0, 50),
                hasImages: getMessageImages(message).length
            });

            return await processAIChat(message, query, false);
        }

        // Layer 7: AI Chat in server (requires prefix: zra, ezra)
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
