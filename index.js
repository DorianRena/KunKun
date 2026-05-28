// Require the necessary discord.js classes
const {
	Client,
	Collection,
	Events,
	GatewayIntentBits,
	MessageFlags,
	TextDisplayBuilder,
} = require('discord.js');
const path = require('node:path');
const fs = require('node:fs');
const config = require('./config');
const { setup, teardown } = require('./utility/docker/utility');
const { handleModal } = require('./commands/git/modal');
const sonarApi = require('./utility/sonar/sonar-api');
const { createIssuesSelectMenu, createIssueDetailEmbed } = require('./utility/sonar/interactive-report');
const { showRule } = require('./utility/sonar/utility');
const semgrepReport = require('./utility/semgrep/interactive-report');

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

client.sonarIssueCache = {};
client.semgrepCache = {};
client.projectCache = {};

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

	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('sonar_issues:')) {
		const projectKey = interaction.customId.replace('sonar_issues:', '');
		const type = interaction.values[0];

		const typeMap = {
			bugs: 'BUG',
			vulnerabilities: 'VULNERABILITY',
			code_smells: 'CODE_SMELL',
		};

		const sonarType = typeMap[type];
		if (!sonarType) return;

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const issues = await sonarApi.fetchIssues(projectKey, sonarType);

		if (!issues.length) {
			return interaction.editReply({
				components: [
					new TextDisplayBuilder().setContent(`Aucun ${type} trouvé`),
				],
				flags: MessageFlags.IsComponentsV2,
			});
		}
		interaction.client.sonarIssueCache[projectKey][type] = issues;
		const selectMenu = createIssuesSelectMenu(issues, type, projectKey);

		return interaction.editReply({
			components: [
				new TextDisplayBuilder().setContent(
					`📋 ${issues.length} issues trouvées pour ${type}`,
				),
				selectMenu,
			],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	// Sonar select menu handlers
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('sonar_select:')) {
		const [, issueType, ...rest] = interaction.customId.split(':');
		const projectKey = rest.join(':');
		const selectedValue = interaction.values[0];
		const issueIndex = parseInt(selectedValue.split(':').pop(), 10);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			if (!projectKey) {
				await interaction.editReply({
					components: [new TextDisplayBuilder().setContent('❌ Impossible de récupérer la clé du projet')],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			const issue = interaction.client.sonarIssueCache?.[projectKey]?.[issueType]?.[issueIndex];

			if (!issue) {
				await interaction.editReply({
					components: [new TextDisplayBuilder().setContent('❌ Issue non trouvée')],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			const repoUrl = interaction.client.projectCache[projectKey].withBranch;
			const { container, flags } = createIssueDetailEmbed(issue, repoUrl);
			await interaction.editReply({ components: [container], flags });
		}
		catch (err) {
			console.error('[Sonar] Select menu error:', err.message);
			console.error(err);
			await interaction.editReply({
				components: [new TextDisplayBuilder().setContent(`❌ Erreur: ${err.message}`)],
				flags: MessageFlags.IsComponentsV2,
			});
		}
	}
	//
	if (interaction.isButton() && interaction.customId.startsWith('sonar_rule:')) {
		const ruleKey = interaction.customId.split('sonar_rule:')[1];
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await showRule(ruleKey, interaction);
	}
	// Tab switcher sur la règle (Pourquoi / Comment corriger)
	if (interaction.isButton() && interaction.customId.startsWith('sonar_rule_tab:')) {
		const [, tab, ...rest] = interaction.customId.split(':');
		const ruleKey = rest.join(':');

		await interaction.deferUpdate();
		await showRule(ruleKey, interaction, tab);
	}


	// Bouton de sévérité (ERROR / WARNING / INFO)
	// if (interaction.isButton() && interaction.customId.startsWith('semgrep:')) {
	// 	const severity = interaction.customId.split(':')[1];
	// 	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	// 	const cached = interaction.client.semgrepCache;
	// 	if (!cached) return interaction.editReply('❌ Résultats expirés, relancez l\'analyse.');
	// 	const { selectRow, filtered } = semgrepReport.createIssuesSelectMenu(cached.results, severity);
	// 	interaction.client.semgrepFilteredCache = { ...interaction.client.semgrepFilteredCache, [severity]: filtered };
	// 	await interaction.editReply({
	// 		content: `📋 ${filtered.length} résultat(s) — sélectionnez-en un`,
	// 		components: [selectRow],
	// 	});
	// }
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('semgrep_severity:')) {
		const projectKey = interaction.customId.replace('semgrep_severity:', '');
		const severity = interaction.values[0];

		await interaction.deferReply({
			flags: MessageFlags.Ephemeral,
		});

		const cached = interaction.client.semgrepCache[projectKey];

		if (!cached) {
			return interaction.editReply({
				content: '❌ Résultats expirés, relancez l’analyse.',
			});
		}
		const issues = cached.results.filter((r) => (r.extra?.severity || 'WARNING').toUpperCase() === severity);
		interaction.client.semgrepCache[projectKey][severity] = issues;
		if (!issues.length) {
			return interaction.editReply({
				components: [
					new TextDisplayBuilder().setContent(`Aucun(e) ${severity} trouvé`),
				],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const selectRow = semgrepReport.createIssuesSelectMenu(issues, severity, projectKey);
		await interaction.editReply({
			components: [
				new TextDisplayBuilder().setContent(
					`📋 ${issues.length} résultat(s) ${severity}`,
				),
				selectRow,
			],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	// Select menu
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('semgrep_select:')) {
		const [, severity, ...rest] = interaction.customId.split(':');
		const projectKey = rest.join(':');
		const idx = parseInt(interaction.values[0], 10);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const finding = interaction.client.semgrepCache[projectKey]?.[severity]?.[idx];
		if (!finding) return interaction.editReply('❌ Résultat introuvable.');
		const repoUrl = interaction.client.projectCache[projectKey].withBranch;
		const {
			container,
			flags,
		} = semgrepReport.createFindingDetailEmbed(finding, repoUrl);
		await interaction.editReply({ components: [container], flags });
	}
});

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
	}
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