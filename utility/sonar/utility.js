const sonarApi = require('./sonar-api');
const { showRule } = require('./interactive-report');
const { MessageFlags } = require('discord.js');

const utils = {
	async showRule(ruleKey, interaction, tab = 'root_cause') {
		try {
			const rule = await sonarApi.fetchRule(ruleKey);
			if (!rule) {
				await interaction.editReply({ content: '❌ Règle introuvable', embeds: [], components: [] });
				return;
			}
			const container = showRule(rule, tab);
			await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
		}
		catch (err) {
			console.error('[Sonar] Rule tab error:', err.message);
			await interaction.editReply({ content: `❌ Erreur: ${err.message}`, embeds: [], components: [] });
		}
	},
};

module.exports = utils;