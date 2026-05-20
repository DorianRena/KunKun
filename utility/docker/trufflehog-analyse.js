const Docker = require('dockerode');
const { PassThrough } = require('stream');

const docker = new Docker();

module.exports = {
	async trufflehogAnalyze(volumeId) {
		console.log(`[TruffleHog][Analyze] Launching analysis for volume ${volumeId}`);

		// Vérifie que le volume existe
		await docker.getVolume(volumeId).inspect();

		const cmd = [
			'filesystem',
			'/repo',
			'--json',
			'--no-update',
		];

		const outputStream = new PassThrough();
		const errStream = new PassThrough();
		const chunks = [];
		outputStream.on('data', chunk => chunks.push(chunk));

		const result = await docker.run(
			'trufflesecurity/trufflehog:latest',
			cmd,
			[outputStream, errStream],
			{
				Tty: false,
				HostConfig: {
					Binds: [`${volumeId}:/repo`],
					AutoRemove: true,
					CapDrop: ['ALL'],
					SecurityOpt: ['no-new-privileges'],
					NetworkMode: 'none',
				},
			},
		);

		// TruffleHog retourne 183 quand il trouve des secrets, 0 si rien — les deux sont OK
		const statusCode = result[0].StatusCode;
		if (statusCode !== 0 && statusCode !== 183) {
			throw new Error(`TruffleHog exited with code ${statusCode}`);
		}

		const raw = Buffer.concat(chunks).toString('utf8').trim();
		console.log(`[TruffleHog][Analyze] Analysis finished for volume ${volumeId}`);

		// Chaque ligne est un objet JSON indépendant
		return raw
			.split('\n')
			.filter(Boolean)
			.map(line => {
				try { return JSON.parse(line); }
				catch { return null; }
			})
			.filter(Boolean);
	},
};