const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
} = require('discord.js');

module.exports = {
	/**
	 * Create an interactive Sonar report with buttons to view issues by type.
	 * @param {object} metrics - SonarQube component metrics
	 * @param {string} projectKey - SonarQube project key
	 * @param {string} repoUrl - GitHub repository URL
	 * @returns {object} { embed, actionRow } for Discord message
	 */
	createInteractiveReport(metrics, projectKey, repoUrl) {
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
			.setTitle(`📊 Rapport SonarQube — ${projectKey}`)
			.setDescription('Analyse du dépôt GitHub')
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
					.setCustomId(`sonar_bugs:${projectKey}`)
					.setLabel(`🐛 Bugs (${bugs})`)
					.setStyle(ButtonStyle.Primary)
					.setDisabled(bugs === 0),
				new ButtonBuilder()
					.setCustomId(`sonar_vulnerabilities:${projectKey}`)
					.setLabel(`🔒 Vulnérabilités (${vulnerabilities})`)
					.setStyle(ButtonStyle.Danger)
					.setDisabled(vulnerabilities === 0),
				new ButtonBuilder()
					.setCustomId(`sonar_code_smells:${projectKey}`)
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
			const description = `${issue.component}:${issue.line}`.slice(0, 100);
			return new StringSelectMenuOptionBuilder()
				.setLabel(label)
				.setDescription(description)
				.setValue(`sonar_issue_${type}_${idx}`);
		});

		const selectMenu = new StringSelectMenuBuilder()
			.setCustomId(`sonar_select_${type}:${projectKey}`)
			.setPlaceholder(`Sélectionnez un ${type === 'bugs' ? 'bug' : type}`)
			.addOptions(options);

		return new ActionRowBuilder().addComponents(selectMenu);
	},

	/**
	 * Create a detailed embed for a single issue.
	 * @param {object} issue - SonarQube issue
	 * @returns {EmbedBuilder}
	 */
	createIssueDetailEmbed(issue) {
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

		const embed = new EmbedBuilder()
			.setColor(severityColors[issue.severity] || 0x808080)
			.setTitle(`${severityEmojis[issue.severity]} ${issue.message}`)
			.addFields(
				{ name: '📁 Fichier', value: issue.component, inline: false },
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

		return embed;
	},
};