const { SlashCommandBuilder } = require('discord.js');
const { gitClone } = require('../../utility/docker/git-clone');
const { sonarAnalyze } = require('../../utility/docker/sonar-analyze');
const { semgrepAnalyze } = require('../../utility/docker/semgrep-analyze');
const { repoUrlToProjectKey } = require('../../utility/git/repo-utils');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('analyse')
		.setDescription('Analyse GitHub repositories!')
		.addStringOption((option) => option.setName('url').setDescription('The GitHub repository URL to analyse.').setRequired(true))
		.addStringOption((option) => option.setName('branch').setDescription('Optional branch to analyse (e.g. main)')),
	async execute(interaction) {
		const repoUrl = interaction.options.getString('url');
		const branch = interaction.options.getString('branch');
		const githubRegex = /^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/;
		if (!/^[\w\-./]+$/.test(branch)) {
			throw new Error('Nom de branche invalide');
		}

		if (!githubRegex.test(repoUrl.replace(/.git$/, ''))) {
			return await interaction.reply({ content: 'URL GitHub invalide. Merci de fournir un lien HTTPS public valide', ephemeral: true });
		}
		await interaction.deferReply();

		try {
			await interaction.editReply('Clonage du repo en cours...');
			const volumeId = await gitClone(repoUrl, branch);
			await interaction.editReply('Repo cloné avec succès !');

			// Génération d'une projectKey à partir de l'URL du repo pour conserver l'historique Sonar
			const projectKey = repoUrlToProjectKey(repoUrl, branch);
			await interaction.editReply('Analyse Sonar en cours...');
			await sonarAnalyze(volumeId, { projectKey, projectName: projectKey });
			await interaction.editReply('Analyse Sonar terminée !');

			await interaction.editReply('Analyse Semgrep en cours...');
			await semgrepAnalyze(volumeId, { config: 'p/owasp-top-ten' });
			await interaction.editReply('Analyse Semgrep terminée !');

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