const https = require('node:https');
const http = require('node:http');
const config = require('../../config');

const sonarApi = {
	/**
	 * Fetch project metrics from SonarQube API.
	 * @param {string} projectKey - SonarQube project key
	 * @returns {Promise<object>} Metrics object or null if not ready
	 */
	async fetchProjectMetrics(projectKey) {
		const hostUrl = 'http://localhost:9000';
		const token = config.sonar.scanner.token;

		if (!hostUrl || !token) {
			throw new Error('SONAR_HOST_URL and SONAR_TOKEN must be configured');
		}

		// Parse host URL to extract protocol, host, port
		const url = new URL(hostUrl);
		const protocol = url.protocol === 'https:' ? https : http;
		const hostname = url.hostname;
		const port = url.port || (url.protocol === 'https:' ? 443 : 80);

		// Metrics to retrieve
		const metrics = [
			'bugs',
			'vulnerabilities',
			'code_smells',
			'coverage',
			'duplicated_lines_density',
			'alert_status',
			'sqale_rating',
			'reliability_rating',
			'security_rating',
			'lines',
			'files',
			'ncloc_language_distribution',
		];

		const query = `component=${encodeURIComponent(projectKey)}&metricKeys=${metrics.join(',')}`;
		const pathname = `/api/measures/component?${query}`;

		return new Promise((resolve, reject) => {
			const options = {
				hostname,
				port,
				path: pathname,
				method: 'GET',
				headers: {
					Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
					'User-Agent': 'KunKun-Bot',
				},
				rejectUnauthorized: false,
			};

			const req = protocol.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					if (res.statusCode === 200) {
						try {
							const parsed = JSON.parse(data);
							if (parsed.component && parsed.component.measures) {
								resolve(parsed.component);
							}
							else {
								resolve(null);
							}
						}
						catch (err) {
							reject(new Error(`Failed to parse Sonar API response: ${err.message}`));
						}
					}
					else if (res.statusCode === 404) {
						// Project not yet indexed
						resolve(null);
					}
					else {
						reject(new Error(`Sonar API returned status ${res.statusCode}`));
					}
				});
			});

			req.on('error', (err) => {
				reject(new Error(`Failed to query Sonar API: ${err.message}`));
			});

			req.end();
		});
	},

	/**
	 * Retry fetching metrics with exponential backoff.
	 * @param {string} projectKey - SonarQube project key
	 * @param {number} maxRetries - Maximum number of retries
	 * @param {number} delayMs - Initial delay in milliseconds
	 * @returns {Promise<object>} Metrics or null
	 */
	async fetchProjectMetricsWithRetry(projectKey, maxRetries = 5, delayMs = 3000) {
		let lastError;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				const metrics = await sonarApi.fetchProjectMetrics(projectKey);
				if (metrics) {
					return metrics;
				}
				// Project not yet indexed, retry
				if (attempt < maxRetries) {
					console.log(`[Sonar][API] Project ${projectKey} not yet indexed, retrying in ${delayMs}ms...`);
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					delayMs *= 1.5;
				}
			}
			catch (err) {
				lastError = err;
				console.error(`[Sonar][API] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, err.message);
				if (attempt < maxRetries) {
					await new Promise((resolve) => setTimeout(resolve, delayMs));
					delayMs *= 1.5;
				}
			}
		}
		throw lastError || new Error('Failed to fetch metrics after maximum retries');
	},

	/**
	 * Fetch issues (bugs, vulnerabilities, code smells) from SonarQube API.
	 * @param {string} projectKey - SonarQube project key
	 * @param {string} type - Issue type: 'BUG', 'VULNERABILITY', 'CODE_SMELL'
	 * @param {number} [pageSize=50] - Maximum results per page
	 * @returns {Promise<Array>} Array of issues
	 */
	async fetchIssues(projectKey, type, pageSize = 50) {
		const hostUrl = 'http://localhost:9000';
		const token = config.sonar.scanner.token;

		if (!hostUrl || !token) {
			throw new Error('SONAR_HOST_URL and SONAR_TOKEN must be configured');
		}

		const url = new URL(hostUrl);
		const protocol = url.protocol === 'https:' ? https : http;
		const hostname = url.hostname;
		const port = url.port || (url.protocol === 'https:' ? 443 : 80);

		const query = `componentKeys=${encodeURIComponent(projectKey)}&types=${type}&ps=${pageSize}&resolved=false`;
		const pathname = `/api/issues/search?${query}`;

		return new Promise((resolve, reject) => {
			const options = {
				hostname,
				port,
				path: pathname,
				method: 'GET',
				headers: {
					Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
					'User-Agent': 'KunKun-Bot',
				},
				rejectUnauthorized: false,
			};

			const req = protocol.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					if (res.statusCode === 200) {
						try {
							const parsed = JSON.parse(data);
							resolve(parsed.issues || []);
						}
						catch (err) {
							reject(new Error(`Failed to parse issues response: ${err.message}`));
						}
					}
					else {
						reject(new Error(`Sonar API returned status ${res.statusCode}`));
					}
				});
			});

			req.on('error', (err) => {
				reject(new Error(`Failed to query Sonar API: ${err.message}`));
			});

			req.end();
		});
	},

	async fetchRule(ruleKey) {
		const hostUrl = 'http://localhost:9000';
		const token = config.sonar.scanner.token;
		const url = new URL(hostUrl);
		const protocol = url.protocol === 'https:' ? https : http;

		const pathname = `/api/rules/show?key=${encodeURIComponent(ruleKey)}`;

		return new Promise((resolve, reject) => {
			const options = {
				hostname: url.hostname,
				port: url.port || (url.protocol === 'https:' ? 443 : 80),
				path: pathname,
				method: 'GET',
				headers: {
					Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
					'User-Agent': 'KunKun-Bot',
				},
				rejectUnauthorized: false,
			};

			const req = protocol.request(options, (res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => {
					if (res.statusCode === 200) {
						try {
							resolve(JSON.parse(data).rule || null);
						}
						catch (err) {
							reject(new Error(`Failed to parse rule response: ${err.message}`));
						}
					}
					else {
						reject(new Error(`Sonar API returned status ${res.statusCode}`));
					}
				});
			});

			req.on('error', (err) => reject(new Error(`Failed to query Sonar API: ${err.message}`)));
			req.end();
		});
	},

	async waitForAnalysisCompletion(projectKey, maxRetries = 20, delayMs = 3000) {
		for (let i = 0; i < maxRetries; i++) {
			const result = await new Promise((resolve, reject) => {
				// même setup http que fetchProjectMetrics...
				const hostUrl = 'http://localhost:9000';
				const token = config.sonar.scanner.token;
				const url = new URL(hostUrl);
				const protocol = url.protocol === 'https:' ? https : http;
				const pathname = `/api/ce/component?component=${encodeURIComponent(projectKey)}`;

				const req = protocol.request({
					hostname: url.hostname,
					port: url.port || 80,
					path: pathname,
					method: 'GET',
					headers: {
						Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
						'User-Agent': 'KunKun-Bot',
					},
				}, (res) => {
					let data = '';
					res.on('data', chunk => data += chunk);
					res.on('end', () => resolve(JSON.parse(data)));
				});
				req.on('error', reject);
				req.end();
			});

			const tasks = result.queue || [];
			const current = result.current;

			// Plus aucune tâche en attente ET la dernière est SUCCESS
			if (tasks.length === 0 && current?.status === 'SUCCESS') return true;
			if (current?.status === 'FAILED') throw new Error('SonarQube analysis task failed');

			console.log(`[Sonar][API] Analysis in progress (status: ${current?.status}), waiting...`);
			await new Promise(r => setTimeout(r, delayMs));
		}
		throw new Error('SonarQube analysis timed out');
	},
};

module.exports = sonarApi;