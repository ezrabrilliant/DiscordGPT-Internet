const axios = require('axios');
require('dotenv').config();
const bot = require('./botConfig');
const handleMessage = require('./handleMessage');

bot.on('messageCreate', handleMessage);

bot.login(process.env.TOKEN);
