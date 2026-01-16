/**
 * /khodam - Check spiritual guardian
 * Fun command to check someone's khodam
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { KHODAM } = require('../config');
const branding = require('../config/branding');
const { logger } = require('../middleware');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('khodam')
        .setDescription('🔮 Cek khodam seseorang!')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('Siapa yang mau dicek khodamnya?')
                .setRequired(true)
        ),

    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const member = interaction.guild?.members.cache.get(target.id);
        const targetName = member?.nickname || target.displayName;

        // Generate khodam
        const khodam = generateKhodam();

        // Create embed using centralized branding
        const embed = branding.createEmbed({
            color: khodam === KHODAM.ESCAPE_MESSAGE ? branding.COLORS.error : branding.COLORS.khodam,
            title: '🔮 Hasil Cek Khodam',
            thumbnail: target.displayAvatarURL({ size: 128 }),
            fields: [
                { name: '👤 Target', value: targetName, inline: true },
                { name: '✨ Khodam', value: `**${khodam}**`, inline: true },
            ],
            footer: { extra: `by ${interaction.user.displayName}` },
        });

        await interaction.reply({ embeds: [embed] });

        logger.info('Khodam slash executed', {
            requester: interaction.user.tag,
            target: targetName,
            result: khodam,
        });
    },
};

/**
 * Generate random khodam
 */
function generateKhodam() {
    if (Math.random() < KHODAM.ESCAPE_CHANCE) {
        return KHODAM.ESCAPE_MESSAGE;
    }
    const first = KHODAM.FIRST[Math.floor(Math.random() * KHODAM.FIRST.length)];
    const second = KHODAM.SECOND[Math.floor(Math.random() * KHODAM.SECOND.length)];
    return `${first} ${second}`;
}
