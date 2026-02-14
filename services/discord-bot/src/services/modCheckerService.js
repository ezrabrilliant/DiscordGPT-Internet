/**
 * ModChecker Service
 * Growtopia Moderator status checker — integrated into EzraBot
 * Migrated from standalone ModChecker bot.js v2
 */

const {
    EmbedBuilder,
    SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder,
    PermissionFlagsBits, ChannelType,
    ButtonBuilder, ButtonStyle, AttachmentBuilder
} = require('discord.js');
const { MongoClient } = require('mongodb');
const { createCanvas } = require('@napi-rs/canvas');
const axios = require('axios');

// ============================================================
// CONFIG
// ============================================================
var GALANG_API_URL = 'https://gist.githubusercontent.com/Galangrs/22b5c1862e275a14dbbd9adef3103250/raw/config.json';
var NEJA_API_URL = 'https://gist.githubusercontent.com/realneja/302d90d228135dc2542d87715fee06ac/raw/mods.txt';

var CHECK_INTERVAL = 30000;
var DISPLAY_INTERVAL = 15000;
var STALE_THRESHOLD = 15 * 60;
var ROLE_PREFIX = 'Mod: ';
var NL = '\n';
var ROLES_PER_PAGE = 5;

// Emoji constants
var EMOJI_ONLINE = '<a:online:1290378869957853268>';
var EMOJI_OFFLINE = '<a:offline:1290379587888353340>';
var EMOJI_IDLE = '<a:idle:1472160073500332146>';

// ============================================================
// STATE
// ============================================================
var client = null;  // Discord client (passed from index.js)
var db = null;      // MongoDB database handle (modchecker db)
var mongoClient = null;
var lastStaleAlert = null;
var lastApiSource = null;
var checkInterval = null;
var displayInterval = null;
var roleStatsInterval = null;
var membersFetchedAt = {};     // guildId -> timestamp of last fetch
var MEMBERS_FETCH_COOLDOWN = 5 * 60 * 1000; // only fetch members every 5 minutes
var roleStatsCache = {};       // guildId -> { data, timestamp }
var ROLESTATS_CACHE_TTL = 30 * 1000; // cache roleStats data for 30 seconds

// ============================================================
// INIT
// ============================================================

/**
 * Initialize ModChecker service
 * @param {Client} discordClient - Discord.js client from index.js
 * @param {string} mongoUri - MongoDB connection string
 */
async function init(discordClient, mongoUri) {
    client = discordClient;

    if (!mongoUri) {
        console.error('[ModChecker] No MONGO_URI, service disabled');
        return;
    }

    try {
        mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        db = mongoClient.db('modchecker');

        await db.collection('modstatus').createIndex({ modid: 1 }, { unique: true });
        await db.collection('modlog').createIndex({ isSend: 1 });
        await db.collection('modlog').createIndex({ modid: 1, timestamp: 1 });
        await db.collection('modroles').createIndex({ modid: 1, guildId: 1 }, { unique: true });
        await db.collection('guildsettings').createIndex({ guildId: 1 }, { unique: true });

        console.log('[ModChecker] MongoDB connected (database: modchecker)');
    } catch (err) {
        console.error('[ModChecker] MongoDB connection error:', err.message);
        db = null;
        return;
    }
}

// ============================================================
// GUILD SETTINGS
// ============================================================

async function getGuildSettings(guildId) {
    return await db.collection('guildsettings').findOne({ guildId: guildId });
}

async function getAllGuildSettings() {
    return await db.collection('guildsettings').find().toArray();
}

async function upsertGuildSettings(guildId, update) {
    await db.collection('guildsettings').updateOne(
        { guildId: guildId },
        { $set: update },
        { upsert: true }
    );
}

async function getRoleStatsPage(guildId) {
    var settings = await getGuildSettings(guildId);
    return (settings && typeof settings.roleStatsPage === 'number') ? settings.roleStatsPage : 0;
}

async function setRoleStatsPage(guildId, page) {
    await upsertGuildSettings(guildId, { roleStatsPage: page });
}

// ============================================================
// DATA FETCHING
// ============================================================

async function fetchGalangAPI() {
    try {
        var res = await axios.get(GALANG_API_URL, {
            headers: { 'User-Agent': 'ModChecker/2.0' },
            timeout: 10000,
        });
        var data = res.data;
        var mods = [];
        if (Array.isArray(data.mods)) {
            for (var i = 0; i < data.mods.length; i++) {
                var mod = data.mods[i];
                var modid = mod.name.toLowerCase();
                var status;
                if (mod.idle) {
                    status = 'Idle';
                } else if (mod.undercover) {
                    status = 'Undercover';
                } else {
                    status = 'Online';
                }
                mods.push({ modid: modid, status: status });
            }
        }
        return { mods: mods, lastUpdated: data.last_updated || null, source: 'galang' };
    } catch (err) {
        console.error('[ModChecker][Galang API] Fetch error:', err.message);
        return null;
    }
}

