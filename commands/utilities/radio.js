const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    VoiceConnectionStatus,
} = require('@discordjs/voice');
const fetch = require("node-fetch");
module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Start radio with buttons')
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search for a station name')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Number of available stations in queue (Default: 10)')
                .setMaxValue(100)
                .setMinValue(1)
        )
        .addBooleanOption(option =>
            option.setName('random')
                .setDescription('Ramdom radio station')
        ),
    async execute(interaction) {

        const channel = interaction.member.voice.channel;
        if (!channel)
            return interaction.reply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ You are not in a voice chat." })],
                flags: MessageFlags.Ephemeral
            });

        const query = interaction.options.getString('search') || '';
        const limit = interaction.options.getInteger('limit') || 10;
        const random = interaction.options.getBoolean('random') ? 'random' : '';

        const url = `https://de2.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&limit=${limit}&order=${random}`;

        let stations;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);

            stations = await response.json();
        } catch (error) {
            console.error("Fetch failed:", error.message);
        }

        if (!stations || stations.length === 0) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ No stations found." })],
                flags: MessageFlags.Ephemeral
            });
        }

        const index = 0;
        const session = await createOrGetRadioSession(interaction.guildId, channel);
        if (!session) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ Could not connect to voice chat." })],
                flags: MessageFlags.Ephemeral
            });
        }

        session.stations = stations;
        session.index = index;

        playStream(session, stations[index].url);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('⏮️ Previous').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('next').setLabel('⏭️ Next').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
        );

        const station = stations[index];

        await interaction.reply({
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
                .setColor("#00ff00")
            ],
            components: [row],
        });
    },
};

async function createOrGetRadioSession(guildId, channel) {
    let session = global.radioSessions.get(guildId);

    if (!session) {
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (err) {
            connection.destroy();
            return null;
        }

        const player = createAudioPlayer();
        connection.subscribe(player);
        session = { connection, player, stations: [], index: 0 };
        global.radioSessions.set(guildId, session);
    }

    return session;
}

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