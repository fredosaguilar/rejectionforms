const express = require('express');
const { requireAuth } = require('../middleware/auth');
const az = require('../services/agencyzoom');

const router = express.Router();

/* Whether AgencyZoom is reachable, and if not, which of the separate things is
   wrong. Reports derived facts only — which variables are set, what the
   service answered — never a credential. */
router.get('/status', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, agencyZoom: await az.status() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Clients by name or policy number. The payment portal calls its own
   /api/payments/clients, which merges this with the portal's records; this
   route is the AgencyZoom side on its own, for anything else that wants it. */
router.get('/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, clients: [] });
  try {
    const { clients, errors } = await az.searchClients(q);
    res.json({ success: true, clients, errors });
  } catch (e) {
    console.error('AgencyZoom search:', e.message);
    res.status(502).json({ error: e.message });
  }
});

router.get('/customer/:id/policies', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, policies: await az.getPolicies(req.params.id) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
