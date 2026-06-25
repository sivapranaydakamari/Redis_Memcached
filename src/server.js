// server.js - entry point for the Product Catalog API.
// Wires together Express, the backend-selector middleware, and all the
// route modules. Run with: node src/server.js

require('dotenv').config();

const express = require('express');
const { connectRedis, redisClient } = require('./redisClient');
const backendSelector = require('./middleware/backendSelector');

const productsRouter = require('./routes/products');
const leaderboardRouter = require('./routes/leaderboard');
const sessionRouter = require('./routes/session');
const rateLimiterRouter = require('./routes/rateLimiter');

const app = express();
app.use(express.json());

// Used by docker-compose's healthcheck for the "app" service.
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Every route below this line can read req.cacheBackend.
app.use(backendSelector);

app.use('/products', productsRouter);
app.use('/leaderboard', leaderboardRouter);
app.use('/session', sessionRouter);
app.use('/rate-limit-test', rateLimiterRouter);

const PORT = process.env.API_PORT || 3000;

// Subscribes to the same channel Redis cache invalidation publishes to.
// In a real multi-instance deployment, every app instance would
// subscribe and drop its own local copy of the product; here we just
// log it, to demonstrate the PUBLISH-based invalidation pattern.
async function subscribeToInvalidations() {
  const subscriber = redisClient.duplicate();
  await subscriber.connect();
  await subscriber.subscribe('cache-invalidation', (message) => {
    console.log('Cache invalidation event received:', message);
  });
}

async function start() {
  await connectRedis();
  await subscribeToInvalidations();

  app.listen(PORT, () => {
    console.log(`Product Catalog API listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
