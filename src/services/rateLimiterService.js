// rateLimiterService.js - a per-user rate limit of 100 requests per
// 60-second window, implemented once per backend.

const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcIncr, mcAdd } = require('../memcachedHelpers');

const LIMIT = 100;
const WINDOW_SECONDS = 60;

// ---------- Redis ----------
// MULTI/EXEC sends INCR and EXPIRE as one atomic unit - no other
// client's command can run between them. "EXPIRE ... NX" (Redis 7+)
// only sets a TTL if the key has none yet, so the window only resets
// on the FIRST request of a new window, not on every request.
async function checkRateLimitRedis(userId) {
  const key = `ratelimit:${userId}`;

  const multi = redisClient.multi();
  multi.incr(key);
  multi.expire(key, WINDOW_SECONDS, 'NX');
  const results = await multi.exec();

  const count = results[0];
  return count <= LIMIT;
}

// ---------- Memcached ----------
// Memcached's incr() fails (returns false) if the key doesn't exist
// yet, so the very first request in a window must create it with
// add(). Two requests can both see "key missing" at the same instant;
// add() is atomic on the server, so only ONE of them actually creates
// the key. The other one's add() fails, so it just retries incr(),
// which now succeeds against the key the winner just created.
async function checkRateLimitMemcached(userId) {
  const key = `ratelimit:${userId}`;
  let count;

  for (let attempt = 0; attempt < 5; attempt++) {
    const incrResult = await mcIncr(memcachedClient, key, 1);

    if (incrResult !== false) {
      count = incrResult;
      break;
    }

    const created = await mcAdd(memcachedClient, key, '1', WINDOW_SECONDS);
    if (created) {
      count = 1;
      break; // we created it ourselves - don't incr() again on top of it
    }
    // If add() also failed, someone else just created the key - loop
    // around and incr() again.
  }

  if (count === undefined) {
    throw new Error('Could not determine rate limit count');
  }

  return count <= LIMIT;
}

module.exports = { checkRateLimitRedis, checkRateLimitMemcached };
