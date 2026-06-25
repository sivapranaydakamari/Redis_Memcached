function backendSelector(req, res, next) {
  const backend = (req.headers['x-cache-backend'] || 'redis').toLowerCase();

  if (backend !== 'redis' && backend !== 'memcached') {
    return res.status(400).json({ error: 'X-Cache-Backend header must be "redis" or "memcached"' });
  }

  req.cacheBackend = backend;
  next();
}

module.exports = backendSelector;
