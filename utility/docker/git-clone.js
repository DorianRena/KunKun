const { runCommand } = require('../cmd/run-command');
const { uniqueId } = require('../id-generator');

module.exports = {
	async gitClone(repoUrl, branch = null) {
		const id = uniqueId();
		try {
			console.log(`[Git][Clone] Cloning ${repoUrl} into docker volume ${id}`);
			console.log(`[Git][Clone] Creating docker volume ${id}`);
			await runCommand('docker', ['volume', 'create', id]);
			console.log(`[Git][Clone] Cloning into volume ${id} using temporary docker container`);
			const args = [
				'run',
				'--rm',
				'-v',
				`${id}:/repo`,
				'alpine/git',
				'clone',
			];
			if (branch) {
				args.push('-b', branch);
			}
			args.push(repoUrl, '/repo');
			await runCommand('docker', args);
			console.log(`[Git][Clone] Repository ${repoUrl} cloned into volume ${id}`);
			return id;
		}
		catch (err) {
			await runCommand('docker', ['volume', 'rm', '-f', id]);
			throw err;
		}
	},
};
