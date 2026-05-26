const {
	SlashCommandBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	LabelBuilder,
} = require('discord.js');
const { analyse } = require('../../utility/analyse');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('modal')
		.setDescription('Analyse GitHub repositories!'),

	async execute(interaction) {
		const modal = new ModalBuilder()
			.setCustomId('analyse-modal')
			.setTitle('Lancer une analyse');

		const urlInput = new TextInputBuilder()
			.setCustomId('url')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('https://github.com/user/repo')
			.setRequired(true);
		const urlInputLabel = new LabelBuilder()
			.setLabel('git')
			.setDescription('URL du dépôt GitHub')
			.setTextInputComponent(urlInput);

		const branchInput = new TextInputBuilder()
			.setCustomId('branch')
			.setStyle(TextInputStyle.Short)
			.setPlaceholder('main')
			.setRequired(false);
		const branchInputLabel = new LabelBuilder()
			.setLabel('Branche du repo git à analysé (optionnel)')
			.setDescription('Branche')
			.setTextInputComponent(branchInput);

		const analysesSelect = new StringSelectMenuBuilder()
			.setCustomId('analyses')
			.setPlaceholder('Choisir les analyses')
			.setRequired(true)
			.setMinValues(1)
			.setMaxValues(4)
			.addOptions(
				new StringSelectMenuOptionBuilder()
					.setLabel('Sonar')
					.setDescription('Analyse de qualité de code')
					.setValue('sonar')
					.setDefault(true),
				new StringSelectMenuOptionBuilder()
					.setLabel('Semgrep')
					.setDescription('Analyse de sécurité OWASP')
					.setValue('semgrep')
					.setDefault(true),
				new StringSelectMenuOptionBuilder()
					.setLabel('Trufflehog')
					.setDescription('Analyse des secrets')
					.setValue('trufflehog')
					.setDefault(true),
				new StringSelectMenuOptionBuilder()
					.setLabel('Pipeline')
					.setDescription('Analyse des secrets dans les logs des pipelines')
					.setValue('pipeline')
					.setDefault(true),
			);

		const analysesLabel = new LabelBuilder()
			.setLabel('Analyses à lancer')
			.setStringSelectMenuComponent(analysesSelect);

		modal.addLabelComponents(
			urlInputLabel,
			branchInputLabel,
			analysesLabel,
		);

		await interaction.showModal(modal);
	},

	async handleModal(interaction) {
		const repoUrl = interaction.fields.getTextInputValue('url').trim();
		const branch = interaction.fields.getTextInputValue('branch').trim() || null;
		const analyses = interaction.fields.getField('analyses').values;

		const sonar = analyses.includes('sonar');
		const semgrep = analyses.includes('semgrep');
		const trufflehog = analyses.includes('trufflehog');
		const pipeline = analyses.includes('pipeline');
		// Validations
		await analyse(interaction, repoUrl, branch, { sonar, semgrep, trufflehog, pipeline });
	},
};