/**
 * Khodam Command
 * Check someone's khodam (spiritual guardian)
 */

const { KHODAM, MESSAGES } = require('../config');
const { logger } = require('../middleware');

/**
 * Command metadata
 * NOTE: This command is DISABLED
 */
const meta = {
    name: 'khodam',
    aliases: ['cekkhodam'],
    description: 'Cek khodam seseorang (DISABLED)',
    usage: '!khodam @username',
    disabled: true, // Command is disabled
};

/**
 * Get random element from array
 */
function getRandomElement(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate random khodam result
 */
function generateKhodam() {
    // Chance for khodam to escape
    if (Math.random() < KHODAM.ESCAPE_CHANCE) {
        return KHODAM.ESCAPE_MESSAGE;
    }

    const first = getRandomElement(KHODAM.FIRST);
    const second = getRandomElement(KHODAM.SECOND);
    return `${first} ${second}`;
}

/**
 * Execute the khodam command
 * @param {Message} message - Discord message
 * @param {string[]} args - Command arguments
 */
async function execute(message, args) {
    // Command is disabled
    return message.reply('❌ Command !khodam sedang dinonaktifkan. Silakan gunakan fitur AI dengan prefix "zra" atau "ezra" 😊');
}

module.exports = {
    meta,
    execute,
};
