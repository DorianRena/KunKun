const {
	SlashCommandBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	LabelBuilder,
} = require('discord.js');
const { validateRepoUrl, validateBranch } = require('../../utility/git/valid-url');
const { gitClone } = require('../../utility/docker/git-clone');
const { repoUrlToProjectKey } = require('../../utility/git/repo-utils');
const sonar = require('../../utility/sonar/analyse');
const semgrep = require('../../utility/semgrep/analyse');

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
			.setMaxValues(2)
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

		const runSonar = analyses.includes('sonar');
		const runSemgrep = analyses.includes('semgrep');
		// Validations
		const urlValidation = validateRepoUrl(repoUrl);
		if (!urlValidation.isValid) {
			return await interaction.reply({ content: `Erreur : ${urlValidation.error}`, ephemeral: true });
		}
		const branchValidation = validateBranch(branch);
		if (!branchValidation.isValid) {
			return await interaction.reply({ content: `Erreur : ${branchValidation.error}`, ephemeral: true });
		}

		await interaction.deferReply();

		try {
			await interaction.editReply('Clonage du repo en cours...');
			const volumeId = await gitClone(repoUrl, branch);
			await interaction.editReply('Repo cloné avec succès !');

			const projectKey = repoUrlToProjectKey(repoUrl, branch);

			if (runSonar) await sonar.analyse(interaction, volumeId, projectKey, repoUrl);
			if (runSemgrep) await semgrep.analyse(interaction, volumeId, repoUrl);
		}
		catch (err) {
			console.error(err);
			await interaction.editReply(`Erreur lors de l'analyse : \`${err.message}\``);
		}
	},
};