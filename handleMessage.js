const searchGoogle = require('./searchGoogle');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();


const configuration = new Configuration({
    apiKey: process.env.API_KEY,
});
const openai = new OpenAIApi(configuration);

async function handleMessage(message) {
    const prefgpt = ['zra', 'ezra'];
    
    const startsWithPrefgpt = prefgpt.some(pref => message.content.toLowerCase().startsWith(pref));
    if (!startsWithPrefgpt) return;
    if (message.author.bot) return;

    const inputText = prefgpt.reduce((content, pref) => content.replace(new RegExp(`^${pref}\\s*`, 'i'), ''), message.content);

    const question = inputText;
    const results = await searchGoogle(question);
    
    let combinedResults = "";
    
    results.forEach(result => {
        combinedResults += "Source:\n";
        combinedResults += "Title: " + result.title + "\n";
        combinedResults += "URL: " + result.link + "\n";
        combinedResults += "Content: " + result.snippet + "\n";
    });

    const prompt = `\n\nGunakan informasi ini untuk menjawab pertanyaan :\n\n ${combinedResults} \n\nPertanyaan: ${question}\n\nJawaban:\n\n sertakan juga sumber informasi yang ada dari informasi yang tadi dikasih. gunakan format: "\n\n Sumber: Judul" perhatikan format sumber, jangan sampai salah format. `;

    if (message.guild) {
        conversationLog = [
            { role: 'system', content: `kamu chatbot bahasa indonesia bernama Ezra ${prompt}` },
            { role: 'user', content: inputText }
        ];
    }
    if (message.author.bot) return;

    await message.channel.sendTyping();
    try {
        const result = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: conversationLog,
        });
        const reply = result.data.choices[0].message.content;
        if (reply.length > 2000) {
            await message.reply('max chat discord bot length is 2000".');
        } else {
            await message.reply(reply);
        }
    } catch (error) {
        console.error('Error while generating bot response:', error);
        if (error.response && error.response.data && error.response.data.error) {
            const { message, type } = error.response.data.error;
            if (type === 'server_error' && message.includes('That model is currently overloaded')) {
                await message.reply('The bot is currently overloaded. Please try again later.');
            }
        }
    }
}

module.exports = handleMessage;
