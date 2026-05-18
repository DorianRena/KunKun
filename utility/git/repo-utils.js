/**
 * Utilities for repository URL handling
 */
module.exports = {
	/**
	 * Convert a GitHub repository URL to a safe Sonar project key.
	 * Examples:
	 *  - https://github.com/owner/repo.git -> github:owner/repo
	 *  - https://github.com/owner/repo -> github:owner/repo
	 */
	repoUrlToProjectKey(url, branch = null) {
		if (!url) return null;
		const cleaned = url.replace(/\.git$/i, '').replace(/\/$/, '');
		const m = cleaned.match(/github\.com[:/](.+?)\/(.+)$/i);
		if (!m) return `project_${Date.now()}`;
		const owner = m[1].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
		const repo = m[2].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
		return branch
			? `github:${owner}:${repo}:${branch}`
			: `github:${owner}:${repo}`;
	},
};

