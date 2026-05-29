const Docker = require('dockerode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const docker = new Docker();

module.exports = {
	async generateReport(projectKey, volumeId, metrics) {
		const network = 'kunkun-net';
		const today = new Date().toISOString().split('T')[0];
		const sanitizedProjectKey = projectKey.replace(/:/g, '-');
		const pdfBasename = `${today}-${sanitizedProjectKey}-report.pdf`;

		if (metrics.sonar) {
			const status = metrics.sonar.measures?.find((m) => m.metric === 'alert_status')?.value || 'NONE';
			metrics.sonar.status = status;
			const csvFile = `/output/${today}-${sanitizedProjectKey}-issues-report.csv`;
			metrics.sonar.csvFile = csvFile;
		}

		// Write metrics.json to the OS temp directory (cross-platform)
		const metricsFilename = `${today}-${sanitizedProjectKey}-metrics.json`;
		const metricsHostPath = path.join(os.tmpdir(), metricsFilename);
		const metricsContainerPath = `/output/${metricsFilename}`;
		fs.writeFileSync(metricsHostPath, JSON.stringify(metrics, null, 2));

		// Copy metrics.json into the volume using a temporary busybox container
		// On Windows, Docker Desktop uses Linux containers so host paths must be
		// converted from Windows format (C:\Users\...) to the Docker-mounted path
		const dockerHostPath = metricsHostPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1');
		await docker.run(
			'alpine:latest',
			['sh', '-c', `cp /metrics-src/${metricsFilename} /output/${metricsFilename}`],
			process.stdout,
			{
				HostConfig: {
					Binds: [
						`${volumeId}:/output`,
						`${dockerHostPath}:/metrics-src/${metricsFilename}:ro`,
					],
					NetworkMode: network,
					AutoRemove: true,
				},
			},
		);

		const pythonCmd = [
			'python3', '/src/generate_report.py', metricsContainerPath, `/output/${pdfBasename}`,
		];

		console.log('[Report] Executing Python report generation...');
		await docker.run(
			'python-reportlab:latest',
			pythonCmd,
			process.stdout,
			{
				HostConfig: {
					Binds: [
						`${volumeId}:/output`,
					],
					NetworkMode: network,
					AutoRemove: true,
				},
			},
		);

		fs.unlinkSync(metricsHostPath);

		console.log(`[Report] PDF ready in volume "${volumeId}" as "${pdfBasename}".`);
		return { volumeName: volumeId, filename: pdfBasename };
	},
};