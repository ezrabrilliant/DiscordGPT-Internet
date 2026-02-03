/**
 * Handle Button Interactions
 * Processes button clicks and responds with detailed information
 */

const { EmbedBuilder, ComponentType } = require('discord.js');
const { wintercodeClient } = require('../services/wintercodeClient');
const { aiRouterService } = require('../services/aiRouterService');
const { memoryService } = require('../services/memoryService');
const { conversationService } = require('../services/conversationService');

/**
 * Handle button interaction
 */
async function handleButtonInteraction(interaction) {
    const { user, channel, customId, message } = interaction;

    try {
        // Defer reply (show loading state)
        await interaction.deferReply();

        // Parse customId
        // Format: "select_option_{userId}_{optionIndex}_{originalQuery}"
        const parts = customId.split('_');
        const userId = parts[2];
        const optionIndex = parseInt(parts[3]);
        const originalQuery = parts.slice(4).join('_');

        // Get conversation context
        const context = await conversationService.getConversation(user.id);
        const userData = await memoryService.getUserData(user.id);

        // Build detailed query
        const detailQuery = `User selected option ${optionIndex + 1} from: "${originalQuery}". Provide detailed information about this specific option.`;

        // Get AI response with detail
        const response = await wintercodeClient.chat(detailQuery, {
            userId: user.id,
            username: user.username,
            serverId: channel.guildId,
            history: context?.messages || [],
            profile: userData?.profile
        });

        // Delete the defer reply and send new message
        await interaction.deleteReply();

        // Send embed with detailed response
        const embed = new EmbedBuilder()
            .setTitle(`✅ Pilihan ${optionIndex + 1}`)
            .setDescription(response.reply)
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
        await conversationService.addMessage(user.id, 'user', `[Selected option ${optionIndex + 1}] ${originalQuery}`);
        await conversationService.addMessage(user.id, 'assistant', response.reply);

    } catch (error) {
        console.error('Error handling button interaction:', error);

        try {
            // Edit the defer reply with error message
            await interaction.editReply({
                content: '❌ Maaf, terjadi kesalahan saat memproses pilihanmu. Coba lagi ya!',
                embeds: [],
                components: []
            });
        } catch (editError) {
            console.error('Error editing reply:', editError);
        }
    }
}

/**
 * Main interaction handler
 */
async function handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    console.log(`Button clicked by ${interaction.user.username}: ${interaction.customId}`);

    await handleButtonInteraction(interaction);
}

module.exports = { handleInteraction };
