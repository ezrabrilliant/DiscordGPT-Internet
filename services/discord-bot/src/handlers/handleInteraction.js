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
        // Defer reply (show loading state)
        await interaction.deferReply();

        // Parse customId
        // Format: "select_{userId}|{optionIndex}|{optionName}|{originalQuery}"
        const parts = customId.split('|');
        const userId = parts[0].replace('select_', '');
        const optionIndex = parseInt(parts[1]);
        const optionName = decodeURIComponent(parts[2]);
        const originalQuery = decodeURIComponent(parts[3]);

        logger.info(`Button clicked: ${user.username} selected "${optionName}" from query: "${originalQuery}"`);

        // Get conversation context
        const thread = conversationService.getThread(user.id);
        const userData = await memoryService.getUserData(user.id);

        // Format thread history for API
        const history = thread ? thread.messages : [];

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
        await memoryService.addConversation(
            user.id,
            user.username,
            `Pilihan: ${optionName} (dari: ${originalQuery})`,
            response.response,
            false,
            'neutral'
        );

        // Update conversation thread
        conversationService.addToThread(user.id, 'user', `Pilihan: ${optionName}`);
        conversationService.addToThread(user.id, 'assistant', response.response);

        // Log to messages.log
        wintercodeClient.logConversation({
            server: channel.guildId || 'DM',
            user: user.id,
            username: user.username,
            query: `Pilihan: ${optionName} (dari: ${originalQuery})`,
            reply: response.response,
            hasImage: false
        });

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
