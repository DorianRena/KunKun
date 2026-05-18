const { runCommand } = require('../cmd/run-command');
const { uniqueId } = require('../id-generator');
const config = require('../../config');

module.exports = {
	/**
	 * Lance une analyse SonarQube dans un container Docker en montant le volume fourni.
	 * @param {string} volumeId Identifiant du volume Docker contenant le repo cloné
	 * @param {object} [opts]
	 * @param {string} [opts.projectKey] Clé du projet Sonar (par défaut unique)
	 * @param {string} [opts.projectName] Nom du projet Sonar (optionnel)
	 * @returns {Promise<string>} stdout du processus docker
	 */
	async sonarAnalyze(volumeId, opts = {}) {
		const id = uniqueId();
		const projectKey = opts.projectKey || `project_${volumeId}_${id}`;
		const projectName = opts.projectName || projectKey;
		const branch = opts.branch; // optional branch name

		// Get Sonar configuration (smart defaults for Docker context)
		const sonarHost = config.sonar.scanner.hostUrl;
		const sonarToken = config.sonar.scanner.token;
		const network = config.sonar.server.network;

		try {
			console.log(`[Sonar][Analyze] Inspecting volume ${volumeId}`);
			await runCommand('docker', ['volume', 'inspect', volumeId]);

			console.log(`[Sonar][Analyze] Launching Sonar scanner for volume ${volumeId} (project: ${projectKey})`);

			// Exécute le scanner Sonar dans un container temporaire en montant le volume
			// NOTE: le dépôt est cloné dans le volume sous /repo
			const scannerArgs = [
				'run', '--rm',
				'--network', network,
				'--cap-drop=ALL',
				'--security-opt', 'no-new-privileges',
				'-v', `${volumeId}:/repo`,
				'sonarsource/sonar-scanner-cli',
				'-Dsonar.projectBaseDir=/repo',
				`-Dsonar.projectKey=${projectKey}`,
				`-Dsonar.projectName=${projectName}`,
				'-Dsonar.sources=.',
				`-Dsonar.host.url=${sonarHost}`,
				`-Dsonar.login=${sonarToken}`,
			];

			const output = await runCommand('docker', scannerArgs);
			console.log(`[Sonar][Analyze] Analysis finished for volume ${volumeId}`);
			return output;
		}
		catch (err) {
			const msg = (err && err.message) ? err.message : String(err);
			console.error(`[Sonar][Analyze] Error for volume ${volumeId}:`, msg);

			throw err;
		}
	},
};

