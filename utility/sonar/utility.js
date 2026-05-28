const sonarApi = require('./sonar-api');
const { showRule } = require('./interactive-report');

const utils = {
	async showRule(ruleKey, interaction, tab = 'root_cause') {
		try {
			const rule = await sonarApi.fetchRule(ruleKey);
			if (!rule) {
				await interaction.editReply({ content: '❌ Règle introuvable', embeds: [], components: [] });
				return;
			}
			const { container, flags } = showRule(rule, tab);
			await interaction.editReply({ components: [container], flags: flags });
		}
		catch (err) {
			console.error('[Sonar] Rule tab error:', err.message);
			await interaction.editReply({ content: `❌ Erreur: ${err.message}`, embeds: [], components: [] });
		}
	},
};

module.exports = utils;