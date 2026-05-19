const Docker = require('dockerode');
const docker = new Docker();

async function getOrCreateContainer(config) {
	try {
		const container = docker.getContainer(config.name);
		const inspect = await container.inspect();

		if (!inspect.State.Running) {
			await container.start();
		}

		return container;
	}
	catch (err) {
		if (err.statusCode === 404) {
			// N'existe pas encore, on le crée
			const container = await docker.createContainer(config);
			await container.start();
			return container;
		}
		throw err;
	}
}

async function getOrCreateVolume(name) {
	try {
		await docker.getVolume(name).inspect();
	}
	catch (err) {
		if (err.statusCode === 404) {
			await docker.createVolume({ Name: name });
		}
		else {throw err;}
	}
}

async function getOrCreateNetwork(name) {
	const networks = await docker.listNetworks({ filters: { name: [name] } });
	if (networks.length === 0) {
		await docker.createNetwork({ Name: name, Driver: 'bridge' });
	}
}

async function waitForHealthy(container, { timeout = 60000, interval = 2000 } = {}) {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		const { State } = await container.inspect();

		// Si pas de healthcheck défini, on vérifie juste que c'est running
		if (!State.Health) {
			if (State.Running) return;
			throw new Error('Container stopped unexpectedly');
		}

		if (State.Health.Status === 'healthy') return;
		if (State.Health.Status === 'unhealthy') {
			throw new Error('Container is unhealthy');
		}

		// 'starting' → on attend
		await new Promise(resolve => setTimeout(resolve, interval));
	}

	throw new Error(`Health check timed out after ${timeout}ms`);
}

module.exports = {
	async setup() {
		await getOrCreateNetwork('kunkun-net');

		await getOrCreateVolume('sonar-db');

		const containerDb = await getOrCreateContainer({
			Image: 'postgres:16-alpine',
			name: 'kunkun-db',
			Healthcheck: {
				Test: ['CMD-SHELL', 'pg_isready -U sonar'],
				Interval: 2_000_000_000,
				Timeout:  3_000_000_000,
				Retries: 10,
			},
			Env: ['POSTGRES_USER=sonar', 'POSTGRES_PASSWORD=sonar', 'POSTGRES_DB=sonar'],
			HostConfig: {
				RestartPolicy: { Name: 'unless-stopped' },
				Binds: ['sonar-db:/var/lib/postgresql/data'],
				NetworkMode: 'kunkun-net',
			},
		});
		await waitForHealthy(containerDb);

		const containerSonar = await getOrCreateContainer({
			Image: 'sonarqube:community',
			name: 'kunkun-sonarqube',
			Healthcheck: {
				Test: ['CMD-SHELL', 'curl -sf http://localhost:9000/api/system/status | grep -q UP'],
				Interval: 5_000_000_000,
				Timeout:  5_000_000_000,
				Retries: 15,
			},
			Env: [
				'SONAR_JDBC_URL=jdbc:postgresql://kunkun-db:5432/sonar',
				'SONAR_JDBC_USERNAME=sonar',
				'SONAR_JDBC_PASSWORD=sonar',
			],
			HostConfig: {
				RestartPolicy: { Name: 'unless-stopped' },
				NetworkMode: 'kunkun-net',
				PortBindings: { '9000/tcp': [{ HostPort: '9000' }] },
			},
		});
		await waitForHealthy(containerSonar, { timeout: 120_000 });
	},
};