/**
 * Page Cache Service
 * Stores paginated embed data for navigation buttons
 */

const pageCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Store pages for a message
 */
function setPages(messageId, data) {
    pageCache.set(messageId, {
        ...data,
        expiresAt: Date.now() + CACHE_TTL
    });
    
    // Auto cleanup after TTL
    setTimeout(() => {
        pageCache.delete(messageId);
    }, CACHE_TTL);
}

/**
 * Get pages for a message
 */
function getPages(messageId) {
    const data = pageCache.get(messageId);
    
    if (!data) return null;
    
    // Check if expired
    if (Date.now() > data.expiresAt) {
        pageCache.delete(messageId);
        return null;
    }
    
    return data;
}

/**
 * Clear pages for a message
 */
function clearPages(messageId) {
    pageCache.delete(messageId);
}

/**
 * Get cache stats
 */
function getStats() {
    return {
        size: pageCache.size,
        entries: Array.from(pageCache.entries()).map(([id, data]) => ({
            messageId: id,
            userId: data.userId,
            totalPages: data.totalPages,
            expiresIn: Math.max(0, data.expiresAt - Date.now())
        }))
    };
}

module.exports = {
    setPages,
    getPages,
    clearPages,
    getStats
};
