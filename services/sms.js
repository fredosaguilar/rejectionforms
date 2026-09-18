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

/* A JWT copied out of a JSON credentials file, or pasted into a dashboard's
   variable editor, routinely arrives wrapped in quotes, with a trailing
   newline, or line-wrapped. None of that is visible in the dashboard, and all
   of it makes RingCentral answer "Unparseable assertion" before it ever looks
   at the credentials. A real JWT contains no whitespace, so stripping it is
   safe and saves an afternoon. */
function cleanJwt(raw) {
  return String(raw == null ? '' : raw)
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, '');
}

/* Explains what is wrong with the stored JWT without ever echoing it: every
   value below is derived (a count, a length, a date), never the token itself. */
function jwtShape() {
  const raw = process.env.RINGCENTRAL_JWT || '';
  const t = cleanJwt(raw);
  const tidied = t !== raw.trim();

  if (!t) return { ok: false, why: 'RINGCENTRAL_JWT is empty.' };

  const parts = t.split('.');
  if (parts.length !== 3) {
    return { ok: false, tidied, why:
      `RINGCENTRAL_JWT is not a JWT. A JWT is three dot-separated sections; this value has ${parts.length} ` +
      `and is ${t.length} characters long. Copy the token itself from Credentials > JWT in the RingCentral ` +
      'console — not the credential\'s name, and not the whole JSON file.' };
  }

  // A JWT is base64url only. Anything else here — most often a whole JSON
  // credentials file, which happens to split into three parts on the dots of
  // the token inside it — is not the token.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(t)) {
    return { ok: false, tidied, why:
      'RINGCENTRAL_JWT contains characters a JWT cannot contain, so it is not the token itself — most often ' +
      'the whole JSON credentials file. Set this variable to just the token: three dot-separated sections, ' +
      'starting "eyJ".' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, tidied, why:
      'The middle section of RINGCENTRAL_JWT is not readable, so the value is truncated or mis-copied. ' +
      'Paste the token again in full.' };
  }

  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return { ok: false, tidied, why:
      `This JWT expired on ${new Date(payload.exp * 1000).toDateString()}. Generate a new one in the RingCentral console.` };
  }

  // The JWT is minted for one environment. A sandbox token sent to production
  // is rejected, and the message does not say so.
  const aud = String(payload.aud || '');
  if (aud && !aud.includes(SERVER)) {
    return { ok: false, tidied, why:
      `This JWT was issued for ${aud}, but the app is calling ${SERVER}. Either generate the JWT ` +
      'for that environment, or set RINGCENTRAL_SERVER to match.' };
  }

  return { ok: true, tidied };
}

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
    assertion: cleanJwt(process.env.RINGCENTRAL_JWT),
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

/* The numbers the authenticated extension may actually put in `from`.
   RingCentral answers 403 "Phone number doesn't belong to extension" when
   RINGCENTRAL_FROM is a number on the account but assigned to a different
   extension than the one the JWT authenticates as — and it does not say which
   numbers would have worked. This asks. */
async function senderNumbers() {
  const token = await accessToken();
  const out = await request({
    path: '/restapi/v1.0/account/~/extension/~/phone-number?perPage=100',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  return (out.records || []).map((r) => ({
    number: r.phoneNumber,
    label: r.label || r.usageType || '',
    sms: Array.isArray(r.features) && r.features.includes('SmsSender'),
  }));
}

/* Checks RINGCENTRAL_FROM against that list and explains the mismatch rather
   than leaving a 403 to be guessed at. */
async function fromCheck() {
  const from = normalisePhone(process.env.RINGCENTRAL_FROM);
  if (!from) {
    return { ok: false, why: `RINGCENTRAL_FROM is not a usable phone number: "${process.env.RINGCENTRAL_FROM}".` };
  }

  let numbers;
  try {
    numbers = await senderNumbers();
  } catch (e) {
    // Not fatal on its own: the send may still work. Say what happened and
    // let the caller decide.
    return { ok: true, unchecked: true, why: `Could not list the extension's numbers (${e.message}).` };
  }

  const senders = numbers.filter((n) => n.sms);
  if (senders.some((n) => normalisePhone(n.number) === from)) return { ok: true };

  const onExt = numbers.some((n) => normalisePhone(n.number) === from);
  const list = senders.map((n) => n.number + (n.label ? ` (${n.label})` : '')).join(', ');

  if (onExt) {
    return { ok: false, why:
      `${process.env.RINGCENTRAL_FROM} belongs to this extension but is not enabled for SMS. ` +
      (list ? `Numbers on this extension that can send texts: ${list}.`
            : 'No number on this extension can send texts — add SMS to one in the RingCentral admin portal.') };
  }

  return { ok: false, why:
    `${process.env.RINGCENTRAL_FROM} is not assigned to the extension this JWT signs in as, so RingCentral ` +
    'refuses to send from it. ' +
    (list ? `Set RINGCENTRAL_FROM to one of these instead: ${list}.`
          : 'This extension has no SMS-capable number at all — either give it a direct number with SMS enabled, ' +
            'or create the JWT as the user who owns the number you want to text from.') };
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
  try {
    return await request({
      path: '/restapi/v1.0/account/~/extension/~/sms',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    });
  } catch (e) {
    // This one reads as a problem with the recipient; it is not. It is the
    // sending number. Say so where the failure is recorded.
    if (/belong to extension/i.test(e.message)) {
      throw new Error(
        `${e.message} — RINGCENTRAL_FROM (${process.env.RINGCENTRAL_FROM}) is not an SMS-capable number on the ` +
        'extension this JWT signs in as. Use "Test text messaging" for the numbers that are.');
    }
    throw e;
  }
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
  // Catch a malformed token here, where the reason can be explained, rather
  // than letting RingCentral answer with two words.
  const shape = jwtShape();
  if (!shape.ok) throw new Error(shape.why);
  await accessToken();
  return true;
}

module.exports = { send, signingText, normalisePhone, configured, authCheck, jwtShape, senderNumbers, fromCheck };
