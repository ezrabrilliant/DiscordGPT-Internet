/**
 * AI Client Service
 * Handles communication with Local AI Engine + OpenAI fallback
 * Priority: Local PC (via tunnel) -> OpenAI API
 */

const { MESSAGES } = require('../config');
const { logger } = require('../middleware');
const fs = require('fs');
const path = require('path');

// ============================================
// Configuration
// ============================================

// Local AI Engine (your PC via cloudflared tunnel)
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const AI_API_KEY = process.env.AI_API_KEY || ''; // Optional API key for local engine

// OpenAI Fallback
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

// Timing
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const REQUEST_TIMEOUT = 30000; // 30 seconds (longer for AI)
const OPENAI_TIMEOUT = 60000; // 60 seconds for OpenAI

// Log file path
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '../../messages.log');

// ============================================
// State
// ============================================

let localEngineConnected = false;
let lastHealthCheck = null;
let healthCheckTimer = null;
let currentProvider = 'none'; // 'local', 'openai', 'none'

// ============================================
// Helper Functions
// ============================================

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
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
// Local AI Engine (Your PC)
// ============================================

/**
 * Check if Local AI Engine is online
 */
async function checkLocalHealth() {
    try {
        const headers = {};
        if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

        const response = await fetchWithTimeout(
            `${AI_ENGINE_URL}/health`,
            { headers },
            5000
        );
        
        const wasConnected = localEngineConnected;
        
        if (response.ok) {
            const data = await response.json();
            localEngineConnected = data.status === 'healthy' || data.ollama || data.chromadb;
        } else {
            localEngineConnected = false;
        }
        
        lastHealthCheck = new Date();

        // Log status changes
        if (localEngineConnected && !wasConnected) {
            logger.info('🟢 Local AI Engine connected', { url: AI_ENGINE_URL });
            currentProvider = 'local';
        } else if (!localEngineConnected && wasConnected) {
            logger.warn('🔴 Local AI Engine disconnected, switching to OpenAI fallback');
            currentProvider = OPENAI_API_KEY ? 'openai' : 'none';
        }

        // Set initial provider
        if (currentProvider === 'none') {
            if (localEngineConnected) {
                currentProvider = 'local';
            } else if (OPENAI_API_KEY) {
                currentProvider = 'openai';
            }
        }

        return localEngineConnected;
    } catch (error) {
        if (localEngineConnected) {
            logger.warn('🔴 Local AI Engine connection lost', { error: error.message });
            currentProvider = OPENAI_API_KEY ? 'openai' : 'none';
        }
        localEngineConnected = false;
        return false;
    }
}

/**
 * Chat with Local AI Engine
 */
async function chatLocal(message, context = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

    const response = await fetchWithTimeout(
        `${AI_ENGINE_URL}/chat`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({ message, context }),
        },
        REQUEST_TIMEOUT
    );

    if (!response.ok) {
        throw new Error(`Local AI returned ${response.status}`);
    }

    const data = await response.json();
    return data.response;
}

/**
 * Send log to Local AI Engine for RAG indexing
 */
async function sendLogToLocal(logData) {
    if (!localEngineConnected) return false;

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

        await fetchWithTimeout(
            `${AI_ENGINE_URL}/log`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(logData),
            },
            5000
        );
        return true;
    } catch (error) {
        logger.debug('Failed to send log to Local AI', { error: error.message });
        return false;
    }
}

// ============================================
// OpenAI Fallback
// ============================================

/**
 * Chat with OpenAI API
 */
async function chatOpenAI(message, context = {}) {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
    }

    const systemPrompt = `Kamu adalah Ezra, asisten Discord bot yang ramah, lucu, dan suka bercanda.
Jawab dengan santai, fun, dan friendly. Boleh pakai emoji sesekali 😄
Balas dengan bahasa yang sama dengan user (Indonesia/English).`;

    const messages = [
        { role: 'system', content: systemPrompt }
    ];

    // Add user context
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
                temperature: 0.8,
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
 * Start periodic health checks
 */
function startHealthChecks() {
    if (healthCheckTimer) return;

    // Initial check
    checkLocalHealth();

    // Periodic checks
    healthCheckTimer = setInterval(checkLocalHealth, HEALTH_CHECK_INTERVAL);
    
    logger.info('🔄 AI health checks started', { 
        localUrl: AI_ENGINE_URL,
        hasOpenAIKey: !!OPENAI_API_KEY,
        interval: HEALTH_CHECK_INTERVAL 
    });
}

/**
 * Stop health checks
 */
function stopHealthChecks() {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
}

/**
 * Send a chat message - tries Local first, then OpenAI
 * @param {string} message - User message
 * @param {object} context - Additional context (user, server, etc)
 * @returns {Promise<{success: boolean, response?: string, provider?: string, error?: string}>}
 */
async function chat(message, context = {}) {
    // Try Local AI Engine first
    if (localEngineConnected) {
        try {
            const response = await chatLocal(message, context);
            return { 
                success: true, 
                response, 
                provider: 'local' 
            };
        } catch (error) {
            logger.warn('Local AI failed, trying OpenAI fallback', { error: error.message });
            localEngineConnected = false;
        }
    }

    // Fallback to OpenAI
    if (OPENAI_API_KEY) {
        try {
            const response = await chatOpenAI(message, context);
            return { 
                success: true, 
                response, 
                provider: 'openai' 
            };
        } catch (error) {
            logger.error('OpenAI fallback failed', { error: error.message });
            return { 
                success: false, 
                error: error.message,
                provider: 'openai'
            };
        }
    }

    // No provider available
    return { 
        success: false, 
        error: 'No AI provider available (Local offline, no OpenAI key)',
        provider: 'none'
    };
}

/**
 * Log conversation for RAG + local file
 * @param {object} logData - { server, user, username, query, reply }
 */
async function logConversation(logData) {
    // Always save to local file
    appendToLog({
        timestamp: new Date().toISOString(),
        server: logData.server,
        user: logData.user,
        username: logData.username,
        query: logData.query,
        reply: logData.reply,
        provider: currentProvider
    });

    // Send to Local AI for RAG indexing
    await sendLogToLocal(logData);
}

/**
 * Get current connection status
 */
function getStatus() {
    return {
        localConnected: localEngineConnected,
        localUrl: AI_ENGINE_URL,
        openaiConfigured: !!OPENAI_API_KEY,
        currentProvider,
        lastCheck: lastHealthCheck,
    };
}

module.exports = {
    startHealthChecks,
    stopHealthChecks,
    checkHealth: checkLocalHealth,
    chat,
    logConversation,
    sendLog: sendLogToLocal,
    getStatus,
    isOnline: () => localEngineConnected || !!OPENAI_API_KEY,
    isLocalOnline: () => localEngineConnected,
    getCurrentProvider: () => currentProvider,
};
