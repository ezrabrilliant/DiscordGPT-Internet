/**
 * Deploy Script - Manage Slash Commands
 * 
 * Usage:
 *   node deploy.js deploy        - Deploy all commands globally
 *   node deploy.js deploy:guild  - Deploy to test guild (instant)
 *   node deploy.js clear         - Clear all global commands
 *   node deploy.js clear:guild   - Clear guild commands
 */

require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { slashCommands } = require('./src/slashCommands');

const TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.TEST_GUILD_ID; // Optional: for testing

if (!TOKEN) {
    console.error('❌ Missing DISCORD_TOKEN or TOKEN in .env');
    process.exit(1);
}

if (!CLIENT_ID) {
    console.error('❌ Missing CLIENT_ID in .env');
    console.log('💡 Get your CLIENT_ID from Discord Developer Portal > Your App > General Information');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function deployGlobal() {
    const commands = [];
    slashCommands.forEach(cmd => commands.push(cmd.data.toJSON()));

    console.log(`📤 Deploying ${commands.length} commands globally...`);
    console.log(`   Commands: ${commands.map(c => c.name).join(', ')}`);

    const data = await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: commands },
    );

    console.log(`✅ Successfully deployed ${data.length} commands globally!`);
    console.log('⏰ Note: Global commands can take up to 1 hour to appear everywhere.');
}

async function deployGuild() {
    if (!GUILD_ID) {
        console.error('❌ Missing TEST_GUILD_ID in .env for guild deployment');
        process.exit(1);
    }

    const commands = [];
    slashCommands.forEach(cmd => commands.push(cmd.data.toJSON()));

    console.log(`📤 Deploying ${commands.length} commands to guild ${GUILD_ID}...`);

    const data = await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: commands },
    );

    console.log(`✅ Successfully deployed ${data.length} commands to guild!`);
    console.log('⚡ Guild commands are instant!');
}

async function clearGlobal() {
    console.log('🗑️ Clearing all global commands...');

    await rest.put(
        Routes.applicationCommands(CLIENT_ID),
        { body: [] },
    );

    console.log('✅ Cleared all global commands!');
}

async function clearGuild() {
    if (!GUILD_ID) {
        console.error('❌ Missing TEST_GUILD_ID in .env');
        process.exit(1);
    }

    console.log(`🗑️ Clearing commands from guild ${GUILD_ID}...`);

    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: [] },
    );

    console.log('✅ Cleared guild commands!');
}

// Main
const action = process.argv[2] || 'deploy';

(async () => {
    try {
        switch (action) {
            case 'deploy':
                await deployGlobal();
                break;
            case 'deploy:guild':
                await deployGuild();
                break;
            case 'clear':
                await clearGlobal();
                break;
            case 'clear:guild':
                await clearGuild();
                break;
            default:
                console.log('Usage:');
                console.log('  node deploy.js deploy        - Deploy globally');
                console.log('  node deploy.js deploy:guild  - Deploy to test guild');
                console.log('  node deploy.js clear         - Clear global commands');
                console.log('  node deploy.js clear:guild   - Clear guild commands');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
})();
