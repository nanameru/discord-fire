/*
 * Discord Trending Channels Script
 *
 * Behavior:
 * - Every run, reset the Trending category by moving its channels back to the Personal category and removing the fire prefix.
 * - Evaluate only channels under the Personal category.
 * - If a channel has at least one message in the last window (prev 04:00 JST → this 04:00 JST), move it to Trending and add a fire prefix to its name.
 *
 * Required environment variables:
 * - DISCORD_BOT_TOKEN
 * - DISCORD_GUILD_ID
 * - DISCORD_CATEGORY_PERSONAL_ID
 * - DISCORD_CATEGORY_TRENDING_ID
 * - DRY_RUN (optional, "true" to only log actions)
 */

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const { utcToZonedTime, zonedTimeToUtc } = require('date-fns-tz');

const TIMEZONE = 'Asia/Tokyo';
const FIRE_PREFIX = '🔥-';

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function computeWindowUtc() {
  const nowUtc = new Date();
  const nowJst = utcToZonedTime(nowUtc, TIMEZONE);
  const endJst = new Date(nowJst);
  endJst.setMinutes(0, 0, 0);
  // Determine most recent 04:00 JST boundary
  if (endJst.getHours() < 4) {
    // Before 04:00, use yesterday 04:00
    endJst.setDate(endJst.getDate() - 1);
    endJst.setHours(4);
  } else if (endJst.getHours() > 4 || (endJst.getHours() === 4 && nowJst.getMinutes() > 0)) {
    // After 04:00 (or at 04:MM>00), use today 04:00
    endJst.setHours(4);
  } else {
    // Exactly at 04:00
    endJst.setHours(4);
  }

  const startJst = new Date(endJst);
  startJst.setDate(startJst.getDate() - 1);

  const startUtc = zonedTimeToUtc(startJst, TIMEZONE);
  const endUtc = zonedTimeToUtc(endJst, TIMEZONE);
  return { startUtc, endUtc };
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
  const dryRun = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
    ],
  });

  await client.login(token);
  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  const personalChannels = channels.filter((c) => c && c.type === ChannelType.GuildText && c.parentId === personalCategoryId);
  const trendingChannels = channels.filter((c) => c && c.type === ChannelType.GuildText && c.parentId === trendingCategoryId);

  const { startUtc, endUtc } = computeWindowUtc();
  console.log(`Window (UTC): ${startUtc.toISOString()} → ${endUtc.toISOString()} (JST 04:00 boundary)`);
  console.log(`Dry-run: ${dryRun}`);

  // Reset: move all existing Trending channels back to Personal and remove FIRE prefix
  for (const [, ch] of trendingChannels) {
    const originalName = ch.name;
    const newName = removeFirePrefix(originalName);
    console.log(`[RESET] ${ch.id} ${originalName} → parent=${personalCategoryId}, name=${newName}`);
    if (!dryRun) {
      if (ch.parentId !== personalCategoryId) {
        await ch.setParent(personalCategoryId);
      }
      if (newName !== originalName) {
        await ch.setName(newName);
      }
    }
  }

  // Re-fetch channels after reset to get the latest parent relations
  const refreshed = await guild.channels.fetch();
  const refreshedPersonal = refreshed.filter((c) => c && c.type === ChannelType.GuildText && c.parentId === personalCategoryId);

  // Evaluate only Personal channels
  for (const [, ch] of refreshedPersonal) {
    // Fetch latest message only
    let lastMessageTs = null;
    try {
      const msgs = await ch.messages.fetch({ limit: 1 });
      const last = msgs.first();
      if (last) {
        lastMessageTs = last.createdTimestamp;
      }
    } catch (err) {
      console.warn(`[WARN] Failed to fetch last message for ${ch.id} (${ch.name}): ${err.message}`);
    }

    const hasRecent = lastMessageTs !== null && lastMessageTs >= startUtc.getTime() && lastMessageTs < endUtc.getTime();
    if (hasRecent) {
      const originalName = ch.name;
      const newName = addFirePrefix(originalName);
      console.log(`[TRENDING] ${ch.id} ${originalName} → parent=${trendingCategoryId}, name=${newName}`);
      if (!dryRun) {
        if (ch.parentId !== trendingCategoryId) {
          await ch.setParent(trendingCategoryId);
        }
        if (newName !== originalName) {
          await ch.setName(newName);
        }
      }
    }
  }

  await client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

