const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
    EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType,
    } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
} = require('@discordjs/voice');
const fetch = require("node-fetch");
const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Stream radio')
        .addStringOption(option =>
            option.setName('search')
                .setDescription("Search for a station name")
        )
        .addStringOption(option =>
            option.setName('tags')
                .setDescription("Filter stations by tags")
        )
        .addStringOption(option =>
            option.setName('country')
                .setDescription("Filter stations by country")
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription("Number of available stations in options (Default: 10)")
                .setMaxValue(100)
                .setMinValue(1)
        )
        .addStringOption(option =>
            option.setName('sortby')
                .setDescription("Sorting type")
                .setChoices(
                    { name: 'random', value: 'random' },
                    { name: 'name', value: 'name' },
                    { name: 'tags', value: 'tags' },
                    { name: 'country', value: 'country' },
                    { name: 'state', value: 'state' },
                    { name: 'votes', value: 'votes' },
                    { name: 'bitrate', value: 'bitrate' },
                    { name: 'clickcount', value: 'clickcount' },
                    { name: 'clicktrend', value: 'clicktrend' }
                )
        )
        .addStringOption(option =>
            option.setName('order')
                .setDescription("Sorting order")
                .setChoices(
                    { name: 'Ascending', value: 'false' },
                    { name: 'Descending', value: 'true' },
                )
        ),
    async execute(interaction) {

        await interaction.deferReply();

        const channel = interaction.member.voice.channel;

        if (!channel) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ You are not in a voice chat." })],
                flags: MessageFlags.Ephemeral
            });
        }
        const botChannel = interaction.guild.members.me.voice.channel;
        if (botChannel && channel !== botChannel) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ I am streaming in another voice chat." })],
                flags: MessageFlags.Ephemeral
            });
        }
        if (!channel.joinable) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ I do not have permission to connect to the voice chat." })],
                flags: MessageFlags.Ephemeral
            });
        }
        if (!channel.speakable) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ I do not have permission to speak in the voice chat." })],
                flags: MessageFlags.Ephemeral
            });
        }
        const query = interaction.options.getString('search') || '';
        const tags = interaction.options.getString('tags') || '';
        const countrycode = interaction.options.getString('country') || '';
        const limit = interaction.options.getInteger('limit') || 10;
        const order = interaction.options.getString('sortby') || '';
        const reverse = interaction.options.getString('order') || ''

        const url = `https://de1.api.radio-browser.info/json/stations/search?name=${encodeURIComponent(query)}&tags=${encodeURIComponent(tags)}&countrycode=${countrycode}&limit=${limit}&order=${order}&reverse=${reverse}`;

        let stations;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);

            stations = await response.json();
        } catch (error) {
            console.error("Fetch failed:", error.message);
        }

        if (!stations || stations.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setAuthor({ name: "❌ No stations found." })],
                flags: MessageFlags.Ephemeral
            });
        }

        const options = stations.map(station =>
            new StringSelectMenuOptionBuilder()
                .setLabel(truncate(station.name))
                .setValue(station.stationuuid)
        );

        const p_limit = 10;
        let p_idx = 0;

        const subStations = chunkArray(stations, p_limit)

        const pages = chunkArray(options, p_limit)

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        const player = createAudioPlayer();
        const resource = createAudioResource(stations[0].url);
        connection.subscribe(player);
        player.play(resource)

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('station-select')
            .setPlaceholder(`Pick a station - Page ${p_idx + 1}/${pages.length}`)
            .setOptions(pages[p_idx]);

        const prev_but = new ButtonBuilder().setCustomId('prev').setLabel("Previous page").setStyle(ButtonStyle.Secondary);
        const next_but = new ButtonBuilder().setCustomId('next').setLabel("Next page").setStyle(ButtonStyle.Secondary);
        const stop_but = new ButtonBuilder().setCustomId('stop').setLabel("Stop").setStyle(ButtonStyle.Danger);

        const f_page_row = new ActionRowBuilder().setComponents(next_but, stop_but);
        const m_page_row = new ActionRowBuilder().setComponents(prev_but, next_but, stop_but);
        const l_page_row = new ActionRowBuilder().setComponents(prev_but, stop_but);

        let row = (pages.length > 1) ? f_page_row : new ActionRowBuilder().setComponents(stop_but)

        const response = await interaction.editReply({
            embeds: [createEmbed(stations[0], interaction.member)],
            components: [new ActionRowBuilder().setComponents(selectMenu), row],
            withResponse: true,
        });

        console.log(channel.members);

        const selectMenuCollector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect });

        selectMenuCollector.on('collect', async i => {
            const station = subStations[p_idx].find(s => s.stationuuid === i.values[0]);
            player.stop();
            const resource = createAudioResource(station.url);
            player.play(resource);

            await i.update({
                embeds: [createEmbed(station, i.member)],
            });
        });

        const buttonCollector = response.createMessageComponentCollector({
            componentType: ComponentType.Button
        });

        buttonCollector.on('collect', async i => {
            if (i.customId === 'next' && p_idx < pages.length) {
                p_idx += 1
                selectMenu.setPlaceholder(`Pick a station - Page ${p_idx + 1}/${pages.length}`).setOptions(pages[p_idx]);
                row = (p_idx >= pages.length - 1) ? l_page_row : m_page_row;
                await i.update({
                    components: [new ActionRowBuilder().setComponents(selectMenu), row]
                })
            } else if (i.customId === 'prev' && p_idx > 0) {
                p_idx -= 1
                selectMenu.setPlaceholder(`Pick a station - Page ${p_idx + 1}/${pages.length}`).setOptions(pages[p_idx]);
                row = (p_idx <= 0) ? f_page_row : m_page_row;
                await i.update({
                    components: [new ActionRowBuilder().setComponents(selectMenu), row]
                })
            } else if (i.customId === 'stop') {
                player.stop(true);
                player.removeAllListeners();
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
                await i.update({
                    embeds: [new EmbedBuilder()
                        .setAuthor({ name: "🛑 Stop streaming!" }).setColor("#ff0000")],
                    components: [],
                });
                selectMenuCollector.stop();
                buttonCollector.stop();
            }
        });

        connection.on('stateChange', async (oldState, newState) => {
            if (newState.status === VoiceConnectionStatus.Disconnected) {
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setAuthor({ name: "🚫 Disconnected from voice chat!" }).setColor("#ff0000")],
                    components: [],
                });
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) connection.destroy();
                selectMenuCollector.stop();
                buttonCollector.stop();
            }
        });
    },

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        const allCountries = countries.getNames('en');

        const filtered = Object.entries(allCountries)
            .filter(([code, name]) =>
                name.toLowerCase().startsWith(focused.toLowerCase())
            )
            .slice(0, 25)
            .map(([code, name]) => ({
                name: name,
                value: code,
            }));

        await interaction.respond(filtered);
    }
};

function createEmbed(station, member) {
    return new EmbedBuilder()
        .setAuthor({
            name: `Now Streaming ▸ ${truncate(station.name)}`,
            iconURL: "https://cdn.discordapp.com/emojis/1370396961336983593.gif"
        })
        .addFields(
            {
                name: "Country",
                value: `${station.country} ${station.countrycode}`,
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
        .setFooter({
            text: member.user.tag,
            iconURL: member.user.displayAvatarURL(),
        })
        .setTimestamp();
}

function chunkArray(array, size = 25) {
    return Array.from({ length: Math.ceil(array.length / size) }, (_, i) =>
        array.slice(i * size, i * size + size)
    );
}

function truncate(text, maxLength = 50) {
    return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
}