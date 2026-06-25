const Memcached = require('memcached');

const memcachedAddress = process.env.MEMCACHED_URL || 'localhost:11211';

const memcachedClient = new Memcached(memcachedAddress, {
  retries: 1,
  timeout: 2000,
});

memcachedClient.on('failure', (details) => console.error('Memcached failure:', details));

module.exports = memcachedClient;
