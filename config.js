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
		server: {
			// Container name for the Sonar server
			containerName: getContainerName(),
			// Docker network name
			network: process.env.SONAR_DOCKER_NETWORK || 'kunkun-network',
			// Docker image to use
			image: process.env.SONAR_IMAGE || 'sonarqube:latest',
			// Whether to expose port 9000 on the host (for browser access)
			exposePort: process.env.SONAR_EXPOSE_PORT === 'true',
		},
		scanner: {
			// Host URL for the scanner (inside Docker, use container name by default)
			hostUrl: process.env.SONAR_HOST_URL || `http://${getContainerName()}:9000`,
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
};

function getContainerName() {
	return process.env.SONAR_CONTAINER_NAME || 'kunkun-sonarqube';
}
