module.exports = {
	repoUrlToProjectKey(url, branch = null) {
		if (!url) return null;

		const cleaned = url.replace(/\.git$/i, '').replace(/\/$/, '');

		// Regex capturant le domaine, l'owner et le repo
		const m = cleaned.match(/(github|gitlab)\.com[:/](.+?)\/(.+)$/i);

		if (!m) return `project_${Date.now()}`;

		const provider = m[1].toLowerCase();
		const owner = m[2].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
		const repo = m[3].toLowerCase().replace(/[^a-z0-9_-]/g, '_');

		const baseKey = `${provider}:${owner}:${repo}`;

		return branch
			? `${baseKey}:${branch}`
			: baseKey;
	},
};