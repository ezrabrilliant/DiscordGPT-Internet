/**
 * Log Data Cleaner v2 - Smart Matching
 * 
 * Strategy:
 * 1. First pass: Build user mapping from "Added to conversation log" lines
 * 2. Second pass: Match [User:] entries with mapping by timestamp proximity
 * 3. Output clean JSON format
 */

const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, 'messages-backup.log');
const OUTPUT_FILE = path.join(__dirname, 'messages-cleaned.log');
const USER_MAP_FILE = path.join(__dirname, 'user-mapping.json');
const UNMATCHED_FILE = path.join(__dirname, 'messages-unmatched.log');

// Stats
let stats = {
    totalLines: 0,
    addedLines: 0,
    conversationLines: 0,
    matched: 0,
    unmatched: 0,
    newFormatKept: 0
};

// Store unmatched for investigation
const unmatchedEntries = [];

/**
 * Parse timestamp from line
 */
function parseTimestamp(line) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/);
    return match ? match[1] : null;
}

/**
 * Parse "Added to conversation log" line
 */
function parseAddedLine(content) {
    const match = content.match(/Added to conversation log for server (\d+), user (\d+)/i);
    if (match) {
        return { server: match[1], user: match[2] };
    }
    return null;
}

/**
 * Parse conversation line [User: @xxx]
 */
