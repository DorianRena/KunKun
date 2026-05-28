const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	ContainerBuilder,
	SeparatorSpacingSize,
	MessageFlags,
} = require('discord.js');
const TurndownService = require('turndown');
const { colors } = require('../../config');

const turndownService = new TurndownService();
turndownService.addRule('code', {
	filter: 'pre',
	replacement: (content, node) => `\`\`\`\n${node.textContent}\n\`\`\``,
});

const tabColors = {
	root_cause: colors.info,
	how_to_fix: colors.good,
};

function buildFileUrl(repoUrl, component, line) {
	const filePath = component.split(':').at(-1);
	const base = repoUrl.replace(/\/tree\//, '/blob/');
	return `${base}/${filePath}${line ? `#L${line}` : ''}`;
}

module.exports = {
	/**
	 * Create an interactive Sonar report with buttons to view issues by type.
	 * @param {object} metrics - SonarQube component metrics
	 * @param {string} projectKey - SonarQube project key
	 * @returns ContainerBuilder container
	 */
	createInteractiveReport(metrics, projectKey) {
		const files = metrics.measures?.find((m) => m.metric === 'files')?.value || 'N/A';
		const lines = metrics.measures?.find((m) => m.metric === 'lines')?.value || 'N/A';
		let linesDistribution = metrics.measures?.find((m) => m.metric === 'ncloc_language_distribution')?.value || '';
		linesDistribution = linesDistribution.split(';').map(line => line.split('='));

		const vulnerabilities = parseInt(metrics.measures?.find((m) => m.metric === 'vulnerabilities')?.value || 0, 10);
		const bugs = parseInt(metrics.measures?.find((m) => m.metric === 'bugs')?.value || 0, 10);
		const codeSmells = parseInt(metrics.measures?.find((m) => m.metric === 'code_smells')?.value || 0, 10);
		const coverage = metrics.measures?.find((m) => m.metric === 'coverage')?.value || 'N/A';
		const duplications = metrics.measures?.find((m) => m.metric === 'duplicated_lines_density')?.value || 'N/A';
		const status = metrics.measures?.find((m) => m.metric === 'alert_status')?.value || 'NONE';

		const statusEmoji = status === 'OK' ? '🟢' : status === 'WARN' ? '🟡' : '🔴';
		const accentColor = status === 'OK' ? colors.good : status === 'WARN' ? colors.warning : colors.error;

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(t => t.setContent('## 📊 Rapport SonarQube'),
				t => t.setContent(`${files} fichier(s) analysé(s)`),
				t => t.setContent(`${lines} ligne(s) analysé(s)`))
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small));
		for (const language of linesDistribution) {
			const percentLine = Math.floor(language[1] / lines * 100);
			container.addTextDisplayComponents(t => t.setContent(`${language[0]}: ${language[1]} ligne(s), ${percentLine}% des lignes`));
		}
		container
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(
				t => t.setContent(`### ${statusEmoji} Quality Gate : ${status}`),
			)
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(
				t => t.setContent(`🔒 **Vulnérabilités** : ${vulnerabilities}`),
				t => t.setContent(`🐛 **Bugs** : ${bugs}`),
				t => t.setContent(`💧 **Code Smells** : ${codeSmells}`),
			)
			.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(
				t => t.setContent(`📊 **Couverture** : ${coverage === 'N/A' ? 'N/A' : `${coverage}%`}`),
				t => t.setContent(`⚖️ **Duplications** : ${duplications === 'N/A' ? 'N/A' : `${duplications}%`}`),
			);

		if (vulnerabilities || bugs || codeSmells) {
			const issueSelect = new StringSelectMenuBuilder()
				.setCustomId(`sonar_issues:${projectKey}`)
				.setPlaceholder('📋 Choisir un type de problème')
				.addOptions(
					new StringSelectMenuOptionBuilder()
						.setLabel('Vulnérabilités')
						.setValue('vulnerabilities')
						.setEmoji('🔒'),
					new StringSelectMenuOptionBuilder()
						.setLabel('Bugs')
						.setValue('bugs')
						.setEmoji('🐛'),
					new StringSelectMenuOptionBuilder()
						.setLabel('Code Smells')
						.setValue('code_smells')
						.setEmoji('💧'),
				);
			const issueRow = new ActionRowBuilder().addComponents(issueSelect);
			container
				.addSeparatorComponents(s => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
				.addTextDisplayComponents(t => t.setContent('### 📌 Explorer les issues'))
				.addActionRowComponents(issueRow);
		}
		return container;
	},

	/**
	 * Create a select menu for an array of issues.
	 * @param {Array} issues - Array of SonarQube issues
	 * @param {string} type - Issue type code (bugs, vulnerabilities, code_smells)
	 * @param {string} projectKey
	 * @returns {ActionRowBuilder}
	 */
	createIssuesSelectMenu(issues, type, projectKey) {
		const options = issues.slice(0, 25).map((issue, idx) => {
			const label = `${issue.message.substring(0, 70)}`.slice(0, 70);
			const description = `${issue.component?.split(':').at(-1)}:${issue.line}`.slice(0, 100);
			return new StringSelectMenuOptionBuilder()
				.setLabel(label)
				.setDescription(description)
				.setValue(`sonar_issue:${type}:${idx}`);
		});

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`sonar_select:${type}:${projectKey}`)
			.setPlaceholder(`Sélectionnez un ${type === 'bugs' ? 'bug' : type}`)
			.addOptions(options);

		return new ActionRowBuilder().addComponents(selectMenu);
	},

	/**
	 * Create a Components V2 message for issue detail.
	 * @param {object} issue
	 * @param {string} repoUrl
	 * @returns {{ container: ContainerBuilder, flags: number }}
	 */
	createIssueDetailEmbed(issue, repoUrl) {
		const severityColors = colors.severity;
		const severityEmojis = {
			BLOCKER: '🔴',
			CRITICAL: '🟠',
			MAJOR: '🟡',
			MINOR: '🔵',
			INFO: 'ℹ️',
		};

		const fileUrl = buildFileUrl(repoUrl, issue.component, issue.line);
		const fileValue = fileUrl
			? `[${issue.component?.split(':').at(-1)}:${issue.line}](${fileUrl})`
			: `${issue.component}:${issue.line}`;

		const contextLine = issue.textRange
			? `\n📝 **Contexte** : Début ligne ${issue.textRange.startLine}${issue.textRange.startOffset ? ` (offset ${issue.textRange.startOffset})` : ''}`
			: '';

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`sonar_rule:${issue.rule}`)
				.setLabel('📖 Voir la règle')
				.setStyle(ButtonStyle.Secondary),
		);

		const container = new ContainerBuilder()
			.setAccentColor(severityColors[issue.severity] || colors.log)
			.addTextDisplayComponents(
				(t) => t.setContent(`## ${severityEmojis[issue.severity]} ${issue.message}`),
				(t) => t.setContent(
					[
						`📁 **Fichier** : ${fileValue}`,
						`📍 **Ligne** : ${issue.line}`,
						`⚠️ **Sévérité** : ${issue.severity}`,
						`🏷️ **Type** : ${issue.type}${contextLine}`,
					].join('\n'),
				),
				(t) => t.setContent(`*Issue : ${issue.key}*`),
			)
			.addSeparatorComponents((s) => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
			.addActionRowComponents((r) => r.setComponents(...row.components));

		return { container, row, flags: MessageFlags.IsComponentsV2 };
	},

	/**
	 * Create a Components V2 message for rule detail.
	 * @param {object} rule
	 * @param {string} tab - 'root_cause' | 'how_to_fix'
	 * @returns {{ container: ContainerBuilder, flags: number }}
	 */
	createRuleEmbed(rule, tab = 'root_cause') {
		const sectionKey = tab === 'how_to_fix' ? 'how_to_fix' : 'root_cause';

		const descriptionHTML = rule.descriptionSections.find(s => s.key === sectionKey)?.content ?? '';
		// Limite à 3800 pour laisser de la marge au reste du texte dans le container (max 4000)
		const description = turndownService.turndown(descriptionHTML).slice(0, 3800) || 'Pas de description disponible';

		const tabLabels = {
			root_cause: '❓ Pourquoi c\'est un problème',
			how_to_fix: '🔧 Comment le corriger',
		};

		const tabRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`sonar_rule_tab:root_cause:${rule.key}`)
				.setLabel('❓ Pourquoi')
				.setStyle(tab === 'root_cause' ? ButtonStyle.Primary : ButtonStyle.Secondary)
				.setDisabled(tab === 'root_cause'),
			new ButtonBuilder()
				.setCustomId(`sonar_rule_tab:how_to_fix:${rule.key}`)
				.setLabel('🔧 Comment corriger')
				.setStyle(tab === 'how_to_fix' ? ButtonStyle.Primary : ButtonStyle.Secondary)
				.setDisabled(tab === 'how_to_fix'),
		);

		const container = new ContainerBuilder()
			.setAccentColor(tabColors[tab] ?? 0x4A90D9)
			.addTextDisplayComponents(
				(t) => t.setContent(`## 📖 ${rule.name}\n*${rule.key}*`),
				(t) => t.setContent(
					[
						`🏷️ **Nom** : ${rule.name || 'N/A'}`,
						`⚠️ **Sévérité** : ${rule.severity || 'N/A'}`,
						`🏷️ **Type** : ${rule.type || 'N/A'}`,
					].join('\n'),
				),
			)
			.addSeparatorComponents((s) => s.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(
				(t) => t.setContent(`**${tabLabels[tab]}**`),
				(t) => t.setContent(description),
			)
			.addSeparatorComponents((s) => s.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
			.addActionRowComponents((r) => r.setComponents(...tabRow.components));

		return { container, row: tabRow, flags: MessageFlags.IsComponentsV2 };
	},
};