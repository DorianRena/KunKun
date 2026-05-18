const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const path = require('node:path');
const fs = require('fs');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('reload')
		.setDescription('Reloads a command.')
		.addStringOption((option) => option.setName('command').setDescription('The command to reload.').setRequired(true)),
	async execute(interaction) {
		const commandName = interaction.options.getString('command', true).toLowerCase();
		const command = interaction.client.commands.get(commandName);
		if (!command) {
			return interaction.reply({ content: `There is no command with name \`${commandName}\`!`, flags: MessageFlags.Ephemeral });
		}

		try {
			// Chercher le fichier de commande dans tous les dossiers
			const commandFile = findCommandFile(commandName);
			if (!commandFile) {
				return interaction.reply({ content: `Impossible de trouver le fichier pour \`${commandName}\`!`, flags: MessageFlags.Ephemeral });
			}

			// Supprimer du cache et recharger
			delete require.cache[require.resolve(commandFile)];
			const newCommand = require(commandFile);
			interaction.client.commands.set(newCommand.data.name, newCommand);
			await interaction.reply({ content: `Command \`${newCommand.data.name}\` was reloaded!`, flags: MessageFlags.Ephemeral });
		}
		catch (error) {
			console.error(error);
			await interaction.reply({ content: `There was an error while reloading a command \`${commandName}\`:\n\`${error.message}\``, flags: MessageFlags.Ephemeral });
		}
	},
};

function findCommandFile(commandName) {
	const commandsPath = path.join(__dirname, '..'); // Remonte au dossier 'commands'
	const commandFolders = fs.readdirSync(commandsPath);

	for (const folder of commandFolders) {
		const folderPath = path.join(commandsPath, folder);
		if (!fs.statSync(folderPath).isDirectory()) continue;

		const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith('.js'));
		for (const file of commandFiles) {
			const filePath = path.join(folderPath, file);
			const command = require(filePath);
			if (command.data?.name === commandName) {
				return filePath;
			}
		}
	}
	return null;
}
