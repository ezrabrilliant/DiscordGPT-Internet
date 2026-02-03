/**
 * Conversation Service
 * Manage active conversation threads with context retention
 */

const { logger } = require('../middleware');

// In-memory conversation threads
const conversationThreads = new Map();
const THREAD_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_LENGTH = 10;

/**
 * Get or create conversation thread for user
 */
function getThread(userId) {
    const thread = conversationThreads.get(userId);

    if (!thread) {
        return createThread(userId);
    }

    // Check if thread expired
    if (Date.now() - thread.lastActivity > THREAD_TIMEOUT) {
        conversationThreads.delete(userId);
        return createThread(userId);
    }

    return thread;
}

/**
 * Create new conversation thread
 */
function createThread(userId) {
    const thread = {
        userId,
        messages: [],
        lastActivity: Date.now(),
        messageCount: 0
    };

    conversationThreads.set(userId, thread);
    logger.debug('New conversation thread created', { userId });

    return thread;
}

/**
 * Add message to conversation thread
 */
function addToThread(userId, role, content, hasImage = false) {
    const thread = getThread(userId);

    thread.messages.push({
        role,
        content,
        timestamp: new Date().toISOString(),
        hasImage
    });

    thread.lastActivity = Date.now();
    thread.messageCount++;

    // Keep only last N messages
    if (thread.messages.length > MAX_HISTORY_LENGTH) {
        thread.messages = thread.messages.slice(-MAX_HISTORY_LENGTH);
    }

    return thread;
}

/**
 * Get conversation history for API
 */
function getThreadHistory(userId) {
    const thread = getThread(userId);
    return thread.messages;
}

/**
 * Format thread for AI context
 */
function formatThreadForAI(userId) {
    const thread = getThread(userId);

    if (thread.messages.length === 0) {
        return '';
    }

    const recent = thread.messages.slice(-5); // Last 5 messages
    const formatted = recent
        .map(msg => `${msg.role === 'user' ? 'User' : 'Bot'}: ${msg.content.substring(0, 100)}...`)
        .join('\n');

    return `Recent conversation:\n${formatted}`;
}

/**
 * Clear conversation thread
 */
function clearThread(userId) {
    conversationThreads.delete(userId);
    logger.debug('Conversation thread cleared', { userId });
}

/**
 * Get thread stats
 */
function getThreadStats(userId) {
    const thread = getThread(userId);
    return {
        messageCount: thread.messageCount,
        lastActivity: thread.lastActivity,
        messagesInThread: thread.messages.length
    };
}

/**
 * Clean up expired threads (call periodically)
 */
function cleanupExpiredThreads() {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, thread] of conversationThreads.entries()) {
        if (now - thread.lastActivity > THREAD_TIMEOUT) {
            conversationThreads.delete(userId);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.debug('Cleaned up expired threads', { count: cleaned });
    }

    return cleaned;
}

// Start cleanup interval (every 5 minutes)
setInterval(cleanupExpiredThreads, 5 * 60 * 1000);

module.exports = {
    getThread,
    addToThread,
    getThreadHistory,
    formatThreadForAI,
    clearThread,
    getThreadStats,
    cleanupExpiredThreads
};
