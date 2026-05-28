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
	if (!res.ok) throw new Error(`GitHub API error ${res.status}: ${url}`);
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
	if (!res.ok) throw new Error(`GitLab API error ${res.status}: ${url}`);
	return res.headers.get('content-type')?.includes('application/json')
		? res.json() : res.text();
}

// --- GitHub ---
async function handleGithub(repoUrl, token, limit) {
	const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (!match) throw new Error(`URL GitHub invalide : ${repoUrl}`);
	const owner = match[1];
	const repo = match[2];
	const base = `https://api.github.com/repos/${owner}/${repo}`;

	const runsData = await fetchGithub(`${base}/actions/runs?per_page=${limit}`, token);

	const runs = await Promise.all(
		runsData.workflow_runs.slice(0, limit).map(async (run) => {
			const jobsData = await fetchGithub(`${base}/actions/runs/${run.id}/jobs`, token);
			const jobsList = jobsData && jobsData.jobs ? jobsData.jobs : [];

			const jobs = await Promise.all(
				jobsList.map(async (job) => {
					const logs = await fetchGithub(`${base}/actions/jobs/${job.id}/logs`, token);
					return {
						id:          job.id,
						name:        job.name,
						status:      job.conclusion,
						startedAt:   job.started_at ?? null,
						completedAt: job.completed_at ?? null,
						logs:        logs || '(indisponible)',
					};
				}),
			);

			return {
				id:            run.id,
				name:          run.name,
				status:        run.conclusion,
				branch:        run.head_branch ?? null,
				commitSha:     run.head_sha ?? null,
				commitMessage: run.head_commit?.message?.split('\n')[0] ?? null,
				triggeredBy:   run.triggering_actor?.login ?? run.actor?.login ?? null,
				createdAt:     run.created_at ?? null,
				updatedAt:     run.updated_at ?? null,
				runUrl:        run.html_url ?? null,
				workflowName:  run.name ?? null,
				jobs,
			};
		}),
	);

	return { platform: 'github', repoUrl, runs };
}

// --- GitLab ---
async function handleGitlab(repoUrl, token, limit) {
	const projectId = encodeURIComponent(
		repoUrl.split('gitlab.com/')[1].replace(/\.git$/, ''),
	);
	const base = `https://gitlab.com/api/v4/projects/${projectId}`;

	const pipelines = await fetchGitlab(`${base}/pipelines?per_page=${limit}`, token);

	const runs = await Promise.all(
		pipelines.map(async (pipe) => {
			// Détails complets du pipeline (contient le commit, l'auteur, etc.)
			const detail = await fetchGitlab(`${base}/pipelines/${pipe.id}`, token);

			const jobs = await fetchGitlab(`${base}/pipelines/${pipe.id}/jobs`, token);

			const jobsWithLogs = await Promise.all(
				jobs.map(async (job) => {
					const logs = await fetchGitlab(`${base}/jobs/${job.id}/trace`, token);
					return {
						id:          job.id,
						name:        job.name,
						status:      job.status,
						startedAt:   job.started_at ?? null,
						finishedAt:  job.finished_at ?? null,
						stage:       job.stage ?? null,
						logs,
					};
				}),
			);

			return {
				id:            pipe.id,
				name:          pipe.ref,
				status:        pipe.status,
				branch:        detail.ref ?? null,
				commitSha:     detail.sha ?? null,
				commitMessage: detail.detailed_status?.text ?? null,
				triggeredBy:   detail.user?.username ?? null,
				createdAt:     detail.created_at ?? null,
				updatedAt:     detail.updated_at ?? null,
				runUrl:        detail.web_url ?? null,
				jobs:          jobsWithLogs,
			};
		}),
	);

	return { platform: 'gitlab', repoUrl, runs };
}

// --- Entrée publique ---
async function fetchPipelineLogs(platform, repoUrl, token, limit = 5) {
	if (platform === 'github') return handleGithub(repoUrl, token, limit);
	if (platform === 'gitlab') return handleGitlab(repoUrl, token, limit);
	throw new Error(`Plateforme non supportée : ${platform}`);
}

module.exports = { fetchPipelineLogs };