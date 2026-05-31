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
                .setTitle(`해당 채널에 등록된 스트리머는 ${subscriptions.length} 명 입니다.`)
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
            const msg = "현재 채널에 등록된 스트리머는 없습니다.\n" +
                "/등록 (스트리머 닉네임 혹은 스트리머 고유 ID) 를 입력해서 등록 해보세요.";
            if (isInteraction) {
                await context.reply(msg);
            } else {
                await channel.send(msg);
            }
        }
    } catch (err) {
        console.error(`[${channel.id}] getList 전송 에러:`, err.message);
    }
}

register.import = async (context, input) => {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        util.importLog(`${channel.id} 채널에서 ${input} 추가 시도`);

        let streamerId = input;
        let streamerName = "";

        // 입력값이 32자리 해시(ID) 형태가 아니면 닉네임 검색 시도
        const isIdFormat = /^[a-f0-9]{32}$/.test(input);
        
        if (!isIdFormat) {
            const searchResult = await util.searchStreamer(input);
            if (searchResult.result === 200) {
                streamerId = searchResult.id;
                streamerName = searchResult.name;
                util.importLog(`${input} 검색 결과: ${streamerName} (${streamerId})`);
            } else {
                const msg = `'${input}' 스트리머를 찾을 수 없습니다. 정확한 닉네임을 입력해주세요.`;
                if (isInteraction) await context.reply(msg);
                else await channel.send(msg);
                return;
            }
        }

        // 이미 등록되어 있는지 확인
        const subs = await db.getSubscriptionsForChannel(channel.id);
        if (subs.some(s => s.streamer_id === streamerId)) {
            const alreadyName = subs.find(s => s.streamer_id === streamerId).name;
            const msg = `해당 채널에 이미 등록된 스트리머(${alreadyName}) 입니다.`;
            if (isInteraction) await context.reply(msg);
            else await channel.send(msg);
            util.importLog(`${channel.id} 채널에서 ${streamerId} 추가 실패 : 중복 추가 요청`);
            return;
        }

        if (isInteraction) await context.deferReply();

        // 1. 기본 채널 정보 가져오기 (이름, 프로필)
        const channelInfo = await util.getChannelInfo(streamerId);
        
        if (channelInfo.result !== 200) {
            const msg = "스트리머 정보를 가져오지 못했습니다.\n" +
                "아이디값이 잘못되었거나 치지직 서비스에 일시적인 문제가 있을 수 있습니다.\n" +
                "아이디값은 스트리머 홈 URL(https://chzzk.naver.com/아이디)에서 확인해주세요.";
            
            if (isInteraction) await context.editReply(msg);
            else await channel.send(msg);

            util.importLog(`${channel.id} 채널에서 ${streamerId}채널 추가 실패 : 정보 호출 실패`);
            return;
        }

        let name = channelInfo.name;
        let profile = channelInfo.profile;

        // 2. 활동 정보 가져오기 (커뮤니티, 라이브)
        const communityInfo = await util.getCommunityRecentlyInfo(streamerId);
        const liveInfo = await util.getLiveInfo(streamerId);

        let communityId = 0;
        let contents = "아직 커뮤니티 글이 없습니다.";
        let img = null;

        if (communityInfo.result == 200) {
            communityId = communityInfo.communityId;
            contents = communityInfo.contents;
            img = communityInfo.img;
        }

        const liveId = (liveInfo.result === 200 && liveInfo.liveId) ? liveInfo.liveId : 0;
        const isLive = liveInfo.result === 200 && liveInfo.status === "OPEN";

        // 스트리머 정보 추가 또는 업데이트
        await db.dbRun(`
            INSERT INTO streamers (id, name, recent_community_id, recent_live_id)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name = EXCLUDED.name
        `, [streamerId, name, communityId, liveId]);

        // 구독 정보 추가
        let notifyType = 'all';
        if (isInteraction) {
            notifyType = context.options.getString('종류') || 'all';
        }
        await db.addSubscription(channel.id, streamerId, notifyType);

        const exampleEmbed = new EmbedBuilder()
            .setColor(isLive ? 0x00FF00 : 0x0099FF)
            .setAuthor({
                name: name + " 등록 완료",
                iconURL: profile
            })
            .setTimestamp();

        // 이미지 우선순위 설정: 방송 중이면 방송 화면, 아니면 커뮤니티 이미지
        const liveThumbnail = liveInfo.liveImageUrl ? liveInfo.liveImageUrl.replace('{type}', '1080') + "?t=" + Date.now() : null;
        const finalImage = isLive ? (liveThumbnail || img) : (img || null);
        exampleEmbed.setImage(finalImage);

        // 커뮤니티 정보 추가 (1024자 제한 대응)
        let communityText = contents;
        if (!communityText || communityText.trim() === "") {
            communityText = img ? "이미지(사진) 공지사항입니다. (상세 내용은 버튼 클릭)" : "공지 사항이 없습니다.";
        }

        if (communityText.length > 900) {
            communityText = communityText.substring(0, 900) + "... (공지 확인 버튼을 눌러 전체 내용을 확인하세요)";
        }

        exampleEmbed.addFields({
            name: "최근 커뮤니티 공지",
            value: communityText,
            inline: false
        });

        // 방송 정보 추가
        const liveStatusText = isLive ? `🔴 방송 중: ${liveInfo.liveTitle}` : `⚪ 방송 종료 (마지막 방송 제목: ${liveInfo.liveTitle || '정보 없음'})`;
        exampleEmbed.addFields({
            name: "방송 상태",
            value: liveStatusText,
            inline: false
        });

        // 커뮤니티 이동 URL 결정 (최근 글이 있으면 상세 페이지로, 없으면 리스트로)
        const noticeUrl = communityId > 0 
            ? `https://chzzk.naver.com/${streamerId}/community/detail/${communityId}`
            : `https://chzzk.naver.com/${streamerId}/community`;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('공지 확인하러 가기')
                    .setStyle(ButtonStyle.Link)
                    .setURL(noticeUrl),
                new ButtonBuilder()
                    .setLabel('방송 보러가기')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://chzzk.naver.com/live/${streamerId}`)
            );

        if (isInteraction) await context.editReply({ embeds: [exampleEmbed], components: [row] });
        else await channel.send({ embeds: [exampleEmbed], components: [row] });
        
        util.importLog(`${channel.id} 채널에서 ${streamerId}채널 추가 : 성공`);

    } catch(err) {
        console.error(`[${channel.id}] import 에러:`, err.message);
        util.importLog(`${channel.id} 채널에서 추가 중 에러 발생: ${err.message}`);
    }
}

