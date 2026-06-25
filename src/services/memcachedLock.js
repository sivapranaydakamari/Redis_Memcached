const { mcAdd, mcDel } = require('../memcachedHelpers');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(client, lockKey, lockTtlSeconds = 5, maxWaitMs = 30000) {
  const deadline = Date.now() + maxWaitMs;
  let delay = 20; // start at 20ms

  while (Date.now() < deadline) {
    const acquired = await mcAdd(client, lockKey, '1', lockTtlSeconds);
    if (acquired) return true;

    await sleep(delay);
    delay = Math.min(delay * 2, 1000); // backoff at 1 second
  }

  return false; 
}

async function releaseLock(client, lockKey) {
  await mcDel(client, lockKey);
}

module.exports = { acquireLock, releaseLock };
