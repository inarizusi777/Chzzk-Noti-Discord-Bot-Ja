// Require the necessary discord.js classes
const { token, channelId, ownerId } = require('./config.json');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const fs = require('fs');
const schedule = require('node-schedule');
const axios = require('axios');

// Commands
const command_Help = require('./command/help');
const command_register = require('./command/register');
const command_ping = require('./command/ping');
const command_message_set = require('./command/message_set');

const util = require('./utils/util');
const db = require('./utils/db');




const wait = (timeToDelay) => new Promise((resolve) => setTimeout(resolve, timeToDelay))

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

// 1. Runs when the bot successfully connects to Discord.
client.once("ready", async (c) => {
    console.log(`${c.user.tag} is online.`);

    // Set the bot activity message.
    client.user.setActivity('Use /help for commands', { type: ActivityType.Playing });
    client.user.setStatus('online'); // Show the bot as online.

    // Initialize the database and migrate notification.json if it exists.
    try {
        await db.init();
        if (fs.existsSync('./notification.json')) {
            console.log("Found notification.json. Starting migration.");
            await db.migrateFromJson('./notification.json');
        }
    } catch (dbErr) {
        console.error("Database initialization/migration error:", dbErr);
    }

// 2. Register the scheduler after the bot is ready.
let isProcessing = false;

// Check one streamer and send notifications independently.
async function processStreamerUpdate(streamer) {

    const startTime = Date.now();
    try {
        // Check the latest community post.
        const contents = await util.getCommunityRecentlyInfo(streamer.id);
        if (contents.result === 200 && streamer.recent_community_id < contents.communityId) {
            const subscriptions = await db.getSubscriptionsForStreamer(streamer.id);

            // Provide fallback text when the post has no body.
            let description = contents.contents || "";
            if (description.trim() === "" && contents.img) {
                description = "This post contains an image. Click the button to view it.";
            } else if (description.length > 1500) {
                description = description.substring(0, 1500) + "... (Click the button to view the full post.)";
            }

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setAuthor({
                    name: contents.name,
                    iconURL: contents.profile,
                    url: `https://chzzk.naver.com/${streamer.id}`
                })
                .setTitle("New community post")
                .setURL(`https://chzzk.naver.com/${streamer.id}/community/detail/${contents.communityId}`)
                .setDescription(description || "This post has no text content.")
                .setImage(contents.img)
                .setTimestamp();
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('View community post')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`https://chzzk.naver.com/${streamer.id}/community/detail/${contents.communityId}`)
                );

            for (const sub of subscriptions) {
                if (sub.notify_type === 'live') continue;
                try {
                    const channel = await client.channels.fetch(sub.channel_id);
                    if (channel) {
                        let mentionStr = '';
                        if (sub.comm_mention_type === '@everyone') mentionStr = '@everyone ';
                        else if (sub.comm_mention_type === '@here') mentionStr = '@here ';
                        else if (sub.comm_mention_type === 'role' && sub.comm_mention_role_id) mentionStr = `<@&${sub.comm_mention_role_id}> `;

                        let msgContent = mentionStr.trim();
                        if (sub.comm_msg) {
                            msgContent = msgContent ? msgContent + ' ' + sub.comm_msg.replace(/{streamer}/g, contents.name) : sub.comm_msg.replace(/{streamer}/g, contents.name);
                        }

                        await channel.send({ content: msgContent || null, embeds: [embed], components: [row] });
                    }
                } catch (sendError) {
                    if (sendError.code === 10003) {
                        await db.removeSubscription(sub.channel_id, streamer.id);
                        await db.removeStreamerIfNoSubs(streamer.id);
                    }
                }
            }
            await db.updateStreamerCommunity(streamer.id, contents.communityId);
            util.importLog(`Community notification sent for ${streamer.name}`);
        }

        // Check for a live stream.
        const liveInfo = await util.getLiveInfo(streamer.id);
        if (liveInfo.result === 200 && liveInfo.status === "OPEN") {
            // Avoid duplicate notifications:
            // 1. On first detection, update the database without sending a notification.
            // 2. Notify only when the live ID is newer than the stored ID.
            if (!streamer.recent_live_id || streamer.recent_live_id === 0) {
                await db.updateStreamerLive(streamer.id, liveInfo.liveId);
                util.importLog(`Initialized live stream tracking for ${liveInfo.channelName} without sending a notification`);
            } else if (streamer.recent_live_id < liveInfo.liveId) {
                const subscriptions = await db.getSubscriptionsForStreamer(streamer.id);
                const liveEmbed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setAuthor({
                        name: liveInfo.channelName,
                        iconURL: liveInfo.channelProfile,
                        url: `https://chzzk.naver.com/live/${streamer.id}`
                    })
                    .setTitle(`[Live Now] ${liveInfo.liveTitle}`)
                    .setURL(`https://chzzk.naver.com/live/${streamer.id}`)
                    .setDescription(`Now streaming: ${liveInfo.liveCategoryValue || 'No category'}`)
                    .setImage(liveInfo.liveImageUrl ? liveInfo.liveImageUrl.replace('{type}', '1080') + "?v=" + Date.now() : null)
                    .setTimestamp();

                const liveRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setLabel('Watch stream')
                            .setStyle(ButtonStyle.Link)
                            .setURL(`https://chzzk.naver.com/live/${streamer.id}`)
                    );

                for (const sub of subscriptions) {
                    if (sub.notify_type === 'community') continue;
                    try {
                        const channel = await client.channels.fetch(sub.channel_id);
                        if (channel) {
                            let mentionStr = '';
                            if (sub.live_mention_type === '@everyone') mentionStr = '@everyone ';
                            else if (sub.live_mention_type === '@here') mentionStr = '@here ';
                            else if (sub.live_mention_type === 'role' && sub.live_mention_role_id) mentionStr = `<@&${sub.live_mention_role_id}> `;

                            let msgContent = mentionStr.trim();
                            if (sub.live_msg) {
                                msgContent = msgContent ? msgContent + ' ' + sub.live_msg.replace(/{streamer}/g, liveInfo.channelName) : sub.live_msg.replace(/{streamer}/g, liveInfo.channelName);
                            } else {
                                const defaultMsg = `${liveInfo.channelName} is now live!`;
                                msgContent = msgContent ? msgContent + ' ' + defaultMsg : defaultMsg;
                            }

                            await channel.send({ content: msgContent || null, embeds: [liveEmbed], components: [liveRow] });
                        }
                    } catch (sendError) {
                        if (sendError.code === 10003) {
                            await db.removeSubscription(sub.channel_id, streamer.id);
                            await db.removeStreamerIfNoSubs(streamer.id);
                        }
                    }
                }
                await db.updateStreamerLive(streamer.id, liveInfo.liveId);
                util.importLog(`Live notification sent for ${liveInfo.channelName}`);
            }
        }
    } catch (e) {
        console.error(`[${streamer.id}] Processing error:`, e.message);
    } finally {
        const duration = Date.now() - startTime;
        if (duration > 30000) { // Warn if processing takes longer than 30 seconds.
            console.warn(`[Warning] Streamer update for ${streamer.id} took ${duration}ms`);
        }
    }
}