async function fetchNejaAPI() {
    try {
        var res = await axios.get(NEJA_API_URL, {
            headers: { 'User-Agent': 'ModChecker/2.0' },
            timeout: 10000,
        });
        var text = String(res.data).trim();
        if (!text) return { mods: [], source: 'neja' };
        var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
        var mods = [];
        for (var i = 0; i < lines.length; i++) {
            var lower = lines[i].toLowerCase();
            if (lower === 'no mods online') continue;
            if (lower.endsWith('-undercover')) {
                mods.push({ modid: lower.replace('-undercover', ''), status: 'Undercover' });
            } else if (lower.endsWith('-idle')) {
                mods.push({ modid: lower.replace('-idle', ''), status: 'Idle' });
            } else {
                mods.push({ modid: lower, status: 'Online' });
            }
        }
        return { mods: mods, source: 'neja' };
    } catch (err) {
        console.error('[ModChecker][Neja API] Fetch error:', err.message);
        return null;
    }
}

async function fetchModData() {
    var galang = await fetchGalangAPI();
    if (galang) { lastApiSource = 'galang'; return galang; }
    console.log('[ModChecker] Galang API down, using Neja fallback...');
    var neja = await fetchNejaAPI();
    if (neja) { lastApiSource = 'neja'; return neja; }
    console.error('[ModChecker] Both APIs failed!');
    lastApiSource = null;
    return null;
}

// ============================================================
// MOD CHECKER
// ============================================================

async function checkModStatus() {
    if (!db) return;
    var data = await fetchModData();
    if (!data) return;

    var timestamp = new Date().toISOString();
    var mods = data.mods;
    var lastUpdated = data.lastUpdated;
    var source = data.source;

    // Stale check
    if (source === 'galang' && lastUpdated) {
        var updatedAt = Math.floor(new Date(lastUpdated).getTime() / 1000);
        var now = Math.floor(Date.now() / 1000);
        var age = now - updatedAt;
        if (age > STALE_THRESHOLD) {
            if (lastStaleAlert !== updatedAt) {
                await sendStaleAlertToAllGuilds(updatedAt);
                lastStaleAlert = updatedAt;
            }
        } else {
            lastStaleAlert = null;
        }
    }

    // Update mod statuses
    var currentMods = new Map();
    for (var i = 0; i < mods.length; i++) {
        currentMods.set(mods[i].modid, mods[i].status);
    }

    for (var entry of currentMods.entries()) {
        var modid = entry[0];
        var status = entry[1];
        var existing = await db.collection('modstatus').findOne({ modid: modid });
        if (!existing) {
            await db.collection('modstatus').insertOne({ modid: modid, nama: modid, status: status });
            await db.collection('modlog').insertOne({ modid: modid, nama: modid, status: status, timestamp: timestamp, isSend: false });
        } else if (existing.status !== status) {
            await db.collection('modstatus').updateOne({ modid: modid }, { $set: { status: status } });
            await db.collection('modlog').insertOne({ modid: modid, nama: modid, status: status, timestamp: timestamp, isSend: false });
        }
    }

    // Mark missing mods as Offline
    var allMods = await db.collection('modstatus').find().toArray();
    for (var j = 0; j < allMods.length; j++) {
        var mod = allMods[j];
        if (!currentMods.has(mod.modid) && mod.status !== 'Offline') {
            await db.collection('modstatus').updateOne({ modid: mod.modid }, { $set: { status: 'Offline' } });
            await db.collection('modlog').insertOne({ modid: mod.modid, nama: mod.nama, status: 'Offline', timestamp: timestamp, isSend: false });
        }
    }

    await sendPendingNotifications();
}

// ============================================================
// STALE ALERT
// ============================================================

async function sendStaleAlertToAllGuilds(embedTimestamp) {
    var allSettings = await getAllGuildSettings();
    for (var i = 0; i < allSettings.length; i++) {
        var settings = allSettings[i];
        if (!settings.notificationChannelId) continue;
        try {
            var channel = await client.channels.fetch(settings.notificationChannelId);
            if (!channel) continue;
            var embed = new EmbedBuilder()
                .setTitle('API Data Stale')
                .setDescription(
                    'Data dari API sudah tidak update lebih dari ' + (STALE_THRESHOLD / 60) + ' menit.' + NL +
                    'Last Update: <t:' + embedTimestamp + ':R>' + NL +
                    'Source: **' + (lastApiSource || 'unknown') + '**'
                )
                .setColor('#ff0000')
                .setTimestamp();
            await channel.send({ content: '**@here API Data Stale!**', embeds: [embed] });
        } catch (err) {
            console.error('[ModChecker][Alert] Failed for guild ' + settings.guildId + ':', err.message);
        }
    }
}

// ============================================================
// NOTIFICATIONS
// ============================================================

