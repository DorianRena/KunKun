const { SlashCommandBuilder } = require('discord.js');
const { execFile } = require('child_process');

function runCommand(file, args) {
	return new Promise((resolve, reject) => {
		execFile(file, args, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr || stdout || error.message));
			}
			else {
				resolve(stdout.trim());
			}
		});
	});
}

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

		const uniqueId = `repo_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
		try {
			await interaction.editReply('Clonage du repo en cours...');
			await runCommand('docker', ['volume', 'create', uniqueId]);

			await interaction.editReply('Clonage du dépôt directement dans le conteneur...');
			await runCommand('docker', ['run', '--rm', '-v', `${uniqueId}:/repo`, 'alpine/git', 'clone', repoUrl, '/repo']);

			await interaction.editReply(`Repo cloné avec succès !\n\nLe code est isolé dans le volume Docker nommé : \`${uniqueId}\``);

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
			try {
				await runCommand('docker', ['volume', 'rm', uniqueId]);
			}
			catch (e) { console.error('Erreur lors de la suppression du volume : ', e.message); };
		}
	},
};