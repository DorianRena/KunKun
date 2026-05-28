const Docker = require('dockerode');
const { PassThrough, Writable } = require('node:stream');

const docker = new Docker();

module.exports = {
	async trufflehogAnalyze(volumeId, commit) {
		console.log(`[TruffleHog][Analyze] Launching analysis for volume ${volumeId}`);

		// Vérifie que le volume existe
		await docker.getVolume(volumeId).inspect();

		let cmd;
		if (commit === true) {
			cmd = [
				'git',
				'file:///repo',
				'--json',
				'--no-update',
			];
		}
		else {
			cmd = [
				'filesystem',
				'/repo',
				'--json',
				'--no-update',
			];
		}

		const outputStream = new PassThrough();
		const chunks = [];
		outputStream.on('data', chunk => chunks.push(chunk));

		const errChunks = [];
		const errStream = new Writable({
			write(chunk, enc, cb) {
				errChunks.push(chunk);
				cb();
			},
		});
		errStream.dump = () => process.stderr.write(Buffer.concat(errChunks));

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
		// Remplacez votre map/filter final par ceci :
		const results = raw
			.split('\n')
			.filter(Boolean)
			.map(line => {
				try { return JSON.parse(line); }
				catch { return null; }
			})
			.filter(Boolean);

		// Dédoublonnage basé sur une clé unique (Fichier + Ligne + Secret)
		const uniqueResults = [];
		const seen = new Set();

		for (const item of results) {
			const sourceData = item.SourceMetadata?.Data?.Git || item.SourceMetadata?.Data?.Filesystem;

			const file = sourceData?.file || 'unknown';
			const line = sourceData?.line || 0;
			const secret = item.Raw || '';

			const key = `${file}:${line}:${secret}`;

			if (!seen.has(key)) {
				uniqueResults.push(item);
				seen.add(key);
			}
		}

		return uniqueResults;

	},
};