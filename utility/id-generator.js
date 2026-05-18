module.exports = {
	uniqueId() {
		return `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
	},
};