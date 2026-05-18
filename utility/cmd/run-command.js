const { execFile } = require('child_process');

module.exports = {
	runCommand(file, args) {
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
	},
};