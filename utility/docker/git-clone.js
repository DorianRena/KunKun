const { uniqueId } = require('../id-generator');
const Docker = require('dockerode');
const { devNull, stderrStream } = require('./utility');

const docker = new Docker();

module.exports = {
	async gitClone(repoUrl, branch = null) {
		const id = uniqueId();
		console.log(`[Git][Clone] Cloning ${repoUrl} into docker volume ${id}`);
		try {
			console.log(`[Git][Clone] Creating docker volume ${id}`);
			await docker.createVolume({ Name: id });

			console.log(`[Git][Clone] Cloning into volume ${id} using temporary docker container`);
			const cmd = [
				'-c', 'core.askPass=echo',
				'-c', 'credential.helper=',
				'clone',
				'--depth', '1',
			];
			if (branch) {
				cmd.push('-b', branch);
			}
			cmd.push(repoUrl, '/repo');

			const run = docker.run(
				'alpine/git',
				cmd,
				[devNull(), stderrStream()],
				{
					HostConfig: {
						Binds: [`${id}:/repo`],
						AutoRemove: true,
					},
					Tty: false,
				},
			);
			const result = await Promise.race([
				run,
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Git clone timeout')), 180000),
				),
			]);

			const statusCode = result[0].StatusCode;
			if (statusCode !== 0) {
				throw new Error(`Git clone exited with code ${statusCode}`);
			}

			console.log(`[Git][Clone] Repository ${repoUrl} cloned into volume ${id}`);
			return id;
		}
		catch (err) {
			console.error(`[Git][Clone] Error cloning ${repoUrl}:`, err.message);
			try {
				await new Promise(resolve => setTimeout(resolve, 2000));
				const volume = docker.getVolume(id);
				await volume.remove({ force: true });
			}
			catch (removeErr) {
				console.warn(`[Git][Clone] Could not remove volume ${id}:`, removeErr.message);
			}
			throw err;
		}
	},
};