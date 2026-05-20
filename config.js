/**
 * Configuration centralisée pour KunKun bot
 * Regroupe toutes les variables d'environnement avec leurs valeurs par défaut
 */

module.exports = {
	// Discord Configuration
	discord: {
		token: process.env.DISCORD_TOKEN,
	},

	// SonarQube Server Configuration
	sonar: {
		scanner: {
			// Host URL for the scanner (inside Docker, use container name by default)
			hostUrl: process.env.SONAR_HOST_URL,
			// Authentication token for Sonar analysis
			token: process.env.SONAR_TOKEN,
		},
	},
	/**
	 * Validate required configuration
	 * @throws {Error} If required env vars are missing
	 */
	validate() {
		if (!this.discord.token) {
			throw new Error('Missing required env var: DISCORD_TOKEN');
		}
		if (!this.sonar.scanner.token) {
			throw new Error('Missing required env var: SONAR_TOKEN');
		}
	},
	github: {
		token: process.env.GITHUB_TOKEN || null,
	},
};