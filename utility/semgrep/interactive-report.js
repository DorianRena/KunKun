const {
	ActionRowBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ContainerBuilder,
	SeparatorSpacingSize,
	MessageFlags, ButtonBuilder,
} = require('discord.js');
const { colors } = require('../../config');

function buildFileUrl(repoUrl, filePath, line) {
	const base = repoUrl.replace(/\/tree\//, '/blob/');
	return `${base}/${filePath}${line ? `#L${line}` : ''}`;
}

const SEVERITY_COLORS = { ERROR: colors.error, WARNING: colors.warning, INFO: colors.info };
const SEVERITY_EMOJIS = { ERROR: '🔴', WARNING: '🟠', INFO: '🔵' };

module.exports = {
	parseSemgrepOutput(jsonOutput) {
		const report = JSON.parse(jsonOutput);
		return {
			results: report.results || [],
			scannedCount: report.paths?.scanned?.length || 0,
			totalTime: report.time?.total_time || 0,
		};
	},

	createInteractiveReport(results, scannedCount, projectKey) {
		const counts = { ERROR: 0, WARNING: 0, INFO: 0 };
		for (const r of results) {
			const sev = (r.extra?.severity || 'WARNING').toUpperCase();
			counts[sev in counts ? sev : 'WARNING']++;
		}
		const accentColor = counts.ERROR > 0 ? colors.error : counts.WARNING > 0 ? colors.warning : colors.good;
		const statusEmoji = counts.ERROR > 0 ? '🔴' : counts.WARNING > 0 ? '🟠' : '🟢';
		const total = counts.ERROR + counts.WARNING + counts.INFO;

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(t => t.setContent(`## 🔍 Rapport Semgrep\n${scannedCount} fichier(s) analysé(s)`))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(`### ${statusEmoji} ${total} problème(s) détecté(s)`))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents((t) => t.setContent([
				`🔴 **Erreurs** : ${counts.ERROR}`,
				`🟠 **Warnings** : ${counts.WARNING}`,
				`🔵 **Infos** : ${counts.INFO}`,
			].join('\n')));

		if (counts.ERROR || counts.WARNING || counts.INFO) {
			const severitySelect = new StringSelectMenuBuilder()
				.setCustomId(`semgrep_severity:${projectKey}`)
				.setPlaceholder('🔍 Choisir une sévérité')
				.addOptions(
					new StringSelectMenuOptionBuilder()
						.setLabel('ERROR')
						.setValue('ERROR')
						.setEmoji('🔴'),

					new StringSelectMenuOptionBuilder()
						.setLabel('WARNING')
						.setValue('WARNING')
						.setEmoji('🟠'),

					new StringSelectMenuOptionBuilder()
						.setLabel('INFO')
						.setValue('INFO')
						.setEmoji('🔵'),
				);
			const severityRow = new ActionRowBuilder().addComponents(severitySelect);
			container
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t => t.setContent('### 📌 Explorer les problèmes'))
				.addActionRowComponents(severityRow);
		}
		return container;
	},

	createIssuesSelectMenu(issues, severity, projectKey) {
		const options = issues.slice(0, 25).map((r, idx) => {
			const label = `[${r.check_id.split('.').pop()}] ${r.extra?.message || r.check_id}`.slice(0, 70);
			const description = `${r.path}:${r.start?.line ?? '?'}`.slice(0, 100);
			return new StringSelectMenuOptionBuilder().setLabel(label).setDescription(description).setValue(String(idx));
		});
		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`semgrep_select:${severity}:${projectKey}`)
			.setPlaceholder('Sélectionnez un résultat')
			.addOptions(options);
		return new ActionRowBuilder().addComponents(selectMenu);
	},

	/*	createFindingDetailEmbed(finding, repoUrl) {
			const severity = (finding.extra?.severity || 'WARNING').toUpperCase();
			const filePath = finding.path;
			const line = finding.start?.line ?? null;
			const fileUrl = repoUrl ? buildFileUrl(repoUrl, filePath, line) : null;
			const fileValue = fileUrl ? `[${filePath}:${line ?? '?'}](${fileUrl})` : `${filePath}:${line ?? '?'}`;
			const message = finding.extra?.message || finding.check_id;
			const cwe = finding.extra?.metadata?.cwe ? `\n🔗 **CWE** : ${[].concat(finding.extra.metadata.cwe).join(', ')}` : '';
			const owasp = finding.extra?.metadata?.owasp ? `\n🔗 **OWASP** : ${[].concat(finding.extra.metadata.owasp).join(', ')}` : '';
			const snippet = finding.extra?.lines?.trim() ? `\n\`\`\`\n${finding.extra.lines.trim().slice(0, 500)}\n\`\`\`` : '';

			const container = new ContainerBuilder()
				.setAccentColor(SEVERITY_COLORS[severity] ?? colors.log)
				.addTextDisplayComponents(t => t.setContent([
					`## ${SEVERITY_EMOJIS[severity] ?? '⚠️'} ${message}`,
					`📁 **Fichier** : ${fileValue}`, `⚠️ **Sévérité** : ${severity}`,
					`🏷️ **Règle** : \`${finding.check_id}\`${cwe}${owasp}`,
				].join('\n')));

			if (snippet) container.addTextDisplayComponents((t) => t.setContent(`**Extrait de code** :${snippet}`));

			const fix = finding.extra?.fix;
			if (fix) {
				container
					.addSeparatorComponents((s) => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
					.addTextDisplayComponents((t) => t.setContent(`**✅ Correction suggérée** :\n\`\`\`\n${fix.slice(0, 500)}\n\`\`\``));
			}

			return { container, flags: MessageFlags.IsComponentsV2 };
		},*/
	createFindingDetailEmbed(finding, repoUrl) {
		const severity = (finding.extra?.severity || 'WARNING').toUpperCase();
		const filePath = finding.path.replace(/^\/repo\//, '');
		const line = finding.start?.line ?? null;
		const fileUrl = repoUrl ? buildFileUrl(repoUrl, filePath, line) : null;
		const fileValue = fileUrl ? `[${filePath}:${line ?? '?'}](${fileUrl})` : `${filePath}:${line ?? '?'}`;

		const message = finding.extra?.message || finding.check_id;
		const cweList = finding.extra?.metadata?.cwe ? [].concat(finding.extra.metadata.cwe) : [];
		const owaspList = finding.extra?.metadata?.owasp ? [].concat(finding.extra.metadata.owasp) : [];
		const references = finding.extra?.metadata?.references || [];
		const likelihood = finding.extra?.metadata?.likelihood;
		const impact = finding.extra?.metadata?.impact;
		const confidence = finding.extra?.metadata?.confidence;
		const fix = finding.extra?.fix;
		const shortlink = finding.extra?.metadata?.shortlink;

		// Ligne 1 : header
		const container = new ContainerBuilder()
			.setAccentColor(SEVERITY_COLORS[severity] ?? colors.log)
			.addTextDisplayComponents(t =>
				t.setContent(`## ${SEVERITY_EMOJIS[severity] ?? '⚠️'} ${finding.check_id.split('.').pop()}`),
			)
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));

		// Localisation + sévérité
		container.addTextDisplayComponents(t => t.setContent([
			`📁 **Fichier** : ${fileValue}`,
			`⚠️ **Sévérité** : ${severity}`,
			`🏷️ **Règle** : \`${finding.check_id}\``,
		].join('\n')));

		// Risque : likelihood / impact / confidence
		if (likelihood || impact || confidence) {
			const riskEmojis = { HIGH: '🔴', MEDIUM: '🟠', LOW: '🟡' };
			container
				.addSeparatorComponents(s => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t => t.setContent([
					likelihood ? `📈 **Probabilité** : ${riskEmojis[likelihood] ?? ''} ${likelihood}` : null,
					impact ? `💥 **Impact**      : ${riskEmojis[impact] ?? ''} ${impact}` : null,
					confidence ? `🎯 **Confiance**   : ${riskEmojis[confidence] ?? ''} ${confidence}` : null,
				].filter(Boolean).join('\n')));
		}

		// Description du problème (message tronqué proprement)
		container
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(t => t.setContent(`### 📋 Description\n${message.slice(0, 1000)}`));

		// Correction suggérée
		if (fix) {
			container
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t =>
					t.setContent(`### ✅ Correction suggérée\n\`\`\`\n${fix.slice(0, 500)}\n\`\`\``),
				);
		}

		// CWE / OWASP
		if (cweList.length || owaspList.length) {
			container
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t => t.setContent([
					cweList.length ? `🔗 **CWE** : ${cweList.join(', ')}` : null,
					owaspList.length ? `🛡️ **OWASP** : ${owaspList.join(', ')}` : null,
				].filter(Boolean).join('\n')));
		}

		// Bouton vers la règle Semgrep
		if (shortlink || references.length) {
			const buttons = new ActionRowBuilder();
			if (shortlink) {
				buttons.addComponents(
					new ButtonBuilder()
						.setLabel('📖 Voir la règle')
						.setStyle(ButtonStyle.Link)
						.setURL(shortlink),
				);
			}
			if (references[0]) {
				buttons.addComponents(
					new ButtonBuilder()
						.setLabel('📚 Documentation')
						.setStyle(ButtonStyle.Link)
						.setURL(references[0]),
				);
			}
			container
				.addSeparatorComponents(s => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
				.addActionRowComponents(buttons);
		}

		return { container, flags: MessageFlags.IsComponentsV2 };
	},
};