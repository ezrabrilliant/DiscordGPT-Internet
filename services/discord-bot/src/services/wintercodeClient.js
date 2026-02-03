/**
 * WinterCode AI Client Service
 * Uses https://ai.wintercode.dev/v1/messages API
 * Supports text + image/vision processing
 */

const { logger } = require('../middleware');
const fs = require('fs').promises;
const path = require('path');

// ============================================
// Configuration
// ============================================

const API_KEY = process.env.WINTERCODE_API_KEY || 'xxhengkerpromax';
const API_URL = 'https://ai.wintercode.dev/v1/messages';
const DEFAULT_MODEL = process.env.WINTERCODE_MODEL || 'gemini-3-flash-preview';
const API_TIMEOUT = 60000; // 60 seconds

// Available models
const MODELS = {
    FAST: 'gemini-2.5-flash-lite',
    STANDARD: 'gemini-2.5-flash',
    FLASH_PREVIEW: 'gemini-3-flash-preview',
    PRO: 'gemini-3-pro-preview',
    VISION: 'gemini-3-pro-image-preview'
};

// ============================================
// Helper Functions
// ============================================

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(url, options = {}, timeout = API_TIMEOUT) {
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
 * Convert image to base64
 * Supports: URLs, local files, Discord attachment objects
 */
async function imageToBase64(imageSource) {
    try {
        let buffer;

        // If it's a URL, fetch it
        if (typeof imageSource === 'string' && imageSource.startsWith('http')) {
            const response = await fetch(imageSource);
            buffer = await response.arrayBuffer();
        }
        // If it's a Discord attachment
        else if (imageSource.url) {
            const response = await fetch(imageSource.url);
            buffer = await response.arrayBuffer();
        }
        // If it's a local file path
        else {
            buffer = await fs.readFile(imageSource);
        }

        // Convert to base64
        const base64 = Buffer.from(buffer).toString('base64');

        // Detect media type from URL or default to png
        let mediaType = 'image/png';
        if (typeof imageSource === 'string') {
            if (imageSource.includes('.jpg') || imageSource.includes('.jpeg')) {
                mediaType = 'image/jpeg';
            } else if (imageSource.includes('.gif')) {
                mediaType = 'image/gif';
            } else if (imageSource.includes('.webp')) {
                mediaType = 'image/webp';
            }
        } else if (imageSource.contentType) {
            mediaType = imageSource.contentType;
        }

        return { data: base64, mediaType };
    } catch (error) {
        logger.error('Failed to convert image to base64', { error: error.message });
        throw new Error(`Gagal memproses gambar: ${error.message}`);
    }
}

// ============================================
// Main API Functions
// ============================================

/**
 * Chat with WinterCode API (text only)
 * @param {string} message - User message
 * @param {object} options - { model, temperature, systemPrompt }
 */
async function chatText(message, options = {}) {
    const model = options.model || DEFAULT_MODEL;
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens || 2000;

    const requestBody = {
        model,
        messages: [{ role: 'user', content: message }],
        temperature,
        max_output_tokens: maxTokens,
    };

    // Add system prompt if provided
    if (options.systemPrompt) {
        requestBody.messages.unshift({
            role: 'system',
            content: options.systemPrompt
        });
    }

    logger.debug('WinterCode API request', {
        model,
        messageLength: message.length,
        hasSystemPrompt: !!options.systemPrompt
    });

    const response = await fetchWithTimeout(
        API_URL,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': API_KEY,
            },
            body: JSON.stringify(requestBody),
        },
        API_TIMEOUT
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`WinterCode API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Extract text from response
    if (data.content && data.content.length > 0) {
        const textContent = data.content.find(item => item.type === 'text');
        return textContent?.text || 'Maaf, aku tidak bisa memproses pesan tersebut.';
    }

    throw new Error('Invalid response format from API');
}

/**
 * Chat with WinterCode API (text + image)
 * @param {string} message - User message
 * @param {string|object} image - Image URL, path, or Discord attachment
 * @param {object} options - { model, temperature, systemPrompt }
 */
async function chatWithImage(message, image, options = {}) {
    const model = options.model || MODELS.VISION;
    const temperature = options.temperature ?? 0.7;
    const maxTokens = options.maxTokens || 2000;

    // Convert image to base64
    const imageData = await imageToBase64(image);

    // Build content array with text + image
    const content = [
        {
            type: 'image',
            source: {
                type: 'base64',
                media_type: imageData.mediaType,
                data: imageData.data
            }
        },
        {
            type: 'text',
            text: message || 'Deskripsikan gambar ini.'
        }
    ];

    const requestBody = {
        model,
        messages: [{ role: 'user', content }],
        temperature,
        max_output_tokens: maxTokens,
    };

    // Add system prompt if provided
    if (options.systemPrompt) {
        requestBody.messages.unshift({
            role: 'system',
            content: options.systemPrompt
        });
    }

    logger.debug('WinterCode API request (vision)', {
        model,
        messageLength: message.length,
        imageSize: imageData.data.length,
        hasSystemPrompt: !!options.systemPrompt
    });

    const response = await fetchWithTimeout(
        API_URL,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': API_KEY,
            },
            body: JSON.stringify(requestBody),
        },
        API_TIMEOUT
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`WinterCode API error: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Extract text from response
    if (data.content && data.content.length > 0) {
        const textContent = data.content.find(item => item.type === 'text');
        return textContent?.text || 'Maaf, aku tidak bisa memproses gambar tersebut.';
    }

    throw new Error('Invalid response format from API');
}

