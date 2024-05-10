const searchGoogle = require('./searchGoogle');
const { Configuration, OpenAIApi } = require('openai');
const searchImages = require('./searchBrave');
const { EmbedBuilder } = require('discord.js');

const configuration = new Configuration({
    apiKey: process.env.API_KEY,
});
const openai = new OpenAIApi(configuration);

async function handleMessage(message) {
    const prefgpt = ['zra', 'ezra'];

    const prefix = '!';
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if(command === 'image'){
        const query = args.join(' ');

        if (!query) {
            message.reply('error no query has been input.');
            return;
        }
        let result = await searchImages(query, 4, "strict");
        if (result.length === 0) {
            if (message.guild && message.guild.id === '1016684763752452166') 
                await message.reply('Error : Tidak bisa melakukan koneksi dengan database BAKA.'); 
            else 
                await message.reply('Maaf, gak nemu data yang sesuai.');
            return;
        } else {
            const embeds = [];
            for (let i = 0; i < result.length; i++) {
                embeds.push(
                    new EmbedBuilder()
                        .setURL("https://a.org/")
                        .setImage(`${result[i]}`)
                        .setAuthor({ name: 'Ezra Bot', iconURL: 'https://cdn.discordapp.com/avatars/1127105994766426122/e10f495c1d617ab94163c69b507e5399.png?size=4096'})
                        .setDescription(`you've been searching\n\`\`\`${query}\`\`\``)
                        .setFooter({ text: "Ezra Bot" })
                );
            }
            message.reply({
                content: 'Ezra has finished searching.',
                embeds: embeds,
            });
        }
    }

    if(command === 'search'){
        const query = args.join(' ');

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

        let combinedResults = "";
        combinedResults += "Source:\n";
        combinedResults += "Title: " + result.title + "\n";
        combinedResults += "URL: " + result.link + "\n";
        combinedResults += "Content: " + result.snippet + "\n";

        await message.reply(combinedResults);
        return;
    }



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
