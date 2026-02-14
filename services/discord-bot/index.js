/**
 * Discord Bot - Entry Point
 * 
 * Architecture:
 * ├── src/config/      - Configuration & constants
 * ├── src/middleware/  - Security, logging
 * ├── src/commands/    - Command modules
 * ├── src/handlers/    - Event handlers
 * ├── src/services/    - AI clients, memory, modchecker
 * └── src/utils/       - Utility functions
 */

const { Client, IntentsBitField, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const { env } = require('./src/config');
const { logger } = require('./src/middleware');
const handleMessage = require('./src/handlers/handleMessage');
const { handleInteraction } = require('./src/handlers/handleInteraction');
const pageCache = require('./src/handlers/pageCache');
const wintercodeClient = require('./src/services/wintercodeClient');
const modCheckerService = require('./src/services/modCheckerService');
const { slashCommands, deploySlashCommands } = require('./src/slashCommands');
const { handleReactionAdd, handleReactionRemove } = require('./src/handlers/handleReaction');
const reminderWorker = require('./src/workers/reminderWorker');

// Enable console logging to file
require('./console-logger');

// ============================================
// BOT CLIENT SETUP
// ============================================

const bot = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages,
        IntentsBitField.Flags.DirectMessageTyping,
        IntentsBitField.Flags.DirectMessageReactions,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers, // Needed for ModChecker role stats (guild.members.fetch)
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
    ]
});

// ============================================
// BOT ACTIVITIES & CUSTOM STATUS
// ============================================

const customStatuses = [
    '🆕 You can DM me now!',
    '🤖 I remember everything...',
    '👀 I know what you said last summer',
    '🌙 Available 24/7, DM me!',
    '🤫 Your secrets are safe with me',
    '💭 Curhat? DM aja!',
    '🎯 Try: zra apa kabar?',
];

let statusIndex = 0;

function rotatePresence() {
    bot.user.setPresence({
        activities: null,
        status: 'online',
    });
    bot.user.setActivity(customStatuses[statusIndex], {
        type: ActivityType.Custom,
    });
    statusIndex = (statusIndex + 1) % customStatuses.length;
}

// ============================================
// EVENT HANDLERS
// ============================================

bot.on('ready', async () => {
    logger.info(`Bot logged in as ${bot.user.tag}`);
    logger.info(`Serving ${bot.guilds.cache.size} guilds`);

    // Connect MongoDB for EzraBot page cache
    try {
        await pageCache.connectMongo();
        logger.info('PageCache MongoDB connected');
    } catch (error) {
        logger.error('PageCache MongoDB failed, using in-memory fallback', { error: error.message });
    }

    // Initialize ModChecker service (connects to modchecker database)
    try {
        await modCheckerService.init(bot, env.MONGO_URI);
        modCheckerService.startLoops();
        logger.info('ModChecker service started');
    } catch (error) {
        logger.error('ModChecker service failed to start', { error: error.message });
    }

    // Deploy EzraBot slash commands
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

// Handle all interactions (slash commands, buttons, select menus)
bot.on('interactionCreate', async (interaction) => {
    // Try ModChecker first (handles mc_ prefixed buttons, select menus, and its slash commands)
    try {
        const handled = await modCheckerService.handleModCheckerInteraction(interaction);
        if (handled) return;
    } catch (error) {
        logger.error('ModChecker interaction error', { error: error.message });
        return;
    }

    // Handle EzraBot button interactions (ezb_ prefixed)
    if (interaction.isButton()) {
        try {
            await handleInteraction(interaction);
        } catch (error) {
            logger.error('Button interaction error', {
                error: error.message,
                stack: error.stack,
            });
        }
        return;
    }

    // Handle EzraBot select menus
    if (interaction.isStringSelectMenu()) {
        return; // no EzraBot select menus currently
    }

    // Handle EzraBot slash commands
    if (!interaction.isChatInputCommand()) return;

    const command = slashCommands.get(interaction.commandName);

    if (!command) {
        // Not an EzraBot command either — could be stale/unknown
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

process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    wintercodeClient.stopHealthChecks();
    reminderWorker.stopReminderWorker();
    await modCheckerService.shutdown();
    bot.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    wintercodeClient.stopHealthChecks();
    reminderWorker.stopReminderWorker();
    await modCheckerService.shutdown();
    bot.destroy();
    process.exit(0);
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection', { error: err?.message || err });
});

// ============================================
// START BOT
// ============================================

logger.info('Starting Discord bot...');
bot.login(env.TOKEN);
