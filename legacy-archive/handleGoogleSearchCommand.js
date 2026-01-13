const searchGoogle = require('../searchGoogle');

async function handleGoogleSearchCommand(query, message) {
    if (!query) {
        message.reply('error no query has been input.');
        return;
    }

    const results = await searchGoogle(query);
    if (results.length === 0) {
        await message.reply('Tidak ada hasil yang ditemukan.');
        return;
    }

    const result = results[0];
    const combinedResults = `Title: [${result.title}](${result.link})\nContent: ${result.snippet}\n`;

    await message.reply(combinedResults);
}

module.exports = handleGoogleSearchCommand;
