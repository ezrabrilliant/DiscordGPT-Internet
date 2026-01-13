/**
 * Khodam Command
 * Check someone's khodam (spiritual guardian)
 */

const { KHODAM, MESSAGES } = require('../config');
const { logger } = require('../middleware');

/**
 * Command metadata
 */
const meta = {
    name: 'khodam',
    aliases: ['cekkhodam'],
    description: 'Cek khodam seseorang',
    usage: '!khodam @username',
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
    const mentions = message.mentions.members;
    let targetName;

    // Get target name from mention or args
    if (mentions.size > 0) {
        const member = mentions.first();
        targetName = member.nickname || member.displayName;
    } else if (args.length > 0) {
        targetName = args.join(' ');
    } else {
        return message.reply(MESSAGES.KHODAM_USAGE);
    }

    // Generate and send result
    const khodam = generateKhodam();
    const reply = `Khodam yang ada di dalam diri **${targetName}**, adalah **${khodam}**`;

    logger.info('Khodam command executed', { target: targetName, result: khodam });
    logger.logInteraction(message, reply);

    return message.reply(reply);
}

module.exports = {
    meta,
    execute,
};
