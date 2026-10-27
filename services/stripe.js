const https = require('https');
const crypto = require('crypto');

/* Stripe, called over its HTTP API directly so the app takes no extra
 * dependency — the same way it talks to Resend and RingCentral.
 *
 * The only Stripe product used is Checkout, which is a page hosted by Stripe.
 * The client's card details are typed there and never pass through this
 * application, which is what keeps it out of PCI scope. What comes back is an
 * outcome and, at most, a card brand and last four digits.
 *
 * Required environment:
 *   STRIPE_SECRET_KEY        (sk_test_… while trying it out, sk_live_… for real money)
 *   STRIPE_WEBHOOK_SECRET    (whsec_…; from the endpoint you add in the Stripe dashboard)
 */

const API = 'api.stripe.com';

const rawKey = () => String(process.env.STRIPE_SECRET_KEY || '').trim();

function key() {
  const k = rawKey();
  if (!k) throw new Error('STRIPE_SECRET_KEY is not set');
  return k;
}

const configured = () => !!rawKey();

/* Which set of books this key writes to.
 *
 * Stripe issues two kinds: a standard secret key (sk_) and a restricted key
 * (rk_), and each comes in a test and a live flavour. Reading the mode off
 * "sk_live_" alone missed rk_live_ entirely — a live key read as test mode,
 * and the portal would have said nothing here moves real money while holding
 * one that does. Anything whose shape is not recognised is reported as
 * unknown rather than assumed harmless, because the assumption that costs
 * someone a real charge is the assumption that it was a test.
 */
function mode() {
  const k = rawKey();
  if (!k) return null;
  if (/^(sk|rk)_live_/.test(k)) return 'live';
  if (/^(sk|rk)_test_/.test(k)) return 'test';
  return 'unknown';
}

const live = () => mode() === 'live';

/* A restricted key carries only the permissions it was given, and this app
   needs four: write Checkout Sessions, read PaymentIntents, write Refunds and
   read the account. Saying so up front beats a payment failing at the till. */
const restricted = () => /^rk_/.test(rawKey());

/* Stripe takes form-encoded bodies with bracketed keys for nested data:
   line_items[0][price_data][unit_amount]=1500. */
function form(obj, prefix, out) {
  out = out || [];
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (v === undefined || v === null) return;
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') form(item, `${name}[${i}]`, out);
        else out.push(`${name}[${i}]=${encodeURIComponent(item)}`);
      });
    } else if (typeof v === 'object') {
      form(v, name, out);
    } else {
      out.push(`${name}=${encodeURIComponent(v)}`);
    }
  });
  return out;
}

function request(method, path, params, opts = {}) {
  const body = params ? form(params).join('&') : null;
  const headers = {
    Authorization: `Bearer ${key()}`,
    'Stripe-Version': '2024-06-20',
  };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  // Stripe retries nothing on its own, but this app does: an idempotency key
  // means a repeated create cannot charge a fee twice.
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: API, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(raw); } catch {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(parsed || {});
        // Stripe's own message is the useful one: "No such customer",
        // "Your card was declined", "api key expired".
        const msg = (parsed && parsed.error && (parsed.error.message || parsed.error.type)) || raw;
        reject(new Error(`Stripe ${res.statusCode}: ${msg}`));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* Stripe's name for each way of paying. ACH is a bank debit, which settles in
   days rather than seconds — the caller has to cope with a payment that is
   neither failed nor finished. */
const PM_TYPE = { card: 'card', bank: 'us_bank_account' };

/* A hosted page to pay one fee on.
 *
 * The fee and the processing fee are two line items rather than one total, so
 * the client sees on Stripe's own page exactly what they saw on ours, and the
 * receipt Stripe keeps says the same as the receipt we issue.
 */
async function createCheckout({
  method, feeCents, surchargeCents, description, clientEmail, successUrl, cancelUrl,
  reference, metadata = {}, statementDescriptor,
}) {
  const type = PM_TYPE[method];
  if (!type) throw new Error(`Unknown payment method: ${method}`);

  const items = [{
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: feeCents,
      product_data: { name: description || 'Agency broker fee' },
    },
  }];
  if (surchargeCents > 0) {
    items.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: surchargeCents,
        product_data: {
          name: method === 'bank' ? 'Bank transfer processing fee' : 'Card processing fee',
        },
      },
    });
  }

  const params = {
    mode: 'payment',
    payment_method_types: [type],
    line_items: items,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: reference,
    metadata,
    payment_intent_data: {
      description: `${description || 'Agency broker fee'} — Columbia Basin Insurance`,
      metadata,
    },
  };
  if (clientEmail) params.customer_email = clientEmail;
  // What the client sees on their statement. Stripe allows 5–22 characters and
  // no < > \ ' " *.
  if (statementDescriptor) {
    params.payment_intent_data.statement_descriptor = String(statementDescriptor)
      .replace(/[<>\\'"*]/g, '').slice(0, 22);
  }
  // us_bank_account needs Stripe to be told it may verify the account
  // instantly through the bank rather than by micro-deposits.
  if (method === 'bank') {
    params.payment_method_options = {
      us_bank_account: { verification_method: 'instant' },
    };
  }

  return request('POST', '/v1/checkout/sessions', params,
    { idempotencyKey: reference ? `co_${reference}_${method}_${feeCents + surchargeCents}` : undefined });
}

/* The charge is expanded two levels down on purpose: the card brand and last
   four live on the charge, not on the session or the intent, and without them
   the receipt can only say "Card". */
const getCheckout = (id) =>
  request('GET', `/v1/checkout/sessions/${encodeURIComponent(id)}` +
    '?expand[]=payment_intent&expand[]=payment_intent.latest_charge');

const getIntent = (id) =>
  request('GET', `/v1/payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge`);

const refund = (intentId, amountCents) =>
  request('POST', '/v1/refunds', Object.assign(
    { payment_intent: intentId },
    amountCents ? { amount: amountCents } : {}
  ), { idempotencyKey: `rf_${intentId}_${amountCents || 'all'}` });

/* Verifies that a webhook really came from Stripe.
 *
 * The signature is over the raw request body, so the body must not have been
 * through a JSON parser first. An unsigned or stale delivery is refused: the
 * endpoint is public, and marking a fee paid is not something to do on the
 * word of whoever posted. */
function verifyWebhook(rawBody, signatureHeader, secret, toleranceSeconds = 300) {
  const whsec = String(secret || process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!whsec) throw new Error('STRIPE_WEBHOOK_SECRET is not set');

  const parts = String(signatureHeader || '').split(',').reduce((acc, kv) => {
    const i = kv.indexOf('=');
    if (i > 0) {
      const k = kv.slice(0, i).trim();
      (acc[k] = acc[k] || []).push(kv.slice(i + 1).trim());
    }
    return acc;
  }, {});

  const ts = (parts.t || [])[0];
  const given = parts.v1 || [];
  if (!ts || !given.length) throw new Error('Signature header is missing or malformed');

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!isFinite(age) || age > toleranceSeconds) throw new Error('Signature timestamp is outside the tolerance');

  const expected = crypto.createHmac('sha256', whsec)
    .update(`${ts}.${Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody)}`)
    .digest('hex');
  const eb = Buffer.from(expected);
  const ok = given.some((sig) => {
    const sb = Buffer.from(sig);
    return sb.length === eb.length && crypto.timingSafeEqual(sb, eb);
  });
  if (!ok) throw new Error('Signature does not match');

  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
}

