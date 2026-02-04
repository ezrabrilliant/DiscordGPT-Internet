/**
 * Log Console Output to File
 * Redirects console.log and error to files with timestamps
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const CONSOLE_LOG = path.join(LOG_DIR, 'console.log');
const ERROR_LOG = path.join(LOG_DIR, 'error.log');

// Create logs directory if not exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Format timestamp
 */
function getTimestamp() {
    return new Date().toISOString();
}

/**
 * Override console.log
 */
const originalLog = console.log;
console.log = function(...args) {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const logLine = `[${getTimestamp()}] ${message}\n`;
    
    // Print to console
    originalLog(...args);
    
    // Write to file
    fs.appendFile(CONSOLE_LOG, logLine, (err) => {
        if (err) originalLog('Failed to write to console log:', err);
    });
};

/**
 * Override console.error
 */
const originalError = console.error;
console.error = function(...args) {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const logLine = `[${getTimestamp()}] ERROR: ${message}\n`;
    
    // Print to console
    originalError(...args);
    
    // Write to error log
    fs.appendFile(ERROR_LOG, logLine, (err) => {
        if (err) originalLog('Failed to write to error log:', err);
    });
};

console.log('Console logging initialized. Logs will be saved to:', LOG_DIR);
