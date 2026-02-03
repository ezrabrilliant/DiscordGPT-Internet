/**
 * AI Router Service
 * Uses Gemini 2.5 Flash as intelligent decision router
 * Replaces hardcoded logic with AI-based analysis
 */

const { logger } = require('../middleware');
const geminiDirectClient = require('./geminiDirectClient');

const ROUTER_MODEL = 'gemini-2.5-flash'; // Fast & cheap for routing
const ROUTER_TIMEOUT = 30000; // 30 seconds

/**
 * Make routing decision via AI (using Gemini Direct - cheaper)
 * Analyzes message and returns structured JSON decision
 */
async function makeRoutingDecision(message, context = {}) {
    try {
        const prompt = `You are an intelligent AI router. Analyze the user's message and return a JSON decision.

User Message: "${message}"

Context:
- Username: ${context.username || 'Unknown'}
- Has Images: ${context.hasImages ? 'Yes' : 'No'}
- Is Replying: ${context.isReplying ? 'Yes' : 'No'}
- Previous Context: ${context.previousContext || 'None'}

Return ONLY a valid JSON (no markdown, no extra text) with this exact structure:
{
  "mood": "happy|sad|angry|excited|confused|worried|neutral",
  "shouldUseEmbed": true/false,
  "shouldUseButtons": true/false,
  "buttonOptions": ["Option 1", "Option 2", "Option 3"] or [],
  "extractedInfo": {
    "name": null or "extracted name",
    "age": null or "extracted age",
    "location": null or "extracted location",
    "preferences": [] or ["preference1", "preference2"]
  },
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Rules:
1. MOOD: Detect from emojis, keywords, and tone
2. EMBED: Use for long responses, image analysis, structured info, recommendations. Use plain text for casual chat.
3. BUTTONS: Use buttons when user asks for recommendations and you can provide 2-4 distinct options to choose from. Each button should represent a different category/choice.
4. BUTTON OPTIONS: Provide 2-4 clear, distinct options that the user can choose from. Each option should be short (under 30 chars).
5. EXTRACTED INFO: Extract any personal info mentioned (name, age, location, preferences)
6. CONFIDENCE: How confident are you in this analysis? (0.0-1.0)
7. REASONING: Brief explanation of your decision

Examples when to use buttons:
- "rekomendasi laptop" → ["Budget 4-6jt", "Mid-Range 10-13jt", "High-End 20jt+"]
- "rekomendasi film" → ["Horror", "Action", "Comedy", "Romance"]
- "rekomendasi makanan" → ["Pedas", "Manis", "Asin", "Tradisional"]

Important: Return ONLY the JSON, nothing else!`;

        const response = await geminiDirectClient.chat(prompt, {
            model: ROUTER_MODEL,
            temperature: 0.3,
            maxTokens: 1000, // Increase from 500 to 1000
            timeout: ROUTER_TIMEOUT
        });

        if (!response.success) {
            throw new Error(response.error);
        }

        const decisionText = response.response;

        // Parse JSON - handle potential markdown formatting
        const cleanText = decisionText
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        let decision;
        try {
            decision = JSON.parse(cleanText);
        } catch (parseError) {
            logger.warn('Failed to parse router decision, using defaults', {
                error: parseError.message,
                response: decisionText.substring(0, 200)
            });

            // Return safe defaults
            decision = getDefaultDecision();
        }

        // Validate decision structure
        decision = validateAndFixDecision(decision);

        logger.debug('AI Router decision (Gemini Direct)', {
            mood: decision.mood,
            shouldUseEmbed: decision.shouldUseEmbed,
            confidence: decision.confidence
        });

        return decision;

    } catch (error) {
        logger.error('AI Router failed, using heuristic fallback', { error: error.message });
        return makeHeuristicDecision(message, context);
    }
}

/**
 * Get default/fallback decision (IMPROVED - with basic heuristic)
 */