async function sendPendingNotifications() {
    var unsentLogs = await db.collection('modlog').find({ isSend: false }).toArray();
    if (unsentLogs.length === 0) return;

    var allSettings = await getAllGuildSettings();
    var onlineLogs = [], idleLogs = [], offlineLogs = [];

    for (var i = 0; i < unsentLogs.length; i++) {
        var st = unsentLogs[i].status.toLowerCase();
        if (st === 'offline') offlineLogs.push(unsentLogs[i]);
        else if (st === 'idle') idleLogs.push(unsentLogs[i]);
        else onlineLogs.push(unsentLogs[i]);
    }

    for (var g = 0; g < allSettings.length; g++) {
        var settings = allSettings[g];
        if (!settings.notificationChannelId) continue;
        try {
            var channel = await client.channels.fetch(settings.notificationChannelId);
            if (!channel) continue;
            var guild = channel.guild;

            async function getRoleMention(modid, gid) {
                var roleMapping = await db.collection('modroles').findOne({ modid: modid, guildId: gid });
                if (roleMapping) {
                    var role = guild.roles.cache.get(roleMapping.roleId);
                    if (role) return '<@&' + roleMapping.roleId + '>';
                }
                return null;
            }

            if (onlineLogs.length > 0) {
                var onlineDesc = '';
                var onlineRoles = new Set();
                for (var j = 0; j < onlineLogs.length; j++) {
                    var log = onlineLogs[j];
                    var ts = Math.floor(new Date(log.timestamp).getTime() / 1000);
                    onlineDesc += EMOJI_ONLINE + ' **' + log.nama + '** - ' + log.status + ' (<t:' + ts + ':R>)' + NL;
                    var mention = await getRoleMention(log.modid, guild.id);
                    if (mention) onlineRoles.add(mention);
                }
                var onlineEmbed = new EmbedBuilder()
                    .setTitle('Mod Online')
                    .setDescription(onlineDesc.trim())
                    .setColor('#2ecc71')
                    .setTimestamp()
                    .setFooter({ text: "Mod Checker by Ezra Bot's", iconURL: client.user.displayAvatarURL({ dynamic: true }) });
                await channel.send({ content: onlineRoles.size > 0 ? Array.from(onlineRoles).join(' ') : undefined, embeds: [onlineEmbed] });
            }

            if (idleLogs.length > 0) {
                var idleDesc = '';
                var idleRoles = new Set();
                for (var jj = 0; jj < idleLogs.length; jj++) {
                    var iLog = idleLogs[jj];
                    var iTs = Math.floor(new Date(iLog.timestamp).getTime() / 1000);
                    idleDesc += EMOJI_IDLE + ' **' + iLog.nama + '** - Idle (<t:' + iTs + ':R>)' + NL;
                    var iMention = await getRoleMention(iLog.modid, guild.id);
                    if (iMention) idleRoles.add(iMention);
                }
                var idleEmbed = new EmbedBuilder()
                    .setTitle('Mod Idle')
                    .setDescription(idleDesc.trim())
                    .setColor('#f1c40f')
                    .setTimestamp()
                    .setFooter({ text: "Mod Checker by Ezra Bot's", iconURL: client.user.displayAvatarURL({ dynamic: true }) });
                await channel.send({ content: idleRoles.size > 0 ? Array.from(idleRoles).join(' ') : undefined, embeds: [idleEmbed] });
            }

            if (offlineLogs.length > 0) {
                var offlineDesc = '';
                var offlineRoles = new Set();
                for (var k = 0; k < offlineLogs.length; k++) {
                    var oLog = offlineLogs[k];
                    var oTs = Math.floor(new Date(oLog.timestamp).getTime() / 1000);
                    offlineDesc += EMOJI_OFFLINE + ' **' + oLog.nama + '** - Offline (<t:' + oTs + ':R>)' + NL;
                    var oMention = await getRoleMention(oLog.modid, guild.id);
                    if (oMention) offlineRoles.add(oMention);
                }
                var offlineEmbed = new EmbedBuilder()
                    .setTitle('Mod Offline')
                    .setDescription(offlineDesc.trim())
                    .setColor('#e74c3c')
                    .setTimestamp()
                    .setFooter({ text: "Mod Checker by Ezra Bot's", iconURL: client.user.displayAvatarURL({ dynamic: true }) });
                await channel.send({ content: offlineRoles.size > 0 ? Array.from(offlineRoles).join(' ') : undefined, embeds: [offlineEmbed] });
            }
        } catch (err) {
            console.error('[ModChecker][Notif] Failed for guild ' + settings.guildId + ':', err.message);
        }
    }

    var ids = unsentLogs.map(function(l) { return l._id; });
    await db.collection('modlog').updateMany({ _id: { $in: ids } }, { $set: { isSend: true } });
}

// ============================================================
// DISPLAY EMBED
// ============================================================

