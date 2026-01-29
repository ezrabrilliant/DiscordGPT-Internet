/**
 * Gemini Client Service
 * Handles embedding using Google Gemini API
 */

const { logger } = require('../middleware');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;

/**
 * Generate embedding for text using Gemini API
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function embed(text) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    try {
        const response = await fetch(`${EMBEDDING_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${EMBEDDING_MODEL}`,
                content: { parts: [{ text }] }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.embedding.values;
    } catch (error) {
        logger.error('Gemini embedding failed', { error: error.message });
        throw error;
    }
}

/**
 * Batch embed multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function embedBatch(texts) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const results = [];
    // Process in batches of 100 (API limit)
    const batchSize = 100;

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const embeddings = await Promise.all(batch.map(text => embed(text)));
        results.push(...embeddings);

        // Small delay between batches
        if (i + batchSize < texts.length) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return results;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if Gemini API is available
 */
async function isAvailable() {
    if (!GEMINI_API_KEY) return false;

    try {
        // Quick test with minimal text
        await embed('test');
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    embed,
    embedBatch,
    cosineSimilarity,
    isAvailable,
    GEMINI_API_KEY: !!GEMINI_API_KEY
};
