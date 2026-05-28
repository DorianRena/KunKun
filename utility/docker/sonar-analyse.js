const Docker = require('dockerode');
const { uniqueId } = require('../id-generator');
const config = require('../../config');
const { devNull, stderrStream } = require('./utility');

const docker = new Docker();

module.exports = {
	async sonarAnalyse(volumeId, opts = {}) {
		const id = uniqueId();
		const projectKey = opts.projectKey || `project_${volumeId}_${id}`;
		const projectName = opts.projectName || projectKey;

		const sonarHost = 'http://kunkun-sonarqube:9000';
		const sonarToken = config.sonar.scanner.token;
		const network = 'kunkun-net';

		console.log(`[Sonar][Analyze] Launching Sonar scanner for volume ${volumeId} (project: ${projectKey})`);

		const result = await docker.run(
			'sonarsource/sonar-scanner-cli',
			[
				'-Dsonar.projectBaseDir=/repo',
				`-Dsonar.projectKey=${projectKey}`,
				`-Dsonar.projectName=${projectName}`,
				'-Dsonar.sources=.',
				'-Dsonar.exclusions=**/*.java',
				`-Dsonar.host.url=${sonarHost}`,
				`-Dsonar.login=${sonarToken}`,
			],
			[devNull(), stderrStream()],
			{
				HostConfig: {
					Binds: [`${volumeId}:/repo`],
					NetworkMode: network,
					AutoRemove: true,
					CapDrop: ['ALL'],
					SecurityOpt: ['no-new-privileges'],
				},
			},
		);

		const statusCode = result[0].StatusCode;
		if (statusCode !== 0) {
			throw new Error(`Sonar scanner exited with code ${statusCode}`);
		}

		console.log(`[Sonar][Analyze] Analysis finished for volume ${volumeId}`);
	},
};