async function updateAllDisplayEmbeds() {
    if (!db) return;
    var allSettings = await getAllGuildSettings();

    for (var i = 0; i < allSettings.length; i++) {
        var settings = allSettings[i];
        if (!settings.displayChannelId || !settings.displayMessageId) continue;
        try {
            var channel = await client.channels.fetch(settings.displayChannelId);
            if (!channel) continue;
            var message = await channel.messages.fetch(settings.displayMessageId);
            if (!message) continue;

            var mods = await db.collection('modstatus').find().toArray();
            var embed = new EmbedBuilder()
                .setTitle('\u22C5\u2022\u22C5\u263E Moderator Checker \u263D\u22C5\u2022\u22C5')
                .setColor('#0099ff');

            var onlineMods = mods.filter(function(m) { return m.status.toLowerCase() !== 'offline'; });
            var currentTimestamp = Math.floor(Date.now() / 1000);
            var sourceLine = NL + 'Source: <@885461051175485470> & <@1118815225601343540>';

            if (onlineMods.length > 0) {
                var modList = onlineMods.map(function(mod) {
                    var icon = mod.status === 'Idle' ? EMOJI_IDLE : EMOJI_ONLINE;
                    return '* **' + icon + ' ' + mod.nama + ' (' + mod.status + ')**';
                }).join(NL);
                embed.setDescription(modList + NL + NL + 'Last Update: <t:' + currentTimestamp + ':R>' + sourceLine);
            } else {
                embed.setDescription('No moderators available.' + NL + NL + 'Last Update: <t:' + currentTimestamp + ':R>' + sourceLine);
            }

            if (lastApiSource) {
                embed.setFooter({ text: 'Mod Checker v2', iconURL: client.user.displayAvatarURL({ dynamic: true }) });
            }

            await message.edit({ embeds: [embed] });
        } catch (err) {
            console.error('[ModChecker][Display] Failed for guild ' + settings.guildId + ':', err.message);
        }
    }
}

// ============================================================
// ROLE STATS
// ============================================================

async function collectRoleStatsData(guild) {
    var modRoles = await db.collection('modroles').find({ guildId: guild.id }).toArray();

    // Only fetch members if cooldown expired (avoid opcode 8 rate limit)
    var now = Date.now();
    if (!membersFetchedAt[guild.id] || (now - membersFetchedAt[guild.id]) > MEMBERS_FETCH_COOLDOWN) {
        try {
            await guild.members.fetch();
            membersFetchedAt[guild.id] = now;
        } catch (err) {
            console.error('[ModChecker] members.fetch rate limited, using cache:', err.message);
        }
    }

    var uniqueUsers = new Set();
    var roleData = [];

    for (var j = 0; j < modRoles.length; j++) {
        var mr = modRoles[j];
        var role = guild.roles.cache.get(mr.roleId);
        if (role && role.members.size > 0) {
            var count = role.members.size;
            role.members.forEach(function(member) { uniqueUsers.add(member.id); });
            var modStatus = await db.collection('modstatus').findOne({ modid: mr.modid });
            var statusText = modStatus ? modStatus.status : 'Unknown';
            var statusIcon;
            if (statusText === 'Idle') statusIcon = EMOJI_IDLE;
            else if (statusText.toLowerCase() !== 'offline') statusIcon = EMOJI_ONLINE;
            else statusIcon = EMOJI_OFFLINE;
            roleData.push({ modid: mr.modid, count: count, icon: statusIcon });
        }
    }

    roleData.sort(function(a, b) { return b.count - a.count; });
    var totalPages = Math.max(1, Math.ceil(roleData.length / ROLES_PER_PAGE));
    return { roleData: roleData, uniqueUsers: uniqueUsers, totalPages: totalPages };
}

