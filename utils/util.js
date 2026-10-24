const fs = require("fs");
const path = require('path');
const configPath = path.join(__dirname, '../config.json');
const { fetchNaverApi } = require('./chzzkFetcher');

let { api } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const utilItem = {};

/**
 * Extract the path and query string from a URL.
 */
function getPathOnly(url) {
    try {
        const parsedUrl = new URL(url);
        return parsedUrl.pathname + parsedUrl.search;
    } catch (e) {
        // Return the input unchanged if it is already a path.
        return url;
    }
}

// Reload API URLs from the config file.
utilItem.reloadApiConfig = function() {
    try {
        const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        api = newConfig.api;
        return true;
    } catch (err) {
        console.error("Failed to reload API settings:", err);
        return false;
    }
};

utilItem.getChannelInfo = async function (streamerId) {
    try {
        const fullUrl = api.channel.replace('{streamerId}', streamerId);
        const path = getPathOnly(fullUrl);
        
        const getData = await fetchNaverApi(path);

        if (getData.code === 200 && getData.content) {
            const content = getData.content;
            return {
                result: 200,
                name: content.channelName,
                profile: content.channelImageUrl || "https://ssl.pstatic.net/static/nng/glive/icon_profile_default.png"
            };
        }
        return { result: getData.code };
    } catch (err) {
        utilItem.importLog(`Channel API exception: ${err.message} (${streamerId})`);
        return { result: 404 };
    }
}

utilItem.getCommunityRecentlyInfo = async function (streamerId) {
    try {
        const fullUrl = api.community.replace('{streamerId}', streamerId);
        const path = getPathOnly(fullUrl);
        
        const getData = await fetchNaverApi(path, {
            headers: {
                'Content-Type': "application/xml"
            }
        });

        if (getData.code === 200 && getData.content && getData.content.comments && getData.content.comments.data.length > 0) {
            const comment = getData.content.comments.data[0];
            const commentData = comment.comment;
            
            return {
                result: 200,
                name: comment.user.userNickname,
                profile: comment.user.profileImageUrl || "https://ssl.pstatic.net/static/nng/glive/icon_profile_default.png",
                communityId: commentData.commentId,
                contents: commentData.content,
                img: commentData.attaches ? commentData.attaches[0].attachValue : null
            };
        }
        return { result: 404 };
    } catch (err) {
        utilItem.importLog(`Community API exception: ${err.message} (${streamerId})`);
        return { result: 404 };
    }
}

utilItem.getLiveInfo = async function (streamerId) {
    try {
        const fullUrl = api.live.replace('{streamerId}', streamerId);
        const path = getPathOnly(fullUrl);
        
        const getData = await fetchNaverApi(path);

        if (getData.code === 200 && getData.content) {
            const content = getData.content;
            return {
                status: content.status, // "OPEN" or "CLOSE"
                liveId: content.liveId,
                liveTitle: content.liveTitle,
                liveCategoryValue: content.liveCategoryValue,
                liveImageUrl: content.liveImageUrl,
                channelName: content.channel.channelName,
                channelProfile: content.channel.channelImageUrl || "https://ssl.pstatic.net/static/nng/glive/icon_profile_default.png",
                result: 200
            };
        }
        return { result: getData.code };
    } catch (err) {
        utilItem.importLog(`Live API exception: ${err.message} (${streamerId})`);
        return { result: 404 };
    }
}

utilItem.searchStreamer = async function (keyword) {
    try {
        const fullUrl = api.search.replace('{keyword}', encodeURIComponent(keyword));
        const path = getPathOnly(fullUrl);
        
        const getData = await fetchNaverApi(path);

        if (getData.code === 200 && getData.content && getData.content.data.length > 0) {
            const channel = getData.content.data[0].channel;
            return {
                id: channel.channelId,
                name: channel.channelName,
                profile: channel.channelImageUrl || "https://ssl.pstatic.net/static/nng/glive/icon_profile_default.png",
                result: 200
            };
        }
        return { result: 404 }; // Not Found
    } catch (err) {
        return { result: 404 };
    }
}

utilItem.importLog = function (content) {
    // Get the current date.
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const fileName = `${year}-${month}-${day}.log`;

    // Build the log directory and file paths.
    const logDir = path.join(__dirname, 'log');
    const logFilePath = path.join(logDir, fileName);

    // Format the log entry with the current time.
    const timestamp = now.toLocaleTimeString();
    const logMessage = `[${timestamp}] ${content}\n`;

    // Create the log directory if it does not exist.
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // Append the entry to the log file.
    fs.appendFileSync(logFilePath, logMessage, 'utf8');
}

module.exports = utilItem;