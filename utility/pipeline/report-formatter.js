// utility/pipeline/report-formatter.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
	/**
	 * Formate le résultat du scan de pipeline en Discord Embed
	 * @param {{ findings: object[], stats: object }} scanResult
	 * @param {string} repoUrl
	 * @returns {EmbedBuilder}
	 */
	formatPipelineReport(scanResult, repoUrl) {
		const { findings, stats } = scanResult;
		const repoName = repoUrl.split('/').slice(-2).join('/');

		// Couleur selon nombre de findings
		let embedColor = 0x00FF00;
		if (findings.length >= 5) embedColor = 0xFF0000;
		else if (findings.length >= 1) embedColor = 0xFF6600;

		const embed = new EmbedBuilder()
			.setColor(embedColor)
			.setTitle(`🔧 Rapport Pipeline — ${repoName}`)
			.setDescription(`**Secrets détectés dans les logs CI/CD : ${findings.length}**`)
			.addFields(
				{
					name: '🔁 Runs scannés',
					value: `${stats.runsScanned}`,
					inline: true,
				},
				{
					name: '⚙️ Jobs scannés',
					value: `${stats.jobsScanned}`,
					inline: true,
				},
				{
					name: '🔑 Secrets trouvés',
					value: `${stats.secretsFound}`,
					inline: true,
				},
			);

		if (!findings.length) {
			embed.addFields({
				name: '✅ Statut',
				value: 'Aucun secret détecté dans les logs de pipeline',
			});
			embed.setFooter({ text: 'Powered by KunKun Pipeline Scanner' });
			embed.setTimestamp();
			return embed;
		}

		// Grouper par type de secret
		const byType = findings.reduce((acc, f) => {
			(acc[f.secretType] = acc[f.secretType] || []).push(f);
			return acc;
		}, {});

		for (const [type, items] of Object.entries(byType).slice(0, 5)) {
			const examples = items.slice(0, 2).map(f =>
				`• Job \`${f.jobName}\` — ligne ${f.line} (\`${f.preview}\`)`,
			).join('\n');

			embed.addFields({
				name: `🔑 ${type} — ${items.length} occurrence(s)`,
				value: examples || 'N/A',
			});
		}

		if (Object.keys(byType).length > 5) {
			embed.addFields({
				name: '⚠️ Et aussi...',
				value: `${Object.keys(byType).length - 5} autre(s) type(s) de secrets non affichés`,
			});
		}

		embed.setFooter({ text: 'Powered by KunKun Pipeline Scanner' });
		embed.setTimestamp();
		return embed;
	},
};