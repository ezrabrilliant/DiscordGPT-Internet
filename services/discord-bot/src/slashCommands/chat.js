/**
 * /chat - AI Chat Command
 * Talk to AI directly via slash command
 */

const { SlashCommandBuilder, EmbedBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const aiClient = require('../services/aiClient');
const { logger } = require('../middleware');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('💬 Chat with AI - I remember our conversations!')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('What do you want to ask?')
                .setRequired(true)
                .setMaxLength(2000)
        )
        .addBooleanOption(option =>
            option
                .setName('private')
                .setDescription('Only you can see the response')
                .setRequired(false)
        ),

    async execute(interaction) {
        const query = interaction.options.getString('message');
        const isPrivate = interaction.options.getBoolean('private') ?? false;

        // Defer reply (AI might take time)
        await interaction.deferReply({ ephemeral: isPrivate });

        try {
            const result = await aiClient.chat(query, {
                username: interaction.user.username,
                userId: interaction.user.id,
                serverId: interaction.guild?.id || 'DM',
                serverName: interaction.guild?.name || 'Direct Message',
                channelId: interaction.channel?.id,
                channelName: interaction.channel?.name || 'Unknown',
                isDM: !interaction.guild,
            });

            if (result.success) {
                // Log for RAG
                await aiClient.logConversation({
                    server: interaction.guild?.id || 'DM',
                    user: interaction.user.id,
                    username: interaction.user.username,
                    query: query,
                    reply: result.response,
                });

                // Truncate query if too long for display
                const displayQuery = query.length > 256 
                    ? query.substring(0, 253) + '...' 
                    : query;

                // Create embed response with Q&A style
                const embed = new EmbedBuilder()
                    .setColor(0x5865F2)
                    .setAuthor({
                        name: `${interaction.user.displayName} asked`,
                        iconURL: interaction.user.displayAvatarURL(),
                    })
                    .addFields(
                        {
                            name: '💭 Question',
                            value: `\`\`\`${displayQuery}\`\`\``,
                            inline: false,
                        },
                        {
                            name: '🤖 Answer',
                            value: result.response.length > 1024 
                                ? result.response.substring(0, 1021) + '...'
                                : result.response,
                            inline: false,
                        }
                    )
                    .setFooter({
                        text: `${isPrivate ? '🔒 Private' : '🌐 Public'} • Powered by RAG Memory`,
                    })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                logger.info('Slash chat executed', {
                    user: interaction.user.tag,
                    query: query.substring(0, 50),
                    private: isPrivate,
                });
            } else {
                await interaction.editReply({
                    content: '😵 Maaf, AI sedang tidak tersedia. Coba lagi nanti!',
                });
            }
        } catch (error) {
            logger.error('Slash chat error', { error: error.message });
            await interaction.editReply({
                content: '❌ Terjadi error. Coba lagi ya!',
            });
        }
    },
};
