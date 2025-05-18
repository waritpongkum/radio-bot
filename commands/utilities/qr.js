const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

const defaultSize = 250;
const defaultMargin = 8;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("qr")
        .setDescription("Generate QRcode")
        .addStringOption(option =>
            option.setName("url")
                .setDescription("Link to generate QR")
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName("size")
                .setDescription(`QRcode size | Default: ${defaultSize}`)
                .setMaxValue(500)
                .setMinValue(50)
        )
        .addIntegerOption(option =>
            option.setName("margin")
                .setDescription(`QRcode margin | Default: ${defaultMargin}`)
                .setMaxValue(50)
                .setMinValue(0)
        ),
    async execute(interaction) {
        try {
            const url = interaction.options.getString("url");
            if (isValidUrl(url)) {
                const size = interaction.options.getInteger("size") || defaultSize;
                const margin = interaction.options.getInteger("margin") || defaultMargin;
                const attachment = new AttachmentBuilder(
                    `https://api.qrserver.com/v1/create-qr-code/?data=${url}&size=${size}x${size}&margin=${margin}`,
                    { name: 'qr.png' });

                await interaction.reply({
                    files: [attachment],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: "Invalid URL.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (error) {
            console.error('Error:', error);
            await interaction.reply('Failed to send image.');
        }
    }
}

function isValidUrl(str) {
    let url;
    try {
        url = new URL(str);
    } catch (_) {
        return false;
    }
    return true;
}