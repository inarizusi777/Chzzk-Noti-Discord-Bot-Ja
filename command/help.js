const {EmbedBuilder} = require("discord.js");

const help = {};

help.SendMessage = async function (context) {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle("CHZZK通知ボットの使い方")
            .setDescription("CHZZKのコミュニティ投稿と配信開始を1分ごとに確認し、Discordへ通知するボットです。\n\n配信者を登録すると、最新のコミュニティ投稿と配信タイトルを一度表示します。その後も1分ごとに更新を確認するため、通知まで最大1分かかる場合があります。")
            .addFields(
                {
                    name: '配信者を登録',
                    value: '/register [streamer] [type (optional: all/community/live)]',
                    inline: false
                },
                {
                    name: '通知をカスタマイズ',
                    value: '/set_notification [streamer] [type] [mention_role (optional)] [message (optional)]',
                    inline: false
                },
                {
                    name: '登録済み配信者を表示',
                    value: '/list',
                    inline: false
                },
                {
                    name: '配信者を削除',
                    value: '/delete [streamer]',
                    inline: false
                },
                {
                    name: 'ボットの状態を確認',
                    value: '/ping',
                    inline: false
                }
            )
            .setTimestamp()

        if (isInteraction) {
            await context.reply({ embeds: [exampleEmbed] });
        } else {
            await channel.send({ embeds: [exampleEmbed] });
        }
    } catch (err) {
        console.error(`[${channel.id}] Error sending help:`, err.message);
    }
}

module.exports = help;
