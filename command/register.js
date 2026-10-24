const {EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");
const util = require('../utils/util');
const db = require('../utils/db');

const register = {};

register.getList = async function(context) {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        const subscriptions = await db.getSubscriptionsForChannel(channel.id);

        if (subscriptions.length > 0) {
            const exampleEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`このチャンネルには${subscriptions.length}人の配信者が登録されています`)
                .setTimestamp()

            subscriptions.forEach(item => {
                exampleEmbed.addFields({
                    name: item.name,
                    value: item.streamer_id,
                    inline: true
                })
            })

            if (isInteraction) {
                await context.reply({ embeds: [exampleEmbed] });
            } else {
                await channel.send({ embeds: [exampleEmbed] });
            }

        } else {
            const msg = "このチャンネルには配信者が登録されていません。\n" +
                "配信者の名前または固有IDを指定して /register から登録してください。";
            if (isInteraction) {
                await context.reply(msg);
            } else {
                await channel.send(msg);
            }
        }
    } catch (err) {
        console.error(`[${channel.id}] Error sending streamer list:`, err.message);
    }
}

register.import = async (context, input) => {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        util.importLog(`Attempting to register ${input} in channel ${channel.id}`);

        let streamerId = input;
        let streamerName = "";

        // Search by name when the input is not a 32-character streamer ID.
        const isIdFormat = /^[a-f0-9]{32}$/.test(input);
        
        if (!isIdFormat) {
            const searchResult = await util.searchStreamer(input);
            if (searchResult.result === 200) {
                streamerId = searchResult.id;
                streamerName = searchResult.name;
                util.importLog(`Search result for ${input}: ${streamerName} (${streamerId})`);
            } else {
                const msg = `配信者「${input}」が見つかりません。名前を確認して、もう一度お試しください。`;
                if (isInteraction) await context.reply(msg);
                else await channel.send(msg);
                return;
            }
        }

        // Check whether the streamer is already registered.
        const subs = await db.getSubscriptionsForChannel(channel.id);
        if (subs.some(s => s.streamer_id === streamerId)) {
            const alreadyName = subs.find(s => s.streamer_id === streamerId).name;
            const msg = `配信者「${alreadyName}」はすでにこのチャンネルに登録されています。`;
            if (isInteraction) await context.reply(msg);
            else await channel.send(msg);
            util.importLog(`Failed to register ${streamerId} in channel ${channel.id}: duplicate request`);
            return;
        }

        if (isInteraction) await context.deferReply();

        // 1. Get the channel name and profile.
        const channelInfo = await util.getChannelInfo(streamerId);
        
        if (channelInfo.result !== 200) {
            const msg = "配信者の情報を取得できませんでした。\n" +
                "IDが正しくないか、CHZZKで一時的な問題が発生している可能性があります。\n" +
                "配信者ページのURLからIDを確認してください: https://chzzk.naver.com/{streamerId}";
            
            if (isInteraction) await context.editReply(msg);
            else await channel.send(msg);

            util.importLog(`Failed to register ${streamerId} in channel ${channel.id}: unable to fetch channel info`);
            return;
        }

        let name = channelInfo.name;
        let profile = channelInfo.profile;

        // 2. Get recent activity (community posts and live status).
        const communityInfo = await util.getCommunityRecentlyInfo(streamerId);
        const liveInfo = await util.getLiveInfo(streamerId);

        let communityId = 0;
        let contents = "No community posts yet.";
        let img = null;

        if (communityInfo.result == 200) {
            communityId = communityInfo.communityId;
            contents = communityInfo.contents;
            img = communityInfo.img;
        }

        const liveId = (liveInfo.result === 200 && liveInfo.liveId) ? liveInfo.liveId : 0;
        const isLive = liveInfo.result === 200 && liveInfo.status === "OPEN";

        // Insert or update streamer information.
        await db.dbRun(`
            INSERT INTO streamers (id, name, recent_community_id, recent_live_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name
        `, [streamerId, name, communityId, liveId]);

        // Add the channel subscription.
        let notifyType = 'all';
        if (isInteraction) {
            notifyType = context.options.getString('type') || 'all';
        }
        await db.addSubscription(channel.id, streamerId, notifyType);

        const exampleEmbed = new EmbedBuilder()
            .setColor(isLive ? 0x00FF00 : 0x0099FF)
            .setAuthor({
                name: name + " を登録しました",
                iconURL: profile
            })
            .setTimestamp();

        // Prefer the live thumbnail while streaming; otherwise use the community image.
        const liveThumbnail = liveInfo.liveImageUrl ? liveInfo.liveImageUrl.replace('{type}', '1080') + "?t=" + Date.now() : null;
        const finalImage = isLive ? (liveThumbnail || img) : (img || null);
        exampleEmbed.setImage(finalImage);

        // Add community information while keeping within Discord's field limit.
        let communityText = contents;
        if (!communityText || communityText.trim() === "") {
            communityText = img ? "画像付きの投稿です。ボタンから内容を確認してください。" : "コミュニティ投稿はまだありません。";
        }

        if (communityText.length > 900) {
            communityText = communityText.substring(0, 900) + "...（全文はボタンから確認できます）";
        }

        exampleEmbed.addFields({
            name: "最新のコミュニティ投稿",
            value: communityText,
            inline: false
        });

        // Add live stream information.
        const liveStatusText = isLive ? `🔴 配信中: ${liveInfo.liveTitle}` : `⚪ オフライン（前回の配信: ${liveInfo.liveTitle || '不明'}）`;
        exampleEmbed.addFields({
            name: "配信状況",
            value: liveStatusText,
            inline: false
        });

        // Link to the latest post when available, otherwise to the community page.
        const noticeUrl = communityId > 0 
            ? `https://chzzk.naver.com/${streamerId}/community/detail/${communityId}`
            : `https://chzzk.naver.com/${streamerId}/community`;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('コミュニティ投稿を見る')
                    .setStyle(ButtonStyle.Link)
                    .setURL(noticeUrl),
                new ButtonBuilder()
                    .setLabel('配信を見る')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://chzzk.naver.com/live/${streamerId}`)
            );

        if (isInteraction) await context.editReply({ embeds: [exampleEmbed], components: [row] });
        else await channel.send({ embeds: [exampleEmbed], components: [row] });
        
        util.importLog(`Registered ${streamerId} in channel ${channel.id}`);

    } catch(err) {
        console.error(`[${channel.id}] Registration error:`, err.message);
        util.importLog(`Error registering streamer in channel ${channel.id}: ${err.message}`);
    }
}

