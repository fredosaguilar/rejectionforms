const crypto = require('crypto');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const NAVY = rgb(0.10, 0.29, 0.29);
const GOLD = rgb(0.78, 0.57, 0.16);
const INK  = rgb(0.10, 0.10, 0.10);
const GREY = rgb(0.42, 0.40, 0.38);

/* -------------------------------------------------------------------------
   Tokens
   The raw token goes in the emailed link and is never stored. The database
   keeps only its SHA-256, so a database read cannot be turned into a signature.
   ------------------------------------------------------------------------- */
function newSigningToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function publicId() {
  return crypto.randomBytes(9).toString('base64url');
}

/* Timing-safe compare for token hashes. */
function tokenMatches(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short', timeZone: 'UTC',
  });
}

/* -------------------------------------------------------------------------
   Laying a typed value out inside its box

   A text field holds whatever was typed into it, which may be a sentence or a
   paragraph rather than a word. Rather than let it run across the page or
   shrink to nothing on one line, it is wrapped to the width of its own box and
   sized down only as far as it takes to fit the height.
   ------------------------------------------------------------------------- */

/* Helvetica here is WinAnsi-encoded, and drawText throws on anything it cannot
   encode. Free text now reaches this point, so characters outside that set are
   dropped rather than allowed to fail the whole document. */
function drawable(text) {
  return String(text).replace(/\r\n?/g, '\n').replace(/\t/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC]/g, '');
}

/* Breaks the value into lines that fit `w`, honouring any line breaks that were
   typed and splitting a word that is wider than the box on its own. Returns
   null when not even one character fits, which tells the caller to try a
   smaller size. */
