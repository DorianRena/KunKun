// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const path = require('node:path');
const fs = require('fs');
const config = require('./config');
const { setup, teardown } = require('./utility/docker/utility');
const { handleModal } = require('./commands/git/modal');
const sonarApi = require('./utility/sonar/sonar-api');
const { createIssuesSelectMenu, createIssueDetailEmbed } = require('./utility/sonar/interactive-report');

// Validate required configuration at startup
try {
	config.validate();
}
catch (err) {
	console.error('[Config] Configuration validation failed:', err.message);
	process.exit(1);
}

const token = config.discord.token;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// When the client is ready, run this code (only once).
// The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// It makes some properties non-nullable.
client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);
for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Set a new item in the Collection with the key as the command name and the value as the exported module
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		}
		else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.on(Events.InteractionCreate, async (interaction) => {
	if (interaction.isCommand()) {
		if (!interaction.isChatInputCommand()) return;
		const command = interaction.client.commands.get(interaction.commandName);
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}
		try {
			await command.execute(interaction);
		}
		catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: 'There was an error while executing this command!',
					flags: MessageFlags.Ephemeral,
				});
			}
			else {
				await interaction.reply({
					content: 'There was an error while executing this command!',
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	}
	if (interaction.isModalSubmit() && interaction.customId === 'analyse-modal') {
		await handleModal(interaction);
	}

	// Sonar button handlers (bugs, vulnerabilities, code smells)
	if (interaction.isButton() && interaction.customId.startsWith('sonar_')) {
		const [action, ...rest] = interaction.customId.split(':');
		const projectKey = rest.join(':');
		const issueType = action.replace('sonar_', '');
		const typeMap = {
			bugs: 'BUG',
			vulnerabilities: 'VULNERABILITY',
			code_smells: 'CODE_SMELL',
		};
		const sonarType = typeMap[issueType];

		if (!sonarType) return;

		await interaction.deferReply({ ephemeral: true });

		try {
			if (!projectKey) {
				await interaction.editReply('❌ Impossible de récupérer la clé du projet');
				return;
			}

			// Fetch issues
			const issues = await sonarApi.fetchIssues(projectKey, sonarType);

			if (issues.length === 0) {
				await interaction.editReply(`✅ Aucun ${issueType} détecté !`);
				return;
			}

			// Create select menu
			const selectMenu = createIssuesSelectMenu(issues, issueType, projectKey);
			await interaction.editReply({
				content: `📋 Sélectionnez une issue parmi les ${issues.length} ${issueType}`,
				components: [selectMenu],
			});

			// Store issues in interaction data for later selection
			interaction.client.sonarIssueCache = interaction.client.sonarIssueCache || {};
			interaction.client.sonarIssueCache[`${projectKey}_${issueType}`] = issues;
		}
		catch (err) {
			console.error(`[Sonar] Button error for ${issueType}:`, err.message);
			await interaction.editReply(`❌ Erreur: ${err.message}`);
		}
	}

	// Sonar select menu handlers
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('sonar_select_')) {
		const [action, ...rest] = interaction.customId.split(':');
		const projectKey = rest.join(':');
		const issueType = action.replace('sonar_select_', '');
		const selectedValue = interaction.values[0];
		const issueIndex = parseInt(selectedValue.split('_').pop(), 10);

		await interaction.deferReply({ ephemeral: true });

		try {
			if (!projectKey) {
				await interaction.editReply('❌ Impossible de récupérer la clé du projet');
				return;
			}

			// Get issues from cache
			const issues = interaction.client.sonarIssueCache?.[`${projectKey}_${issueType}`];

			if (!issues || !issues[issueIndex]) {
				await interaction.editReply('❌ Issue non trouvée');
				return;
			}

			const issue = issues[issueIndex];
			const detailEmbed = createIssueDetailEmbed(issue);

			await interaction.editReply({ embeds: [detailEmbed], components: [] });
		}
		catch (err) {
			console.log(err);
			console.error('[Sonar] Select menu error:', err.message);
			await interaction.editReply(`❌ Erreur: ${err.message}`);
		}
	}
});

// Log in to Discord with your client's token
// Start SonarQube server container (if configured)
(async () => {
	console.log('[Setup][KunKun] Starting the bot ...');
	try {
		console.log('[Setup][Docker] Starting the serveur ...');
		await setup();
		console.log('[Setup][Docker] Server container ready: http://localhost:9000');
	}
	catch (err) {
		console.error('[Sonar][Server] Failed to ensure Sonar server:', err.message || err);
		// continue without blocking the bot
	}
	// Log in to Discord with your client's token
	await client.login(token);
})();

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
	console.log(`\n[Shutdown][KunKun] Received ${signal}, shutting down gracefully...`);
	try {
		console.log('[Shutdown][KunKun] Logging out from Discord...');
		await client.destroy();
		console.log('[Shutdown][KunKun] Discord client destroyed');

		if (config.docker.stopContainersOnShutdown) {
			console.log('[Shutdown][KunKun] Tearing down Docker infrastructure (DOCKER_STOP_CONTAINERS_ON_SHUTDOWN=true)...');
			await teardown();
			console.log('[Shutdown][KunKun] Docker infrastructure cleaned up');
		}
		else {
			console.log('[Shutdown][KunKun] Skipping Docker teardown (DOCKER_STOP_CONTAINERS_ON_SHUTDOWN=false)');
		}

		console.log('[Shutdown][KunKun] Goodbye!');
		process.exit(0);
	}
	catch (err) {
		console.error('[Shutdown][KunKun] Error during shutdown:', err.message);
		process.exit(1);
	}
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

