// File: index.js - Discord Bot Entry Point
const axios = require('axios');
require('dotenv').config();
const { bot, ActivityType } = require('./config');
const handleMessage = require('./src/handlers/handleMessage');

bot.on('ready', () => {
    console.log(`Logged in as ${bot.user.tag}!`);

    const activities = [
        { name: 'Cek Khodam !khodam @username', type: ActivityType.Watching },
        { name: 'Bintang Skibidi', type: ActivityType.Listening },
    ];

    let currentIndex = 0;

    const updateActivity = () => {
        bot.user.setActivity(activities[currentIndex].name, { type: activities[currentIndex].type });
        console.log(`Activity set to ${bot.user.presence.activities[0].name}`);
        currentIndex = (currentIndex + 1) % activities.length;
    };

    updateActivity(); // Set initial activity
    setInterval(updateActivity, 5000); // Update activity every 10 seconds
});

bot.on('messageCreate', handleMessage);

bot.login(process.env.TOKEN);
