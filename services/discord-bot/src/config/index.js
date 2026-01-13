/**
 * Config Index - Re-exports all configuration
 */

const constants = require('./constants');
const env = require('./env');

module.exports = {
    ...constants,
    env,
};
