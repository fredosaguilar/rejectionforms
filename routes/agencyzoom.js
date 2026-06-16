const express = require('express');
const { requireAuth } = require('../middleware/auth');
const az = require('../services/agencyzoom');
const router = express.Router();

// GET /api/az/search?q=John+Smith  — search AZ contacts
router.get('/search', requireAuth, async (req, res) => {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json([]);
  const contacts = await az.searchContacts(q);
  // Normalize to a consistent shape regardless of AZ API version
  const normalized = contacts.map(c => ({
    id:    c.id || c.contact_id,
    name:  c.full_name || c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    email: c.email || c.primary_email || '',
    phone: c.phone || c.primary_phone || '',
  }));
  res.json(normalized);
});

// GET /api/az/contact/:id  — get contact + policies
router.get('/contact/:id', requireAuth, async (req, res) => {
  const [contact, policies] = await Promise.all([
    az.getContact(req.params.id),
    az.getContactPolicies(req.params.id),
  ]);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  const normPolicies = (Array.isArray(policies) ? policies : []).map(p => ({
    id:           p.id || p.policy_id,
    policyNumber: p.policy_number || p.number || '',
    carrier:      p.carrier || p.insurance_company || '',
    lineOfBusiness: p.line_of_business || p.type || p.lob || '',
    effectiveDate:  p.effective_date || p.eff_date || '',
    expirationDate: p.expiration_date || p.exp_date || '',
    premium:        p.premium || '',
  }));

  res.json({
    id:       contact.id || contact.contact_id,
    name:     contact.full_name || contact.name || `${contact.first_name||''} ${contact.last_name||''}`.trim(),
    email:    contact.email || contact.primary_email || '',
    phone:    contact.phone || contact.primary_phone || '',
    address:  contact.address || contact.mailing_address || '',
    policies: normPolicies,
  });
});

module.exports = router;
