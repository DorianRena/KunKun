const config = require('../../config');
const { fetchPipelineLogs } = require('../git/pipeline-logs');
const { scanPipelineLogs } = require('./secret-scanner');
const { formatPipelineReport } = require('./report-formatter');

module.exports = {
	async analyse(interaction, volumeId, repoUrl) {
		await interaction.editReply('Analyse des logs de pipeline en cours...');
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
			const embed = formatPipelineReport(scanResult, repoUrl);
			const message = await interaction.fetchReply();
			await interaction.editReply({ content: '', embeds: [...message.embeds, embed] });
			console.log('[Analysis] Pipeline report generated');
			return scanResult;
		}
		catch (pipelineErr) {
			console.error('[Analysis] Failed to run pipeline analysis:', pipelineErr.message);
			await interaction.editReply({ content: '⚠️ L\'analyse des logs de pipeline n\'a pas pu s\'exécuter.' });
			return null;
		}
	},
};