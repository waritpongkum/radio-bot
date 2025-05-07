const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const fetch = require('node-fetch');

const radioSessions = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play some thing from some radio station.')
        .addStringOption(option =>
            option
                .setName('name')
                .setDescription('Name of station'))
        .addStringOption(option =>
            option
                .setName('tags')
                .setDescription('Tags of station'))
        .addStringOption(option =>
            option
                .setName('country')
                .setDescription('Country of station'))
        .addStringOption(option =>
            option
                .setName('language')
                .setDescription('Language of station')),
    async execute(interaction) {

        const member = interaction.member;

        if (!member.voice.channel) return interaction.reply({ content: '❌ You need to be in a voice channel!', flags: MessageFlags.Ephemeral });

        const connection = joinVoiceChannel({
            channelId: member.voice.channel.id,
            guildId: member.guild.id,
            adapterCreator: member.guild.voiceAdapterCreator,
        });

        const name = encodeURIComponent(interaction.options.getString("name") ?? "")
        const tags = encodeURIComponent(interaction.options.getString("tags") ?? "")
        const country = encodeURIComponent(interaction.options.getString("country") ?? "")
        const language = encodeURIComponent(interaction.options.getString("language") ?? "")
        const limit = 100;

        let index = 0;

        const url = `https://de1.api.radio-browser.info/json/stations/search?name=${name}&tags=${tags}&country=${country}&language=${language}&limit=${limit}`;
        const res = await fetch(url);
        const stations = await res.json();

        if (!stations.length) {
            const embed = new EmbedBuilder()
                .setAuthor({
                    name: "❌ No stations found.",
                    iconURL: "https://images.icon-icons.com/196/PNG/128/radio_23683.png",
                })
                .setColor("#ff0000")
                .setTimestamp();

            return interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral,
            });
        }

        console.log(stations)

        const resource = createAudioResource(stations[index].url);
        const player = createAudioPlayer();
        connection.subscribe(player);
        player.play(resource);

        radioSessions.set(interaction.guildId, { stations, index, connection, player });

        player.on(AudioPlayerStatus.Idle, () => {
            connection.destroy();
            radioSessions.delete(interaction.guildId);
        });

        const next_button = new ButtonBuilder()
            .setCustomId('next')
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary);

        const previous_button = new ButtonBuilder()
            .setCustomId('previous')
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary);

        const stop_button = new ButtonBuilder()
            .setCustomId('stop')
            .setLabel('Stop')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder()
            .addComponents(previous_button, next_button, stop_button);

        await interaction.reply({ embeds: [createEmbed(stations[index % limit], member.voice.channel)], components: [row], withResponse: true });
    },
    radioSessions,
    createEmbed
};

function createEmbed(station, channel) {
    return new EmbedBuilder()
        .setAuthor({
            name: "Now Streaming",
            iconURL: "https://images.icon-icons.com/196/PNG/128/radio_23683.png",
        })
        .setDescription(`[\`${station.name}\`](${station.homepage || station.url})`)
        .addFields(
            {
                name: "Country",
                value: `\`${station.country}\``,
                inline: true
            },
            {
                name: "Language",
                value: `\`${station.language}\``,
                inline: true
            },
        )
        .setColor("#00ff00")
        .setFooter({
            text: `Streaming on ${channel.name}`,
        })
        .setTimestamp();
}