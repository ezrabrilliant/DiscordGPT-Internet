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

// Dynamic URL from GitHub Gist (auto-updated when tunnel restarts)
const TUNNEL_URL_GIST = process.env.TUNNEL_URL_GIST || ''; // Raw Gist URL
let AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';
const AI_API_KEY = process.env.AI_API_KEY || ''; // API key for security

// OpenAI Fallback
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

// Timing
const HEALTH_CHECK_INTERVAL = 60000; // 60 seconds
const URL_REFRESH_INTERVAL = 300000; // 5 minutes - check for new tunnel URL
const REQUEST_TIMEOUT = 60000; // 60 seconds for tunnel requests
const OPENAI_TIMEOUT = 90000; // 90 seconds for OpenAI
const HEALTH_TIMEOUT = 10000; // 10 seconds for health check

// Log file path
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '../../messages.log');
const PENDING_QUEUE_FILE = path.join(__dirname, '../../pending-logs.json');

// ============================================
// State
// ============================================

let localEngineConnected = false;
let lastHealthCheck = null;
let healthCheckTimer = null;
let urlRefreshTimer = null;
let currentProvider = 'none'; // 'local', 'openai', 'none'
let pendingLogs = []; // Queue untuk log yang gagal terkirim
let isSyncingPending = false;

// ============================================
// Helper Functions
// ============================================

/**
 * Fetch tunnel URL from GitHub Gist (auto-sync)
 */
async function refreshTunnelUrl() {
    if (!TUNNEL_URL_GIST) return;
    
    try {
        const response = await fetch(TUNNEL_URL_GIST, { 
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
            const newUrl = (await response.text()).trim();
            if (newUrl && newUrl.startsWith('http') && newUrl !== AI_ENGINE_URL) {
                const oldUrl = AI_ENGINE_URL;
                AI_ENGINE_URL = newUrl;
                logger.info('🔄 Tunnel URL updated', { old: oldUrl, new: newUrl });
                // Force health check with new URL
                await checkLocalHealth();
            }
        }
    } catch (error) {
        logger.debug('Failed to refresh tunnel URL', { error: error.message });
    }
}

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
// Pending Logs Queue (untuk sync saat PC nyala)
// ============================================

/**
 * Load pending logs from file (saat bot restart)
 */
function loadPendingLogs() {
    try {
        if (fs.existsSync(PENDING_QUEUE_FILE)) {
            const data = fs.readFileSync(PENDING_QUEUE_FILE, 'utf8');
            pendingLogs = JSON.parse(data);
            if (pendingLogs.length > 0) {
                logger.info(`📋 Loaded ${pendingLogs.length} pending logs to sync`);
            }
        }
    } catch (error) {
        logger.debug('Failed to load pending logs', { error: error.message });
        pendingLogs = [];
    }
}

/**
 * Save pending logs to file (persist across restart)
 */
function savePendingLogs() {
    try {
        fs.writeFileSync(PENDING_QUEUE_FILE, JSON.stringify(pendingLogs, null, 2));
    } catch (error) {
        logger.debug('Failed to save pending logs', { error: error.message });
    }
}

/**
 * Add log to pending queue (ketika AI Engine offline)
 */
function addToPendingQueue(logData) {
    // Limit queue size to prevent memory issues
    const MAX_PENDING = 1000;
    if (pendingLogs.length >= MAX_PENDING) {
        // Remove oldest entries
        pendingLogs = pendingLogs.slice(-MAX_PENDING + 100);
    }
    
    pendingLogs.push({
        ...logData,
        queuedAt: new Date().toISOString()
    });
    savePendingLogs();
}

/**
 * Sync all pending logs to AI Engine (dipanggil saat reconnect)
 */
async function syncPendingLogs() {
    if (!localEngineConnected || pendingLogs.length === 0 || isSyncingPending) {
        return;
    }
    
    isSyncingPending = true;
    const toSync = [...pendingLogs];
    let synced = 0;
    let failed = 0;
    
    logger.info(`📤 Syncing ${toSync.length} pending logs to AI Engine...`);
    
    for (const logData of toSync) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;
            
            const response = await fetchWithTimeout(
                `${AI_ENGINE_URL}/log`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(logData),
                },
                5000 // 5 second timeout per log
            );
            
            if (response.ok) {
                synced++;
                // Remove from pending queue
                const idx = pendingLogs.findIndex(p => p.queuedAt === logData.queuedAt);
                if (idx !== -1) {
                    pendingLogs.splice(idx, 1);
                }
            } else {
                failed++;
            }
        } catch (error) {
            failed++;
            // If connection lost during sync, stop
            if (!localEngineConnected) break;
        }
        
        // Small delay to not overwhelm the server
        await new Promise(r => setTimeout(r, 50));
    }
    
    savePendingLogs();
    isSyncingPending = false;
    
    if (synced > 0) {
        logger.info(`✅ Synced ${synced} pending logs (${failed} failed, ${pendingLogs.length} remaining)`);
    }
}

