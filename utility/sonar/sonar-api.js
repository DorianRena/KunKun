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
		const hostUrl = 'http://localhost:9000'/* config.sonar.scanner.hostUrl*/;
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
				rejectUnauthorized: false, // Allow self-signed certs
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
					delayMs *= 1.5; // Exponential backoff
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
};

module.exports = sonarApi;