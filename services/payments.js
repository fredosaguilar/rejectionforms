const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
// One request goes out by email and by text, which is two rows in the trail and
// one thing that happened. The signing side already folds those together and
// says "email and text"; a receipt should not tell the story differently.
const { groupEvents, channelWords } = require('./esign');

const NAVY = rgb(0.10, 0.29, 0.29);
const GOLD = rgb(0.78, 0.57, 0.16);
const INK  = rgb(0.10, 0.10, 0.10);
const GREY = rgb(0.42, 0.40, 0.38);
const PAID = rgb(0.10, 0.42, 0.27);

const AGENCY_NAME = 'Columbia Basin Insurance';

/* What each recorded event is called, in words. Shared by the receipt and the
   history the agency reads, so the two never describe the same row twice. */
const EVENT_WORDS = {
  created: 'Request created', sent: 'Payment request sent', link_issued: 'New link issued',
  viewed: 'Opened by the client', checkout_started: 'Payment started',
  processing: 'Bank transfer clearing', paid: 'Payment received', failed: 'Payment failed',
  refunded: 'Refunded', voided: 'Cancelled', recorded: 'Recorded by the agency',
  receipt_sent: 'Receipt emailed', receipt_downloaded: 'Receipt downloaded',
  agency_copy_sent: 'Agency copy emailed', send_failed: 'Delivery failed',
};

/* -------------------------------------------------------------------------
   Tokens
   The same arrangement as a signing link: the raw token travels in the link
   and is never stored, so a database read cannot be turned into a payment
   page that charges somebody's card.
   ------------------------------------------------------------------------- */
const newPayToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const publicId = () => crypto.randomBytes(9).toString('base64url');

/* -------------------------------------------------------------------------
   Money
   Cents throughout. A fee is both what the agency is owed and what the client
   is charged, and a float cannot be trusted to agree with either.
   ------------------------------------------------------------------------- */
function centsFromInput(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^0-9.]/g, '');
  if (!s || !/\d/.test(s)) return null;
  const n = Number(s);
  if (!isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function money(cents) {
  const n = Number(cents || 0) / 100;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* What each way of paying costs to accept, charged on to the client.
 *
 * These are the processor's own published rates, not a round number on top of
 * them. A surcharge may not exceed the cost of accepting the card — card
 * network rules cap it at 4% besides — and the flat part matters as much as
 * the percentage: the processor charges 30 cents per card transaction whether
 * the fee is fifty dollars or five hundred.
 *
 * Both rates are held here, in one place, rather than computed at each call
 * site. They are also written into the fee agreement the client signs, so a
 * change here is a change there; the two must say the same thing.
 */
const METHODS = {
  card: {
    key: 'card',
    label: 'Credit or debit card',
    rate: 0.029, flat: 30, max: null,
    note: '2.9% of the agency fee plus $0.30',
    settles: 'immediately',
  },
  bank: {
    key: 'bank',
    label: 'Bank transfer (ACH)',
    rate: 0.008, flat: 0, max: 500,
    note: '0.8% of the agency fee, $5.00 maximum',
    settles: 'in 3–5 business days',
  },
  // A fee taken in the office — cash, a check, a card run on the counter
  // terminal — is recorded here so the client has one receipt and the agency
  // one ledger. Nothing is processed, so nothing is added.
  manual: {
    key: 'manual',
    label: 'Recorded by the agency',
    rate: 0, flat: 0, max: 0,
    note: 'no processing fee',
    settles: 'immediately',
  },
};

function surchargeCents(feeCents, method) {
  const m = METHODS[method];
  if (!m || (!m.rate && !m.flat)) return 0;
  let s = Math.round(Number(feeCents || 0) * m.rate) + (m.flat || 0);
  if (m.max) s = Math.min(s, m.max);
  return s;
}

/* Every way of paying, priced for this particular fee. The payment page shows
   this so the choice is made with both totals in view. */
function methodQuotes(feeCents) {
  return ['card', 'bank'].map((k) => {
    const s = surchargeCents(feeCents, k);
    return {
      method: k,
      label: METHODS[k].label,
      note: METHODS[k].note,
      settles: METHODS[k].settles,
      surchargeCents: s,
      totalCents: Number(feeCents) + s,
    };
  });
}

const totalCents = (r) => Number(r.fee_cents || 0) + Number(r.surcharge_cents || 0);

/* -------------------------------------------------------------------------
   Receipt
   ------------------------------------------------------------------------- */
function receiptNumber(req) {
  // Readable, sortable, and unique without a second counter: the year, the
  // request's own id, and the day it was paid.
  const d = req.paid_at ? new Date(req.paid_at) : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `CBI-${d.getFullYear()}${mm}${dd}-${String(req.id).padStart(4, '0')}`;
}

/* The receipt is read by the client, not by the server it was written on.
   Railway runs in UTC, so a fee paid at eight in the morning would otherwise
   be receipted at three in the afternoon. */
const TZ = process.env.AGENCY_TZ || 'America/Los_Angeles';
function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: TZ,
  });
}

const methodWords = (r) => {
  if (r.method === 'bank') return 'Bank transfer (ACH)';
  if (r.method === 'manual') return 'Recorded by the agency';
  if (r.card_brand || r.card_last4) {
    const brand = String(r.card_brand || 'Card').replace(/^\w/, (c) => c.toUpperCase());
    return r.card_last4 ? `${brand} ending ${r.card_last4}` : brand;
  }
  return 'Card';
};

