const { Configuration, OpenAIApi } = require('openai');
// Legacy search commands (disabled - moved to legacy-archive)
// const handleSearchCommand = require('../../../../legacy-archive/handleSearchCommand');
// const fetchAndReplyWithGoogleResults = require('../../../../legacy-archive/fetchAndReplyWithGoogleResults');
const cekKhodam = require('./cekKhodam');

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
            // Legacy feature - disabled
            console.log('search command (disabled)');
            message.reply('Fitur search sedang dinonaktifkan sementara.');
        } else if (command === 'khodam' || command === 'cekkhodam') {
            console.log('khodam command');

            // Check for mentions
            const mentions = message.mentions.members;
            if (mentions.size > 0) {
                const member = mentions.first();
                const userName = member.nickname || member.displayName; // Use nickname if available, otherwise use username
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

            // Legacy GPT with Google results (disabled)
            // TODO: Re-enable when ai-engine Python backend is ready
            message.reply('Fitur AI chat sedang dalam pengembangan. Coba !khodam @username');
        }
    } catch (error) {
        console.error('Error in handleMessage:', error);
        message.reply('Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.');
    }
}

module.exports = handleMessage;
