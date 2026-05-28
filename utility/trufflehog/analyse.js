const { trufflehogAnalyze } = require('../docker/trufflehog-analyse');
const { createInteractiveReport } = require('./interactive-report');
const { MessageFlags } = require('discord.js');
const { colors } = require('../../config');
const { containerInfoMessage } = require('../discord');

function containerMessage(message, accentColor = colors.log) {
	return containerInfoMessage('## 🔐 TruffleHog', message, accentColor);
}

module.exports = {
	async analyse(interaction, volumeId, projectKey) {
		const message = await interaction.fetchReply();
		const components = message.components;
		await interaction.editReply({
			content: null,
			components: [...components, containerMessage('Analyse des secrets en cours...')],
			flags: MessageFlags.IsComponentsV2,
		});
		try {
			const findings = await trufflehogAnalyze(volumeId);
			console.log(`[Analysis] TruffleHog: ${findings.length} finding(s)`);
			interaction.client.projectCache[projectKey].trufflehog = {};
			interaction.client.projectCache[projectKey].trufflehog.findings = findings;
			const container = createInteractiveReport(findings, projectKey);
			console.log('[Analysis] TruffleHog report generated');
			await interaction.editReply({ components: [...components, container] });
			return findings;
		}
		catch (thErr) {
			console.error('[Analysis] TruffleHog failed:', thErr.message);
			console.error(thErr);
			await interaction.editReply({ components: [...components, containerMessage('⚠️ TruffleHog n\'a pas pu s\'exécuter.')] });
			return null;
		}
	},
};