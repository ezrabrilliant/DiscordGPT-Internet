const axios = require('axios');
require('dotenv').config();
const { google } = require('googleapis');
const { Client, IntentsBitField, GatewayIntentBits } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');
const customsearch = google.customsearch('v1');

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

const configuration = new Configuration({
    apiKey: process.env.API_KEY,
});
const openai = new OpenAIApi(configuration);

async function searchGoogle(query) {
    try {
        const response = await customsearch.cse.list({
            cx: process.env.GOOGLE_SEARCH_ID,
            q: query,
            auth: process.env.GOOGLE_API_KEY
        });

        const searchResults = response.data.items.map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
        }));
        
        return searchResults;
        
    } catch (error) {
        console.error("Terjadi kesalahan dalam melakukan pencarian:", error.message);
    }
}

bot.on('messageCreate', async (message) => {
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

    const prompt = `\n\nGunakan informasi ini untuk menjawab pertanyaan :\n\n ${combinedResults} \n\nPertanyaan: ${question}\n\nJawaban:\n\n sertakan juga sumber informasi yang ada dari informasi yang tadi dikasih. gunakan format: "\n\n [Sumber: Judul](link URL)" perhatikan format sumber, jangan sampai salah format. `;

    if (message.guild) {
        conversationLog = [
            { role: 'system', content: `kamu chatbot bahasa indonesia bernama Ezra ${prompt}` },
            { role: 'user', content: inputText }
        ];
    }
    if (message.author.bot) return;

    await message.channel.sendTyping();
    try {
        
    if (message.author.bot) return;
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
})

bot.login(process.env.TOKEN);
