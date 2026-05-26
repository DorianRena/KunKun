const Docker = require('dockerode');
const docker = new Docker();

const util = {
	async pullImage(image) {
		console.info(`[Docker] Pulling image ${image}...`);
		await new Promise((resolve, reject) => {
			docker.pull(image, (err, stream) => {
				if (err) return reject(err);
				docker.modem.followProgress(
					stream,
					(err) => {
						if (err) {
							reject(err);
						}
						else {
							console.info(`[Docker] Image ${image} pulled successfully`);
							resolve();
						}
					},
					(event) => {
						if (event.status && event.progress) {
							console.info(`[Docker] ${event.status} ${event.progress}`);
						}
					},
				);
			});
		});
	},
	async ensureImage(image) {
		try {
			await docker.getImage(image).inspect();
		}
		catch (err) {
			if (err.statusCode === 404) {
				await util.pullImage(image);
			}
			else {
				throw err;
			}
		}
	},

	async ensureBuiltImage(imageName, dockerfileDir) {
		try {
			await docker.getImage(imageName).inspect();
			console.info(`[Docker] Built image ${imageName} already exists`);
		}
		catch (err) {
			if (err.statusCode === 404) {
				console.info(`[Docker] Building local image ${imageName} from ${dockerfileDir}...`);

				const tar = require('tar-fs');
				const pack = tar.pack(dockerfileDir);

				await new Promise((resolve, reject) => {
					docker.buildImage(pack, { t: imageName }, (err, stream) => {
						if (err) return reject(err);
						docker.modem.followProgress(
							stream,
							(err, res) => {
								if (err) { reject(err); }
								else {
									console.info(`[Docker] Image ${imageName} built successfully`);
									resolve(res);
								}
							},
							(event) => {
								if (event.stream) {
									process.stdout.write(`[Docker Build] ${event.stream}`);
								}
							},
						);
					});
				});
			}
			else {
				throw err;
			}
		}
	},

	async getOrCreateContainer(config) {
		try {
			const container = docker.getContainer(config.name);
			const inspect = await container.inspect();

			if (!inspect.State.Running) {
				console.info(`[Docker] Starting existing container ${config.name}...`);
				await container.start();
				console.info(`[Docker] Container ${config.name} started`);
			}
			else {
				console.info(`[Docker] Container ${config.name} already running`);
			}

			return container;
		}
		catch (err) {
			if (err.statusCode === 404) {
				await util.pullImage(config.Image);
				console.info(`[Docker] Creating container ${config.name}...`);
				const container = await docker.createContainer(config);
				await container.start();
				console.info(`[Docker] Container ${config.name} created and started`);
				return container;
			}
			throw err;
		}
	},
	async getOrCreateVolume(name) {
		try {
			await docker.getVolume(name).inspect();
			console.info(`[Docker] Volume ${name} already exists`);
		}
		catch (err) {
			if (err.statusCode === 404) {
				console.info(`[Docker] Creating volume ${name}...`);
				await docker.createVolume({ Name: name });
				console.info(`[Docker] Volume ${name} created`);
			}
			else {
				throw err;
			}
		}
	},
	async getOrCreateNetwork(name) {
		const networks = await docker.listNetworks({ filters: { name: [name] } });
		if (networks.length === 0) {
			console.info(`[Docker] Creating network ${name}...`);
			await docker.createNetwork({ Name: name, Driver: 'bridge' });
			console.info(`[Docker] Network ${name} created`);
		}
		else {
			console.info(`[Docker] Network ${name} already exists`);
		}
	},
	async waitForHealthy(container, { timeout = 60000, interval = 2000, delay = 0 } = {}) {
		const { Name } = await container.inspect();
		const name = Name.replace('/', '');

		if (delay > 0) {
			console.info(`[Docker] Waiting ${delay}ms before checking ${name} health...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		console.info(`[Docker] Waiting for ${name} to be healthy...`);
		const start = Date.now();

		while (Date.now() - start < timeout) {
			const { State } = await container.inspect();

			if (!State.Health) {
				if (State.Running) {
					console.info(`[Docker] ${name} is running (no healthcheck)`);
					return;
				}
				throw new Error('Container stopped unexpectedly');
			}

			const status = State.Health.Status;
			console.info(`[Docker] ${name} health: ${status}`);

			if (status === 'healthy') {
				console.info(`[Docker] ${name} is healthy`);
				return;
			}
			if (status === 'unhealthy') {
				throw new Error(`Container ${name} is unhealthy`);
			}

			await new Promise(resolve => setTimeout(resolve, interval));
		}

		throw new Error(`Health check timed out after ${timeout}ms`);
	},

	async setup() {
		console.info('[Docker] Setting up infrastructure...');

		await util.getOrCreateNetwork('kunkun-net');
		await util.getOrCreateVolume('sonar-db');

		const containerDb = await util.getOrCreateContainer({
			Image: 'postgres:16-alpine',
			name: 'kunkun-db',
			Healthcheck: {
				Test: ['CMD-SHELL', 'pg_isready -U sonar'],
				Interval: 2_000_000_000,
				Timeout: 3_000_000_000,
				Retries: 10,
			},
			Env: ['POSTGRES_USER=sonar', 'POSTGRES_PASSWORD=sonar', 'POSTGRES_DB=sonar'],
			HostConfig: {
				RestartPolicy: { Name: 'unless-stopped' },
				Binds: ['sonar-db:/var/lib/postgresql/data'],
				NetworkMode: 'kunkun-net',
			},
		});
		await util.waitForHealthy(containerDb);

		const containerSonar = await util.getOrCreateContainer({
			Image: 'sonarqube:community',
			name: 'kunkun-sonarqube',
			Healthcheck: {
				Test: ['CMD-SHELL', 'curl -sf http://localhost:9000/api/system/status | grep -q UP'],
				Interval: 5_000_000_000,
				Timeout: 5_000_000_000,
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
		// TODO : Put image in config to avoid repetition
		console.log('[Docker] Pulling missing images...');
		await util.ensureImage('semgrep/semgrep');
		await util.ensureImage('sonarsource/sonar-scanner-cli');
		await util.ensureImage('trufflesecurity/trufflehog');
		await util.ensureImage('alpine:latest');
		await util.ensureBuiltImage('eclipse-temurin-cnes:latest', './tools/eclipse-temurin-cnes');
		await util.ensureBuiltImage('python-reportlab:latest', './tools/python-reportlab');

		await util.waitForHealthy(containerSonar, { timeout: 120_000, interval: 10000 });

		console.info('[Docker] Infrastructure ready');
	},
	async teardown() {
		console.info('[Docker] Tearing down infrastructure...');

		try {
			// Stop Sonar
			try {
				const sonarContainer = docker.getContainer('kunkun-sonarqube');
				console.info('[Docker] Stopping SonarQube container...');
				await sonarContainer.stop({ t: 10 });
				console.info('[Docker] SonarQube stopped');
			}
			catch (err) {
				if (err.statusCode !== 304) {
					console.warn('[Docker] Failed to stop SonarQube:', err.message);
				}
			}

			// Stop Database
			try {
				const dbContainer = docker.getContainer('kunkun-db');
				console.info('[Docker] Stopping PostgreSQL container...');
				await dbContainer.stop({ t: 10 });
				console.info('[Docker] PostgreSQL stopped');
			}
			catch (err) {
				if (err.statusCode !== 304) {
					console.warn('[Docker] Failed to stop PostgreSQL:', err.message);
				}
			}

			console.info('[Docker] Infrastructure cleaned up');
		}
		catch (err) {
			console.error('[Docker] Error during teardown:', err.message);
		}
	},
};

module.exports = util;