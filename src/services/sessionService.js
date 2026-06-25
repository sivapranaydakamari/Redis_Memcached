// sessionService.js - session storage implemented two different ways,
// to compare how much code each approach takes:
//
// Redis: a Hash (HSET/HGETALL). Updating one field only writes that
// field - the rest of the hash is left alone.
//
// Memcached: one JSON string per session. There is no partial update,
// so changing one field means GET the whole object, change the field
// in JS, then SET the whole object back.

const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcGet, mcSet } = require('../memcachedHelpers');

const SESSION_TTL_SECONDS = 3600; // sessions expire after 1 hour

function sessionKey(sessionId) {
  return `session:${sessionId}`;
}

// ---------- Redis ----------

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

// ---------- Memcached ----------

async function createSessionMemcached(sessionId, fields) {
  await mcSet(memcachedClient, sessionKey(sessionId), JSON.stringify(fields), SESSION_TTL_SECONDS);
}

async function getSessionMemcached(sessionId) {
  const raw = await mcGet(memcachedClient, sessionKey(sessionId));
  return raw ? JSON.parse(raw) : null;
}

async function updateSessionFieldMemcached(sessionId, field, value) {
  // No partial update exists for Memcached strings - read the whole
  // object, change one field in JS, write the whole object back.
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
