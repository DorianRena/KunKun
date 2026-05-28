const { ContainerBuilder } = require('discord.js');
const { colors } = require('../config');

const utils = {
	containerInfoMessage(title, message, accentColor = colors.log) {
		return new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(t => t.setContent(title))
			.addTextDisplayComponents(t => t.setContent(message));
	},
};

module.exports = utils;