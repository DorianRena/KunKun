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
const { createIssuesSelectMenu, showIssueDetail } = require('./utility/sonar/interactive-report');
const { getAndShowRule } = require('./utility/sonar/utility');
const semgrepReport = require('./utility/semgrep/interactive-report');
const trufflehogReport = require('./utility/trufflehog/interactive-report');
const pipelineReport = require('./utility/pipeline/interactive-report');

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

	// SONAR
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
		interaction.client.projectCache[projectKey].sonar[type] = issues;
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

			const issue = interaction.client.projectCache[projectKey]?.sonar?.[issueType]?.[issueIndex];

			if (!issue) {
				await interaction.editReply({
					components: [new TextDisplayBuilder().setContent('❌ Issue non trouvée')],
					flags: MessageFlags.IsComponentsV2,
				});
				return;
			}

			const repoUrl = interaction.client.projectCache[projectKey].withBranch;
			const container = showIssueDetail(issue, repoUrl);
			await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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
	// Sonar show rule detail
	if (interaction.isButton() && interaction.customId.startsWith('sonar_rule:')) {
		const ruleKey = interaction.customId.split('sonar_rule:')[1];
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await getAndShowRule(ruleKey, interaction);
	}
	// Tab switcher sur la règle (Pourquoi / Comment corriger)
	if (interaction.isButton() && interaction.customId.startsWith('sonar_rule_tab:')) {
		const [, tab, ...rest] = interaction.customId.split(':');
		const ruleKey = rest.join(':');

		await interaction.deferUpdate();
		await getAndShowRule(ruleKey, interaction, tab);
	}

	// SEMGREP
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('semgrep_severity:')) {
		const projectKey = interaction.customId.replace('semgrep_severity:', '');
		const severity = interaction.values[0];

		await interaction.deferReply({
			flags: MessageFlags.Ephemeral,
		});

		const results = interaction.client.projectCache[projectKey]?.semgrep?.results;

		if (!results) {
			return interaction.editReply({
				content: '❌ Résultats expirés, relancez l’analyse.',
			});
		}
		const issues = results.filter((r) => (r.extra?.severity || 'WARNING').toUpperCase() === severity);
		interaction.client.projectCache[projectKey].semgrep[severity] = issues;
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
		const finding = interaction.client.projectCache[projectKey]?.semgrep?.[severity]?.[idx];
		if (!finding) return interaction.editReply('❌ Résultat introuvable.');
		const repoUrl = interaction.client.projectCache[projectKey].withBranch;
		const container = semgrepReport.showFindingDetail(finding, repoUrl);
		await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
	}

	// TRUFFLEHOG
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('trufflehog_detector:')) {
		const projectKey = interaction.customId.replace('trufflehog_detector:', '');
		const detectorName = interaction.values[0];

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const cached = interaction.client.projectCache[projectKey].trufflehog;
		if (!cached) {
			return interaction.editReply({
				components: [new TextDisplayBuilder().setContent('❌ Résultats expirés, relancez l\'analyse.')],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const findings = cached.findings.filter(f => f.DetectorName === detectorName);
		interaction.client.projectCache[projectKey].trufflehog[detectorName] = findings;

		if (!findings.length) {
			return interaction.editReply({
				components: [new TextDisplayBuilder().setContent(`Aucun résultat pour ${detectorName}`)],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const selectRow = trufflehogReport.createFindingsSelectMenu(findings, detectorName, projectKey);
		await interaction.editReply({
			components: [
				new TextDisplayBuilder().setContent(`📋 ${findings.length} occurrence(s) — ${detectorName}`),
				selectRow,
			],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	// Select menu : choix d'une occurrence spécifique
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('trufflehog_select:')) {
		const [, detectorName, ...rest] = interaction.customId.split(':');
		const projectKey = rest.join(':');
		const idx = parseInt(interaction.values[0], 10);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const finding = interaction.client.projectCache[projectKey]?.trufflehog?.[detectorName]?.[idx];
		if (!finding) {
			return interaction.editReply({
				components: [new TextDisplayBuilder().setContent('❌ Résultat introuvable.')],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const repoUrl = interaction.client.projectCache[projectKey]?.withBranch;
		const container = trufflehogReport.showFindingDetail(finding, repoUrl);
		await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
	}

	// PIPELINE
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pipeline_secrettype:')) {
		const projectKey = interaction.customId.replace('pipeline_secrettype:', '');
		const secretType = interaction.values[0];

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const cached = interaction.client.projectCache[projectKey]?.pipeline;
		if (!cached) {
			return interaction.editReply({
				components: [new TextDisplayBuilder().setContent('❌ Résultats expirés, relancez l\'analyse.')],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const deduplicated = pipelineReport.deduplicateFindings(cached.findings);
		const findings = deduplicated.filter(f => f.secretType === secretType);
		interaction.client.projectCache[projectKey].pipeline[secretType] = findings;

		const selectRow = pipelineReport.createFindingsSelectMenu(findings, secretType, projectKey);
		await interaction.editReply({
			components: [
				new TextDisplayBuilder().setContent(`📋 ${findings.length} occurrence(s) — ${secretType}`),
				selectRow,
			],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	// Select menu : choix d'une occurrence
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pipeline_select:')) {
		const [, secretType, ...rest] = interaction.customId.split(':');
		const projectKey = rest.join(':');
		const idx = parseInt(interaction.values[0], 10);

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		const finding = interaction.client.projectCache[projectKey]?.pipeline?.[secretType]?.[idx];
		if (!finding) {
			return interaction.editReply({
				components: [new TextDisplayBuilder().setContent('❌ Résultat introuvable.')],
				flags: MessageFlags.IsComponentsV2,
			});
		}

		const container = pipelineReport.showFindingDetail(finding);
		await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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