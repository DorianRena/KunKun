const Docker = require('dockerode');
const docker = new Docker();

module.exports = {
	async generateReport(projectKey, volumeId, metrics, branch = null) {
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

		metrics.info = {};
		metrics.info.branch = branch || 'HEAD';
		metrics.info.name = sanitizedProjectKey;

		const pythonCmd = [
			'python3', '/src/generate_report.py', JSON.stringify(metrics), `/output/${pdfBasename}`,
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

		console.log(`[Report] PDF ready in volume "${volumeId}" as "${pdfBasename}".`);
		return { volumeName: volumeId, filename: pdfBasename };
	},
};