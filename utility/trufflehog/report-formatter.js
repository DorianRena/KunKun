const { EmbedBuilder } = require('discord.js');

function formatTrufflehogReport(findings, repoUrl) {
	const embed = new EmbedBuilder()
		.setTitle('🔐 Rapport TruffleHog — Secrets Leak')
		.setURL(repoUrl)
		.setTimestamp();

	if (!findings.length) {
		return embed
			.setColor(0x00cc66)
			.setDescription('✅ Aucun secret détecté dans l\'historique ou les fichiers CI/CD.');
	}

	const verified = findings.filter(f => f.Verified).length;
	embed.setColor(verified > 0 ? 0xff0000 : 0xff6600);
	embed.setDescription(`⚠️ **${findings.length} secret(s) détecté(s)** — ${verified} vérifiée(s) active(s)`);

	// Grouper par DetectorName
	const byDetector = findings.reduce((acc, f) => {
		(acc[f.DetectorName] = acc[f.DetectorName] || []).push(f);
		return acc;
	}, {});

	for (const [detector, items] of Object.entries(byDetector).slice(0, 5)) {
		const verifiedCount = items.filter(f => f.Verified).length;
		const sample = items[0];

		// Chemin correct dans la structure JSON
		const file = sample?.SourceMetadata?.Data?.Filesystem?.file
                  ?? sample?.SourceMetadata?.Data?.Git?.file
                  ?? 'N/A';
		const line = sample?.SourceMetadata?.Data?.Filesystem?.line
                  ?? sample?.SourceMetadata?.Data?.Git?.line
                  ?? null;
		const commit = sample?.SourceMetadata?.Data?.Git?.commit ?? null;

		const lines = [
			`Fichier : \`${file}${line ? `:${line}` : ''}\``,
			commit ? `Commit  : \`${commit.slice(0, 10)}\`` : null,
			sample.Redacted ? `Valeur  : \`${sample.Redacted}\`` : null,
			sample.DetectorDescription ? `ℹ️ ${sample.DetectorDescription}` : null,
			verifiedCount > 0 ? '🚨 **Secret ACTIF et vérifié**' : '⚠️ Secret potentiel (non vérifié)',
		].filter(Boolean).join('\n');

		embed.addFields({
			name: `🔑 ${detector} (${items.length} occurrence(s), ${verifiedCount} vérifiée(s))`,
			value: lines,
		});
	}

	if (Object.keys(byDetector).length > 5) {
		embed.setFooter({ text: `Et ${Object.keys(byDetector).length - 5} autres types de secrets…` });
	}

	return embed;
}

module.exports = { formatTrufflehogReport };