const { EmbedBuilder } = require('discord.js');

module.exports = {
	formatSemgrepReport(jsonOutput, repoUrl) {
		let report;
		try {
			report = JSON.parse(jsonOutput);
		}
		catch (err) {
			console.error('[Semgrep][Formatter] Failed to parse Semgrep JSON:', err.message);
			return new EmbedBuilder()
				.setColor(0xFF0000)
				.setTitle('❌ Erreur d\'analyse')
				.setDescription('Le rapport généré n\'est pas un JSON valide.');
		}

		const results = report.results || [];
		const severities = { ERROR: 0, WARNING: 0, INFO: 0 };

		// Comptage intelligent des sévérités
		results.forEach(r => {
			const sev = (r.extra?.severity || 'WARNING').toUpperCase();
			if (sev in severities) severities[sev]++;
			else severities.WARNING++;
		});

		// Calcul couleur
		const color = severities.ERROR > 0 ? 0xFF0000 : (severities.WARNING > 0 ? 0xFFA500 : 0x00FF00);

		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle(`🔍 Rapport de sécurité : ${repoUrl.split('/').slice(-2).join('/')}`)
			.setDescription(`Analyse terminée sur **${report.paths?.scanned?.length || 0}** fichiers.`)
			.addFields(
				{ name: '🔴 Erreurs', value: `${severities.ERROR}`, inline: true },
				{ name: '🟠 Warnings', value: `${severities.WARNING}`, inline: true },
				{ name: '🔵 Infos', value: `${severities.INFO}`, inline: true },
			);

		// Ajout des 5 premières failles trouvées (si elles existent)
		if (results.length > 0) {
			const topFindings = results.slice(0, 5).map(r => {
				const fileName = r.path.split('/').pop();
				return `**[${r.extra.severity}]** ${r.check_id.split('.').pop()} \n└─ \`${fileName}:${r.start.line}\``;
			}).join('\n');

			embed.addFields({ name: '🔍 Top failles trouvées', value: topFindings });

			if (results.length > 5) {
				embed.addFields({ name: '...', value: `*...et ${results.length - 5} autres problèmes.*` });
			}
		}
		else {
			embed.addFields({ name: '✅ Statut', value: 'Aucune vulnérabilité critique détectée.' });
		}

		return embed
			.setFooter({ text: `Analyse effectuée en ${(report.time?.total_time || 0).toFixed(2)}s` })
			.setTimestamp();
	},
};