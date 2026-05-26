const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} = require('discord.js');
const TurndownService = require('turndown');

const turndownService = new TurndownService();
turndownService.addRule('code', {
	filter: 'pre',
	replacement: (content, node) => `\`\`\`\n${node.textContent}\n\`\`\``,
});

const tabColors = {
	root_cause: 0x4A90D9,
	how_to_fix: 0x2ECC71,
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
	 * @param {string} repoUrl - GitHub repository URL
	 * @param branch
	 * @returns {object} { embed, actionRow } for Discord message
	 */
	createInteractiveReport(metrics, projectKey, repoUrl, branch = null) {
		repoUrl = repoUrl.replace(/\.git$/, '');
		repoUrl = `${repoUrl}/tree/${branch ?? 'HEAD'}`;

		const bugs = parseInt(
			metrics.measures?.find((m) => m.metric === 'bugs')?.value || 0,
			10,
		);
		const vulnerabilities = parseInt(
			metrics.measures?.find((m) => m.metric === 'vulnerabilities')?.value || 0,
			10,
		);
		const codeSmells = parseInt(
			metrics.measures?.find((m) => m.metric === 'code_smells')?.value || 0,
			10,
		);
		const coverage = metrics.measures?.find((m) => m.metric === 'coverage')?.value || 'N/A';
		const duplications = metrics.measures?.find((m) => m.metric === 'duplicated_lines_density')?.value || 'N/A';
		const status = metrics.measures?.find((m) => m.metric === 'alert_status')?.value || 'NONE';

		const statusEmoji = status === 'OK' ? '🟢' : status === 'WARN' ? '🟡' : '🔴';

		const embed = new EmbedBuilder()
			.setColor(status === 'OK' ? 0x228B22 : status === 'WARN' ? 0xFFA500 : 0xFF6347)
			.setTitle('📊 Rapport SonarQube')
			.setURL(repoUrl)
			.setDescription(`Analyse du dépôt GitHub : ${repoUrl}\nBranche : ${branch ? branch : 'par défaut'}`)
			.addFields(
				{ name: `${statusEmoji} Qualité`, value: status, inline: true },
				{ name: '🐛 Bugs', value: `${bugs}`, inline: true },
				{ name: '🔒 Vulnérabilités', value: `${vulnerabilities}`, inline: true },
				{ name: '💧 Code Smells', value: `${codeSmells}`, inline: true },
				{ name: '📊 Couverture', value: `${coverage}%`, inline: true },
				{ name: '⚖️ Duplications', value: `${duplications}%`, inline: true },
			)
			.setFooter({ text: 'Cliquez sur les boutons pour voir les détails' })
			.setTimestamp();

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId(`sonar:bugs:${projectKey}`)
					.setLabel(`🐛 Bugs (${bugs})`)
					.setStyle(ButtonStyle.Primary)
					.setDisabled(bugs === 0),
				new ButtonBuilder()
					.setCustomId(`sonar:vulnerabilities:${projectKey}`)
					.setLabel(`🔒 Vulnérabilités (${vulnerabilities})`)
					.setStyle(ButtonStyle.Danger)
					.setDisabled(vulnerabilities === 0),
				new ButtonBuilder()
					.setCustomId(`sonar:code_smells:${projectKey}`)
					.setLabel(`💧 Code Smells (${codeSmells})`)
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(codeSmells === 0),
			);

		return { embed, actionRow: row, metrics };
	},

	/**
	 * Create a select menu for an array of issues.
	 * @param {Array} issues - Array of SonarQube issues
	 * @param {string} type - Issue type code (bugs, vulnerabilities, codeSmells)
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

	createIssueDetailEmbed(issue, repoUrl) {
		const severityColors = {
			BLOCKER: 0xFF0000,
			CRITICAL: 0xFF4500,
			MAJOR: 0xFFA500,
			MINOR: 0xFFD700,
			INFO: 0x87CEEB,
		};

		const severityEmojis = {
			BLOCKER: '🔴',
			CRITICAL: '🟠',
			MAJOR: '🟡',
			MINOR: '🔵',
			INFO: 'ℹ️',
		};

		const fileUrl = repoUrl ? buildFileUrl(repoUrl, issue.component, issue.line) : null;
		const fileValue = fileUrl
			? `[${issue.component?.split(':').at(-1)}:${issue.line}](${fileUrl})`
			: issue.component;

		const embed = new EmbedBuilder()
			.setColor(severityColors[issue.severity] || 0x808080)
			.setTitle(`${severityEmojis[issue.severity]} ${issue.message}`)
			.addFields(
				{ name: '📁 Fichier', value: fileValue, inline: false },
				{ name: '📍 Ligne', value: `${issue.line}`, inline: true },
				{ name: '⚠️ Sévérité', value: issue.severity, inline: true },
				{ name: '🏷️ Type', value: issue.type, inline: true },
			)
			.setFooter({ text: `Issue: ${issue.key}` })
			.setTimestamp();

		if (issue.textRange) {
			embed.addFields({
				name: '📝 Contexte',
				value: `Début: ligne ${issue.textRange.startLine}${issue.textRange.startOffset ? ` (offset ${issue.textRange.startOffset})` : ''}`,
				inline: false,
			});
		}

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`sonar_rule:${issue.rule}`)
				.setLabel('📖 Voir la règle')
				.setStyle(ButtonStyle.Secondary),
		);

		return { embed, row };
	},

	createRuleEmbed(rule, tab = 'root_cause') {
		const sectionKeyMap = {
			root_cause: 'root_cause',
			how_to_fix: 'how_to_fix',
		};

		const sectionKey = sectionKeyMap[tab] || 'root_cause';

		const rawContent = rule.descriptionSections.find(s => s.key === sectionKey)?.content
			?? rule.descriptionSections[0]?.content
			?? '';

		const description = rawContent
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 4096) || 'Pas de description disponible';

		const tabLabels = {
			root_cause: '❓ Pourquoi c\'est un problème',
			how_to_fix: '🔧 Comment le corriger',
		};

		const row = new ActionRowBuilder().addComponents(
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

		const title = `📖 ${rule.name} (${rule.key})\n\n${tabLabels[tab]}`;
		const embed = new EmbedBuilder()
			.setColor(tabColors[tab] ?? 0x4A90D9)
			.setTitle(title.slice(0, 256))
			.setDescription(description)
			.addFields(
				{ name: '🏷️ Nom', value: rule.name || 'N/A', inline: false },
				{ name: '⚠️ Sévérité', value: rule.severity || 'N/A', inline: true },
				{ name: '🏷️ Type', value: rule.type || 'N/A', inline: true },
			)
			.setFooter({ text: 'SonarQube Rule' })
			.setTimestamp();

		return { embed, row };
	},
};