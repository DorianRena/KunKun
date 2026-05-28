const { sonarAnalyse } = require('../docker/sonar-analyse');
const sonarApi = require('./sonar-api');
const { createInteractiveReport } = require('./interactive-report');
const { generateSonarReport } = require('./sonar-report-generator');
const { MessageFlags } = require('discord.js');
const { containerInfoMessage } = require('../discord');
const { colors } = require('../../config.js');

function containerMessage(message, accentColor = colors.log) {
	return containerInfoMessage('## 📊 SonarQube', message, accentColor);
}

module.exports = {
	async analyse(interaction, volumeId, projectKey) {
		const message = await interaction.fetchReply();
		const components = message.components;

		await interaction.editReply({
			content: null,
			components: [...components, containerMessage('Analyse Sonar en cours...')],
			flags: MessageFlags.IsComponentsV2,
		});
		try {
			await sonarAnalyse(volumeId, { projectKey, projectName: projectKey });
			await sonarApi.waitForAnalysisCompletion(projectKey);
			console.log('[Analysis] Sonar analyse successfully');
		}
		catch (sonarErr) {
			console.error('[Analysis] Sonar failed:', sonarErr.message);
			console.error(sonarErr);
			await interaction.editReply({ components: [...components, containerMessage('⚠️ Sonar n\'a pas pu s\'exécuter.')] });
			return null;
		}
		// Fetch metrics from Sonar API (with retry)
		try {
			const metrics = await sonarApi.fetchProjectMetricsWithRetry(projectKey, 5, 2000);
			console.log('[Analysis] Sonar metrics fetched successfully');
			if (metrics) {
				const container = createInteractiveReport(metrics, projectKey);
				interaction.client.projectCache[projectKey].sonar = {};
				await interaction.editReply({ components: [...components, container] });
				console.log(`[Analysis] Sonar interactive report generated for project ${projectKey}`);
				await generateSonarReport(projectKey, volumeId);
				return metrics;
			}
			else {
				console.error('[Analysis] Failed to fetch metrics');
				await interaction.editReply({ components: [...components, containerMessage('⚠️ Les résultats Sonar n\'ont pas pu être récupérés')] });

				return null;
			}
		}
		catch (apiErr) {
			console.error('[Analysis] Failed to fetch metrics:', apiErr.message);
			console.error(apiErr);
			await interaction.editReply({ components: [...components, containerMessage('⚠️ Les résultats Sonar n\'ont pas pu être récupérés')] });

		}
	},
};