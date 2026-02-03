/**
 * Discord Bot - Entry Point
 * 
 * Architecture:
 * ├── src/config/      - Configuration & constants
 * ├── src/middleware/  - Security, logging
 * ├── src/commands/    - Command modules
 * ├── src/handlers/    - Event handlers
 * └── src/utils/       - Utility functions
 */

const { Client, IntentsBitField, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const { env } = require('./src/config');
const { logger } = require('./src/middleware');
const handleMessage = require('./src/handlers/handleMessage');
const wintercodeClient = require('./src/services/wintercodeClient');
const { slashCommands, deploySlashCommands } = require('./src/slashCommands');
const { handleReactionAdd, handleReactionRemove } = require('./src/handlers/handleReaction');
const reminderWorker = require('./src/workers/reminderWorker');

// ============================================
// BOT CLIENT SETUP
// ============================================

const bot = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages,           // ✅ DM Intent
        IntentsBitField.Flags.DirectMessageTyping,      // ✅ DM Typing
        IntentsBitField.Flags.DirectMessageReactions,   // ✅ DM Reactions
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,               // ✅ DM Intent (v14 style)
    ],
    partials: [
        Partials.Channel,   // ✅ WAJIB untuk DM di Discord.js v14!
        Partials.Message,   // ✅ Untuk message caching
    ]
});

// ============================================
// BOT ACTIVITIES & CUSTOM STATUS
// ============================================

// Activities (Playing xxx)
const activities = [
];

// Custom statuses (rotating)
const customStatuses = [
    '🆕 You can DM me now!',
    '🤖 I remember everything...',
    '👀 I know what you said last summer',
    '🌙 Available 24/7, DM me!',
    '🤫 Your secrets are safe with me',
    '💭 Curhat? DM aja!',
    '🎯 Try: zra apa kabar?',
];

let activityIndex = 0;
let statusIndex = 0;

function rotatePresence() {
    // Only set custom status (activities array is empty)
    bot.user.setPresence({
        activities: null,
        status: 'online',
    });

    // Set custom status
    bot.user.setActivity(customStatuses[statusIndex], {
        type: ActivityType.Custom,
    });

    // Rotate status
    statusIndex = (statusIndex + 1) % customStatuses.length;
}

// ============================================
// EVENT HANDLERS
// ============================================

bot.on('ready', async () => {
    logger.info(`Bot logged in as ${bot.user.tag}`);
    logger.info(`Serving ${bot.guilds.cache.size} guilds`);

    // Deploy slash commands (do this once, or on update)
    try {
        await deploySlashCommands(bot.user.id);
        logger.info('Slash commands deployed globally');
    } catch (error) {
        logger.error('Failed to deploy slash commands', { error: error.message });
    }

    // Start AI client
    wintercodeClient.startHealthChecks();
    logger.info('AI client started', wintercodeClient.getStatus());

    // Start reminder worker
    reminderWorker.startReminderWorker(bot);
    logger.info('Reminder worker started', reminderWorker.getWorkerStatus());

    // Set initial presence and rotate every 30 seconds
    rotatePresence();
    setInterval(rotatePresence, 30000);
});

// Handle slash commands
bot.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = slashCommands.get(interaction.commandName);

    if (!command) {
        logger.warn(`Unknown slash command: ${interaction.commandName}`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        logger.error(`Slash command error: ${interaction.commandName}`, {
            error: error.message,
            stack: error.stack,
        });

        const errorMessage = { content: '❌ Terjadi error saat menjalankan command!', ephemeral: true };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
});

bot.on('messageCreate', handleMessage);

// Handle message reactions
bot.on('messageReactionAdd', handleReactionAdd);
bot.on('messageReactionRemove', handleReactionRemove);

bot.on('error', (error) => {
    logger.error('Discord client error', { error: error.message });
});

bot.on('warn', (warning) => {
    logger.warn('Discord client warning', { warning });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    wintercodeClient.stopHealthChecks();
    reminderWorker.stopReminderWorker();
    bot.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    wintercodeClient.stopHealthChecks();
    reminderWorker.stopReminderWorker();
    bot.destroy();
    process.exit(0);
});

// ============================================
// START BOT
// ============================================

logger.info('Starting Discord bot...');
bot.login(env.TOKEN);
