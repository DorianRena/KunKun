const { EndBehaviorType } = require('@discordjs/voice');
const { OpusEncoder } = require('@discordjs/opus');

class VoiceTranscriptor {

	constructor(Client, data, connection) {

		this.receiver = connection.receiver;
		this.speakers = new Set();

		this.receiver.speaking.removeAllListeners();

		this.receiver.speaking.on('start', userId => {
			this.#listen(Client, data, userId);
		});
	}

	async #listen(Client, data, userId) {
		const { channel, guild } = data;

		const subscription = this.receiver.subscribe(userId, {
			end: {
				behavior: EndBehaviorType.AfterSilence,
				duration: 100,
			},
		});

		const encoder = new OpusEncoder(48000, 2);

		subscription.on('data', chunk => {

			const pcm = encoder.decode(chunk);

			console.log(`🎤 Audio reçu de ${userId}`, pcm.length);
		});

		subscription.once('end', async () => {
			console.log(`✅ FINAL ${userId}: voice ended`);
		});
	}
}

module.exports = VoiceTranscriptor;