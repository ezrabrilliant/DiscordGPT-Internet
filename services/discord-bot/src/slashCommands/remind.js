/**
 * /remind - Set Reminder Command
 * Create reminders for yourself
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const reminderService = require('../services/reminderService');
const { logger } = require('../middleware');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remind')
        .setDescription('⏰ Set reminder for yourself')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addStringOption(option =>
            option
                .setName('message')
                .setDescription('What do you want to be reminded about?')
                .setRequired(true)
                .setMaxLength(500)
        )
        .addStringOption(option =>
            option
                .setName('time')
                .setDescription('When to remind? (e.g., 1h, 30m, 2d)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const message = interaction.options.getString('message');
        const timeInput = interaction.options.getString('time');

        await interaction.deferReply();

        try {
            // Parse duration
            const duration = reminderService.parseDuration(timeInput);

            if (!duration) {
                return await interaction.editReply({
                    content: '❌ Invalid time format! Use format like: `1h` (1 hour), `30m` (30 minutes), `2d` (2 days)\n\nExamples:\n- `1h` - remind in 1 hour\n- `30m` - remind in 30 minutes\n- `2d` - remind in 2 days\n- `1h30m` - not supported yet'
                });
            }

            // Calculate due time
            const dueTime = new Date(Date.now() + duration);

            // Create reminder
            const reminder = await reminderService.createReminder(
                interaction.user.id,
                interaction.user.username,
                message,
                dueTime,
                interaction.channelId,
                interaction.guild?.id || null
            );

            // Format time left
            const diffMs = duration;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            let timeLeft;
            if (diffMins < 60) {
                timeLeft = `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
            } else if (diffHours < 24) {
                timeLeft = `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
            } else {
                timeLeft = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
            }

            const dueTimeStr = dueTime.toLocaleString('id-ID', {
                timeZone: 'Asia/Jakarta',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            await interaction.editReply({
                content: `✅ Reminder set!\n\n**Reminder:** ${message}\n**In:** ${timeLeft}\n**At:** ${dueTimeStr} (WIB)\n\nI'll DM you when it's time! ⏰`
            });

            logger.info('Reminder created via slash command', {
                user: interaction.user.tag,
                message: message.substring(0, 50),
                timeLeft
            });

        } catch (error) {
            logger.error('Remind command error', { error: error.message });
            await interaction.editReply({
                content: '❌ Failed to create reminder. Try again!'
            });
        }
    }
};
