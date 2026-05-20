const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const { gitClone } = require('../../utility/docker/git-clone');
const { repoUrlToProjectKey } = require('../../utility/git/repo-utils');
const { validateRepoUrl, validateBranch } = require('../../utility/git/valid-url');
const { trufflehogAnalyze } = require('../../utility/docker/trufflehog-analyse');
const { formatTrufflehogReport } = require('../../utility/trufflehog/report-formatter');
const { fetchGithubPipelineLogs } = require('../../utility/git/pipeline-logs');
const { scanPipelineLogs } = require('../../utility/pipeline/secret-scanner');
const { formatPipelineReport } = require('../../utility/pipeline/report-formatter');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('analyse')
		.setDescription('Analyse GitHub repositories!')
		.addStringOption((option) => option.setName('url').setDescription('The GitHub repository URL to analyse.').setRequired(true))
		.addStringOption((option) => option.setName('branch').setDescription('Optional branch to analyse (e.g. main)')),
	async execute(interaction) {
		const repoUrl = interaction.options.getString('url');
		const branch = interaction.options.getString('branch');
		// Validation de l'URL
		const urlValidation = validateRepoUrl(repoUrl);
		if (!urlValidation.isValid) {
			return await interaction.reply({
				content: `Erreur : ${urlValidation.error}`,
				ephemeral: true,
			});
		}
		// Validation de la branche
		const branchValidation = validateBranch(branch);
		if (!branchValidation.isValid) {
			return await interaction.reply({
				content: `Erreur : ${branchValidation.error}`,
				ephemeral: true,
			});
		}

		await interaction.deferReply();

		try {
			await interaction.editReply('Clonage du repo en cours...');
			const volumeId = await gitClone(repoUrl, branch);
			await interaction.editReply('Repo cloné avec succès !');

			// Génération d'une projectKey à partir de l'URL du repo pour conserver l'historique Sonar
			const projectKey = repoUrlToProjectKey(repoUrl, branch);

			await interaction.editReply('🔧 Analyse des logs de pipeline en cours...');
			try {
				const pipelineData = await fetchGithubPipelineLogs(repoUrl, config.github.token);
				const scanResult = scanPipelineLogs(pipelineData);
				const embed = formatPipelineReport(scanResult, repoUrl);
				embeds.push(embed);
				await interaction.editReply({ content: '', embeds });
			}
			catch (pipeErr) {
				console.error('[Pipeline] Failed:', pipeErr.message);
				console.error(pipeErr.stack);
			}

		}
		catch (err) {
			console.error(err);
			await interaction.editReply(`Erreur lors de l'analyse : \`${err.message}\``);
		}
	},
};