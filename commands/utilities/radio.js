const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType } = require('discord.js');
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

        const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&limit=${limit}&order=${random}`;

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

        stations = stations.slice(0, 5);

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });
        const player = createAudioPlayer();
        const resource = createAudioResource(stations[0].url);
        connection.subscribe(player);
        player.play(resource)

        const options = stations.map(station =>
            new StringSelectMenuOptionBuilder()
                .setLabel(station.name)
                .setValue(station.stationuuid)
        );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('station-select')
            .setPlaceholder('Pick a station')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger),
        );

        const response = await interaction.reply({
            embeds: [createEmbed(stations[0])],
            components: [new ActionRowBuilder().addComponents(selectMenu), row],
            withResponse: true,
        });

        const collector = response.resource.message.createMessageComponentCollector({ componentType: ComponentType.StringSelect });

        collector.on('collect', async i => {
            const station = stations.find(s => s.stationuuid === i.values[0]);
            player.stop();
            const resource = createAudioResource(station.url);
            player.play(resource);

            await i.update({
                embeds: [createEmbed(station)],
                components: [new ActionRowBuilder().addComponents(selectMenu), row]
            });
        });

        const buttonCollector = response.resource.message.createMessageComponentCollector({
            componentType: ComponentType.Button
        });

        buttonCollector.on('collect', async i => {
            if (i.customId === 'stop') {
                player.stop(true);
                player.removeAllListeners();
                connection.destroy();

                await i.update({
                    embeds: [new EmbedBuilder().setAuthor({name: `🛑 Stop streaming!`}).setColor("#ff0000")],
                    components: []
                });

                collector.stop();
                buttonCollector.stop();
            }
        });


    },
};

function createEmbed(station) {
    return new EmbedBuilder()
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
}

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