register.delete = async (context, input) => {
    const channel = context.channel;
    const isInteraction = !!context.isChatInputCommand;
    
    try {
        util.importLog(`${channel.id} 채널에서 ${input} 삭제 시도`);

        let streamerId = input;

        // 입력값이 32자리 해시(ID) 형태가 아니면 닉네임 검색 시도
        const isIdFormat = /^[a-f0-9]{32}$/.test(input);
        
        if (!isIdFormat) {
            const searchResult = await util.searchStreamer(input);
            if (searchResult.result === 200) {
                streamerId = searchResult.id;
            } else {
                const msg = `'${input}' 스트리머를 찾을 수 없습니다.`;
                if (isInteraction) await context.reply(msg);
                else await channel.send(msg);
                return;
            }
        }

        const subs = await db.getSubscriptionsForChannel(channel.id);
        const streamerSub = subs.find(s => s.streamer_id === streamerId);

        if (!streamerSub) {
            const msg = "등록 되지 않은 스트리머입니다.\n등록된 스트리머를 확인할려면 '/리스트'를 입력해주세요.";
            if (isInteraction) await context.reply(msg);
            else await channel.send(msg);
            util.importLog(`${channel.id} 채널에서 ${streamerId} 삭제 실패 : 일치하는 정보 없음`);
            return;
        }

        await db.removeSubscription(channel.id, streamerId);
        await db.removeStreamerIfNoSubs(streamerId);

        const successMsg = `${streamerSub.name} (${streamerId})를 삭제했습니다.`;
        if (isInteraction) await context.reply(successMsg);
        else await channel.send(successMsg);
        
        util.importLog(`${channel.id} 채널에서 ${streamerId} 삭제 성공`);

    } catch(err) {
        console.error(`[${channel.id}] delete 에러:`, err.message);
        util.importLog(`${channel.id} 채널에서 삭제 중 에러 발생: ${err.message}`);
    }
}

module.exports = register;