/* Whether a payment can actually be taken, and if not, which of the several
   separate things is missing. Reports only derived facts — a mode, an account
   name, a currency — never the key itself. */
async function status() {
  const out = {
    configured: configured(),
    mode: mode(),
    restricted: restricted(),
    webhookConfigured: !!String(process.env.STRIPE_WEBHOOK_SECRET || '').trim(),
  };
  if (!out.configured) {
    out.ok = false;
    out.why = 'STRIPE_SECRET_KEY is not set, so no payment can be taken. A fee can still be ' +
              'recorded by hand once the client has paid another way.';
    return out;
  }
  if (out.mode === 'unknown') {
    out.ok = false;
    out.why = 'STRIPE_SECRET_KEY does not look like a Stripe key. A key is sk_test_… or sk_live_… ' +
              '(or rk_… for a restricted one) — check that the whole value was pasted, and that it is ' +
              'the secret key rather than the publishable one, which starts pk_.';
    return out;
  }

  try {
    const acct = await request('GET', '/v1/account');
    out.account = acct.business_profile?.name || acct.settings?.dashboard?.display_name || acct.id;
    out.country = acct.country;
    out.chargesEnabled = acct.charges_enabled !== false;
    /* Whether bank transfers can actually be taken. Stripe reports this as a
       capability on the account; where it says nothing at all we say so,
       rather than claiming a yes or a no we cannot see. */
    const ach = acct.capabilities && acct.capabilities.us_bank_account_ach_payments;
    out.ach = ach === 'active' ? 'on' : (ach ? ach : 'unknown');

    /* Whether Link — the processor's own wallet — is switched on.
     *
     * It cannot be turned off from here: Checkout surfaces it alongside the
     * card whenever the account allows it, whatever this application asks for.
     * It matters because an agent keying a client's card in at the desk is
     * then offered to save it against a phone number and sent a code, which is
     * not a thing anyone at a counter can complete. So it is reported, with a
     * way to go and turn it off. */
    try {
      const cfgs = await request('GET', '/v1/payment_method_configurations');
      const list = (cfgs && cfgs.data) || [];
      const on = list.some((c) => c.link && c.link.display_preference &&
        (c.link.display_preference.value === 'on' || c.link.display_preference.value === 'default'));
      out.link = list.length ? (on ? 'on' : 'off') : 'unknown';
    } catch (e) {
      // A restricted key without this permission, or an account that predates
      // payment method configurations. Not worth failing the whole check over.
      out.link = 'unknown';
    }
    if (!out.chargesEnabled) {
      out.ok = false;
      out.why = 'Stripe has this account set up but has not enabled charges on it yet — finish the ' +
                'account details in the Stripe dashboard.';
      return out;
    }
  } catch (e) {
    out.ok = false;
    // A restricted key that cannot read the account is the likeliest cause of
    // a 403 here, and it is fixed in a different place from a bad key.
    out.why = out.restricted && /401|403/.test(e.message)
      ? `Stripe refused this restricted key (${e.message}). A restricted key only does what it was ` +
        'given permission to do; this portal needs write on Checkout Sessions and Refunds, and read ' +
        'on PaymentIntents and the account. Grant those, or use the standard secret key instead.'
      : (/401|403/.test(e.message)
        ? `Stripe rejected the API key (${e.message}).`
        : `Could not reach Stripe (${e.message}).`);
    return out;
  }
  if (!out.webhookConfigured) {
    out.ok = true;
    out.warn = 'STRIPE_WEBHOOK_SECRET is not set. Payments are still confirmed when the client ' +
               'returns from Stripe, but a bank transfer that settles days later, or a client who ' +
               'closes the tab, will not be noticed until someone opens the request.';
    return out;
  }
  out.ok = true;
  return out;
}

module.exports = {
  configured, live, mode, restricted, status, createCheckout, getCheckout, getIntent, refund, verifyWebhook,
  request, PM_TYPE,
};
