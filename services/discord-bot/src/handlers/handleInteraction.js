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
        // Format: "ezb_select_{userId}|{optionIndex}|{optionName}"
        // Note: query NOT in customId (avoid 64 char limit), get from cache
        const parts = customId.split('|');
        const userId = parts[0].replace('ezb_select_', '');
        const optionIndex = parseInt(parts[1]);
        const optionName = decodeURIComponent(parts[2] || 'unknown');

        // Get original query from cache
        const pageCache = require('./pageCache');
        const originalQuery = (await pageCache.getQuery(user.id)) || 'rekomendasi';

        logger.info(`Button clicked: ${user.username} selected "${optionName}" (optionIndex: ${optionIndex}, optionIndex+1: ${optionIndex + 1}) from query: "${originalQuery}"`);

        // Get conversation context
        const thread = conversationService.getThread(user.id);
        const userData = await memoryService.getUserData(user.id);

        // Format thread history for API
        const history = thread ? thread.messages : [];

        // Build detailed query - AI will generate detailed response for this option
        const detailQuery = `User memilih: "${optionName}" dari pertanyaan "${originalQuery}". Berikan rekomendasi SPESIFIK, DETAIL, dan KONKRET hanya untuk "${optionName}". Jangan jelaskan opsi lain. Berikan contoh nyata, rekomendasi spesifik, dan tips yang bisa langsung dipraktikkan. Singkat tapi padat.`;

        // Get AI response with detail - use WinterCode (powerful) for details
        const response = await wintercodeClient.chat(detailQuery, {
            userId: user.id,
            username: user.username,
            serverId: channel.guildId,
            history: history,
            profile: userData?.profile,
            model: 'gemini-3-flash-preview' // Use powerful model for detail responses
        });

        // Check if response is successful
        if (!response.success) {
            throw new Error(response.error || 'AI response failed');
        }

        // Split response into pages - ALL ### headers become separate pages
        let finalPages = [];
        
        // Split by ### (any format: ### 1., ### Title, etc)
        const hashPattern = /\n###\s*/;
        
        if (hashPattern.test(response.response)) {
            // Split by all ### headers
            const sections = response.response.split(hashPattern);
            
            // Keep everything BEFORE first ### as intro (page 1)
            if (sections[0].trim()) {
                finalPages.push(sections[0].trim());
            }
            
            // Each section after ### becomes its own page
            for (let i = 1; i < sections.length; i++) {
                const sectionText = sections[i].trim();
                if (sectionText) {
                    finalPages.push('### ' + sectionText);
                }
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
                    .setCustomId(`ezb_page_prev_${user.id}_${optionIndex}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0)
            );
            
            // Page indicator
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ezb_page_ind_${user.id}_${optionIndex}`)
                    .setLabel(`${currentPage + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );
            
            // Next button
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ezb_page_next_${user.id}_${optionIndex}`)
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
        
        // Tag user after sending
        await channel.send(`${user.toString()} Rekomendasi sudah muncul! Cek di atas 👆`);
        
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
    // Handle recommendation pagination buttons (page_prev_, page_next_)
    if (interaction.isButton() && (interaction.customId.startsWith('ezb_page_prev_') || interaction.customId.startsWith('ezb_page_next_'))) {
        await handlePageNavigation(interaction);
        return;
    }

    // Handle embed pagination buttons from handleMessage (ezb_msg_page_prev_, ezb_msg_page_next_)
    if (interaction.isButton() && (interaction.customId.startsWith('ezb_msg_page_prev_') || interaction.customId.startsWith('ezb_msg_page_next_'))) {
        await handleMsgPageNavigation(interaction);
        return;
    }

    // Handle selection buttons (ezb_select_)
    if (interaction.isButton() && interaction.customId.startsWith('ezb_select_')) {
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

        // Parse customId: "ezb_page_prev_{userId}_{optionIndex}" or "ezb_page_next_{userId}_{optionIndex}"
        // Split: [ezb, page, prev/next, userId, optionIndex]
        const parts = customId.split('_');
        const direction = parts[2]; // 'prev' or 'next'
        const optionIndex = parseInt(parts[parts.length - 1]); // last part is always optionIndex

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
        const createPageEmbed = (pageText, pageNum, totalPages, displayOptionNum) => {
            return new EmbedBuilder()
                .setTitle(`✅ Pilihan ${displayOptionNum}${totalPages > 1 ? ` (Halaman ${pageNum}/${totalPages})` : ''}`)
                .setDescription(pageText.slice(0, 4096))
                .setColor('#00ff88')
                .setFooter({ text: `Powered by ${cacheData.provider}${totalPages > 1 ? ` • Halaman ${pageNum}/${totalPages}` : ''}` })
                .setTimestamp();
        };

        const createNavigationButtons = (currentPageNum, totalPages) => {
            const row = new ActionRowBuilder();
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ezb_page_prev_${user.id}_${optionIndex}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPageNum === 0)
            );
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ezb_page_ind_${user.id}_${optionIndex}`)
                    .setLabel(`${currentPageNum + 1}/${totalPages}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`ezb_page_next_${user.id}_${optionIndex}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPageNum === totalPages - 1)
            );
            
            return row;
        };

        // Use displayOptionNum from cache, fallback to parsed optionIndex + 1, fallback to '?'
        const displayNum = cacheData.displayOptionNum || (!isNaN(optionIndex) ? optionIndex + 1 : '?');
        const newEmbed = createPageEmbed(cacheData.pages[newPage], newPage + 1, cacheData.totalPages, displayNum);
        const newButtons = createNavigationButtons(newPage, cacheData.totalPages);

        await message.edit({
            embeds: [newEmbed],
            components: [newButtons]
        });

        logger.info(`Page navigation: ${user.username} moved to page ${newPage + 1}/${cacheData.totalPages}`, {
            displayOptionNum: displayNum,
            cacheKeys: Object.keys(cacheData)
        });

    } catch (error) {
        logger.error('Error handling page navigation', { error: error.message });
    }
}

/**
 * Handle msg page navigation (Prev/Next for embed responses from handleMessage)
 */
async function handleMsgPageNavigation(interaction) {
    const { user, message, customId } = interaction;

    try {
        await interaction.deferUpdate();

        const pageCache = require('./pageCache');
        const cacheData = pageCache.getPages(message.id);

        if (!cacheData) {
            await interaction.editReply({
                content: '❌ Data halaman sudah kadaluarsa. Silakan tanya lagi.',
                components: []
            });
            return;
        }

        // Parse direction from customId: "ezb_msg_page_prev_{messageId}" or "ezb_msg_page_next_{messageId}"
        const direction = customId.includes('_prev_') ? 'prev' : 'next';

        // Get current page from embed footer
        const currentEmbed = message.embeds[0];
        const footerMatch = currentEmbed.footer?.text?.match(/Page (\d+)\/(\d+)/);
        const currentPage = footerMatch ? parseInt(footerMatch[1]) - 1 : 0;

        // Calculate new page
        let newPage = currentPage;
        if (direction === 'prev' && currentPage > 0) {
            newPage = currentPage - 1;
        } else if (direction === 'next' && currentPage < cacheData.totalPages - 1) {
            newPage = currentPage + 1;
        }

        // Recreate embed (same style as handleMessage.js)
        const newEmbed = new EmbedBuilder()
            .setColor(cacheData.hasImages ? 0x0099FF : 0x00FF00)
            .setDescription(cacheData.pages[newPage].slice(0, 4096))
            .setFooter({ text: `Powered by ${cacheData.provider} ${cacheData.moodEmoji || ''}${cacheData.totalPages > 1 ? ` • Page ${newPage + 1}/${cacheData.totalPages}` : ''}` });

        if (cacheData.image) {
            newEmbed.setImage(cacheData.image);
        }

        // Recreate navigation buttons
        const row = new ActionRowBuilder();
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ezb_msg_page_prev_${cacheData.messageId}`)
                .setLabel('◀ Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage === 0)
        );
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ezb_msg_page_ind_${cacheData.messageId}`)
                .setLabel(`${newPage + 1}/${cacheData.totalPages}`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`ezb_msg_page_next_${cacheData.messageId}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage === cacheData.totalPages - 1)
        );

        await message.edit({
            embeds: [newEmbed],
            components: [row]
        });

        logger.info(`Msg page navigation: ${user.username} moved to page ${newPage + 1}/${cacheData.totalPages}`);

    } catch (error) {
        logger.error('Error handling msg page navigation', { error: error.message });
    }
}

module.exports = { handleInteraction };
