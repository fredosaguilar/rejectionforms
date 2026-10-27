const express = require('express');
const db = require('../db');
const mail = require('../services/email');
const sms = require('../services/sms');
const stripe = require('../services/stripe');
const pay = require('../services/payments');
const { groupEvents } = require('../services/esign');
const az = require('../services/agencyzoom');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();   // /api/payments — the agency side, behind a login
const pub = express.Router();      // /api/pay      — the client side, reached by token

const AGENCY_EMAIL = () => (process.env.AGENCY_COPY_EMAIL || 'info@columbiabasininsurance.com').trim();
const clientIp = (req) => (req && req.ip ? req.ip : '').replace(/^::ffff:/, '');
const baseUrl = (req) => process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());

function logEvent(requestId, event, req, extra = {}) {
  return db.query(
    `INSERT INTO payment_events (request_id, event, actor, ip, user_agent, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [requestId, event, extra.actor || null, clientIp(req),
     req && req.get ? (req.get('user-agent') || '').slice(0, 400) : null,
     extra.detail ? JSON.stringify(extra.detail) : null]
  ).catch((e) => console.error('payment audit write failed:', e.message));
}

/* What the agency sees of a request. Never the token: only its hash is stored,
   and the link itself is rebuilt for the agent from a fresh read. */
const AGENT_COLS = `id, public_id, receipt_no, agent_name, agent_email, client_name,
  client_email, client_phone, description, policy_number, language, fee_cents,
  surcharge_cents, method, status, submission_id, provider, provider_intent,
  paid_cents, card_brand, card_last4, failure_reason, refunded_cents,
  created_at, sent_at, viewed_at, paid_at, voided_at, void_reason`;

function shape(r) {
  if (!r) return null;
  return Object.assign({}, r, {
    feeCents: r.fee_cents,
    surchargeCents: r.surcharge_cents,
    totalCents: pay.totalCents(r),
    fee: pay.money(r.fee_cents),
    surcharge: pay.money(r.surcharge_cents),
    total: pay.money(pay.totalCents(r)),
    paid: r.paid_cents == null ? null : pay.money(r.paid_cents),
    methodWords: r.method ? pay.methodWords(r) : null,
  });
}

/* -------------------------------------------------------------------------
   The agency side
   ------------------------------------------------------------------------- */

/* Whether a payment can actually be taken, and if not, what is missing.
   Every value here is derived — a mode, an account name, a yes or no — and
   never a key. */
router.get('/status', requireAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      stripe: await stripe.status(),
      // Reported beside the processor because it is the same kind of fact: a
      // third party this page depends on, and whether it is answering.
      agencyZoom: await az.status(),
      // The one value nobody can look up for the agency: where this very
      // application is answering from. Stripe has to be told it exactly, and
      // reading it off the running server is the only way to be sure it is
      // right.
      webhookUrl: `${baseUrl(req)}/api/pay/webhook`,
      webhookEvents: [
        'checkout.session.completed',
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
        'charge.refunded',
      ],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Finding the client a fee is for, by name or by policy number.
 *
 * Three places are searched and the answers are merged, because each knows
 * something the others do not:
 *
 *   - fee agreements on file, which carry the agency fee that was agreed and
 *     signed, and so are the only source that can fill in the amount;
 *   - fee requests already raised, so a repeat client is one click;
 *   - AgencyZoom, which has every client whether or not they have ever been
 *     through this portal.
 *
 * The first two are this application's own database and always answer. The
 * third is a third party that may be unconfigured, unreachable, or on a plan
 * without API search — so it is asked alongside rather than instead, and a
 * failure there is reported without losing the rest.
 */
router.get('/clients', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ success: true, clients: [], notes: [] });
  const like = `%${q}%`;

  const out = [], notes = [];

  try {
    const { rows } = await db.query(
      `SELECT id, client_name, client_email, policy_number, carrier, submitted_at, form_data
         FROM submissions
        WHERE form_type = 'fee_agreement'
          AND (client_name ILIKE $1 OR policy_number ILIKE $1)
        ORDER BY submitted_at DESC LIMIT 10`, [like]);
    rows.forEach((r) => {
      const d = r.form_data || {};
      out.push({
        source: 'agreement',
        submissionId: r.id,
        name: r.client_name || '',
        email: r.client_email || '',
        phone: '',
        policyNumber: r.policy_number || '',
        carrier: r.carrier || '',
        feeCents: pay.centsFromInput(d.agencyFee),
        when: r.submitted_at,
      });
    });
  } catch (e) {
    console.error('client search (agreements):', e.message);
    notes.push('Fee agreements could not be searched.');
  }

  try {
    const { rows } = await db.query(
      `SELECT DISTINCT ON (LOWER(client_name), COALESCE(policy_number,''))
              client_name, client_email, client_phone, policy_number, fee_cents, created_at
         FROM payment_requests
        WHERE client_name ILIKE $1 OR policy_number ILIKE $1
        ORDER BY LOWER(client_name), COALESCE(policy_number,''), created_at DESC
        LIMIT 10`, [like]);
    rows.forEach((r) => out.push({
      source: 'request',
      name: r.client_name || '',
      email: r.client_email || '',
      phone: r.client_phone || '',
      policyNumber: r.policy_number || '',
      carrier: '',
      feeCents: r.fee_cents,
      when: r.created_at,
    }));
  } catch (e) {
    console.error('client search (requests):', e.message);
  }

  if (az.configured()) {
    try {
      const found = await az.searchClients(q);
      found.clients.forEach((c) => out.push({
        source: 'agencyzoom',
        agencyZoomId: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        policyNumber: c.policyNumber,
        carrier: c.carrier,
        lineOfBusiness: c.lineOfBusiness,
        feeCents: null,
        when: null,
      }));
      if (found.errors.length && !found.clients.length) {
        notes.push('AgencyZoom did not answer this search \u2014 see the notice at the top of this page.');
        console.error('AgencyZoom search:', found.errors.join(' | '));
      }
    } catch (e) {
      console.error('client search (agencyzoom):', e.message);
      notes.push('AgencyZoom could not be reached.');
    }
  }

  /* One client found three ways is one row. A fee agreement wins over a past
     request, and both win over AgencyZoom, because only this portal's own
     records carry the agreed fee. */
  const rank = { agreement: 0, request: 1, agencyzoom: 2 };
  const best = new Map();
  for (const c of out) {
    if (!c.name && !c.policyNumber) continue;
    const key = `${c.name.trim().toLowerCase()}|${(c.policyNumber || '').trim().toLowerCase()}`;
    const have = best.get(key);
    if (!have) { best.set(key, c); continue; }
    // Keep the better-ranked row, but take any detail it is missing from the
    // other: AgencyZoom often has the phone number the agreement never had.
    const keep = rank[c.source] < rank[have.source] ? c : have;
    const other = keep === c ? have : c;
    ['email', 'phone', 'policyNumber', 'carrier', 'lineOfBusiness'].forEach((k) => {
      if (!keep[k] && other[k]) keep[k] = other[k];
    });
    if (keep.feeCents == null && other.feeCents != null) keep.feeCents = other.feeCents;
    if (!keep.submissionId && other.submissionId) keep.submissionId = other.submissionId;
    best.set(key, keep);
  }

  const clients = Array.from(best.values())
    .sort((a, b) => rank[a.source] - rank[b.source] ||
                    String(a.name).localeCompare(String(b.name)))
    .slice(0, 20)
    .map((c) => Object.assign({}, c, {
      fee: c.feeCents ? pay.money(c.feeCents) : null,
    }));

  res.json({ success: true, clients, notes, agencyZoom: az.configured() });
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const q = `%${String(req.query.q || '').trim()}%`;
    const status = String(req.query.status || '').trim();
    const { rows } = await db.query(
      `SELECT ${AGENT_COLS} FROM payment_requests
        WHERE ($1 = '%%' OR client_name ILIKE $1 OR policy_number ILIKE $1 OR description ILIKE $1)
          AND ($2 = '' OR status = $2)
        ORDER BY created_at DESC LIMIT 200`, [q, status]);

    const { rows: totals } = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_cents END), 0)                   AS paid_cents,
         COALESCE(SUM(CASE WHEN status IN ('draft','sent') THEN fee_cents + surcharge_cents END), 0) AS open_cents,
         COUNT(*) FILTER (WHERE status IN ('draft','sent'))                                AS open_count
       FROM payment_requests`);

    res.json({
      success: true,
      requests: rows.map(shape),
      totals: {
        paid: pay.money(totals[0].paid_cents),
        open: pay.money(totals[0].open_cents),
        openCount: Number(totals[0].open_count),
      },
    });
  } catch (e) {
    console.error('payment list:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const clientName = String(req.body.clientName || '').trim();
    const description = String(req.body.description || '').trim();
    const feeCents = pay.centsFromInput(req.body.fee);
    const clientEmail = String(req.body.clientEmail || '').trim().toLowerCase();
    const clientPhone = sms.normalisePhone(req.body.clientPhone);

    if (!clientName) return res.status(400).json({ error: 'The client\'s name is required' });
    if (!description) return res.status(400).json({ error: 'Say what the fee is for' });
    if (!feeCents) return res.status(400).json({ error: 'Enter the broker fee as an amount' });
    // A fee this large is a typo far more often than it is a fee, and a typo
    // here charges somebody's card.
    if (feeCents > 2500000) return res.status(400).json({ error: 'That fee is over $25,000 — check the amount' });
    if (clientEmail && !validEmail(clientEmail)) {
      return res.status(400).json({ error: `Not a valid email address: ${clientEmail}` });
    }
    if (req.body.clientPhone && !clientPhone) {
      return res.status(400).json({ error: `"${String(req.body.clientPhone).trim()}" is not a usable mobile number` });
    }
    // Neither is required. A fee keyed in at the desk needs no way to reach
    // the client at all; only sending them a link does, and /send says so when
    // there is nobody to send to. An email is still worth having, because it
    // is where the receipt goes.

    // The token is issued now rather than on send, so the agent can copy the
    // link and hand it over in person without the request having to be emailed
    // first. It stays the same link however many times it is sent.
    const token = pay.newPayToken();
    const { rows } = await db.query(
      `INSERT INTO payment_requests
         (public_id, agent_id, agent_name, agent_email, client_name, client_email, client_phone,
          description, policy_number, language, fee_cents, token_hash, submission_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${AGENT_COLS}`,
      [pay.publicId(), req.session.agentId, req.session.agentName, req.session.email,
       clientName, clientEmail || null, clientPhone,
       description, String(req.body.policyNumber || '').trim() || null,
       req.body.language === 'es' ? 'es' : 'en', feeCents, pay.hashToken(token),
       Number(req.body.submissionId) || null]);

    await logEvent(rows[0].id, 'created', req, {
      actor: req.session.agentName || req.session.email,
      detail: { fee: pay.money(feeCents) },
    });
    console.log(`payments: request ${rows[0].public_id} for ${clientName} ` +
                `(${pay.money(feeCents)}) created by ${req.session.agentName || req.session.email}`);

    res.json({
      success: true,
      request: shape(rows[0]),
      url: `${baseUrl(req)}/pay/${token}`,
    });
  } catch (e) {
    console.error('payment create:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ${AGENT_COLS} FROM payment_requests WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Payment request not found' });
    const { rows: events } = await db.query(
      `SELECT event, actor, ip, detail, at FROM payment_events
        WHERE request_id = $1 ORDER BY at, id`, [req.params.id]);
    // One request sent by email and by text is one thing that happened, and
    // reads as one line rather than two near-identical ones.
    res.json({ success: true, request: shape(rows[0]), events: groupEvents(events) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* Sends — or sends again — the payment link, by email and text, to whichever
   of the two the client gave. The link does not change between sends. */
router.post('/:id/send', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM payment_requests WHERE id = $1`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Payment request not found' });
    if (r.status === 'paid') return res.status(409).json({ error: 'This fee has already been paid.' });
    if (r.status === 'void') return res.status(409).json({ error: 'This request was cancelled.' });
    if (r.status === 'processing') {
      return res.status(409).json({ error: 'A bank transfer for this fee is still clearing.' });
    }
    if (!r.client_email && !r.client_phone) {
      return res.status(400).json({
        error: `There is no email address or mobile number on file for ${r.client_name}, so there is ` +
               'nowhere to send the link. Add one, or take the payment at the desk instead.',
      });
    }

    // Only the hash is stored, so the link cannot be rebuilt from the row. A
    // resend issues a fresh token and the previous link stops working.
    const token = pay.newPayToken();
    await db.query(`UPDATE payment_requests SET token_hash = $1 WHERE id = $2`,
      [pay.hashToken(token), r.id]);
    const url = `${baseUrl(req)}/pay/${token}`;
    const amount = pay.money(r.fee_cents);
    const sent = [], failed = [];

    if (r.client_email) {
      try {
        await mail.send({
          to: r.client_email,
          subject: mail.payCopy(r.language).subj(r.description),
          replyTo: r.agent_email || undefined,
          html: mail.paymentRequest({
            clientName: r.client_name, agentName: r.agent_name,
            description: r.description, amount, url, lang: r.language,
          }),
        });
        sent.push(r.client_email);
        await logEvent(r.id, 'sent', req, {
          actor: req.session.agentName || req.session.email,
          detail: { channel: 'email', to: r.client_email },
        });
      } catch (err) {
        failed.push({ to: r.client_email, channel: 'email', error: err.message });
        await logEvent(r.id, 'send_failed', req, { detail: { channel: 'email', to: r.client_email, error: err.message } });
      }
    }

    if (r.client_phone) {
      try {
        await sms.send({
          to: r.client_phone,
          text: sms.paymentText({
            clientName: r.client_name, agentName: r.agent_name,
            amount, url, lang: r.language,
          }),
        });
        sent.push(r.client_phone);
        await logEvent(r.id, 'sent', req, {
          actor: req.session.agentName || req.session.email,
          detail: { channel: 'sms', to: r.client_phone },
        });
      } catch (err) {
        failed.push({ to: r.client_phone, channel: 'sms', error: err.message });
        await logEvent(r.id, 'send_failed', req, { detail: { channel: 'sms', to: r.client_phone, error: err.message } });
      }
    }

    if (sent.length) {
      await db.query(
        `UPDATE payment_requests SET status = 'sent', sent_at = COALESCE(sent_at, NOW()) WHERE id = $1`,
        [r.id]);
    }
    res.json({ success: sent.length > 0, sent, failed, url });
  } catch (e) {
    console.error('payment send:', e);
    res.status(500).json({ error: e.message });
  }
});

/* The link, for an agent who would rather read it out or paste it somewhere
   than have it mailed. Issuing it invalidates whatever was sent before, which
   is the price of never storing the token. */
router.post('/:id/link', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT id, status FROM payment_requests WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Payment request not found' });
    if (rows[0].status === 'paid') return res.status(409).json({ error: 'This fee has already been paid.' });
    if (rows[0].status === 'void') return res.status(409).json({ error: 'This request was cancelled.' });
    const token = pay.newPayToken();
    await db.query(`UPDATE payment_requests SET token_hash = $1 WHERE id = $2`,
      [pay.hashToken(token), rows[0].id]);
    await logEvent(rows[0].id, 'link_issued', req, { actor: req.session.agentName || req.session.email });
    res.json({ success: true, url: `${baseUrl(req)}/pay/${token}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* A fee settled outside this portal — a card run on a counter terminal, a
   payment taken through another system, a correction. Nothing is charged here;
   it is recorded so the client still gets the same receipt and the agency
   keeps one ledger. The note is required, because a fee marked paid with no
   processor behind it is only as good as the reason written beside it. */
router.post('/:id/record', requireAuth, async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE id = $1`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Payment request not found' });
    if (r.status === 'paid') return res.status(409).json({ error: 'This fee is already recorded as paid.' });
    if (r.status === 'void') return res.status(409).json({ error: 'This request was cancelled.' });
    if (!note) return res.status(400).json({ error: 'Say how it was settled — a counter terminal, another system, a correction' });

    const { rows: done } = await db.query(
      `UPDATE payment_requests
          SET status = 'paid', method = 'manual', surcharge_cents = 0,
              paid_cents = fee_cents, paid_at = NOW(), provider = 'manual',
              receipt_no = COALESCE(receipt_no, $2)
        WHERE id = $1 RETURNING ${AGENT_COLS}`,
      [r.id, pay.receiptNumber(Object.assign({}, r, { paid_at: new Date() }))]);

    await logEvent(r.id, 'recorded', req, {
      actor: req.session.agentName || req.session.email,
      detail: { note, amount: pay.money(r.fee_cents) },
    });
    await sendReceipts(done[0], req).catch((e) => console.error('receipt after manual record:', e.message));
    res.json({ success: true, request: shape(done[0]) });
  } catch (e) {
    console.error('payment record:', e);
    res.status(500).json({ error: e.message });
  }
});

/* Taking the fee while the client is on the phone or at the desk.
 *
 * The agent is sent to the processor's own hosted page and keys the card in
 * there. That is the whole point of doing it this way: a card form on this
 * page would put the agency in PCI scope, and nothing about collecting a
 * broker fee is worth that. What comes back here is an outcome.
 *
 * Card only. A bank debit needs the client to log in to their own bank, which
 * is not something that can happen across a desk.
 */
router.post('/:id/take', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE id = $1`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Payment request not found' });
    if (r.status === 'paid' || r.status === 'refunded') {
      return res.status(409).json({ error: 'This fee has already been paid.' });
    }
    if (r.status === 'void') return res.status(409).json({ error: 'This request was cancelled.' });
    if (r.status === 'processing') {
      return res.status(409).json({ error: 'A bank transfer for this fee is already clearing.' });
    }
    if (!stripe.configured()) {
      return res.status(503).json({
        error: 'Card payments are not switched on yet. Set STRIPE_SECRET_KEY, or record the fee by hand.',
      });
    }

    const surcharge = pay.surchargeCents(r.fee_cents, 'card');
    const base = baseUrl(req);
    const session = await stripe.createCheckout({
      method: 'card',
      feeCents: r.fee_cents,
      surchargeCents: surcharge,
      description: r.description,
      /* An address is always supplied so the processor's page never stops to
         ask for one. At the desk the agent has a card in front of them and no
         reason to be typing an email, and for a walk-in with none on file the
         agent's own address stands in — the processor's receipt then reaches
         the office, which is where it is useful. */
      clientEmail: r.client_email || req.session.email || undefined,
      // Back to the agent's own workspace, not the client's payment page.
      successUrl: `${base}/payments?paid={CHECKOUT_SESSION_ID}&req=${r.id}`,
      cancelUrl: `${base}/payments?cancelled=${r.id}`,
      reference: r.public_id,
      metadata: { request_id: String(r.id), public_id: r.public_id, client: r.client_name, taken_at_desk: 'yes' },
      statementDescriptor: 'CBI BROKER FEE',
    });

    await db.query(
      `UPDATE payment_requests
          SET method = 'card', surcharge_cents = $2, provider = 'stripe', provider_session = $3
        WHERE id = $1`,
      [r.id, surcharge, session.id]);
    // Recorded as taken by the agent, not by the client: the audit trail should
    // not later read as though they paid it themselves from their own phone.
    await logEvent(r.id, 'checkout_started', req, {
      actor: req.session.agentName || req.session.email,
      detail: { method: 'card', total: pay.money(r.fee_cents + surcharge), takenAtDesk: true },
    });

    res.json({ success: true, url: session.url, total: pay.money(r.fee_cents + surcharge) });
  } catch (e) {
    console.error('take payment:', e);
    res.status(502).json({ error: `The payment page could not be opened: ${e.message}` });
  }
});

/* The agent has come back from the processor. Same reconciliation the client's
   own return does, reached by request id rather than by token. */
router.post('/:id/reconcile', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE id = $1`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Payment request not found' });
    if (r.status === 'paid' || r.status === 'refunded') {
      return res.json({ success: true, request: shape(r), already: true });
    }
    const sessionId = String(req.body.sessionId || '').trim();
    if (!sessionId || sessionId !== r.provider_session) {
      return res.status(400).json({ error: 'That payment could not be matched to this request.' });
    }

    const session = await stripe.getCheckout(sessionId);
    const intent = session.payment_intent && typeof session.payment_intent === 'object'
      ? session.payment_intent : null;

    if (session.payment_status === 'paid') {
      const updated = await markPaid(r, { session, intent, req });
      return res.json({ success: true, request: shape(updated) });
    }
    res.json({ success: false, pending: true, request: shape(r) });
  } catch (e) {
    console.error('agent reconcile:', e);
    res.status(502).json({ error: e.message });
  }
});

router.post('/:id/refund', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE id = $1`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'Payment request not found' });
    if (r.status !== 'paid') return res.status(409).json({ error: 'Only a paid fee can be refunded.' });

    const asked = pay.centsFromInput(req.body.amount);
    const already = Number(r.refunded_cents || 0);
    const paidCents = Number(r.paid_cents || pay.totalCents(r));
    const amount = asked || (paidCents - already);
    if (amount <= 0 || amount > paidCents - already) {
      return res.status(400).json({ error: `At most ${pay.money(paidCents - already)} can be refunded.` });
    }

    if (r.provider_intent) {
      await stripe.refund(r.provider_intent, amount);
    } else if (r.provider !== 'manual') {
      return res.status(409).json({ error: 'There is no processor reference on this payment to refund against.' });
    }

    const total = already + amount;
    const { rows: done } = await db.query(
      `UPDATE payment_requests
          SET refunded_cents = $2::int,
              status = CASE WHEN $2::int >= $3::int THEN 'refunded' ELSE status END
        WHERE id = $1 RETURNING ${AGENT_COLS}`, [r.id, total, paidCents]);
    await logEvent(r.id, 'refunded', req, {
      actor: req.session.agentName || req.session.email,
      detail: { amount: pay.money(amount), total: pay.money(total) },
    });
    console.log(`payments: ${pay.money(amount)} refunded on ${r.public_id} by ${req.session.agentName || req.session.email}`);
    res.json({ success: true, request: shape(done[0]) });
  } catch (e) {
    console.error('payment refund:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/void', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT status FROM payment_requests WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Payment request not found' });
    if (rows[0].status === 'paid') {
      return res.status(409).json({ error: 'This fee has been paid. Refund it rather than cancelling it.' });
    }
    if (rows[0].status === 'processing') {
      return res.status(409).json({ error: 'A bank transfer is still clearing on this fee.' });
    }
    // The token goes with it: a cancelled request must stop opening.
    await db.query(
      `UPDATE payment_requests
          SET status = 'void', voided_at = NOW(), void_reason = $2, token_hash = NULL
        WHERE id = $1`,
      [req.params.id, String(req.body.reason || '').trim() || null]);
    await logEvent(req.params.id, 'voided', req, {
      actor: req.session.agentName || req.session.email,
      detail: { reason: String(req.body.reason || '').trim() || null },
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* A request that was never paid can be deleted outright. One that was paid
   cannot: the receipt is the agency's record of money it took. */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT status, client_name FROM payment_requests WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Payment request not found' });
    if (['paid', 'refunded', 'processing'].includes(rows[0].status)) {
      return res.status(409).json({
        error: 'A fee that has been paid is part of the agency\'s record and cannot be deleted. Cancel or refund it instead.',
      });
    }
    await db.query(`DELETE FROM payment_requests WHERE id = $1`, [req.params.id]);
    console.log(`payments: request ${req.params.id} (${rows[0].client_name}) deleted by ` +
                `${req.session.agentName || req.session.email}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/receipt', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Payment request not found' });
    if (rows[0].status !== 'paid' && rows[0].status !== 'refunded') {
      return res.status(409).json({ error: 'There is no receipt until the fee is paid.' });
    }
    await sendReceiptPdf(res, rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function sendReceiptPdf(res, r) {
  const { rows: events } = await db.query(
    `SELECT event, actor, detail, at FROM payment_events WHERE request_id = $1 ORDER BY at, id`, [r.id]);
  const bytes = await pay.buildReceiptPdf(r, events);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition',
    `inline; filename="receipt-${(r.receipt_no || r.public_id).replace(/[^\w.-]/g, '')}.pdf"`);
  res.send(bytes);
}

/* -------------------------------------------------------------------------
   Settling a payment
   Reached from three directions — the client returning from Stripe, a webhook,
   and an agent opening a request — so it lives in one place and is written to
   be safe to run twice.
   ------------------------------------------------------------------------- */
async function markPaid(r, { session, intent, req = null }) {
  if (r.status === 'paid' || r.status === 'refunded') return r;

  const charge = (intent && intent.latest_charge) || null;
  const card = charge && charge.payment_method_details && charge.payment_method_details.card;
  const bank = charge && charge.payment_method_details && charge.payment_method_details.us_bank_account;
  const amount = (session && session.amount_total) || (intent && intent.amount_received) || pay.totalCents(r);

  const { rows } = await db.query(
    `UPDATE payment_requests
        SET status = 'paid', paid_at = NOW(), paid_cents = $2,
            provider = 'stripe',
            provider_session = COALESCE($3, provider_session),
            provider_intent  = COALESCE($4, provider_intent),
            card_brand = COALESCE($5, card_brand),
            card_last4 = COALESCE($6, card_last4),
            failure_reason = NULL,
            receipt_no = COALESCE(receipt_no, $7)
      WHERE id = $1 AND status <> 'paid'
      RETURNING ${AGENT_COLS}`,
    [r.id, amount,
     session ? session.id : null,
     (intent && intent.id) || (session && (typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id)) || null,
     card ? card.brand : (bank ? 'bank' : null),
     card ? card.last4 : (bank ? bank.last4 : null),
     pay.receiptNumber(Object.assign({}, r, { paid_at: new Date() }))]);

  // Another path got there first; nothing to do and nothing to send twice.
  if (!rows[0]) return r;

  // Who the record says took it. A fee keyed in at the desk was taken by the
  // agent, and the trail should not later read as though the client paid it
  // themselves from their own phone.
  const atDesk = String(session?.metadata?.taken_at_desk || intent?.metadata?.taken_at_desk || '') === 'yes';
  await logEvent(r.id, 'paid', req, {
    actor: atDesk
      ? `${r.agent_name || 'the agency'} (taken at the desk)`
      : (r.client_email || r.client_name),
    detail: Object.assign(
      { amount: pay.money(amount), method: rows[0].method || 'card' },
      atDesk ? { takenAtDesk: true } : {}),
  });
  console.log(`payments: ${pay.money(amount)} received on ${r.public_id} from ${r.client_name}`);
  await sendReceipts(rows[0], req).catch((e) => console.error('receipt send failed:', e.message));
  return rows[0];
}

/* The client's receipt, and the agency's copy of it. A failure here must not
   unpay a fee that has been paid, so it is logged and swallowed. */
async function sendReceipts(r, req) {
  const { rows: events } = await db.query(
    `SELECT event, actor, detail, at FROM payment_events WHERE request_id = $1 ORDER BY at, id`, [r.id]);
  let bytes;
  try {
    bytes = await pay.buildReceiptPdf(r, events);
  } catch (e) {
    console.error('receipt pdf failed:', e.message);
    return;
  }
  const filename = `receipt-${(r.receipt_no || r.public_id).replace(/[^\w.-]/g, '')}.pdf`;
  const amount = pay.money(r.paid_cents != null ? r.paid_cents : pay.totalCents(r));

  if (r.client_email) {
    try {
      await mail.send({
        to: r.client_email,
        subject: mail.payCopy(r.language).rsubj(r.receipt_no || ''),
        replyTo: r.agent_email || undefined,
        html: mail.paymentReceipt({
          clientName: r.client_name, receiptNo: r.receipt_no || '',
          amount, description: r.description, lang: r.language,
        }),
        attachments: [{ filename, content: bytes }],
      });
      await logEvent(r.id, 'receipt_sent', req, { detail: { to: r.client_email } });
    } catch (e) {
      console.error('client receipt failed:', e.message);
      await logEvent(r.id, 'send_failed', req, { detail: { to: r.client_email, error: e.message, kind: 'receipt' } });
    }
  }

  const agency = AGENCY_EMAIL();
  if (agency) {
    try {
      await mail.send({
        to: agency,
        subject: `Fee paid: ${pay.money(r.paid_cents != null ? r.paid_cents : pay.totalCents(r))} — ${r.client_name}`,
        html: mail.paymentAgencyCopy({
          clientName: r.client_name, receiptNo: r.receipt_no || '', amount,
          description: r.description, method: pay.methodWords(r),
          agentName: r.agent_name, paidAt: pay.fmt(r.paid_at),
        }),
        attachments: [{ filename, content: bytes }],
      });
      await logEvent(r.id, 'agency_copy_sent', req, { detail: { to: agency } });
    } catch (e) {
      console.error('agency receipt copy failed:', e.message);
    }
  }
}

/* -------------------------------------------------------------------------
   The client side. Reached by token: the link is the credential.
   ------------------------------------------------------------------------- */
async function byToken(token) {
  const { rows } = await db.query(
    `SELECT * FROM payment_requests WHERE token_hash = $1`, [pay.hashToken(String(token || ''))]);
  return rows[0] || null;
}

/* What the client is shown. Deliberately narrow: an amount, what it is for,
   and who it is from. Nothing about other clients, nothing about the agency's
   books, and no identifiers beyond the one already in their link. */
function clientView(r) {
  return {
    clientName: r.client_name,
    description: r.description,
    policyNumber: r.policy_number,
    agentName: r.agent_name,
    language: r.language,
    status: r.status,
    feeCents: r.fee_cents,
    fee: pay.money(r.fee_cents),
    methods: pay.methodQuotes(r.fee_cents).map((m) => Object.assign({}, m, {
      surcharge: pay.money(m.surchargeCents),
      total: pay.money(m.totalCents),
    })),
    paid: r.status === 'paid' || r.status === 'refunded',
    paidAmount: r.paid_cents == null ? null : pay.money(r.paid_cents),
    paidAt: r.paid_at ? pay.fmt(r.paid_at) : null,
    receiptNo: r.receipt_no,
    methodWords: r.method ? pay.methodWords(r) : null,
    stripeReady: stripe.configured(),
  };
}

pub.get('/:token', async (req, res) => {
  try {
    const r = await byToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This payment link is not valid. It may have been cancelled or replaced.' });

    // Every open is recorded. A client who says they never got it, and a fee
    // that was opened four times and never paid, are both worth knowing.
    //
    // Coming back from the processor is not one of those opens: the page loads
    // again to show the outcome, and counting it would make every paid request
    // read as opened twice.
    if (req.query.returning !== '1') {
      await db.query(
        `UPDATE payment_requests SET viewed_at = COALESCE(viewed_at, NOW()) WHERE id = $1`, [r.id]);
      await logEvent(r.id, 'viewed', req, { actor: r.client_email || r.client_name });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, request: clientView(r) });
  } catch (e) {
    console.error('pay view:', e);
    res.status(500).json({ error: e.message });
  }
});

/* Hands the client to Stripe's own page. The amount is recomputed here from
   the fee on the record — never read from the request body, which the client
   controls. */
pub.post('/:token/checkout', async (req, res) => {
  try {
    const r = await byToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This payment link is not valid.' });
    if (r.status === 'paid' || r.status === 'refunded') {
      return res.status(409).json({ error: 'This fee has already been paid.' });
    }
    if (r.status === 'void') return res.status(409).json({ error: 'This request was cancelled.' });
    if (r.status === 'processing') {
      return res.status(409).json({ error: 'A bank transfer for this fee is already clearing.' });
    }
    if (!stripe.configured()) {
      return res.status(503).json({
        error: 'Online payment is not switched on yet. Please contact our office to pay this fee.',
      });
    }

    const method = req.body.method === 'bank' ? 'bank' : 'card';
    const surcharge = pay.surchargeCents(r.fee_cents, method);
    const base = baseUrl(req);

    const session = await stripe.createCheckout({
      method,
      feeCents: r.fee_cents,
      surchargeCents: surcharge,
      description: r.description,
      clientEmail: r.client_email || undefined,
      successUrl: `${base}/pay/${req.params.token}?paid={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/pay/${req.params.token}?cancelled=1`,
      reference: r.public_id,
      metadata: { request_id: String(r.id), public_id: r.public_id, client: r.client_name },
      statementDescriptor: 'CBI BROKER FEE',
    });

    await db.query(
      `UPDATE payment_requests
          SET method = $2, surcharge_cents = $3, provider = 'stripe', provider_session = $4
        WHERE id = $1`,
      [r.id, method, surcharge, session.id]);
    await logEvent(r.id, 'checkout_started', req, {
      actor: r.client_email || r.client_name,
      detail: { method, total: pay.money(r.fee_cents + surcharge) },
    });

    res.json({ success: true, url: session.url });
  } catch (e) {
    console.error('pay checkout:', e);
    res.status(502).json({ error: `The payment page could not be opened: ${e.message}` });
  }
});

/* The client has come back from Stripe. Asking Stripe directly what happened
   means a payment is confirmed even where the webhook has not been set up, or
   has not arrived yet. The session id is checked against the one this request
   started, so a session id from somewhere else proves nothing here. */
pub.post('/:token/reconcile', async (req, res) => {
  try {
    const r = await byToken(req.params.token);
    if (!r) return res.status(404).json({ error: 'This payment link is not valid.' });
    if (r.status === 'paid' || r.status === 'refunded') {
      return res.json({ success: true, request: clientView(r) });
    }
    const sessionId = String(req.body.sessionId || '').trim();
    if (!sessionId || sessionId !== r.provider_session) {
      return res.status(400).json({ error: 'That payment could not be matched to this request.' });
    }

    const session = await stripe.getCheckout(sessionId);
    const intent = session.payment_intent && typeof session.payment_intent === 'object'
      ? session.payment_intent : null;

    if (session.payment_status === 'paid') {
      const updated = await markPaid(r, { session, intent, req });
      return res.json({ success: true, request: clientView(updated) });
    }
    // A bank debit is accepted now and settles later. It is neither paid nor
    // failed, and saying either would be wrong.
    if (intent && intent.status === 'processing') {
      await db.query(
        `UPDATE payment_requests SET status = 'processing', provider_intent = $2 WHERE id = $1 AND status <> 'paid'`,
        [r.id, intent.id]);
      await logEvent(r.id, 'processing', req, { actor: r.client_email || r.client_name });
      const again = await byToken(req.params.token);
      return res.json({ success: true, request: clientView(again || r) });
    }
    res.json({ success: false, pending: true, request: clientView(r) });
  } catch (e) {
    console.error('pay reconcile:', e);
    res.status(502).json({ error: e.message });
  }
});

pub.get('/:token/receipt', async (req, res) => {
  try {
    const r = await byToken(req.params.token);
    if (!r) return res.status(404).send('This payment link is not valid.');
    if (r.status !== 'paid' && r.status !== 'refunded') {
      return res.status(409).send('There is no receipt until the fee is paid.');
    }
    await logEvent(r.id, 'receipt_downloaded', req, { actor: r.client_email || r.client_name });
    await sendReceiptPdf(res, r);
  } catch (e) {
    res.status(500).send('Could not build the receipt.');
  }
});

/* -------------------------------------------------------------------------
   The webhook
   Mounted on the raw body, before any JSON parser: the signature is over the
   bytes Stripe sent, and a parsed-and-restringified body is not those bytes.
   ------------------------------------------------------------------------- */
async function webhook(req, res) {
  let event;
  // If a JSON parser ran first, req.body is an object and the bytes Stripe
  // signed are gone. Say so plainly: the failure that follows otherwise looks
  // like a wrong secret and sends people to the dashboard for an afternoon.
  if (!Buffer.isBuffer(req.body)) {
    console.error('stripe webhook: the body was parsed before this route saw it — ' +
                  'mount it on express.raw ahead of express.json');
    return res.status(500).send('Webhook is misconfigured on the server');
  }
  try {
    event = stripe.verifyWebhook(req.body, req.get('stripe-signature'));
  } catch (e) {
    // Marking a fee paid on the word of whoever posted here is exactly what
    // the signature exists to prevent.
    console.error('stripe webhook rejected:', e.message);
    return res.status(400).send(`Webhook signature check failed: ${e.message}`);
  }

  // Stripe retries until it is acknowledged. The first arrival claims the
  // event; a retry finds it taken and does nothing.
  try {
    const { rowCount } = await db.query(
      `INSERT INTO payment_webhook_events (event_id, kind) VALUES ($1,$2)
       ON CONFLICT (event_id) DO NOTHING`, [event.id, event.type]);
    if (!rowCount) return res.json({ received: true, duplicate: true });
  } catch (e) {
    console.error('webhook dedupe failed:', e.message);
  }

  try {
    await handleEvent(event);
  } catch (e) {
    // A 500 makes Stripe retry, which is what we want when the failure was
    // ours — but the dedupe row is already written, so clear it first.
    console.error(`stripe webhook ${event.type} failed:`, e.message);
    await db.query(`DELETE FROM payment_webhook_events WHERE event_id = $1`, [event.id]).catch(() => {});
    return res.status(500).send('Could not process the event');
  }
  res.json({ received: true });
}

async function findRequest(obj) {
  const id = Number(obj?.metadata?.request_id);
  if (id) {
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE id = $1`, [id]);
    if (rows[0]) return rows[0];
  }
  const ref = obj?.client_reference_id;
  if (ref) {
    const { rows } = await db.query(`SELECT * FROM payment_requests WHERE public_id = $1`, [ref]);
    if (rows[0]) return rows[0];
  }
  const intent = typeof obj?.payment_intent === 'string' ? obj.payment_intent : obj?.id;
  if (intent) {
    const { rows } = await db.query(
      `SELECT * FROM payment_requests WHERE provider_intent = $1 OR provider_session = $1`, [intent]);
    if (rows[0]) return rows[0];
  }
  return null;
}

async function handleEvent(event) {
  const obj = event.data && event.data.object;
  if (!obj) return;
  const r = await findRequest(obj);
  if (!r) {
    console.warn(`stripe webhook ${event.type}: no matching payment request`);
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.payment_status === 'paid') {
        const intent = obj.payment_intent
          ? await stripe.getIntent(typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent.id)
          : null;
        await markPaid(r, { session: obj, intent });
      } else {
        // A bank debit: accepted, not yet settled.
        await db.query(
          `UPDATE payment_requests SET status = 'processing', provider_session = $2,
             provider_intent = COALESCE($3, provider_intent)
            WHERE id = $1 AND status <> 'paid'`,
          [r.id, obj.id, typeof obj.payment_intent === 'string' ? obj.payment_intent : null]);
        await logEvent(r.id, 'processing', null, { detail: { via: 'webhook' } });
      }
      break;
    }
    case 'payment_intent.succeeded': {
      const intent = await stripe.getIntent(obj.id);
      await markPaid(r, { session: null, intent });
      break;
    }
    case 'payment_intent.payment_failed': {
      const why = obj.last_payment_error?.message || 'The payment was not completed.';
      await db.query(
        `UPDATE payment_requests
            SET status = CASE WHEN status = 'paid' THEN status ELSE 'sent' END,
                failure_reason = $2
          WHERE id = $1`, [r.id, why.slice(0, 400)]);
      await logEvent(r.id, 'failed', null, { detail: { reason: why } });
      break;
    }
    case 'charge.refunded': {
      const refunded = Number(obj.amount_refunded || 0);
      const paid = Number(obj.amount || r.paid_cents || 0);
      await db.query(
        `UPDATE payment_requests
            SET refunded_cents = $2::int,
                status = CASE WHEN $2::int >= $3::int THEN 'refunded' ELSE status END
          WHERE id = $1`, [r.id, refunded, paid]);
      await logEvent(r.id, 'refunded', null, { detail: { amount: pay.money(refunded), via: 'stripe' } });
      break;
    }
    default:
      break;
  }
}

module.exports = { router, pub, webhook, markPaid, handleEvent };
