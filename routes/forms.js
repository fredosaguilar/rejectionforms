const express  = require('express');
const db       = require('../db');
const { generatePDF } = require('../services/pdf');
const { requireAuth } = require('../middleware/auth');
const router   = express.Router();

router.post('/submit', requireAuth, async (req, res) => {
  const { formType, clientName, clientEmail, policyNumber, carrier, effectiveDate, coverages, formData, signatureClient, signatureAgent } = req.body;
  if (!formType) return res.status(400).json({ error: 'formType is required' });
  const agentId = req.session.agentId;
  const agentName = req.session.agentName;
  const payload = { ...(formData || {}), clientName, clientEmail, policyNumber, carrier, effectiveDate, coverages: coverages || [] };
  try {
    const { rows } = await db.query(
      'INSERT INTO submissions (form_type, agent_id, agent_name, client_name, client_email, policy_number, carrier, form_data, signature_client, signature_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, submitted_at',
      [formType, agentId, agentName, clientName, clientEmail || null, policyNumber, carrier, payload, signatureClient || null, signatureAgent || null]
    );
    res.json({ success: true, submissionId: rows[0].id, message: 'Form saved as EO-' + rows[0].id + '. Click Download PDF to get your copy.' });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Failed to save form: ' + err.message });
  }
});

router.get('/:id/pdf', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM submissions WHERE id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const sub = rows[0];
    if (req.session.role !== 'admin' && sub.agent_id !== req.session.agentId) return res.status(403).json({ error: 'Forbidden' });
    const pdf = await generatePDF(sub);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="EO-' + sub.id + '-' + sub.form_type + '.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search || '';
  const isAdmin = req.session.role === 'admin';
  let queryText, queryParams;
  if (isAdmin) {
    queryText = "SELECT id, form_type, agent_name, client_name, client_email, policy_number, carrier, submitted_at FROM submissions WHERE ($3 = '' OR client_name ILIKE $3 OR policy_number ILIKE $3 OR agent_name ILIKE $3) ORDER BY submitted_at DESC LIMIT $1 OFFSET $2";
    queryParams = [limit, offset, search ? '%' + search + '%' : ''];
  } else {
    queryText = "SELECT id, form_type, agent_name, client_name, client_email, policy_number, carrier, submitted_at FROM submissions WHERE agent_id = $3 AND ($4 = '' OR client_name ILIKE $4 OR policy_number ILIKE $4) ORDER BY submitted_at DESC LIMIT $1 OFFSET $2";
    queryParams = [limit, offset, req.session.agentId, search ? '%' + search + '%' : ''];
  }
  const { rows } = await db.query(queryText, queryParams);
  res.json(rows);
});

router.get('/:id', requireAuth, async (req, res) => {
  const { rows } = await db.query('SELECT * FROM submissions WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  const sub = rows[0];
  if (req.session.role !== 'admin' && sub.agent_id !== req.session.agentId) return res.status(403).json({ error: 'Forbidden' });
  res.json(sub);
});

module.exports = router;
