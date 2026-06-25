// backendSelector.js - reads the X-Cache-Backend header and stores the
// chosen backend ("redis" or "memcached") on req.cacheBackend, so every
// route handler downstream knows which cache to use. Defaults to redis
// if the header is missing.

function backendSelector(req, res, next) {
  const backend = (req.headers['x-cache-backend'] || 'redis').toLowerCase();

  if (backend !== 'redis' && backend !== 'memcached') {
    return res.status(400).json({ error: 'X-Cache-Backend header must be "redis" or "memcached"' });
  }

  req.cacheBackend = backend;
  next();
}

module.exports = backendSelector;
