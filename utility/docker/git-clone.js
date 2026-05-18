import { runCommand } from '../cmd/run-command';
import { uniqueId } from '../id-generator';

export async function gitClone(repoUrl) {
	const id = uniqueId();
	try {
		console.log(`[Git][Clone] Cloning ${repoUrl} into docker volume ${id}`);
		console.log(`[Git][Clone] Creating docker volume ${id}`);
		await runCommand('docker', ['volume', 'create', id]);
		console.log(`[Git][Clone] Cloning into volume ${id} using temporary docker container`);
		await runCommand('docker', ['run', '--rm', '-v', `${id}:/repo`, 'alpine/git', 'clone', repoUrl, '/repo']);
		console.log(`[Git][Clone] Repository ${repoUrl} cloned into volume ${id}`);
		return id;
	}
	catch (err) {
		await runCommand('docker', ['volume', 'rm', '-f', id]);
		throw err;
	}

}
