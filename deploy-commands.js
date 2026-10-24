const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const commands = [
	new SlashCommandBuilder()
		.setName('help')
		.setDescription('ボットの使い方とコマンドを確認します。'),
	new SlashCommandBuilder()
		.setName('list')
		.setDescription('このチャンネルに登録されている配信者を表示します。'),
	new SlashCommandBuilder()
		.setName('register')
		.setDescription('配信者をこのチャンネルの通知リストに登録します。')
		.addStringOption(option =>
			option.setName('streamer')
				.setDescription('配信者の名前または固有IDを入力してください。')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('type')
				.setDescription('受け取る通知の種類を選択してください（初期設定：すべて）。')
				.setRequired(false)
				.addChoices(
					{ name: 'すべて（コミュニティ＋配信）', value: 'all' },
					{ name: 'コミュニティのみ', value: 'community' },
					{ name: '配信開始のみ', value: 'live' },
				)),
	new SlashCommandBuilder()
		.setName('delete')
		.setDescription('配信者をこのチャンネルの通知リストから削除します。')
		.addStringOption(option =>
			option.setName('streamer')
				.setDescription('削除する配信者の名前または固有IDを入力してください。')
				.setRequired(true)),
	new SlashCommandBuilder()
		.setName('ping')
		.setDescription('ボットの応答速度を確認します。'),
	new SlashCommandBuilder()
		.setName('set_api')
		.setDescription('[管理者向け] CHZZK APIのURLを変更します。')
		.addStringOption(option =>
			option.setName('type')
				.setDescription('変更するAPIの種類を選択してください。')
				.setRequired(true)
				.addChoices(
					{ name: 'コミュニティ', value: 'community' },
					{ name: '配信', value: 'live' },
					{ name: '検索', value: 'search' },
				))
		.addStringOption(option =>
			option.setName('url')
				.setDescription('新しいAPIのURLを入力してください（{streamerId}または{keyword}が必要です）。')
				.setRequired(true)),
	new SlashCommandBuilder()
		.setName('set_notification')
		.setDescription('配信者ごとの通知メンションとメッセージを設定します。')
		.addStringOption(option =>
			option.setName('streamer')
				.setDescription('配信者の名前または固有IDを入力してください。')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('type')
				.setDescription('設定する通知の種類を選択してください。')
				.setRequired(true)
				.addChoices(
					{ name: 'コミュニティ', value: 'community' },
					{ name: '配信開始', value: 'live' },
				))
		.addRoleOption(option =>
			option.setName('mention_role')
				.setDescription('メッセージの前にメンションするロールを選択してください。')
				.setRequired(false))
		.addStringOption(option =>
			option.setName('message')
				.setDescription('通知に添えるメッセージ（Markdown対応、{streamer}は配信者名に置換されます）。')
				.setRequired(false)),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// Deploy globally so the commands are available in every server.
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();
