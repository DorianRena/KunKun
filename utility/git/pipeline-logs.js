const { fetch } = require('undici');

function parseGithubUrl(repoUrl) {
	const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (!match) throw new Error('URL GitHub invalide');
	return { owner: match[1], repo: match[2] };
}

async function githubFetchJson(url, token = null) {
	const res = await fetch(url, {
		headers: {
			'User-Agent': 'KunKun-Bot',
			'Accept': 'application/vnd.github+json',
			...(token ? { 'Authorization': `Bearer ${token}` } : {}),
		},
	});

	if (!res.ok) throw new Error(`GitHub API error ${res.status} on ${url}`);
	return res.json();
}

async function githubFetchText(url, token = null) {
	const res = await fetch(url, {
		headers: {
			'User-Agent': 'KunKun-Bot',
			'Accept': 'application/vnd.github+json',
			...(token ? { 'Authorization': `Bearer ${token}` } : {}),
		},
		// undici suit les redirects automatiquement
		redirect: 'follow',
	});

	// Les logs GitHub peuvent retourner 410 Gone si expirés
	if (res.status === 410 || res.status === 404) return '(logs expirés ou indisponibles)';
	if (!res.ok) throw new Error(`GitHub logs error ${res.status}`);
	return res.text();
}

async function fetchGithubPipelineLogs(repoUrl, token = null, limit = 5) {
	const { owner, repo } = parseGithubUrl(repoUrl);
	console.log(`[GitHub][Pipeline] Fetching pipeline logs for ${owner}/${repo}`);

	const runsData = await githubFetchJson(
		`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${limit}`,
		token,
	);

	if (!runsData.workflow_runs?.length) {
		console.log('[GitHub][Pipeline] No workflow runs found');
		return { platform: 'github', runs: [] };
	}

	const runs = [];

	for (const run of runsData.workflow_runs.slice(0, limit)) {
		const jobsData = await githubFetchJson(
			`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`,
			token,
		);

		const jobs = [];
		for (const job of (jobsData.jobs || [])) {
			let logs;
			try {
				logs = await githubFetchText(
					`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`,
					token,
				);
			}
			catch (e) {
				console.warn(`[GitHub][Pipeline] Could not fetch logs for job ${job.id}: ${e.message}`);
				logs = '(logs indisponibles)';
			}

			jobs.push({ name: job.name, status: job.conclusion, logs });
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