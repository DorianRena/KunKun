import { execFile } from 'child_process';

export function runCommand(file, args) {
	return new Promise((resolve, reject) => {
		execFile(file, args, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr || stdout || error.message));
			}
			else {
				resolve(stdout.trim());
			}
		});
	});
}