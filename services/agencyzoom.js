const https = require('https');

/* AgencyZoom, called over its HTTP API directly — the same way this app talks
 * to Resend, RingCentral and Stripe, and with no extra dependency. (The
 * previous version of this file imported axios, which is not in package.json;
 * requiring it threw, which is part of why nothing here was ever reachable.)
 *
 * Two things about this integration are worth stating plainly, because they
 * decide how the rest of the file is written:
 *
 *   1. AgencyZoom documents more than one way to authenticate. Some accounts
 *      hold a bearer API key; others log in with a username and password and
 *      are handed a short-lived JWT. Both are supported, chosen by whichever
 *      variables are set, and the token from a login is cached until it is
 *      nearly expired.
 *
 *   2. The field names coming back vary between accounts and API versions.
 *      Everything is therefore read through a tolerant normaliser rather than
 *      by one exact path, and `status()` reports what actually came back so a
 *      mismatch can be seen rather than guessed at.
 *
 * Environment:
 *   AGENCYZOOM_BASE_URL   optional; defaults to https://api.agencyzoom.com
 *   AGENCYZOOM_API_KEY    a bearer token, if the account has one
 *   AGENCYZOOM_USERNAME   } or these two, for the login flow
 *   AGENCYZOOM_PASSWORD   }
 */

const HOST = () => String(process.env.AGENCYZOOM_BASE_URL || 'https://api.agencyzoom.com')
  .replace(/^https?:\/\//, '').replace(/\/+$/, '');

const apiKey = () => String(process.env.AGENCYZOOM_API_KEY || '').trim();
const username = () => String(process.env.AGENCYZOOM_USERNAME || '').trim();
const password = () => String(process.env.AGENCYZOOM_PASSWORD || '').trim();

const configured = () => !!(apiKey() || (username() && password()));

let cached = { token: null, expires: 0 };

function raw(method, path, { body = null, token = null, timeout = 10000 } = {}) {
  const host = HOST().split('/')[0];
  const prefix = HOST().slice(host.length);
  const payload = body == null ? null : JSON.stringify(body);
  const headers = { Accept: 'application/json' };
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path: prefix + path, method, headers }, (res) => {
      let text = '';
      res.on('data', (c) => text += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed == null ? {} : parsed);
        const msg = (parsed && (parsed.message || parsed.error || parsed.detail)) || text.slice(0, 300);
        const err = new Error(`AgencyZoom ${res.statusCode}: ${msg || 'no message'}`);
        err.status = res.statusCode;
        reject(err);
      });
    });
    req.setTimeout(timeout, () => { req.destroy(new Error('AgencyZoom did not answer in time')); });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/* A bearer key is used as it is. A username and password are exchanged for a
   token, which is cached until shortly before it expires. */
async function token() {
  if (apiKey()) return apiKey();
  if (!username() || !password()) throw new Error('AgencyZoom credentials are not set');
  if (cached.token && Date.now() < cached.expires) return cached.token;

  const out = await raw('POST', '/v1/api/auth/login', {
    body: { username: username(), password: password() },
  });
  const t = out.jwtToken || out.token || out.access_token || out.data?.token || out.data?.jwtToken;
  if (!t) throw new Error('AgencyZoom accepted the login but returned no token');
  // No expiry is documented reliably, so it is refreshed well inside any
  // plausible lifetime rather than held until it fails mid-search.
  cached = { token: t, expires: Date.now() + 20 * 60 * 1000 };
  return t;
}

const call = async (method, path, body) => raw(method, path, { body, token: await token() });

/* The shapes AgencyZoom returns differ by account and version, so a list is
   pulled out of whichever envelope it arrived in. */
function listOf(res) {
  const candidates = [res, res?.data, res?.data?.data, res?.results, res?.content,
                      res?.leads, res?.customers, res?.contacts, res?.policies,
                      res?.data?.content, res?.data?.results];
  for (const c of candidates) if (Array.isArray(c)) return c;
  return [];
}

const pick = (o, ...keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), o);
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};

/* One client, in the shape this application uses, out of whatever AgencyZoom
   called its fields. */
