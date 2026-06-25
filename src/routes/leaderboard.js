// routes/leaderboard.js - GET /leaderboard returns the top 10
// most-viewed products for whichever backend is selected.

const express = require('express');
const router = express.Router();
const leaderboardService = require('../services/leaderboardService');

router.get('/', async (req, res) => {
  try {
    const top =
      req.cacheBackend === 'redis'
        ? await leaderboardService.getTopProductsRedis(10)
        : await leaderboardService.getTopProductsMemcached(10);

    res.json({ leaderboard: top, backend: req.cacheBackend });
  } catch (err) {
    console.error('GET /leaderboard failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
