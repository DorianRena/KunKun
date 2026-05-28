const { SlashCommandBuilder } = require('discord.js');
const { analyse } = require('../../utility/analyse');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('analyse')
		.setDescription('Analyse GitHub repositories!')
		.addStringOption((option) => option.setName('url').setDescription('The GitHub repository URL to analyse.').setRequired(true))
		.addStringOption((option) => option.setName('branch').setDescription('Optional branch to analyse (e.g. main)'))
		.addBooleanOption((option) => option.setName('commit').setDescription('Analyse commits history instead of filesystem (longer, but more thorough)')),
	async execute(interaction) {
		const repoUrl = interaction.options.getString('url');
		const branch = interaction.options.getString('branch');
		const commit = interaction.options.getBoolean('commit');

		await analyse(interaction, repoUrl, branch, commit);
	},
};