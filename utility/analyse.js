const { gitClone } = require('./docker/git-clone');
const { repoUrlToProjectKey } = require('./git/repo-utils');
const { validateRepoUrl, validateBranch } = require('./git/valid-url');
const sonar = require('./sonar/analyse');
const semgrep = require('./semgrep/analyse');
const trufflehog = require('./trufflehog/analyse');
const pipeline = require('./pipeline/analyse');
const { generateReport } = require('./pdf/report-generator');
const { sendWithPdfButton } = require('./pdf/pdf-button');
const { MessageFlags, ContainerBuilder, SeparatorSpacingSize } = require('discord.js');
const { colors } = require('../config');

function containerMessage(repoUrl, branch, message = null, accentColor = colors.info) {
	let repoUrlWithBranch = repoUrl.replace(/\.git$/, '');
	repoUrlWithBranch = `${repoUrlWithBranch}/tree/${branch ?? 'HEAD'}`;

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent(`## 📦 Dépôt analysé\nDépôt : ${repoUrl}\nBranche : [${branch ?? 'HEAD (par défaut)'}](${repoUrlWithBranch})`));
	if (message) {
		container
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(message));
	}
	return container;
}

module.exports = {
	async analyse(interaction, repoUrl, branch = null, commit = false, analyses = {
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
			await interaction.editReply({
				content: null,
				components: [containerMessage(repoUrl, branch, 'Clonage du dépôt en cours...')],
				flags: MessageFlags.IsComponentsV2,
			});
			const volumeId = await gitClone(repoUrl, branch, commit);
			await interaction.editReply({ components: [containerMessage(repoUrl, branch)] });

			// Génération d'une projectKey à partir de l'URL du repo pour conserver l'historique Sonar
			const projectKey = repoUrlToProjectKey(repoUrl, branch);
			const repoUrlBranch = `${repoUrl.replace(/\.git$/, '')}/tree/${branch ?? 'HEAD'}`;
			// Stocker le repoUrl dans le cache pour les handlers de boutons
			interaction.client.projectCache[projectKey] = { base: repoUrl, withBranch: repoUrlBranch };

			// Lancement des analyses
			const metrics = {};
			if (analyses.sonar) {
				metrics.sonar = await sonar.analyse(interaction, volumeId, projectKey, repoUrl, branch);
			}
			if (analyses.semgrep) {
				metrics.semgrep = await semgrep.analyse(interaction, volumeId, projectKey);
			}
			if (analyses.trufflehog) {
				metrics.trufflehog = await trufflehog.analyse(interaction, volumeId, projectKey, commit);
			}
			if (analyses.pipeline) {
				metrics.pipeline = await pipeline.analyse(interaction, volumeId, projectKey);
			}
			metrics.info = {};
			metrics.info.repoUrl = repoUrl;
			metrics.info.branch = branch || 'HEAD';
			metrics.info.name = projectKey;
			if (commit === true) {
				metrics.info.commit = 'Oui';
			}
			else {
				metrics.info.commit = 'Non';
			}

			// Génération du rapport PDF
			const report = await generateReport(projectKey, volumeId, metrics);
			const message = await interaction.fetchReply();
			const components = message.components;
			await sendWithPdfButton(interaction, report, components);

		}
		catch (err) {
			console.error(err);
			const message = await interaction.fetchReply();
			const error = new ContainerBuilder()
				.setAccentColor(colors.error)
				.addTextDisplayComponents(t => t.setContent(`Erreur lors de l'analyse : \`${err.message}\``));
			await interaction.editReply({
				components: [error, ...message.components],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	},
};