/* A one-page receipt for a paid fee.
 *
 * It says plainly that it is a receipt for the agency's broker fee and not for
 * insurance premium. A client who files this with their policy papers should
 * not later believe their premium was paid. */
async function buildReceiptPdf(req, events = []) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let y = 742;
  const text = (s, o = {}) => page.drawText(String(s == null ? '' : s), Object.assign(
    { x: 48, y, size: 9.5, font: helv, color: INK }, o));

  page.drawRectangle({ x: 0, y: 762, width: 612, height: 30, color: NAVY });
  page.drawText(AGENCY_NAME, { x: 48, y: 772, size: 12, font: bold, color: rgb(1, 1, 1) });
  page.drawText('PAYMENT RECEIPT', { x: 430, y: 773, size: 9, font: bold, color: GOLD });

  y = 716;
  text('RECEIPT', { size: 16, font: bold, color: NAVY });
  y -= 7;
  page.drawRectangle({ x: 48, y: y - 4, width: 516, height: 1.5, color: GOLD });
  y -= 26;

  const paid = req.status === 'paid';
  page.drawRectangle({
    x: 430, y: y - 9, width: 134, height: 26,
    color: paid ? rgb(0.91, 0.96, 0.93) : rgb(0.98, 0.95, 0.89),
    borderColor: paid ? PAID : GOLD, borderWidth: 0.8,
  });
  page.drawText(paid ? 'PAID' : String(req.status || '').toUpperCase(), {
    x: 446, y: y, size: 11, font: bold, color: paid ? PAID : GOLD });

  const head = [
    ['Receipt number', req.receipt_no || receiptNumber(req)],
    ['Date paid', fmt(req.paid_at)],
    ['Paid by', req.client_name],
    ['Email', req.client_email || '—'],
    ['Policy number', req.policy_number || '—'],
    ['Method', methodWords(req)],
    ['Taken by', req.agent_name || AGENCY_NAME],
  ];
  for (const [k, v] of head) {
    text(k, { size: 8.5, color: GREY });
    text(v, { x: 165, size: 8.5 });
    y -= 15;
  }

  y -= 14;
  text('WHAT WAS PAID', { size: 9, font: bold, color: NAVY });
  y -= 6;
  page.drawRectangle({ x: 48, y: y - 4, width: 516, height: 1, color: GOLD });
  y -= 20;

  const rows = [[req.description || 'Agency broker fee', money(req.fee_cents)]];
  if (Number(req.surcharge_cents) > 0) {
    rows.push([
      req.method === 'bank' ? 'Bank transfer processing fee' : 'Card processing fee',
      money(req.surcharge_cents),
    ]);
  }
  for (const [k, v] of rows) {
    // The description is the agent's own words, so it is wrapped rather than
    // trusted to fit on one line.
    const wrapped = wrap(k, helv, 9.5, 370);
    wrapped.forEach((line, i) => {
      text(line, { size: 9.5 });
      if (i === 0) text(v, { x: 500, size: 9.5 });
      y -= 14;
    });
  }

  y -= 4;
  page.drawRectangle({ x: 48, y: y + 6, width: 516, height: 0.7, color: GREY });
  y -= 8;
  text('Total paid', { size: 11, font: bold });
  text(money(req.paid_cents != null ? req.paid_cents : totalCents(req)), {
    x: 500, size: 11, font: bold });
  y -= 24;

  if (Number(req.refunded_cents) > 0) {
    text(`Refunded: ${money(req.refunded_cents)}`, { size: 9.5, color: GOLD });
    y -= 18;
  }

  y -= 6;
  text('RECORD OF THIS PAYMENT', { size: 9, font: bold, color: NAVY });
  y -= 6;
  page.drawRectangle({ x: 48, y: y - 4, width: 516, height: 1, color: GOLD });
  y -= 18;

  for (const e of groupEvents(events)) {
    if (y < 120) break;
    const words = channelWords(e.channels);
    text(fmt(e.at), { size: 8, color: GREY });
    text((EVENT_WORDS[e.event] || e.event) + (words ? ` \u00b7 ${words}` : ''), { x: 200, size: 8 });
    text(e.actor || '', { x: 360, size: 8, color: GREY });
    y -= 12;
  }

  if (req.provider_intent) {
    y -= 10;
    text(`Processor reference: ${req.provider_intent}`, { size: 7.5, color: GREY });
  }

  page.drawRectangle({ x: 48, y: 72, width: 516, height: 0.7, color: GOLD });
  const foot = [
    `This is a receipt for ${AGENCY_NAME}'s agency broker fee and any processing fee charged on it.`,
    'It is not a receipt for insurance premium, and it is not evidence that a policy has been bound,',
    'issued, or paid. Keep it with your records. Questions? Contact our office.',
  ];
  foot.forEach((line, i) => {
    page.drawText(line, { x: 48, y: 58 - i * 10, size: 7.5, font: helv, color: GREY });
  });

  return Buffer.from(await pdf.save());
}

/* Breaks a line at word boundaries to fit a width in points. */
function wrap(s, font, size, width) {
  const words = String(s == null ? '' : s).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const out = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (font.widthOfTextAtSize(next, size) <= width) line = next;
    else { out.push(line); line = words[i]; }
  }
  out.push(line);
  return out;
}

module.exports = {
  AGENCY_NAME, METHODS, EVENT_WORDS,
  newPayToken, hashToken, publicId,
  centsFromInput, money, surchargeCents, methodQuotes, totalCents,
  receiptNumber, methodWords, fmt, buildReceiptPdf, wrap,
};
