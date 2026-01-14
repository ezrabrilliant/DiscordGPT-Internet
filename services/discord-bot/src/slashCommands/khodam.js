/**
 * /khodam - Check spiritual guardian
 * Fun command to check someone's khodam
 */

const { SlashCommandBuilder, EmbedBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { KHODAM } = require('../config');
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

        // Create fancy embed
        const embed = new EmbedBuilder()
            .setColor(khodam === KHODAM.ESCAPE_MESSAGE ? 0xFF6B6B : 0x9B59B6)
            .setTitle('🔮 Hasil Cek Khodam')
            .setThumbnail(target.displayAvatarURL({ size: 128 }))
            .addFields(
                { name: '👤 Target', value: targetName, inline: true },
                { name: '✨ Khodam', value: `**${khodam}**`, inline: true },
            )
            .setFooter({
                text: `Diminta oleh ${interaction.user.displayName}`,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp();

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
