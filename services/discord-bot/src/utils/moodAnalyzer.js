/**
 * Mood Analyzer
 * Detect user mood from message content and emojis
 */

const MOOD_PATTERNS = {
    happy: {
        emojis: ['😊', '😄', '😁', '🥰', '😍', '🤗', '😎', '🎉', '🎊', '✨', '💖', '❤️', '🔥', '👍', '👏'],
        keywords: ['happy', 'senang', 'gembira', 'suka', 'love', 'cinta', 'keren', 'bagus', 'hebat', 'mantap', 'asyik', 'seru', 'fun', 'great', 'awesome', 'yes', 'yeay', 'yey', 'hore', 'lumayan', 'oke', 'ok'],
        weight: 1
    },
    sad: {
        emojis: ['😢', '😭', '😞', '😔', '☹️', '💔', '😿', '😿'],
        keywords: ['sedih', 'nangis', 'menangis', 'kecewa', 'hancur', 'rusak', 'sakit', 'pain', 'sad', 'crying', 'depresi', 'stress', 'lelah', 'capek', 'pusing', 'pikun'],
        weight: 1
    },
    angry: {
        emojis: ['😠', '😡', '🤬', '💢', '👿', '😤'],
        keywords: ['marah', 'kesal', 'geram', 'benci', 'jengkel', 'sebel', 'gila', 'sialan', 'anjing', 'bangsat', 'kontol', 'memek', 'fuck', 'shit', 'damn', 'argh', 'uh', 'grr'],
        weight: 1.5 // Anger weighted higher
    },
    excited: {
        emojis: ['🤩', '😱', '🚀', '💥', '⚡', '🔥'],
        keywords: ['excited', 'semangat', 'antusias', 'pingin', 'pengen', 'mau', 'kangen', 'rindu', 'wkwk', 'haha', 'lucu', 'ngakak', 'lol', 'rofl', 'lmao'],
        weight: 1.2
    },
    confused: {
        emojis: ['🤔', '😕', '😐', '🤨', '❓', '❔'],
        keywords: ['bingung', 'bingung', 'pusing', 'tau', ' gimana', 'apa', 'sih', 'kenapa', 'mengapa', 'how', 'what', 'why', 'confused'],
        weight: 1
    },
    worried: {
        emojis: ['😰', '😨', '😱', '😖'],
        keywords: ['khawatir', 'takut', 'scared', 'afraid', 'worry', 'nervous', 'cemas', 'waswas', 'parno'],
        weight: 1
    }
};

/**
 * Analyze mood from text
 */
function analyzeMood(text) {
    if (!text) return 'neutral';

    const textLower = text.toLowerCase();
    const scores = {};

    // Initialize scores
    for (const mood in MOOD_PATTERNS) {
        scores[mood] = 0;
    }

    // Check emojis
    for (const [mood, pattern] of Object.entries(MOOD_PATTERNS)) {
        for (const emoji of pattern.emojis) {
            if (text.includes(emoji)) {
                scores[mood] += pattern.weight * 2; // Emojis have higher weight
            }
        }
    }

    // Check keywords
    for (const [mood, pattern] of Object.entries(MOOD_PATTERNS)) {
        for (const keyword of pattern.keywords) {
            if (textLower.includes(keyword.toLowerCase())) {
                scores[mood] += pattern.weight;
            }
        }
    }

    // Find highest scoring mood
    let highestMood = 'neutral';
    let highestScore = 0;

    for (const [mood, score] of Object.entries(scores)) {
        if (score > highestScore) {
            highestScore = score;
            highestMood = mood;
        }
    }

    // Threshold for mood detection
    if (highestScore < 1) {
        return 'neutral';
    }

    return highestMood;
}

/**
 * Get mood emoji
 */
function getMoodEmoji(mood) {
    const emojiMap = {
        happy: '😊',
        sad: '😢',
        angry: '😠',
        excited: '🤩',
        confused: '🤔',
        worried: '😰',
        neutral: '😐'
    };
    return emojiMap[mood] || '😐';
}

/**
 * Get system prompt adjustment based on mood
 */
function getMoodPromptAdjustment(mood) {
    const adjustments = {
        happy: 'User is in a happy mood! Be energetic, enthusiastic, and share their joy.',
        sad: 'User seems sad. Be empathetic, supportive, and comforting. Show you care.',
        angry: 'User appears angry or frustrated. Stay calm, understanding, and try to help de-escalate.',
        excited: 'User is excited! Match their energy and enthusiasm.',
        confused: 'User is confused. Be patient, clear, and helpful in your explanations.',
        worried: 'User is worried. Provide reassurance and practical solutions.',
        neutral: 'User is in a neutral mood. Be friendly, casual, and helpful.'
    };

    return adjustments[mood] || adjustments.neutral;
}

/**
 * Analyze mood and return full analysis
 */
function analyzeMoodFull(text) {
    const mood = analyzeMood(text);
    const emoji = getMoodEmoji(mood);
    const promptAdjustment = getMoodPromptAdjustment(mood);

    return {
        mood,
        emoji,
        promptAdjustment,
        confidence: mood === 'neutral' ? 0.5 : 0.8
    };
}

module.exports = {
    analyzeMood,
    getMoodEmoji,
    getMoodPromptAdjustment,
    analyzeMoodFull
};
