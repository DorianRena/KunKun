const { SlashCommandBuilder } = require('discord.js');
const { analyse } = require('../../utility/analyse');


module.exports = {
	data: new SlashCommandBuilder()
		.setName('analyse')
		.setDescription('Analyse GitHub repositories!')
		.addStringOption((option) => option.setName('url').setDescription('The GitHub repository URL to analyse.').setRequired(true))
		.addStringOption((option) => option.setName('branch').setDescription('Optional branch to analyse (e.g. main)')),
	async execute(interaction) {
		const repoUrl = interaction.options.getString('url');
		const branch = interaction.options.getString('branch');
		await analyse(interaction, repoUrl, branch);
	},
};