const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcGet, mcSet } = require('../memcachedHelpers');
const { acquireLock, releaseLock } = require('./memcachedLock');

// Redis
const LEADERBOARD_KEY = 'leaderboard';
const LEADERBOARD_LOCK_KEY = 'leaderboard:lock';

async function incrementViewRedis(productId) {
  await redisClient.zIncrBy(LEADERBOARD_KEY, 1, String(productId));
}

async function getTopProductsRedis(count = 10) {
  const rows = await redisClient.zRangeWithScores(LEADERBOARD_KEY, 0, count - 1, { REV: true });
  return rows.map((row) => ({ productId: row.value, views: row.score }));
}

// Memcached

async function readLeaderboard() {
  const raw = await mcGet(memcachedClient, LEADERBOARD_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeLeaderboard(leaderboard) {
  await mcSet(memcachedClient, LEADERBOARD_KEY, JSON.stringify(leaderboard), 0);
}

async function incrementViewMemcached(productId) {
  const gotLock = await acquireLock(memcachedClient, LEADERBOARD_LOCK_KEY);
  if (!gotLock) {
    throw new Error('Could not acquire leaderboard lock in time');
  }

  try {
    const leaderboard = await readLeaderboard();
    leaderboard[productId] = (leaderboard[productId] || 0) + 1;
    await writeLeaderboard(leaderboard);
  } finally {
    await releaseLock(memcachedClient, LEADERBOARD_LOCK_KEY);
  }
}

async function incrementViewMemcachedNoLock(productId) {
  const leaderboard = await readLeaderboard();
  leaderboard[productId] = (leaderboard[productId] || 0) + 1;
  await writeLeaderboard(leaderboard);
}

async function getTopProductsMemcached(count = 10) {
  const leaderboard = await readLeaderboard();
  return Object.entries(leaderboard)
    .map(([productId, views]) => ({ productId, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, count);
}

module.exports = {
  incrementViewRedis,
  getTopProductsRedis,
  incrementViewMemcached,
  incrementViewMemcachedNoLock,
  getTopProductsMemcached,
};
