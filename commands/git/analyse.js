const { SlashCommandBuilder } = require('discord.js');
const { gitClone } = require('../../utility/docker/git-clone');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('analyse')
		.setDescription('Analyse GitHub repositories!')
		.addStringOption((option) => option.setName('url').setDescription('The GitHub repository URL to analyse.').setRequired(true)),
	async execute(interaction) {
		const repoUrl = interaction.options.getString('url');
		const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/;

		if (!githubRegex.test(repoUrl.replace(/.git$/, ''))) {
			return await interaction.reply({ content: 'URL GitHub invalide. Merci de fournir un lien HTTPS public valide', ephemeral: true });
		}
		await interaction.deferReply();

		try {
			await interaction.editReply('Clonage du repo en cours...');
			const volumeId = await gitClone(repoUrl);
			await interaction.editReply('Repo cloné avec succès !');

			/*
               Exemple de ce que tu pourras faire à la prochaine étape dans ton code :

               await runCommand('docker', [
                   'run', '--rm',
                   '-v', `${uniqueId}:/src`,
                   'ton-image-analyse',
                   'commande-analyse', '/src'
               ]);
            */

		}
		catch (err) {
			console.error(err);
			await interaction.editReply(`Erreur lors du clonage dans le conteneur : \`${err.message}\``);
		}
	},
};