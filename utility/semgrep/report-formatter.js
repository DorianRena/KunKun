const { EmbedBuilder } = require('discord.js');

module.exports = {
	/**
	 * Formate la sortie JSON de Semgrep en Discord Embed
	 * @param {string} jsonOutput Sortie JSON de Semgrep
	 * @param {string} repoUrl URL du repository
	 * @returns {EmbedBuilder} Embed formaté
	 */
	formatSemgrepReport(jsonOutput, repoUrl) {
		let report;
		try {
			report = JSON.parse(jsonOutput);
		}
		catch (err) {
			console.error('[Semgrep][Formatter] Failed to parse Semgrep JSON:', err.message);
			return new EmbedBuilder()
				.setColor(0xFF0000)
				.setTitle('❌ Rapport Semgrep')
				.setDescription('Erreur lors du parsing du rapport Semgrep');
		}

		const results = report.results || [];
		const errors = report.errors || [];
		const paths = report.paths || {};
		const scannedFiles = (paths.scanned || []).length;
		const totalTime = (report.time?.total_time || 0).toFixed(2);

		// Catégoriser par severité
		const severities = {
			CRITICAL: 0,
			HIGH: 0,
			MEDIUM: 0,
			LOW: 0,
		};

		results.forEach(result => {
			const severity = (result.extra?.severity || 'MEDIUM').toUpperCase();
			if (severity in severities) {
				severities[severity]++;
			}
		});

		const totalFindings = results.length;
		const hasCritical = severities.CRITICAL > 0;
		const hasHigh = severities.HIGH > 0;

		// Détermine la couleur selon severité
		let embedColor = 0x00FF00; // GREEN (aucun problème)
		if (hasCritical) {
			embedColor = 0xFF0000; // RED
		} else if (hasHigh) {
			embedColor = 0xFF6600; // ORANGE
		} else if (severities.MEDIUM > 0) {
			embedColor = 0xFFFF00; // YELLOW
		}

		const embed = new EmbedBuilder()
			.setColor(embedColor)
			.setTitle(`🔍 Rapport Semgrep — ${repoUrl.split('/').slice(-2).join('/')}`)
			.setDescription(`**Findings totaux : ${totalFindings}**`)
			.addFields(
				{
					name: '🔴 CRITICAL',
					value: `${severities.CRITICAL}`,
					inline: true,
				},
				{
					name: '🟠 HIGH',
					value: `${severities.HIGH}`,
					inline: true,
				},
				{
					name: '🟡 MEDIUM',
					value: `${severities.MEDIUM}`,
					inline: true,
				},
				{
					name: '🔵 LOW',
					value: `${severities.LOW}`,
					inline: true,
				},
				{
					name: '📁 Fichiers scannés',
					value: `${scannedFiles}`,
					inline: true,
				},
				{
					name: '⏱️ Durée',
					value: `${totalTime}s`,
					inline: true,
				},
			);

		if (errors.length > 0) {
			embed.addFields({
				name: '⚠️ Erreurs',
				value: errors.slice(0, 5).map(e => `• ${e.message || e}`).join('\n') || 'Erreurs non spécifiées',
			});
		} else {
			embed.addFields({
				name: '✅ Statut',
				value: 'Pas d\'erreurs lors de l\'analyse',
			});
		}

		embed.setFooter({ text: 'Powered by Semgrep' });
		embed.setTimestamp();

		return embed;
	},
};

