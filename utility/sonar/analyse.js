const { sonarAnalyse } = require('../docker/sonar-analyse');
const { fetchProjectMetricsWithRetry } = require('./sonar-api');
const { formatSonarReport } = require('./report-formatter');

module.exports = {
	async analyse(interaction, volumeId, projectKey, repoUrl) {
		await interaction.editReply('Analyse Sonar en cours...');
		try {
			await sonarAnalyse(volumeId, { projectKey, projectName: projectKey });
		}
		catch (sonarErr) {
			console.error('[Analysis] Sonar failed:', sonarErr.message);
			await interaction.editReply({ content: '⚠️ Sonar n\'a pas pu s\'exécuter.' });
		}
		// Fetch metrics from Sonar API (with retry)
		await interaction.editReply('Récupération des résultats Sonar...');
		try {
			const metrics = await fetchProjectMetricsWithRetry(projectKey, 5, 2000);
			if (metrics) {
				const embed = formatSonarReport(metrics, projectKey, repoUrl);
				const message = await interaction.fetchReply();
				await interaction.editReply({ content: '', embeds: [...message.embeds, embed] });
				console.log(`[Analysis] Sonar report generated for project ${projectKey}`);
			}
			else {
				console.error('[Analysis] Failed to fetch metrics:', apiErr.message);
				await interaction.editReply('⚠️ Les résultats Sonar n\'ont pas pu être récupérés');
			}
		}
		catch (apiErr) {
			console.error('[Analysis] Failed to fetch metrics:', apiErr.message);
			await interaction.editReply({ content: '⚠️ Les résultats Sonar n\'ont pas pu être récupérés' });
		}
	},
};