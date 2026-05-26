const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	AttachmentBuilder,
	ComponentType,
	MessageFlags,
} = require('discord.js');
const Docker = require('dockerode');

const docker = new Docker();
const COLLECTOR_TIMEOUT_MS = 5 * 60 * 1000;

// Lit le PDF depuis le volume Docker et renvoie un Buffer.
// On liste d'abord les fichiers pour trouver le PDF réel, puis on le lit.
const readPdfFromVolume = async (volumeName, filename) => {
	// Étape 1 : vérification que le fichier existe bien (ls pour débug)
	const lsContainer = await docker.createContainer({
		Image: 'alpine:latest',
		Cmd: ['ls', '-la', '/output'],
		AttachStdout: true,
		AttachStderr: true,
		HostConfig: { Binds: [`${volumeName}:/output:ro`] },
	});
	const lsStream = await lsContainer.attach({ stream: true, stdout: true, stderr: true });
	const lsChunks = [];
	lsStream.on('data', chunk => lsChunks.push(chunk));
	await lsContainer.start();
	await lsContainer.wait();
	await lsContainer.remove();
	console.log(`[Sonar][Report] Volume contents:\n${Buffer.concat(lsChunks).toString()}`);

	// Étape 2 : lecture du PDF — on passe le filename via variable d'env
	// pour éviter tout problème de quoting sur les noms avec espaces/tirets/points
	const container = await docker.createContainer({
		Image: 'alpine:latest',
		Cmd: ['sh', '-c', 'cat "/output/$PDF_FILENAME"'],
		Env: [`PDF_FILENAME=${filename}`],
		AttachStdout: true,
		AttachStderr: true,
		HostConfig: { Binds: [`${volumeName}:/output:ro`] },
	});

	const stream = await container.attach({ stream: true, stdout: true, stderr: true });
	const chunks = [];
	stream.on('data', chunk => chunks.push(chunk));

	await container.start();
	const exit = await container.wait();
	await container.remove();

	if (exit.StatusCode !== 0) {
		throw new Error(`Failed to read PDF from volume (exit ${exit.StatusCode})`);
	}

	// Démultiplexage Docker (header 8 bytes, type 1 = stdout)
	const raw = Buffer.concat(chunks);
	const stdoutParts = [];
	let offset = 0;
	while (offset + 8 <= raw.length) {
		const type = raw[offset];
		const size = raw.readUInt32BE(offset + 4);
		offset += 8;
		if (type === 1) stdoutParts.push(raw.slice(offset, offset + size));
		offset += size;
	}

	const buffer = Buffer.concat(stdoutParts);
	if (buffer.length === 0) throw new Error('PDF buffer is empty after demuxing');
	return buffer;
};

const removeVolume = async (volumeName) => {
	try {
		await docker.getVolume(volumeName).remove();
		console.log(`[Sonar][Report] Temporary volume removed: ${volumeName}`);
	}
	catch (err) {
		console.error(`[Sonar][Report] Failed to remove temporary volume: ${err.message}`);
	}
};

/**
 * Envoie le message final avec les embeds + un bouton de téléchargement PDF.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{ volumeName: string, filename: string }} report
 * @param {import('discord.js').EmbedBuilder[]} embeds
 */
async function sendWithPdfButton(interaction, report, embeds = []) {
	const button = new ButtonBuilder()
		.setCustomId('download_pdf_report')
		.setLabel('📄 Télécharger le rapport PDF')
		.setStyle(ButtonStyle.Primary);

	const row = new ActionRowBuilder().addComponents(button);

	await interaction.editReply({ content: '', embeds, components: [row] });

	const message = await interaction.fetchReply();

	const collector = message.createMessageComponentCollector({
		componentType: ComponentType.Button,
		filter: (i) => i.customId === 'download_pdf_report',
		time: COLLECTOR_TIMEOUT_MS,
	});

	collector.on('collect', async (buttonInteraction) => {
		try {
			const pdfBuffer = await readPdfFromVolume(report.volumeName, report.filename);
			const attachment = new AttachmentBuilder(pdfBuffer, { name: report.filename });

			await buttonInteraction.reply({
				content: `📄 Voici votre rapport : **${report.filename}**`,
				files: [attachment],
				flags: MessageFlags.Ephemeral,
			});
		}
		catch (err) {
			console.error('[Sonar][Report] Failed to serve PDF on button click:', err.message);
			await buttonInteraction.reply({
				content: '❌ Impossible de lire le rapport PDF. Il a peut-être expiré.',
				flags: MessageFlags.Ephemeral,
			});
		}
	});

	collector.on('end', async () => {
		await removeVolume(report.volumeName);

		const disabledButton = ButtonBuilder.from(button).setDisabled(true);
		const disabledRow = new ActionRowBuilder().addComponents(disabledButton);
		try {
			await interaction.editReply({ components: [disabledRow] });
		}
		catch {
			// Message supprimé ou interaction expirée
		}
	});
}

module.exports = { sendWithPdfButton };