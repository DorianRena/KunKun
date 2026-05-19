module.exports = {
	validateRepoUrl(url) {
		if (!url || typeof url !== 'string') {
			return { isValid: false, normalized: null, platform: null, error: 'URL manquante ou invalide' };
		}
		// Nettoyer l'URL
		let normalized = url.trim().toLowerCase();

		// Retirer le .git final si présent
		normalized = normalized.replace(/\.git$/, '');

		// Retirer le slash final si présent
		normalized = normalized.replace(/\/$/, '');
		// Patterns pour GitHub et GitLab
		const patterns = [
			{
				platform: 'github',
				regex: /^https:\/\/github\.com\/(?<owner>[\w.-]+)\/(?<repo>[\w.-]+)$/,
			},
			{
				platform: 'gitlab',
				regex: /^https:\/\/gitlab\.com\/(?<owner>[\w.-]+(?:\/[\w.-]+)*)\/(?<repo>[\w.-]+)$/,
			},
		];
		for (const { platform, regex } of patterns) {
			const match = normalized.match(regex);
			if (match) {
				const { owner, repo } = match.groups;

				// Vérifications supplémentaires
				if (owner.startsWith('.') || owner.startsWith('-') || repo.startsWith('.') || repo.startsWith('-')) {
					return { isValid: false, normalized: null, platform: null, error: 'Le nom du propriétaire ou du dépôt ne peut pas commencer par "." ou "-"' };
				}

				if (owner.length > 100 || repo.length > 100) {
					return { isValid: false, normalized: null, platform: null, error: 'Nom du propriétaire ou du dépôt trop long' };
				}
				return { isValid: true, normalized, platform, error: null };
			}
		}
		return {
			isValid: false,
			normalized: null,
			platform: null,
			error: 'URL invalide. Formats acceptés :\n• GitHub - `https://github.com/owner/repo`\n• GitLab - `https://gitlab.com/owner/repo`',
		};
	},
	validateBranch(branch) {
		if (!branch) {
			return { isValid: true, error: null };
		}

		// Règles Git pour les noms de branches
		const invalidPatterns = [
			/^\./,
			/\.\.$/,
			/\.lock$/,
			/\/\./,
			/\.\./,
			/[\u007F~^:?*[\\]/,
			/@\{/,
			/^@$/,
			/\/$/,
			/^\//,
			/\/\//,
		];

		if (branch.length > 255) {
			return { isValid: false, error: 'Nom de branche trop long (max 255 caractères)' };
		}

		for (const pattern of invalidPatterns) {
			if (pattern.test(branch)) {
				return { isValid: false, error: 'Nom de branche invalide selon les règles Git' };
			}
		}

		// Pattern positif : caractères autorisés
		if (!/^[\w./-]+$/.test(branch)) {
			return { isValid: false, error: 'Nom de branche contient des caractères non autorisés' };
		}

		return { isValid: true, error: null };
	},
};

