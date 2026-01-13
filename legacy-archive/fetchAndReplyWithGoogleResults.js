const prefgpt = ['zra', 'ezra'];
const searchGoogle = require('../searchGoogle');
const { getConversationLog, addToConversationLog, clearConversationLog } = require('../conversationLog');
const { logMessage } = require('../logger');

const INTERACTION_LIMIT = 25; // Batas jumlah interaksi

// Fungsi untuk menentukan apakah perlu melakukan pencarian Google
const needsGoogleSearch = (query) => {
    const keywords = ['cari','temukan','berapa','apa itu','siapa','bagaimana','di mana','dimana','kapan','mengapa','apa yang dimaksud','definisi','penjelasan','detail','informasi','alamat','nomor telepon','kontak','harga','review','beli','spesifikasi','statistik','fakta','data','perbedaan','bandingkan','vs','sejarah','kronologi','penyakit','gejala','pengobatan', 'hukum', 'strategi', 'rencana', 'tutorial', 'cara', 'langkah-langkah', 'tutorial', 'panduan', 'petunjuk', 'tips', 'trik', 'solusi', 'jawaban', 'pertanyaan'];
    const lines = query.split('\n').length;
    
    // Tidak perlu Google search jika ada lebih dari 3 baris
    if (lines > 3) {
        return false;
    }
    
    return keywords.some(keyword => query.toLowerCase().includes(keyword));
};

async function fetchAndReplyWithGoogleResults(message, openai) {
    const inputText = prefgpt.reduce((content, pref) => content.replace(new RegExp(`^${pref}\\s*`, 'i'), ''), message.content);
    const question = inputText;

    const serverId = message.guild ? message.guild.id : 'direct_message';
    const userId = message.author.id;
    const conversationLog = getConversationLog(serverId, userId);

    // Periksa jumlah interaksi pengguna
    if (conversationLog.length > INTERACTION_LIMIT) {
        clearConversationLog(serverId, userId);
    }

    conversationLog.push({ role: 'user', content: inputText });

    await message.channel.sendTyping();
    
    if (needsGoogleSearch(question)) {
        try {
            // Fungsi searchGoogle akan mengembalikan array yang berisi hasil pencarian dari Google
            const results = await searchGoogle(question);
            const googleResultsText = results.map(result => `${result.title} - ${result.snippet} (${result.link})`).join('\n');

            // Simpan hasil pencarian Google ke log khusus jika diperlukan
            const googleLog = {
                role: 'system',
                content: `Saya memiliki hasil pencarian Google berikut:\n${googleResultsText}\nyang mungkin dapat membantu anda menjawab pertanyaan user.`,
            };

            const result = await openai.createChatCompletion({
                model: 'gpt-4o-mini',
                messages: [...conversationLog, googleLog], // Sisipkan log pencarian Google ke dalam messages
            });

            const reply = result.data.choices[0].message.content;
            addToConversationLog(serverId, userId, 'assistant', reply);

            logMessage(`[User: ${message.author.username}],\n [Query: ${question}],\n [Google result:  ${googleResultsText}],\n [reply: ${reply}]\n\n`);

            function splitReply(reply) {
                const maxLength = 2000;
                const chunks = [];
                for (let i = 0; i < reply.length; i += maxLength) {
                    chunks.push(reply.slice(i, i + maxLength));
                }
                return chunks;
            }
            const replyChunks = splitReply(reply);
            for (const chunk of replyChunks) {
                await message.reply(chunk);
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
    } else {
        try {
            // Daftar server ID yang menggunakan GPT-4
            const mless = ['1016684763752452166'];
            const noir = ['1064766353917104168'];

            if (mless.includes(message.guild.id)) {
                conversationLog.push({ 
                    role: 'system', 
                    content: `kamu chatbot bahasa indonesia memiliki humor dan sedikit sarkas yang mirip dengan manusia, di akhir jawaban selalu sertakan SLAM! perlu ditekankan bahwa anda harus jawab pertanyaan user dengan singkat dan sedikit sarkas` });
            } else if (noir.includes(message.guild.id)) {
                conversationLog.push({ 
                    role: 'system', 
                    content: `answer the question only 5 word, kamu sangat friendly dan humoris dengan bahasa kekinian` });
            } else {
                conversationLog.push({ 
                    role: 'system', 
                    content: `kamu adalah chatbot memiliki humor dan sedikit sarkas yang mirip dengan manusia, perlu ditekankan bahwa anda harus jawab pertanyaan user dengan singkat dan sedikit sarkas (maksimal 500 kata)` });
            }

            const result = await openai.createChatCompletion({
                model: 'gpt-4o-mini',
                messages: conversationLog,
            });

            const reply = result.data.choices[0].message.content;
            addToConversationLog(serverId, userId, 'assistant', reply);

            function splitReply(reply) {
                const maxLength = 2000;
                const chunks = [];
                for (let i = 0; i < reply.length; i += maxLength) {
                    chunks.push(reply.slice(i, i + maxLength));
                }
                return chunks;
            }

            logMessage(`[User: @${message.author.username}],\n [Query: ${inputText}],\n [reply: ${reply}]\n\n`);
            
            const replyChunks = splitReply(reply);
            for (const chunk of replyChunks) {
                await message.reply(chunk);
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
}

module.exports = fetchAndReplyWithGoogleResults;