function parseConversationLine(content) {
    try {
        let text = content;
        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
        }
        text = text.replace(/\\n/g, '\n');
        
        // Extract username - [User: @username] or [User: username]
        const userMatch = text.match(/\[User:\s*@?([^\]]+)\]/i);
        const username = userMatch ? userMatch[1].trim() : null;
        
        // Extract query
        const queryMatch = text.match(/\[Query:\s*([\s\S]*?)\],\s*\n?\s*\[/i);
        let query = queryMatch ? queryMatch[1].trim() : '';
        
        // Extract reply
        const replyMatch = text.match(/\[reply:\s*([\s\S]*?)(?:\]\s*$|\n\n)/i);
        let reply = replyMatch ? replyMatch[1].trim() : '';
        reply = reply.replace(/\]\s*$/, '').trim();
        
        // Check for Google result (remove it from query)
        const googleMatch = text.match(/\[Google result:\s*([\s\S]*?)\],\s*\n?\s*\[reply/i);
        if (googleMatch) {
            // Re-extract query without Google result
            const cleanQueryMatch = text.match(/\[Query:\s*([^\]]*)\]/i);
            query = cleanQueryMatch ? cleanQueryMatch[1].trim() : query;
        }
        
        if (username) {
            return { username, query, reply };
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Check if line is new JSON format
 */
function parseNewJsonFormat(line) {
    try {
        const match = line.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*-\s*(\{.+\})$/);
        if (match) {
            const json = JSON.parse(match[1]);
            if (json.timestamp && json.user && json.query !== undefined) {
                return json;
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Main processing
 */
async function cleanLogs() {
    console.log('📋 Log Data Cleaner v2 - Smart Matching');
    console.log('='.repeat(50));
    
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('❌ Input file not found!');
        process.exit(1);
    }

    const content = fs.readFileSync(INPUT_FILE, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    stats.totalLines = lines.length;
    console.log(`📖 Total lines: ${lines.length}`);

    // ==========================================
    // PASS 1: Build timestamp -> server/user mapping
    // ==========================================
    console.log('\n🔍 Pass 1: Building user mapping from "Added" lines...');
    
    const timestampToMeta = new Map(); // timestamp -> {server, user}
    const userMapping = new Map(); // username -> [{server, user}]
    
    for (const line of lines) {
        const timestamp = parseTimestamp(line);
        if (!timestamp) continue;
        
        const contentMatch = line.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*-\s*(.+)$/);
        if (!contentMatch) continue;
        
        const content = contentMatch[1];
        
        if (content.includes('Added to conversation log')) {
            const meta = parseAddedLine(content);
            if (meta) {
                // Store by exact timestamp
                timestampToMeta.set(timestamp, meta);
                stats.addedLines++;
            }
        }
    }
    
    console.log(`   Found ${stats.addedLines} "Added" lines with server/user info`);

    // ==========================================
    // PASS 2: Match conversations with metadata
    // ==========================================
    console.log('\n🔄 Pass 2: Matching conversations...');
    
    const cleanedEntries = [];
    
    for (const line of lines) {
        // Check if already new JSON format
        const newJson = parseNewJsonFormat(line);
        if (newJson) {
            cleanedEntries.push(newJson);
            stats.newFormatKept++;
            continue;
        }
        
        const timestamp = parseTimestamp(line);
        if (!timestamp) continue;
        
        const contentMatch = line.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*-\s*(.+)$/);
        if (!contentMatch) continue;
        
        const content = contentMatch[1];
        
        // Skip non-conversation lines
        if (content.includes('Added to conversation log')) continue;
        if (content.includes('Cleared conversation log')) continue;
        
        // Check if it's a conversation line
        if (content.includes('[User:') && content.includes('[Query:')) {
            stats.conversationLines++;
            
            const conv = parseConversationLine(content);
            if (!conv) continue;
            
            // Find matching metadata by timestamp (same second or within 1ms)
            let meta = timestampToMeta.get(timestamp);
            
            // If not exact match, try timestamps within 1 second
            if (!meta) {
                const baseTime = new Date(timestamp).getTime();
                for (const [ts, m] of timestampToMeta) {
                    const diff = Math.abs(new Date(ts).getTime() - baseTime);
                    if (diff <= 1000) { // within 1 second
                        meta = m;
                        break;
                    }
                }
            }
            
            if (meta) {
                // Build user mapping for reference
                if (!userMapping.has(conv.username)) {
                    userMapping.set(conv.username, new Set());
                }
                userMapping.get(conv.username).add(JSON.stringify(meta));
                
                const entry = {
                    timestamp: timestamp,
                    server: meta.server,
                    user: meta.user,
                    username: conv.username,
                    query: conv.query,
                    reply: conv.reply,
                    provider: 'unknown'
                };
                cleanedEntries.push(entry);
                stats.matched++;
            } else {
                // Save unmatched for investigation
                unmatchedEntries.push({
                    timestamp: timestamp,
                    line: line,
                    parsed: conv
                });
                stats.unmatched++;
            }
        }
    }

    // ==========================================
    // Save user mapping for reference
    // ==========================================
    console.log('\n💾 Saving user mapping...');
    
    const userMapOutput = {};
    for (const [username, metaSet] of userMapping) {
        userMapOutput[username] = Array.from(metaSet).map(s => JSON.parse(s));
    }
    fs.writeFileSync(USER_MAP_FILE, JSON.stringify(userMapOutput, null, 2));
    console.log(`   Saved ${userMapping.size} unique usernames to ${USER_MAP_FILE}`);

    // ==========================================
    // Save unmatched entries for investigation
    // ==========================================
    if (unmatchedEntries.length > 0) {
        console.log('\n⚠️  Saving unmatched entries...');
        const unmatchedOutput = unmatchedEntries.map(e => 
            `${e.timestamp} - ${JSON.stringify(e.parsed)} | ORIGINAL: ${e.line.substring(0, 200)}...`
        ).join('\n');
        fs.writeFileSync(UNMATCHED_FILE, unmatchedOutput + '\n');
        console.log(`   Saved ${unmatchedEntries.length} unmatched to ${UNMATCHED_FILE}`);
    }

    // ==========================================
    // Sort and write output
    // ==========================================
    console.log('\n📊 Sorting by timestamp...');
    cleanedEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log('\n💾 Writing cleaned log...');
    const output = cleanedEntries.map(entry => {
        const jsonStr = JSON.stringify(entry);
        return `${entry.timestamp} - ${jsonStr}`;
    }).join('\n');
    
    fs.writeFileSync(OUTPUT_FILE, output + '\n');

    // ==========================================
    // Stats
    // ==========================================
    console.log('\n' + '='.repeat(50));
    console.log('📈 Statistics:');
    console.log(`   Total lines:        ${stats.totalLines}`);
    console.log(`   "Added" lines:      ${stats.addedLines}`);
    console.log(`   Conversation lines: ${stats.conversationLines}`);
    console.log(`   ✅ Matched:         ${stats.matched}`);
    console.log(`   ❌ Unmatched:       ${stats.unmatched}`);
    console.log(`   New format kept:    ${stats.newFormatKept}`);
    console.log(`   Total clean:        ${cleanedEntries.length}`);
    console.log('');
    console.log(`✅ Output: ${OUTPUT_FILE}`);
    console.log(`📋 User map: ${USER_MAP_FILE}`);

    // Show sample
    console.log('\n📋 Sample entries:');
    cleanedEntries.slice(0, 3).forEach((e, i) => {
        console.log(`   [${i+1}] ${e.username} (${e.user}) @ server ${e.server}`);
        console.log(`       Query: ${e.query.substring(0, 40)}...`);
    });

    // Show unmatched rate
    const matchRate = (stats.matched / stats.conversationLines * 100).toFixed(1);
    console.log(`\n📊 Match rate: ${matchRate}%`);
    
    if (stats.unmatched > 0) {
        console.log(`\n⚠️  ${stats.unmatched} conversations could not be matched.`);
        console.log('   These are likely orphan entries without "Added" lines nearby.');
    }
}

cleanLogs().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
