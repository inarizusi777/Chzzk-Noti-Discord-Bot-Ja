// Require the necessary discord.js classes
const { token, channelId, ownerId } = require('./config.json');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const fs = require('fs');
const schedule = require('node-schedule');
const axios = require('axios');

//명령어들
const command_Help = require('./command/help');
const command_register = require('./command/register');
const command_ping = require('./command/ping');
const command_message_set = require('./command/message_set');

const util = require('./utils/util');
const db = require('./utils/db');




const wait = (timeToDelay) => new Promise((resolve) => setTimeout(resolve, timeToDelay))

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

// 1. 봇이 디스코드에 정상적으로 접속 완료(ready)되었을 때 실행되는 부분
client.once("ready", async (c) => {
    console.log(`${c.user.tag} is online.`);

    // 봇 상태 메시지 설정 (활동창 표시)
    client.user.setActivity('/사용법 을 입력하여 사용하기', { type: ActivityType.Playing });
    client.user.setStatus('online'); // 온라인 상태로 표시

    // DB 초기화 및 마이그레이션 (notification.json이 있을 때만 1회성으로 수행)
    try {
        await db.init();
        if (fs.existsSync('./notification.json')) {
            console.log("새로운 notification.json 발견! 마이그레이션을 시작합니다.");
            await db.migrateFromJson('./notification.json');
        }
    } catch (dbErr) {
        console.error("DB 초기화/마이그레이션 에러:", dbErr);
    }

// 2. 봇이 준비된 '이후'에 스케줄러를 등록합니다.
let isProcessing = false;

// 한 명의 스트리머를 체크하고 알림을 보내는 독립 함수
async function processStreamerUpdate(streamer) {

    const startTime = Date.now();
    try {
        // 커뮤니티 최근 정보 확인
        const contents = await util.getCommunityRecentlyInfo(streamer.id);
        if (contents.result === 200 && streamer.recent_community_id < contents.communityId) {
            const subscriptions = await db.getSubscriptionsForStreamer(streamer.id);

            // 본문이 비어있을 경우 이미지 유무에 따른 대체 문구 설정
            let description = contents.contents || "";
            if (description.trim() === "" && contents.img) {
                description = "이미지(사진) 공지사항입니다. (상세 내용은 버튼을 눌러 확인하세요)";
            } else if (description.length > 1500) {
                description = description.substring(0, 1500) + "... (상세 내용은 버튼을 눌러 확인하세요)";
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({
                    name: contents.name,
                    iconURL: contents.profile,
                    url: `https://chzzk.naver.com/${streamer.id}`
                })
                .setTitle("새 커뮤니티 게시글")
                .setURL(`https://chzzk.naver.com/${streamer.id}/community/detail/${contents.communityId}`)
                .setDescription(description || "내용 없는 공지사항입니다.")
                .setImage(contents.img)
                .setTimestamp();
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('공지 확인하러 가기')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://chzzk.naver.com/${streamer.id}/community/detail/${contents.communityId}`)
                );

            for (const sub of subscriptions) {
                if (sub.notify_type === 'live') continue;
                try {
                    const channel = await client.channels.fetch(sub.channel_id);
                    if (channel) {
                        let mentionStr = '';
                        if (sub.comm_mention_type === '@everyone') mentionStr = '@everyone ';
                        else if (sub.comm_mention_type === '@here') mentionStr = '@here ';
                        else if (sub.comm_mention_type === 'role' && sub.comm_mention_role_id) mentionStr = `<@&${sub.comm_mention_role_id}> `;

                        let msgContent = mentionStr.trim();
                        if (sub.comm_msg) {
                            msgContent = msgContent ? msgContent + ' ' + sub.comm_msg.replace(/{streamer}/g, contents.name) : sub.comm_msg.replace(/{streamer}/g, contents.name);
                        }

                        await channel.send({ content: msgContent || null, embeds: [embed], components: [row] });
                    }
                } catch (sendError) {
                    if (sendError.code === 10003) {
                        await db.removeSubscription(sub.channel_id, streamer.id);
                        await db.removeStreamerIfNoSubs(streamer.id);
                    }
                }
            }
            await db.updateStreamerCommunity(streamer.id, contents.communityId);
            util.importLog(`${streamer.name} 커뮤니티 알림 전송 완료`);
        }

        // 방송 시작 알림 체크
        const liveInfo = await util.getLiveInfo(streamer.id);
        if (liveInfo.result === 200 && liveInfo.status === "OPEN") {
            // 중복 알림 방지 강화: 
            // 1. 기존 기록이 없으면(최초 인식) 알림 없이 DB만 업데이트하여 현재 방송을 기점으로 설정
            // 2. 기존 기록보다 큰 liveId가 들어왔을 때만 새 방송으로 간주하여 알림 전송
            if (!streamer.recent_live_id || streamer.recent_live_id === 0) {
                await db.updateStreamerLive(streamer.id, liveInfo.liveId);
                util.importLog(`${liveInfo.channelName} 최초 방송 정보 설정 (알림 미전송)`);
            } else if (streamer.recent_live_id < liveInfo.liveId) {
                const subscriptions = await db.getSubscriptionsForStreamer(streamer.id);
                const liveEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setAuthor({
                        name: liveInfo.channelName,
                        iconURL: liveInfo.channelProfile,
                        url: `https://chzzk.naver.com/live/${streamer.id}`
                    })
                    .setTitle(`[방송 시작] ${liveInfo.liveTitle}`)
                    .setURL(`https://chzzk.naver.com/live/${streamer.id}`)
                    .setDescription(`현재 방송 중: ${liveInfo.liveCategoryValue || '카테고리 없음'}`)
                    .setImage(liveInfo.liveImageUrl ? liveInfo.liveImageUrl.replace('{type}', '1080') + "?v=" + Date.now() : null)
                    .setTimestamp();

                const liveRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('방송 보러가기')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://chzzk.naver.com/live/${streamer.id}`)
                    );

                for (const sub of subscriptions) {
                    if (sub.notify_type === 'community') continue;
                    try {
                        const channel = await client.channels.fetch(sub.channel_id);
                        if (channel) {
                            let mentionStr = '';
                            if (sub.live_mention_type === '@everyone') mentionStr = '@everyone ';
                            else if (sub.live_mention_type === '@here') mentionStr = '@here ';
                            else if (sub.live_mention_type === 'role' && sub.live_mention_role_id) mentionStr = `<@&${sub.live_mention_role_id}> `;

                            let msgContent = mentionStr.trim();
                            if (sub.live_msg) {
                                msgContent = msgContent ? msgContent + ' ' + sub.live_msg.replace(/{streamer}/g, liveInfo.channelName) : sub.live_msg.replace(/{streamer}/g, liveInfo.channelName);
                            } else {
                                const defaultMsg = `${liveInfo.channelName}님이 방송을 시작했습니다!`;
                                msgContent = msgContent ? msgContent + ' ' + defaultMsg : defaultMsg;
                            }

                            await channel.send({ content: msgContent || null, embeds: [liveEmbed], components: [liveRow] });
                        }
                    } catch (sendError) {
                        if (sendError.code === 10003) {
                            await db.removeSubscription(sub.channel_id, streamer.id);
                            await db.removeStreamerIfNoSubs(streamer.id);
                        }
                    }
                }
                await db.updateStreamerLive(streamer.id, liveInfo.liveId);
                util.importLog(`${liveInfo.channelName} 방송 시작 알림 전송 완료`);
            }
        }
    } catch (e) {
        console.error(`[${streamer.id}] 처리 에러:`, e.message);
    } finally {
        const duration = Date.now() - startTime;
        if (duration > 30000) { // 30초 이상 걸리면 경고
            console.warn(`[Warning] Streamer update for ${streamer.id} took ${duration}ms`);
        }
    }
}

// 스케줄러 등록
const job = schedule.scheduleJob('0 * * * * *', async function () {
    if (isProcessing) return; // 이미 작업 중이면 건너뜀
    isProcessing = true;

    try {
        const streamers = await db.getAllStreamers();
        const BATCH_SIZE = 5; // 한 번에 동시에 처리할 인원 수

        for (let i = 0; i < streamers.length; i += BATCH_SIZE) {
            const batch = streamers.slice(i, i + BATCH_SIZE);
            
            // 한 번에 BATCH_SIZE만큼 병렬 실행
            await Promise.all(batch.map(streamer => processStreamerUpdate(streamer)));
            
            // 배치 간 간격 (API 과부하 방지)
            if (i + BATCH_SIZE < streamers.length) {
                await wait(1000); 
            }
        }
    } catch (err) {
        console.error("스케줄러 실행 에러:", err);
    } finally {
        isProcessing = false;
    }
});
    console.log("알림 스케줄러가 정상적으로 등록되었습니다.");
});

