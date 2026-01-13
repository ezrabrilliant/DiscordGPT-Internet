/**
 * AI Client Service
 * Handles communication with the Python AI Engine
 * Includes health checks and automatic fallback
 */

const { MESSAGES } = require('../config');
const { logger } = require('../middleware');

// Configuration (can be overridden via env)
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const REQUEST_TIMEOUT = 15000; // 15 seconds

// Connection state
let isConnected = false;
let lastHealthCheck = null;
let healthCheckTimer = null;

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
 * Check if AI Engine is online
 */
async function checkHealth() {
    try {
        const response = await fetchWithTimeout(`${AI_ENGINE_URL}/health`, {}, 5000);
        const wasConnected = isConnected;
        isConnected = response.ok;
        lastHealthCheck = new Date();

        // Log status changes
        if (isConnected && !wasConnected) {
            logger.info('AI Engine connected', { url: AI_ENGINE_URL });
        } else if (!isConnected && wasConnected) {
            logger.warn('AI Engine disconnected');
        }

        return isConnected;
    } catch (error) {
        if (isConnected) {
            logger.warn('AI Engine connection lost', { error: error.message });
        }
        isConnected = false;
        return false;
    }
}

/**
 * Start periodic health checks
 */
function startHealthChecks() {
    if (healthCheckTimer) return;

    // Initial check
    checkHealth();

    // Periodic checks
    healthCheckTimer = setInterval(checkHealth, HEALTH_CHECK_INTERVAL);
    logger.debug('AI Engine health checks started', { interval: HEALTH_CHECK_INTERVAL });
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
 * Send a chat message to AI Engine
 * @param {string} message - User message
 * @param {object} context - Additional context (user, server, etc)
 * @returns {Promise<{success: boolean, response?: string, error?: string}>}
 */
async function chat(message, context = {}) {
    if (!isConnected) {
        return { success: false, error: 'AI Engine offline' };
    }

    try {
        const response = await fetchWithTimeout(`${AI_ENGINE_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, context }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return { success: true, response: data.response };

    } catch (error) {
        logger.error('AI chat request failed', { error: error.message });
        return { success: false, error: error.message };
    }
}

/**
 * Send a log entry to AI Engine for indexing
 * @param {object} logData - Log entry data
 */
async function sendLog(logData) {
    if (!isConnected) return;

    try {
        await fetchWithTimeout(`${AI_ENGINE_URL}/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logData),
        }, 5000);
    } catch (error) {
        // Silent fail for log sending
        logger.debug('Failed to send log to AI Engine', { error: error.message });
    }
}

/**
 * Get current connection status
 */
function getStatus() {
    return {
        connected: isConnected,
        url: AI_ENGINE_URL,
        lastCheck: lastHealthCheck,
    };
}

module.exports = {
    startHealthChecks,
    stopHealthChecks,
    checkHealth,
    chat,
    sendLog,
    getStatus,
    isOnline: () => isConnected,
};
