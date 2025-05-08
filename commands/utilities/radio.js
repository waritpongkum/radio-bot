const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    entersState,
    VoiceConnectionStatus,
    AudioPlayerStatus,
} = require('@discordjs/voice');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Start radio with buttons')
        .addStringOption(option =>
            option.setName('search')
                .setDescription('Search for a station name')
                .setRequired(false)
        ),

    async execute(interaction) {
        const query = interaction.options.getString('search') || '';
        const channel = interaction.member.voice.channel;
        if (!channel)
            return interaction.reply({ content: '❌ Join a voice channel first.', flags: MessageFlags.Ephemeral });

        const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&limit=100`;

        let stations;
        try {
            const response = await fetch(url);
            stations = await response.json();
        } catch (err) {
            return interaction.reply({ content: '❌ Failed to fetch stations.', flags: MessageFlags.Ephemeral });
        }

        if (!stations || stations.length === 0) {
            return interaction.reply({ content: '❌ No stations found.', flags: MessageFlags.Ephemeral });
        }

        const index = 0;
        const session = await createOrGetRadioSession(interaction.guildId, channel);
        if (!session) {
            return interaction.reply({ content: '❌ Could not connect to VC.', flags: MessageFlags.Ephemeral });
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
                    name: `📻 Now Streaming ▸ ${station.name}`,
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
                        value: `[Click here!](${station.homepage})`,
                        inline: true
                    },
                )
                .setImage("https://external-content.duckduckgo.com/ssv2/?scale=1&lang=en-US&colorScheme=dark&format=png&size=640x200&spn=0.009%2C0.0099&center=24.3204%2C73.0872&annotations=%5B%7B%22point%22%3A%2224.3204%2C73.0872%22%2C%22color%22%3A%2266ABFF%22%7D%5D")
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

    session.player.once(AudioPlayerStatus.Playing, () => {
        console.log('Now streaming:', url);
    });

    session.player.on('error', error => {
        console.error('Player error:', error.message);
    });
}
