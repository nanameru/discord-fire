/*
 * Toggle a single channel between Personal and Trending categories
 *
 * Behavior:
 * - Input: CHANNEL_ID env var
 * - If the channel is under Personal, move it to Trending and add FIRE prefix (same as trending.js)
 * - If the channel is under Trending, move it back to Personal and remove FIRE prefix
 * - If the channel is under neither category, only log (no-op) unless future spec says otherwise
 * - DRY_RUN="true" logs actions without mutating
 *
 * Required env vars:
 * - DISCORD_BOT_TOKEN
 * - DISCORD_GUILD_ID
 * - DISCORD_CATEGORY_PERSONAL_ID
 * - DISCORD_CATEGORY_TRENDING_ID
 * - CHANNEL_ID (target channel)
 * - DRY_RUN (optional, default "false")
 */

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const FIRE_PREFIX = '🔥-';

function getEnv(name, required = true) {
  const v = process.env[name];
  if (required && !v) throw new Error(`Missing required env var: ${name}`);
  return v || '';
}

function hasFirePrefix(name) {
  return name.startsWith(FIRE_PREFIX);
}

function addFirePrefix(name) {
  return hasFirePrefix(name) ? name : `${FIRE_PREFIX}${name}`;
}

function removeFirePrefix(name) {
  return hasFirePrefix(name) ? name.slice(FIRE_PREFIX.length) : name;
}

async function main() {
  const token = getEnv('DISCORD_BOT_TOKEN');
  const guildId = getEnv('DISCORD_GUILD_ID');
  const personalCategoryId = getEnv('DISCORD_CATEGORY_PERSONAL_ID');
  const trendingCategoryId = getEnv('DISCORD_CATEGORY_TRENDING_ID');
  const channelId = getEnv('CHANNEL_ID');
  const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(channelId);

  if (!channel) {
    console.error(`[ERROR] Channel not found: ${channelId}`);
    await client.destroy();
    process.exit(1);
  }
  if (channel.type !== ChannelType.GuildText) {
    console.error(`[ERROR] Channel is not a text channel: ${channel.id} type=${channel.type}`);
    await client.destroy();
    process.exit(1);
  }

  const originalName = channel.name;
  if (channel.parentId === personalCategoryId) {
    // Personal -> Trending with FIRE prefix
    const newName = addFirePrefix(originalName);
    console.log(`[TOGGLE] Personal -> Trending: ${channel.id} ${originalName} → parent=${trendingCategoryId}, name=${newName}`);
    if (!dryRun) {
      if (channel.parentId !== trendingCategoryId) {
        await channel.setParent(trendingCategoryId);
      }
      if (newName !== originalName) {
        await channel.setName(newName);
      }
    }
  } else if (channel.parentId === trendingCategoryId) {
    // Trending -> Personal remove FIRE prefix
    const newName = removeFirePrefix(originalName);
    console.log(`[TOGGLE] Trending -> Personal: ${channel.id} ${originalName} → parent=${personalCategoryId}, name=${newName}`);
    if (!dryRun) {
      if (channel.parentId !== personalCategoryId) {
        await channel.setParent(personalCategoryId);
      }
      if (newName !== originalName) {
        await channel.setName(newName);
      }
    }
  } else {
    console.log(`[INFO] Channel ${channel.id} is not under Personal(${personalCategoryId}) or Trending(${trendingCategoryId}). No action.`);
  }

  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


