const express = require('express');
const multer  = require('multer');
const db      = require('../db');
const mail    = require('../services/email');
const sms     = require('../services/sms');
const { requireAuth } = require('../middleware/auth');
const { deliverSigningLinks, pendingRecipients } = require('../services/delivery');
const { PDFDocument } = require('pdf-lib');

/* Joins uploaded PDFs into one, in the order given. A file that cannot be read
   is named in the error rather than silently dropped — a missing page in a
   signed document is not something to discover later. */
async function mergePdfs(uploads) {
  const out = await PDFDocument.create();
  for (const f of uploads) {
    let src;
    try {
      src = await PDFDocument.load(f.buffer);
    } catch (e) {
      throw new Error(`${f.originalname} could not be read`);
    }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
  }
  return Buffer.from(await out.save());
}
const {
  newSigningToken, hashToken, sha256, publicId, buildSignedPdf,
} = require('../services/esign');

const router = express.Router();

// Documents live in Postgres, so the upload is held in memory and written
// straight to the row. 15 MB keeps a signing request inside Resend's limits.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 12 },
});

function clientIp(req) {
  // trust proxy is set, so req.ip is the client rather than Railway's edge.
  return (req.ip || '').replace(/^::ffff:/, '');
}

function logEvent(envelopeId, event, req, extra = {}) {
  return db.query(
    `INSERT INTO envelope_events (envelope_id, recipient_id, event, actor, ip, user_agent, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [envelopeId, extra.recipientId || null, event, extra.actor || null,
     clientIp(req), (req.get('user-agent') || '').slice(0, 400),
     extra.detail ? JSON.stringify(extra.detail) : null]
  ).catch((e) => console.error('audit write failed:', e.message));
}

function baseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

/* ==========================================================================
   Agent-facing API
   ========================================================================== */

/* Configuration check for SMS. Reports which variables are present and whether
   RingCentral actually accepts them, without ever echoing a value back. */
router.get('/sms-status', requireAuth, async (req, res) => {
  const present = {
    RINGCENTRAL_CLIENT_ID:     !!process.env.RINGCENTRAL_CLIENT_ID,
    RINGCENTRAL_CLIENT_SECRET: !!process.env.RINGCENTRAL_CLIENT_SECRET,
    RINGCENTRAL_JWT:           !!process.env.RINGCENTRAL_JWT,
    RINGCENTRAL_FROM:          !!process.env.RINGCENTRAL_FROM,
  };
  const missing = Object.keys(present).filter((k) => !present[k]);
  if (missing.length) {
    return res.json({ success: false, configured: false, missing,
      error: `Not set: ${missing.join(', ')}` });
  }
  try {
    await sms.authCheck();

    // Signing in is not the same as being allowed to send from that number,
    // and the send-time 403 does not name the numbers that would work.
    const from = await sms.fromCheck();
    if (!from.ok) {
      let ext = null;
      try { ext = await sms.extensionInfo(); } catch {}
      return res.json({ success: false, configured: true, missing: [],
        error: from.why, extension: ext, numbers: from.numbers || [] });
    }

    const shape = sms.jwtShape();
    const notes = [];
    if (shape.tidied) notes.push('The stored JWT had stray quotes or line breaks, which were ignored. Worth tidying in Railway.');
    if (from.unchecked) notes.push(from.why);

    // Whose extension `~` resolves to is the thing worth seeing when a send is
    // refused, so it is reported even when nothing looks wrong.
    let extension = null;
    try { extension = await sms.extensionInfo(); } catch (e) { notes.push(`Could not read the extension (${e.message}).`); }

    res.json({
      success: true, configured: true, missing: [],
      from: process.env.RINGCENTRAL_FROM,
      server: process.env.RINGCENTRAL_SERVER || 'https://platform.ringcentral.com',
      extension,
      numbers: from.numbers || [],
      note: notes.length ? notes.join(' ') : undefined,
    });
  } catch (e) {
    res.json({ success: false, configured: true, missing: [], error: e.message });
  }
});

/* The same idea as /sms-status, for the other channel. Reports only derived
   facts — the from address, the domains on the account and their status —
   never the API key. */
router.get('/email-status', requireAuth, async (req, res) => {
  try {
    const out = await mail.status();
    res.json(out);
  } catch (e) {
    res.json({ ok: false, why: e.message });
  }
});

router.get('/envelopes', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT e.id, e.public_id, e.title, e.status, e.file_name, e.agent_name,
              e.created_at, e.sent_at, e.completed_at,
              COALESCE(json_agg(json_build_object(
                'name', r.name, 'email', r.email, 'status', r.status,
                'signed_at', r.signed_at
              ) ORDER BY r.routing_order, r.id) FILTER (WHERE r.id IS NOT NULL), '[]') AS recipients,
              (SELECT detail FROM envelope_events ev
                WHERE ev.envelope_id = e.id AND ev.event = 'send_failed'
                ORDER BY ev.at DESC LIMIT 1) AS last_failure,
              e.reminders_enabled, e.reminder_count, e.reminder_last_at
         FROM envelopes e
         LEFT JOIN envelope_recipients r ON r.envelope_id = e.id
        GROUP BY e.id
        ORDER BY e.created_at DESC
        LIMIT 100`
    );
    res.json({ success: true, envelopes: rows });
  } catch (e) {
    console.error('list envelopes:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/envelopes/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, public_id, title, message, status, file_name, file_sha256,
              signed_sha256, agent_name, created_at, sent_at, completed_at,
              voided_at, void_reason
         FROM envelopes WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Envelope not found' });

    const [{ rows: recipients }, { rows: events }] = await Promise.all([
      db.query(`SELECT id, name, email, status, routing_order, consent_at, viewed_at,
                       signed_at, signed_ip, decline_reason
                  FROM envelope_recipients WHERE envelope_id = $1
                 ORDER BY routing_order, id`, [req.params.id]),
      db.query(`SELECT event, actor, ip, at FROM envelope_events
                 WHERE envelope_id = $1 ORDER BY at`, [req.params.id]),
    ]);
    res.json({ success: true, envelope: rows[0], recipients, events });
  } catch (e) {
    console.error('get envelope:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/envelopes', requireAuth, upload.array('document', 12), async (req, res) => {
  try {
    const uploads = req.files || [];
    if (!uploads.length) return res.status(400).json({ error: 'No document uploaded' });
    const notPdf = uploads.find((f) => f.mimetype !== 'application/pdf');
    if (notPdf) {
      return res.status(400).json({ error: `Only PDF documents can be sent for signature: ${notPdf.originalname}` });
    }

    // Several files become one document, joined in the order the sender put
    // them in. Everything downstream — placed field coordinates, the signing
    // page, the stamped copy, the certificate — then deals with a single PDF
    // and one run of page numbers, exactly as before.
    let merged;
    try {
      merged = uploads.length === 1 ? uploads[0].buffer : await mergePdfs(uploads);
    } catch (e) {
      return res.status(400).json({ error: `Those PDFs could not be combined: ${e.message}` });
    }
    if (merged.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'The combined document is larger than 15 MB' });
    }

    const fileName = uploads.length === 1
      ? uploads[0].originalname
      : `${uploads[0].originalname} + ${uploads.length - 1} more`;

    const title = (req.body.title || uploads[0].originalname || 'Document').trim();
    let recipients;
    try {
      recipients = JSON.parse(req.body.recipients || '[]');
    } catch {
      return res.status(400).json({ error: 'Recipients could not be read' });
    }
    recipients = (recipients || [])
      .map((r, i) => ({
        name: String(r.name || '').trim(),
        email: String(r.email || '').trim().toLowerCase(),
        phone: sms.normalisePhone(r.phone) || null,
        delivery: 'both',
        order: i + 1,
      }))
      .filter((r) => r.name && r.email);

    if (!recipients.length) return res.status(400).json({ error: 'At least one recipient is required' });
    const bad = recipients.find((r) => !validEmail(r.email));
    if (bad) return res.status(400).json({ error: `Not a valid email address: ${bad.email}` });
    const emails = recipients.map((r) => r.email);
    if (new Set(emails).size !== emails.length) {
      return res.status(400).json({ error: 'Each recipient must have a different email address' });
    }
    const noPhone = recipients.find((r) => !r.phone);
    if (noPhone) {
      return res.status(400).json({ error: `A mobile number is required for ${noPhone.name}` });
    }
    let fields = [];
    try { fields = JSON.parse(req.body.fields || '[]') || []; } catch {
      return res.status(400).json({ error: 'Signing fields could not be read' });
    }
    const missingSignature = recipients.findIndex((_, i) =>
      !fields.some((f) => Number(f.recipientIndex) === i && f.type === 'signature')
    );
    if (missingSignature !== -1) {
      return res.status(400).json({
        error: `Place at least one signature field for ${recipients[missingSignature].name}`,
      });
    }
    const language = req.body.language === 'es' ? 'es' : 'en';

    const { rows } = await db.query(
      `INSERT INTO envelopes (public_id, agent_id, agent_name, agent_email, title, message,
                              file_name, file_mime, file_bytes, file_sha256, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, public_id`,
      [publicId(), req.session.agentId, req.session.agentName, req.session.email,
       title, (req.body.message || '').trim() || null,
       fileName, 'application/pdf', merged, sha256(merged), language]
    );
    const envelope = rows[0];

    // The raw token is returned to the caller only for the link; the row keeps
    // the hash alone.
    const issued = [];
    for (const r of recipients) {
      const token = newSigningToken();
      const { rows: rr } = await db.query(
        `INSERT INTO envelope_recipients (envelope_id, name, email, phone, delivery, routing_order, token_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [envelope.id, r.name, r.email, r.phone, r.delivery, r.order, hashToken(token)]
      );
      issued.push({ ...r, id: rr[0].id, token });
    }

    // Placed fields, if the sender used the placement editor. Each references a
    // recipient by index into the list above.
    const TYPES = new Set(['signature', 'initials', 'date', 'text']);
    let placedCount = 0;
    for (const f of fields) {
      const ri = Number(f.recipientIndex);
      const target = issued[ri];
      if (!target) continue;                       // unassigned field is dropped
      if (!TYPES.has(f.type)) continue;
      const num = (v) => Math.min(1, Math.max(0, Number(v) || 0));
      const page = Math.max(1, parseInt(f.page, 10) || 1);
      await db.query(
        `INSERT INTO envelope_fields (envelope_id, recipient_id, page, x, y, w, h, type, label, required)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [envelope.id, target.id, page, num(f.x), num(f.y), num(f.w), num(f.h),
         f.type, (f.label || '').slice(0, 80) || null, f.required !== false]
      );
      placedCount++;
    }

    await logEvent(envelope.id, 'created', req, {
      actor: req.session.agentName,
      detail: { title, recipients: emails, sha256: sha256(merged), fields: placedCount,
                sources: uploads.map((f) => f.originalname) },
    });

    res.json({ success: true, envelopeId: envelope.id, publicId: envelope.public_id,
               recipients: issued.map(({ token, ...r }) => r) , tokens: issued.map(i => ({ email: i.email, token: i.token })) });
  } catch (e) {
    console.error('create envelope:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/envelopes/:id/send', requireAuth, async (req, res) => {
  try {
    const { rows: envRows } = await db.query(
      `SELECT * FROM envelopes WHERE id = $1`, [req.params.id]);
    const env = envRows[0];
    if (!env) return res.status(404).json({ error: 'Envelope not found' });
    if (env.status === 'voided') return res.status(400).json({ error: 'This envelope has been voided' });
    if (env.status === 'completed') return res.status(400).json({ error: 'This envelope is already completed' });

    const recipients = await pendingRecipients(req.params.id);
    if (!recipients.length) return res.status(400).json({ error: 'No recipients are awaiting signature' });

    // Tokens are unrecoverable once issued, so sending re-issues a fresh one
    // per recipient and invalidates the previous link.
    const { sent, failed } = await deliverSigningLinks({
      env, recipients, baseUrl: baseUrl(req), req, actor: req.session.agentName,
    });

    if (sent.length) {
      await db.query(
        `UPDATE envelopes SET status = 'sent', sent_at = COALESCE(sent_at, NOW()) WHERE id = $1`,
        [env.id]);
    }
    res.json({ success: sent.length > 0, sent, failed });
  } catch (e) {
    console.error('send envelope:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/envelopes/:id/void', requireAuth, async (req, res) => {
  try {
    const reason = (req.body.reason || '').trim() || 'Voided by sender';
    const { rowCount } = await db.query(
      `UPDATE envelopes SET status = 'voided', voided_at = NOW(), void_reason = $2
        WHERE id = $1 AND status <> 'completed'`, [req.params.id, reason]);
    if (!rowCount) return res.status(400).json({ error: 'Envelope not found, or already completed' });
    await logEvent(req.params.id, 'voided', req, { actor: req.session.agentName, detail: { reason } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Daily reminders, per document. Off unless asked for, and refused once the
   document is no longer waiting on anyone. */
router.patch('/envelopes/:id/reminders', requireAuth, async (req, res) => {
  try {
    const on = req.body.enabled === true || req.body.enabled === 'true';
    const { rows } = await db.query(`SELECT status FROM envelopes WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Envelope not found' });
    if (on && rows[0].status !== 'sent') {
      return res.status(400).json({ error: 'Reminders only apply to a document that is out for signature' });
    }
    // Turning them back on starts the count again, so an agent is not left
    // with a document that silently refuses to remind.
    await db.query(
      `UPDATE envelopes SET reminders_enabled = $2, reminder_count = CASE WHEN $2 THEN 0 ELSE reminder_count END
        WHERE id = $1`, [req.params.id, on]);
    await logEvent(req.params.id, on ? 'reminders_on' : 'reminders_off', req, { actor: req.session.agentName });
    res.json({ success: true, enabled: on });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Permanent, and cascades to the recipients, placed fields and the audit
   trail. A completed envelope is the evidentiary record of a signature, so
   deleting one is refused unless the caller says so explicitly — voiding is
   the reversible thing, and stays the default in the UI. */
router.delete('/envelopes/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, title, status FROM envelopes WHERE id = $1`, [req.params.id]);
    const env = rows[0];
    if (!env) return res.status(404).json({ error: 'Envelope not found' });

    if (env.status === 'completed' && String(req.query.confirm) !== 'signed') {
      return res.status(409).json({
        error: 'This document has been signed. Deleting it destroys the signed copy and its certificate of completion.',
        needsConfirm: 'signed',
      });
    }

    await db.query(`DELETE FROM envelopes WHERE id = $1`, [req.params.id]);
    console.log(`esign: envelope ${env.id} ("${env.title}", ${env.status}) deleted by ${req.session.agentName || req.session.email}`);
    res.json({ success: true });
  } catch (e) {
    console.error('delete envelope:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/envelopes/:id/document', requireAuth, async (req, res) => {
  try {
    const signed = req.query.signed === '1';
    const { rows } = await db.query(
      `SELECT title, file_name, file_bytes, signed_bytes FROM envelopes WHERE id = $1`,
      [req.params.id]);
    const env = rows[0];
    if (!env) return res.status(404).send('Not found');
    const bytes = signed ? env.signed_bytes : env.file_bytes;
    if (!bytes) return res.status(404).send('No signed document yet');
    await logEvent(req.params.id, 'downloaded', req, { actor: req.session.agentName, detail: { signed } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `inline; filename="${(signed ? 'SIGNED-' : '') + env.file_name.replace(/[^\w.\-]/g, '_')}"`);
    res.send(bytes);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/* ==========================================================================
   Public signing ceremony — authenticated by the token in the link only
   ========================================================================== */

async function loadByToken(token) {
  const { rows } = await db.query(
    `SELECT r.*, e.id AS env_id, e.public_id, e.title, e.message, e.status AS env_status,
            e.file_name, e.agent_name, e.language
       FROM envelope_recipients r
       JOIN envelopes e ON e.id = r.envelope_id
      WHERE r.token_hash = $1`, [hashToken(token)]);
  return rows[0] || null;
}

const pub = express.Router();

pub.get('/:token', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This signing link is not valid. It may have been replaced by a newer one.' });
    if (r.env_status === 'voided') return res.status(410).json({ error: 'This document has been voided by the sender.' });

    if (r.status === 'pending') {
      await db.query(`UPDATE envelope_recipients SET status='viewed', viewed_at=NOW() WHERE id=$1 AND status='pending'`, [r.id]);
      await logEvent(r.env_id, 'viewed', req, { recipientId: r.id, actor: r.email });
    }
    const { rows: fields } = await db.query(
      `SELECT id, page, x, y, w, h, type, label, required
         FROM envelope_fields
        WHERE envelope_id = $1 AND recipient_id = $2
        ORDER BY page, y, x`, [r.env_id, r.id]);

    res.json({
      success: true,
      title: r.title, message: r.message, fileName: r.file_name,
      sender: r.agent_name, recipientName: r.name, recipientEmail: r.email,
      status: r.status, consented: !!r.consent_at, envelopeStatus: r.env_status,
      language: r.language, fields,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

pub.get('/:token/document', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r) return res.status(404).send('Not found');
    const { rows } = await db.query(
      `SELECT file_bytes, signed_bytes, file_name FROM envelopes WHERE id = $1`, [r.env_id]);
    const wantSigned = req.query.signed === '1' && rows[0].signed_bytes;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].file_name.replace(/[^\w.\-]/g, '_')}"`);
    res.send(wantSigned ? rows[0].signed_bytes : rows[0].file_bytes);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ESIGN §101(c): consent must be affirmative and recorded before signing.
pub.post('/:token/consent', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This signing link is not valid.' });
    if (r.env_status === 'voided') return res.status(410).json({ error: 'This document has been voided.' });
    if (req.body.agree !== true) return res.status(400).json({ error: 'Consent was not given' });

    await db.query(
      `UPDATE envelope_recipients SET consent_at = NOW(), consent_ip = $2, consent_ua = $3
        WHERE id = $1 AND consent_at IS NULL`,
      [r.id, clientIp(req), (req.get('user-agent') || '').slice(0, 400)]);
    await logEvent(r.env_id, 'consented', req, { recipientId: r.id, actor: r.email });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

pub.post('/:token/decline', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This signing link is not valid.' });
    const reason = (req.body.reason || '').trim() || 'No reason given';
    await db.query(`UPDATE envelope_recipients SET status='declined', decline_reason=$2 WHERE id=$1`, [r.id, reason]);
    await db.query(`UPDATE envelopes SET status='declined' WHERE id=$1 AND status <> 'completed'`, [r.env_id]);
    await logEvent(r.env_id, 'declined', req, { recipientId: r.id, actor: r.email, detail: { reason } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

pub.post('/:token/sign', async (req, res) => {
  try {
    const r = await loadByToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This signing link is not valid.' });
    if (r.env_status === 'voided') return res.status(410).json({ error: 'This document has been voided.' });
    if (r.status === 'signed') return res.status(400).json({ error: 'You have already signed this document.' });
    if (!r.consent_at) return res.status(400).json({ error: 'Electronic records consent is required before signing.' });

    const typed = String(req.body.typedName || '').trim();
    const sig   = String(req.body.signaturePng || '');
    if (!typed) return res.status(400).json({ error: 'Type your full name to signify intent to sign.' });
    if (!/^data:image\/png;base64,/.test(sig)) return res.status(400).json({ error: 'A drawn signature is required.' });

    // Every required field this recipient owns must be filled before the
    // signature is accepted, checked here rather than trusted from the browser.
    const { rows: myFields } = await db.query(
      `SELECT id, type, required FROM envelope_fields
        WHERE envelope_id = $1 AND recipient_id = $2`, [r.env_id, r.id]);

    if (myFields.length) {
      const supplied = new Map();
      for (const f of (Array.isArray(req.body.fields) ? req.body.fields : [])) {
        supplied.set(Number(f.id), f);
      }
      const missing = myFields.filter((f) => {
        if (!f.required) return false;
        const v = supplied.get(f.id);
        if (!v) return true;
        return !(String(v.valuePng || '').startsWith('data:image/png;base64,') || String(v.value || '').trim());
      });
      if (missing.length) {
        return res.status(400).json({ error: `Please complete all required fields (${missing.length} remaining).` });
      }

      for (const f of myFields) {
        const v = supplied.get(f.id);
        if (!v) continue;
        const png = String(v.valuePng || '').startsWith('data:image/png;base64,') ? v.valuePng : null;
        const val = png ? null : String(v.value || '').slice(0, 300);
        await db.query(
          `UPDATE envelope_fields SET value = $2, value_png = $3, filled_at = NOW()
            WHERE id = $1 AND recipient_id = $4`,
          [f.id, val, png, r.id]);
      }
    }

    await db.query(
      `UPDATE envelope_recipients
          SET status='signed', signed_at=NOW(), signed_ip=$2, signed_ua=$3,
              signature_png=$4, typed_name=$5
        WHERE id=$1`,
      [r.id, clientIp(req), (req.get('user-agent') || '').slice(0, 400), sig, typed]);
    await logEvent(r.env_id, 'signed', req, { recipientId: r.id, actor: r.email, detail: { typedName: typed } });

    // Everyone signed? Build the signed document and notify.
    const { rows: outstanding } = await db.query(
      `SELECT COUNT(*)::int AS n FROM envelope_recipients
        WHERE envelope_id=$1 AND status <> 'signed'`, [r.env_id]);

    let completed = false;
    if (outstanding[0].n === 0) {
      completed = true;
      const [{ rows: envRows }, { rows: recips }, { rows: events }, { rows: allFields }] = await Promise.all([
        db.query(`SELECT * FROM envelopes WHERE id=$1`, [r.env_id]),
        db.query(`SELECT * FROM envelope_recipients WHERE envelope_id=$1 ORDER BY routing_order, id`, [r.env_id]),
        db.query(`SELECT event, actor, ip, at FROM envelope_events WHERE envelope_id=$1 ORDER BY at`, [r.env_id]),
        db.query(`SELECT * FROM envelope_fields WHERE envelope_id=$1 ORDER BY page, y, x`, [r.env_id]),
      ]);
      const { bytes, hash } = await buildSignedPdf({
        envelope: envRows[0], recipients: recips, events, fields: allFields });
      await db.query(
        `UPDATE envelopes SET status='completed', completed_at=NOW(), signed_bytes=$2, signed_sha256=$3
          WHERE id=$1`, [r.env_id, bytes, hash]);
      await logEvent(r.env_id, 'completed', req, { detail: { signedSha256: hash } });

      for (const p of recips) {
        try {
          await mail.send({
            to: p.email,
            subject: mail.copy(envRows[0].language).subjDone(envRows[0].title),
            html: mail.completedNotice({
              recipientName: p.name, title: envRows[0].title, lang: envRows[0].language,
              url: `${baseUrl(req)}/api/sign/${req.params.token}/document?signed=1`,
            }),
          });
        } catch (err) {
          // A failed copy must not undo a completed signature.
          console.error('completion email failed:', err.message);
          await logEvent(r.env_id, 'send_failed', req, { recipientId: p.id, detail: { to: p.email, error: err.message } });
        }
      }
    }
    res.json({ success: true, completed });
  } catch (e) {
    console.error('sign:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, pub };
