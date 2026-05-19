const { runCommand } = require('../cmd/run-command');

module.exports = {
	/**
	 * Lance une analyse Semgrep dans un container Docker en montant le volume fourni.
	 * @param {string} volumeId Identifiant du volume Docker contenant le repo cloné
	 * @param {object} [opts]
	 * @param {string} [opts.config] Configuration Semgrep (par défaut 'p/owasp-top-ten')
	 * @param {string} [opts.outputFormat] Format de sortie (par défaut 'json')
	 * @param {string} [opts.outputFile] Fichier de sortie (optionnel)
	 * @returns {Promise<string>} stdout du processus docker
	 */
	async semgrepAnalyze(volumeId, opts = {}) {
		const config_rule = opts.config || 'p/owasp-top-ten';
		const outputFile = opts.outputFile || null;

		try {
			console.log(`[Semgrep][Analyze] Inspecting volume ${volumeId}`);
			await runCommand('docker', ['volume', 'inspect', volumeId]);

			console.log(`[Semgrep][Analyze] Launching Semgrep analysis for volume ${volumeId}`);

			// Exécute Semgrep dans un container temporaire en montant le volume
			// NOTE: le dépôt est cloné dans le volume sous /repo
			const semgrepArgs = [
				'run', '--rm',
				'--cap-drop=ALL',
				'--security-opt', 'no-new-privileges',
				'-v', `${volumeId}:/repo`,
				'semgrep/semgrep',
				'semgrep',
				'scan',
				'--config', config_rule,
				'--json',
				'/repo',
			];

			let output;
			if (outputFile) {
				semgrepArgs.push(`--output=${outputFile}`);
				output = await runCommand('docker', semgrepArgs);
			}
			else {
				output = await runCommand('docker', semgrepArgs);
			}

			console.log(`[Semgrep][Analyze] Analysis finished for volume ${volumeId}`);
			// console.log(output);
			return output;
		}
		catch (err) {
			const msg = (err && err.message) ? err.message : String(err);
			console.error(`[Semgrep][Analyze] Error for volume ${volumeId}:`, msg);

			throw err;
		}
	},
};
