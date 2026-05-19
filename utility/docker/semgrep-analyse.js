const Docker = require('dockerode');
const { PassThrough } = require('stream');

const docker = new Docker();

module.exports = {
	async semgrepAnalyze(volumeId, opts = {}) {
		const configRule = opts.config || 'p/owasp-top-ten';
		const outputFile = opts.outputFile || null;

		console.log(`[Semgrep][Analyze] Launching Semgrep analysis for volume ${volumeId}`);

		// Vérifie que le volume existe
		await docker.getVolume(volumeId).inspect();

		const cmd = [
			'semgrep',
			'scan',
			'--config', configRule,
			'--json',
			'--quiet',
			...(outputFile ? [`--output=${outputFile}`] : []),
			'/repo',
		];

		const outputStream = new PassThrough();
		const _ = new PassThrough();
		const chunks = [];
		outputStream.on('data', chunk => chunks.push(chunk));

		const result = await docker.run(
			'semgrep/semgrep',
			cmd,
			[outputStream, _],
			{
				Tty: false,
				HostConfig: {
					Binds: [`${volumeId}:/repo`],
					AutoRemove: true,
					CapDrop: ['ALL'],
					SecurityOpt: ['no-new-privileges'],
				},
			},
		);

		const statusCode = result[0].StatusCode;
		if (statusCode !== 0) {
			throw new Error(`Semgrep exited with code ${statusCode}`);
		}

		console.log(`[Semgrep][Analyze] Analysis finished for volume ${volumeId}`);
		return Buffer.concat(chunks).toString('utf8').trim();
	},
};