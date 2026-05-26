const sonarApi = require('./sonar-api');
const { createRuleEmbed } = require('./interactive-report');

const utils = {
	async showRule(ruleKey, interaction, tab = 'root_cause') {
		try {
			const rule = await sonarApi.fetchRule(ruleKey);
			if (!rule) {
				await interaction.editReply({ content: '❌ Règle introuvable', embeds: [], components: [] });
				return;
			}
			const { embed, row } = createRuleEmbed(rule, tab);
			await interaction.editReply({ embeds: [embed], components: [row] });
		}
		catch (err) {
			console.error('[Sonar] Rule tab error:', err.message);
			await interaction.editReply({ content: `❌ Erreur: ${err.message}`, embeds: [], components: [] });
		}
	},
};

module.exports = utils;