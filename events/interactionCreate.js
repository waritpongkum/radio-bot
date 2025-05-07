const { Events, MessageFlags } = require('discord.js');
const { createAudioResource } = require('@discordjs/voice');
const { radioSessions, createEmbed } = require('../commands/utilities/play')

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
            const session = radioSessions.get(interaction.guildId);
            if (!session) return interaction.reply({ content: '❌ No radio session.', flags: MessageFlags.Ephemeral });

            if (interaction.customId === 'next') {
                session.index = (session.index + 1) % session.stations.length;
            } else if (interaction.customId === 'previous') {
                session.index = (session.index - 1 + session.stations.length) % session.stations.length;
            } else if (interaction.customId === 'stop') {
                session.player.stop();
                interaction.guild.members.me.voice.disconnect();
                return interaction.update({context: "Goodbye", embeds: [], components: []});
            }

            const newStation = session.stations[session.index];
            session.player.stop();
            session.player.play(createAudioResource(newStation.url));

            await interaction.update({
                embeds: [createEmbed(session.stations[session.index], interaction.member.voice.channel)],
                components: interaction.message.components
            });
        }
    }
};