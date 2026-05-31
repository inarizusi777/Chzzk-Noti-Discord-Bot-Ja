const {EmbedBuilder} = require("discord.js");

const help = {};

help.SendMessage = async function (context) {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        const exampleEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle("치지직 알림 봇 사용법")
            .setDescription("치지직 스트리머의 커뮤니티 공지와 방송 시작 알림을 1분마다 확인하여 전송해주는 디스코드 봇입니다.\n\n스트리머 등록 완료 시 일회성으로 스트리머의 마지막 커뮤니티(공지) 내용과 방송제목(방송중이 아닐 시 마지막 방송 제목)이 나옵니다.\n\n등록 이후 봇이 1분마다 정보를 갱신하며, 알림이 오기까지 최대 1분이 소요 될 수 있습니다.")
            .addFields(
                {
                    name: '알림 스트리머 등록',
                    value: '/등록 [스트리머] [종류(선택:모두/커뮤니티/라이브)]',
                    inline: false
                },
                {
                    name: '커스텀 알림 설정 (멘션/메시지 변경)',
                    value: '/알림메시지설정 [스트리머] [종류] [멘션역할(선택)] [메시지(선택)]',
                    inline: false
                },
                {
                    name: '등록된 알림 리스트 확인',
                    value: '/리스트',
                    inline: false
                },
                {
                    name: '등록된 알림 리스트 삭제',
                    value: '/삭제 [스트리머]',
                    inline: false
                },
                {
                    name: '봇 상태 확인',
                    value: '/핑',
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
        console.error(`[${channel.id}] 도움말 전송 에러:`, err.message);
    }
}

module.exports = help;
