const db = require('../utils/db');
const util = require('../utils/util');

const message_set = {};

message_set.execute = async (context) => {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    if (!isInteraction) return; // 슬래시 명령어로만 작동

    try {
        const streamerInput = context.options.getString('스트리머');
        const type = context.options.getString('종류');
        const mentionRole = context.options.getRole('멘션역할');
        const customMessage = context.options.getString('메시지') || null;

        // 스트리머 찾기
        let streamerId = streamerInput;
        const isIdFormat = /^[a-f0-9]{32}$/.test(streamerInput);
        if (!isIdFormat) {
            const searchResult = await util.searchStreamer(streamerInput);
            if (searchResult.result === 200) {
                streamerId = searchResult.id;
            } else {
                return await context.reply(`'${streamerInput}' 스트리머를 찾을 수 없습니다. 정확한 닉네임을 입력해주세요.`);
            }
        }

        // 해당 채널에 등록된 스트리머인지 확인
        const subs = await db.getSubscriptionsForChannel(channel.id);
        const streamerSub = subs.find(s => s.streamer_id === streamerId);
        
        if (!streamerSub) {
            return await context.reply(`이 채널에 등록되지 않은 스트리머입니다. 먼저 '/등록'을 이용해 스트리머를 등록해주세요.`);
        }

        // 멘션 타입 결정
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

        // DB 업데이트
        await db.updateSubscriptionConfig(channel.id, streamerId, type, finalMentionType, finalMentionRoleId, customMessage);

        // 성공 메시지 작성
        const typeKor = type === 'community' ? '커뮤니티' : '방송시작';
        let mentionStr = '멘션 없음';
        if (finalMentionType === '@everyone') mentionStr = '@everyone';
        else if (finalMentionType === '@here') mentionStr = '@here';
        else if (finalMentionType === 'role') mentionStr = `<@&${finalMentionRoleId}>`;

        let msgStr = customMessage || '(기본 메시지 사용)';

        const successMsg = `✅ **${streamerSub.name}** 스트리머의 **${typeKor}** 알림 설정이 변경되었습니다.\n- **멘션:** ${mentionStr}\n- **메시지:** ${msgStr}`;
        await context.reply(successMsg);
        
        util.importLog(`${channel.id} 채널에서 ${streamerId} 알림메시지설정 완료`);

    } catch (err) {
        console.error(`[${channel.id}] message_set 에러:`, err.message);
        util.importLog(`${channel.id} 채널에서 알림메시지설정 중 에러 발생: ${err.message}`);
        await context.reply('설정 중 오류가 발생했습니다.');
    }
}

module.exports = message_set;
