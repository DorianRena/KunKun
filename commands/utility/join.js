const { joinVoiceChannel } = require('@discordjs/voice');
const { SlashCommandBuilder } = require('discord.js');
const VoiceTranscriptor = require('../../voice');
module.exports = {
	data: new SlashCommandBuilder().setName('join').setDescription('join voice'),

	async execute(interaction) {

		const voiceChannel = interaction.member.voice.channel;

		if (!voiceChannel) {
			return interaction.reply({
				content: '❌ Rejoins un salon vocal',
				ephemeral: true,
			});
		}

		// connexion vocale
		const connection = joinVoiceChannel({
			channelId: voiceChannel.id,
			guildId: interaction.guild.id,
			adapterCreator: interaction.guild.voiceAdapterCreator,
			selfDeaf: false,
		});

		// démarrer transcription
		new VoiceTranscriptor(
			interaction.client,
			{
				channel: interaction.channel,
				guild: interaction.guild,
			},
			connection,
		);

		await interaction.reply('🎤 Transcription activée');
	},
};