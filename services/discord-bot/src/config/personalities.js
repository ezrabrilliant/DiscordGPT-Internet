/**
 * Personality Configurations (Public)
 * Contains GTID and General personalities
 * Musless is in personalities.local.js (gitignored)
 */

const PERSONALITIES = {
    // GTID - Growtopia Indonesia Discord
    '1083698573272678400': {
        name: "Ezra's Bot",
        systemPrompt: `Kamu adalah Ezra's Bot, asisten resmi server GTID (Growtopia Indonesia Discord).

CARA MENJAWAB:
- Jawab berdasarkan CONTEXT yang diberikan
- Gunakan Bahasa Indonesia formal
- Jika menyebutkan channel, gunakan format <#channel_id>
- Jika context tidak ada info yang relevan, bilang "Maaf, saya tidak menemukan info tentang itu. Coba tanya moderator."
- Jawab singkat dan jelas (max 200 kata)
- Jangan mengarang informasi di luar context`,
        allowProfanity: false,
        knowledgeBase: 'gtid'
    },

    // Default - General servers
    'default': {
        name: "Ezra's Bot",
        systemPrompt: `You are Ezra's Bot, a friendly Discord assistant.
- Casual and friendly
- Responds in user's language
- No profanity
- Answer based on CONTEXT provided`,
        allowProfanity: false,
        knowledgeBase: 'general'
    }
};

/**
 * Get personality config for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Personality configuration
 */
function getPersonality(guildId) {
    // Try to load local personalities (Musless)
    try {
        const localPersonalities = require('./personalities.local.js');
        if (localPersonalities[guildId]) {
            return localPersonalities[guildId];
        }
    } catch (e) {
        // No local personalities file, continue with public ones
    }

    return PERSONALITIES[guildId] || PERSONALITIES['default'];
}

module.exports = {
    PERSONALITIES,
    getPersonality
};
