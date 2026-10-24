const db = require('../utils/db');
const util = require('../utils/util');

const message_set = {};

message_set.execute = async (context) => {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    if (!isInteraction) return; // This command only works with slash commands.

    try {
        const streamerInput = context.options.getString('streamer');
        const type = context.options.getString('type');
        const mentionRole = context.options.getRole('mention_role');
        const customMessage = context.options.getString('message') || null;

        // Find the streamer.
        let streamerId = streamerInput;
        const isIdFormat = /^[a-f0-9]{32}$/.test(streamerInput);
        if (!isIdFormat) {
            const searchResult = await util.searchStreamer(streamerInput);
            if (searchResult.result === 200) {
                streamerId = searchResult.id;
            } else {
                return await context.reply(`配信者「${streamerInput}」が見つかりません。名前を確認して、もう一度お試しください。`);
            }
        }

        // Check whether the streamer is registered in this channel.
        const subs = await db.getSubscriptionsForChannel(channel.id);
        const streamerSub = subs.find(s => s.streamer_id === streamerId);
        
        if (!streamerSub) {
            return await context.reply("この配信者はこのチャンネルに登録されていません。先に /register で登録してください。");
        }

        // Determine the mention type.
        let finalMentionType = 'none';
        let finalMentionRoleId = null;

        if (mentionRole) {
            if (mentionRole.name === '@everyone' || mentionRole.id === context.guildId) {
                finalMentionType = '@everyone';
            } else {
                finalMentionType = 'role';
                finalMentionRoleId = mentionRole.id;
            }
        }

        // Update the database.
        await db.updateSubscriptionConfig(channel.id, streamerId, type, finalMentionType, finalMentionRoleId, customMessage);

        // Build the confirmation message.
        const notificationType = type === 'community' ? 'コミュニティ' : '配信開始';
        let mentionStr = 'メンションなし';
        if (finalMentionType === '@everyone') mentionStr = '@everyone';
        else if (finalMentionType === '@here') mentionStr = '@here';
        else if (finalMentionType === 'role') mentionStr = `<@&${finalMentionRoleId}>`;

        let msgStr = customMessage || '（デフォルトメッセージ）';

        const successMsg = `✅ **${streamerSub.name}** の **${notificationType}** 通知設定を更新しました。\n- **メンション:** ${mentionStr}\n- **メッセージ:** ${msgStr}`;
        await context.reply(successMsg);
        
        util.importLog(`Updated notification settings for ${streamerId} in channel ${channel.id}`);

    } catch (err) {
        console.error(`[${channel.id}] Notification settings error:`, err.message);
        util.importLog(`Error updating notification settings in channel ${channel.id}: ${err.message}`);
        await context.reply('通知設定の更新中にエラーが発生しました。');
    }
}

module.exports = message_set;
