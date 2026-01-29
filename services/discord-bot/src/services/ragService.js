/**
 * RAG Service
 * Handles knowledge base indexing and similarity search
 * Uses Gemini for embeddings, stores vectors in JSON
 */

const fs = require('fs');
const path = require('path');
const gemini = require('./geminiClient');
const { logger } = require('../middleware');

// Paths
const KNOWLEDGE_DIR = path.join(__dirname, '../../../data/knowledge');
const EMBEDDINGS_DIR = path.join(__dirname, '../../data/embeddings');

// In-memory index (loaded on startup)
let knowledgeIndex = {};

/**
 * Load embeddings from disk
 */
function loadIndex() {
    try {
        if (!fs.existsSync(EMBEDDINGS_DIR)) {
            fs.mkdirSync(EMBEDDINGS_DIR, { recursive: true });
        }

        const files = fs.readdirSync(EMBEDDINGS_DIR);
        for (const file of files) {
            if (file.endsWith('.json')) {
                const knowledgeBase = file.replace('.json', '');
                const data = JSON.parse(fs.readFileSync(path.join(EMBEDDINGS_DIR, file), 'utf8'));
                knowledgeIndex[knowledgeBase] = data;
                logger.debug(`Loaded ${data.chunks?.length || 0} chunks from ${knowledgeBase}`);
            }
        }
        logger.info(`RAG index loaded`, { bases: Object.keys(knowledgeIndex) });
    } catch (error) {
        logger.error('Failed to load RAG index', { error: error.message });
    }
}

/**
 * Save embeddings to disk
 */
function saveIndex(knowledgeBase) {
    try {
        if (!fs.existsSync(EMBEDDINGS_DIR)) {
            fs.mkdirSync(EMBEDDINGS_DIR, { recursive: true });
        }
        const filePath = path.join(EMBEDDINGS_DIR, `${knowledgeBase}.json`);
        fs.writeFileSync(filePath, JSON.stringify(knowledgeIndex[knowledgeBase], null, 2));
        logger.debug(`Saved index for ${knowledgeBase}`);
    } catch (error) {
        logger.error('Failed to save RAG index', { error: error.message });
    }
}

/**
 * Split text into chunks
 */
function chunkText(text, maxChunkSize = 500) {
    const chunks = [];
    const paragraphs = text.split(/\n\n+/);

    let currentChunk = '';
    for (const para of paragraphs) {
        if ((currentChunk + para).length > maxChunkSize && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = para;
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + para;
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

/**
 * Index a knowledge base from .txt files
 * @param {string} knowledgeBase - Name of knowledge base (folder name)
 */
async function indexKnowledgeBase(knowledgeBase) {
    const kbPath = path.join(KNOWLEDGE_DIR, knowledgeBase);

    if (!fs.existsSync(kbPath)) {
        logger.warn(`Knowledge base not found: ${knowledgeBase}`);
        return { indexed: 0 };
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.txt'));
    const allChunks = [];

    // Read and chunk all files
    for (const file of files) {
        const content = fs.readFileSync(path.join(kbPath, file), 'utf8');
        const chunks = chunkText(content);

        for (const chunk of chunks) {
            allChunks.push({
                content: chunk,
                source: file,
                knowledgeBase
            });
        }
    }

    if (allChunks.length === 0) {
        logger.warn(`No content found in ${knowledgeBase}`);
        return { indexed: 0 };
    }

    // Generate embeddings
    logger.info(`Indexing ${allChunks.length} chunks from ${knowledgeBase}...`);
    const texts = allChunks.map(c => c.content);
    const embeddings = await gemini.embedBatch(texts);

    // Store in index
    knowledgeIndex[knowledgeBase] = {
        chunks: allChunks.map((chunk, i) => ({
            ...chunk,
            embedding: embeddings[i]
        })),
        lastIndexed: new Date().toISOString()
    };

    // Save to disk
    saveIndex(knowledgeBase);

    logger.info(`Indexed ${allChunks.length} chunks for ${knowledgeBase}`);
    return { indexed: allChunks.length };
}

/**
 * Search for relevant context
 * @param {string} query - Search query
 * @param {string} knowledgeBase - Knowledge base to search
 * @param {number} k - Number of results
 * @returns {Promise<Array>} - Relevant chunks with scores
 */
async function search(query, knowledgeBase = 'general', k = 5) {
    const index = knowledgeIndex[knowledgeBase];

    if (!index || !index.chunks || index.chunks.length === 0) {
        logger.debug(`No index found for ${knowledgeBase}`);
        return [];
    }

    // Get query embedding
    const queryEmbedding = await gemini.embed(query);

    // Calculate similarities
    const results = index.chunks.map(chunk => ({
        content: chunk.content,
        source: chunk.source,
        score: gemini.cosineSimilarity(queryEmbedding, chunk.embedding)
    }));

    // Sort by similarity and return top k
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
}

/**
 * Get status of all knowledge bases
 */
function getStatus() {
    const status = {};
    for (const [name, data] of Object.entries(knowledgeIndex)) {
        status[name] = {
            chunks: data.chunks?.length || 0,
            lastIndexed: data.lastIndexed
        };
    }
    return status;
}

/**
 * Initialize RAG service
 */
async function initialize() {
    loadIndex();

    // Check if re-indexing is needed
    const knowledgeBases = ['gtid', 'musless', 'general'];

    for (const kb of knowledgeBases) {
        const kbPath = path.join(KNOWLEDGE_DIR, kb);
        if (fs.existsSync(kbPath) && !knowledgeIndex[kb]) {
            logger.info(`Knowledge base ${kb} needs indexing`);
            await indexKnowledgeBase(kb);
        }
    }
}

module.exports = {
    initialize,
    loadIndex,
    indexKnowledgeBase,
    search,
    getStatus
};