register.delete = async (context, input) => {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        util.importLog(`Attempting to remove ${input} from channel ${channel.id}`);

        let streamerId = input;

        // Search by name when the input is not a 32-character streamer ID.
        const isIdFormat = /^[a-f0-9]{32}$/.test(input);
        
        if (!isIdFormat) {
            const searchResult = await util.searchStreamer(input);
            if (searchResult.result === 200) {
                streamerId = searchResult.id;
            } else {
                const msg = `配信者「${input}」が見つかりません。`;
                if (isInteraction) await context.reply(msg);
                else await channel.send(msg);
                return;
            }
        }

        const subs = await db.getSubscriptionsForChannel(channel.id);
        const streamerSub = subs.find(s => s.streamer_id === streamerId);

        if (!streamerSub) {
            const msg = "この配信者は登録されていません。\n登録済みの配信者は /list で確認できます。";
            if (isInteraction) await context.reply(msg);
            else await channel.send(msg);
            util.importLog(`Failed to remove ${streamerId} from channel ${channel.id}: no matching subscription`);
            return;
        }

        await db.removeSubscription(channel.id, streamerId);
        await db.removeStreamerIfNoSubs(streamerId);

        const successMsg = `「${streamerSub.name}」（${streamerId}）を削除しました。`;
        if (isInteraction) await context.reply(successMsg);
        else await channel.send(successMsg);
        
        util.importLog(`Removed ${streamerId} from channel ${channel.id}`);

    } catch(err) {
        console.error(`[${channel.id}] Deletion error:`, err.message);
        util.importLog(`Error removing streamer from channel ${channel.id}: ${err.message}`);
    }
}

module.exports = register;