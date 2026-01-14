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
const aiClient = require('./src/services/aiClient');

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
    { name: 'with your mind 🧠', type: ActivityType.Playing },
    { name: 'your questions', type: ActivityType.Listening },
    { name: 'with AI magic ✨', type: ActivityType.Playing },
    { name: 'zra <pertanyaan>', type: ActivityType.Watching },
    { name: '!khodam @user', type: ActivityType.Watching },
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
    '🧠 Powered by RAG memory',
];

let activityIndex = 0;
let statusIndex = 0;

function rotatePresence() {
    // Set both activity AND custom status simultaneously
    bot.user.setPresence({
        status: 'online',
        activities: [
            // Custom status (shows in profile & hover)
            {
                type: ActivityType.Custom,
                name: 'Custom Status',
                state: customStatuses[statusIndex],
            },
        ],
    });
    
    // Also set activity separately for "Playing/Watching" display
    bot.user.setActivity(activities[activityIndex].name, {
        type: activities[activityIndex].type,
    });
    
    // Rotate independently (different array lengths = different cycles)
    activityIndex = (activityIndex + 1) % activities.length;
    statusIndex = (statusIndex + 1) % customStatuses.length;
}

// ============================================
// EVENT HANDLERS
// ============================================

bot.on('ready', () => {
    logger.info(`Bot logged in as ${bot.user.tag}`);
    logger.info(`Serving ${bot.guilds.cache.size} guilds`);

    // Start AI health checks
    aiClient.startHealthChecks();
    logger.info('AI health checks started', aiClient.getStatus());

    // Set initial presence and rotate every 30 seconds
    rotatePresence();
    setInterval(rotatePresence, 30000);
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
    aiClient.stopHealthChecks();
    bot.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    aiClient.stopHealthChecks();
    bot.destroy();
    process.exit(0);
});

// ============================================
// START BOT
// ============================================

logger.info('Starting Discord bot...');
bot.login(env.TOKEN);