function wrapToWidth(font, text, w, size) {
  const fits = (str) => font.widthOfTextAtSize(str, size) <= w;
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (!fits(word)) {
        let cut = word.length - 1;
        while (cut > 1 && !fits(word.slice(0, cut))) cut -= 1;
        if (cut <= 1) return null;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (fits(next)) line = next;
      else { if (line) lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

/* The largest size at which the whole value fits the box, wrapped. Falls back
   to the smallest legible size and as many lines as the box holds. */
function layoutValue(font, text, w, h) {
  const clean = drawable(text);
  const start = Math.min(12, Math.max(4, h * 0.7));
  for (let size = start; size >= 4; size -= 0.5) {
    const lines = wrapToWidth(font, clean, w, size);
    if (lines && lines.length * (size * 1.18) <= h) return { size, lead: size * 1.18, lines };
  }
  const size = 4;
  const lead = size * 1.18;
  const lines = wrapToWidth(font, clean, w, size) || [clean];
  return { size, lead, lines: lines.slice(0, Math.max(1, Math.floor(h / lead))) };
}

/* Email and text go out as two deliveries and either can fail on its own, so
   the trail records one event per channel. Read back they are one act — a
   request sent, a reminder sent — so consecutive entries for the same event,
   the same recipient and the same moment are shown as one line naming both
   channels. Nothing is dropped: the rows stay as they were written.  */
function groupEvents(events) {
  const out = [];
  for (const e of (events || [])) {
    const detail = typeof e.detail === 'string' ? safeJson(e.detail) : e.detail;
    const channel = detail && detail.channel;
    const prev = out[out.length - 1];
    if (channel && prev && prev.event === e.event && prev.actor === e.actor &&
        prev.recipient_id === e.recipient_id &&
        Math.abs(new Date(e.at) - new Date(prev.at)) < 120000) {
      if (!prev.channels.includes(channel)) prev.channels.push(channel);
      continue;
    }
    out.push(Object.assign({}, e, { channels: channel ? [channel] : [] }));
  }
  return out;
}
function safeJson(v) { try { return JSON.parse(v); } catch (_) { return null; } }

/* "email and text", the way someone would say it. */
function channelWords(channels) {
  const names = (channels || []).map((c) => (c === 'sms' ? 'text' : c));
  if (names.length < 2) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

/* -------------------------------------------------------------------------
   Signed document assembly

   ESIGN §101(a) and RCW 19.360.030 require the signature to be "attached to or
   logically associated with" the record. Two things establish that here: each
   signature is drawn into the document itself, and a certificate page binds the
   signatures to the SHA-256 of the exact bytes that were signed.
   ------------------------------------------------------------------------- */
async function buildSignedPdf({ envelope, recipients, events, fields = [] }) {
  const pdf = await PDFDocument.load(envelope.file_bytes);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ---- Placed fields ------------------------------------------------------
  // Stamped in place before any page is appended, so page numbers still refer
  // to the document the signer actually saw.
  const pages = pdf.getPages();
  for (const f of fields) {
    if (!f.filled_at) continue;
    const page = pages[(f.page || 1) - 1];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();

    // Stored top-left origin -> pdf-lib's bottom-left origin.
    const x = f.x * pw;
    const w = f.w * pw;
    const h = f.h * ph;
    const y = ph - (f.y * ph) - h;

    if (f.value_png) {
      try {
        const raw = String(f.value_png).replace(/^data:image\/png;base64,/, '');
        const img = await pdf.embedPng(Buffer.from(raw, 'base64'));
        // Fit inside the box without distorting the drawn signature.
        const scale = Math.min(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        page.drawImage(img, { x: x + (w - dw) / 2, y: y + (h - dh) / 2, width: dw, height: dh });
      } catch (e) {
        page.drawText('[signature]', { x, y: y + 2, size: 8, font: helv, color: GREY });
      }
    } else if (f.value) {
      // Wrapped to the box and shrunk only as far as needed, so a long entry
      // stays inside its own borders instead of overrunning the page.
      const { size, lead, lines } = layoutValue(helv, f.value, w, h);
      const block = lines.length * lead;
      let ly = y + (h + block) / 2 - lead + (lead - size) / 2 + 1;
      for (const line of lines) {
        page.drawText(line, { x, y: ly, size, font: helv, color: INK });
        ly -= lead;
      }
    }
  }

  // ---- Signature page -----------------------------------------------------
  // Skipped when the sender placed fields: the signatures are already on the
  // pages where they belong, and a second copy would be misleading.
  const placed = fields.some((f) => f.filled_at);
  const sigPage = placed ? null : pdf.addPage([612, 792]);
  let y = 742;

  if (sigPage) {
  sigPage.drawText('ELECTRONIC SIGNATURES', {
    x: 48, y, size: 14, font: bold, color: NAVY,
  });
  y -= 6;
  sigPage.drawRectangle({ x: 48, y: y - 4, width: 516, height: 1.5, color: GOLD });
  y -= 26;

  sigPage.drawText(`Document: ${envelope.title}`, { x: 48, y, size: 10, font: helv, color: INK });
  y -= 14;
  sigPage.drawText(`Original file: ${envelope.file_name}`, { x: 48, y, size: 9, font: helv, color: GREY });
  y -= 26;

  for (const r of recipients) {
    if (r.status !== 'signed') continue;

    if (y < 200) { y = 742; pdf.addPage([612, 792]); }

    sigPage.drawText(r.name, { x: 48, y, size: 11, font: bold, color: INK });
    y -= 14;
    sigPage.drawText(r.email, { x: 48, y, size: 9, font: helv, color: GREY });
    y -= 20;

    if (r.signature_png) {
      try {
        const raw = r.signature_png.replace(/^data:image\/png;base64,/, '');
        const img = await pdf.embedPng(Buffer.from(raw, 'base64'));
        const w = 180;
        const h = (img.height / img.width) * w;
        sigPage.drawImage(img, { x: 48, y: y - h + 8, width: w, height: h });
        y -= h + 2;
      } catch (e) {
        sigPage.drawText('[signature image could not be rendered]', {
          x: 48, y, size: 8, font: helv, color: GREY,
        });
        y -= 12;
      }
    }

    sigPage.drawLine({
      start: { x: 48, y }, end: { x: 300, y },
      thickness: 0.7, color: INK,
    });
    y -= 12;

    if (r.typed_name) {
      sigPage.drawText(`Typed as intent to sign: ${r.typed_name}`, {
        x: 48, y, size: 8.5, font: helv, color: GREY,
      });
      y -= 12;
    }
    sigPage.drawText(`Signed ${fmt(r.signed_at)}  ·  IP ${r.signed_ip || '—'}`, {
      x: 48, y, size: 8.5, font: helv, color: GREY,
    });
    y -= 12;
    sigPage.drawText(`Consented to electronic records ${fmt(r.consent_at)}`, {
      x: 48, y, size: 8.5, font: helv, color: GREY,
    });
    y -= 28;
  }
  }

  // ---- Certificate of completion -----------------------------------------
  // Always appended, whether or not fields were placed. This page is the
  // evidentiary record of the transaction, so it is never conditional.
  let cert = pdf.addPage([612, 792]);
  let cy = 742;
  /* The trail used to stop wherever the first page ran out, which on a busy
     envelope quietly dropped the end of the record it exists to preserve. It
     now continues onto as many pages as it takes. */
  const certRoom = (need) => {
    if (cy - need >= 96) return;
    cert = pdf.addPage([612, 792]);
    cy = 742;
    cert.drawText('CERTIFICATE OF COMPLETION (continued)', {
      x: 48, y: cy, size: 10, font: bold, color: NAVY });
    cy -= 8;
    cert.drawRectangle({ x: 48, y: cy - 4, width: 516, height: 1, color: GOLD });
    cy -= 22;
  };

  cert.drawText('CERTIFICATE OF COMPLETION', { x: 48, cy, y: cy, size: 14, font: bold, color: NAVY });
  cy -= 6;
  cert.drawRectangle({ x: 48, y: cy - 4, width: 516, height: 1.5, color: GOLD });
  cy -= 24;

  const originalHash = envelope.file_sha256;
  const lines = [
    ['Document', envelope.title],
    ['Envelope ID', envelope.public_id],
    ['Original file', envelope.file_name],
    ['Original SHA-256', originalHash],
    ['Sent by', `${envelope.agent_name || '—'} <${envelope.agent_email || '—'}>`],
    ['Disclosure language', envelope.language === 'es' ? 'Spanish (español)' : 'English'],
    ['Created', fmt(envelope.created_at)],
    ['Sent', fmt(envelope.sent_at)],
    ['Completed', fmt(new Date())],
  ];
  for (const [k, v] of lines) {
    cert.drawText(k, { x: 48, y: cy, size: 8.5, font: helv, color: GREY });
    cert.drawText(String(v), { x: 165, y: cy, size: 8.5, font: helv, color: INK });
    cy -= 14;
  }

  cy -= 10;
  cert.drawText('Signers', { x: 48, y: cy, size: 10.5, font: bold, color: NAVY });
  cy -= 16;
  for (const r of recipients) {
    certRoom(62);
    cert.drawText(`${r.name} <${r.email}>`, { x: 48, y: cy, size: 9, font: bold, color: INK });
    cy -= 12;
    cert.drawText(`status ${r.status}  ·  consented ${fmt(r.consent_at)}  ·  signed ${fmt(r.signed_at)}`, {
      x: 48, y: cy, size: 8, font: helv, color: GREY,
    });
    cy -= 11;
    // How often this person opened the document, and when they first and last
    // did. Read from the trail, so it says what was recorded rather than what
    // a status column happens to hold.
    const opens = events.filter((e) => e.event === 'viewed' && e.recipient_id === r.id);
    const opened = opens.length
      ? `opened ${opens.length} ${opens.length === 1 ? 'time' : 'times'}  ·  first ${fmt(opens[0].at)}` +
        (opens.length > 1 ? `  ·  last ${fmt(opens[opens.length - 1].at)}` : '')
      : 'never opened the signing link';
    cert.drawText(opened, { x: 48, y: cy, size: 8, font: helv, color: GREY });
    cy -= 11;
    cert.drawText(`IP ${r.signed_ip || r.consent_ip || '—'}`, { x: 48, y: cy, size: 8, font: helv, color: GREY });
    cy -= 11;
    const ua = (r.signed_ua || r.consent_ua || '—').slice(0, 95);
    cert.drawText(ua, { x: 48, y: cy, size: 7, font: helv, color: GREY });
    cy -= 18;
  }

  cy -= 6;
  certRoom(30);
  cert.drawText('Audit trail', { x: 48, y: cy, size: 10.5, font: bold, color: NAVY });
  cy -= 16;
  for (const e of groupEvents(events)) {
    certRoom(e.ip ? 20 : 10);
    const who = e.actor ? ` — ${e.actor}` : '';
    const how = e.channels && e.channels.length ? ` (${channelWords(e.channels)})` : '';
    cert.drawText(drawable(`${fmt(e.at)}   ${e.event}${how}${who}`), { x: 48, y: cy, size: 7.5, font: helv, color: INK });
    cy -= 10;
    if (e.ip) {
      cert.drawText(`      IP ${e.ip}`, { x: 48, y: cy, size: 7, font: helv, color: GREY });
      cy -= 10;
    }
  }

  // The statute note closes the certificate, on whichever page the trail ended.
  cert.drawText(
    'This certificate records an electronic signature transaction under the federal ESIGN Act',
    { x: 48, y: 65, size: 7, font: helv, color: GREY });
  cert.drawText(
    '(15 U.S.C. ch. 96), the Washington Uniform Electronic Transactions Act (RCW 19.360) and the',
    { x: 48, y: 56, size: 7, font: helv, color: GREY });
  cert.drawText(
    'Oregon Uniform Electronic Transactions Act (ORS 84.001 to 84.061).',
    { x: 48, y: 47, size: 7, font: helv, color: GREY });

  const out = Buffer.from(await pdf.save());
  return { bytes: out, hash: sha256(out) };
}

module.exports = { groupEvents, channelWords,
  newSigningToken, hashToken, sha256, publicId, tokenMatches, buildSignedPdf,
};
