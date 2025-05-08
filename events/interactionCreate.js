const { Events, MessageFlags, EmbedBuilder } = require('discord.js');
const { createAudioResource } = require('@discordjs/voice');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}`);
                console.error(error);
            }
        } else if (interaction.isButton()) {
            const session = global.radioSessions.get(interaction.guildId);
            if (!session || !session.stations || session.stations.length === 0) {
                return interaction.update({
                    embeds: [new EmbedBuilder().setAuthor({ name: "❌ No radio session." })],
                    components: [],
                    flags: MessageFlags.Ephemeral
                });
            }

            let index = session.index;

            if (interaction.customId === 'next') {
                index = (index + 1) % session.stations.length;
            } else if (interaction.customId === 'prev') {
                index = (index - 1 + session.stations.length) % session.stations.length;
            } else if (interaction.customId === 'stop') {
                session.player.stop();
                session.connection.destroy();
                global.radioSessions.delete(interaction.guildId);
                return interaction.update({
                    embeds: [new EmbedBuilder().setAuthor({ name: `🛑 Stop Streaming ▸ ${truncate(session.stations[index].name)}`,}).setColor("#ff0000")],
                    components: [],
                })
            }

            session.index = index;
            const station = session.stations[index]
            playStream(session, station.url);

            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setAuthor({
                        name: `📻 Now Streaming ▸ ${truncate(station.name)}`,
                    })
                    .addFields(
                        {
                            name: "Country",
                            value: `${station.country}, ${station.countrycode}`,
                            inline: true
                        },
                        {
                            name: "Language",
                            value: `${station.language}`,
                            inline: true
                        },
                        {
                            name: "Votes",
                            value: `${station.votes}`,
                            inline: true
                        },
                        {
                            name: "Bitrate",
                            value: `${station.bitrate}`,
                            inline: true
                        },
                        {
                            name: "CODEC",
                            value: `${station.codec}`,
                            inline: true
                        },
                        {
                            name: "Homepage",
                            value: `[Click here!](${station.homepage || station.url})`,
                            inline: true
                        },
                    )
                    .setColor("#00ff00")],
                components: interaction.message.components,
            })
        }
    }
};

function playStream(session, url) {
    session.player.stop();
    const resource = createAudioResource(url, { inlineVolume: true });
    session.player.play(resource);

    session.player.on('error', error => {
        console.error('Player error:', error.message);
    });
}

function truncate(text, maxLength = 50) {
  return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
}