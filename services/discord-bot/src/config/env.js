/**
 * Environment Configuration
 * Validates and exports environment variables
 */

require('dotenv').config();

const requiredEnvVars = ['TOKEN'];
const optionalEnvVars = ['API_KEY'];

// Validate required environment variables
function validateEnv() {
    const missing = requiredEnvVars.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error(`[CONFIG] Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
}

validateEnv();

module.exports = {
    // Discord
    TOKEN: process.env.TOKEN,

    // OpenAI (optional for now)
    API_KEY: process.env.API_KEY || null,

    // App settings
    NODE_ENV: process.env.NODE_ENV || 'development',
    DEBUG: process.env.DEBUG === 'true',
};
