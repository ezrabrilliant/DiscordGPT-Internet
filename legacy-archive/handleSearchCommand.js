const searchImages = require('../searchBrave');
const searchGoogle = require('../searchGoogle');
const { EmbedBuilder } = require('discord.js');
const { logMessage } = require('../logger');

async function handleSearchCommand(query, message) {
    try {
        if (!query) {
            message.reply('Error: No query has been input.');
            return;
        }

        logMessage(`User: ${message.author.username}, Search Query: ${query}`);
        // Search for images using Brave
        let imageResults = await searchImages(query, 4, "strict");
        if (!imageResults || imageResults.length === 0) {
            if (message.guild && message.guild.id === '1016684763752452166') 
                await message.reply('Error: Tidak bisa melakukan koneksi dengan database BAKA.'); 
            else 
                await message.reply('Maaf, tidak ditemukan data yang sesuai.');
            return;
        }

        // Search for text using Google
        let textResults = await searchGoogle(query);
        if (!textResults || textResults.length === 0) {
            await message.reply('Tidak ada hasil yang ditemukan.');
            return;
        }
        const textResult = textResults[0]; // Use the first result for the embed description

        const embeds = [];
        for (let i = 0; i < imageResults.length; i++) {
            embeds.push(
                new EmbedBuilder()
                    .setURL(`https://a.org/`) // Use the Google result link
                    .setImage(`${imageResults[i]}`)
                    .setAuthor({ name: 'Ezra Bot', iconURL: 'https://cdn.discordapp.com/avatars/1127105994766426122/a_234a28ca97085fdecd4873ea64a97c47' })
                    .setDescription(`You've been searching\n\`\`\`${query}\`\`\`\n[${textResult.title}](${textResult.link})~\`\`\`${textResult.snippet}\`\`\``)
                    .setFooter({ text: "Ezra Bot" })
            );
        }

        message.reply({
            content: 'Ezra has finished searching.',
            embeds: embeds,
        });
    } catch (error) {
        console.error('Error in handleSearchCommand:', error);
        message.reply('An error occurred while processing your search request. Please try again later.');
    }
}

module.exports = handleSearchCommand;
