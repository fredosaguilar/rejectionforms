const db   = require('../db');
const mail = require('./email');
const sms  = require('./sms');
const { newSigningToken, hashToken } = require('./esign');

/* Sending a signing link, in one place.
 *
 * The send route, the resend button and the daily reminder all deliver the
 * same thing to the same people, and the rules that matter — which recipients
 * are still owed a link, which channel each one wants, what gets written to
 * the audit trail — must not drift between them.
 *
 * `req` is optional: the scheduler has no request, so IP and user agent are
 * recorded as null rather than faked.
 */

function clientIp(req) {
  return req ? (req.ip || '').replace(/^::ffff:/, '') : null;
}

function logEvent(envelopeId, event, req, extra = {}) {
  return db.query(
    `INSERT INTO envelope_events (envelope_id, recipient_id, event, actor, ip, user_agent, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [envelopeId, extra.recipientId || null, event, extra.actor || null,
     clientIp(req), req ? (req.get('user-agent') || '').slice(0, 400) : null,
     extra.detail ? JSON.stringify(extra.detail) : null]
  ).catch((e) => console.error('audit write failed:', e.message));
}

/* Everyone on this envelope who still owes a signature. */
function pendingRecipients(envelopeId) {
  return db.query(
    `SELECT * FROM envelope_recipients
      WHERE envelope_id = $1 AND status IN ('pending','viewed')
      ORDER BY routing_order, id`, [envelopeId]).then((r) => r.rows);
}

/* Issues a fresh token per recipient and delivers the link on the channels
   they chose. The previous link stops working, because only the hash is
   stored and the old token cannot be recovered to send again. */
async function deliverSigningLinks({ env, recipients, baseUrl, req = null, actor = null, kind = 'sent' }) {
  const sent = [], failed = [];

  for (const r of recipients) {
    const token = newSigningToken();
    await db.query(`UPDATE envelope_recipients SET token_hash = $1 WHERE id = $2`,
      [hashToken(token), r.id]);
    const url = `${baseUrl}/sign/${token}`;
    const want = r.delivery || 'email';

    if (want === 'email' || want === 'both') {
      try {
        await mail.send({
          to: r.email,
          subject: mail.copy(env.language).subjSign(env.title),
          replyTo: env.agent_email || undefined,
          html: mail.signingRequest({
            recipientName: r.name, agentName: env.agent_name,
            title: env.title, message: env.message, url, lang: env.language,
          }),
        });
        sent.push(r.email);
        await logEvent(env.id, kind, req, { recipientId: r.id, actor, detail: { channel: 'email', to: r.email } });
      } catch (err) {
        failed.push({ email: r.email, channel: 'email', error: err.message });
        await logEvent(env.id, 'send_failed', req, { recipientId: r.id, detail: { channel: 'email', to: r.email, error: err.message } });
      }
    }

    if ((want === 'sms' || want === 'both') && r.phone) {
      try {
        await sms.send({
          to: r.phone,
          text: sms.signingText({
            recipientName: r.name, agentName: env.agent_name,
            title: env.title, url, lang: env.language,
          }),
        });
        sent.push(r.phone);
        await logEvent(env.id, kind, req, { recipientId: r.id, actor, detail: { channel: 'sms', to: r.phone } });
      } catch (err) {
        failed.push({ email: r.phone, channel: 'sms', error: err.message });
        await logEvent(env.id, 'send_failed', req, { recipientId: r.id, detail: { channel: 'sms', to: r.phone, error: err.message } });
      }
    }
  }

  return { sent, failed };
}

module.exports = { deliverSigningLinks, pendingRecipients, logEvent, clientIp };
