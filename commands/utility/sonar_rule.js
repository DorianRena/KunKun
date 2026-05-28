const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getAndShowRule } = require('../../utility/sonar/utility');

module.exports = {
	data: new SlashCommandBuilder().setName('sonar_rule').setDescription('Show sonar rule description')
		.addStringOption((option) => option.setName('rule_key').setDescription('The key of the sonar rule to show.').setRequired(true)),
	async execute(interaction) {
		const ruleKey = interaction.options.getString('rule_key');
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await getAndShowRule(ruleKey, interaction);
	},
};