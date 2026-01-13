/**
 * Search Command (Legacy - Disabled)
 */

const { MESSAGES } = require('../config');
const { logger } = require('../middleware');

const meta = {
    name: 'search',
    aliases: [],
    description: 'Search the web (currently disabled)',
    usage: '!search <query>',
    disabled: true,
};

async function execute(message, args) {
    logger.info('Search command attempted (disabled)');
    return message.reply(MESSAGES.SEARCH_DISABLED);
}

module.exports = {
    meta,
    execute,
};