function buildRoleStatsPage(guild, roleData, uniqueUsers, page, totalPages) {
    var start = page * ROLES_PER_PAGE;
    var end = Math.min(start + ROLES_PER_PAGE, roleData.length);
    var pageItems = roleData.slice(start, end);
    var currentTimestamp = Math.floor(Date.now() / 1000);
    var desc = '';

    if (roleData.length === 0) {
        desc = 'Belum ada user yang mengambil role mod.';
    } else {
        for (var k = 0; k < pageItems.length; k++) {
            var rank = start + k + 1;
            desc += '`' + rank + '.` ' + pageItems[k].icon + ' **' + pageItems[k].modid + '** \u2014 ' + pageItems[k].count + ' user' + NL;
        }
        desc += NL + '**Total Subscribers:** ' + uniqueUsers.size + ' unique user';
    }

    desc += NL + NL + 'Last Update: <t:' + currentTimestamp + ':R>';

    var embed = new EmbedBuilder()
        .setTitle('\uD83D\uDCCA Mod Role Statistics')
        .setDescription(desc)
        .setColor('#3498db')
        .setTimestamp()
        .setFooter({
            text: 'Page ' + (page + 1) + '/' + totalPages + ' | ' + guild.name + ' | Mod Checker v2',
            iconURL: guild.iconURL({ dynamic: true })
        });

    var row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('mc_rolestats_prev')
            .setLabel('\u25C0 Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('mc_rolestats_next')
            .setLabel('Next \u25B6')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    return { embed: embed, row: row };
}

async function updateAllRoleStatsEmbeds() {
    if (!db) return;
    var allSettings = await getAllGuildSettings();

    for (var i = 0; i < allSettings.length; i++) {
        var settings = allSettings[i];
        if (!settings.roleStatsChannelId || !settings.roleStatsMessageId) continue;
        try {
            var channel = await client.channels.fetch(settings.roleStatsChannelId);
            if (!channel) continue;
            var message = await channel.messages.fetch(settings.roleStatsMessageId);
            if (!message) continue;

            var guild = channel.guild;
            var data = await collectRoleStatsData(guild);
            var page = await getRoleStatsPage(guild.id);
            if (page >= data.totalPages) page = data.totalPages - 1;
            if (page < 0) page = 0;
            await setRoleStatsPage(guild.id, page);

            var result = buildRoleStatsPage(guild, data.roleData, data.uniqueUsers, page, data.totalPages);
            await message.edit({ embeds: [result.embed], components: [result.row] });
        } catch (err) {
            console.error('[ModChecker][RoleStats] Failed for guild ' + settings.guildId + ':', err.message);
        }
    }
}

// ============================================================
// ROLE PICKER
// ============================================================

async function getOrCreateRole(guild, roleName, modid) {
    try {
        var role = guild.roles.cache.find(function(r) { return r.name === roleName; });
        if (!role) {
            role = await guild.roles.create({
                name: roleName, color: '#3498db', mentionable: true,
                reason: 'ModChecker auto-created role for notifications',
            });
        }
        if (modid) {
            await db.collection('modroles').updateOne(
                { modid: modid, guildId: guild.id },
                { $set: { modid: modid, roleId: role.id, guildId: guild.id, roleName: roleName } },
                { upsert: true }
            );
        }
        return role;
    } catch (err) {
        console.error('[ModChecker][Role] Failed:', err.message);
        return null;
    }
}

async function buildRoleSelectMenu() {
    var mods = await db.collection('modstatus').find().toArray();
    var seen = {};
    var uniqueMods = [];
    for (var i = 0; i < mods.length; i++) {
        var key = mods[i].modid.toLowerCase();
        if (!seen[key]) { seen[key] = true; uniqueMods.push(mods[i]); }
    }

    var options = uniqueMods.slice(0, 25).map(function(m) {
        return { label: m.modid, description: 'Get notified when ' + m.modid + ' comes online', value: 'mod_' + m.modid };
    });

    var selectMenu = new StringSelectMenuBuilder()
        .setCustomId('mc_mod_role_picker')
        .setPlaceholder('Pilih mod yang mau kamu pantau...')
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

    return new ActionRowBuilder().addComponents(selectMenu);
}

// ============================================================
// GANTT CHART
// ============================================================

async function handleGanttCommand(interaction) {
    var moderators = [interaction.options.getString('moderator')].filter(Boolean);
    var timeframe = interaction.options.getString('timeframe');
    var endDate = new Date();
    var startDate = new Date(endDate);
    if (timeframe === '1d') startDate.setDate(endDate.getDate() - 1);
    else startDate.setDate(endDate.getDate() - 7);

    await interaction.deferReply();

    try {
        var records = await db.collection('modlog').find({
            modid: { $in: moderators },
            timestamp: { $gte: startDate.toISOString(), $lte: endDate.toISOString() },
        }).sort({ timestamp: 1 }).toArray();

        if (records.length === 0) {
            await interaction.editReply('Tidak ada data log untuk moderator dan jangka waktu yang dipilih.');
            return;
        }

        var moderatorSessions = {};
        for (var r = 0; r < records.length; r++) {
            var record = records[r];
            var mid = record.modid;
            var time = new Date(record.timestamp);
            var state = record.status.toLowerCase() === 'offline' ? 'off' : 'on';
            if (!moderatorSessions[mid]) moderatorSessions[mid] = [];
            moderatorSessions[mid].push({ time: time, state: state });
        }

        var ganttData = [];
        var modIds = Object.keys(moderatorSessions);
        for (var m = 0; m < modIds.length; m++) {
            var cmid = modIds[m];
            var sessions = moderatorSessions[cmid];
            var onTime = null;
            for (var s = 0; s < sessions.length; s++) {
                if (sessions[s].state === 'on') onTime = sessions[s].time;
                else if (sessions[s].state === 'off' && onTime) {
                    ganttData.push({ modid: cmid, start: onTime, end: sessions[s].time });
                    onTime = null;
                }
            }
            if (onTime) ganttData.push({ modid: cmid, start: onTime, end: endDate });
        }

        var width = 3000, height = 50 * moderators.length + 150;
        var canvas = createCanvas(width, height);
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2c2f33';
        ctx.fillRect(0, 0, width, height);

        var totalMs = endDate - startDate;
        var chartLeft = 200, chartRight = width - 50;
        var chartWidth = chartRight - chartLeft;

        function getXPosition(date) {
            return ((date - startDate) / totalMs) * chartWidth + chartLeft;
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';

        var numTicks = timeframe === '1d' ? 24 : 7;
        var tickInterval = totalMs / numTicks;
        for (var t = 0; t <= numTicks; t++) {
            var tickTime = new Date(startDate.getTime() + tickInterval * t);
            var x = getXPosition(tickTime);
            ctx.strokeStyle = '#555555';
            ctx.beginPath();
            ctx.moveTo(x, 30);
            ctx.lineTo(x, height - 30);
            ctx.stroke();
            var label = timeframe === '1d'
                ? tickTime.getHours().toString().padStart(2, '0') + ':00'
                : tickTime.getDate() + '/' + (tickTime.getMonth() + 1);
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(label, x - 15, height - 10);
        }

        var y = 50;
        var colors = ['#42A5F5', '#66BB6A', '#FFA726', '#EF5350', '#AB47BC'];
        for (var idx = 0; idx < moderators.length; idx++) {
            var curMod = moderators[idx];
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(curMod, 10, y + 22);
            for (var gg = 0; gg < ganttData.length; gg++) {
                if (ganttData[gg].modid === curMod) {
                    var xStart = getXPosition(ganttData[gg].start);
                    var xEnd = getXPosition(ganttData[gg].end);
                    ctx.fillStyle = colors[idx % colors.length];
                    ctx.beginPath();
                    ctx.roundRect(xStart, y, Math.max(xEnd - xStart, 2), 30, 4);
                    ctx.fill();
                }
            }
            y += 50;
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('Mod Activity - ' + timeframe, chartLeft, 25);

        var buffer = canvas.toBuffer();
        var attachment = new AttachmentBuilder(buffer, { name: 'gantt-chart.png' });
        await interaction.editReply({
            content: 'Gantt Chart untuk: **' + moderators.join(', ') + '** (' + timeframe + ')',
            files: [attachment],
        });
    } catch (err) {
        console.error('[ModChecker][Gantt] Error:', err.message);
        await interaction.editReply('Terjadi kesalahan saat membuat Gantt Chart.');
    }
}

// ============================================================
// SLASH COMMAND REGISTRATION
// ============================================================

async function getSlashCommands() {
    if (!db) return [];

    var moderators = await db.collection('modstatus').find().toArray();
    var seen = {};
    var uniqueMods = [];
    for (var i = 0; i < moderators.length; i++) {
        if (!seen[moderators[i].modid]) {
            seen[moderators[i].modid] = true;
            uniqueMods.push(moderators[i]);
        }
    }
    var modChoices = uniqueMods.slice(0, 25).map(function(mod) {
        return { name: mod.modid, value: mod.modid };
    });

    var commands = [];

    // /setup
    var setupCmd = new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Setup channel untuk ModChecker di server ini')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    setupCmd.addChannelOption(function(o) { return o.setName('notification').setDescription('Channel untuk notifikasi mod online/offline').setRequired(false).addChannelTypes(ChannelType.GuildText); });
    setupCmd.addChannelOption(function(o) { return o.setName('display').setDescription('Channel untuk display embed status mod').setRequired(false).addChannelTypes(ChannelType.GuildText); });
    setupCmd.addChannelOption(function(o) { return o.setName('rolestats').setDescription('Channel untuk display statistik role subscriber').setRequired(false).addChannelTypes(ChannelType.GuildText); });
    commands.push(setupCmd);

    // /setup-roles
    var setupRolesCmd = new SlashCommandBuilder()
        .setName('setup-roles')
        .setDescription('Kirim panel role picker untuk notifikasi mod')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
    commands.push(setupRolesCmd);

    // /gantt
    var ganttCmd = new SlashCommandBuilder()
        .setName('gantt')
        .setDescription('Tampilkan Gantt Chart aktivitas moderator');
    ganttCmd.addStringOption(function(o) {
        o.setName('moderator').setDescription('Pilih moderator').setRequired(true);
        if (modChoices.length > 0) o.addChoices.apply(o, modChoices);
        return o;
    });
    ganttCmd.addStringOption(function(o) {
        return o.setName('timeframe').setDescription('Jangka waktu').setRequired(true)
            .addChoices({ name: '1 Hari', value: '1d' }, { name: '7 Hari', value: '7d' });
    });
    commands.push(ganttCmd);

    // /refresh-roles
    var refreshCmd = new SlashCommandBuilder()
        .setName('refresh-roles')
        .setDescription('Update panel role picker dengan daftar mod terbaru')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles);
    commands.push(refreshCmd);

    // /settings
    var settingsCmd = new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Lihat konfigurasi ModChecker di server ini')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);
    commands.push(settingsCmd);

    return commands;
}

// ============================================================
// COMMAND HANDLERS
// ============================================================

async function handleSetupCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        var guildId = interaction.guild.id;
        var notifChannel = interaction.options.getChannel('notification');
        var displayChannel = interaction.options.getChannel('display');
        var roleStatsChannel = interaction.options.getChannel('rolestats');

        if (!notifChannel && !displayChannel && !roleStatsChannel) {
            await interaction.editReply({ content: 'Pilih minimal 1 channel untuk di-setup.' });
            return;
        }

        var update = { guildId: guildId };
        if (notifChannel) update.notificationChannelId = notifChannel.id;
        if (displayChannel) {
            var embed = new EmbedBuilder().setTitle('\u22C5\u2022\u22C5\u263E Moderator Checker \u263D\u22C5\u2022\u22C5').setDescription('Loading...').setColor('#0099ff');
            var msg = await displayChannel.send({ embeds: [embed] });
            update.displayChannelId = displayChannel.id;
            update.displayMessageId = msg.id;
        }
        if (roleStatsChannel) {
            var rsEmbed = new EmbedBuilder().setTitle('\uD83D\uDCCA Mod Role Statistics').setDescription('Loading...').setColor('#3498db');
            var rsMsg = await roleStatsChannel.send({ embeds: [rsEmbed] });
            update.roleStatsChannelId = roleStatsChannel.id;
            update.roleStatsMessageId = rsMsg.id;
        }

        await upsertGuildSettings(guildId, update);

        var responseText = 'Setup berhasil!' + NL + NL;
        if (notifChannel) responseText += '**Notification Channel:** <#' + notifChannel.id + '>' + NL;
        if (displayChannel) responseText += '**Display Channel:** <#' + displayChannel.id + '>' + NL;
        if (roleStatsChannel) responseText += '**Role Stats Channel:** <#' + roleStatsChannel.id + '>' + NL;
        responseText += NL + 'Gunakan `/setup-roles` untuk mengirim panel role picker.';

        await interaction.editReply({ content: responseText });
    } catch (err) {
        console.error('[ModChecker][Setup] Error:', err.message);
        await interaction.editReply({ content: 'Gagal setup. Error: ' + err.message });
    }
}

