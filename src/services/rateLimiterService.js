const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcIncr, mcAdd } = require('../memcachedHelpers');

const LIMIT = 100;
const WINDOW_SECONDS = 60;

// Redis
async function checkRateLimitRedis(userId) {
  const key = `ratelimit:${userId}`;

  const multi = redisClient.multi();
  multi.incr(key);
  multi.expire(key, WINDOW_SECONDS, 'NX');
  const results = await multi.exec();

  const count = results[0];
  return count <= LIMIT;
}

// Memcached
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
      break;
    }
   
  }

  if (count === undefined) {
    throw new Error('Could not determine rate limit count');
  }

  return count <= LIMIT;
}

module.exports = { checkRateLimitRedis, checkRateLimitMemcached };
