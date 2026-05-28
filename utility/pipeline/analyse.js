const config = require('../../config');
const { fetchPipelineLogs } = require('../git/pipeline-logs');
const { scanPipelineLogs } = require('./secret-scanner');
const { createInteractiveReport } = require('./interactive-report');
const { MessageFlags } = require('discord.js');
const { colors } = require('../../config');
const { containerInfoMessage } = require('../discord');

function containerMessage(message, accentColor = colors.log) {
	return containerInfoMessage('## 🔧 Pipeline', message, accentColor);
}

module.exports = {
	async analyse(interaction, volumeId, projectKey) {
		const repoUrl = interaction.client.projectCache[projectKey].base;
		const message = await interaction.fetchReply();
		const components = message.components;

		await interaction.editReply({
			content: null,
			components: [...components, containerMessage('Analyse des logs de pipeline en cours...')],
			flags: MessageFlags.IsComponentsV2,
		});
		try {
			let platform;
			let token;
			if (repoUrl.includes('github.com')) {
				console.log('[Analysis] Analyzing GitHub repository');
				platform = 'github';
				token = config.github.token;
			}
			else if (repoUrl.includes('gitlab.com')) {
				console.log('[Analysis] Analyzing GitLab repository');
				platform = 'gitlab';
				token = config.gitlab.token;
			}
			else {
				throw new Error('Plateforme non reconnue (GitHub ou GitLab uniquement).');
			}
			const pipelineData = await fetchPipelineLogs(platform, repoUrl, token);
			console.log('[Analysis] Pipeline logs fetched successfully');
			const scanResult = scanPipelineLogs(pipelineData);
			console.log('[Analysis] Pipeline scan successfully');
			interaction.client.projectCache[projectKey].pipeline = {};
			interaction.client.projectCache[projectKey].pipeline.findings = scanResult.findings;
			const container = createInteractiveReport(scanResult, projectKey);
			console.log('[Analysis] Pipeline report generated');
			await interaction.editReply({ components: [...components, container] });
			return scanResult;
		}
		catch (pipelineErr) {
			console.error('[Analysis] Failed to run pipeline analysis:', pipelineErr.message);
			console.error(pipelineErr);
			await interaction.editReply({ components: [...components, containerMessage('⚠️ L\'analyse des logs de pipeline n\'a pas pu s\'exécuter.')] });
			return null;
		}
	},
};