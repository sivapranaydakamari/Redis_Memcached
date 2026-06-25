const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcGet, mcSet } = require('../memcachedHelpers');

const SESSION_TTL_SECONDS = 3600; // sessions expire after 1 hour

function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

// Redis

async function createSessionRedis(sessionId, fields) {
  const key = sessionKey(sessionId);
  await redisClient.hSet(key, fields);
  await redisClient.expire(key, SESSION_TTL_SECONDS);
}

async function getSessionRedis(sessionId) {
  const session = await redisClient.hGetAll(sessionKey(sessionId));
  return Object.keys(session).length ? session : null;
}

async function updateSessionFieldRedis(sessionId, field, value) {
  // Only this one field is written - HSET never touches the other fields.
  await redisClient.hSet(sessionKey(sessionId), field, value);
}

// Memcached

async function createSessionMemcached(sessionId, fields) {
  await mcSet(memcachedClient, sessionKey(sessionId), JSON.stringify(fields), SESSION_TTL_SECONDS);
}

async function getSessionMemcached(sessionId) {
  const raw = await mcGet(memcachedClient, sessionKey(sessionId));
  return raw ? JSON.parse(raw) : null;
}

async function updateSessionFieldMemcached(sessionId, field, value) {
  const session = (await getSessionMemcached(sessionId)) || {};
  session[field] = value;
  await mcSet(memcachedClient, sessionKey(sessionId), JSON.stringify(session), SESSION_TTL_SECONDS);
}

module.exports = {
  createSessionRedis,
  getSessionRedis,
  updateSessionFieldRedis,
  createSessionMemcached,
  getSessionMemcached,
  updateSessionFieldMemcached,
};
