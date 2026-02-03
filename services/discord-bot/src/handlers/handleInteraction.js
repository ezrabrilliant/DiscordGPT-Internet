/**
 * Handle Button Interactions
 * Processes button clicks and responds with detailed information
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const wintercodeClient = require('../services/wintercodeClient');
const memoryService = require('../services/memoryService');
const conversationService = require('../services/conversationService');
const { logger } = require('../middleware');

/**
 * Handle button interaction
 */
async function handleButtonInteraction(interaction) {
    const { user, channel, customId } = interaction;

    try {
        // Defer reply (show loading state)
        await interaction.deferReply();

        // Parse customId
        // Format: "select_{userId}|{optionIndex}|{optionName}|{originalQuery}"
        const parts = customId.split('|');
        const userId = parts[0].replace('select_', '');
        const optionIndex = parseInt(parts[1]);
        const optionName = decodeURIComponent(parts[2]);
        const originalQuery = decodeURIComponent(parts[3]);

        logger.info(`Button clicked: ${user.username} selected "${optionName}" from query: "${originalQuery}"`);

        // Get conversation context
        const thread = conversationService.getThread(user.id);
        const userData = await memoryService.getUserData(user.id);

        // Format thread history for API
        const history = thread ? thread.messages : [];

        // Build detailed query - AI will generate detailed response for this option
        const detailQuery = `User memilih: "${optionName}" dari pertanyaan "${originalQuery}". Berikan rekomendasi SPESIFIK, DETAIL, dan KONKRET hanya untuk "${optionName}". Jangan jelaskan opsi lain. Berikan contoh nyata, rekomendasi spesifik, dan tips yang bisa langsung dipraktikkan. Singkat tapi padat.`;

        // Get AI response with detail
        const response = await wintercodeClient.chat(detailQuery, {
            userId: user.id,
            username: user.username,
            serverId: channel.guildId,
            history: history,
            profile: userData?.profile
        });

        // Check if response is successful
        if (!response.success) {
            throw new Error(response.error || 'AI response failed');
        }

        // Split response into pages by ### headers
        let finalPages = [];
        
        // Try to split by ### (numbered headers like ### 1., ### 2., etc)
        const hashPattern = /\n###\s+\d+\./;
        if (hashPattern.test(response.response)) {
            const sections = response.response.split(hashPattern);
            
            // First section is the intro (before first ###)
            finalPages.push(sections[0]);
            
            // Each subsequent section is a page (restore the ### header)
            for (let i = 1; i < sections.length; i++) {
                finalPages.push('### ' + sections[i]);
            }
        } else {
            // Try split by --- separator
            const dashPages = response.response.split(/\n---\n/);
            if (dashPages.length > 1) {
                finalPages = dashPages;
            } else {
                // No separators found, use single page
                finalPages = [response.response];
            }
        }
        
        // Fallback: if still single page but too long, split by character limit
        if (finalPages.length === 1 && response.response.length > 3000) {
            finalPages = [];
            const chunkSize = 3000;
            for (let i = 0; i < response.response.length; i += chunkSize) {
                finalPages.push(response.response.slice(i, i + chunkSize));
            }
        }
        
        logger.info('Response split into pages', {
            totalPages: finalPages.length,
            responseLength: response.response.length,
            firstPagePreview: finalPages[0]?.substring(0, 100)
        });

        // Function to create embed for a page
        const createPageEmbed = (pageText, pageNum, totalPages, displayOptionNum) => {
            return new EmbedBuilder()
                .setTitle(`✅ Pilihan ${displayOptionNum}${totalPages > 1 ? ` (Halaman ${pageNum}/${totalPages})` : ''}`)
                .setDescription(pageText.slice(0, 4096))
                .setColor('#00ff88')
                .setFooter({ text: `Powered by ${response.provider}${totalPages > 1 ? ` • Halaman ${pageNum}/${totalPages}` : ''}` })
                .setTimestamp();
        };

        // Function to create navigation buttons
        const createNavigationButtons = (currentPage, totalPages) => {
            const row = new ActionRowBuilder();
            
            // Previous button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_prev_${user.id}_${optionIndex}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0)
            );
            
            // Page indicator
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_indicator_${user.id}_${optionIndex}`)
                    .setLabel(`${currentPage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );
            
            // Next button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_next_${user.id}_${optionIndex}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === totalPages - 1)
            );
            
            return row;
        };

        // Delete the defer reply (loading state)
        await interaction.deleteReply();

        // Send first page
        const firstEmbed = createPageEmbed(finalPages[0], 1, finalPages.length, optionIndex + 1);
        
        let components = [];
        if (finalPages.length > 1) {
            const row = createNavigationButtons(0, finalPages.length);
            components = [row]; // Wrap ActionRowBuilder in array
        }
        
        logger.info('Sending paginated response', {
            totalPages: finalPages.length,
            hasComponents: components.length > 0,
            componentsStructure: components.map(c => ({
                isActionRow: c instanceof ActionRowBuilder,
                componentsCount: c.components?.length
            }))
        });
        
        const sentMessage = await channel.send({ 
            embeds: [firstEmbed], 
            components: components
        });
        
        logger.info('Message sent', {
            messageId: sentMessage.id,
            componentsCount: sentMessage.components.length
        });

        // Store pages in memory for navigation (cache for 10 minutes)
        if (finalPages.length > 1) {
            const pageCache = require('./pageCache');
            pageCache.setPages(sentMessage.id, {
                userId: user.id,
                optionIndex: optionIndex,
                displayOptionNum: optionIndex + 1, // Store the actual option number (1, 2, 3, etc)
                pages: finalPages,
                totalPages: finalPages.length,
                optionName: optionName,
                originalQuery: originalQuery,
                provider: response.provider,
                timestamp: Date.now()
            });
        }

        // Save to memory (save full response)
        await memoryService.addConversation(
            user.id,
            user.username,
            `Pilihan: ${optionName} (dari: ${originalQuery})`,
            response.response,
            false,
            'neutral'
        );

        // Update conversation thread
        conversationService.addToThread(user.id, 'user', `Pilihan: ${optionName}`);
        conversationService.addToThread(user.id, 'assistant', response.response);

        // Log to messages.log
        wintercodeClient.logConversation({
            server: channel.guildId || 'DM',
            user: user.id,
            username: user.username,
            query: `Pilihan: ${optionName} (dari: ${originalQuery})`,
            reply: response.response,
            hasImage: false
        });

        logger.info(`Button interaction completed for ${user.username}`, { 
            pages: finalPages.length,
            responseLength: response.response.length 
        });

    } catch (error) {
        logger.error('Error handling button interaction', { error: error.message });

        try {
            // Edit the defer reply with error message
            await interaction.editReply({
                content: '❌ Maaf, terjadi kesalahan saat memproses pilihanmu. Coba lagi ya!',
                embeds: [],
                components: []
            });
        } catch (editError) {
            logger.error('Error editing reply', { error: editError.message });
        }
    }
}

