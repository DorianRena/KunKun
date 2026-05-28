const { semgrepAnalyse } = require('../docker/semgrep-analyse');
const { createInteractiveReport, parseSemgrepOutput } = require('./interactive-report');
const { MessageFlags } = require('discord.js');
const { containerInfoMessage } = require('../discord');
const { colors } = require('../../config');

function containerMessage(message, accentColor = colors.log) {
	return containerInfoMessage('## 🔍 Semgrep', message, accentColor);
}

module.exports = {
	async analyse(interaction, volumeId, projectKey) {
		const message = await interaction.fetchReply();
		const components = message.components;
		await interaction.editReply({
			content: null,
			components: [...components, containerMessage('Analyse Semgrep en cours...')],
			flags: MessageFlags.IsComponentsV2,
		});
		try {
			const semgrepOutput = await semgrepAnalyse(volumeId, { config: 'p/owasp-top-ten' });
			const { results, scannedCount } = parseSemgrepOutput(semgrepOutput);
			interaction.client.semgrepCache[projectKey] = {};
			interaction.client.semgrepCache[projectKey].results = results;
			const container = createInteractiveReport(results, scannedCount, projectKey);

			console.log('[Analysis] Semgrep report generated');
			await interaction.editReply({ components: [...components, container] });
			return semgrepOutput;
		}
		catch (semgrepErr) {
			console.error('[Analysis] Failed to run Semgrep:', semgrepErr.message);
			console.error(semgrepErr);
			await interaction.editReply({ components: [...components, containerMessage('⚠️ Semgrep n\'a pas pu s\'exécuter.')] });
			return null;
		}
	},
};