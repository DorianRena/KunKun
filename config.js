/**
 * Configuration centralisée pour KunKun bot
 * Regroupe toutes les variables d'environnement avec leurs valeurs par défaut
 */

const COLORS = {
	severity: {
		BLOCKER: 0xFF0000,
		CRITICAL: 0xFF4500,
		MAJOR: 0xFFA500,
		MINOR: 0xFFD700,
		INFO: 0x3b6885,
	},
	error: 0xFF0000,
	info: 0x3b6885,
	log: 0x858585,
	warning: 0xFFA500,
	good: 0x00FF00,
};

COLORS.ruleTabs = {
	root_cause: COLORS.info,
	how_to_fix: COLORS.good,
};

const config = {
	discord: {
		token: process.env.DISCORD_TOKEN,
	},
	sonar: {
		scanner: {
			token: process.env.SONAR_TOKEN,
		},
	},
	docker: {
		stopContainersOnShutdown: process.env.DOCKER_STOP_CONTAINERS_ON_SHUTDOWN !== 'false',
	},
	github: {
		token: process.env.GITHUB_TOKEN,
	},
	gitlab: {
		token: process.env.GITLAB_TOKEN,
	},
	colors: COLORS,
};

function validate() {
	const required = [
		['DISCORD_TOKEN', config.discord.token],
	];

	const missing = required.filter(([, value]) => !value).map(([name]) => name);
	if (missing.length) {
		throw new Error(`Missing required env vars: ${missing.join(', ')}`);
	}

	if (!config.sonar.scanner.token) {
		console.warn('[Config] Warning: SONAR_TOKEN is missing. SonarQube analysis will be unavailable');
	}

	if (!config.github.token && !config.gitlab.token) {
		console.warn('[Config] Warning: Neither GITHUB_TOKEN nor GITLAB_TOKEN is set. Pipeline analysis will be unavailable.');
	}
}

config.validate = validate;

module.exports = config;