// Register the scheduler.
const job = schedule.scheduleJob('0 * * * * *', async function () {
    if (isProcessing) return; // Skip if a previous run is still processing.
    isProcessing = true;

    try {
        const streamers = await db.getAllStreamers();
        const BATCH_SIZE = 5; // Number of streamers to process concurrently.

        for (let i = 0; i < streamers.length; i += BATCH_SIZE) {
            const batch = streamers.slice(i, i + BATCH_SIZE);
            
            // Process one batch concurrently.
            await Promise.all(batch.map(streamer => processStreamerUpdate(streamer)));
            
            // Pause between batches to avoid overloading the API.
            if (i + BATCH_SIZE < streamers.length) {
                await wait(1000); 
            }
        }
    } catch (err) {
        console.error("Scheduler error:", err);
    } finally {
        isProcessing = false;
    }
});
    console.log("Notification scheduler started successfully.");
});

// 3. Handle slash commands.
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;



    const { commandName } = interaction;
    util.importLog(`Slash command executed: ${interaction.user.tag} (${interaction.user.id}) -> /${commandName} (channel: ${interaction.channelId})`);

    try {
        switch (commandName) {
            case "help":
                await command_Help.SendMessage(interaction);
                break;
            case "list":
                await command_register.getList(interaction);
                break;
            case "register":
                const addInput = interaction.options.getString('streamer');
                await command_register.import(interaction, addInput);
                break;
            case "delete":
                const deleteInput = interaction.options.getString('streamer');
                await command_register.delete(interaction, deleteInput);
                break;
            case "set_notification":
                await command_message_set.execute(interaction);
                break;
            case "ping":
                await command_ping.execute(interaction);
                break;
            case "set_api":
                // Verify that the user is the bot owner.
                if (interaction.user.id !== ownerId) {
                    return await interaction.reply({ content: 'Only the bot owner can use this command.', ephemeral: true });
                }

                const type = interaction.options.getString('type');
                const newUrl = interaction.options.getString('url');

                try {
                    const configPath = './config.json';
                    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    
                    config.api[type] = newUrl;
                    
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                    util.reloadApiConfig(); // Update the values held in util.js.

                    await interaction.reply({ content: `✅ API URL updated successfully.\n**Type:** ${type}\n**New URL:** ${newUrl}`, ephemeral: true });
                    util.importLog(`API URL changed by the owner: ${type}`);
                } catch (err) {
                    console.error("Error updating API settings:", err);
                    await interaction.reply({ content: 'An error occurred while updating the settings.', ephemeral: true });
                }
                break;
        }
    } catch (err) {
        console.error("Error handling slash command:", err.message);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'An error occurred while executing the command.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
        }
    }
});

// Global error handlers to prevent the bot from exiting unexpectedly.
process.on('unhandledRejection', error => {
	console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// 4. Log in to Discord at the end of the file.
client.login(token);