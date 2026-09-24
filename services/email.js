const https = require('https');

const FROM = process.env.MAIL_FROM || 'Columbia Basin Insurance <noreply@columbiabasininsurance.com>';

/* Resend's HTTP API, called directly so the app takes no extra dependency. */
function send({ to, subject, html, replyTo, attachments }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return Promise.reject(new Error('RESEND_API_KEY is not set'));

  const payload = { from: FROM, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  // [{ filename, content: Buffer }] — Resend takes the content base64 encoded.
  if (attachments && attachments.length) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : String(a.content),
    }));
  }
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com',
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(raw)); } catch { resolve({}); }
        } else {
          // Surface the provider's own message; a bounced signing link is not
          // something to swallow.
          let msg = raw;
          try { msg = JSON.parse(raw).message || raw; } catch {}
          reject(new Error(`Resend ${res.statusCode}: ${msg}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* The address mail is sent from, pulled out of "Name <a@b.com>" or a bare
   address. The domain is what Resend has to have verified. */
function fromAddress() {
  const raw = String(FROM || '').trim();
  const m = raw.match(/<([^>]+)>/);
  const addr = (m ? m[1] : raw).trim();
  const at = addr.lastIndexOf('@');
  return { address: addr, domain: at > -1 ? addr.slice(at + 1).toLowerCase() : '' };
}

function apiGet(path) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return Promise.reject(new Error('RESEND_API_KEY is not set'));
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.resend.com', path, method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed || {});
        const msg = (parsed && (parsed.message || parsed.error)) || raw;
        reject(new Error(`Resend ${res.statusCode}: ${msg}`));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/* Whether mail can actually go out, and if not, which of the several
   independent things is missing. Sends nothing, so it is safe to call on
   demand. Every value it reports is derived — a domain name, a status, a
   from address — never the API key.

   The three failure modes are quite different and the send-time error does not
   distinguish them: no key; a key that Resend rejects; and a key that works
   while the domain being sent from is unverified, which is the one that makes
   mail silently land in spam or bounce. */
async function status() {
  const from = fromAddress();
  const out = { from: from.address, domain: from.domain, configured: !!process.env.RESEND_API_KEY };

  if (!process.env.RESEND_API_KEY) {
    out.ok = false;
    out.why = 'RESEND_API_KEY is not set, so no email can be sent.';
    return out;
  }

  let domains;
  try {
    domains = await apiGet('/domains');
  } catch (e) {
    out.ok = false;
    out.why = /401|403/.test(e.message)
      ? `Resend rejected the API key (${e.message}).`
      : `Could not reach Resend (${e.message}).`;
    return out;
  }

  const list = (domains && (domains.data || domains)) || [];
  out.domains = (Array.isArray(list) ? list : []).map((d) => ({
    name: d.name, status: d.status, region: d.region,
  }));

  if (!from.domain) {
    out.ok = false;
    out.why = `MAIL_FROM has no email address in it: "${from.address}".`;
    return out;
  }

  const mine = out.domains.find((d) => String(d.name).toLowerCase() === from.domain);
  if (!mine) {
    out.ok = false;
    out.why = `${from.domain} is not on this Resend account, so mail from ${from.address} will be refused. ` +
      (out.domains.length
        ? `Verified there: ${out.domains.map((d) => d.name + ' (' + d.status + ')').join(', ')}.`
        : 'No domains have been added to the account yet.');
    return out;
  }

  if (String(mine.status).toLowerCase() !== 'verified') {
    out.ok = false;
    out.why = `${from.domain} is on the account but its status is "${mine.status}" — the DNS records are not in place yet, ` +
      'so mail will be refused or treated as spam.';
    return out;
  }

  out.ok = true;
  return out;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shell(inner) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#1a4a4a;padding:18px 22px">
    <div style="color:#fff;font-size:15px;font-weight:500">Columbia Basin Insurance</div>
    <div style="color:#c8922a;font-size:10px;letter-spacing:.08em;text-transform:uppercase">Document Signing</div>
  </div>
  <div style="padding:24px 22px;background:#fff;border:1px solid #e0dcd4;border-top:none">${inner}</div>
  <div style="padding:14px 22px;color:#6b6560;font-size:11px;line-height:1.6">
    This link is unique to you. Please do not forward it — anyone holding it can sign in your name.
  </div>
</div>`;
}

const COPY = {
  en: {
    sent: (a, t) => `${a} has sent you a document to review and sign electronically: <strong>${t}</strong>.`,
    cta: 'Review &amp; sign document',
    foot: 'You will be asked to consent to using electronic records before signing. You may decline, and you may request a paper copy at no charge.',
    doneLead: (t) => `<strong>${t}</strong> has been signed by all parties. Your completed copy, including the certificate of completion, is available here:`,
    doneCta: 'Download signed document',
    doneFoot: 'Please retain this for your records.',
    subjSign: (t) => `Please sign: ${t}`,
    subjDone: (t) => `Signed: ${t}`,
    noForward: 'This link is unique to you. Please do not forward it — anyone holding it can sign in your name.',
  },
  es: {
    sent: (a, t) => `${a} le ha enviado un documento para revisar y firmar electrónicamente: <strong>${t}</strong>.`,
    cta: 'Revisar y firmar documento',
    foot: 'Antes de firmar se le pedirá su consentimiento para usar registros electrónicos. Puede negarse a firmar y puede solicitar una copia en papel sin costo alguno.',
    doneLead: (t) => `<strong>${t}</strong> ha sido firmado por todas las partes. Su copia completa, incluido el certificado de finalización, está disponible aquí:`,
    doneCta: 'Descargar documento firmado',
    doneFoot: 'Conserve este documento para sus registros.',
    subjSign: (t) => `Por favor firme: ${t}`,
    subjDone: (t) => `Firmado: ${t}`,
    noForward: 'Este enlace es exclusivo para usted. No lo reenvíe — cualquier persona que lo tenga puede firmar en su nombre.',
  },
};
const copy = (lang) => COPY[lang] || COPY.en;

function shellL(inner, lang) {
  return shell(inner).replace(
    'This link is unique to you. Please do not forward it — anyone holding it can sign in your name.',
    esc(copy(lang).noForward));
}

function signingRequest({ recipientName, agentName, title, message, url, lang }) {
  const c = copy(lang);
  return shellL(`
    <p style="margin:0 0 14px;font-size:14px">${esc(recipientName)},</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6">
      ${c.sent(esc(agentName || 'Columbia Basin Insurance'), esc(title))}
    </p>
    ${message ? `<p style="margin:0 0 18px;padding:12px 14px;background:#f7f5f0;border-left:3px solid #c8922a;font-size:13px;line-height:1.6">${esc(message)}</p>` : ''}
    <p style="margin:0 0 22px">
      <a href="${esc(url)}" style="display:inline-block;background:#1a4a4a;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px">${c.cta}</a>
    </p>
    <p style="margin:0;font-size:12px;color:#6b6560;line-height:1.6">${esc(c.foot)}</p>`, lang);
}

/* The agency's own copy of a finished document. It is internal, so it says who
   signed and when, and carries the signed PDF itself rather than a link: a
   completion link is built from a signer's token, and that is not something to
   hand to a third mailbox. */
function agencyCopy({ title, fileName, signers, envelopeId, completedAt }) {
  const rows = (signers || []).map((s) => `
    <tr>
      <td style="padding:5px 10px 5px 0;font-size:13px">${esc(s.name)}</td>
      <td style="padding:5px 10px 5px 0;font-size:12px;color:#6b6560">${esc(s.email)}</td>
      <td style="padding:5px 0;font-size:12px;color:#6b6560">${esc(s.signedAt || '')}</td>
    </tr>`).join('');

  return shell(`
    <p style="margin:0 0 14px;font-size:14px"><strong>${esc(title)}</strong> has been signed by all parties.</p>
    <p style="margin:0 0 6px;font-size:12px;color:#6b6560">The signed document, including its certificate of completion, is attached.</p>
    <table style="margin:14px 0;border-collapse:collapse">${rows}</table>
    <p style="margin:0;font-size:11.5px;color:#6b6560">
      Original file: ${esc(fileName || '—')}<br>
      Envelope: ${esc(envelopeId || '—')}<br>
      Completed: ${esc(completedAt || '')}
    </p>`);
}

function completedNotice({ recipientName, title, url, lang }) {
  const c = copy(lang);
  return shellL(`
    <p style="margin:0 0 14px;font-size:14px">${esc(recipientName)},</p>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6">${c.doneLead(esc(title))}</p>
    <p style="margin:0 0 22px">
      <a href="${esc(url)}" style="display:inline-block;background:#1a4a4a;color:#fff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px">${c.doneCta}</a>
    </p>
    <p style="margin:0;font-size:12px;color:#6b6560">${esc(c.doneFoot)}</p>`, lang);
}

module.exports = { send, signingRequest, completedNotice, agencyCopy, esc, copy, status, fromAddress };
