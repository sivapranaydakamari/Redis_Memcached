const express = require('express');
const router = express.Router();
const sessionService = require('../services/sessionService');

// POST /session/:id - create or fully replace a session
router.post('/:id', async (req, res) => {
  const { id } = req.params;
  const fields = req.body;

  try {
    if (req.cacheBackend === 'redis') {
      await sessionService.createSessionRedis(id, fields);
    } else {
      await sessionService.createSessionMemcached(id, fields);
    }

    res.json({ ok: true, sessionId: id, backend: req.cacheBackend });
  } catch (err) {
    console.error('POST /session/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /session/:id - read the full session
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const session =
      req.cacheBackend === 'redis'
        ? await sessionService.getSessionRedis(id)
        : await sessionService.getSessionMemcached(id);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session, backend: req.cacheBackend });
  } catch (err) {
    console.error('GET /session/:id failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /session/:id/:field - update a single field
router.patch('/:id/:field', async (req, res) => {
  const { id, field } = req.params;
  const { value } = req.body;

  try {
    if (req.cacheBackend === 'redis') {
      await sessionService.updateSessionFieldRedis(id, field, value);
    } else {
      await sessionService.updateSessionFieldMemcached(id, field, value);
    }

    res.json({ ok: true, sessionId: id, field, value, backend: req.cacheBackend });
  } catch (err) {
    console.error('PATCH /session/:id/:field failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
