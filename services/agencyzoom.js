const axios = require('axios');

const AZ = axios.create({
  baseURL: process.env.AGENCYZOOM_BASE_URL || 'https://app.agencyzoom.com/api/v1',
  headers: {
    'Authorization': `Bearer ${process.env.AGENCYZOOM_API_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
});

// ── Search contacts ───────────────────────────────────────────────────────────
async function searchContacts(query) {
  try {
    const res = await AZ.get('/contacts', { params: { search: query, limit: 10 } });
    const contacts = res.data?.data || res.data?.contacts || res.data || [];
    return Array.isArray(contacts) ? contacts : [];
  } catch (err) {
    console.error('AZ searchContacts error:', err?.response?.data || err.message);
    return [];
  }
}

// ── Get single contact ────────────────────────────────────────────────────────
async function getContact(contactId) {
  try {
    const res = await AZ.get(`/contacts/${contactId}`);
    return res.data?.data || res.data;
  } catch (err) {
    console.error('AZ getContact error:', err?.response?.data || err.message);
    return null;
  }
}

// ── Get policies for a contact ────────────────────────────────────────────────
async function getContactPolicies(contactId) {
  try {
    const res = await AZ.get(`/contacts/${contactId}/policies`);
    const policies = res.data?.data || res.data?.policies || res.data || [];
    return Array.isArray(policies) ? policies : [];
  } catch (err) {
    console.error('AZ getContactPolicies error:', err?.response?.data || err.message);
    return [];
  }
}

// ── Post a note to a contact ──────────────────────────────────────────────────
async function createNote(contactId, { formType, agentName, formData, submissionId }) {
  const formLabels = {
    vehicle_removal: 'Vehicle Removal E&O Acknowledgment',
    auto_cov:        'Auto Coverage Recommendation',
    home_cov:        'Homeowners Coverage Recommendation',
    trucking_cov:    'Trucking Coverage Recommendation',
    contractor_cov:  'Contractor Coverage Recommendation',
  };

  const label = formLabels[formType] || formType;
  const date  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build a readable summary of the coverage selections
  const lines = [`${label}`, `Completed: ${date}`, `Agent: ${agentName}`, `Internal Ref: EO-${submissionId}`, ''];

  if (formType === 'vehicle_removal') {
    const d = formData;
    lines.push(`Policy #: ${d.policyNumber || '—'}`);
    lines.push(`Vehicle: ${d.year || ''} ${d.make || ''} ${d.model || ''} (VIN last 4: ${d.vin || '—'})`);
    lines.push(`Reason: ${d.reason || '—'}`);
    lines.push(`Effective date of removal: ${d.effectiveDate || '—'}`);
  } else {
    const d = formData;
    if (d.policyNumber) lines.push(`Policy #: ${d.policyNumber}`);
    if (d.carrier)       lines.push(`Carrier: ${d.carrier}`);
    if (d.effectiveDate) lines.push(`Effective date: ${d.effectiveDate}`);
    lines.push('');
    lines.push('Coverage Selections:');
    (d.coverages || []).forEach(c => {
      const status    = c.status === 'offered' ? 'Offered' : 'Declined';
      const recLine   = c.recommended ? ` | Rec: ${c.recommended}` : '';
      const selLine   = c.selected    ? ` | Selected: ${c.selected}` : '';
      lines.push(`  • ${c.name}: ${status}${recLine}${selLine}`);
    });
  }

  lines.push('');
  lines.push('Form signed and on file. Submitted via Columbia Basin Insurance E&O Forms Portal.');

  try {
    const res = await AZ.post(`/contacts/${contactId}/notes`, {
      note:       lines.join('\n'),
      note_type:  'EO Form',
      visibility: 'internal',
    });
    return res.data?.data?.id || res.data?.id || null;
  } catch (err) {
    console.error('AZ createNote error:', err?.response?.data || err.message);
    return null;
  }
}

// ── Create or update a task (optional follow-up) ──────────────────────────────
async function createTask(contactId, { title, dueDate, agentName }) {
  try {
    const res = await AZ.post(`/contacts/${contactId}/tasks`, {
      title,
      due_date:   dueDate,
      assigned_to: agentName,
      priority:   'normal',
    });
    return res.data?.data?.id || res.data?.id || null;
  } catch (err) {
    console.error('AZ createTask error:', err?.response?.data || err.message);
    return null;
  }
}

module.exports = { searchContacts, getContact, getContactPolicies, createNote, createTask };
