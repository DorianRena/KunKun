// utility/pipeline/report-formatter.js
const { EmbedBuilder } = require('discord.js');

function formatPipelineReport(scanResult, repoUrl) {
	const { findings, stats } = scanResult;

	const embed = new EmbedBuilder()
		.setTitle('🔧 Rapport Pipeline — Secrets dans les logs')
		.setURL(repoUrl)
		.setTimestamp()
		.addFields(
			{ name: '🔁 Runs scannés', value: `${stats.runsScanned}`, inline: true },
			{ name: '⚙️ Jobs scannés', value: `${stats.jobsScanned}`, inline: true },
			{ name: '🔑 Secrets trouvés', value: `${stats.secretsFound}`, inline: true },
		);

	if (!findings.length) {
		return embed.setColor(0x00cc66).setDescription('✅ Aucun secret détecté dans les logs de pipeline.');
	}

	embed.setColor(0xff0000).setDescription(`🚨 **${findings.length} secret(s) détecté(s)** dans les logs CI/CD !`);

	// Grouper par type
	const byType = findings.reduce((acc, f) => {
		(acc[f.secretType] = acc[f.secretType] || []).push(f);
		return acc;
	}, {});

	for (const [type, items] of Object.entries(byType).slice(0, 5)) {
		embed.addFields({
			name: `🔑 ${type} (${items.length})`,
			value: items.slice(0, 3).map(f =>
				`Job : \`${f.jobName}\` — \`${f.preview}\``,
			).join('\n'),
		});
	}

	return embed;
}

module.exports = { formatPipelineReport };