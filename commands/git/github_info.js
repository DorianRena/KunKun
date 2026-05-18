const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const https = require('https');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('github_info')
		.setDescription('Fetch information about a github repository')
		.addStringOption(option =>
			option
				.setName('repository')
				.setDescription('Repository in format: owner/repo')
				.setRequired(true),
		),
	async execute(interaction) {
		const repo = interaction.options.getString('repository');

		// Valider le format du repository
		if (!repo.includes('/')) {
			await interaction.reply({
				content: '❌ Format invalid! Utilisez: `owner/repo`',
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply();

		try {
			const data = await fetchGitHubRepo(repo);

			const embed = new EmbedBuilder()
				.setColor('#1f6feb')
				.setTitle(`📦 ${data.full_name}`)
				.setURL(data.html_url)
				.setDescription(data.description || 'Pas de description')
				.addFields(
					{ name: '⭐ Stars', value: `${data.stargazers_count}`, inline: true },
					{ name: '🔀 Forks', value: `${data.forks_count}`, inline: true },
					{ name: '👁️ Watchers', value: `${data.watchers_count}`, inline: true },
					{ name: '🔓 Public', value: data.private ? 'Non' : 'Oui', inline: true },
					{ name: '🍴 Language', value: data.language || 'Non spécifié', inline: true },
					{ name: '📝 License', value: data.license?.name || 'Aucune', inline: true },
				)
				.setFooter({ text: 'GitHub API' })
				.setTimestamp();

			await interaction.editReply({ embeds: [embed] });
		}
		catch (error) {
			await interaction.editReply({
				content: `❌ Erreur: ${error.message}`,
			});
		}
	},
};

function fetchGitHubRepo(repo) {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'api.github.com',
			path: `/repos/${repo}`,
			method: 'GET',
			headers: {
				'User-Agent': 'KunKun Bot',
			},
		};

		https.request(options, (res) => {
			let data = '';

			res.on('data', (chunk) => {
				data += chunk;
			});

			res.on('end', () => {
				if (res.statusCode === 404) {
					reject(new Error('Repository non trouvé, ce repository est peut-être privé'));
				}
				else if (res.statusCode === 200) {
					try {
						resolve(JSON.parse(data));
					}
					catch (e) {
						console.log(e);
						reject(new Error('Erreur lors du parsing JSON'));
					}
				}
				else {
					reject(new Error(`Erreur API: ${res.statusCode}`));
				}
			});
		}).on('error', (error) => {
			reject(error);
		}).end();
	});
}