// ============================================
// Response Sanitizer (Anti-Exploit)
// ============================================

const EXPLOIT_RESPONSES = {
    everyone: [
        "Hayo mau ngetag everyone? No no no~ 😏",
        "Eits, ketahuan mau spam tag everyone ya? Nice try! 😹",
        "Yah, aku gabisa ngetag everyone. Mau ngapain emang? 🤨",
    ],
    role: [
        "Hayo mau ngetag role? Gabisa dong~ 😏",
        "Nice try! Aku gabisa mention role 😹",
        "Mau spam role? gabisa dong wleee! 🙅",
    ],
    user: [
        "Hayo mau ngetag orang? Gabisa dong~ 😏",
        "Nice try! Aku gabisa mention user 😹",
        "Mau tag orang? Nope! 🙅",
    ],
    invite: [
        "Hayo mau nyebar invite link? Gabisa dong~ 😏",
        "Nice try! Aku gabisa kirim invite link 😹",
        "Mau spam server lain? Nope! 🙅",
    ],
};

function randomResponse(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Sanitize AI response to prevent exploits
 */
function sanitizeResponse(text) {
    if (!text) return { text, exploitDetected: false };

    let sanitized = text;
    let exploitType = null;

    // Check for @everyone and @here
    if (/@everyone/gi.test(sanitized) || /@\s*everyone/gi.test(sanitized)) {
        exploitType = 'everyone';
        sanitized = sanitized.replace(/@everyone/gi, '[everyone]');
        sanitized = sanitized.replace(/@\s*everyone/gi, '[everyone]');
    }
    if (/@here/gi.test(sanitized) || /@\s*here/gi.test(sanitized)) {
        exploitType = 'everyone';
        sanitized = sanitized.replace(/@here/gi, '[here]');
        sanitized = sanitized.replace(/@\s*here/gi, '[here]');
    }

    // Check for role mentions
    if (/<@&\d+>/gi.test(sanitized) || /<\s*@\s*&\s*\d+\s*>/gi.test(sanitized)) {
        exploitType = 'role';
        sanitized = sanitized.replace(/<@&\d+>/gi, '[role]');
        sanitized = sanitized.replace(/<\s*@\s*&\s*\d+\s*>/gi, '[role]');
    }

    // Check for user mentions
    if (/<@!?\d+>/gi.test(sanitized) || /<\s*@\s*!?\s*\d+\s*>/gi.test(sanitized)) {
        exploitType = 'user';
        sanitized = sanitized.replace(/<@!?\d+>/gi, '[user]');
        sanitized = sanitized.replace(/<\s*@\s*!?\s*\d+\s*>/gi, '[user]');
    }

    // Check for Discord invite links
    if (/discord\.(gg|com\/invite|app\.com\/invite)\/[a-zA-Z0-9]+/gi.test(sanitized)) {
        exploitType = 'invite';
        sanitized = sanitized.replace(/discord\.gg\/[a-zA-Z0-9]+/gi, '[invite removed]');
        sanitized = sanitized.replace(/discord\.com\/invite\/[a-zA-Z0-9]+/gi, '[invite removed]');
        sanitized = sanitized.replace(/discordapp\.com\/invite\/[a-zA-Z0-9]+/gi, '[invite removed]');
    }

    // Log if exploit detected
    if (exploitType) {
        logger.warn('Exploit attempt detected', {
            type: exploitType,
            original: text.slice(0, 100)
        });
        return {
            text: randomResponse(EXPLOIT_RESPONSES[exploitType]),
            exploitDetected: true
        };
    }

    return { text: sanitized, exploitDetected: false };
}

// ============================================
// Main API
// ============================================

/**
 * Start health checks
 */
function startHealthChecks() {
    logger.info('WinterCode AI Client initialized', {
        apiConfigured: !!API_KEY,
        model: DEFAULT_MODEL
    });
}

/**
 * Stop health checks
 */
function stopHealthChecks() {
    // No-op
}

/**
 * Send a chat message (auto-detects if image is present)
 * @param {string} message - User message
 * @param {object} context - { username, userId, guildId, image, replyTo, etc }
 */
async function chat(message, context = {}) {
    if (!API_KEY) {
        return {
            success: false,
            error: 'WinterCode API key not configured',
            provider: 'none'
        };
    }

    try {
        let response;

        // Build system prompt with context
        let systemPrompt = 'Kamu adalah asisten AI yang ramah dan membantu. Kamu berbicara dalam bahasa Indonesia yang santai dan natural.';

        // Add user context
        if (context.username) {
            systemPrompt += `\nUser yang bertanya: ${context.username}`;
        }

        // Add reply context
        if (context.replyTo) {
            systemPrompt += `\nUser sedang membalas pesan: "${context.replyTo}"`;
        }

        // Add server context
        if (context.serverName) {
            systemPrompt += `\nServer: ${context.serverName}`;
        }

        const options = {
            model: context.model || DEFAULT_MODEL,
            temperature: context.temperature || 0.7,
            maxTokens: context.maxTokens || 2000,
            systemPrompt
        };

        // If image present, use vision API
        if (context.image) {
            response = await chatWithImage(message, context.image, options);
        } else {
            response = await chatText(message, options);
        }

        // Sanitize response
        const sanitized = sanitizeResponse(response);

        return {
            success: true,
            response: sanitized.text,
            provider: DEFAULT_MODEL
        };
    } catch (error) {
        logger.error('WinterCode chat failed', { error: error.message });
        return {
            success: false,
            error: error.message,
            provider: DEFAULT_MODEL
        };
    }
}

/**
 * Log conversation for future reference
 */
async function logConversation(logData) {
    const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '../../messages.log');

    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            server: logData.server,
            user: logData.user,
            username: logData.username,
            query: logData.query,
            reply: logData.reply,
            provider: DEFAULT_MODEL,
            hasImage: logData.hasImage || false,
        };

        const logLine = JSON.stringify(logEntry) + '\n';
        await fs.appendFile(LOG_FILE, logLine);

        logger.debug('Conversation logged', {
            user: logData.username,
            queryLength: logData.query?.length
        });
    } catch (error) {
        logger.debug('Failed to write to log file', { error: error.message });
    }
}

/**
 * Get current status
 */
function getStatus() {
    return {
        mode: 'wintercode-api',
        apiConfigured: !!API_KEY,
        model: DEFAULT_MODEL,
        availableModels: Object.values(MODELS)
    };
}

module.exports = {
    startHealthChecks,
    stopHealthChecks,
    chat,
    chatText,
    chatWithImage,
    logConversation,
    getStatus,
    isOnline: () => !!API_KEY,
    getCurrentProvider: () => DEFAULT_MODEL,
    MODELS
};
