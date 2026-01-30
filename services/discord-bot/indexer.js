/**
 * Knowledge Base & Conversation Indexer
 * Uses official @google/genai SDK for embeddings
 * Run: node indexer.js
 */

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

// Check for Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('ERROR: GEMINI_API_KEY not set in .env');
    process.exit(1);
}

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const EMBEDDING_MODEL = 'gemini-embedding-001';

// Paths
const KNOWLEDGE_DIR = path.join(__dirname, '../../data/knowledge');
const CONVERSATIONS_DIR = path.join(__dirname, 'data/conversations');
const EMBEDDINGS_DIR = path.join(__dirname, 'data/embeddings');

// Rate limiting
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 1000;

/**
 * Generate embedding for document
 */
async function embedDocument(text) {
    const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text.slice(0, 10000),
        taskType: 'RETRIEVAL_DOCUMENT'
    });
    return response.embeddings[0].values;
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
 * Index knowledge base folder
 */
async function indexKnowledgeBase(kbName) {
    const kbPath = path.join(KNOWLEDGE_DIR, kbName);

    if (!fs.existsSync(kbPath)) {
        console.log(`  [SKIP] ${kbName} - folder not found`);
        return null;
    }

    const files = fs.readdirSync(kbPath).filter(f => f.endsWith('.txt'));
    if (files.length === 0) {
        console.log(`  [SKIP] ${kbName} - no .txt files`);
        return null;
    }

    console.log(`  [INDEX] ${kbName} - ${files.length} files`);

    const allChunks = [];

    for (const file of files) {
        const content = fs.readFileSync(path.join(kbPath, file), 'utf8');
        const chunks = chunkText(content);

        for (const chunk of chunks) {
            allChunks.push({
                content: chunk,
                source: file,
                knowledgeBase: kbName
            });
        }
        console.log(`    - ${file}: ${chunks.length} chunks`);
    }

    console.log(`    Embedding ${allChunks.length} chunks with ${EMBEDDING_MODEL}...`);

    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
        const batch = allChunks.slice(i, i + BATCH_SIZE);

        for (const chunk of batch) {
            try {
                chunk.embedding = await embedDocument(chunk.content);
            } catch (error) {
                console.error(`    Error: ${error.message}`);
                chunk.embedding = null;
            }
        }

        if (i + BATCH_SIZE < allChunks.length) {
            process.stdout.write(`    Progress: ${Math.min(i + BATCH_SIZE, allChunks.length)}/${allChunks.length}\r`);
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
        }
    }

    const successfulChunks = allChunks.filter(c => c.embedding);
    console.log(`    Done: ${successfulChunks.length}/${allChunks.length} chunks embedded`);

    return {
        chunks: successfulChunks,
        lastIndexed: new Date().toISOString(),
        model: EMBEDDING_MODEL
    };
}

/**
 * Index conversation history
 */
async function indexConversations(maxConversations = 5000) {
    const conversationsFile = path.join(CONVERSATIONS_DIR, 'all_conversations.json');

    if (!fs.existsSync(conversationsFile)) {
        console.log(`  [SKIP] conversations - file not found`);
        return null;
    }

    console.log(`  [INDEX] conversations - loading...`);
    const data = JSON.parse(fs.readFileSync(conversationsFile, 'utf8'));

    let conversations = data.conversations;
    if (conversations.length > maxConversations) {
        console.log(`    Sampling ${maxConversations} from ${conversations.length}`);
        conversations = conversations.slice(-maxConversations);
    }

    console.log(`    Embedding ${conversations.length} with ${EMBEDDING_MODEL}...`);

    const chunks = [];

    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
        const batch = conversations.slice(i, i + BATCH_SIZE);

        for (const conv of batch) {
            try {
                const embedding = await embedDocument(conv.content);
                chunks.push({
                    content: conv.content,
                    source: 'chromadb',
                    userId: conv.username,
                    timestamp: conv.timestamp,
                    embedding
                });
            } catch (error) {
                // Skip failed
            }
        }

        process.stdout.write(`    Progress: ${Math.min(i + BATCH_SIZE, conversations.length)}/${conversations.length}\r`);
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES));
    }

    console.log(`\n    Done: ${chunks.length} conversations embedded`);

    return {
        chunks,
        lastIndexed: new Date().toISOString(),
        model: EMBEDDING_MODEL
    };
}

/**
 * Save index to disk
 */
function saveIndex(name, data) {
    if (!fs.existsSync(EMBEDDINGS_DIR)) {
        fs.mkdirSync(EMBEDDINGS_DIR, { recursive: true });
    }
    const filePath = path.join(EMBEDDINGS_DIR, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`  [SAVED] ${filePath}`);
}

/**
 * Main indexer
 */
async function main() {
    console.log('='.repeat(60));
    console.log('  Ezra Bot - Knowledge Base Indexer');
    console.log('  Using @google/genai SDK');
    console.log('='.repeat(60));
    console.log(`\nModel: ${EMBEDDING_MODEL}`);
    console.log(`TaskType: RETRIEVAL_DOCUMENT\n`);

    // Index knowledge bases
    console.log('[1/2] Indexing Knowledge Bases...');
    const knowledgeBases = ['gtid', 'musless', 'general'];

    for (const kb of knowledgeBases) {
        const result = await indexKnowledgeBase(kb);
        if (result) {
            saveIndex(kb, result);
        }
    }

    // Index conversations
    console.log('\n[2/2] Indexing Conversations...');
    const convResult = await indexConversations(5000);
    if (convResult) {
        saveIndex('conversations', convResult);
    }

    console.log('\n' + '='.repeat(60));
    console.log('  Indexing Complete!');
    console.log('='.repeat(60));

    const files = fs.readdirSync(EMBEDDINGS_DIR).filter(f => f.endsWith('.json'));
    console.log('\nIndex files:');
    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(EMBEDDINGS_DIR, file), 'utf8'));
        console.log(`  - ${file}: ${data.chunks?.length || 0} chunks (${data.model || 'unknown'})`);
    }
}

main().catch(console.error);