// ============================================
// Local AI Engine (Your PC)
// ============================================

/**
 * Check if Local AI Engine is online
 * Uses /ping endpoint for fast response, falls back to /health
 */
async function checkLocalHealth() {
    try {
        const headers = {};
        if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

        // First try fast /ping endpoint (instant response)
        let response;
        try {
            response = await fetchWithTimeout(
                `${AI_ENGINE_URL}/ping`,
                { headers },
                5000  // 5 second timeout for ping
            );
        } catch (pingError) {
            // Fallback to /health if /ping doesn't exist
            response = await fetchWithTimeout(
                `${AI_ENGINE_URL}/health`,
                { headers },
                HEALTH_TIMEOUT
            );
        }
        
        const wasConnected = localEngineConnected;
        
        if (response.ok) {
            const data = await response.json();
            // /ping just returns {status: "ok"}, /health returns detailed info
            localEngineConnected = data.status === 'ok' || data.status === 'healthy' || data.ollama || data.chromadb;
        } else {
            localEngineConnected = false;
        }
        
        lastHealthCheck = new Date();

        // Log status changes
        if (localEngineConnected && !wasConnected) {
            logger.info('🟢 Local AI Engine connected', { url: AI_ENGINE_URL });
            currentProvider = 'local';
            // Sync pending logs when reconnected
            syncPendingLogs();
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
 * @param {string} message - User's message
 * @param {string} userId - User ID for context isolation (prevents context leakage between users)
 * @param {object} context - Additional context
 */
async function chatLocal(message, userId = null, context = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

    const response = await fetchWithTimeout(
        `${AI_ENGINE_URL}/chat`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({ 
                message, 
                user: userId,  // Pass user ID for per-user context isolation
                context 
            }),
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
 * Jika gagal, masukkan ke pending queue
 */
async function sendLogToLocal(logData) {
    if (!localEngineConnected) {
        // AI Engine offline - queue for later
        addToPendingQueue(logData);
        return false;
    }

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

        const response = await fetchWithTimeout(
            `${AI_ENGINE_URL}/log`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(logData),
            },
            5000 // 5 second timeout
        );
        
        if (!response.ok) {
            // Failed - queue for retry
            addToPendingQueue(logData);
            return false;
        }
        
        return true;
    } catch (error) {
        // Network error - queue for retry
        addToPendingQueue(logData);
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
 * Start periodic health checks + URL refresh
 */
function startHealthChecks() {
    if (healthCheckTimer) return;

    // Load pending logs from previous session
    loadPendingLogs();

    // Initial URL refresh from Gist (if configured)
    if (TUNNEL_URL_GIST) {
        refreshTunnelUrl();
        // Periodic URL refresh every 5 minutes
        urlRefreshTimer = setInterval(refreshTunnelUrl, URL_REFRESH_INTERVAL);
        logger.info('🔗 Tunnel URL auto-sync enabled', { gist: TUNNEL_URL_GIST });
    }

    // Initial health check
    checkLocalHealth();

    // Periodic health checks
    healthCheckTimer = setInterval(checkLocalHealth, HEALTH_CHECK_INTERVAL);
    
    logger.info('🔄 AI health checks started', { 
        localUrl: AI_ENGINE_URL,
        hasOpenAIKey: !!OPENAI_API_KEY,
        interval: HEALTH_CHECK_INTERVAL,
        pendingLogs: pendingLogs.length
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
    if (urlRefreshTimer) {
        clearInterval(urlRefreshTimer);
        urlRefreshTimer = null;
    }
}

/**
 * Send a chat message - tries Local first, then OpenAI
 * @param {string} message - User message
 * @param {object} context - Additional context (user, server, etc)
 * @returns {Promise<{success: boolean, response?: string, provider?: string, error?: string}>}
 */
async function chat(message, context = {}) {
    // Extract user ID for per-user context isolation
    // Support both 'user' and 'userId' field names
    const userId = context.userId || context.user || null;
    
    // Try Local AI Engine first
    if (localEngineConnected) {
        try {
            const response = await chatLocal(message, userId, context);
            return { 
                success: true, 
                response, 
                provider: 'gemma-3n-e4b' 
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
                provider: 'gpt-3.5-turbo' 
            };
        } catch (error) {
            logger.error('OpenAI fallback failed', { error: error.message });
            return { 
                success: false, 
                error: error.message,
                provider: 'gpt-3.5-turbo'
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
