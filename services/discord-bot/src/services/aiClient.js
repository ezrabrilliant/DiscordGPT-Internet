/**
 * AI Client Service (Cloud-Only Mode)
 * Uses OpenAI for response generation + Gemini for RAG embedding
 * No local AI engine required
 */

const { MESSAGES } = require('../config');
const { logger } = require('../middleware');
const { getPersonality } = require('../config/personalities');
const ragService = require('./ragService');
const fs = require('fs');
const path = require('path');

// ============================================
// Configuration
// ============================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT = 90000; // 90 seconds

// Log file path
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '../../messages.log');

// ============================================
// Helper Functions
// ============================================

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = OPENAI_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Append to local messages.log file
 */
function appendToLog(logEntry) {
    try {
        const timestamp = new Date().toISOString();
        const logLine = `${timestamp} - ${JSON.stringify(logEntry)}\n`;
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (error) {
        logger.debug('Failed to write to log file', { error: error.message });
    }
}

// ============================================
// OpenAI Chat with Personality + RAG
// ============================================

/**
 * Chat with OpenAI API using personality and RAG context
 * @param {string} message - User message
 * @param {object} context - { guildId, username, userId }
 */
async function chatOpenAI(message, context = {}) {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
    }

    // Get personality for this guild
    const personality = getPersonality(context.guildId);

    // Search RAG for relevant context
    let ragContext = '';
    try {
        const results = await ragService.search(message, personality.knowledgeBase, 5);
        if (results.length > 0) {
            ragContext = results.map(r => r.content).join('\n---\n');
            logger.debug('RAG found context', {
                knowledgeBase: personality.knowledgeBase,
                results: results.length
            });
        }
    } catch (error) {
        logger.debug('RAG search failed (continuing without context)', { error: error.message });
    }

    // Build messages with personality + RAG context
    const messages = [
        { role: 'system', content: personality.systemPrompt }
    ];

    // Add RAG context if available
    if (ragContext) {
        logger.debug('RAG context being sent to OpenAI', {
            contextLength: ragContext.length,
            preview: ragContext.slice(0, 200)
        });
        messages.push({
            role: 'system',
            content: `CONTEXT BERIKUT ADALAH INFORMASI YANG HARUS DIGUNAKAN UNTUK MENJAWAB:\n\n${ragContext}`
        });
    }

    // Add user info
    if (context.username) {
        messages.push({
            role: 'system',
            content: `User yang bertanya: ${context.username}`
        });
    }

    messages.push({ role: 'user', content: message });

    const response = await fetchWithTimeout(
        'https://api.openai.com/v1/chat/completions',
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: OPENAI_MODEL,
                messages,
                temperature: personality.allowProfanity ? 0.9 : 0.7,
                max_tokens: 500,
            }),
        },
        OPENAI_TIMEOUT
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'Hmm, aku bingung mau jawab apa 😅';
}

// ============================================
// Main API
// ============================================

/**
 * Start health checks (minimal - just log status)
 */
function startHealthChecks() {
    logger.info('AI Client initialized (Cloud-only mode)', {
        openaiConfigured: !!OPENAI_API_KEY,
        model: OPENAI_MODEL
    });
}

/**
 * Stop health checks
 */
function stopHealthChecks() {
    // No-op in cloud mode
}

/**
 * Send a chat message using OpenAI
 * @param {string} message - User message
 * @param {object} context - Additional context (user, server, etc)
 * @returns {Promise<{success: boolean, response?: string, provider?: string, error?: string}>}
 */
async function chat(message, context = {}) {
    if (!OPENAI_API_KEY) {
        return {
            success: false,
            error: 'OpenAI API key not configured',
            provider: 'none'
        };
    }

    try {
        const response = await chatOpenAI(message, context);
        return {
            success: true,
            response,
            provider: OPENAI_MODEL
        };
    } catch (error) {
        logger.error('OpenAI chat failed', { error: error.message });
        return {
            success: false,
            error: error.message,
            provider: OPENAI_MODEL
        };
    }
}

/**
 * Log conversation for future reference
 * @param {object} logData - { server, user, username, query, reply }
 */
async function logConversation(logData) {
    appendToLog({
        timestamp: new Date().toISOString(),
        server: logData.server,
        user: logData.user,
        username: logData.username,
        query: logData.query,
        reply: logData.reply,
        provider: OPENAI_MODEL
    });
}

/**
 * Get current connection status
 */
function getStatus() {
    return {
        mode: 'cloud-only',
        openaiConfigured: !!OPENAI_API_KEY,
        model: OPENAI_MODEL,
        ragStatus: ragService.getStatus()
    };
}

module.exports = {
    startHealthChecks,
    stopHealthChecks,
    chat,
    logConversation,
    getStatus,
    isOnline: () => !!OPENAI_API_KEY,
    getCurrentProvider: () => OPENAI_MODEL,
};
