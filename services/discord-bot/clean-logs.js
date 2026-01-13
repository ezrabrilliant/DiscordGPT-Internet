/**
 * Log Data Cleaner
 * Converts old messy log format to clean JSON format
 * 
 * Old format (2 separate lines):
 *   2026-01-12T06:01:55.228Z - "[User: @sminem6744],\n [Query: ...],\n [reply: ...]\n\n"
 *   2026-01-12T06:01:55.228Z - "Added to conversation log for server 1016684763752452166, user 543797099561615360:"
 * 
 * New format (single JSON line):
 *   {"timestamp":"...","server":"...","user":"...","username":"...","query":"...","reply":"...","provider":"unknown"}
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const INPUT_FILE = path.join(__dirname, 'messages.log');
const OUTPUT_FILE = path.join(__dirname, 'messages-cleaned.log');
const BACKUP_FILE = path.join(__dirname, 'messages-backup.log');

// Stats
let stats = {
    totalLines: 0,
    oldFormatConverted: 0,
    newFormatKept: 0,
    skippedLines: 0,
    errors: 0
};

/**
 * Parse old format conversation line
 * Format: "[User: @username],\n [Query: ...],\n [reply: ...]\n\n"
 */
function parseOldConversation(content) {
    try {
        // Remove outer quotes and unescape
        let text = content;
        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
        }
        
        // Handle escaped newlines
        text = text.replace(/\\n/g, '\n');
        
        // Extract username - [User: @username] or [User: username]
        const userMatch = text.match(/\[User:\s*@?([^\]]+)\]/i);
        const username = userMatch ? userMatch[1].trim() : null;
        
        // Extract query - [Query: ...]
        const queryMatch = text.match(/\[Query:\s*([^\]]*(?:\[[^\]]*\][^\]]*)*)\]/i);
        let query = queryMatch ? queryMatch[1].trim() : null;
        
        // Extract reply - [reply: ...] (case insensitive, may have content until end)
        const replyMatch = text.match(/\[reply:\s*([\s\S]*?)(?:\]\s*$|\n\n)/i);
        let reply = replyMatch ? replyMatch[1].trim() : null;
        
        // Clean up reply - remove trailing brackets and whitespace
        if (reply) {
            reply = reply.replace(/\]\s*$/, '').trim();
        }
        
        if (username && query !== null) {
            return { username, query, reply: reply || '' };
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Parse "Added to conversation log" line
 * Format: "Added to conversation log for server XXXXX, user YYYYY:"
 */
function parseAddedLine(content) {
    const match = content.match(/Added to conversation log for server (\d+), user (\d+)/i);
    if (match) {
        return {
            server: match[1],
            user: match[2]
        };
    }
    return null;
}

/**
 * Check if line is already in new JSON format
 */
function isNewJsonFormat(line) {
    try {
        // Check if it starts with timestamp and contains JSON
        const match = line.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*-\s*(\{.+\})$/);
        if (match) {
            const json = JSON.parse(match[1]);
            return json.timestamp && json.user && json.query !== undefined;
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Extract JSON from new format line
 */
function extractNewFormat(line) {
    const match = line.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*-\s*(\{.+\})$/);
    if (match) {
        try {
            return JSON.parse(match[1]);
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Main processing function
 */
async function cleanLogs() {
    console.log('📋 Log Data Cleaner');
    console.log('='.repeat(50));
    console.log(`📂 Input:  ${INPUT_FILE}`);
    console.log(`📂 Output: ${OUTPUT_FILE}`);
    console.log('');

    // Check if input exists
    if (!fs.existsSync(INPUT_FILE)) {
        console.error('❌ Input file not found!');
        process.exit(1);
    }

    // Create backup
    console.log('💾 Creating backup...');
    fs.copyFileSync(INPUT_FILE, BACKUP_FILE);
    console.log(`   ✅ Backup saved to ${BACKUP_FILE}`);

    // Read all lines
    console.log('\n📖 Reading log file...');
    const content = fs.readFileSync(INPUT_FILE, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    stats.totalLines = lines.length;
    console.log(`   Found ${lines.length} lines`);

    // Process lines
    console.log('\n🔄 Processing...');
    const cleanedEntries = [];
    let pendingConversation = null;
    let pendingTimestamp = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Check if already new JSON format
        if (isNewJsonFormat(line)) {
            const json = extractNewFormat(line);
            if (json) {
                cleanedEntries.push(json);
                stats.newFormatKept++;
            }
            pendingConversation = null;
            continue;
        }

        // Parse timestamp and content
        const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s*-\s*(.+)$/);
        if (!timestampMatch) {
            stats.skippedLines++;
            continue;
        }

        const timestamp = timestampMatch[1];
        const content = timestampMatch[2];

        // Check if it's a conversation line [User: @xxx]
        if (content.includes('[User:') && content.includes('[Query:')) {
            const parsed = parseOldConversation(content);
            if (parsed) {
                pendingConversation = parsed;
                pendingTimestamp = timestamp;
            }
            continue;
        }

        // Check if it's "Added to conversation log" line
        if (content.includes('Added to conversation log')) {
            const serverUser = parseAddedLine(content);
            
            if (serverUser && pendingConversation) {
                // Combine with pending conversation
                const entry = {
                    timestamp: pendingTimestamp,
                    server: serverUser.server,
                    user: serverUser.user,
                    username: pendingConversation.username,
                    query: pendingConversation.query,
                    reply: pendingConversation.reply,
                    provider: 'unknown'  // Old logs don't have provider info
                };
                cleanedEntries.push(entry);
                stats.oldFormatConverted++;
                pendingConversation = null;
            }
            continue;
        }

        // Check for "Cleared conversation log" - skip these
        if (content.includes('Cleared conversation log')) {
            stats.skippedLines++;
            continue;
        }

        // Unknown format
        stats.skippedLines++;
    }

    // Sort by timestamp
    console.log('\n📊 Sorting by timestamp...');
    cleanedEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Write output
    console.log('\n💾 Writing cleaned log...');
    const output = cleanedEntries.map(entry => {
        const jsonStr = JSON.stringify(entry);
        return `${entry.timestamp} - ${jsonStr}`;
    }).join('\n');
    
    fs.writeFileSync(OUTPUT_FILE, output + '\n');

    // Print stats
    console.log('\n' + '='.repeat(50));
    console.log('📈 Statistics:');
    console.log(`   Total lines processed: ${stats.totalLines}`);
    console.log(`   Old format converted:  ${stats.oldFormatConverted}`);
    console.log(`   New format kept:       ${stats.newFormatKept}`);
    console.log(`   Skipped lines:         ${stats.skippedLines}`);
    console.log(`   Total clean entries:   ${cleanedEntries.length}`);
    console.log('');
    console.log('✅ Done!');
    console.log(`   Output: ${OUTPUT_FILE}`);
    console.log('');
    console.log('📝 To replace original log:');
    console.log('   1. Review messages-cleaned.log');
    console.log('   2. Run: copy messages-cleaned.log messages.log');

    // Show sample entries
    console.log('\n📋 Sample cleaned entries:');
    const samples = cleanedEntries.slice(0, 3);
    samples.forEach((entry, i) => {
        console.log(`\n   [${i + 1}] ${entry.timestamp}`);
        console.log(`       User: ${entry.username} (${entry.user})`);
        console.log(`       Server: ${entry.server}`);
        console.log(`       Query: ${entry.query.substring(0, 50)}...`);
    });
}

// Run
cleanLogs().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
