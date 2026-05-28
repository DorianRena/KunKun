const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ContainerBuilder,
	SeparatorSpacingSize,
} = require('discord.js');
const { colors } = require('../../config');

const DETECTOR_EMOJIS = {
	Stripe: '💳',
	MongoDB: '🍃',
	URI: '🔗',
	Gitlab: '🦊',
	GitHub: '🐙',
	AWS: '☁️',
	GCP: '☁️',
	Azure: '☁️',
	JWT: '🎫',
	Slack: '💬',
	Twilio: '📞',
	SendGrid: '📧',
};

function detectorEmoji(name) {
	return DETECTOR_EMOJIS[name] ?? '🔑';
}

/**
 * Regroupe les findings par DetectorName.
 * @param {Array} findings
 * @returns {Map<string, Array>}
 */
function groupByDetector(findings) {
	const map = new Map();
	for (const f of findings) {
		if (!map.has(f.DetectorName)) map.set(f.DetectorName, []);
		map.get(f.DetectorName).push(f);
	}
	return map;
}

module.exports = {
	/**
	 * Rapport interactif TruffleHog avec select menu par détecteur.
	 * @param {Array} findings
	 * @param {string} projectKey
	 * @returns ContainerBuilder
	 */
	createInteractiveReport(findings, projectKey) {
		const total = findings.length;
		const byDetector = groupByDetector(findings);
		const statusEmoji = total > 0 ? '🔴' : '🟢';
		const accentColor = total > 0 ? colors.error : colors.good;

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(t => t.setContent('## 🔐 Rapport TruffleHog'))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(`### ${statusEmoji} ${total} secret(s) détecté(s)`))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

		if (!total) {
			container.addTextDisplayComponents(t =>
				t.setContent('✅ Aucun secret détecté dans les fichiers analysés.'),
			);
			return container;
		}

		// Résumé par détecteur
		const summaryLines = [...byDetector.entries()].map(([name, items]) => {
			const verifiedCount = items.filter(f => f.Verified).length;
			const verifiedBadge = verifiedCount > 0 ? ` — 🚨 ${verifiedCount} actif(s)` : '';
			return `${detectorEmoji(name)} **${name}** : ${items.length} occurrence(s)${verifiedBadge}`;
		});

		container
			.addTextDisplayComponents(t => t.setContent(summaryLines.join('\n')));

		// Select menu par détecteur
		const options = [...byDetector.entries()].slice(0, 25).map(([name, items]) => {
			const verifiedCount = items.filter(f => f.Verified).length;
			return new StringSelectMenuOptionBuilder()
				.setLabel(`${name} (${items.length})`)
				.setDescription(verifiedCount > 0 ? `⚠️ ${verifiedCount} secret(s) actif(s) vérifié(s)` : `${items.length} occurrence(s) non vérifiée(s)`)
				.setValue(name)
				.setEmoji(detectorEmoji(name));
		});

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`trufflehog_detector:${projectKey}`)
			.setPlaceholder('🔑 Choisir un type de secret')
			.addOptions(options);

		container
			.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

		return container;
	},

	/**
	 * Select menu des occurrences pour un détecteur donné.
	 * @param {Array} findings - findings filtrés par DetectorName
	 * @param {string} detectorName
	 * @param {string} projectKey
	 * @returns {ActionRowBuilder}
	 */
	createFindingsSelectMenu(findings, detectorName, projectKey) {
		const options = findings.slice(0, 25).map((f, idx) => {
			const file = f.SourceMetadata?.Data?.Filesystem?.file
				?? f.SourceMetadata?.Data?.Git?.file
				?? 'N/A';
			const line = f.SourceMetadata?.Data?.Filesystem?.line
				?? f.SourceMetadata?.Data?.Git?.line
				?? '?';
			const label = `${file.split('/').pop()}:${line}`.slice(0, 70);
			const description = (f.Verified ? '🚨 Actif et vérifié — ' : '') + file.slice(0, 100);
			return new StringSelectMenuOptionBuilder()
				.setLabel(label)
				.setDescription(description.slice(0, 100))
				.setValue(String(idx));
		});

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`trufflehog_select:${detectorName}:${projectKey}`)
			.setPlaceholder('Sélectionnez une occurrence')
			.addOptions(options);

		return new ActionRowBuilder().addComponents(selectMenu);
	},

	/**
	 * Détail d'un finding TruffleHog en Components V2.
	 * @param {object} finding
	 * @param {string} repoUrl
	 * @returns {{ container: ContainerBuilder, flags: number }}
	 */
	showFindingDetail(finding, repoUrl) {
		const file = finding.SourceMetadata?.Data?.Filesystem?.file?.replace(/^\/repo\//, '')
			?? finding.SourceMetadata?.Data?.Git?.file
			?? 'N/A';
		const line = finding.SourceMetadata?.Data?.Filesystem?.line
			?? finding.SourceMetadata?.Data?.Git?.line
			?? null;
		const commit = finding.SourceMetadata?.Data?.Git?.commit ?? null;

		const fileUrl = repoUrl ? `${repoUrl.replace(/\/tree\//, '/blob/')}/${file}${line ? `#L${line}` : ''}` : null;
		const fileValue = fileUrl ? `[${file}:${line ?? '?'}](${fileUrl})` : `${file}:${line ?? '?'}`;

		const accentColor = finding.Verified ? colors.error : colors.warning;
		const statusLine = finding.Verified
			? '🚨 **Secret ACTIF et vérifié**'
			: `⚠️ Secret potentiel (non vérifié)${finding.VerificationError ? ` — \`${finding.VerificationError.slice(0, 80)}\`` : ''}`;

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(t =>
				t.setContent(`## ${detectorEmoji(finding.DetectorName)} ${finding.DetectorName}`),
			)
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent([
				`📁 **Fichier** : ${fileValue}`,
				commit ? `🔖 **Commit** : \`${commit.slice(0, 10)}\`` : null,
				`🔍 **Décodeur** : ${finding.DecoderName}`,
			].filter(Boolean).join('\n')))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(statusLine));

		// Valeur redacted si disponible
		if (finding.Redacted) {
			container
				.addSeparatorComponents(s => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t =>
					t.setContent(`🔏 **Valeur** : \`${finding.Redacted}\``),
				);
		}

		// Description du détecteur
		if (finding.DetectorDescription) {
			container
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t =>
					t.setContent(`### 📋 Description\n${finding.DetectorDescription}`),
				);
		}

		// Bouton rotation guide
		const rotationGuide = finding.ExtraData?.rotation_guide;
		if (rotationGuide) {
			container
				.addSeparatorComponents(s => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
				.addActionRowComponents(new ActionRowBuilder().addComponents(
					new ButtonBuilder()
						.setLabel('🔄 Guide de rotation')
						.setStyle(ButtonStyle.Link)
						.setURL(rotationGuide),
				));
		}

		return container;
	},
};