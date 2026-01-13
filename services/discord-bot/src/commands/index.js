/**
 * Command Registry
 * Auto-loads and registers all commands
 */

const fs = require('fs');
const path = require('path');
const { logger } = require('../middleware');

const commands = new Map();

/**
 * Load all command files from this directory
 */
function loadCommands() {
    const commandFiles = fs.readdirSync(__dirname)
        .filter(file => file.endsWith('.js') && file !== 'index.js');

    for (const file of commandFiles) {
        try {
            const command = require(path.join(__dirname, file));

            if (!command.meta || !command.execute) {
                logger.warn(`Command ${file} missing meta or execute`);
                continue;
            }

            // Register main command name
            commands.set(command.meta.name, command);

            // Register aliases
            if (command.meta.aliases) {
                for (const alias of command.meta.aliases) {
                    commands.set(alias, command);
                }
            }

            const status = command.meta.disabled ? '(disabled)' : '';
            logger.debug(`Loaded command: ${command.meta.name} ${status}`);

        } catch (err) {
            logger.error(`Failed to load command ${file}`, { error: err.message });
        }
    }

    logger.info(`Loaded ${commands.size} commands`);
}

/**
 * Get command by name or alias
 */
function getCommand(name) {
    return commands.get(name.toLowerCase());
}

/**
 * Get all commands
 */
function getAllCommands() {
    return commands;
}

// Load commands on module import
loadCommands();

module.exports = {
    getCommand,
    getAllCommands,
    commands,
};
