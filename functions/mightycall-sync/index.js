// functions/mightycall-sync/index.js
// Edge Function skeleton: calls platform API to trigger MightyCall sync jobs.
// Expects env var SERVER_ADMIN_URL and SERVER_SERVICE_KEY to be configured in the Edge runtime.

const fetch = require('node-fetch');

module.exports = async (req, res) => {
  try {
    const method = req.method || 'POST';
    const urlPath = req.url || '/api/mightycall/sync/phone-numbers';
    const serverUrl = process.env.SERVER_ADMIN_URL || process.env.SERVER_BASE_URL || 'http://localhost:4000';
    const serviceKey = process.env.SERVER_SERVICE_KEY || process.env.SERVICE_KEY || null;

    if (!serviceKey) {
      return res.status(500).json({ error: 'missing_service_key' });
    }

    const target = `${serverUrl}${urlPath}`;
    const fetchOpts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-service-key': serviceKey
      }
    };

    if (method === 'POST' && req.body) fetchOpts.body = JSON.stringify(req.body);

    const r = await fetch(target, fetchOpts);
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = { text }; }

    res.status(r.status).json(json);
  } catch (err) {
    console.error('[Edge:mightycall-sync] error', err);
    res.status(500).json({ error: 'edge_handler_failed', detail: String(err) });
  }
};
