/**
 * Handle Button Interactions
 * Processes button clicks and responds with detailed information
 */

const { EmbedBuilder } = require('discord.js');
const { wintercodeClient } = require('../services/wintercodeClient');
const { memoryService } = require('../services/memoryService');
const { conversationService } = require('../services/conversationService');
const { logger } = require('../middleware');

/**
 * Handle button interaction
 */
async function handleButtonInteraction(interaction) {
    const { user, channel, customId } = interaction;

    try {
        logger.debug('Starting button interaction', {
            userId: user.id,
            customId: customId
        });

        // Check if conversationService is loaded
        logger.debug('Conversation service check', {
            hasService: !!conversationService,
            serviceType: typeof conversationService,
            hasGetThread: typeof conversationService?.getThread
        });

        // Defer reply (show loading state)
        await interaction.deferReply();

        // Parse customId
        // Format: "select_option_{userId}_{optionIndex}_{originalQuery}"
        const parts = customId.split('_');
        const userId = parts[2];
        const optionIndex = parseInt(parts[3]);
        const originalQuery = decodeURIComponent(parts.slice(4).join('_'));

        logger.info(`Button clicked: ${user.username} selected option ${optionIndex + 1} from query: "${originalQuery}"`);

        // Get conversation context
        const thread = conversationService.getThread(user.id);
        const userData = await memoryService.getUserData(user.id);

        // Format thread history for API
        const history = thread ? thread.messages : [];

        // Build detailed query - AI will generate detailed response for this option
        const detailQuery = `User selected option ${optionIndex + 1} from the question: "${originalQuery}". Provide detailed, comprehensive information specifically about this choice. Include specific recommendations, examples, and actionable advice.`;

        // Get AI response with detail
        const response = await wintercodeClient.chat(detailQuery, {
            userId: user.id,
            username: user.username,
            serverId: channel.guildId,
            history: history,
            profile: userData?.profile
        });

        // Delete the defer reply (loading state)
        await interaction.deleteReply();

        // Send embed with detailed response
        const embed = new EmbedBuilder()
            .setTitle(`✅ Pilihan ${optionIndex + 1}`)
            .setDescription(response.reply.slice(0, 4096))
            .setColor('#00ff88')
            .setFooter({ text: `Powered by ${response.provider}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });

        // Save to memory
        await memoryService.addConversation(user.id, {
            query: `[Selected option ${optionIndex + 1}] ${originalQuery}`,
            reply: response.reply,
            hasImage: false,
            mood: 'neutral'
        });

        // Update conversation thread
        conversationService.addToThread(user.id, 'user', `[Selected option ${optionIndex + 1}] ${originalQuery}`);
        conversationService.addToThread(user.id, 'assistant', response.reply);

        logger.info(`Button interaction completed for ${user.username}`);

    } catch (error) {
        logger.error('Error handling button interaction', { error: error.message });

        try {
            // Edit the defer reply with error message
            await interaction.editReply({
                content: '❌ Maaf, terjadi kesalahan saat memproses pilihanmu. Coba lagi ya!',
                embeds: [],
                components: []
            });
        } catch (editError) {
            logger.error('Error editing reply', { error: editError.message });
        }
    }
}

/**
 * Main interaction handler
 */
async function handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    logger.info(`Button interaction received: ${interaction.customId}`);

    await handleButtonInteraction(interaction);
}

module.exports = { handleInteraction };
