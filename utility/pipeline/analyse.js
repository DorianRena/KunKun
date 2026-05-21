const { fetchGithubPipelineLogs } = require('../git/pipeline-logs');
const { scanPipelineLogs } = require('./secret-scanner');
const { formatPipelineReport } = require('./report-formatter');

module.exports = {
	async analyse(interaction, volumeId, repoUrl, githubToken) {
		await interaction.editReply('Analyse des logs de pipeline en cours...');
		try {
			const pipelineData = await fetchGithubPipelineLogs(repoUrl, githubToken);
			console.log('[Analysis] Pipeline logs fetched successfully');
			const scanResult = scanPipelineLogs(pipelineData);
			const embed = formatPipelineReport(scanResult, repoUrl);
			const message = await interaction.fetchReply();
			await interaction.editReply({ content: '', embeds: [...message.embeds, embed] });
			console.log('[Analysis] Pipeline report generated');
		}
		catch (pipelineErr) {
			console.error('[Analysis] Failed to run pipeline analysis:', pipelineErr.message);
			await interaction.editReply({ content: '⚠️ L\'analyse des logs de pipeline n\'a pas pu s\'exécuter.' });
		}
	},
};