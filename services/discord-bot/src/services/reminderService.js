/**
 * Reminder Service
 * Manage user reminders with persistent storage
 */

const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../middleware');

const DATA_DIR = path.join(process.cwd(), 'data');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        logger.error('Failed to create data directory', { error: error.message });
    }
}

/**
 * Load all reminders from file
 */
async function loadReminders() {
    try {
        await ensureDataDir();

        const data = await fs.readFile(REMINDERS_FILE, 'utf-8');
        const reminders = JSON.parse(data);

        // Convert dueTime strings back to Date objects
        return reminders.map(r => ({
            ...r,
            dueTime: new Date(r.dueTime)
        }));
    } catch (error) {
        if (error.code === 'ENOENT') {
            // File doesn't exist yet, return empty array
            return [];
        }
        logger.error('Failed to load reminders', { error: error.message });
        return [];
    }
}

/**
 * Save all reminders to file
 */
async function saveReminders(reminders) {
    try {
        await ensureDataDir();

        const data = JSON.stringify(reminders, null, 2);
        await fs.writeFile(REMINDERS_FILE, data);

        logger.debug('Reminders saved', { count: reminders.length });
    } catch (error) {
        logger.error('Failed to save reminders', { error: error.message });
    }
}

/**
 * Create new reminder
 */
async function createReminder(userId, username, message, dueTime, channelId, guildId) {
    try {
        const reminder = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            userId,
            username,
            message,
            dueTime,
            channelId,
            guildId,
            createdAt: new Date(),
            sent: false
        };

        const reminders = await loadReminders();
        reminders.push(reminder);

        await saveReminders(reminders);

        logger.info('Reminder created', {
            id: reminder.id,
            user: username,
            dueTime: dueTime.toISOString()
        });

        return reminder;
    } catch (error) {
        logger.error('Failed to create reminder', { error: error.message });
        throw error;
    }
}

/**
 * Get all pending reminders
 */
async function getPendingReminders() {
    try {
        const reminders = await loadReminders();
        const now = new Date();

        return reminders.filter(r => !r.sent && new Date(r.dueTime) <= now);
    } catch (error) {
        logger.error('Failed to get pending reminders', { error: error.message });
        return [];
    }
}

/**
 * Get all active reminders (not sent yet)
 */
async function getActiveReminders() {
    try {
        const reminders = await loadReminders();
        return reminders.filter(r => !r.sent);
    } catch (error) {
        logger.error('Failed to get active reminders', { error: error.message });
        return [];
    }
}

/**
 * Get user's reminders
 */
async function getUserReminders(userId) {
    try {
        const reminders = await loadReminders();
        return reminders.filter(r => r.userId === userId && !r.sent);
    } catch (error) {
        logger.error('Failed to get user reminders', { error: error.message });
        return [];
    }
}

/**
 * Mark reminder as sent
 */
async function markReminderSent(reminderId) {
    try {
        const reminders = await loadReminders();
        const index = reminders.findIndex(r => r.id === reminderId);

        if (index !== -1) {
            reminders[index].sent = true;
            reminders[index].sentAt = new Date();

            await saveReminders(reminders);

            logger.info('Reminder marked as sent', { id: reminderId });
        }
    } catch (error) {
        logger.error('Failed to mark reminder sent', { error: error.message });
    }
}

/**
 * Delete reminder
 */
async function deleteReminder(reminderId) {
    try {
        const reminders = await loadReminders();
        const filtered = reminders.filter(r => r.id !== reminderId);

        await saveReminders(filtered);

        logger.info('Reminder deleted', { id: reminderId });
        return true;
    } catch (error) {
        logger.error('Failed to delete reminder', { error: error.message });
        return false;
    }
}

/**
 * Cancel user's reminder by index
 */
async function cancelUserReminder(userId, reminderIndex) {
    try {
        const userReminders = await getUserReminders(userId);

        if (reminderIndex < 0 || reminderIndex >= userReminders.length) {
            return { success: false, error: 'Invalid reminder index' };
        }

        const reminder = userReminders[reminderIndex];
        await deleteReminder(reminder.id);

        return { success: true, reminder };
    } catch (error) {
        logger.error('Failed to cancel reminder', { error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Parse time duration (e.g., "1h", "30m", "2d")
 */
function parseDuration(durationText) {
    const match = durationText.match(/^(\d+)([smhd])$/i);

    if (!match) {
        return null;
    }

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const milliseconds = {
        's': value * 1000,
        'm': value * 60 * 1000,
        'h': value * 60 * 60 * 1000,
        'd': value * 24 * 60 * 60 * 1000
    };

    return milliseconds[unit] || null;
}

/**
 * Format reminder for display
 */
function formatReminder(reminder, index) {
    const dueDate = new Date(reminder.dueTime);
    const now = new Date();
    const diffMs = dueDate - now;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    let timeLeft;
    if (diffMins < 60) {
        timeLeft = `in ${diffMins} minutes`;
    } else if (diffHours < 24) {
        timeLeft = `in ${diffHours} hours`;
    } else {
        timeLeft = `in ${diffDays} days`;
    }

    return `**${index + 1}.** ${reminder.message}\n   ⏰ Due: ${timeLeft}`;
}

module.exports = {
    createReminder,
    getPendingReminders,
    getActiveReminders,
    getUserReminders,
    markReminderSent,
    deleteReminder,
    cancelUserReminder,
    parseDuration,
    formatReminder
};
