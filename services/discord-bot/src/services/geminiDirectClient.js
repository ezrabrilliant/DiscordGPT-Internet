/**
 * Gemini Direct API Client
 * Direct integration with Google Gemini API (no WinterCode middleware)
 * Used for AI Router and simple chat tasks (cheaper, faster)
 */

const { logger } = require('../middleware');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const DEFAULT_MODEL = 'gemini-2.5-flash'; // Fast & cheap for routing
const ROUTER_TIMEOUT = 30000; // 30 seconds

/**
 * Call Gemini API directly
 */
async function callGemini(model, prompt, options = {}) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const modelName = `${model}:generateContent`;
    const apiUrl = `${GEMINI_API_URL}${modelName}?key=${GEMINI_API_KEY}`;

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: prompt }
                ]
            }
        ],
        generationConfig: {
            temperature: options.temperature || 0.3,
            maxOutputTokens: options.maxTokens || 1000, // Increase from 500
        }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(options.timeout || ROUTER_TIMEOUT),
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Extract text from response
    if (data.candidates && data.candidates[0]) {
        const content = data.candidates[0].content;
        if (content.parts && content.parts[0]) {
            return content.parts[0].text;
        }
    }

    throw new Error('Invalid Gemini API response format');
}

/**
 * Chat with Gemini (simple chat, no history)
 */
async function chat(message, options = {}) {
    try {
        const model = options.model || DEFAULT_MODEL;
        const prompt = options.systemPrompt 
            ? `${options.systemPrompt}\n\n${message}`
            : message;

        const response = await callGemini(model, prompt, {
            temperature: options.temperature || 0.7,
            maxTokens: options.maxTokens || 2000,
            timeout: options.timeout || ROUTER_TIMEOUT
        });

        return {
            success: true,
            response: response,
            provider: model
        };
    } catch (error) {
        logger.error('Gemini Direct chat failed', { error: error.message });
        return {
            success: false,
            error: error.message,
            provider: DEFAULT_MODEL
        };
    }
}

/**
 * Get available models
 */
function getAvailableModels() {
    return [
        'gemini-2.5-flash',          // Fast, cheap - for routing
        'gemini-2.5-flash-lite',     // Cheaper
        'gemini-2.5-pro',            // Capable
        'gemini-2.5-flash-exp'       // Experimental (if available)
    ];
}

/**
 * Get status
 */
function getStatus() {
    return {
        configured: !!GEMINI_API_KEY,
        defaultModel: DEFAULT_MODEL,
        availableModels: getAvailableModels(),
        mode: 'gemini-direct'
    };
}

module.exports = {
    chat,
    callGemini,
    getAvailableModels,
    getStatus,
    isOnline: () => !!GEMINI_API_KEY
};
