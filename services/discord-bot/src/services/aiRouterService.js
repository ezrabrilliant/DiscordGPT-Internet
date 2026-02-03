/**
 * AI Router Service
 * Uses Gemini 2.5 Flash as intelligent decision router
 * Replaces hardcoded logic with AI-based analysis
 */

const { logger } = require('../middleware');

const ROUTER_API_KEY = process.env.WINTERCODE_API_KEY || 'xxhengkerpromax';
const ROUTER_API_URL = 'https://ai.wintercode.dev/v1/messages';
const ROUTER_MODEL = 'gemini-2.5-flash'; // Fast & cheap for routing
const ROUTER_TIMEOUT = 10000; // 10 seconds

/**
 * Make routing decision via AI
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
  "shouldOfferFollowUp": true/false,
  "followUpSuggestions": ["suggestion1", "suggestion2"] or [],
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
3. FOLLOW-UP: Only suggest if user asked for recommendations, help, or seems unsure. Don't suggest for simple factual questions.
4. EXTRACTED INFO: Extract any personal info mentioned (name, age, location, preferences)
5. CONFIDENCE: How confident are you in this analysis? (0.0-1.0)
6. REASONING: Brief explanation of your decision

Important: Return ONLY the JSON, nothing else!`;

        const requestBody = {
            model: ROUTER_MODEL,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3, // Low temperature for consistent decisions
            max_output_tokens: 500,
        };

        const response = await fetch(ROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': ROUTER_API_KEY,
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(ROUTER_TIMEOUT),
        });

        if (!response.ok) {
            throw new Error(`Router API error: ${response.status}`);
        }

        const data = await response.json();

        // Extract text from response
        let decisionText = '';
        if (data.content && data.content.length > 0) {
            const textContent = data.content.find(item => item.type === 'text');
            decisionText = textContent?.text || '{}';
        }

        // Parse JSON - handle potential markdown formatting
        decisionText = decisionText
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        let decision;
        try {
            decision = JSON.parse(decisionText);
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

        logger.debug('AI Router decision', {
            mood: decision.mood,
            shouldUseEmbed: decision.shouldUseEmbed,
            confidence: decision.confidence
        });

        return decision;

    } catch (error) {
        logger.error('AI Router failed, using defaults', { error: error.message });
        return getDefaultDecision();
    }
}

/**
 * Get default/fallback decision
 */
function getDefaultDecision() {
    return {
        mood: 'neutral',
        shouldUseEmbed: false,
        shouldOfferFollowUp: false,
        followUpSuggestions: [],
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
    validated.shouldOfferFollowUp = Boolean(validated.shouldOfferFollowUp);

    // Validate arrays
    if (!Array.isArray(validated.followUpSuggestions)) {
        validated.followUpSuggestions = [];
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
