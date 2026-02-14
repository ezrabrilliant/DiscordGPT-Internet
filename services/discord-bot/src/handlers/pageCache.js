/**
 * Page Cache Service - MongoDB backed with in-memory fallback
 * Stores paginated embed data for navigation buttons
 */

const { MongoClient } = require('mongodb');
const { MONGO_URI } = require('../config/env');

// In-memory fallback (used when MongoDB is not available)
const memoryPageCache = new Map();
const memoryQueryCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// MongoDB
let db = null;

/**
 * Connect to MongoDB
 */
async function connectMongo() {
    if (!MONGO_URI) {
        console.log('[PageCache] No MONGO_URI, using in-memory cache only');
        return;
    }

    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db('ezrabot'); // separate database from modchecker

        // Create indexes
        await db.collection('pagecache').createIndex({ messageId: 1 }, { unique: true });
        await db.collection('pagecache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
        await db.collection('querycache').createIndex({ userId: 1 }, { unique: true });
        await db.collection('querycache').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

        console.log('[PageCache] MongoDB connected (database: ezrabot)');
    } catch (err) {
        console.error('[PageCache] MongoDB connection failed, using in-memory fallback:', err.message);
        db = null;
    }
}

/**
 * Store pages for a message
 */
async function setPages(messageId, data) {
    const expiresAt = new Date(Date.now() + CACHE_TTL);

    // Always store in memory for fast access
    memoryPageCache.set(messageId, {
        ...data,
        expiresAt: Date.now() + CACHE_TTL
    });

    // Auto cleanup memory after TTL
    setTimeout(() => {
        memoryPageCache.delete(messageId);
    }, CACHE_TTL);

    // Also persist to MongoDB
    if (db) {
        try {
            await db.collection('pagecache').updateOne(
                { messageId },
                { $set: { messageId, ...data, expiresAt } },
                { upsert: true }
            );
        } catch (err) {
            console.error('[PageCache] MongoDB setPages error:', err.message);
        }
    }
}

/**
 * Store user query for button interactions
 */
async function setQuery(userId, query) {
    const expiresAt = new Date(Date.now() + CACHE_TTL);

    // Memory
    memoryQueryCache.set(userId, {
        query,
        expiresAt: Date.now() + CACHE_TTL
    });

    setTimeout(() => {
        memoryQueryCache.delete(userId);
    }, CACHE_TTL);

    // MongoDB
    if (db) {
        try {
            await db.collection('querycache').updateOne(
                { userId },
                { $set: { userId, query, expiresAt } },
                { upsert: true }
            );
        } catch (err) {
            console.error('[PageCache] MongoDB setQuery error:', err.message);
        }
    }
}

/**
 * Get user query
 */
async function getQuery(userId) {
    // Try memory first
    const memData = memoryQueryCache.get(userId);
    if (memData) {
        if (Date.now() > memData.expiresAt) {
            memoryQueryCache.delete(userId);
        } else {
            return memData.query;
        }
    }

    // Fallback to MongoDB
    if (db) {
        try {
            const doc = await db.collection('querycache').findOne({ userId });
            if (doc) {
                // Re-populate memory cache
                memoryQueryCache.set(userId, {
                    query: doc.query,
                    expiresAt: doc.expiresAt.getTime()
                });
                return doc.query;
            }
        } catch (err) {
            console.error('[PageCache] MongoDB getQuery error:', err.message);
        }
    }

    return null;
}

/**
 * Get pages for a message
 */
async function getPages(messageId) {
    // Try memory first
    const memData = memoryPageCache.get(messageId);
    if (memData) {
        if (Date.now() > memData.expiresAt) {
            memoryPageCache.delete(messageId);
        } else {
            return memData;
        }
    }

    // Fallback to MongoDB
    if (db) {
        try {
            const doc = await db.collection('pagecache').findOne({ messageId });
            if (doc) {
                // Remove MongoDB internal fields
                delete doc._id;
                // Re-populate memory cache
                const cacheData = {
                    ...doc,
                    expiresAt: doc.expiresAt.getTime()
                };
                memoryPageCache.set(messageId, cacheData);
                return cacheData;
            }
        } catch (err) {
            console.error('[PageCache] MongoDB getPages error:', err.message);
        }
    }

    return null;
}

/**
 * Clear pages for a message
 */
async function clearPages(messageId) {
    memoryPageCache.delete(messageId);

    if (db) {
        try {
            await db.collection('pagecache').deleteOne({ messageId });
        } catch (err) {
            console.error('[PageCache] MongoDB clearPages error:', err.message);
        }
    }
}

/**
 * Get cache stats
 */
function getStats() {
    return {
        pageCache: memoryPageCache.size,
        queryCache: memoryQueryCache.size,
        mongoConnected: !!db,
        entries: Array.from(memoryPageCache.entries()).map(([id, data]) => ({
            messageId: id,
            userId: data.userId,
            totalPages: data.totalPages,
            expiresIn: Math.max(0, data.expiresAt - Date.now())
        }))
    };
}

module.exports = {
    connectMongo,
    setPages,
    setQuery,
    getQuery,
    getPages,
    clearPages,
    getStats
};
