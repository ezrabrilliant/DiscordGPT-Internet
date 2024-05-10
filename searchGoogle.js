const { google } = require('googleapis');
const customsearch = google.customsearch('v1');

async function searchGoogle(query) {
    try {
        const response = await customsearch.cse.list({
            cx: process.env.GOOGLE_SEARCH_ID,
            q: query,
            auth: process.env.GOOGLE_API_KEY
        });

        const searchResults = response.data.items.map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
        }));
        
        return searchResults;
        
    } catch (error) {
        console.error("Terjadi kesalahan dalam melakukan pencarian:", error.message);
    }
}

module.exports = searchGoogle;
