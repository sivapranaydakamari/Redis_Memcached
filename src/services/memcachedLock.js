// memcachedLock.js - a simple distributed lock built on Memcached's
// "add" command. "add" only succeeds if the key does NOT already
// exist, so whoever's "add" succeeds owns the lock; everyone else's
// "add" fails and they retry after a short, increasing delay
// (exponential backoff) until the lock is free or they give up.

const { mcAdd, mcDel } = require('../memcachedHelpers');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(client, lockKey, lockTtlSeconds = 5, maxWaitMs = 30000) {
  // Retry until maxWaitMs has elapsed, not a fixed number of attempts -
  // with many concurrent callers sharing one lock, the queue of waiters
  // ahead of you (not your own attempt count) determines how long you
  // actually need to wait.
  const deadline = Date.now() + maxWaitMs;
  let delay = 20; // start at 20ms

  while (Date.now() < deadline) {
    const acquired = await mcAdd(client, lockKey, '1', lockTtlSeconds);
    if (acquired) return true;

    await sleep(delay);
    delay = Math.min(delay * 2, 1000); // cap backoff at 1 second
  }

  return false; // gave up - lock was held the whole time
}

async function releaseLock(client, lockKey) {
  await mcDel(client, lockKey);
}

module.exports = { acquireLock, releaseLock };
