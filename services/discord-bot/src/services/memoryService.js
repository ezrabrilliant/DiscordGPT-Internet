/**
 * Memory Service
 * Manage user profiles, memories, and statistics
 */

const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../middleware');

const DATA_DIR = path.join(process.cwd(), 'data', 'conversations');
const USER_DATA_FILE = (userId) => path.join(DATA_DIR, `user_${userId}.json`);

// In-memory cache for active users
const memoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        logger.error('Failed to create data directory', { error: error.message });
    }
}

/**
 * Get user data from cache or file
 */
async function getUserData(userId) {
    try {
        // Check cache first
        const cached = memoryCache.get(userId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }

        // Read from file
        const filePath = USER_DATA_FILE(userId);
        const data = await fs.readFile(filePath, 'utf-8');
        const userData = JSON.parse(data);

        // Update cache
        memoryCache.set(userId, {
            data: userData,
            timestamp: Date.now()
        });

        return userData;
    } catch (error) {
        // File doesn't exist, create new user
        if (error.code === 'ENOENT') {
            return createNewUser(userId);
        }
        logger.error('Failed to read user data', { userId, error: error.message });
        return createNewUser(userId);
    }
}

/**
 * Create new user profile
 */
function createNewUser(userId) {
    return {
        userId,
        profile: {
            name: null,
            age: null,
            location: null,
            hobbies: [],
            preferences: {}
        },
        conversations: [],
        stats: {
            totalMessages: 0,
            withImages: 0,
            lastSeen: null,
            topTopics: [],
            averageMood: 'neutral'
        },
        lastUpdated: new Date().toISOString()
    };
}

/**
 * Save user data to file and cache
 */
async function saveUserData(userId, userData) {
    try {
        await ensureDataDir();

        userData.lastUpdated = new Date().toISOString();
        userData.stats.lastSeen = new Date().toISOString();

        const filePath = USER_DATA_FILE(userId);
        await fs.writeFile(filePath, JSON.stringify(userData, null, 2));

        // Update cache
        memoryCache.set(userId, {
            data: userData,
            timestamp: Date.now()
        });

        logger.debug('User data saved', { userId });
    } catch (error) {
        logger.error('Failed to save user data', { userId, error: error.message });
    }
}

/**
 * Add conversation to user history
 */
async function addConversation(userId, username, query, reply, hasImage = false, mood = 'neutral') {
    try {
        const userData = await getUserData(userId);

        // Ensure stats object exists
        if (!userData.stats) {
            userData.stats = {
                totalMessages: 0,
                withImages: 0,
                lastSeen: null,
                topTopics: [],
                averageMood: 'neutral'
            };
        }

        // Add conversation
        userData.conversations.push({
            timestamp: new Date().toISOString(),
            query,
            reply,
            hasImage,
            mood
        });

        // Keep only last 100 conversations
        if (userData.conversations.length > 100) {
            userData.conversations = userData.conversations.slice(-100);
        }

        // Update stats
        userData.stats.totalMessages = (userData.stats.totalMessages || 0) + 1;
        if (hasImage) userData.stats.withImages = (userData.stats.withImages || 0) + 1;

        // Save
        await saveUserData(userId, userData);

        return userData;
    } catch (error) {
        logger.error('Failed to add conversation', { userId, error: error.message });
    }
}

/**
 * Update user profile with extracted information
 */
async function updateProfile(userId, updates) {
    try {
        const userData = await getUserData(userId);

        // Merge profile updates
        Object.assign(userData.profile, updates);

        // Save
        await saveUserData(userId, userData);

        logger.debug('Profile updated', { userId, updates });
        return userData;
    } catch (error) {
        logger.error('Failed to update profile', { userId, error: error.message });
    }
}

/**
 * Get user stats
 */
async function getUserStats(userId) {
    try {
        const userData = await getUserData(userId);
        return userData.stats;
    } catch (error) {
        logger.error('Failed to get user stats', { userId, error: error.message });
        return null;
    }
}

/**
 * Get user profile
 */
async function getUserProfile(userId) {
    try {
        const userData = await getUserData(userId);
        return userData.profile;
    } catch (error) {
        logger.error('Failed to get user profile', { userId, error: error.message });
        return null;
    }
}

/**
 * Get recent conversations
 */
async function getRecentConversations(userId, limit = 10) {
    try {
        const userData = await getUserData(userId);
        return userData.conversations.slice(-limit);
    } catch (error) {
        logger.error('Failed to get recent conversations', { userId, error: error.message });
        return [];
    }
}

/**
 * Format user profile for context
 */
async function formatProfileForContext(userId) {
    try {
        const profile = await getUserProfile(userId);
        if (!profile) return '';

        const parts = [];
        if (profile.name) parts.push(`nama: ${profile.name}`);
        if (profile.age) parts.push(`umur: ${profile.age} tahun`);
        if (profile.location) parts.push(`lokasi: ${profile.location}`);
        if (profile.hobbies.length > 0) parts.push(`hobi: ${profile.hobbies.join(', ')}`);

        return parts.length > 0 ? `User info: ${parts.join(', ')}` : '';
    } catch (error) {
        return '';
    }
}

/**
 * Search user's conversation history
 */
async function searchUserHistory(userId, keyword, limit = 5) {
    try {
        const userData = await getUserData(userId);
        const keywordLower = keyword.toLowerCase();

        const matches = userData.conversations
            .filter(conv =>
                conv.query.toLowerCase().includes(keywordLower) ||
                conv.reply.toLowerCase().includes(keywordLower)
            )
            .slice(-limit);

        return matches;
    } catch (error) {
        logger.error('Failed to search user history', { userId, error: error.message });
        return [];
    }
}

/**
 * Clear cache for specific user
 */
function clearUserCache(userId) {
    memoryCache.delete(userId);
}

/**
 * Clear all cache (use sparingly)
 */
function clearAllCache() {
    memoryCache.clear();
}

module.exports = {
    getUserData,
    saveUserData,
    addConversation,
    updateProfile,
    getUserStats,
    getUserProfile,
    getRecentConversations,
    formatProfileForContext,
    searchUserHistory,
    clearUserCache,
    clearAllCache
};
