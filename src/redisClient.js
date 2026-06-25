// redisClient.js - creates the single Redis connection shared by the
// whole app. We use the raw "redis" client and call commands directly
// (GET, SET, ZINCRBY, HSET, MULTI/EXEC, PUBLISH, ...) - no caching
// abstraction library sits in front of it.

const { createClient } = require('redis');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

// node-redis throws an unhandled error event (and crashes the process)
// if nothing is listening for "error" - this just logs it instead.
redisClient.on('error', (err) => console.error('Redis Client Error:', err));

async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

module.exports = { redisClient, connectRedis };