async function handleSettingsCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        var settings = await getGuildSettings(interaction.guild.id);
        if (!settings) {
            await interaction.editReply({ content: 'Server ini belum di-setup. Gunakan `/setup` terlebih dahulu.' });
            return;
        }
        var desc = '';
        desc += '**Notification Channel:** ' + (settings.notificationChannelId ? '<#' + settings.notificationChannelId + '>' : 'Belum diset') + NL;
        desc += '**Display Channel:** ' + (settings.displayChannelId ? '<#' + settings.displayChannelId + '>' : 'Belum diset') + NL;
        desc += '**Display Message ID:** ' + (settings.displayMessageId || 'Belum diset') + NL;
        desc += '**Role Stats Channel:** ' + (settings.roleStatsChannelId ? '<#' + settings.roleStatsChannelId + '>' : 'Belum diset') + NL;
        var embed = new EmbedBuilder().setTitle('ModChecker Settings').setDescription(desc).setColor('#3498db').setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    } catch (err) {
        await interaction.editReply({ content: 'Gagal mengambil settings.' });
    }
}

async function handleSetupRolesCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        var row = await buildRoleSelectMenu();
        var embed = new EmbedBuilder()
            .setTitle('\u22C5\u2022\u22C5\u263E Mod Notification Roles \u263D\u22C5\u2022\u22C5')
            .setDescription(
                'Pilih mod yang ingin kamu pantau dari menu di bawah.' + NL +
                'Select the mod you want to monitor from the menu below.' + NL + NL +
                'Kamu akan mendapat notifikasi saat mod tersebut **online**, **undercover**, **idle**, atau **offline**.' + NL +
                'You will be notified when the mod goes **online**, **undercover**, **idle**, or **offline**.'
            )
            .setColor('#3498db')
            .setFooter({ text: 'Mod Checker v2' })
            .setTimestamp();
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: 'Role picker berhasil dikirim!' });
    } catch (err) {
        await interaction.editReply({ content: 'Gagal mengirim role picker.' });
    }
}

