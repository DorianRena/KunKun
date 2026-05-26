const { fetch } = require('undici');

// --- Helpers pour GitHub ---
async function fetchGithub(url, token) {
	const res = await fetch(url, {
		headers: {
			'User-Agent': 'KunKun-Bot',
			'Accept': 'application/vnd.github+json',
			...(token ? { 'Authorization': `Bearer ${token}` } : {}),
		},
		redirect: 'follow',
	});
	if (res.status === 410 || res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
	return res.headers.get('content-type')?.includes('application/json')
		? res.json() : res.text();
}

// --- Helpers pour GitLab ---
async function fetchGitlab(url, token) {
	const res = await fetch(url, {
		headers: {
			...(token ? { 'PRIVATE-TOKEN': token } : {}),
		},
	});
	if (!res.ok) throw new Error(`GitLab API error ${res.status}`);
	return res.headers.get('content-type')?.includes('application/json')
		? res.json() : res.text();
}

async function handleGithub(repoUrl, token, limit) {
	const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	const { owner, repo } = { owner: match[1], repo: match[2] };

	const runsData = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${limit}`, token);

	const runs = await Promise.all(runsData.workflow_runs.slice(0, limit).map(async (run) => {
		const jobsData = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`, token);
		const jobs = await Promise.all(jobsData.jobs.map(async (job) => {
			const logs = await fetchGithub(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${job.id}/logs`, token);
			return { name: job.name, status: job.conclusion, logs: logs || '(indisponible)' };
		}));
		return { id: run.id, name: run.name, status: run.conclusion, jobs };
	}));

	return { platform: 'github', runs };
}

async function handleGitlab(repoUrl, token, limit) {
	// Note: GitLab nécessite l'ID projet (souvent encodé avec %2F)
	const projectId = encodeURIComponent(repoUrl.split('gitlab.com/')[1].replace('.git', ''));

	const pipelines = await fetchGitlab(`https://gitlab.com/api/v4/projects/${projectId}/pipelines?per_page=${limit}`, token);

	const runs = await Promise.all(pipelines.map(async (pipe) => {
		const jobs = await fetchGitlab(`https://gitlab.com/api/v4/projects/${projectId}/pipelines/${pipe.id}/jobs`, token);
		const jobsWithLogs = await Promise.all(jobs.map(async (job) => {
			const logs = await fetchGitlab(`https://gitlab.com/api/v4/projects/${projectId}/jobs/${job.id}/trace`, token);
			return { name: job.name, status: job.status, logs };
		}));
		return { id: pipe.id, name: pipe.ref, status: pipe.status, jobs: jobsWithLogs };
	}));

	return { platform: 'gitlab', runs };
}

async function fetchPipelineLogs(platform, repoUrl, token, limit = 5) {
	if (platform === 'github') {
		return handleGithub(repoUrl, token, limit);
	}
	else if (platform === 'gitlab') {
		return handleGitlab(repoUrl, token, limit);
	}
	throw new Error('Plateforme non supportée');
}

module.exports = { fetchPipelineLogs };