// 3. 명령어 처리 부분
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;



    const { commandName } = interaction;
    util.importLog(`슬래시 명령어 실행: ${interaction.user.tag} (${interaction.user.id}) -> /${commandName} (채널: ${interaction.channelId})`);

    try {
        switch (commandName) {
            case "사용법":
                await command_Help.SendMessage(interaction);
                break;
            case "리스트":
                await command_register.getList(interaction);
                break;
            case "등록":
                const addInput = interaction.options.getString('스트리머');
                await command_register.import(interaction, addInput);
                break;
            case "삭제":
                const deleteInput = interaction.options.getString('스트리머');
                await command_register.delete(interaction, deleteInput);
                break;
            case "알림메시지설정":
                await command_message_set.execute(interaction);
                break;
            case "핑":
                await command_ping.execute(interaction);
                break;
            case "설정_api":
                // 봇 소유자(ownerId)인지 확인
                if (interaction.user.id !== ownerId) {
                    return await interaction.reply({ content: '이 명령어는 봇 소유자만 사용할 수 있습니다.', ephemeral: true });
                }

                const type = interaction.options.getString('종류');
                const newUrl = interaction.options.getString('주소');

                try {
                    const configPath = './config.json';
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    
                    config.api[type] = newUrl;
                    
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                    util.reloadApiConfig(); // util.js 내부 변수 업데이트

                    await interaction.reply({ content: `✅ API 주소가 성공적으로 변경되었습니다.\n**종류:** ${type}\n**새 주소:** ${newUrl}`, ephemeral: true });
                    util.importLog(`관리자에 의해 API 주소 변경됨: ${type}`);
                } catch (err) {
                    console.error("API 설정 변경 중 에러:", err);
                    await interaction.reply({ content: '설정 변경 중 오류가 발생했습니다.', ephemeral: true });
                }
                break;
        }
    } catch (err) {
        console.error("슬래시 명령어 처리 중 에러 발생:", err.message);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
        } else {
            await interaction.reply({ content: '명령어 실행 중 오류가 발생했습니다.', ephemeral: true });
        }
    }
});

// 전역 에러 핸들러 (봇 꺼짐 방지)
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// 4. [매우 중요] 파일 맨 마지막에 봇 로그인을 요청합니다.
client.login(token);