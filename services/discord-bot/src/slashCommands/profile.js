/**
 * /profile - User Profile Command
 * View your stats and profile information
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, EmbedBuilder } = require('discord.js');
const memoryService = require('../services/memoryService');
const conversationService = require('../services/conversationService');
const { logger } = require('../middleware');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('👤 View your profile & stats')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const userId = interaction.user.id;
            const username = interaction.user.username;

            // Get user data from memory
            const userData = await memoryService.getUserData(userId);

            // Get conversation stats
            const threadStats = conversationService.getThreadStats(userId);

            // Calculate average message length
            const avgMessageLength = userData.conversations.length > 0
                ? Math.round(
                    userData.conversations.reduce((sum, c) => sum + c.query.length, 0) /
                    userData.conversations.length
                )
                : 0;

            // Build profile embed
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`👤 Profile: ${username}`)
                .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
                .addFields(
                    {
                        name: '📊 Statistics',
                        value: [
                            `**Messages:** ${userData.stats.totalMessages}`,
                            `**With Images:** ${userData.stats.withImages}`,
                            `**Avg Message Length:** ${avgMessageLength} chars`,
                            `**Active Thread:** ${threadStats.messageCount} messages`
                        ].join('\n'),
                        inline: true
                    },
                    {
                        name: '🧠 Memory',
                        value: [
                            `**Stored Conversations:** ${userData.conversations.length}`,
                            `**Last Seen:** ${userData.stats.lastSeen ? new Date(userData.stats.lastSeen).toLocaleDateString('id-ID') : 'Unknown'}`,
                            `**Average Mood:** ${userData.stats.averageMood || 'neutral'}`
                        ].join('\n'),
                        inline: true
                    }
                );

            // Add profile info if available
            const profileInfo = [];
            if (userData.profile.name) profileInfo.push(`**Name:** ${userData.profile.name}`);
            if (userData.profile.age) profileInfo.push(`**Age:** ${userData.profile.age}`);
            if (userData.profile.location) profileInfo.push(`**Location:** ${userData.profile.location}`);
            if (userData.profile.hobbies && userData.profile.hobbies.length > 0) {
                profileInfo.push(`**Hobbies:** ${userData.profile.hobbies.join(', ')}`);
            }

            if (profileInfo.length > 0) {
                embed.addFields({
                    name: '📝 Profile Information',
                    value: profileInfo.join('\n')
                });
            }

            // Add top topics if available
            if (userData.stats.topTopics && userData.stats.topTopics.length > 0) {
                embed.addFields({
                    name: '💬 Top Topics',
                    value: userData.stats.topTopics.slice(0, 5).join(', '),
                    inline: false
                });
            }

            embed.setFooter({ text: `Last updated: ${new Date(userData.lastUpdated).toLocaleString('id-ID')}` });

            await interaction.editReply({ embeds: [embed] });

            logger.info('Profile command executed', {
                user: interaction.user.tag,
                totalMessages: userData.stats.totalMessages
            });

        } catch (error) {
            logger.error('Profile command error', { error: error.message });
            await interaction.editReply({
                content: '❌ Failed to load profile. Try again!'
            });
        }
    }
};
