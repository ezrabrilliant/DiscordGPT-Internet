/**
 * Bot Metadata & Branding
 * Centralized config for version, models, and embed helpers
 */

const { EmbedBuilder } = require('discord.js');

// ============================================
// VERSION & BRANDING
// ============================================

const BOT_VERSION = 'v3.2.7';
const BOT_NAME = "Ezra's";

// Model names for display
const MODELS = {
    local: 'gemma-3n-e4b',
    openai: 'gpt-3.5-turbo',
    fallback: 'AI',
};

// Brand colors
const COLORS = {
    primary: 0x5865F2,    // Discord Blurple
    success: 0x2ECC71,    // Green
    error: 0xE74C3C,      // Red
    warning: 0xF39C12,    // Orange
    info: 0x3498DB,       // Blue
    khodam: 0x9B59B6,     // Purple
    roast: 0xE74C3C,      // Red
    poll: 0x3498DB,       // Blue
    memory: 0x3498DB,     // Blue
};

// ============================================
// FOOTER HELPERS
// ============================================

/**
 * Generate standard footer text
 * @param {object} options - Footer options
 * @param {boolean} options.isPrivate - Is response private/ephemeral
 * @param {string} options.provider - AI provider ('local', 'openai', or model name)
 * @param {string} options.extra - Extra text to append
 * @returns {string} Footer text
 */
function getFooterText({ isPrivate = false, provider = null, extra = null } = {}) {
    const parts = [];
    
    // Privacy indicator
    parts.push(isPrivate ? '🔒 Private' : '🌐 Public');
    
    // Model/provider
    if (provider) {
        const modelName = MODELS[provider] || provider;
        parts.push(modelName);
    }
    
    // Version
    parts.push(BOT_VERSION);
    
    // Extra info
    if (extra) {
        parts.push(extra);
    }
    
    return parts.join(' • ');
}

/**
 * Generate footer object for EmbedBuilder
 * @param {object} options - Same as getFooterText
 * @returns {object} Footer object { text: string }
 */
function getFooter(options = {}) {
    return { text: getFooterText(options) };
}

/**
 * Create a standard embed with consistent branding
 * @param {object} options - Embed options
 * @returns {EmbedBuilder}
 */
function createEmbed({ 
    color = COLORS.primary,
    title = null,
    description = null,
    author = null,
    fields = [],
    footer = {},
    thumbnail = null,
    timestamp = true,
} = {}) {
    const embed = new EmbedBuilder().setColor(color);
    
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (author) embed.setAuthor(author);
    if (fields.length > 0) embed.addFields(fields);
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (timestamp) embed.setTimestamp();
    
    // Set footer with defaults
    embed.setFooter(getFooter(footer));
    
    return embed;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Constants
    BOT_VERSION,
    BOT_NAME,
    MODELS,
    COLORS,
    
    // Helpers
    getFooterText,
    getFooter,
    createEmbed,
};
