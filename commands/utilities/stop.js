const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const radioPlayers = global.radioPlayers ??= new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Quit voice chat.'),
    async execute(interaction) {
        const state = radioPlayers.get(interaction.guildId);

        if (!state) {
            return interaction.reply({
                content: "❌ Nothing is playing.",
                flags: MessageFlags.Ephemeral,
            });
        }

        state.player.stop();
        state.connection.destroy();
        radioPlayers.delete(interaction.guildId);

        return interaction.reply("🛑 Stopped the radio.");
    }
}