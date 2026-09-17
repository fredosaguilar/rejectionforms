const https = require('https');

/* RingCentral SMS.
 *
 * Auth is the JWT bearer flow: a long-lived JWT is exchanged for a short-lived
 * access token, which is cached until shortly before it expires. No SDK, so the
 * app takes no extra dependency.
 *
 * Required environment:
 *   RINGCENTRAL_CLIENT_ID
 *   RINGCENTRAL_CLIENT_SECRET
 *   RINGCENTRAL_JWT           (Credentials > JWT in the RingCentral console)
 *   RINGCENTRAL_FROM          (an SMS-enabled number on the account, E.164)
 *   RINGCENTRAL_SERVER        (optional; defaults to production)
 */

const SERVER = (process.env.RINGCENTRAL_SERVER || 'https://platform.ringcentral.com')
  .replace(/^https?:\/\//, '').replace(/\/$/, '');

let cached = { token: null, expires: 0 };

function request({ path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: SERVER, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed || {});
        const msg = (parsed && (parsed.message || parsed.error_description || parsed.error)) || raw;
        reject(new Error(`RingCentral ${res.statusCode}: ${msg}`));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function configured() {
  return !!(process.env.RINGCENTRAL_CLIENT_ID && process.env.RINGCENTRAL_CLIENT_SECRET
         && process.env.RINGCENTRAL_JWT && process.env.RINGCENTRAL_FROM);
}

async function accessToken() {
  if (cached.token && Date.now() < cached.expires) return cached.token;
  if (!configured()) throw new Error('RingCentral is not configured (CLIENT_ID, CLIENT_SECRET, JWT and FROM are required)');

  const basic = Buffer.from(
    `${process.env.RINGCENTRAL_CLIENT_ID}:${process.env.RINGCENTRAL_CLIENT_SECRET}`
  ).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: process.env.RINGCENTRAL_JWT,
  }).toString();

  const out = await request({
    path: '/restapi/oauth/token',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
  // Refresh a minute early rather than racing the expiry.
  cached = { token: out.access_token, expires: Date.now() + ((out.expires_in || 3600) - 60) * 1000 };
  return cached.token;
}

/* E.164 for US/Canada numbers typed the way people actually type them. */
function normalisePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return null;
}

async function send({ to, text }) {
  const number = normalisePhone(to);
  if (!number) throw new Error(`Not a valid mobile number: ${to}`);

  const token = await accessToken();
  const body = JSON.stringify({
    from: { phoneNumber: process.env.RINGCENTRAL_FROM },
    to: [{ phoneNumber: number }],
    text,
  });
  return request({
    path: '/restapi/v1.0/account/~/extension/~/sms',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
}

/* Kept short: carriers split long messages, and a split signing link is a
   broken signing link. */
function signingText({ recipientName, agentName, title, url, lang }) {
  const first = String(recipientName || '').split(/\s+/)[0];
  if (lang === 'es') {
    return `${first}: ${agentName || 'Columbia Basin Insurance'} le envió "${title}" para firmar electrónicamente. Firme aquí: ${url}\n\nNo comparta este enlace. Responda STOP para no recibir mensajes.`;
  }
  return `${first}: ${agentName || 'Columbia Basin Insurance'} sent you "${title}" to sign electronically. Sign here: ${url}\n\nDo not share this link. Reply STOP to opt out.`;
}

/* Exchanges the JWT for a token and throws with the provider's own message if
   the credentials are wrong. Sends nothing, so it is safe to call on demand. */
async function authCheck() {
  cached = { token: null, expires: 0 };   // never report a stale success
  await accessToken();
  return true;
}

module.exports = { send, signingText, normalisePhone, configured, authCheck };
