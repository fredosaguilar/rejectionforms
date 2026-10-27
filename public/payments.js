/* ============================================================================
   Broker fee payments — take payment for the agency fee
   Columbia Basin Insurance E&O Forms Portal

   Reached from the top navigation at /payments. Creates a fee request, sends
   the client a tokenised payment link by email and text, hands them to the
   processor's own hosted page, and keeps the receipt and the record of what
   was taken. No card number ever reaches this application.
   ========================================================================== */
(function(){
'use strict';

var lastForm = document.getElementById('f-esign') ||
               document.getElementById('f-auth') ||
               document.querySelector('.fc:last-of-type');
if(!lastForm){ console.warn('payments.js: form container not found'); return; }

var navBtn = document.getElementById('nav-pay');
var navEO  = document.getElementById('nav-eo');

var css = document.createElement('style');
css.textContent = [
  '#f-pay .pay-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
  '@media(max-width:720px){#f-pay .pay-grid{grid-template-columns:1fr}}',
  '#f-pay .pay-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}',
  '@media(max-width:860px){#f-pay .pay-grid3{grid-template-columns:1fr}}',
  '#f-pay table.pay-t{width:100%;border-collapse:collapse;font-size:12.5px}',
  '#f-pay table.pay-t th{text-align:left;padding:7px 8px;background:var(--navy);color:#fff;font-weight:500;font-size:11px}',
  '#f-pay table.pay-t td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}',
  '#f-pay .pay-pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:500;text-transform:uppercase;letter-spacing:.04em}',
  '#f-pay .pay-draft{background:#eceae4;color:#6b6560}',
  '#f-pay .pay-sent{background:#f9f0e2;color:#96601a}',
  '#f-pay .pay-processing{background:#e8eef5;color:#1a4a7a}',
  '#f-pay .pay-paid{background:#e9f3ec;color:#1a6b45}',
  '#f-pay .pay-refunded,#f-pay .pay-void{background:#fbecea;color:#a32219}',
  '#f-pay .pay-link{font-size:11.5px;color:var(--navy);text-decoration:none;border:1px solid var(--border2);border-radius:20px;padding:2px 9px;white-space:nowrap;font-family:inherit;background:#fff;cursor:pointer;display:inline-block;margin:0 4px 4px 0}',
  '#f-pay .pay-link:hover{background:var(--bg)}',
  '#f-pay .pay-danger{color:#a32219;border-color:#f0c9c4}',
  '#f-pay .pay-amount{font-size:15px;font-weight:600;color:var(--navy);white-space:nowrap}',
  '#f-pay .pay-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}',
  '@media(max-width:720px){#f-pay .pay-tiles{grid-template-columns:1fr}}',
  '#f-pay .pay-tile{border:1px solid var(--border);border-radius:10px;padding:12px 14px;background:#fff}',
  '#f-pay .pay-tile span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}',
  '#f-pay .pay-tile strong{display:block;font-size:20px;font-weight:600;color:var(--navy);margin-top:3px}',
  '#f-pay .pay-note{font-size:11.5px;color:var(--muted);line-height:1.6;margin-top:6px}',
  '#f-pay .pay-warn{border:1px solid #f0dcb4;background:#fdf7ea;color:#855b0c;border-radius:8px;padding:10px 13px;font-size:12px;line-height:1.6;margin-bottom:14px}',
  '#f-pay .pay-live{border:1px solid #e8b4ad;background:#fbecea;color:#a32219;border-radius:8px;padding:11px 13px;font-size:12.5px;line-height:1.6;margin-bottom:14px}',
  '#f-pay .pay-live code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px}',
  '#f-pay .pay-setup{border:1px solid var(--border);border-radius:10px;background:#fff;margin-bottom:14px;overflow:hidden}',
  '#f-pay .pay-setup-hd{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:var(--bg);border-bottom:1px solid var(--border)}',
  '#f-pay .pay-setup-hd strong{font-size:13px;color:var(--navy)}',
  '#f-pay .pay-step{display:grid;grid-template-columns:26px 1fr;gap:11px;padding:13px 14px;border-bottom:1px solid var(--border);font-size:12.5px;line-height:1.65}',
  '#f-pay .pay-step:last-child{border-bottom:none}',
  '#f-pay .pay-step-n{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;background:#eceae4;color:#6b6560;margin-top:1px}',
  '#f-pay .pay-step.done .pay-step-n{background:#e9f3ec;color:#1a6b45}',
  '#f-pay .pay-step.now .pay-step-n{background:var(--navy);color:#fff}',
  '#f-pay .pay-step h4{margin:0 0 3px;font-size:13px;font-weight:600;color:var(--text)}',
  '#f-pay .pay-step.done h4{color:var(--muted);font-weight:500}',
  '#f-pay .pay-step p{margin:0 0 6px;color:var(--muted)}',
  '#f-pay .pay-copy{display:flex;align-items:center;gap:7px;margin:6px 0;padding:7px 9px;border:1px solid var(--border2);border-radius:6px;background:var(--bg)}',
  '#f-pay .pay-copy code{flex:1;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--text);word-break:break-all}',
  '#f-pay .pay-copy button{flex:none;font-size:11px;padding:4px 10px;border:1px solid var(--border2);border-radius:14px;background:#fff;cursor:pointer;font-family:inherit}',
  '#f-pay .pay-copy button:hover{background:var(--bg)}',
  '#f-pay .pay-step a{color:var(--navy)}',
  '#f-pay .pay-ok{color:#1a6b45;font-weight:500}',
  '#f-pay .pay-no{color:#a35a19;font-weight:500}',
  '#f-pay .pay-quote{border:1px solid var(--border);border-radius:8px;background:var(--bg);padding:10px 13px;font-size:12.5px;line-height:1.8;margin-top:10px}',
  '#f-pay .pay-quote b{color:var(--navy)}',
  '#f-pay .pay-hist td{background:var(--bg)}',
  '#f-pay .pay-agree{border:1px solid var(--border2);border-radius:8px;max-height:190px;overflow:auto;margin-top:8px}',
  '#f-pay .pay-agree button{display:block;width:100%;text-align:left;padding:8px 11px;border:none;border-bottom:1px solid var(--border);background:#fff;font:inherit;font-size:12.5px;cursor:pointer}',
  '#f-pay .pay-agree button:hover{background:var(--bg)}',
  '#f-pay .btn.ready{box-shadow:0 0 0 0 rgba(26,74,74,.45);animation:payPulse 1.1s ease-out 2}',
  '@keyframes payPulse{to{box-shadow:0 0 0 16px rgba(26,74,74,0)}}',
  '@media (prefers-reduced-motion: reduce){#f-pay .btn.ready{animation:none}}',
].join('\n');
document.head.appendChild(css);

var html =
'<div id="f-pay" class="fc">' +
  '<div class="fhdr"><div><div class="ftitle">Collect the agency broker fee</div>' +
  '<div class="fsub">The client pays on the processor’s own secure page · No card details reach this system · Receipt issued automatically</div></div>' +
  '<span class="badge badge-eo">Payments</span></div>' +
  '<div class="fbody">' +

  // Notices first: "Stripe is LIVE" is the thing to read before anything else
  // on this page, not a footnote under the setup steps.
  '<div id="pay-status"></div>' +
  '<div id="pay-setup"></div>' +

  '<div class="sec">' +
    '<div class="sec-title">New payment request</div>' +
    '<p style="font-size:12px;color:var(--muted);margin:4px 0 12px">' +
      'Enter the agency fee only. The processing fee is added on top at the rate disclosed on the fee ' +
      'agreement, and the client sees both before they pay.</p>' +

    '<div class="pay-grid3">' +
      '<div class="fld"><div class="lbl">Client name</div><input type="text" id="pay-name" placeholder="Full legal name"></div>' +
      '<div class="fld"><div class="lbl">Client email</div><input type="email" id="pay-email" placeholder="client@email.com"></div>' +
      '<div class="fld"><div class="lbl">Mobile number</div><input type="tel" id="pay-phone" placeholder="(509) 555-0123"></div>' +
    '</div>' +

    '<div class="pay-grid3">' +
      '<div class="fld"><div class="lbl">Agency broker fee</div><input type="text" id="pay-fee" placeholder="$0.00"></div>' +
      '<div class="fld"><div class="lbl">Policy number (optional)</div><input type="text" id="pay-policy" placeholder="Policy or quote number"></div>' +
      '<div class="fld"><div class="lbl">Language / Idioma</div>' +
        '<select id="pay-lang" style="width:100%;padding:7px 9px;font-size:13px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;background:#fff">' +
          '<option value="en">English</option><option value="es">Español</option></select></div>' +
    '</div>' +

    '<div class="fld"><div class="lbl">What the fee is for</div>' +
      '<input type="text" id="pay-desc" placeholder="e.g. Agency broker fee — commercial auto policy effective 11/01/2026"></div>' +

    '<div id="pay-quote" class="pay-quote" hidden></div>' +

    '<div style="margin-top:8px">' +
      '<button class="btn btn-sec" id="pay-pull" type="button" style="font-size:12px;padding:6px 14px">Pull the fee from a signed fee agreement</button>' +
      '<div id="pay-agreements" class="pay-agree" hidden></div>' +
    '</div>' +

    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
      '<button class="btn btn-pri" id="pay-send" type="button">Create and send by email + text</button>' +
      '<button class="btn btn-sec" id="pay-create" type="button">Create and copy the link</button>' +
      '<button class="btn btn-sec" id="pay-clear" type="button">Clear</button>' +
    '</div>' +
    '<div class="pay-note">Every request records who created it, when it was opened, and how it was paid. ' +
      'A fee that is paid can be refunded but never deleted.</div>' +
  '</div>' +

  '<div class="sec">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<div class="sec-title" style="margin:0">Fee requests</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<input type="search" id="pay-q" placeholder="Search client, policy, description" ' +
          'style="padding:6px 10px;font-size:12.5px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;min-width:230px">' +
        '<select id="pay-filter" style="padding:6px 9px;font-size:12.5px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;background:#fff">' +
          '<option value="">All</option><option value="draft">Not sent</option><option value="sent">Awaiting payment</option>' +
          '<option value="processing">Clearing</option><option value="paid">Paid</option>' +
          '<option value="refunded">Refunded</option><option value="void">Cancelled</option></select>' +
      '</div>' +
    '</div>' +
    '<div class="pay-tiles" id="pay-tiles" style="margin-top:12px"></div>' +
    '<div id="pay-list" style="margin-top:4px"></div>' +
  '</div>' +

  '</div>' +
'</div>';

lastForm.insertAdjacentHTML('afterend', html);

/* ---- shared helpers ---------------------------------------------------- */
function $(id){ return document.getElementById(id); }
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function toast(msg, kind){
  if(typeof showT === 'function') showT(msg, kind || 'info');
  else console.log(msg);
}
async function api(path, opts){
  var r = await fetch(path, opts);
  var d = {};
  try { d = await r.json(); } catch(e){}
  if(!r.ok || (d.success === false && d.error)) throw new Error(d.error || ('Request failed (' + r.status + ')'));
  return d;
}
function when(ts){
  if(!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}
function whenFull(ts){
  if(!ts) return '—';
  return new Date(ts).toLocaleString('en-US', {
    year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' });
}

/* The same accounting format the E&O forms use, so a fee typed here reads the
   way it reads on the agreement it came from. */
if(window.CBIMoney) window.CBIMoney.attach($('pay-fee'), { optionalCents: false });

/* ---- what each way of paying would cost -------------------------------- */
/* Mirrors services/payments.js. It is shown while the fee is typed so the
   agent can answer "how much will it be on the card?" without sending
   anything first; the amount actually charged is always recomputed on the
   server from the fee on the record. */
var RATES = { card: { rate:0.035, min:350, max:null }, bank: { rate:0.008, min:350, max:500 } };
function feeCents(){
  var raw = String($('pay-fee').value || '').replace(/[^0-9.]/g,'');
  var n = parseFloat(raw);
  return isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
function surcharge(cents, method){
  var m = RATES[method];
  var s = Math.max(m.min, Math.round(cents * m.rate));
  return m.max ? Math.min(s, m.max) : s;
}
function money(cents){
  return '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}
function renderQuote(){
  var box = $('pay-quote'), c = feeCents();
  if(!c){ box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML =
    'On a <b>' + esc(money(c)) + '</b> agency fee the client pays<br>' +
    '<b>' + esc(money(c + surcharge(c,'card'))) + '</b> by card ' +
      '<span style="color:var(--muted)">(+' + esc(money(surcharge(c,'card'))) + ' processing)</span><br>' +
    '<b>' + esc(money(c + surcharge(c,'bank'))) + '</b> by bank transfer ' +
      '<span style="color:var(--muted)">(+' + esc(money(surcharge(c,'bank'))) + ', clears in 3–5 business days)</span>';
}
$('pay-fee').addEventListener('input', renderQuote);

/* ---- is there a processor behind this? ---------------------------------

   Setting this up means copying two values out of Stripe into Railway, and
   telling Stripe one address. The address is the part nobody can look up —
   it is where this very application is answering from — so the server
   reports it and the panel hands it over ready to paste, with the state of
   each step read live rather than remembered.

   The panel folds itself away once all three steps are done, and the link
   in its header brings it back. */
var setupOpen = null;   // null = decide from the state; true/false = the agent said

async function loadStatus(){
  try {
    var d = await api('/api/payments/status');
    renderSetup(d);
    renderNotices(d.stripe || {});
  } catch(e){
    $('pay-setup').innerHTML = '';
    $('pay-status').innerHTML = '';
  }
}

function renderNotices(s){
  var box = $('pay-status'), out = '';
  if(!s.configured){ box.innerHTML = ''; return; }

  if(s.mode === 'live'){
    // Said loudly and in its own box. The reassuring version of this message
    // appearing over a live key is how someone runs a client's real card
    // believing it was a test.
    out += '<div class="pay-live"><strong>Stripe is LIVE.</strong> Every payment taken here charges a ' +
      'real card and moves real money. To try the portal out first, swap the key for the test one ' +
      '(<code>sk_test_</code>) and use its own webhook.</div>';
  } else if(s.mode === 'test'){
    out += '<div class="pay-warn"><strong>Stripe is in test mode.</strong> Nothing here moves real ' +
      'money yet — card 4242 4242 4242 4242 with any future expiry will pay a test request.</div>';
  }

  var bits = [];
  if(s.restricted && s.ok){
    bits.push('<strong>This is a restricted key.</strong> It works, but it only does what it was given ' +
      'permission to do. This portal needs write on Checkout Sessions and Refunds, and read on ' +
      'PaymentIntents and the account.');
  }
  if(!s.ok && s.why) bits.push(esc(s.why));
  if(bits.length) out += '<div class="pay-warn">' + bits.join('<br>') + '</div>';

  box.innerHTML = out;
}

function copyRow(value, label){
  return '<div class="pay-copy"><code>' + esc(value) + '</code>' +
    '<button type="button" class="pay-cp" data-copy="' + esc(value) + '">' + esc(label || 'Copy') + '</button></div>';
}

function step(n, state, title, body){
  return '<div class="pay-step ' + state + '">' +
    '<div class="pay-step-n">' + (state === 'done' ? '✓' : n) + '</div>' +
    '<div><h4>' + title + '</h4>' + body + '</div></div>';
}

function renderSetup(d){
  var s = d.stripe || {};
  var box = $('pay-setup');
  // A key that is present but unusable — the wrong value pasted, one Stripe
  // rejects — is not a step anyone should see ticked off.
  var keyDone  = !!(s.configured && s.ok);
  var hookDone = !!s.webhookConfigured;
  var achDone  = s.ach === 'on';
  var allDone  = keyDone && hookDone && achDone;
  var open = setupOpen === null ? !allDone : setupOpen;

  var head = '<div class="pay-setup-hd"><strong>' +
    (allDone ? 'Card payments are set up' : 'Set up card payments') + '</strong>' +
    '<span style="font-size:11.5px;color:var(--muted)">' +
      (keyDone  ? '<span class="pay-ok">Key ✓</span>'     : '<span class="pay-no">Key</span>') + ' · ' +
      (hookDone ? '<span class="pay-ok">Webhook ✓</span>' : '<span class="pay-no">Webhook</span>') + ' · ' +
      (achDone  ? '<span class="pay-ok">Bank transfers ✓</span>'
                : '<span class="pay-no">Bank transfers' + (!s.ach || s.ach === 'unknown' ? '?' : '') + '</span>') +
      '  <button type="button" class="pay-link" id="pay-setup-toggle" style="margin-left:8px">' +
        (open ? 'Hide' : 'Show me how') + '</button>' +
    '</span></div>';

  if(!open){ box.innerHTML = '<div class="pay-setup">' + head + '</div>'; wireSetup(); return; }

  // Test and live are different dashboards. Point at whichever one the key in
  // use belongs to, so the page that opens is the page being configured.
  var mode = s.mode === 'live' ? '' : 'test/';
  var steps = '';

  steps += step(1, keyDone ? 'done' : 'now', 'Copy the secret key into Railway',
    keyDone
      ? '<p>Set, and Stripe accepts it' + (s.account ? ' — ' + esc(s.account) : '') + '. ' +
        (s.mode === 'live'
          ? 'This is a <strong>live</strong> key: payments taken here are real.'
          : 'Running in <strong>test</strong> mode.') +
        (s.restricted ? ' It is a restricted key.' : '') + '</p>'
      : '<p>Open <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noopener">' +
        'dashboard.stripe.com/test/apikeys</a>. In the <em>Standard keys</em> table, click ' +
        '<strong>Reveal test key</strong> on the <em>Secret key</em> row and copy it — it starts ' +
        '<code>sk_test_</code>.</p>' +
        '<p>Then in Railway → this service → <strong>Variables</strong> → ' +
        '<strong>New Variable</strong>, paste it under this name:</p>' +
        copyRow('STRIPE_SECRET_KEY') +
        '<p style="font-size:11.5px">Paste the key itself straight into Railway. It has no reason to ' +
        'pass through anywhere else.</p>');

  steps += step(2, hookDone ? 'done' : (keyDone ? 'now' : ''), 'Tell Stripe where to reach this portal',
    '<p>' + (hookDone
      ? 'Set. Stripe can reach this portal, so a bank transfer that settles days later still lands here.'
      : 'Open <a href="https://dashboard.stripe.com/' + mode + 'webhooks" target="_blank" rel="noopener">' +
        'dashboard.stripe.com/' + mode + 'webhooks</a> and choose <strong>Add endpoint</strong>.') + '</p>' +
    (hookDone ? '' :
      '<p><strong>Endpoint URL</strong> — this portal’s own address, which is:</p>' +
      copyRow(d.webhookUrl || '', 'Copy URL') +
      '<p><strong>Select events</strong> — exactly these four, no others:</p>' +
      copyRow((d.webhookEvents || []).join('  '), 'Copy all four') +
      '<p>Create it, then on the endpoint’s page reveal the <strong>Signing secret</strong> ' +
      '(it starts <code>whsec_</code>) and add that in Railway as:</p>' +
      copyRow('STRIPE_WEBHOOK_SECRET')));

  steps += step(3, achDone ? 'done' : (hookDone ? 'now' : ''), 'Turn on bank transfers',
    achDone
      ? '<p>On. A client paying a large fee can use ACH for $5 rather than card rates.</p>'
      // Absent and "unknown" mean the same thing: Stripe did not say. Only a
      // state it did report is worth calling not on yet.
      : '<p>' + (!s.ach || s.ach === 'unknown'
          ? 'Stripe did not say whether this is on. '
          : 'Not on yet, so only the card option will work. ') +
        'Open <a href="https://dashboard.stripe.com/settings/payment_methods" target="_blank" rel="noopener">' +
        'Settings → Payment methods</a> and enable <strong>ACH Direct Debit</strong>.</p>');

  var foot = '<div class="pay-step"><div class="pay-step-n">⚑</div><div>' +
    '<h4>Going live later</h4>' +
    '<p>Test and live are separate in Stripe: separate keys <em>and</em> separate webhook endpoints. ' +
    'When <code>sk_test_</code> becomes <code>sk_live_</code>, add the endpoint again on ' +
    '<a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener">the live webhooks page</a> ' +
    'and replace the signing secret too — change only the key and bank transfers quietly stop settling.</p>' +
    '<p style="font-size:11.5px">This panel reads the live configuration, so it says when each step has ' +
    'taken. Railway redeploys after a variable changes; give it a minute, then reload this page.</p>' +
    '</div></div>';

  box.innerHTML = '<div class="pay-setup">' + head + steps + foot + '</div>';
  wireSetup();
}

function wireSetup(){
  var t = $('pay-setup-toggle');
  if(t) t.addEventListener('click', function(){
    setupOpen = t.textContent.indexOf('Hide') === 0 ? false : true;
    loadStatus();
  });
  $('pay-setup').querySelectorAll('.pay-cp').forEach(function(b){
    b.addEventListener('click', async function(){
      await copy(b.dataset.copy);
      var was = b.textContent;
      b.textContent = 'Copied';
      setTimeout(function(){ b.textContent = was; }, 1400);
    });
  });
}

/* ---- pulling a fee off an agreement already on file -------------------- */
$('pay-pull').addEventListener('click', async function(){
  var box = $('pay-agreements');
  if(!box.hidden){ box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = '<div style="padding:9px 11px;font-size:12px;color:var(--muted)">Loading…</div>';
  try {
    var d = await api('/api/payments/fee-agreements?q=' + encodeURIComponent($('pay-name').value.trim()));
    if(!d.agreements.length){
      box.innerHTML = '<div style="padding:9px 11px;font-size:12px;color:var(--muted)">No fee agreements on file yet.</div>';
      return;
    }
    box.innerHTML = '';
    d.agreements.forEach(function(a){
      var b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<strong>' + esc(a.clientName || 'No name') + '</strong>' +
        (a.feeCents ? ' — <span style="color:var(--navy);font-weight:600">' + esc(money(a.feeCents)) + '</span>' : ' <span style="color:#a32219">(no fee recorded)</span>') +
        '<br><span style="color:var(--muted);font-size:11.5px">' +
        esc(a.policyNumber || 'No policy number') + ' · ' + esc(when(a.submittedAt)) + '</span>';
      b.addEventListener('click', function(){
        if(a.clientName) $('pay-name').value = a.clientName;
        if(a.clientEmail) $('pay-email').value = a.clientEmail;
        if(a.policyNumber) $('pay-policy').value = a.policyNumber;
        if(a.feeCents){
          $('pay-fee').value = money(a.feeCents);
          if(window.CBIMoney) window.CBIMoney.refresh();
        }
        if(!$('pay-desc').value.trim()){
          $('pay-desc').value = 'Agency broker fee' +
            (a.policyNumber ? ' — policy ' + a.policyNumber : '') +
            (a.carrier ? ' (' + a.carrier + ')' : '');
        }
        pulledFrom = a.id;
        renderQuote();
        box.hidden = true;
        toast('Fee pulled from the agreement on file', 'success');
      });
      box.appendChild(b);
    });
  } catch(e){
    box.innerHTML = '<div style="padding:9px 11px;font-size:12px;color:#a32219">' + esc(e.message) + '</div>';
  }
});
var pulledFrom = null;

/* ---- creating a request ------------------------------------------------ */
function gather(){
  return {
    clientName: $('pay-name').value.trim(),
    clientEmail: $('pay-email').value.trim(),
    clientPhone: $('pay-phone').value.trim(),
    description: $('pay-desc').value.trim(),
    policyNumber: $('pay-policy').value.trim(),
    language: $('pay-lang').value,
    fee: $('pay-fee').value,
    submissionId: pulledFrom,
  };
}
function clearForm(){
  ['pay-name','pay-email','pay-phone','pay-desc','pay-policy','pay-fee'].forEach(function(id){ $(id).value = ''; });
  pulledFrom = null;
  $('pay-quote').hidden = true;
  $('pay-agreements').hidden = true;
}
$('pay-clear').addEventListener('click', clearForm);

async function create(then){
  var body = gather();
  if(!body.clientName){ toast('The client’s name is needed', 'error'); $('pay-name').focus(); return null; }
  if(!body.description){ toast('Say what the fee is for', 'error'); $('pay-desc').focus(); return null; }
  if(!feeCents()){ toast('Enter the agency broker fee', 'error'); $('pay-fee').focus(); return null; }
  return api('/api/payments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

$('pay-send').addEventListener('click', async function(){
  var btn = this;
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    var d = await create();
    if(!d) return;
    btn.textContent = 'Sending…';
    var s = await api('/api/payments/' + d.request.id + '/send', { method: 'POST' });
    if(s.sent && s.sent.length) toast('Payment request sent to ' + s.sent.join(', '), 'success');
    if(s.failed && s.failed.length){
      toast('Could not reach ' + s.failed.map(function(f){ return f.to; }).join(', ') + ' — ' + s.failed[0].error, 'error');
    }
    clearForm();
    loadList();
  } catch(e){
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create and send by email + text';
  }
});

$('pay-create').addEventListener('click', async function(){
  var btn = this;
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    var d = await create();
    if(!d) return;
    await copy(d.url);
    clearForm();
    loadList();
  } catch(e){
    toast(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Create and copy the link';
  }
});

async function copy(url){
  try {
    await navigator.clipboard.writeText(url);
    toast('Payment link copied to the clipboard', 'success');
  } catch(e){
    // A clipboard that refuses — an insecure origin, a denied permission — is
    // not a reason to lose the link.
    window.prompt('Copy this payment link:', url);
  }
}

/* ---- the list ---------------------------------------------------------- */
var listTimer = null;
['pay-q','pay-filter'].forEach(function(id){
  $(id).addEventListener('input', function(){
    clearTimeout(listTimer);
    listTimer = setTimeout(loadList, 250);
  });
});

function statusWord(s){
  return { draft:'Not sent', sent:'Awaiting payment', processing:'Clearing',
           paid:'Paid', refunded:'Refunded', void:'Cancelled' }[s] || s;
}

async function loadList(){
  var el = $('pay-list');
  try {
    var d = await api('/api/payments?q=' + encodeURIComponent($('pay-q').value.trim()) +
                      '&status=' + encodeURIComponent($('pay-filter').value));
    $('pay-tiles').innerHTML =
      '<div class="pay-tile"><span>Collected</span><strong>' + esc(d.totals.paid) + '</strong></div>' +
      '<div class="pay-tile"><span>Outstanding</span><strong>' + esc(d.totals.open) + '</strong></div>' +
      '<div class="pay-tile"><span>Requests open</span><strong>' + esc(String(d.totals.openCount)) + '</strong></div>';

    if(!d.requests.length){
      el.innerHTML = '<div style="font-size:12.5px;color:var(--muted)">No fee requests yet.</div>';
      return;
    }

    var rows = d.requests.map(function(r){
      var amount = r.status === 'paid' || r.status === 'refunded'
        ? (r.paid || r.total) : r.fee;
      var sub = r.status === 'paid' || r.status === 'refunded'
        ? esc(r.methodWords || '') + (r.receipt_no ? ' · ' + esc(r.receipt_no) : '')
        : 'fee only — processing added at checkout';
      var fail = r.failure_reason
        ? '<div style="color:#a32219;font-size:11px;margin-top:3px">Last attempt failed: ' + esc(r.failure_reason) + '</div>'
        : '';
      var refunded = Number(r.refunded_cents) > 0 && r.status !== 'refunded'
        ? '<div style="color:#a35a19;font-size:11px;margin-top:3px">Partly refunded</div>' : '';

      var acts = [];
      var open = r.status === 'draft' || r.status === 'sent';
      if(open){
        acts.push(act('send', r.id, r.status === 'draft' ? 'Send' : 'Resend'));
        acts.push(act('link', r.id, 'Copy link'));
        acts.push(act('record', r.id, 'Record a payment', 'Paid in the office — cash, check or counter terminal'));
      }
      if(r.status !== 'draft') acts.push(act('history', r.id, 'History'));
      if(r.status === 'paid' || r.status === 'refunded'){
        acts.push('<a class="pay-link" href="/api/payments/' + r.id + '/receipt" target="_blank" rel="noopener">Receipt</a>');
      }
      if(r.status === 'paid') acts.push(act('refund', r.id, 'Refund', '', true));
      if(open) acts.push(act('void', r.id, 'Cancel', '', true));
      if(open || r.status === 'void') acts.push(act('delete', r.id, 'Delete', '', true));

      return '<tr data-id="' + r.id + '">' +
        '<td><div style="font-weight:500">' + esc(r.client_name) + '</div>' +
          '<div style="color:var(--muted);font-size:11.5px">' + esc(r.description) + '</div>' +
          '<div style="color:var(--muted);font-size:11px">' +
            esc(r.policy_number || 'No policy number') + ' · ' + esc(r.agent_name || '—') + '</div>' +
          fail + refunded + '</td>' +
        '<td><div class="pay-amount">' + esc(amount) + '</div>' +
          '<div style="color:var(--muted);font-size:11px">' + sub + '</div></td>' +
        '<td><span class="pay-pill pay-' + esc(r.status) + '">' + esc(statusWord(r.status)) + '</span>' +
          '<div style="color:var(--muted);font-size:11px;margin-top:4px">' +
            (r.paid_at ? 'Paid ' + esc(when(r.paid_at))
              : r.sent_at ? 'Sent ' + esc(when(r.sent_at))
              : 'Created ' + esc(when(r.created_at))) + '</div>' +
          (r.viewed_at && !r.paid_at ? '<div style="color:var(--muted);font-size:11px">Opened ' + esc(when(r.viewed_at)) + '</div>' : '') +
        '</td>' +
        '<td>' + acts.join('') + '</td>' +
      '</tr>';
    }).join('');

    el.innerHTML = '<table class="pay-t"><thead><tr>' +
      '<th>Client</th><th>Amount</th><th>Status</th><th>Actions</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    el.querySelectorAll('.pay-act').forEach(function(b){ b.addEventListener('click', onAct); });
  } catch(e){
    el.innerHTML = '<div style="font-size:12.5px;color:#a32219">' + esc(e.message) + '</div>';
  }
}

function act(name, id, label, title, danger){
  return '<button type="button" class="pay-link pay-act' + (danger ? ' pay-danger' : '') + '" ' +
    'data-act="' + name + '" data-id="' + id + '"' +
    (title ? ' title="' + esc(title) + '"' : '') + '>' + esc(label) + '</button>';
}

async function onAct(){
  var btn = this, id = btn.dataset.id, what = btn.dataset.act;
  var row = btn.closest('tr');
  var name = row.querySelector('td div').textContent;

  if(what === 'history') return history_(btn, id);

  var body = null, confirmText = null;
  if(what === 'record'){
    var note = window.prompt('How was this fee paid? (cash, check number, counter terminal)');
    if(note === null) return;
    if(!note.trim()){ toast('Say how it was paid', 'error'); return; }
    body = { note: note.trim() };
  }
  if(what === 'refund'){
    var amt = window.prompt('Refund how much? Leave blank to refund the whole payment.', '');
    if(amt === null) return;
    body = amt.trim() ? { amount: amt.trim() } : {};
    confirmText = 'Refund ' + (amt.trim() || 'the whole payment') + ' to ' + name + '?';
  }
  if(what === 'void'){
    var why = window.prompt('Cancel this request? Say why, for the record.', '');
    if(why === null) return;
    body = { reason: why.trim() };
  }
  if(what === 'delete'){
    confirmText = 'Delete the fee request for ' + name + '? This cannot be undone.';
  }
  if(confirmText && !window.confirm(confirmText)) return;

  var was = btn.textContent;
  btn.disabled = true; btn.textContent = '…';
  try {
    if(what === 'delete'){
      await api('/api/payments/' + id, { method: 'DELETE' });
      toast('Request deleted', 'success');
    } else if(what === 'link'){
      var d = await api('/api/payments/' + id + '/link', { method: 'POST' });
      await copy(d.url);
      toast('A new link was issued — any link sent before this one has stopped working', 'info');
    } else {
      var res = await api('/api/payments/' + id + '/' + what, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      if(what === 'send'){
        if(res.sent && res.sent.length) toast('Sent to ' + res.sent.join(', '), 'success');
        if(res.failed && res.failed.length){
          toast('Could not reach ' + res.failed.map(function(f){ return f.to; }).join(', ') +
                ' — ' + res.failed[0].error, 'error');
        }
      } else if(what === 'record'){
        toast('Recorded as paid — the receipt is on its way', 'success');
      } else if(what === 'refund'){
        toast('Refunded', 'success');
      } else if(what === 'void'){
        toast('Request cancelled', 'info');
      }
    }
    loadList();
  } catch(e){
    toast(e.message, 'error');
    btn.disabled = false; btn.textContent = was;
  }
}

var EVENT_WORDS = {
  created:'Request created', sent:'Payment request sent', link_issued:'New link issued',
  viewed:'Opened by the client', checkout_started:'Payment started', processing:'Bank transfer clearing',
  paid:'Payment received', failed:'Payment failed', refunded:'Refunded', voided:'Cancelled',
  recorded:'Recorded by the agency', receipt_sent:'Receipt emailed',
  receipt_downloaded:'Receipt downloaded', agency_copy_sent:'Agency copy emailed',
  send_failed:'Delivery failed',
};
/* "email and text", the way someone would say it. The server has already
   folded the two deliveries of one request into a single row. */
function channelWords(list){
  var names = (list || []).map(function(c){ return c === 'sms' ? 'text' : c; });
  if(names.length < 2) return names[0] || '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

async function history_(btn, id){
  var row = btn.closest('tr');
  var open = row.nextElementSibling;
  if(open && open.classList.contains('pay-hist')){ open.remove(); btn.textContent = 'History'; return; }

  btn.disabled = true; btn.textContent = 'Loading…';
  try {
    var d = await api('/api/payments/' + id);
    var events = d.events || [];
    var opens = events.filter(function(e){ return e.event === 'viewed'; });

    var seen = opens.length
      ? '<span style="color:var(--ok)">Opened ' + opens.length + (opens.length === 1 ? ' time' : ' times') +
        '</span> · first ' + esc(whenFull(opens[0].at)) +
        (opens.length > 1 ? ' · last ' + esc(whenFull(opens[opens.length - 1].at)) : '')
      : '<span style="color:#a35a19">Not opened yet</span>';

    var lines = events.map(function(e){
      var extra = '';
      var chans = channelWords(e.channels);
      if(e.detail || chans){
        var bits = [];
        if(chans) bits.push(chans);
        // A failed delivery names the address it failed to reach; a successful
        // one does not need to, because the request already says who it is for.
        if(e.event === 'send_failed' && e.detail && e.detail.to) bits.push(e.detail.to);
        e.detail = e.detail || {};
        if(e.detail.amount) bits.push(e.detail.amount);
        if(e.detail.method) bits.push(e.detail.method);
        if(e.detail.note) bits.push(e.detail.note);
        if(e.detail.reason) bits.push(e.detail.reason);
        if(e.detail.error) bits.push(e.detail.error);
        if(bits.length) extra = ' · ' + esc(bits.join(' · '));
      }
      return '<tr><td style="padding:3px 10px 3px 0;white-space:nowrap;color:var(--muted);font-size:11.5px">' +
        esc(whenFull(e.at)) + '</td>' +
        '<td style="padding:3px 10px 3px 0;font-size:11.5px">' + esc(EVENT_WORDS[e.event] || e.event) + extra + '</td>' +
        '<td style="padding:3px 0;font-size:11.5px;color:var(--muted)">' + esc(e.actor || '') + '</td></tr>';
    }).join('');

    var tr = document.createElement('tr');
    tr.className = 'pay-hist';
    tr.innerHTML = '<td colspan="4">' +
      '<div style="font-size:12px;margin-bottom:8px">' + seen + '</div>' +
      '<table style="width:100%;border-collapse:collapse">' + lines + '</table>' +
      '</td>';
    row.insertAdjacentElement('afterend', tr);
    btn.textContent = 'Hide history';
  } catch(e){
    toast(e.message, 'error');
    btn.textContent = 'History';
  } finally {
    btn.disabled = false;
  }
}

/* ---- the tab itself ---------------------------------------------------- */
/* This module wraps ST last, so its writes to the nav are the ones that stand.
   It therefore only ever clears E&O Forms — never lights it up — or a trip to
   any other page would leave two links looking current. The fee agreement's
   own wrapper is what restores E&O Forms when the forms are what is open. */
function setNav(active){
  if(navBtn){ navBtn.style.background = active ? 'rgba(255,255,255,.15)' : 'none';
              navBtn.style.color      = active ? '#fff' : 'rgba(255,255,255,.7)'; }
  if(active && navEO){ navEO.style.background = 'none'; navEO.style.color = 'rgba(255,255,255,.7)'; }
}
if(navBtn){
  navBtn.addEventListener('click', function(e){
    e.preventDefault();
    history.pushState({}, '', '/payments');
    ST('pay');
  });
}

var _ST = window.ST;
window.ST = function(id){
  if(typeof _ST === 'function') _ST(id);
  setNav(id === 'pay');
  if(id === 'pay'){ loadStatus(); loadList(); }
};

if(location.pathname === '/payments'){ ST('pay'); }

// Client details typed at the top of the workspace prefill the request, the
// same way they prefill the first signer on a signature request.
var gName = document.getElementById('global-client-name');
var gMail = document.getElementById('global-client-email');
function prefill(){
  if(gName && gName.value && !$('pay-name').value) $('pay-name').value = gName.value;
  if(gMail && gMail.value && !$('pay-email').value) $('pay-email').value = gMail.value;
}
if(gName) gName.addEventListener('change', prefill);
if(gMail) gMail.addEventListener('change', prefill);
prefill();
})();
