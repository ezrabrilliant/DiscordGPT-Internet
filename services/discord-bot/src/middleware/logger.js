/**
 * Logger Middleware
 * Centralized logging with levels and formatting
 */

const fs = require('fs');
const path = require('path');

// Log file path - uses project root (works in Pterodactyl)
// When you run: node index.js, process.cwd() = discord-bot folder
const LOG_DIR = path.join(process.cwd(), 'data');
const LOG_FILE = path.join(LOG_DIR, 'messages.log');

// Ensure data directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LogLevel = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
};

/**
 * Format log entry with timestamp and level
 */
function formatLog(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}] ${message}${metaStr}`;
}

/**
 * Write to console and optionally to file
 */
function log(level, message, meta = {}, writeToFile = false) {
    const formatted = formatLog(level, message, meta);

    // Console output with colors
    switch (level) {
        case LogLevel.ERROR:
            console.error(`\x1b[31m${formatted}\x1b[0m`);
            break;
        case LogLevel.WARN:
            console.warn(`\x1b[33m${formatted}\x1b[0m`);
            break;
        case LogLevel.DEBUG:
            console.log(`\x1b[36m${formatted}\x1b[0m`);
            break;
        default:
            console.log(formatted);
    }

    // File output
    if (writeToFile) {
        fs.appendFile(LOG_FILE, formatted + '\n', (err) => {
            if (err) console.error('[LOGGER] Failed to write to log file:', err.message);
        });
    }
}

/**
 * Log a Discord message interaction (writes to file for Python RAG)
 */
function logInteraction(message, reply) {
    const meta = {
        server: message.guild?.id,
        user: message.author.id,
        username: message.author.tag,
        query: message.content,
        reply: reply,
    };

    log(LogLevel.INFO, 'Interaction', meta, true);
}

module.exports = {
    LogLevel,
    debug: (msg, meta) => log(LogLevel.DEBUG, msg, meta),
    info: (msg, meta) => log(LogLevel.INFO, msg, meta),
    warn: (msg, meta) => log(LogLevel.WARN, msg, meta),
    error: (msg, meta) => log(LogLevel.ERROR, msg, meta),
    logInteraction,
};