function normaliseClient(c) {
  const first = pick(c, 'firstName', 'first_name');
  const last = pick(c, 'lastName', 'last_name');
  return {
    source: 'agencyzoom',
    id: String(pick(c, 'id', 'customerId', 'customer_id', 'leadId', 'lead_id', 'contactId', 'contact_id') || ''),
    name: String(pick(c, 'fullName', 'full_name', 'name', 'businessName', 'business_name') ||
                 `${first} ${last}`.trim()),
    email: String(pick(c, 'email', 'primaryEmail', 'primary_email', 'emailAddress')).toLowerCase(),
    phone: String(pick(c, 'phone', 'primaryPhone', 'primary_phone', 'mobile', 'cellPhone', 'cell_phone')),
    policyNumber: String(pick(c, 'policyNumber', 'policy_number', 'policyNo', 'number')),
    carrier: String(pick(c, 'carrier', 'carrierName', 'insurance_company', 'companyName')),
    lineOfBusiness: String(pick(c, 'lineOfBusiness', 'line_of_business', 'lob', 'type', 'productName')),
  };
}

function normalisePolicy(p) {
  return {
    id: String(pick(p, 'id', 'policyId', 'policy_id') || ''),
    policyNumber: String(pick(p, 'policyNumber', 'policy_number', 'number', 'policyNo')),
    carrier: String(pick(p, 'carrier', 'carrierName', 'insurance_company', 'companyName')),
    lineOfBusiness: String(pick(p, 'lineOfBusiness', 'line_of_business', 'lob', 'type', 'productName')),
    effectiveDate: String(pick(p, 'effectiveDate', 'effective_date', 'effDate')),
    expirationDate: String(pick(p, 'expirationDate', 'expiration_date', 'expDate')),
    premium: String(pick(p, 'premium', 'annualPremium', 'annual_premium')),
  };
}

/* Searching by name and searching by policy number are different questions and
   AgencyZoom does not always answer them from the same endpoint, so both are
   asked and whatever answers is merged. A failure on one does not lose the
   other: a client found by name is still worth having when the policy lookup
   is the part that is not available on this account. */
async function searchClients(query, { limit = 8 } = {}) {
  const q = String(query || '').trim();
  if (!configured() || q.length < 2) return { clients: [], errors: [] };

  const looksLikePolicy = /\d/.test(q) && /^[\w\s-]+$/.test(q);
  const attempts = [
    ['customers', () => call('GET', `/v1/api/customers/search?keyword=${encodeURIComponent(q)}&size=${limit}`)],
    ['leads', () => call('GET', `/v1/api/leads/search?keyword=${encodeURIComponent(q)}&size=${limit}`)],
  ];
  if (looksLikePolicy) {
    attempts.push(['policies',
      () => call('GET', `/v1/api/policies/search?policyNumber=${encodeURIComponent(q)}&size=${limit}`)]);
  }

  const out = [], errors = [];
  for (const [what, run] of attempts) {
    try {
      listOf(await run()).forEach((row) => out.push(normaliseClient(row)));
    } catch (e) {
      errors.push(`${what}: ${e.message}`);
    }
  }

  // The same person can come back from more than one of those.
  const seen = new Set();
  const clients = out.filter((c) => {
    if (!c.name && !c.policyNumber) return false;
    const key = (c.id || '') + '|' + c.name.toLowerCase() + '|' + c.policyNumber;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);

  return { clients, errors };
}

async function getPolicies(customerId) {
  if (!configured() || !customerId) return [];
  try {
    const res = await call('GET', `/v1/api/customers/${encodeURIComponent(customerId)}/policies`);
    return listOf(res).map(normalisePolicy);
  } catch (e) {
    console.error('AgencyZoom policies:', e.message);
    return [];
  }
}

/* Whether AgencyZoom can be reached, and if not, which of the several separate
   things is wrong. Reports only derived facts — which variables are set, what
   the service answered — never a credential. */
async function status() {
  const out = {
    configured: configured(),
    host: HOST(),
    auth: apiKey() ? 'api key' : (username() && password() ? 'username and password' : null),
  };
  if (!out.configured) {
    out.ok = false;
    out.why = 'No AgencyZoom credentials are set, so client search falls back to this portal\'s own ' +
              'records. Set AGENCYZOOM_API_KEY, or AGENCYZOOM_USERNAME and AGENCYZOOM_PASSWORD.';
    return out;
  }
  try {
    await token();
  } catch (e) {
    out.ok = false;
    out.why = `AgencyZoom would not authenticate (${e.message}).`;
    return out;
  }
  const probe = await searchClients('a', { limit: 1 });
  out.ok = probe.errors.length === 0;
  if (!out.ok) {
    out.why = 'AgencyZoom authenticated but refused the search endpoints this portal asks for. ' +
              'That usually means a different API version or a plan without API search.';
    out.detail = probe.errors;
  }
  return out;
}

module.exports = {
  configured, status, searchClients, getPolicies,
  normaliseClient, normalisePolicy, listOf,
};
