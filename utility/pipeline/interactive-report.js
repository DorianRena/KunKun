const {
	ActionRowBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ContainerBuilder,
	SeparatorSpacingSize,
} = require('discord.js');
const { colors } = require('../../config');

const SECRET_EMOJIS = {
	'AWS Secret Key': '☁️',
	'AWS Access Key': '☁️',
	'Stripe Key': '💳',
	'Generic Token': '🎫',
	'Private Key': '🔑',
};

function secretEmoji(type) {
	return SECRET_EMOJIS[type] ?? '🔐';
}

/**
 * Nettoie les escape codes ANSI des logs CI.
 */
function stripAnsi(str) {
	return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '');
}

/**
 * Extrait le timestamp ISO d'une ligne de log CI (ex: "2026-05-20T14:29:24.982Z ...").
 */
function stripTimestamp(line) {
	return line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/, '');
}

/**
 * Regroupe les findings par secretType.
 */
function groupBySecretType(findings) {
	const map = new Map();
	for (const f of findings) {
		if (!map.has(f.secretType)) map.set(f.secretType, []);
		map.get(f.secretType).push(f);
	}
	return map;
}

/**
 * Déduplique les findings par preview + secretType (même secret trouvé dans plusieurs runs).
 */
function deduplicateFindings(findings) {
	const seen = new Set();
	return findings.filter(f => {
		const key = `${f.secretType}:${f.preview}:${f.jobName}:${f.line}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

module.exports = {
	/**
	 * Rapport interactif pipeline avec select menu par type de secret.
	 * @param {{ findings: Array, stats: object }} scanResult
	 * @param {string} projectKey
	 * @returns {ContainerBuilder}
	 */
	createInteractiveReport(scanResult, projectKey) {
		const { findings, stats } = scanResult;
		const deduplicated = deduplicateFindings(findings);
		const byType = groupBySecretType(deduplicated);
		const total = deduplicated.length;
		const accentColor = total > 0 ? colors.error : colors.good;
		const statusEmoji = total > 0 ? '🔴' : '🟢';

		const platformEmoji = stats.platform === 'github' ? '🐙' : stats.platform === 'gitlab' ? '🦊' : '⚙️';

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(t => t.setContent('## 🔧 Rapport Pipeline — Secrets CI/CD'))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent([
				`${platformEmoji} **Plateforme** : ${stats.platform ?? 'N/A'}`,
				`🔁 **Runs scannés** : ${stats.runsScanned} — affectés : ${stats.affectedRuns}`,
				`⚙️ **Jobs scannés** : ${stats.jobsScanned} — affectés : ${stats.affectedJobs}`,
			].join('\n')))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(`### ${statusEmoji} ${total} secret(s) unique(s) détecté(s)`));

		if (!total) {
			container.addTextDisplayComponents(t =>
				t.setContent('✅ Aucun secret détecté dans les logs de pipeline.'),
			);
			return container;
		}

		// Résumé par type
		const summaryLines = [...byType.entries()].map(([type, items]) =>
			`${secretEmoji(type)} **${type}** : ${items.length} occurrence(s)`,
		);

		container
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(summaryLines.join('\n')));

		// Select menu par type de secret
		const options = [...byType.entries()].slice(0, 25).map(([type, items]) =>
			new StringSelectMenuOptionBuilder()
				.setLabel(`${type} (${items.length})`)
				.setDescription(`${items.length} occurrence(s) dans les logs`)
				.setValue(type)
				.setEmoji(secretEmoji(type)),
		);

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`pipeline_secrettype:${projectKey}`)
			.setPlaceholder('🔐 Choisir un type de secret')
			.addOptions(options);

		container
			.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));

		return container;
	},

	/**
	 * Select menu des occurrences pour un type de secret donné.
	 * @param {Array} findings
	 * @param {string} secretType
	 * @param {string} projectKey
	 * @returns {ActionRowBuilder}
	 */
	createFindingsSelectMenu(findings, secretType, projectKey) {
		const options = findings.slice(0, 25).map((f, idx) => {
			const label = `${f.jobName} — ligne ${f.line} (${f.preview})`.slice(0, 70);
			const description = `Run: ${f.runName} · ${new Date(f.jobStartedAt).toLocaleDateString('fr-FR')}`.slice(0, 100);
			return new StringSelectMenuOptionBuilder()
				.setLabel(label)
				.setDescription(description)
				.setValue(String(idx));
		});

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`pipeline_select:${secretType}:${projectKey}`)
			.setPlaceholder('Sélectionnez une occurrence')
			.addOptions(options);

		return new ActionRowBuilder().addComponents(selectMenu);
	},

	/**
	 * Détail d'un finding pipeline en Components V2.
	 * @param {object} finding
	 * @returns ContainerBuilder
	 */
	showFindingDetail(finding) {
		const cleanLine = stripAnsi(stripTimestamp(finding.lineContent ?? ''));
		const beforeLines = (finding.context?.before ?? []).map(l => stripAnsi(stripTimestamp(l)));
		const afterLines = (finding.context?.after ?? []).map(l => stripAnsi(stripTimestamp(l)));

		const snippet = [
			...beforeLines.map(l => `  ${l}`),
			`▶ ${cleanLine}`,
			...afterLines.map(l => `  ${l}`),
		].join('\n').slice(0, 800);

		const jobStatusEmoji = finding.jobStatus === 'success' ? '✅' : finding.jobStatus === 'failure' ? '❌' : '⚪';
		const runStatusEmoji = finding.runStatus === 'success' ? '✅' : finding.runStatus === 'failure' ? '❌' : '⚪';

		return new ContainerBuilder()
			.setAccentColor(colors.error)
			.addTextDisplayComponents(t =>
				t.setContent(`## ${secretEmoji(finding.secretType)} ${finding.secretType}`),
			)
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			// Localisation dans le pipeline
			.addSectionComponents(section =>
				section
					.addTextDisplayComponents(t =>
						t.setContent([
							`🔁 **Run** : ${finding.runName} ${runStatusEmoji}`,
							`⚙️ **Job** : \`${finding.jobName}\` ${jobStatusEmoji}`,
							`👤 **Déclenché par** : ${finding.triggeredBy}`,
						].join('\n')))
					.setButtonAccessory(button =>
						button
							.setLabel('🔁 Voir le run')
							.setStyle(ButtonStyle.Link)
							.setURL(finding.runUrl),
					),
			)
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			// Commit
			.addTextDisplayComponents(t => t.setContent([
				`🔖 **Commit** : [${finding.commitSha?.slice(0, 10)}](${finding.repoUrl?.replace(/\.git$/, '')}/commit/${finding.commitSha})`,
				`💬 **Message** : ${finding.commitMessage}`,
				`📅 **Date** : ${new Date(finding.jobStartedAt).toLocaleString('fr-FR')}`,
			].join('\n')))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t =>
				t.setContent(`### 📋 Contexte du log\n\`\`\`\n${snippet}\n\`\`\``),
			);
	},

	deduplicateFindings,
	groupBySecretType,
};