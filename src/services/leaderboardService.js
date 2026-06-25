// leaderboardService.js - the "Most Viewed Products" leaderboard,
// implemented once per backend so we can compare them directly.
//
// Redis: a ZSET (sorted set). ZINCRBY is a single atomic command, so
// concurrent increments can never be lost.
//
// Memcached: has no sorted set, so the whole leaderboard is kept as one
// JSON object under a single key. Updating it is a "read -> modify in
// JS -> write" cycle, which is NOT safe under concurrency unless we
// wrap it in a lock (see memcachedLock.js).

const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcGet, mcSet } = require('../memcachedHelpers');
const { acquireLock, releaseLock } = require('./memcachedLock');

const LEADERBOARD_KEY = 'leaderboard';
const LEADERBOARD_LOCK_KEY = 'leaderboard:lock';

// ---------- Redis ----------

async function incrementViewRedis(productId) {
  // ZINCRBY leaderboard 1 <productId>
  await redisClient.zIncrBy(LEADERBOARD_KEY, 1, String(productId));
}

async function getTopProductsRedis(count = 10) {
  // ZREVRANGE leaderboard 0 9 WITHSCORES
  const rows = await redisClient.zRangeWithScores(LEADERBOARD_KEY, 0, count - 1, { REV: true });
  return rows.map((row) => ({ productId: row.value, views: row.score }));
}

// ---------- Memcached ----------

async function readLeaderboard() {
  const raw = await mcGet(memcachedClient, LEADERBOARD_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeLeaderboard(leaderboard) {
  // lifetime 0 = never expire, so it behaves like the Redis ZSET, which
  // persists until explicitly removed.
  await mcSet(memcachedClient, LEADERBOARD_KEY, JSON.stringify(leaderboard), 0);
}

// Safe increment: holds the lock for the whole read-modify-write cycle,
// so two requests can never both read the same count, both add 1, and
// have one of those updates silently overwritten (a "lost update").
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

// Unsafe increment (no lock at all). Not used by the API - it only
// exists so scripts/consistencyTest.js can demonstrate the lost-update
// race condition that incrementViewMemcached() above fixes.
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
