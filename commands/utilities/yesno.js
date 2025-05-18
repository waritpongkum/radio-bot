const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require('node-fetch');

module.exports = {
    data: new SlashCommandBuilder()
        .setName("yesno")
        .setDescription("Send Yes or No gif."),
    async execute(interaction) {
        await interaction.deferReply();
        const url = "https://yesno.wtf/api"
        let gif;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            gif = await response.json();
        } catch (error) {
            console.error("Fetch failed:", error.message);
        }
        const attachment = new AttachmentBuilder(gif.image);
        await interaction.editReply({ files: [attachment] });
    }
}