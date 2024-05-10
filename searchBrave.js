const axios = require('axios');

const BraveKey = process.env.BRAVE_KEY;
const apiUrl = 'https://api.search.brave.com/res/v1/images/search';

async function searchImages(query, count = 1, safesearch) {
    try {
        const params = {
            q: query,
            safesearch: safesearch,
            count: count,
            search_lang: 'en',
            country: 'ID',
            spellcheck: false,
        };

        const headers = {
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip',
            'X-Subscription-Token': BraveKey,
        };

        const response = await axios.get(apiUrl, { params, headers });

        const responseData = response.data;

        if (responseData.results && responseData.results.length > 0) {
            const selectedResults = responseData.results.slice(0, count);

            const imageUrls = selectedResults.map((result) => {
                if (result.thumbnail && result.thumbnail.src) {
                    return result.thumbnail.src;
                }
                return null;
            });

            return imageUrls.filter(url => url !== null);
        } else {
            console.log('No image results found.');
            return [];
        }
    } catch (error) {
        console.error('Error making API request:', error.message);
    }
}

module.exports = searchImages;
