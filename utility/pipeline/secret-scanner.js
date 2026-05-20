// Patterns de secrets courants dans les logs
const SECRET_PATTERNS = [
	{ name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
	{ name: 'AWS Secret Key', regex: /(?<![A-Za-z0-9])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
	{ name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
	{ name: 'GitLab Token', regex: /glpat-[A-Za-z0-9-]{20}/g },
	{ name: 'Private Key', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
	{ name: 'Generic Password', regex: /(?i:password|passwd|pwd)\s*[:=]\s*\S+/g },
	{ name: 'Generic Token', regex: /(?i:token|api_key|apikey|secret)\s*[:=]\s*[A-Za-z0-9-]{8,}/g },
	{ name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g },
	{ name: 'Basic Auth', regex: /Basic\s+[A-Za-z0-9+/]+=*/g },
	{ name: 'Slack Token', regex: /xox[baprs]-[A-Za-z0-9-]+/g },
	{ name: 'Stripe Key', regex: /sk_(live|test)_[A-Za-z0-9]{24,}/g },
	{ name: 'Discord Token', regex: /[MN][A-Za-z0-9]{23}\.[A-Za-z0-9\-_]{6}\.[A-Za-z0-9\-_]{27}/g },
];

/**
 * Scanne les logs de pipeline pour y trouver des secrets
 * @param {{ platform: string, runs: object[] }} pipelineData
 * @returns {{ findings: object[], stats: object }}
 */
function scanPipelineLogs(pipelineData) {
	const findings = [];

	for (const run of pipelineData.runs) {
		for (const job of run.jobs) {
			for (const pattern of SECRET_PATTERNS) {
				const matches = [...(job.logs.matchAll(pattern.regex) || [])];
				for (const match of matches) {
					findings.push({
						secretType: pattern.name,
						runName:    run.name,
						runId:      run.id,
						jobName:    job.name,
						// On masque la valeur pour ne pas la logger en clair
						preview:    match[0].slice(0, 6) + '***',
					});
				}
			}
		}
	}

	return {
		findings,
		stats: {
			runsScanned: pipelineData.runs.length,
			jobsScanned: pipelineData.runs.reduce((acc, r) => acc + r.jobs.length, 0),
			secretsFound: findings.length,
		},
	};
}

module.exports = { scanPipelineLogs };