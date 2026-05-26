const Docker = require('dockerode');
const config = require('../../config');
const docker = new Docker();
const { uniqueId } = require('../id-generator');

// Capture stdout+stderr d'un conteneur avec démultiplexage Docker.
const runAndCapture = async (image, cmd, binds, env = []) => {
	const container = await docker.createContainer({
		Image: image,
		Cmd: cmd,
		Env: env,
		AttachStdout: true,
		AttachStderr: true,
		HostConfig: { Binds: binds },
	});

	const stream = await container.attach({ stream: true, stdout: true, stderr: true });
	const chunks = [];
	stream.on('data', chunk => chunks.push(chunk));

	await container.start();
	const exit = await container.wait();
	await container.remove();

	const raw = Buffer.concat(chunks);
	const stdout = [];
	const stderr = [];
	let offset = 0;
	while (offset + 8 <= raw.length) {
		const type = raw[offset];
		const size = raw.readUInt32BE(offset + 4);
		offset += 8;
		if (type === 1) stdout.push(raw.slice(offset, offset + size));
		if (type === 2) stderr.push(raw.slice(offset, offset + size));
		offset += size;
	}

	return {
		statusCode: exit.StatusCode,
		stdout: Buffer.concat(stdout),
		stderr: Buffer.concat(stderr),
	};
};

module.exports = {
	async generateSonarPdfReport(projectKey) {
		const sonarHost = 'http://kunkun-sonarqube:9000';
		const sonarToken = config.sonar.scanner.token;
		const network = 'kunkun-net';

		const tempVolumeName = `report-${uniqueId()}`;

		await docker.createVolume({ Name: tempVolumeName });
		console.log(`[Sonar][Report] Temporary volume created: ${tempVolumeName}`);

		const abortAndClean = async (msg) => {
			await docker.getVolume(tempVolumeName).remove().catch(() => {
				console.error(`[Sonar][Report] Failed to remove temporary volume: ${tempVolumeName}`);
			});
			throw new Error(msg);
		};

		// ── Étape 1 : génération CNES ────────────────────────────────────────────
		console.log(`[Sonar][Report] Generating report for ${projectKey}`);
		const cmd = [
			'java',
			'-jar', '/src/sonar-cnes-report.jar',
			'-s', sonarHost,
			'-t', sonarToken,
			'-p', projectKey,
			'-o', '/output',
			'-l', 'fr_FR',
			'-a', 'Kunkun',
		];

		const [cnesExit] = await docker.run(
			'eclipse-temurin-cnes',
			cmd,
			process.stdout,
			{
				HostConfig: {
					Binds: [
						`${tempVolumeName}:/output`,
					],
					NetworkMode: network,
					AutoRemove: true,
				},
			},
		);

		if (cnesExit.StatusCode !== 0) {
			await abortAndClean(`CNES report generation failed (exit ${cnesExit.StatusCode})`);
		}
		console.log('[Sonar][Report] CNES artifacts generated successfully.');

		// ── Étape 2 : Exécution du script Python ──────────────────────────────────────
		const today = new Date().toISOString().split('T')[0];
		const sanitizedProjectKey = projectKey.replace(/:/g, '-');
		const csvFile = `${today}-${sanitizedProjectKey}-issues-report.csv`;
		const pdfBasename = `${today}-${sanitizedProjectKey}-report.pdf`;

		console.log('[Sonar][Report] Executing Python report generation...');
		const pythonCmd = [
			'python3', '/src/generate_sonar_report.py', `/output/${csvFile}`, `/output/${pdfBasename}`,
		];

		await docker.run(
			'python-reportlab:latest',
			pythonCmd,
			process.stdout,
			{
				HostConfig: {
					Binds: [
						`${tempVolumeName}:/output`,
					],
					NetworkMode: network,
					AutoRemove: true,
				},
			},
		);

		// ── Étape 3 : vérification que le PDF est bien là ────────────────────────
		const { statusCode: checkStatus } = await runAndCapture(
			'alpine:latest',
			['sh', '-c', 'test -f "/output/$PDF_FILE"'],
			[`${tempVolumeName}:/output:ro`],
			[`PDF_FILE=${pdfBasename}`],
		);

		if (checkStatus !== 0) {
			await abortAndClean(`PDF not found: ${pdfBasename}`);
		}

		console.log(`[Sonar][Report] PDF ready in volume "${tempVolumeName}" as "${pdfBasename}".`);
		return { volumeName: tempVolumeName, filename: pdfBasename };
	},
};