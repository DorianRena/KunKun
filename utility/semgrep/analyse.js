const { semgrepAnalyse } = require('../docker/semgrep-analyse');
const { formatSemgrepReport } = require('./report-formatter');

module.exports = {
	async analyse(interaction, volumeId, repoUrl) {
		await interaction.editReply('Analyse Semgrep en cours...');
		try {
			const semgrepOutput = await semgrepAnalyse(volumeId, { config: 'p/owasp-top-ten' });
			const embed = formatSemgrepReport(semgrepOutput, repoUrl);
			const message = await interaction.fetchReply();
			await interaction.editReply({ content: '', embeds: [...message.embeds, embed] });
			console.log('[Analysis] Semgrep report generated');
			return semgrepOutput;
		}
		catch (semgrepErr) {
			console.error('[Analysis] Failed to run Semgrep:', semgrepErr.message);
			await interaction.editReply({ content: '⚠️ Semgrep n\'a pas pu s\'exécuter.' });
			return null;
		}
	},
};