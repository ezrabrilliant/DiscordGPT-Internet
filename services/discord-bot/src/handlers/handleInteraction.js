/**
 * Handle Button Interactions
 * Processes button clicks and responds with detailed information
 */

const { EmbedBuilder } = require('discord.js');
const wintercodeClient = require('../services/wintercodeClient');
const memoryService = require('../services/memoryService');
const conversationService = require('../services/conversationService');
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

        // Check if memoryService is loaded
        logger.debug('Memory service check', {
            hasMemoryService: !!memoryService,
            memoryServiceType: typeof memoryService,
            hasGetUserData: typeof memoryService?.getUserData
        });

        // Defer reply (show loading state)
        await interaction.deferReply();
        logger.debug('Defer reply completed');

        // Parse customId
        // Format: "select_{userId}|{optionIndex}|{optionName}|{originalQuery}"
        const parts = customId.split('|');
        const userId = parts[0].replace('select_', '');
        const optionIndex = parseInt(parts[1]);
        const optionName = decodeURIComponent(parts[2]);
        const originalQuery = decodeURIComponent(parts[3]);

        logger.info(`Button clicked: ${user.username} selected option ${optionIndex + 1} from query: "${originalQuery}"`);
        logger.debug('Parsed customId', { userId, optionIndex, optionName, originalQuery });

        // Get conversation context
        logger.debug('Attempting to get thread...');
        const thread = conversationService.getThread(user.id);
        logger.debug('Thread retrieved', { hasThread: !!thread, threadType: typeof thread });

        logger.debug('Attempting to get user data...');
        const userData = await memoryService.getUserData(user.id);
        logger.debug('User data retrieved', { hasUserData: !!userData, userType: typeof userData });

        // Format thread history for API
        const history = thread ? thread.messages : [];
        logger.debug('History formatted', { historyLength: history.length });

        // Build detailed query - AI will generate detailed response for this option
        const detailQuery = `User memilih: "${optionName}" dari pertanyaan "${originalQuery}". Berikan rekomendasi SPESIFIK, DETAIL, dan KONKRET hanya untuk "${optionName}". Jangan jelaskan opsi lain. Berikan contoh nyata, rekomendasi spesifik, dan tips yang bisa langsung dipraktikkan. Singkat tapi padat.`;

        // Get AI response with detail
        const response = await wintercodeClient.chat(detailQuery, {
            userId: user.id,
            username: user.username,
            serverId: channel.guildId,
            history: history,
            profile: userData?.profile
        });

        // Check if response is successful
        if (!response.success) {
            throw new Error(response.error || 'AI response failed');
        }

        // Delete the defer reply (loading state)
        await interaction.deleteReply();

        // Send embed with detailed response
        const embed = new EmbedBuilder()
            .setTitle(`✅ Pilihan ${optionIndex + 1}`)
            .setDescription(response.response.slice(0, 4096))
            .setColor('#00ff88')
            .setFooter({ text: `Powered by ${response.provider}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] });

        // Save to memory
        await memoryService.addConversation(user.id, {
            query: `[Selected option ${optionIndex + 1}] ${originalQuery}`,
            reply: response.response,
            hasImage: false,
            mood: 'neutral'
        });

        // Update conversation thread
        conversationService.addToThread(user.id, 'user', `[Selected option ${optionIndex + 1}] ${originalQuery}`);
        conversationService.addToThread(user.id, 'assistant', response.response);

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
