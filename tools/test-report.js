const Docker = require('dockerode');
const docker = new Docker();

async function test() {
	console.log('Démarrage du test...');

	// Simule une exécution
	const run = await docker.run(
		'eclipse-21-libreoffice:latest',
		['sh', '-c', 'echo "test" > /output/test.txt && ls -la /output'],
		process.stdout,
		{
			HostConfig: {
				Binds: [`${__dirname}/output:/output`],
				AutoRemove: true,
			},
		},
	);

	console.log('Exit code:', run[0].StatusCode);
}

test().catch(console.error);