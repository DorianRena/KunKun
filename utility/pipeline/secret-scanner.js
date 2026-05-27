// Patterns de secrets courants dans les logs
const SECRET_PATTERNS = [
	{ name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
	{ name: 'AWS Secret Key', regex: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g },
	{ name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/g },
	{ name: 'GitLab Token', regex: /glpat-[A-Za-z0-9-]{20}/g },
	{ name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g },
	{ name: 'Generic Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi },
	{ name: 'Generic Token', regex: /(?:token|api_key|apikey|secret)\s*[:=]\s*[A-Za-z0-9\-_]{8,}/gi },
	{ name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g },
	{ name: 'Basic Auth', regex: /Basic\s+[A-Za-z0-9+/]+=*/g },
	{ name: 'Slack Token', regex: /xox[baprs]-[A-Za-z0-9-]+/g },
	{ name: 'Stripe Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g },
	{ name: 'Discord Token', regex: /[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}/g },
	{ name: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/g },
	{ name: 'Twilio Key', regex: /SK[0-9a-fA-F]{32}/g },
	{ name: 'SendGrid Key', regex: /SG\.[A-Za-z0-9\-_]{22,}\.[A-Za-z0-9\-_]{43,}/g },
	{ name: 'NPM Token', regex: /npm_[A-Za-z0-9]{36}/g },
	{ name: 'JWT', regex: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_.+/]*/g },
];

// Lignes de contexte affichées avant et après la ligne incriminée
const CONTEXT_LINES = 2;

/**
 * Masque la valeur d'un secret détecté : garde les 6 premiers caractères.
 * @param {string} raw
 * @returns {string}
 */
function redact(raw) {
	if (raw.length <= 6) return '***';
	return raw.slice(0, 6) + '***';
}

/**
 * Retourne les lignes de contexte autour d'un index donné.
 * @param {string[]} lines
 * @param {number}   index  Index 0-based
 * @param {number}   n      Nombre de lignes de part et d'autre
 * @returns {{ before: string[], after: string[] }}
 */
function getContext(lines, index, n = CONTEXT_LINES) {
	const before = lines
		.slice(Math.max(0, index - n), index)
		.map((l) => l.trimEnd());
	const after = lines
		.slice(index + 1, Math.min(lines.length, index + n + 1))
		.map((l) => l.trimEnd());
	return { before, after };
}

/**
 * Déduplique les findings identiques (même run / job / ligne / type).
 * Utile quand plusieurs patterns matchent le même token.
 * @param {object[]} findings
 * @returns {object[]}
 */
function deduplicate(findings) {
	const seen = new Set();
	return findings.filter((f) => {
		const key = `${f.runId}|${f.jobId}|${f.line}|${f.secretType}|${f.preview}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Scanne les logs de pipeline pour y trouver des secrets.
 *
 * @param {{
 *   platform: string,
 *   repoUrl?: string,
 *   runs: Array<{
 *     id: string|number,
 *     name: string,
 *     status: string,
 *     branch?: string,
 *     commitSha?: string,
 *     commitMessage?: string,
 *     triggeredBy?: string,
 *     createdAt?: string,
 *     updatedAt?: string,
 *     runUrl?: string,
 *     jobs: Array<{
 *       id: string|number,
 *       name: string,
 *       status: string,
 *       stage?: string,
 *       startedAt?: string,
 *       completedAt?: string,
 *       logs: string,
 *     }>
 *   }>
 * }} pipelineData
 *
 * @returns {{
 *   findings: object[],
 *   stats: object,
 * }}
 */
function scanPipelineLogs(pipelineData) {
	const rawFindings = [];

	for (const run of pipelineData.runs) {
		for (const job of run.jobs) {
			const lines = (job.logs || '').split('\n');

			lines.forEach((line, index) => {
				for (const pattern of SECRET_PATTERNS) {
					// Réinitialise lastIndex pour éviter les faux-négatifs avec /g
					pattern.regex.lastIndex = 0;
					const matches = [...line.matchAll(pattern.regex)];

					for (const match of matches) {
						const { before, after } = getContext(lines, index);

						rawFindings.push({
							// ── Identification du secret ──────────────────────
							secretType:    pattern.name,
							preview:       redact(match[0]),

							// ── Localisation dans les logs ────────────────────
							line:          index + 1,
							lineContent:   line.trimEnd(),
							context:       { before, after },

							// ── Infos du job ──────────────────────────────────
							jobId:         job.id ?? null,
							jobName:       job.name,
							jobStatus:     job.status ?? null,
							jobStage:      job.stage ?? null,
							jobStartedAt:  job.startedAt ?? null,
							jobEndedAt:    job.completedAt ?? job.finishedAt ?? null,

							// ── Infos du run / pipeline ───────────────────────
							runId:         run.id ?? null,
							runName:       run.name,
							runStatus:     run.status ?? null,
							runUrl:        run.runUrl ?? null,
							branch:        run.branch ?? null,
							commitSha:     run.commitSha ?? null,
							commitMessage: run.commitMessage ?? null,
							triggeredBy:   run.triggeredBy ?? null,
							createdAt:     run.createdAt ?? null,
							updatedAt:     run.updatedAt ?? null,

							// ── Infos plateforme ──────────────────────────────
							platform:      pipelineData.platform,
							repoUrl:       pipelineData.repoUrl ?? null,
						});
					}
				}
			});
		}
	}

	const findings = deduplicate(rawFindings);

	// Regroupement par type pour les stats
	const byType = findings.reduce((acc, f) => {
		acc[f.secretType] = (acc[f.secretType] ?? 0) + 1;
		return acc;
	}, {});

	// Runs / jobs uniques ayant au moins un secret
	const affectedRuns = new Set(findings.map((f) => f.runId)).size;
	const affectedJobs = new Set(findings.map((f) => `${f.runId}|${f.jobId}`)).size;

	return {
		findings,
		stats: {
			platform:     pipelineData.platform,
			runsScanned:  pipelineData.runs.length,
			jobsScanned:  pipelineData.runs.reduce((acc, r) => acc + r.jobs.length, 0),
			secretsFound: findings.length,
			affectedRuns,
			affectedJobs,
			byType,
		},
	};
}

module.exports = { scanPipelineLogs };