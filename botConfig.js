// File: botConfig.js
const { Client, IntentsBitField, GatewayIntentBits, ActivityType } = require('discord.js');

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

module.exports = { bot, ActivityType }; // Export both bot and ActivityType
