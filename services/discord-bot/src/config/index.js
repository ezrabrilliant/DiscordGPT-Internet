/**
 * Config Index - Re-exports all configuration
 */

const constants = require('./constants');
const env = require('./env');
const branding = require('./branding');

module.exports = {
    ...constants,
    env,
    branding,
};
