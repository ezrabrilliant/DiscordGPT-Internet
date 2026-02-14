/**
 * Slash Command Registry
 * Auto-loads and registers all slash commands
 */

const fs = require('fs');
const path = require('path');
const { Collection, REST, Routes } = require('discord.js');
const { logger } = require('../middleware');
const { env } = require('../config');

const slashCommands = new Collection();

/**
 * Load all slash command files
 */
function loadSlashCommands() {
    const commandFiles = fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
        try {
            const command = require(path.join(__dirname, file));

            if (!command.data || !command.execute) {
                logger.warn(`Slash command ${file} missing data or execute`);
                continue;
            }

            slashCommands.set(command.data.name, command);
            logger.debug(`Loaded slash command: ${command.data.name}`);

        } catch (err) {
            logger.error(`Failed to load slash command ${file}`, { error: err.message });
        }
    }

    logger.info(`Loaded ${slashCommands.size} slash commands`);
    return slashCommands;
}

/**
 * Register slash commands with Discord API
 * Merges EzraBot commands with ModChecker commands
 */
async function deploySlashCommands(clientId, guildId = null) {
    const commands = [];

    // Add EzraBot commands
    slashCommands.forEach(command => {
        commands.push(command.data.toJSON());
    });

    // Add ModChecker commands
    try {
        const modCheckerService = require('../services/modCheckerService');
        const mcCommands = await modCheckerService.getSlashCommands();
        for (const cmd of mcCommands) {
            commands.push(cmd.toJSON());
        }
    } catch (err) {
        logger.warn('ModChecker commands not available for deploy', { error: err.message });
    }

    const rest = new REST({ version: '10' }).setToken(env.TOKEN);

    try {
        logger.info(`Deploying ${commands.length} slash commands...`);

        let data;
        if (guildId) {
            // Guild-specific (instant, good for testing)
            data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );
            logger.info(`Deployed ${data.length} commands to guild ${guildId}`);
        } else {
            // Global (takes ~1 hour to propagate)
            data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );
            logger.info(`Deployed ${data.length} global commands`);
        }

        return data;
    } catch (error) {
        logger.error('Failed to deploy slash commands', { error: error.message });
        throw error;
    }
}

/**
 * Delete all slash commands (useful for cleanup)
 */
async function clearSlashCommands(clientId, guildId = null) {
    const rest = new REST({ version: '10' }).setToken(env.TOKEN);

    try {
        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: [] },
            );
            logger.info(`Cleared all commands from guild ${guildId}`);
        } else {
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: [] },
            );
            logger.info('Cleared all global commands');
        }
    } catch (error) {
        logger.error('Failed to clear slash commands', { error: error.message });
        throw error;
    }
}

// Load commands on module import
loadSlashCommands();

module.exports = {
    slashCommands,
    loadSlashCommands,
    deploySlashCommands,
    clearSlashCommands,
};
