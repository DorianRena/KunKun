const { SlashCommandBuilder } = require('discord.js');
const { gitClone } = require('../../utility/docker/git-clone');
const { repoUrlToProjectKey } = require('../../utility/git/repo-utils');
const { validateRepoUrl, validateBranch } = require('../../utility/git/valid-url');
const sonar = require('../../utility/sonar/analyse');
const semgrep = require('../../utility/semgrep/analyse');
const trufflehog = require('../../utility/trufflehog/analyse');
const pipeline = require('../../utility/pipeline/analyse');
const { generateSonarPdfReport } = require('../../utility/sonar/sonar-report-generator');
const { sendWithPdfButton } = require('../../utility/pdf/pdf-button');

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

			// Lancement des analyses
			await sonar.analyse(interaction, volumeId, projectKey, repoUrl);
			await semgrep.analyse(interaction, volumeId, repoUrl);
			await trufflehog.analyse(interaction, volumeId, repoUrl);
			await pipeline.analyse(interaction, volumeId, repoUrl);

			// Génération du rapport PDF
			await interaction.editReply({ content: 'Génération du rapport PDF...', components: [] });
			const report = await generateSonarPdfReport(projectKey);
			const message = await interaction.fetchReply();
			const existingEmbeds = message.embeds;
			await sendWithPdfButton(interaction, report, existingEmbeds);

		}
		catch (err) {
			console.error(err);
			await interaction.editReply(`Erreur lors de l'analyse : \`${err.message}\``);
		}
	},
};