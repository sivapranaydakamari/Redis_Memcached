const express = require('express');
const router = express.Router();
const rateLimiterService = require('../services/rateLimiterService');

router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const allowed =
      req.cacheBackend === 'redis'
        ? await rateLimiterService.checkRateLimitRedis(userId)
        : await rateLimiterService.checkRateLimitMemcached(userId);

    if (!allowed) {
      return res.status(429).json({ error: 'Too many requests', backend: req.cacheBackend });
    }

    res.json({ ok: true, userId, backend: req.cacheBackend });
  } catch (err) {
    console.error('GET /rate-limit-test/:userId failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
