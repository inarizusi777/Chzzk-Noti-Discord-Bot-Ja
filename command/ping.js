const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const os = require('os');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('ボットの応答速度、システムリソース、CHZZK APIの応答時間を確認します。'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const startTime = Date.now();
        const apiLatency = Math.round(interaction.client.ws.ping);

        // Test the CHZZK API response.
        let naverApiStatusStr = '';
        const testPath = '/service/v1/channels/53c8344e2694f420e6e7683f124c8b2a';
        const targetUrl = `https://api.chzzk.naver.com${testPath}`;
        
        const nodeStart = Date.now();
        try {
            const res = await axios.get(targetUrl, { 
                timeout: 3000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                }
            });
            const duration = Date.now() - nodeStart;
            const success = res.data && (res.data.code === 200 || res.status === 200);
            naverApiStatusStr = success ? `🟢 正常（\`${duration}ms\`）` : `🔴 エラー（\`CODE: ${res.status}\`）`;
        } catch (e) {
            naverApiStatusStr = `🔴 失敗（\`${e.response ? e.response.status : 'ERR'}\`）`;
        }

        const latency = Date.now() - startTime;

        // Calculate uptime.
        const totalSeconds = Math.floor(process.uptime());
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const uptimeStr = `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;

        // Calculate memory usage.
        const processMemory = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
        const systemTotalMemory = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
        const systemFreeMemory = (os.freemem() / 1024 / 1024 / 1024).toFixed(2);
        const systemUsedMemory = (systemTotalMemory - systemFreeMemory).toFixed(2);

        // Get CPU information.
        const cpuModel = os.cpus()[0].model;
        const cpuCores = os.cpus().length;

        const embed = new EmbedBuilder()
            .setColor(0x00ffa3)
            .setTitle('✨ システム状態とCHZZK API')
            .addFields(
                { name: '📡 応答速度', value: `> **Discord API**: \`${apiLatency}ms\`\n> **コマンド応答**: \`${latency}ms\``, inline: false },
                { name: '🔌 CHZZK APIの状態', value: `> ${naverApiStatusStr}`, inline: false },
                { name: '💻 システム情報', value: `> **CPU**: \`${cpuModel}（${cpuCores}コア）\`\n> **RAM**: \`${systemUsedMemory} / ${systemTotalMemory} GB\``, inline: false },
                { name: '🤖 ボットの状態', value: `> **メモリ**: \`${processMemory} MB\`\n> **稼働時間**: \`${uptimeStr}\``, inline: false }
            )
            .setFooter({ text: `OS: ${os.type()} ${os.arch()} | Host: ${os.hostname()}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};