async function handleRefreshRolesCommand(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        // Re-deploy all slash commands (merged EzraBot + ModChecker)
        var { deploySlashCommands } = require('../slashCommands');
        await deploySlashCommands(client.user.id);
        await interaction.editReply({ content: 'Slash commands dan role picker sudah di-refresh dengan data mod terbaru!' });
    } catch (err) {
        await interaction.editReply({ content: 'Gagal refresh.' });
    }
}

async function handleRolePickerInteraction(interaction) {
    await interaction.deferReply({ ephemeral: true });
    var guild = interaction.guild;
    var member = interaction.member;
    var selectedValues = interaction.values;

    try {
        var addedRoles = [], removedRoles = [];
        var mods = await db.collection('modstatus').find().toArray();
        var seen = {};
        var uniqueMods = [];
        for (var i = 0; i < mods.length; i++) {
            var key = mods[i].modid.toLowerCase();
            if (!seen[key]) { seen[key] = true; uniqueMods.push(mods[i]); }
        }
        var allOptions = uniqueMods.map(function(m) { return 'mod_' + m.modid; });

        for (var k = 0; k < allOptions.length; k++) {
            var optionValue = allOptions[k];
            var isSelected = selectedValues.includes(optionValue);
            var modid = optionValue.replace('mod_', '');
            var roleName = ROLE_PREFIX + modid;
            var role = await getOrCreateRole(guild, roleName, modid);
            if (!role) continue;
            var hasRole = member.roles.cache.has(role.id);
            if (isSelected && !hasRole) { await member.roles.add(role); addedRoles.push(roleName); }
            else if (!isSelected && hasRole) { await member.roles.remove(role); removedRoles.push(roleName); }
        }

        var responseText = '';
        if (addedRoles.length > 0) responseText += '**Added:** ' + addedRoles.join(', ') + NL;
        if (removedRoles.length > 0) responseText += '**Removed:** ' + removedRoles.join(', ') + NL;
        if (!responseText) responseText = 'Tidak ada perubahan role.';
        await interaction.editReply({ content: responseText });
    } catch (err) {
        await interaction.editReply({ content: 'Terjadi error saat mengupdate role.' });
    }
}

