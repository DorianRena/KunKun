const { trufflehogAnalyze } = require('../docker/trufflehog-analyse');
const { formatTrufflehogReport } = require('./report-formatter');

module.exports = {
	async analyse(interaction, volumeId, repoUrl) {
		await interaction.editReply('Analyse des secrets en cours (TruffleHog)...');
		try {
			const findings = await trufflehogAnalyze(volumeId, repoUrl);
			const embed = formatTrufflehogReport(findings, repoUrl);
			const message = await interaction.fetchReply();
			await interaction.editReply({ content: '', embeds: [...message.embeds, embed] });
			console.log(`[Analysis] TruffleHog: ${findings.length} finding(s)`);
			return findings;
		}
		catch (thErr) {
			console.error('[Analysis] TruffleHog failed:', thErr.message);
			await interaction.editReply({ content: '⚠️ TruffleHog n\'a pas pu s\'exécuter.' });
			return null;
		}
	},
};