function getDefaultDecision() {
    return {
        mood: 'neutral',
        shouldUseEmbed: false,
        shouldUseButtons: false,
        buttonOptions: [],
        extractedInfo: {
            name: null,
            age: null,
            location: null,
            preferences: []
        },
        confidence: 0.5,
        reasoning: 'Default: Router failed'
    };
}

/**
 * Quick heuristic decision (no API call) - fallback when router fails
 */
function makeHeuristicDecision(message, context) {
    const lower = message.toLowerCase();

    // Detect mood from emojis/keywords
    let mood = 'neutral';
    if (/❤️|😍|🥰|😊|😄|😁|🎉|🔥|⭐|💯|😂|🤣/.test(message)) {
        mood = 'happy';
    } else if (/😢|😭|😞|😔|💔/.test(message)) {
        mood = 'sad';
    } else if (/😠|😡|🤬|💢|👿|😤/.test(message)) {
        mood = 'angry';
    } else if (/🤩|😱|🚀|💥|⚡/.test(message)) {
        mood = 'excited';
    } else if (/🤔|😕|😐|❓|❔|bingung|pusing/.test(lower)) {
        mood = 'confused';
    } else if (/😰|😨|😱|takut|scared|khawatir|cemas/.test(lower)) {
        mood = 'worried';
    }

    // Decide embed based on content
    const hasImages = context.hasImages;
    const isRecommendation = /rekomendasi|saran|cara|how|what|list|daftar|tips|jelasin|penjelasan|arti/i.test(lower);
    const isLong = message.length > 100;

    const shouldUseEmbed = hasImages || (isRecommendation && isLong);

    // Decide buttons - use buttons for recommendations, let AI router generate options
    let shouldUseButtons = false;
    let buttonOptions = [];

    if (isRecommendation) {
        shouldUseButtons = true;
        buttonOptions = []; // Empty - let AI Router generate specific options
    }

    return {
        mood,
        shouldUseEmbed,
        shouldUseButtons,
        buttonOptions,
        extractedInfo: {
            name: null,
            age: null,
            location: null,
            preferences: []
        },
        confidence: 0.7, // Heuristic has medium confidence
        reasoning: 'Heuristic: Pattern-based decision'
    };
}

/**
 * Validate and fix decision structure
 */
function validateAndFixDecision(decision) {
    const validated = { ...getDefaultDecision(), ...decision };

    // Validate mood
    const validMoods = ['happy', 'sad', 'angry', 'excited', 'confused', 'worried', 'neutral'];
    if (!validMoods.includes(validated.mood)) {
        validated.mood = 'neutral';
    }

    // Validate booleans
    validated.shouldUseEmbed = Boolean(validated.shouldUseEmbed);
    validated.shouldUseButtons = Boolean(validated.shouldUseButtons);

    // Validate arrays
    if (!Array.isArray(validated.buttonOptions)) {
        validated.buttonOptions = [];
    }
    if (!Array.isArray(validated.extractedInfo?.preferences)) {
        validated.extractedInfo.preferences = [];
    }

    // Validate confidence
    if (typeof validated.confidence !== 'number' || validated.confidence < 0 || validated.confidence > 1) {
        validated.confidence = 0.5;
    }

    return validated;
}

/**
 * Get mood emoji from AI decision
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
 * Get mood prompt adjustment from AI decision
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
 * Process extracted info and format for memory update
 */
function processExtractedInfo(extractedInfo) {
    const updates = {};

    if (extractedInfo?.name) {
        updates.name = extractedInfo.name;
    }

    if (extractedInfo?.age) {
        updates.age = extractedInfo.age;
    }

    if (extractedInfo?.location) {
        updates.location = extractedInfo.location;
    }

    if (extractedInfo?.preferences && Array.isArray(extractedInfo.preferences)) {
        updates.preferences = {
            ...extractedInfo.preferences
        };
    }

    return updates;
}

module.exports = {
    makeRoutingDecision,
    getMoodEmoji,
    getMoodPromptAdjustment,
    processExtractedInfo,
    getDefaultDecision
};
