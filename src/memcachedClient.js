// memcachedClient.js - creates the single Memcached connection shared
// by the whole app. This is the raw "memcached" client - it exposes
// the actual protocol commands (get, set, add, incr, del) and nothing
// more, so all caching logic (locking, versioning, etc.) lives in our
// own code, not in the library.

const Memcached = require('memcached');

const memcachedAddress = process.env.MEMCACHED_URL || 'localhost:11211';

const memcachedClient = new Memcached(memcachedAddress, {
  retries: 1,
  timeout: 2000,
});

// Avoid unhandled "failure" events crashing the process - just log them.
memcachedClient.on('failure', (details) => console.error('Memcached failure:', details));

module.exports = memcachedClient;