async function handleRoleStatsButton(interaction) {
    var guild = interaction.guild;
    var guildId = guild.id;

    try {
        await interaction.deferUpdate();
        var currentPage = await getRoleStatsPage(guildId);

        if (interaction.customId === 'mc_rolestats_prev') {
            currentPage = Math.max(0, currentPage - 1);
        } else if (interaction.customId === 'mc_rolestats_next') {
            currentPage = currentPage + 1;
        }

        var data = await collectRoleStatsData(guild);
        if (currentPage >= data.totalPages) currentPage = data.totalPages - 1;
        if (currentPage < 0) currentPage = 0;
        await setRoleStatsPage(guildId, currentPage);

        var result = buildRoleStatsPage(guild, data.roleData, data.uniqueUsers, currentPage, data.totalPages);
        await interaction.message.edit({ embeds: [result.embed], components: [result.row] });
    } catch (err) {
        console.error('[ModChecker][RoleStats] Button error:', err.message);
    }
}

// ============================================================
// INTERACTION HANDLER (called from index.js)
// ============================================================

async function handleModCheckerInteraction(interaction) {
    if (!db) return false; // service not initialized

    // Slash commands
    if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
            case 'setup': await handleSetupCommand(interaction); return true;
            case 'setup-roles': await handleSetupRolesCommand(interaction); return true;
            case 'gantt': await handleGanttCommand(interaction); return true;
            case 'refresh-roles': await handleRefreshRolesCommand(interaction); return true;
            case 'settings': await handleSettingsCommand(interaction); return true;
            default: return false;
        }
    }

    // Select menu
    if (interaction.isStringSelectMenu() && interaction.customId === 'mc_mod_role_picker') {
        await handleRolePickerInteraction(interaction);
        return true;
    }

    // Buttons
    if (interaction.isButton()) {
        if (interaction.customId === 'mc_rolestats_prev' || interaction.customId === 'mc_rolestats_next') {
            await handleRoleStatsButton(interaction);
            return true;
        }
    }

    return false; // not handled
}

// ============================================================
// START / STOP LOOPS
// ============================================================

function startLoops() {
    if (!db) return;

    console.log('[ModChecker] Starting check loop (every ' + (CHECK_INTERVAL / 1000) + 's)');
    checkModStatus();
    checkInterval = setInterval(checkModStatus, CHECK_INTERVAL);

    console.log('[ModChecker] Starting display loop (every ' + (DISPLAY_INTERVAL / 1000) + 's)');
    setTimeout(updateAllDisplayEmbeds, 5000);
    displayInterval = setInterval(updateAllDisplayEmbeds, DISPLAY_INTERVAL);

    console.log('[ModChecker] Starting role stats loop (every ' + (DISPLAY_INTERVAL / 1000) + 's)');
    setTimeout(updateAllRoleStatsEmbeds, 7000);
    roleStatsInterval = setInterval(updateAllRoleStatsEmbeds, DISPLAY_INTERVAL);

    console.log('[ModChecker] All loops started');
}

function stopLoops() {
    if (checkInterval) clearInterval(checkInterval);
    if (displayInterval) clearInterval(displayInterval);
    if (roleStatsInterval) clearInterval(roleStatsInterval);
    console.log('[ModChecker] Loops stopped');
}

async function shutdown() {
    stopLoops();
    if (mongoClient) {
        try { await mongoClient.close(); } catch (e) {}
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    init,
    startLoops,
    stopLoops,
    shutdown,
    handleModCheckerInteraction,
    getSlashCommands,
};
