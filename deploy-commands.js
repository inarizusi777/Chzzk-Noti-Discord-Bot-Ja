const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const commands = [
	new SlashCommandBuilder()
		.setName('사용법')
		.setDescription('봇 사용법과 명령어를 확인합니다.'),
	new SlashCommandBuilder()
		.setName('리스트')
		.setDescription('현재 채널에 등록된 스트리머 목록을 보여줍니다.'),
	new SlashCommandBuilder()
		.setName('등록')
		.setDescription('스트리머를 알림 리스트에 등록합니다.')
		.addStringOption(option =>
			option.setName('스트리머')
				.setDescription('스트리머의 닉네임 또는 고유 ID를 입력하세요.')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('종류')
				.setDescription('알림 받을 종류를 선택하세요. (기본값: 모두)')
				.setRequired(false)
				.addChoices(
					{ name: '모두 (커뮤니티 + 방송)', value: 'all' },
					{ name: '커뮤니티만', value: 'community' },
					{ name: '방송시작만', value: 'live' },
				)),
	new SlashCommandBuilder()
		.setName('삭제')
		.setDescription('등록된 스트리머를 알림 리스트에서 삭제합니다.')
		.addStringOption(option =>
			option.setName('스트리머')
				.setDescription('삭제할 스트리머의 닉네임 또는 고유 ID를 입력하세요.')
				.setRequired(true)),
	new SlashCommandBuilder()
		.setName('핑')
		.setDescription('봇의 지연 시간을 확인합니다.'),
	new SlashCommandBuilder()
		.setName('설정_api')
		.setDescription('[관리자] 치지직 API 주소를 변경합니다.')
		.addStringOption(option =>
			option.setName('종류')
				.setDescription('변경할 API 종류를 선택하세요.')
				.setRequired(true)
				.addChoices(
					{ name: '커뮤니티', value: 'community' },
					{ name: '라이브', value: 'live' },
					{ name: '검색', value: 'search' },
				))
		.addStringOption(option =>
			option.setName('주소')
				.setDescription('새로운 API 주소를 입력하세요. ({streamerId} 또는 {keyword} 포함 필수)')
				.setRequired(true)),
	new SlashCommandBuilder()
		.setName('알림메시지설정')
		.setDescription('스트리머의 알림 멘션과 메시지를 커스텀 설정합니다.')
		.addStringOption(option =>
			option.setName('스트리머')
				.setDescription('설정할 스트리머의 닉네임 또는 고유 ID를 입력하세요.')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('종류')
				.setDescription('설정할 알림 종류를 선택하세요.')
				.setRequired(true)
				.addChoices(
					{ name: '커뮤니티', value: 'community' },
					{ name: '방송시작', value: 'live' },
				))
		.addRoleOption(option =>
			option.setName('멘션역할')
				.setDescription('멘션할 역할을 선택하세요. 선택 시 메시지 앞에 추가됩니다.')
				.setRequired(false))
		.addStringOption(option =>
			option.setName('메시지')
				.setDescription('알림과 함께 보낼 메시지 (마크다운 지원, {streamer} 입력 시 스트리머 이름으로 치환)')
				.setRequired(false)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// Routes.applicationCommands를 사용하여 모든 서버에서 명령어가 보이도록 전역 배포합니다.
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();
