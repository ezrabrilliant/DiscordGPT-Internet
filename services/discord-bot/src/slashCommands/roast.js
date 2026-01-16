/**
 * /roast - Roast someone using AI
 * Fun command to roast a user
 */

const { SlashCommandBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const aiClient = require('../services/aiClient');
const { logger } = require('../middleware');
const branding = require('../config/branding');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('🔥 Roast seseorang dengan AI!')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addUserOption(option =>
            option
                .setName('target')
                .setDescription('Siapa yang mau di-roast?')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('style')
                .setDescription('Gaya roasting')
                .setRequired(false)
                .addChoices(
                    { name: '😈 Savage', value: 'savage' },
                    { name: '😂 Lucu', value: 'funny' },
                    { name: '🤓 Nerd', value: 'nerd' },
                    { name: '👴 Boomer', value: 'boomer' },
                )
        ),

    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const style = interaction.options.getString('style') || 'funny';
        const member = interaction.guild?.members.cache.get(target.id);
        const targetName = member?.nickname || target.displayName;

        // Don't roast the bot
        if (target.id === interaction.client.user.id) {
            return interaction.reply({
                content: '😏 Nice try, tapi aku ga bisa roast diriku sendiri~',
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        try {
            const stylePrompts = {
                savage: 'roast dengan sangat pedas dan savage, tanpa ampun',
                funny: 'roast dengan lucu dan menghibur',
                nerd: 'roast dengan referensi nerd/geek/gaming',
                boomer: 'roast dengan gaya boomer/oldschool',
            };

            const query = `Tolong ${stylePrompts[style]} orang bernama "${targetName}". Buat dalam 2-3 kalimat saja, dalam bahasa Indonesia yang gaul. Jangan terlalu kasar, tetap sopan tapi menusuk.`;

            const result = await aiClient.chat(query, {
                username: interaction.user.username,
                userId: interaction.user.id,
                serverId: interaction.guild?.id || 'DM',
                serverName: interaction.guild?.name || 'DM',
                channelId: interaction.channel?.id,
                channelName: interaction.channel?.name || 'Unknown',
            });

            if (result.success) {
                const styleEmojis = {
                    savage: '😈',
                    funny: '😂',
                    nerd: '🤓',
                    boomer: '👴',
                };

                const embed = branding.createEmbed({
                    color: branding.COLORS.roast,
                    title: '🔥 Roasted!',
                    thumbnail: target.displayAvatarURL({ size: 128 }),
                    description: result.response,
                    fields: [
                        { name: '🎯 Target', value: targetName, inline: true },
                        { name: `${styleEmojis[style]} Style`, value: style.charAt(0).toUpperCase() + style.slice(1), inline: true },
                    ],
                    footer: { provider: result.provider, extra: `by ${interaction.user.displayName}` },
                });

                await interaction.editReply({ embeds: [embed] });

                logger.info('Roast command executed', {
                    requester: interaction.user.tag,
                    target: targetName,
                    style: style,
                });
            } else {
                await interaction.editReply({
                    content: '❌ AI ga mood buat roast sekarang. Coba lagi!',
                });
            }
        } catch (error) {
            logger.error('Roast command error', { error: error.message });
            await interaction.editReply({
                content: '❌ Gagal roast. AI-nya lagi error!',
            });
        }
    },
};
