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
		const repoName = repoUrl ? repoUrl.split('/').slice(-2).join('/') : 'Inconnu';

		// Couleur selon sévérité (rouge si des secrets sont trouvés)
		const embedColor = findings.length > 0 ? 0xFF0000 : 0x00FF00;

		const embed = new EmbedBuilder()
			.setColor(embedColor)
			.setTitle(`🔧 Rapport Pipeline — ${repoName}`)
			.setDescription(`**${findings.length} secret(s) détecté(s)** dans les logs CI/CD.`)
			.addFields(
				{ name: '🌐 Plateforme', value: stats.platform || 'N/A', inline: true },
				{ name: '🔁 Runs affectés', value: `${stats.affectedRuns}/${stats.runsScanned}`, inline: true },
				{ name: '⚙️ Jobs affectés', value: `${stats.affectedJobs}/${stats.jobsScanned}`, inline: true },
			);

		if (findings.length === 0) {
			embed.addFields({ name: '✅ Statut', value: 'Aucun secret détecté.' });
		}
		else {
			// Affichage par type de secret (top 5)
			const typeEntries = Object.entries(stats.byType);

			for (const [type, count] of typeEntries.slice(0, 5)) {
				// Récupération du premier exemple pour ce type pour donner du contexte
				const example = findings.find(f => f.secretType === type);
				embed.addFields({
					name: `🔑 ${type} (${count})`,
					value: `Dernière vue : Job \`${example.jobName}\` (ligne ${example.line}) \`${example.preview}\``,
				});
			}

			if (typeEntries.length > 5) {
				embed.addFields({
					name: '⚠️ Et aussi...',
					value: `${typeEntries.length - 5} autre(s) type(s) de secrets détectés.`,
				});
			}
		}

		embed.setFooter({ text: 'Powered by KunKun Pipeline Scanner' });
		embed.setTimestamp();
		return embed;
	},
};