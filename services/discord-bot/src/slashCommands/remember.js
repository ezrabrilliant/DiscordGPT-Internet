/**
 * /remember - Query conversation history
 * Search what someone talked about before
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const aiClient = require('../services/aiClient');
const { logger } = require('../middleware');
const branding = require('../config/branding');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remember')
        .setDescription('🧠 Apa yang pernah dibicarakan seseorang?')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User yang mau dicari historynya')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('topic')
                .setDescription('Topik yang dicari (opsional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user');
        const topic = interaction.options.getString('topic');

        await interaction.deferReply();

        try {
            // Build query
            const query = topic
                ? `apa yang ${targetUser.username} bicarakan tentang ${topic}?`
                : `apa yang ${targetUser.username} sering bicarakan?`;

            const result = await aiClient.chat(query, {
                username: interaction.user.username,
                userId: interaction.user.id,
                serverId: interaction.guild?.id || 'DM',
                serverName: interaction.guild?.name || 'DM',
                channelId: interaction.channel?.id,
                channelName: interaction.channel?.name || 'Unknown',
            });

            if (result.success) {
                const embed = branding.createEmbed({
                    color: branding.COLORS.memory,
                    title: '🧠 Memory Recall',
                    thumbnail: targetUser.displayAvatarURL({ size: 128 }),
                    description: result.response,
                    fields: [
                        { name: '👤 Target', value: targetUser.displayName, inline: true },
                        { name: '🔍 Topic', value: topic || 'General', inline: true },
                    ],
                    footer: { provider: result.provider },
                });

                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply({
                    content: '❌ Tidak bisa mengakses memory. Coba lagi!',
                });
            }

            logger.info('Remember command executed', {
                requester: interaction.user.tag,
                target: targetUser.tag,
                topic: topic,
            });
        } catch (error) {
            logger.error('Remember command error', { error: error.message });
            await interaction.editReply({
                content: '❌ Terjadi error saat mencari memory.',
            });
        }
    },
};
