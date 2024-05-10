const axios = require('axios');
require('dotenv').config();
const bot = require('./botConfig');
const handleMessage = require('./handleMessage');

bot.on('ready', () => {
    console.log(`Logged in as ${bot.user.tag}!`);
});

bot.on('messageCreate', handleMessage);

bot.login(process.env.TOKEN);
