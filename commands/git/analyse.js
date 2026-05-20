const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { gitClone } = require('../../utility/docker/git-clone');
const { sonarAnalyze } = require('../../utility/docker/sonar-analyse');
const { semgrepAnalyze } = require('../../utility/docker/semgrep-analyse');
const { repoUrlToProjectKey } = require('../../utility/git/repo-utils');
const { fetchProjectMetricsWithRetry } = require('../../utility/sonar/sonar-api');
const { formatSonarReport } = require('../../utility/sonar/report-formatter');
const { formatSemgrepReport } = require('../../utility/semgrep/report-formatter');
const { validateRepoUrl, validateBranch } = require('../../utility/git/valid-url');
const { trufflehogAnalyze } = require('../../utility/docker/trufflehog-analyse');
const { formatTrufflehogReport } = require('../../utility/trufflehog/report-formatter');

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
			const embeds = [];

			await interaction.editReply('Analyse Sonar en cours...');
			await sonarAnalyze(volumeId, { projectKey, projectName: projectKey, branch });
			await interaction.editReply('Récupération des résultats Sonar...');

			// Fetch metrics from Sonar API (with retry)
			try {
				const metrics = await fetchProjectMetricsWithRetry(projectKey, 5, 2000);
				if (metrics) {
					const embed = formatSonarReport(metrics, projectKey, repoUrl);
					embeds.push(embed);
					await interaction.editReply({ content: '', embeds });
					console.log(`[Analysis] Sonar report generated for project ${projectKey}`);
				}
				else {
					await interaction.editReply('✅ Analyse Sonar terminée ! (résultats non encore disponibles, réessayez dans quelques secondes)');
				}
			}
			catch (apiErr) {
				console.error('[Analysis] Failed to fetch metrics:', apiErr.message);
				await interaction.editReply('✅ Analyse Sonar terminée ! (impossible de récupérer les résultats)');
			}

			await interaction.editReply('Analyse Semgrep en cours...');
			try {
				const semgrepOutput = await semgrepAnalyze(volumeId, { config: 'p/owasp-top-ten' });
				const embed = formatSemgrepReport(semgrepOutput, repoUrl);
				embeds.push(embed);
				await interaction.editReply({ content: '', embeds });
				console.log('[Analysis] Semgrep report generated');
			}
			catch (semgrepErr) {
				console.error('[Analysis] Failed to run Semgrep:', semgrepErr.message);
			}

			await interaction.editReply('Analyse des secrets en cours (TruffleHog)...');
			try {
				const findings = await trufflehogAnalyze(volumeId, repoUrl);
				const embed = formatTrufflehogReport(findings, repoUrl);
				embeds.push(embed);
				await interaction.editReply({ content: '', embeds });
				console.log(`[Analysis] TruffleHog: ${findings.length} finding(s)`);
			}
			catch (thErr) {
				console.error('[Analysis] TruffleHog failed:', thErr.message);
				await interaction.editReply({ content: '⚠️ TruffleHog n\'a pas pu s\'exécuter.', embeds });
			}

		}
		catch (err) {
			console.error(err);
			await interaction.editReply(`Erreur lors de l'analyse : \`${err.message}\``);
		}
	},
};