/**
 * /poll - Create a poll
 * Simple poll with reactions
 */

const { SlashCommandBuilder, EmbedBuilder, InteractionContextType, ApplicationIntegrationType } = require('discord.js');
const { logger } = require('../middleware');

const POLL_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('📊 Buat polling!')
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall])
        .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel])
        .addStringOption(option =>
            option
                .setName('question')
                .setDescription('Pertanyaan polling')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('options')
                .setDescription('Pilihan (pisah dengan |) contoh: Ya | Tidak | Mungkin')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('duration')
                .setDescription('Durasi poll dalam menit (opsional)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(1440) // Max 24 hours
        ),

    async execute(interaction) {
        const question = interaction.options.getString('question');
        const optionsRaw = interaction.options.getString('options');
        const duration = interaction.options.getInteger('duration');

        // Parse options
        const options = optionsRaw.split('|').map(opt => opt.trim()).filter(opt => opt.length > 0);

        if (options.length < 2) {
            return interaction.reply({
                content: '❌ Minimal 2 pilihan! Pisahkan dengan `|`',
                ephemeral: true,
            });
        }

        if (options.length > 10) {
            return interaction.reply({
                content: '❌ Maksimal 10 pilihan!',
                ephemeral: true,
            });
        }

        // Build options string
        const optionsText = options
            .map((opt, i) => `${POLL_EMOJIS[i]} ${opt}`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`📊 ${question}`)
            .setDescription(optionsText)
            .setFooter({
                text: `Poll by ${interaction.user.displayName}${duration ? ` • Ends in ${duration} minutes` : ''}`,
                iconURL: interaction.user.displayAvatarURL(),
            })
            .setTimestamp();

        const reply = await interaction.reply({ embeds: [embed], fetchReply: true });

        // Add reaction options
        for (let i = 0; i < options.length; i++) {
            await reply.react(POLL_EMOJIS[i]);
        }

        logger.info('Poll created', {
            creator: interaction.user.tag,
            question: question,
            options: options.length,
        });

        // Auto-end poll if duration specified
        if (duration) {
            setTimeout(async () => {
                try {
                    const fetchedMessage = await interaction.channel.messages.fetch(reply.id);
                    
                    // Count votes
                    const results = [];
                    for (let i = 0; i < options.length; i++) {
                        const reaction = fetchedMessage.reactions.cache.get(POLL_EMOJIS[i]);
                        const count = reaction ? reaction.count - 1 : 0; // -1 for bot's reaction
                        results.push({ option: options[i], votes: count, emoji: POLL_EMOJIS[i] });
                    }

                    // Sort by votes
                    results.sort((a, b) => b.votes - a.votes);
                    const totalVotes = results.reduce((sum, r) => sum + r.votes, 0);

                    const resultsText = results
                        .map((r, i) => {
                            const percentage = totalVotes > 0 ? Math.round((r.votes / totalVotes) * 100) : 0;
                            const bar = '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
                            const medal = i === 0 && r.votes > 0 ? '👑 ' : '';
                            return `${medal}${r.emoji} **${r.option}**\n${bar} ${r.votes} votes (${percentage}%)`;
                        })
                        .join('\n\n');

                    const endEmbed = new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle(`📊 Poll Ended: ${question}`)
                        .setDescription(resultsText)
                        .setFooter({
                            text: `Total: ${totalVotes} votes`,
                        })
                        .setTimestamp();

                    await interaction.followUp({ embeds: [endEmbed] });
                } catch (error) {
                    logger.error('Poll end error', { error: error.message });
                }
            }, duration * 60 * 1000);
        }
    },
};
