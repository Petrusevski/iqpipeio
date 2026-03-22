// api/index.js — Vercel serverless entry point
let app;

try {
  app = require('../server/dist/index.js').default;
} catch (err) {
  console.error('[api/index.js] Failed to load server:', err);
  app = (req, res) => {
    res.status(500).json({
      error: 'Server failed to initialise',
      message: err.message,
      stack: err.stack,
    });
  };
}

module.exports = app;
