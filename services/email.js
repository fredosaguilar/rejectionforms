const https = require('https');

const FROM = process.env.MAIL_FROM || 'Columbia Basin Insurance <noreply@columbiabasininsurance.com>';

/* Resend's HTTP API, called directly so the app takes no extra dependency. */
function send({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return Promise.reject(new Error('RESEND_API_KEY is not set'));

  const payload = { from: FROM, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
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

module.exports = { send, signingRequest, completedNotice, esc, copy };