/**
 * Main interaction handler
 */
async function handleInteraction(interaction) {
    // Handle pagination buttons
    if (interaction.isButton() && (interaction.customId.startsWith('page_prev_') || interaction.customId.startsWith('page_next_'))) {
        await handlePageNavigation(interaction);
        return;
    }

    // Handle selection buttons
    if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
        return;
    }
}

/**
 * Handle page navigation (Prev/Next buttons)
 */
async function handlePageNavigation(interaction) {
    const { user, message, customId } = interaction;

    try {
        await interaction.deferUpdate();

        const pageCache = require('./pageCache');
        const cacheData = pageCache.getPages(message.id);

        if (!cacheData) {
            await interaction.editReply({
                content: '❌ Data halaman sudah kadaluarsa. Silakan minta rekomendasi lagi.',
                components: []
            });
            return;
        }

        // Parse customId
        const parts = customId.split('_');
        const direction = parts[1]; // 'prev' or 'next'
        const optionIndex = parseInt(parts[2]);

        // Get current page from message embed title
        const currentEmbed = message.embeds[0];
        const titleMatch = currentEmbed.title.match(/\(Halaman (\d+)\/(\d+)\)/);
        const currentPage = titleMatch ? parseInt(titleMatch[1]) - 1 : 0;

        // Calculate new page
        let newPage = currentPage;
        if (direction === 'prev' && currentPage > 0) {
            newPage = currentPage - 1;
        } else if (direction === 'next' && currentPage < cacheData.totalPages - 1) {
            newPage = currentPage + 1;
        }

        // Create new embed and buttons
        const createPageEmbed = (pageText, pageNum, totalPages) => {
            return new EmbedBuilder()
                .setTitle(`✅ Pilihan ${optionIndex + 1}${totalPages > 1 ? ` (Halaman ${pageNum}/${totalPages})` : ''}`)
                .setDescription(pageText.slice(0, 4096))
                .setColor('#00ff88')
                .setFooter({ text: `Powered by ${cacheData.provider}${totalPages > 1 ? ` • Halaman ${pageNum}/${totalPages}` : ''}` })
                .setTimestamp();
        };

        const createNavigationButtons = (currentPageNum, totalPages) => {
            const row = new ActionRowBuilder();
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_prev_${user.id}_${optionIndex}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPageNum === 0)
            );
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_indicator_${user.id}_${optionIndex}`)
                    .setLabel(`${currentPageNum + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`page_next_${user.id}_${optionIndex}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPageNum === totalPages - 1)
            );
            
            return row;
        };

        const newEmbed = createPageEmbed(cacheData.pages[newPage], newPage + 1, cacheData.totalPages);
        const newButtons = createNavigationButtons(newPage, cacheData.totalPages);

        await message.edit({
            embeds: [newEmbed],
            components: [newButtons]
        });

        logger.info(`Page navigation: ${user.username} moved to page ${newPage + 1}/${cacheData.totalPages}`);

    } catch (error) {
        logger.error('Error handling page navigation', { error: error.message });
    }
}

module.exports = { handleInteraction };
