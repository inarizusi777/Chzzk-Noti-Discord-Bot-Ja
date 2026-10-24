const axios = require('axios');

/**
 * Add a random delay of 0.1 to 0.3 seconds between requests.
 */
const sleep = () => {
    const ms = Math.floor(Math.random() * 201) + 100;
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Utility for making direct requests to the CHZZK API.
 * @param {string} path API path
 * @param {object} options Axios options
 */
async function fetchNaverApi(path, options = {}) {
    const isNngMain = path.startsWith('/nng_main');
    const baseDomain = isNngMain ? 'https://apis.naver.com' : 'https://api.chzzk.naver.com';
    const targetUrl = `${baseDomain}${path}`;

    await sleep();

    try {
        const response = await axios.get(targetUrl, {
            ...options,
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                ...options.headers
            }
        });
        return response.data;
    } catch (error) {
        console.error(`[chzzkFetcher] Direct Naver API call failed: ${error.message}`);
        throw error;
    }
}

module.exports = { fetchNaverApi };
