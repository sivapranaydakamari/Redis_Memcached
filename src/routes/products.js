// routes/products.js - product endpoints. Each handler looks at
// req.cacheBackend (set by middleware/backendSelector.js) and calls the
// matching Redis or Memcached function from services/productService.js.

const express = require('express');
const router = express.Router();
const db = require('../db');
const productService = require('../services/productService');
const leaderboardService = require('../services/leaderboardService');

// GET /products/:id - cache-aside read (check cache, fall back to DB)
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { product, source } =
      req.cacheBackend === 'redis'
        ? await productService.getProductRedis(id)
        : await productService.getProductMemcached(id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product, source, backend: req.cacheBackend });
  } catch (err) {
    console.error('GET /products/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products/:id - update the product in the DB, then invalidate the cache
router.post('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category } = req.body;

  try {
    // COALESCE keeps the existing value for any field left out of the request body.
    const result = await db.query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           price = COALESCE($3, price),
           category = COALESCE($4, category)
       WHERE id = $5
       RETURNING *`,
      [name, description, price, category, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (req.cacheBackend === 'redis') {
      await productService.invalidateProductRedis(id);
    } else {
      await productService.invalidateProductMemcached();
    }

    res.json({ product: result.rows[0], backend: req.cacheBackend });
  } catch (err) {
    console.error('POST /products/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /products/:id/view - increments the leaderboard view count
router.post('/:id/view', async (req, res) => {
  const { id } = req.params;

  try {
    if (req.cacheBackend === 'redis') {
      await leaderboardService.incrementViewRedis(id);
    } else {
      await leaderboardService.incrementViewMemcached(id);
    }

    res.json({ ok: true, productId: id, backend: req.cacheBackend });
  } catch (err) {
    console.error('POST /products/:id/view failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
