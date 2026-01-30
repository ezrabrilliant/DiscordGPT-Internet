/**
 * Gemini Client Service
 * Uses official @google/genai SDK for text embeddings
 * Model: gemini-embedding-001
 */

const { GoogleGenAI } = require('@google/genai');
const { logger } = require('../middleware');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const EMBEDDING_MODEL = 'gemini-embedding-001';

// Initialize client
let ai = null;
if (GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

/**
 * Generate embedding for text (for search queries)
 * Uses RETRIEVAL_QUERY taskType for better search results
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function embed(text) {
    if (!ai) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    try {
        const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
            taskType: 'RETRIEVAL_QUERY'
        });

        return response.embeddings[0].values;
    } catch (error) {
        logger.error('Gemini embedding failed', { error: error.message });
        throw error;
    }
}

/**
 * Generate embedding for document content
 * Uses RETRIEVAL_DOCUMENT taskType for indexing
 * @param {string} text - Document text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function embedDocument(text) {
    if (!ai) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    try {
        const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text.slice(0, 10000), // Max 10k chars
            taskType: 'RETRIEVAL_DOCUMENT'
        });

        return response.embeddings[0].values;
    } catch (error) {
        logger.error('Gemini document embedding failed', { error: error.message });
        throw error;
    }
}

/**
 * Batch embed multiple documents
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
async function embedBatch(texts) {
    if (!ai) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    try {
        const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: texts.map(t => t.slice(0, 10000)),
            taskType: 'RETRIEVAL_DOCUMENT'
        });

        return response.embeddings.map(e => e.values);
    } catch (error) {
        logger.error('Gemini batch embedding failed', { error: error.message });
        throw error;
    }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Check if Gemini API is available
 */
async function isAvailable() {
    if (!ai) return false;

    try {
        await embed('test');
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    embed,
    embedDocument,
    embedBatch,
    cosineSimilarity,
    isAvailable,
    GEMINI_API_KEY: !!GEMINI_API_KEY
};
