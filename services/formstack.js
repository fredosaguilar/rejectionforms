const axios = require('axios');

const FS = axios.create({
  baseURL: 'https://www.formstack.com/api/v2',
  headers: {
    'Authorization': `Bearer ${process.env.FORMSTACK_ACCESS_TOKEN}`,
    'Content-Type':  'application/json',
    'Accept':        'application/json',
  },
  timeout: 15000,
});

// ── Build a plain-text summary of the form for the signature document ─────────
function buildDocumentText({ formType, agentName, clientName, formData, submissionId }) {
  const labels = {
    vehicle_removal:  'Vehicle Removal E&O Acknowledgment',
    auto_cov:         'Auto Coverage Recommendation',
    home_cov:         'Homeowners Coverage Recommendation',
    trucking_cov:     'Trucking Coverage Recommendation',
    contractor_cov:   'Contractor Coverage Recommendation',
  };
  const date  = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const label = labels[formType] || formType;
  const lines = [
    `${label}`,
    `Quincy Alliance Insurance LLC DBA Columbia Basin Insurance`,
    `Date: ${date}   |   Ref: EO-${submissionId}   |   Agent: ${agentName}`,
    `Client: ${clientName || '—'}`,
    '',
  ];

  if (formType === 'vehicle_removal') {
    const d = formData;
    lines.push(`Policy #: ${d.policyNumber || '—'}`);
    lines.push(`Carrier: ${d.carrier || '—'}`);
    lines.push(`Vehicle: ${d.year || ''} ${d.make || ''} ${d.model || ''} (VIN last 4: ${d.vin || '—'})`);
    lines.push(`Reason for removal: ${d.reason || '—'}`);
    lines.push(`Effective date of removal: ${d.effectiveDate || '—'}`);
    lines.push('');
    lines.push('CLIENT ACKNOWLEDGMENTS:');
    lines.push('By signing, the client confirms all acknowledgment statements on this form.');
  } else {
    const d = formData;
    if (d.policyNumber)  lines.push(`Policy #: ${d.policyNumber}`);
    if (d.carrier)       lines.push(`Carrier: ${d.carrier}`);
    if (d.effectiveDate) lines.push(`Effective date: ${d.effectiveDate}`);
    lines.push('');
    lines.push('COVERAGE SELECTIONS:');
    (d.coverages || []).forEach(c => {
      const status  = c.status === 'offered' ? 'Offered' : 'Declined';
      const rec     = c.recommended ? ` | Recommended: ${c.recommended}` : '';
      const sel     = c.selected    ? ` | Selected: ${c.selected}`       : '';
      lines.push(`  • ${c.name}: ${status}${rec}${sel}`);
    });
    if (d.notes) { lines.push(''); lines.push(`Notes: ${d.notes}`); }
  }

  lines.push('');
  lines.push('By signing below, I acknowledge that I have read, understand, and agree to the statements above.');
  lines.push('Al firmar a continuación, reconozco que he leído, entiendo y acepto las declaraciones anteriores.');
  return lines.join('\n');
}

// ── Send document for e-signature ─────────────────────────────────────────────
// Returns { envelopeId, signerUrl } on success, null on failure
async function sendForSignature({ formType, agentName, clientName, clientEmail, formData, submissionId }) {
  const documentText = buildDocumentText({ formType, agentName, clientName, formData, submissionId });

  const labels = {
    vehicle_removal: 'Vehicle Removal E&O Acknowledgment',
    auto_cov:        'Auto Coverage Recommendation',
    home_cov:        'Homeowners Coverage Recommendation',
    trucking_cov:    'Trucking Coverage Recommendation',
    contractor_cov:  'Contractor Coverage Recommendation',
  };

  try {
    // 1 — Create the document/envelope
    const docRes = await FS.post('/signature/document.json', {
      name:          labels[formType] || formType,
      document_text: documentText,
      cc:            [],
      use_embedded_signing: 1,
    });

    const envelopeId = docRes.data?.id;
    if (!envelopeId) throw new Error('No envelope ID returned from Formstack Sign');

    // 2 — Add the client as a signer
    const recipientRes = await FS.post(`/signature/document/${envelopeId}/field.json`, {
      recipients: [
        {
          name:  clientName,
          email: clientEmail,
          type:  'signer',
          order: 1,
        },
        {
          name:  agentName,
          email: process.env.AGENCY_EMAIL || '',
          type:  'signer',
          order: 2,
        },
      ],
    });

    // 3 — Send the document
    await FS.post(`/signature/document/${envelopeId}/send.json`);

    // 4 — Get embedded signing URL for the client (for in-app signing if desired)
    let signerUrl = null;
    try {
      const recipients = recipientRes.data?.recipients || [];
      const clientRecipient = recipients.find(r => r.email === clientEmail);
      if (clientRecipient?.id) {
        const urlRes = await FS.get(`/signature/document/${envelopeId}/recipient/${clientRecipient.id}/signing_url.json`);
        signerUrl = urlRes.data?.url || null;
      }
    } catch (_) {}

    return { envelopeId: String(envelopeId), signerUrl };
  } catch (err) {
    console.error('Formstack Sign sendForSignature error:', err?.response?.data || err.message);
    return null;
  }
}

// ── Get document status ───────────────────────────────────────────────────────
async function getDocumentStatus(envelopeId) {
  try {
    const res = await FS.get(`/signature/document/${envelopeId}.json`);
    const doc = res.data;
    return {
      status:    doc.status || 'unknown',   // 'pending' | 'partial' | 'complete' | 'voided'
      completed: doc.status === 'complete',
      pdfUrl:    doc.pdf_url || null,
    };
  } catch (err) {
    console.error('Formstack Sign getDocumentStatus error:', err?.response?.data || err.message);
    return null;
  }
}

// ── Download signed PDF ───────────────────────────────────────────────────────
async function getSignedPdf(envelopeId) {
  try {
    const res = await FS.get(`/signature/document/${envelopeId}/download.json`, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(res.data);
  } catch (err) {
    console.error('Formstack Sign getSignedPdf error:', err?.response?.data || err.message);
    return null;
  }
}

module.exports = { sendForSignature, getDocumentStatus, getSignedPdf };
