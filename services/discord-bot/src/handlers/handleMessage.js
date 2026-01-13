const { Configuration, OpenAIApi } = require('openai');
const handleSearchCommand = require('./handler/handleSearchCommand');
const fetchAndReplyWithGoogleResults = require('./handler/fetchAndReplyWithGoogleResults');
const cekKhodam = require('./handler/cekKhodam.js');

const configuration = new Configuration({
    apiKey: process.env.API_KEY,
});
const openai = new OpenAIApi(configuration);

async function handleMessage(message) {
    try {
        const prefix = '!';
        const prefgpt = ['zra', 'ezra'];
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const query = args.join(' ');

        if (command === 'search') {
            console.log('search command');
            console.log('query:', query);
            await handleSearchCommand(query, message);
        } else if (command === 'khodam' || command === 'cekkhodam') {
            console.log('khodam command');
            
            // Check for mentions
            const mentions = message.mentions.members;
            if (mentions.size > 0) {
                const member = mentions.first();
                const userName = member.nickname || member.displayName ; // Use nickname if available, otherwise use username
                return cekKhodam(userName, message);
            } else {
                // If no mentions, check if there's a query
                if (!query) {
                    message.reply('Format salah, gunakan: `!Khodam @username` atau `!cekKhodam @username`');
                    return;
                }
                return cekKhodam(query, message);
            }
        } else {
            const startsWithPrefgpt = prefgpt.some(pref => message.content.toLowerCase().startsWith(pref));
            if (!startsWithPrefgpt) return;
            if (message.author.bot) return;

            await fetchAndReplyWithGoogleResults(message, openai);
        }
    } catch (error) {
        console.error('Error in handleMessage:', error);
        message.reply('Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.');
    }
}

module.exports = handleMessage;
