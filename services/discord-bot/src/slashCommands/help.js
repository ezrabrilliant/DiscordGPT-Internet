/**
 * /help - Show all available commands
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const branding = require('../config/branding');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('📚 Lihat semua command yang tersedia')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),

    async execute(interaction) {
        const embed = branding.createEmbed({
            color: branding.COLORS.primary,
            title: '📚 Ezra Bot Commands',
            description: 'Berikut semua command yang tersedia:',
            fields: [
                {
                    name: '💬 Chat & AI',
                    value: [
                        '`/chat` - Chat dengan AI',
                        '`/remember` - Cari history percakapan user',
                        '`/roast` - Roast seseorang dengan AI',
                        '`zra <pesan>` - Chat langsung (tanpa slash)',
                    ].join('\n'),
                },
                {
                    name: '🎮 Fun',
                    value: [
                        '`/khodam` - Cek khodam seseorang',
                        '`/poll` - Buat polling',
                    ].join('\n'),
                },
                {
                    name: '📱 Direct Message',
                    value: [
                        'DM bot langsung tanpa prefix!',
                        'Aku akan ingat semua percakapan kita~',
                    ].join('\n'),
                },
                {
                    name: '💡 Tips',
                    value: [
                        '• Gunakan `/chat private:True` untuk response private',
                        '• RAG memory menyimpan semua percakapan',
                        '• Bot available 24/7, DM kapan aja!',
                    ].join('\n'),
                },
            ],
            footer: {},
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
