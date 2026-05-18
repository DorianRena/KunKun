const { runCommand } = require('../cmd/run-command');
const config = require('../../config');

module.exports = {
	/**
	 * Ensure a SonarQube server container is running on a dedicated docker network.
	 * Does not wait for full Sonar readiness (may take several minutes).
	 * @returns {Promise<{name:string,network:string,host:string,exposed:boolean}>}
	 */
	async ensureSonarServer() {
		const name = config.sonar.server.containerName;
		const network = config.sonar.server.network;
		const image = config.sonar.server.image;
		const expose = config.sonar.server.exposePort;

		// Create network if missing
		try {
			await runCommand('docker', ['network', 'inspect', network]);
		}
		catch {
			console.log(`[Sonar][Server] Creating docker network ${network}`);
			await runCommand('docker', ['network', 'create', network]);
		}

		// Check if container is running
		try {
			const running = await runCommand('docker', ['ps', '--filter', `name=${name}`, '--filter', 'status=running', '--format', '{{.Names}}']);
			if (running && running.includes(name)) {
				console.log(`[Sonar][Server] Container ${name} is already running`);
				const host = expose ? 'http://localhost:9000' : `http://${name}:9000`;
				return { name, network, host, exposed: expose };
			}
		}
		catch {
			// ignore
		}

		// If exists but stopped -> start
		try {
			const exists = await runCommand('docker', ['ps', '-a', '--filter', `name=${name}`, '--format', '{{.Names}}']);
			if (exists && exists.includes(name)) {
				console.log(`[Sonar][Server] Starting existing container ${name}`);
				await runCommand('docker', ['start', name]);
				const host = expose ? 'http://localhost:9000' : `http://${name}:9000`;
				return { name, network, host, exposed: expose };
			}
		}
		catch {
			// ignore
		}

		// Run new container
		console.log(`[Sonar][Server] Creating and starting container ${name} (image: ${image})`);
		const args = [
			'run', '-d', '--name', name, '--network', network, '--restart', 'unless-stopped',
		];

		if (expose) {
			args.push('-p', '9000:9000');
		}

		// Create named volumes for persistence (optional)
		args.push('-v', `${name}-data:/opt/sonarqube/data`);
		args.push('-v', `${name}-extensions:/opt/sonarqube/extensions`);

		args.push(image);

		await runCommand('docker', args);

		const host = expose ? 'http://localhost:9000' : `http://${name}:9000`;
		console.log(`[Sonar][Server] Container ${name} started (host: ${host}). SonarQube may take a few minutes to be ready.`);
		return { name, network, host, exposed: expose };
	},
};

