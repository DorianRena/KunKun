const https = require('https');

/**
 * Extrait owner/repo depuis l'URL
 * ex: https://github.com/owner/repo → { owner, repo }
 */
function parseGithubUrl(repoUrl) {
	const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (!match) throw new Error('URL GitHub invalide');
	return { owner: match[1], repo: match[2] };
}

async function fetchJson(url, token = null) {
	return new Promise((resolve, reject) => {
		const options = {
			headers: {
				'User-Agent': 'KunKun-Bot',
				'Accept': 'application/vnd.github+json',
				...(token ? { 'Authorization': `Bearer ${token}` } : {}),
			},
		};
		https.get(url, options, res => {
			const chunks = [];
			res.on('data', c => chunks.push(c));
			res.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString())));
			res.on('error', reject);
		});
	});
}

async function fetchText(url, token = null) {
	return new Promise((resolve, reject) => {
		const options = {
			headers: {
				'User-Agent': 'KunKun-Bot',
				'Accept': 'application/vnd.github+json',
				...(token ? { 'Authorization': `Bearer ${token}` } : {}),
			},
		};
		https.get(url, options, res => {
			// Gérer les redirects (GitHub renvoie souvent un 302)
			if (res.statusCode === 302 || res.statusCode === 301) {
				return fetchText(res.headers.location, token).then(resolve).catch(reject);
			}
			const chunks = [];
			res.on('data', c => chunks.push(c));
			res.on('end', () => resolve(Buffer.concat(chunks).toString()));
			res.on('error', reject);
		});
	});
}

/**
 * Récupère les logs des N derniers workflow runs GitHub Actions
 */
async function fetchGithubPipelineLogs(repoUrl, token = null, limit = 5) {
	const { owner, repo } = parseGithubUrl(repoUrl);
	console.log(`[GitHub][Pipeline] Fetching pipeline logs for ${owner}/${repo}`);

	// 1. Récupère les derniers workflow runs
	const runsData = await fetchJson(
		`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${limit}`,
		token,
	);

	if (!runsData.workflow_runs?.length) {
		return { platform: 'github', runs: [] };
	}

	const runs = [];

	for (const run of runsData.workflow_runs.slice(0, limit)) {
		// 2. Récupère les jobs de chaque run
		const jobsData = await fetchJson(
			`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`,
			token,
		);

		const jobs = [];
		for (const job of jobsData.jobs || []) {
			// 3. Récupère les logs de chaque job
			let logs;
			try {
				logs = await fetchText(
					`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`,
					token,
				);
			}
			catch (e) {
				logs = '(logs indisponibles) error: ' + e.message;
			}

			jobs.push({
				name: job.name,
				status: job.conclusion,
				logs,
			});
		}

		runs.push({
			id: run.id,
			name: run.name,
			status: run.conclusion,
			createdAt: run.created_at,
			jobs,
		});
	}

	return { platform: 'github', runs };
}

module.exports = { fetchGithubPipelineLogs, parseGithubUrl };