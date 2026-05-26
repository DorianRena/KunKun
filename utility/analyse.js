const { gitClone } = require('./docker/git-clone');
const { repoUrlToProjectKey } = require('./git/repo-utils');
const { validateRepoUrl, validateBranch } = require('./git/valid-url');
const sonar = require('./sonar/analyse');
const semgrep = require('./semgrep/analyse');
const trufflehog = require('./trufflehog/analyse');
const pipeline = require('./pipeline/analyse');
const { generateSonarPdfReport } = require('./sonar/sonar-report-generator');
const { sendWithPdfButton } = require('./pdf/pdf-button');

module.exports = {
	async analyse(interaction, repoUrl, branch = null, analyses = {
		sonar: true,
		semgrep: true,
		trufflehog: true,
		pipeline: true,
	}) {
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
			if (analyses.sonar) await sonar.analyse(interaction, volumeId, projectKey, repoUrl, branch);
			if (analyses.semgrep) await semgrep.analyse(interaction, volumeId, repoUrl);
			if (analyses.trufflehog) await trufflehog.analyse(interaction, volumeId, repoUrl);
			if (analyses.pipeline) await pipeline.analyse(interaction, volumeId, repoUrl);

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