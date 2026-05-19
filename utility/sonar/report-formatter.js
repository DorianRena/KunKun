const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
	/**
	 * Format SonarQube metrics into a Discord Embed.
	 * @param {object} metrics - Metrics object from Sonar API (component with measures array)
	 * @param {string} projectKey - SonarQube project key
	 * @param {string} repoUrl - Original repository URL
	 * @returns {EmbedBuilder} Discord Embed
	 */
	formatSonarReport(metrics, projectKey, repoUrl) {
		// Extract metric values from the measures array
		const getMeasure = (key) => {
			if (!metrics.measures) return null;
			const measure = metrics.measures.find((m) => m.metric === key);
			return measure ? (measure.value || measure.periods?.[0]?.value || null) : null;
		};

		const bugs = getMeasure('bugs') || 0;
		const vulnerabilities = getMeasure('vulnerabilities') || 0;
		const codeSmells = getMeasure('code_smells') || 0;
		const coverage = getMeasure('coverage') || null;
		const duplications = getMeasure('duplicated_lines_density') || null;
		const alertStatus = getMeasure('alert_status') || 'NONE';
		const qualityGate = alertStatus === 'OK' || alertStatus === 'PASSED' ? '🟢 PASSED' : '🔴 FAILED';

		// Create Embed
		return new EmbedBuilder()
			.setTitle('📊 SonarQube Report')
			.setDescription(`Analysis of repository: ${repoUrl}`)
			.setColor(alertStatus === 'OK' || alertStatus === 'PASSED' ? 0x00aa00 : 0xdd0000)
			.addFields(
				{ name: '🎯 Quality Gate', value: qualityGate, inline: true },
				{ name: '🐛 Bugs', value: String(bugs), inline: true },
				{ name: '🔒 Vulnerabilities', value: String(vulnerabilities), inline: true },
				{ name: '💧 Code Smells', value: String(codeSmells), inline: true },
				{
					name: '📊 Coverage',
					value: coverage !== null ? `${parseFloat(coverage).toFixed(1)}%` : 'N/A',
					inline: true,
				},
				{
					name: '⚖️ Duplications',
					value: duplications !== null ? `${parseFloat(duplications).toFixed(1)}%` : 'N/A',
					inline: true,
				},
			)
			.setFooter({ text: 'Analyzed by KunKun Bot' })
			.setTimestamp();
	},
};

