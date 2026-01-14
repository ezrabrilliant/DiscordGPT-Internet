/**
 * Environment Configuration
 * Validates and exports environment variables
 */

require('dotenv').config();

const requiredEnvVars = ['TOKEN'];
const optionalEnvVars = ['API_KEY', 'OPENAI_API_KEY', 'AI_ENGINE_URL'];

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
    CLIENT_ID: process.env.CLIENT_ID || null, // For slash command deployment
    TEST_GUILD_ID: process.env.TEST_GUILD_ID || null, // For testing

    // OpenAI (fallback when local AI is offline)
    API_KEY: process.env.API_KEY || null,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.API_KEY || null,
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',

    // Local AI Engine (your PC via tunnel)
    AI_ENGINE_URL: process.env.AI_ENGINE_URL || 'http://localhost:8000',
    AI_API_KEY: process.env.AI_API_KEY || null,

    // App settings
    NODE_ENV: process.env.NODE_ENV || 'development',
    DEBUG: process.env.DEBUG === 'true',
};
