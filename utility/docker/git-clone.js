const { uniqueId } = require('../id-generator');
const Docker = require('dockerode');
const { devNull, stderrStream } = require('./utility');

const docker = new Docker();

module.exports = {
	async gitClone(repoUrl, branch = null) {
		const id = uniqueId();
		try {
			console.log(`[Git][Clone] Cloning ${repoUrl} into docker volume ${id}`);

			console.log(`[Git][Clone] Creating docker volume ${id}`);
			await docker.createVolume({ Name: id });

			console.log(`[Git][Clone] Cloning into volume ${id} using temporary docker container`);
			const cmd = ['clone'];
			if (branch) {
				cmd.push('-b', branch);
			}
			cmd.push(repoUrl, '/repo');

			const result = await docker.run(
				'alpine/git',
				cmd,
				[devNull(), stderrStream()],
				{
					HostConfig: {
						Binds: [`${id}:/repo`],
						AutoRemove: true,
					},
				},
			);

			const statusCode = result[0].StatusCode;
			if (statusCode !== 0) {
				throw new Error(`Git clone exited with code ${statusCode}`);
			}

			console.log(`[Git][Clone] Repository ${repoUrl} cloned into volume ${id}`);
			return id;
		}
		catch (err) {
			console.error(`[Git][Clone] Error cloning ${repoUrl}:`, err.message);
			const volume = docker.getVolume(id);
			await volume.remove({ force: true });
			throw err;
		}
	},
};