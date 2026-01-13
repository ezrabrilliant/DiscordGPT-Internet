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

const { Client, IntentsBitField, GatewayIntentBits, ActivityType } = require('discord.js');
const { env } = require('./src/config');
const { logger } = require('./src/middleware');
const handleMessage = require('./src/handlers/handleMessage');

// ============================================
// BOT CLIENT SETUP
// ============================================

const bot = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.MessageContent,
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// ============================================
// BOT ACTIVITIES
// ============================================

const activities = [
    { name: 'Cek Khodam !khodam @user', type: ActivityType.Watching },
    { name: 'Bintang Skibidi', type: ActivityType.Listening },
];

let activityIndex = 0;

function rotateActivity() {
    bot.user.setActivity(activities[activityIndex].name, {
        type: activities[activityIndex].type
    });
    activityIndex = (activityIndex + 1) % activities.length;
}

// ============================================
// EVENT HANDLERS
// ============================================

bot.on('ready', () => {
    logger.info(`Bot logged in as ${bot.user.tag}`);
    logger.info(`Serving ${bot.guilds.cache.size} guilds`);

    // Set initial activity and rotate every 30 seconds
    rotateActivity();
    setInterval(rotateActivity, 30000);
});

bot.on('messageCreate', handleMessage);

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
    bot.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    bot.destroy();
    process.exit(0);
});

// ============================================
// START BOT
// ============================================

logger.info('Starting Discord bot...');
bot.login(env.TOKEN);
