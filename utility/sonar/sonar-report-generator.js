const Docker = require('dockerode');
const config = require('../../config');
const docker = new Docker();
const { devNull, stderrStream } = require('../docker/utility');

module.exports = {
	async generateSonarReport(projectKey, volumeId) {
		const sonarHost = 'http://kunkun-sonarqube:9000';
		const sonarToken = config.sonar.scanner.token;
		const network = 'kunkun-net';

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
			[devNull(), stderrStream()],
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

		if (cnesExit.StatusCode !== 0) {
			console.log(`CNES report generation failed (exit ${cnesExit.StatusCode})`);
		}
		console.log('[Sonar][Report] CNES artifacts generated successfully.');
	},
};