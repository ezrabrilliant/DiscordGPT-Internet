// conversationLog.js
const { logMessage } = require('./logger');

const conversationLogs = {};

function getConversationLog(serverId, userId) {
    if (!conversationLogs[serverId]) {
        conversationLogs[serverId] = {};
    }
    if (!conversationLogs[serverId][userId]) {
        conversationLogs[serverId][userId] = [];
    }
    console.log(`Getting conversation log for server ${serverId}, user ${userId}`);
    return conversationLogs[serverId][userId];
}

function addToConversationLog(serverId, userId, role, content) {
    const log = getConversationLog(serverId, userId);
    log.push({ role, content });
    logMessage(`Added to conversation log for server ${serverId}, user ${userId}:`, { role, content });
    if (log.length > 20) {
        log.shift();
    }
}

function clearConversationLog(serverId, userId) {
    if (conversationLogs[serverId] && conversationLogs[serverId][userId]) {
        conversationLogs[serverId][userId] = [];
    }
    logMessage(`Cleared conversation log for server ${serverId}, user ${userId}`);
    console.log(`Cleared conversation log for server ${serverId}, user ${userId}`);
}

module.exports = {
    getConversationLog,
    addToConversationLog,
    clearConversationLog,
};
