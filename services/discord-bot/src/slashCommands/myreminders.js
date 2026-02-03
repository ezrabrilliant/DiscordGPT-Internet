/**
 * /myreminders - View My Reminders Command
 * List all your active reminders
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const reminderService = require('../services/reminderService');
const { logger } = require('../middleware');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myreminders')
        .setDescription('📋 View your active reminders')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const reminders = await reminderService.getUserReminders(interaction.user.id);

            if (reminders.length === 0) {
                return await interaction.editReply({
                    content: `📋 **Your Reminders**\n\nYou don't have any active reminders.\n\nUse \`/remind\` to create one!`
                });
            }

            // Format reminders
            const reminderList = reminders
                .map((r, i) => reminderService.formatReminder(r, i))
                .join('\n\n');

            // Split if too long (discord limit is 2000 chars)
            if (reminderList.length > 1800) {
                const chunks = [];
                let currentChunk = '';

                for (const line of reminderList.split('\n')) {
                    if ((currentChunk + line).length > 1800) {
                        chunks.push(currentChunk);
                        currentChunk = line;
                    } else {
                        currentChunk += '\n' + line;
                    }
                }

                if (currentChunk) {
                    chunks.push(currentChunk);
                }

                await interaction.editReply({
                    content: `📋 **Your Reminders** (${reminders.length} active)\n\n${chunks[0]}`
                });

            } else {
                await interaction.editReply({
                    content: `📋 **Your Reminders** (${reminders.length} active)\n\n${reminderList}\n\n💡 Use \`/remind\` to create more!`
                });
            }

            logger.info('MyReminders command executed', {
                user: interaction.user.tag,
                count: reminders.length
            });

        } catch (error) {
            logger.error('MyReminders command error', { error: error.message });
            await interaction.editReply({
                content: '❌ Failed to load reminders. Try again!'
            });
        }
    }
};
