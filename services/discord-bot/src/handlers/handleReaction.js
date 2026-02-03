/**
 * Reaction Handler
 * Bot responds to user reactions on its messages
 */

const { logger } = require('../middleware');
const { Events } = require('discord.js');

// Reaction feedback responses
const REACTION_RESPONSES = {
    // Positive reactions
    '❤️': [
        "Yeay seneng bisa bantu! ❤️",
        "Happy banget kamu suka jawabanku!",
        "Glad bisa membantu! 😊"
    ],
    '😍': [
        "Aww makasih! 😍",
        "Seneng bisa bantu kamu!",
        "Happy banget deh! ✨"
    ],
    '⭐': [
        "Makasih bintangnya! ⭐",
        "Terima kasih! ✨",
        "Seneng bisa membantu! 🌟"
    ],
    '👍': [
        "Makasih! 👍",
        "Siap! 👌",
        "Good! 👍"
    ],
    '😂': [
        "Glad bikin kamu ketawa! 😂",
        "Haha happy bisa hibur! 😄",
        "Wkwkwk! 😆"
    ],
    '🤣': [
        "Wkwkwk glad kamu ketawa! 🤣",
        "Happy bisa bikin ketawa! 😂",
        "Haha! 🤣"
    ],

    // Negative reactions
    '👎': [
        "Oh maaf ya, coba aku jawab dengan cara lain...",
        "Maaf jika jawabanku kurang memuaskan 😅",
        "Oh oke, mau coba jelaskan dengan cara beda?"
    ],
    '😒': [
        "Oh maaf kalau jawabanku bikin kamu kecewa 😅",
        "Maaf ya, bisa jelasin lebih detail? 😊",
        "Oh no, maaf deh! Mau coba lagi?"
    ],
    '🙄': [
        "Yaudah deh 🥲",
        "Maaf ya... 😅",
        "Oke deh, next time lebih baik! 🙏"
    ],

    // Confused reactions
    '🤔': [
        "Bingung ya? Mau jelasin lebih detail? 🤔",
        "Ada yang perlu dijelasin lagi? 😊",
        "Bisa tanya lebih spesifik? 🤔"
    ],
    '❓': [
        "Ada pertanyaan lain? 😊",
        "Mau aku jelasin lebih detail? 🤔",
        "Ada yang kurang jelas? 😊"
    ],
    '😕': [
        "Oh ada yang salah? Mau koreksi? 😅",
        "Maaf kalau ada yang kurang tepat 😊",
        "Bisa kasih masukan? 🤔"
    ],

    // Surprised reactions
    '😱': [
        "Waduh kaget ya! 😱",
        "Whoa! 😲",
        "Kaget atau kagum? 🤔"
    ],
    '😲': [
        "Kaget ya? 😲",
        "Waduh! 😅",
        "Oh my! 😱"
    ],

    // Special reactions
    '🔥': [
        "Terima kasih! 🔥",
        "Mantap! 🔥",
        "Thanks! 🔥"
    ],
    '💯': [
        "Makasih! 💯",
        "Perfect! 💯",
        "Thanks! 💯"
    ],
    '🎉': [
        "Yeay! 🎉",
        "Celebrate! 🎊",
        "Happy! 🎉"
    ]
};

/**
 * Handle reaction added
 */
async function handleReactionAdd(reaction, user) {
    try {
        // Ignore bot's own reactions
        if (user.bot) return;

        // Only process reactions to bot's messages
        if (reaction.message.author.id !== reaction.client.user.id) {
            return;
        }

        // Get emoji
        const emoji = reaction.emoji.name;

        // Check if we have a response for this emoji
        if (!REACTION_RESPONSES[emoji]) {
            return;
        }

        // Get random response
        const responses = REACTION_RESPONSES[emoji];
        const response = responses[Math.floor(Math.random() * responses.length)];

        // Tag the user who reacted
        const message = `${user} ${response}`;

        // Send response
        await reaction.message.reply(message);

        logger.info('Reaction feedback sent', {
            user: user.tag,
            emoji: emoji,
            message: message.substring(0, 50)
        });

    } catch (error) {
        logger.error('Error handling reaction', {
            error: error.message,
            user: user?.tag,
            emoji: reaction.emoji?.name
        });
    }
}

/**
 * Handle reaction removed (optional - for future features)
 */
async function handleReactionRemove(reaction, user) {
    // Placeholder for future features
    // Could track when users remove reactions
}

module.exports = {
    handleReactionAdd,
    handleReactionRemove
};
