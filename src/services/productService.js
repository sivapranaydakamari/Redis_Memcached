// productService.js - the cache-aside pattern for GET /products/:id,
// plus cache invalidation for POST /products/:id, implemented once per
// backend.

const db = require('../db');
const { redisClient } = require('../redisClient');
const memcachedClient = require('../memcachedClient');
const { mcGet, mcSet, mcIncr, mcAdd } = require('../memcachedHelpers');

const PRODUCT_TTL_SECONDS = 300;
const VERSION_KEY = 'products:version';

function redisProductKey(id) {
  return `product:${id}`;
}

// Memcached cache keys carry a version number. Bumping the version
// (see invalidateProductMemcached below) makes every old key
// unreachable in one step, without deleting each key individually -
// this is the "Cache Versioning" invalidation strategy.
async function getMemcachedVersion() {
  const raw = await mcGet(memcachedClient, VERSION_KEY);
  if (raw !== undefined) {
    return parseInt(raw, 10);
  }

  await mcAdd(memcachedClient, VERSION_KEY, '1', 0); // first ever read - start at version 1
  return 1;
}

function memcachedProductKey(id, version) {
  return `product:v${version}:${id}`;
}

async function fetchProductFromDb(id) {
  const result = await db.query('SELECT * FROM products WHERE id = $1', [id]);
  return result.rows[0] || null;
}

// ---------- Redis ----------

async function getProductRedis(id) {
  const key = redisProductKey(id);
  const cached = await redisClient.get(key);
  if (cached) {
    return { product: JSON.parse(cached), source: 'cache' };
  }

  const product = await fetchProductFromDb(id);
  if (!product) return { product: null, source: 'db' };

  await redisClient.set(key, JSON.stringify(product), { EX: PRODUCT_TTL_SECONDS });
  return { product, source: 'db' };
}

async function invalidateProductRedis(id) {
  const key = redisProductKey(id);
  await redisClient.del(key);

  // Tell any other app instances subscribed to this channel that the
  // product changed, so they can drop their own cached copy too.
  await redisClient.publish('cache-invalidation', JSON.stringify({ productId: id }));
}

// ---------- Memcached ----------

async function getProductMemcached(id) {
  const version = await getMemcachedVersion();
  const key = memcachedProductKey(id, version);

  const cached = await mcGet(memcachedClient, key);
  if (cached) {
    return { product: JSON.parse(cached), source: 'cache' };
  }

  const product = await fetchProductFromDb(id);
  if (!product) return { product: null, source: 'db' };

  await mcSet(memcachedClient, key, JSON.stringify(product), PRODUCT_TTL_SECONDS);
  return { product, source: 'db' };
}

async function invalidateProductMemcached() {
  // Bump the global version. Every key built with the OLD version
  // number is now orphaned (unreachable) and will simply expire later
  // via its own TTL - this invalidates every cached product at once.
  const incremented = await mcIncr(memcachedClient, VERSION_KEY, 1);
  if (incremented === false) {
    await mcAdd(memcachedClient, VERSION_KEY, '2', 0);
  }
}

module.exports = {
  fetchProductFromDb,
  getProductRedis,
  invalidateProductRedis,
  getProductMemcached,
  invalidateProductMemcached,
};
