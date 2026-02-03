/**
 * Reminder Worker
 * Background process to check and send reminders
 */

const { logger } = require('../middleware');
const reminderService = require('../services/reminderService');

let isRunning = false;
let checkInterval = null;
const CHECK_INTERVAL = 60000; // Check every minute

/**
 * Start reminder worker
 */
function startReminderWorker(bot) {
    if (isRunning) {
        logger.warn('Reminder worker already running');
        return;
    }

    isRunning = true;

    // Run immediately
    checkReminders(bot);

    // Then run every minute
    checkInterval = setInterval(() => {
        checkReminders(bot);
    }, CHECK_INTERVAL);

    logger.info('Reminder worker started', {
        checkInterval: `${CHECK_INTERVAL / 1000}s`
    });
}

/**
 * Stop reminder worker
 */
function stopReminderWorker() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }

    isRunning = false;
    logger.info('Reminder worker stopped');
}

/**
 * Check and send pending reminders
 */
async function checkReminders(bot) {
    try {
        const pendingReminders = await reminderService.getPendingReminders();

        if (pendingReminders.length === 0) {
            return;
        }

        logger.info('Processing pending reminders', {
            count: pendingReminders.length
        });

        for (const reminder of pendingReminders) {
            await sendReminder(bot, reminder);
        }

    } catch (error) {
        logger.error('Error checking reminders', { error: error.message });
    }
}

/**
 * Send reminder to user
 */
async function sendReminder(bot, reminder) {
    try {
        // Get channel
        const channel = await bot.channels.fetch(reminder.channelId).catch(() => null);

        if (!channel) {
            logger.warn('Channel not found for reminder', {
                reminderId: reminder.id,
                channelId: reminder.channelId
            });

            // Mark as sent anyway to avoid retries
            await reminderService.markReminderSent(reminder.id);
            return;
        }

        // Get user
        const user = await bot.users.fetch(reminder.userId).catch(() => null);

        if (!user) {
            logger.warn('User not found for reminder', {
                reminderId: reminder.id,
                userId: reminder.userId
            });

            await reminderService.markReminderSent(reminder.id);
            return;
        }

        // Format reminder message
        const reminderMessage = `⏰ **Reminder for ${user.username}!**\n\n${reminder.message}`;

        // Send reminder
        await channel.send(reminderMessage);

        // Mark as sent
        await reminderService.markReminderSent(reminder.id);

        logger.info('Reminder sent successfully', {
            id: reminder.id,
            user: user.username,
            channel: channel.name
        });

    } catch (error) {
        logger.error('Failed to send reminder', {
            reminderId: reminder.id,
            error: error.message
        });

        // Don't mark as sent if failed, will retry
    }
}

/**
 * Get worker status
 */
function getWorkerStatus() {
    return {
        isRunning,
        checkInterval: CHECK_INTERVAL,
        nextCheck: isRunning ? new Date(Date.now() + CHECK_INTERVAL) : null
    };
}

module.exports = {
    startReminderWorker,
    stopReminderWorker,
    checkReminders,
    getWorkerStatus
};
