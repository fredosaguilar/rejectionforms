/* ============================================================================
   E-Signature — send documents for electronic signature
   Columbia Basin Insurance E&O Forms Portal

   Reached from the top navigation at /esign. Uploads a PDF, collects
   recipients, emails tokenised signing links, and tracks status and the
   audit trail for each envelope.
   ========================================================================== */
(function(){
'use strict';

var lastForm = document.getElementById('f-auth') || document.querySelector('.fc:last-of-type');
if(!lastForm){ console.warn('esign.js: form container not found'); return; }

var navBtn = document.getElementById('nav-esign');
var navEO  = document.getElementById('nav-eo');

var css = document.createElement('style');
css.textContent = [
  '#f-esign .es-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
  '@media(max-width:720px){#f-esign .es-grid{grid-template-columns:1fr}}',
  '#f-esign .es-drop{border:1.5px dashed var(--border2);border-radius:var(--radius);padding:20px;text-align:center;background:var(--bg);cursor:pointer}',
  '#f-esign .es-drop.over{border-color:var(--navy);background:#f0f4f4}',
  '#f-esign .es-drop .es-file{font-size:13px;color:var(--text);font-weight:500}',
  '#f-esign .es-rcpt{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center}',
  '@media(max-width:720px){#f-esign .es-rcpt{grid-template-columns:1fr}}',
  '#f-esign .es-x{padding:6px 10px;border:1px solid var(--border2);border-radius:var(--radius);background:transparent;cursor:pointer;color:var(--muted);font-family:inherit}',
  '#f-esign table.es-t{width:100%;border-collapse:collapse;font-size:12.5px}',
  '#f-esign table.es-t th{text-align:left;padding:7px 8px;background:var(--navy);color:#fff;font-weight:500;font-size:11px}',
  '#f-esign table.es-t td{padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:top}',
  '#f-esign .es-pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10.5px;font-weight:500;text-transform:uppercase;letter-spacing:.04em}',
  '#f-esign .es-draft{background:#eceae4;color:#6b6560}',
  '#f-esign .es-sent{background:#f9f0e2;color:#96601a}',
  '#f-esign .es-completed{background:#e9f3ec;color:#1a6b45}',
  '#f-esign .es-declined,#f-esign .es-voided{background:#fbecea;color:#a32219}',
  '#f-esign .btn-row{display:flex;gap:8px;justify-content:flex-end;padding:1rem 1.25rem;border-top:1px solid var(--border)}',
  '#f-esign .es-link{font-size:11.5px;color:var(--navy);text-decoration:none;border:1px solid var(--border2);border-radius:20px;padding:2px 9px;white-space:nowrap}',
  '#f-esign button.es-link{font-family:inherit;background:#fff;cursor:pointer}',
  '#f-esign button.es-link:hover{border-color:var(--navy)}',
  '#f-esign button.es-link:disabled{opacity:.5;cursor:default}',
  '#f-esign .es-danger{color:#a32219}',
  '#f-esign .es-doc{display:flex;align-items:center;gap:9px;padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius);background:#fff;margin-top:7px}',
  '#f-esign .es-doc-n{width:20px;height:20px;border-radius:50%;background:var(--navy);color:#fff;font-size:11px;line-height:20px;text-align:center;flex:0 0 auto}',
  '#f-esign .es-doc-name{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '#f-esign .es-doc-meta{font-size:11px;color:var(--muted);flex:0 0 auto}',
  '#f-esign .es-doc button{font-family:inherit;font-size:12px;line-height:1;padding:4px 8px;border:1px solid var(--border2);border-radius:var(--radius);background:#fff;cursor:pointer;flex:0 0 auto}',
  '#f-esign .es-doc button:disabled{opacity:.35;cursor:default}',
  '#f-esign .es-rcpt-num{font-size:12px;font-weight:700;color:var(--navy);text-align:center}',
  '#f-esign .es-rcpt-nav{display:flex;gap:6px;align-items:center}',
  '#f-esign .es-rcpt-nav button{padding:5px 8px;border:1px solid var(--border2);border-radius:7px;background:#fff;cursor:pointer}',
  '#f-esign button.es-link.es-on{background:var(--navy);color:#fff;border-color:var(--navy)}',
  '#f-esign .es-danger:hover{border-color:#a32219}',
  // The field placer is a full-viewport workspace: the page it is preparing is
  // the whole job, so it gets the whole screen rather than a band inside a
  // form the reader has to scroll down to.
  '#f-esign #es-place-sec{position:fixed;inset:0;z-index:600;margin:0;padding:0;border:none;border-radius:0;background:#f4f2ee;display:flex;flex-direction:column}',
  '#f-esign #es-place-sec[hidden]{display:none}',
  '#f-esign .es-ovbar{flex:0 0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:9px 16px;background:#fff;border-bottom:1px solid var(--border)}',
  '#f-esign .es-ovttl{font-size:13px;font-weight:600;color:var(--navy);margin-right:auto}',
  '#f-esign .es-studio{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:230px 1fr}',
  '@media(max-width:900px){#f-esign .es-studio{grid-template-columns:1fr;grid-template-rows:auto minmax(60vh,1fr);overflow:hidden}#f-esign .es-palette{max-height:34vh;border-right:0;border-bottom:1px solid var(--border)}#f-esign .es-stage{min-height:60vh}}',
  '#f-esign .es-palette{overflow:auto;padding:14px;background:#fff;border:none;border-right:1px solid var(--border);border-radius:0}',
  '#f-esign .es-who{border-left:3px solid;padding:9px 10px;border-radius:0 var(--radius) var(--radius) 0;background:var(--bg);margin-bottom:10px}',
  '#f-esign .es-who-name{font-size:12.5px;font-weight:600;margin-bottom:7px}',
  '#f-esign .es-chips{display:flex;flex-wrap:wrap;gap:5px}',
  '#f-esign .es-chip{font-family:inherit;font-size:11px;padding:4px 9px;border-radius:20px;border:1px solid var(--border2);background:#fff;color:var(--text);cursor:pointer;white-space:nowrap}',
  '#f-esign .es-chip:hover{border-color:var(--navy)}',
  '#f-esign .es-chip.on{color:#fff}',
  '#f-esign .es-preview-signature{font:italic 16px/1.1 "Segoe Script","Brush Script MT",cursive}#f-esign .es-preview-check{font-size:18px;color:var(--navy)}',
  '#f-esign .es-stage{min-width:0;min-height:0;display:flex;flex-direction:column;background:#eceae4;padding:9px;border:none;border-radius:0}',
  '#f-esign .es-scroll{flex:1 1 auto;min-height:0;width:100%;overflow:auto;display:flex;flex-direction:column;gap:24px;align-items:center;justify-content:flex-start;padding:20px}',
  '#f-esign .es-zoom{display:flex;gap:4px;align-items:center}',
  '#f-esign .es-zoom button{font-family:inherit;font-size:12px;line-height:1;min-width:30px;padding:5px 10px;border:1px solid var(--border2);border-radius:var(--radius);background:#fff;cursor:pointer}',
  '#f-esign .es-zoom button:hover{border-color:var(--navy)}',
  '#f-esign .es-pgbar{display:flex;gap:10px;align-items:center;font-size:11.5px;color:var(--muted)}',
  '#f-esign .es-pgbar button{font-family:inherit;font-size:11.5px;padding:3px 10px;border:1px solid var(--border2);border-radius:var(--radius);background:#fff;cursor:pointer}',
  '#f-esign .es-pgbar button:disabled{opacity:.4;cursor:default}',
  '#f-esign .es-page{position:relative;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.16);width:fit-content}',
  '#f-esign .es-page-wrap{flex:0 0 auto;max-width:100%}',
  '#f-esign .es-page canvas{display:block}',
  '#f-esign .es-layer{position:absolute;inset:0;cursor:default}',
  '#f-esign .es-fld{position:absolute;border:1.5px solid;border-radius:3px;font-size:10px;display:flex;align-items:center;justify-content:center;overflow:visible;cursor:move;user-select:none;touch-action:none}',
  '#f-esign .es-fld-label{display:block;max-width:100%;max-height:100%;overflow:hidden;pointer-events:none;padding:0 4px;text-align:center;line-height:1.2}',
  '#f-esign .es-fld-text{pointer-events:auto;width:100%;border:none;background:transparent;font-family:inherit;font-size:12px;color:inherit;text-align:center;padding:2px 0;outline:none;cursor:text}',
  '#f-esign .es-fld-text::placeholder{color:currentColor;opacity:.45;font-size:10px}',
  '#f-esign .es-fld-text:focus{background:rgba(255,255,255,.75);border-radius:3px}',
  '#f-esign .es-fld-tag{position:absolute;left:0;right:0;bottom:-14px;font-size:9px;opacity:.75;text-align:center;pointer-events:none;white-space:nowrap}',
  // The button that is now the thing to do. Twice, then it stops.
  '#f-esign .btn.ready{box-shadow:0 0 0 0 rgba(26,74,74,.45);animation:esReady 1.1s ease-out 2}',
  '@keyframes esReady{to{box-shadow:0 0 0 16px rgba(26,74,74,0)}}',
  '@media (prefers-reduced-motion: reduce){#f-esign .btn.ready{animation:none}}',
  '#f-esign .es-chip{border-radius:7px;min-width:105px;min-height:44px;touch-action:none;cursor:grab;white-space:normal;text-align:center}#f-esign .es-chip:active{cursor:grabbing}',
  '#f-esign .es-field-sample{display:block;font-size:11px;font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#f-esign .es-chip small{display:block;font-size:9px;opacity:.7}',
  '.es-drag-ghost{position:fixed;z-index:1000;pointer-events:none;display:flex;align-items:center;justify-content:center;width:150px;height:44px;border:2px solid;border-radius:5px;background:#fff;box-shadow:0 8px 22px #0003;font-size:11px}',
  '#f-esign .es-fld .es-del{position:absolute;z-index:3;top:-12px;right:-12px;width:24px;height:24px;border:2px solid #fff;border-radius:50%;background:#a32219;color:#fff;font-size:16px;line-height:20px;text-align:center;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25)}',
  '#f-esign .es-fld .es-rz{position:absolute;right:-5px;bottom:-5px;width:12px;height:12px;border-radius:2px;background:#fff;border:1.5px solid currentColor;cursor:nwse-resize}',
  '#f-esign .es-rcpt3{display:grid;grid-template-columns:32px minmax(160px,1fr) minmax(160px,1fr) 150px auto auto;gap:8px;margin-bottom:8px;align-items:center}',
  '@media(max-width:900px){#f-esign .es-rcpt3{grid-template-columns:1fr}}',
  '#f-esign .es-pgnum{text-align:center;font-size:11px;color:var(--muted);margin-bottom:4px}'
].join('');
document.head.appendChild(css);

var html =
'<div id="f-esign" class="fc">' +
  '<div class="fhdr"><div><div class="ftitle">Send a document for electronic signature</div>' +
  '<div class="fsub">ESIGN Act (15 U.S.C. ch. 96) · Washington UETA (RCW 19.360) · Recipients consent to electronic records before signing</div></div>' +
  '<span class="badge badge-eo">E-Signature</span></div>' +
  '<div class="fbody">' +

  '<div class="es-workflow">' +
    '<div class="es-workflow-head">' +
      '<div><div class="es-kicker">New signature request</div><div class="es-workflow-title">Prepare and send</div></div>' +
      '<div class="es-autosave"><span></span> Draft saved automatically</div>' +
    '</div>' +
    '<div class="es-stepper" role="tablist" aria-label="Signature request steps">' +
      '<button type="button" class="es-step active" data-es-go="1"><span>1</span><div><strong>Document</strong><small>Upload and details</small></div></button>' +
      '<button type="button" class="es-step" data-es-go="2"><span>2</span><div><strong>Recipients</strong><small>Who needs to sign</small></div></button>' +
      '<button type="button" class="es-step" data-es-go="3"><span>3</span><div><strong>Place fields</strong><small>Required for every signer</small></div></button>' +
      '<button type="button" class="es-step" data-es-go="4"><span>4</span><div><strong>Review & send</strong><small>Confirm and deliver</small></div></button>' +
    '</div>' +

  '<div class="es-pane active" data-es-pane="1">' +

  '<div class="sec"><div class="es-section-head"><span class="es-section-icon">PDF</span><div><div class="sec-title">Choose your document</div><p>Upload one or more PDFs. We’ll combine them in the order shown.</p></div></div>' +
    '<div class="es-drop" id="es-drop">' +
      '<div class="es-file" id="es-file">Click to choose PDFs, or drop them here</div>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">PDFs only, 15 MB combined. Several files are joined into one document, in the order below.</div>' +
      '<input type="file" id="es-input" accept="application/pdf" multiple style="display:none">' +
    '</div>' +
    '<div id="es-files"></div>' +
    '<div class="es-grid" style="margin-top:12px">' +
      '<div class="fld"><div class="lbl">Document title</div><input type="text" id="es-title" placeholder="e.g. Broker fee agreement — G. Ayala"></div>' +
    '</div>' +
    '<div class="fld" style="margin-top:10px;max-width:320px"><div class="lbl">Signing language / Idioma de firma</div>' +
      '<select id="es-lang" style="width:100%;padding:7px 9px;font-size:13px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;background:#fff">' +
        '<option value="en">English</option><option value="es">Español</option>' +
      '</select>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:5px">Sets the language of the consent disclosure, the signing page and the notifications. Recorded on the certificate.</div>' +
    '</div>' +
    '<div id="es-docnote" style="font-size:11.5px;color:#a32219;margin-top:8px"></div>' +
  '</div>' +
  '<div class="es-pane-actions"><span></span><button class="btn btn-pri" id="es-next-doc" type="button">Continue to recipients &rarr;</button></div>' +
  '</div>' +

  '<div class="es-pane" data-es-pane="2">' +
  '<div class="sec"><div class="es-section-head"><span class="es-section-icon">02</span><div><div class="sec-title">Add recipients</div><p>The first signer gets a link now. Each next signer receives a link after the previous person signs.</p></div></div>' +
    '<p style="font-size:12px;color:var(--muted)">Start typing a saved signer’s name or email to fill in their contact details. Move recipients up or down to set signing order.</p>' +
    '<datalist id="es-name-suggestions"></datalist><datalist id="es-email-suggestions"></datalist><div id="es-rcpts"></div>' +
    '<button class="btn btn-sec" id="es-add" style="margin-top:8px">+ Add another recipient</button>' +
  '</div>' +
  '<div class="es-pane-actions"><button class="btn btn-sec" data-es-back="1" type="button">&larr; Back</button><button class="btn btn-pri" id="es-next-rcpt" type="button">Continue to field placement &rarr;</button></div>' +
  '</div>' +

  '<div class="es-pane" data-es-pane="3">' +
    '<div class="sec"><div class="es-section-head"><span class="es-section-icon">03</span><div><div class="sec-title">Place required signature fields</div><p>The PDF opens in a continuous, scrollable view. Add at least one signature field for every recipient.</p></div></div>' +
      '<div class="es-review-card"><div><span>Document</span><strong id="es-place-doc">PDF ready</strong></div><div><span>Recipients</span><strong id="es-place-rcpts">1 recipient</strong></div><div><span>Requirement</span><strong>Signature for each person</strong></div></div>' +
      '<button class="btn btn-pri" id="es-openplace" type="button" hidden>Open field placement &rarr;</button>' +
      '<div id="es-place-problem" hidden style="margin-top:10px;font-size:12.5px;color:#a32219;line-height:1.6">' +
        '<div id="es-place-problem-text"></div>' +
        '<button class="btn btn-sec" id="es-place-retry" type="button" style="margin-top:8px;font-size:12px;padding:6px 14px">Try again</button>' +
      '</div>' +
    '</div>' +
    '<div class="es-pane-actions"><button class="btn btn-sec" data-es-back="2" type="button">&larr; Back</button><span>Complete field placement to continue</span></div>' +
  '</div>' +

  '<div class="es-pane" data-es-pane="4">' +
    '<div class="es-review-grid">' +
      '<div class="sec"><div class="es-section-head"><span class="es-section-icon">04</span><div><div class="sec-title">Review and send</div><p>Confirm the request before it is delivered by both email and text.</p></div></div>' +
        '<div class="es-review-card"><div><span>Document</span><strong id="es-review-doc">No document selected</strong></div><div><span>Recipients</span><strong id="es-review-rcpts">1 recipient</strong></div><div><span>Fields</span><strong id="es-review-fields">Required</strong></div></div>' +
        '<div id="es-order-summary" style="font-size:12px;line-height:1.7;color:var(--text)"></div>' +
      '</div>' +
      '<aside class="es-send-summary"><div class="es-kicker">Ready to send?</div><h3>Review request</h3><p>The first signer receives email and text now. The rest receive their links in order after each signature.</p><div class="es-send-note">Recipients must consent to electronic records before signing. Daily reminders are automatic until signed, up to seven times. Every action is recorded in the completion certificate.</div></aside>' +
    '</div>' +
    '<div class="es-pane-actions"><button class="btn btn-sec" data-es-back="3" type="button">&larr; Back</button><div><button class="btn btn-sec" id="es-reset">Clear draft</button><button class="btn btn-pri" id="es-send">Send by email + text</button></div></div>' +
  '</div>' +

  '</div>' +

  '<div class="sec" id="es-place-sec" hidden>' +
    '<div class="es-ovbar">' +
      '<span class="es-ovttl">Place fields</span>' +
      '<span class="es-pgbar">' +
        '<span id="es-pgnum">Scroll to review every page</span>' +
      '</span>' +
      '<span class="es-zoom">' +
        '<button id="es-zout" type="button" title="Smaller">&minus;</button>' +
        '<button id="es-zfit" type="button" title="Fit the whole page">Fit</button>' +
        '<button id="es-zin" type="button" title="Larger">+</button>' +
        '<span id="es-zlvl" style="min-width:40px;text-align:right;font-size:11.5px;color:var(--muted)">100%</span>' +
      '</span>' +
      '<button class="btn btn-sec" id="es-savedraft" type="button" style="font-size:12px;padding:6px 14px">Save &amp; exit</button>' +
      '<button class="btn btn-pri" id="es-doneplace" type="button" style="font-size:12px;padding:6px 18px">Done</button>' +
    '</div>' +
    '<div class="es-studio">' +
      '<div class="es-palette">' +
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">Drag a field onto the PDF</div>' +
        '<div id="es-who-list"></div>' +
        '<button class="btn btn-sec" id="es-clearfields" style="width:100%;font-size:12px;padding:6px 10px;margin-top:4px">Clear all fields</button>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5"><span id="es-count">0 fields</span><br>Drag a field to move it, or its corner to resize.</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5">Required: every recipient must have at least one signature field before you can continue.</div>' +
      '</div>' +
      '<div class="es-stage"><div class="es-scroll" id="es-stage-inner"></div></div>' +
    '</div>' +
  '</div>' +

  '<div class="sec es-sent-section"><div class="es-section-head"><span class="es-section-icon">✓</span><div><div class="sec-title">All signature requests</div><p>Track delivery, signatures, reminders, and completed PDFs across all agents.</p></div></div>' +
    '<div id="es-list"><div style="font-size:12.5px;color:var(--muted)">Loading…</div></div>' +
  '</div>' +

  '</div>' +
'</div>';

lastForm.insertAdjacentHTML('afterend', html);

/* ---- guided request workflow ----------------------------------------- */
var esStep = 1;
/* Marks the button that is now the thing to do. Fires on the change, not on
   every keystroke, so it nudges once rather than flickering while you type. */
function setReady(el, on){
  if(!el) return;
  var was = el.dataset.ready === '1';
  if(on === was) return;
  el.dataset.ready = on ? '1' : '';
  el.classList.remove('ready');
  if(on){ void el.offsetWidth; el.classList.add('ready'); }
}
function refreshReady(){
  var titled = !!document.getElementById('es-title').value.trim();
  setReady(document.getElementById('es-next-doc'), esStep === 1 && files.length > 0 && titled);
  var rows = rcpts ? rcpts.querySelectorAll('.es-rcpt').length : 0;
  setReady(document.getElementById('es-next-rcpt'),
    esStep === 2 && rows > 0 && validRecipients().length === rows);
  var place = document.getElementById('es-openplace');
  setReady(place, esStep === 3 && place && !place.hidden);
  setReady(document.getElementById('es-doneplace'),
    !document.getElementById('es-place-sec').hidden && missingSignatureRecipients().length === 0);
  setReady(document.getElementById('es-send'), esStep === 4);
}

function goEsStep(n){
  esStep = Math.max(1, Math.min(4, n));
  document.querySelectorAll('#f-esign .es-pane').forEach(function(p){
    p.classList.toggle('active', Number(p.dataset.esPane) === esStep);
  });
  document.querySelectorAll('#f-esign .es-step').forEach(function(s){
    var at = Number(s.dataset.esGo);
    s.classList.toggle('active', at === esStep);
    s.classList.toggle('complete', at < esStep);
  });
  if(esStep === 3 && docs.length){
    if(suppressFieldAutosave){ restoreLocalFields(); suppressFieldAutosave=false; }
    openPlacer(); renderAllPages();
  }
  if(esStep === 4) refreshReview();
  // Leaving a step drops its nudge, so coming back to it nudges again.
  ['es-next-doc','es-next-rcpt','es-openplace','es-doneplace','es-send'].forEach(function(id){
    var el = document.getElementById(id); if(el){ el.dataset.ready = ''; el.classList.remove('ready'); }
  });
  refreshReady();
  var panel = document.getElementById('f-esign');
  if(panel) panel.scrollIntoView({ behavior:'smooth', block:'start' });
}
function validRecipients(){
  var complete = [];
  document.querySelectorAll('#es-rcpts .es-rcpt').forEach(function(r){
    var name=r.querySelector('.es-name').value.trim();
    var email=r.querySelector('.es-email').value.trim();
    var phone=r.querySelector('.es-phone').value.trim();
    if(name && email && phone) complete.push(r);
  });
  return complete;
}
function refreshReview(){
  var title=document.getElementById('es-title').value.trim();
  var doc=document.getElementById('es-review-doc');
  var people=document.getElementById('es-review-rcpts');
  var field=document.getElementById('es-review-fields');
  if(doc) doc.textContent=title || (files[0] && files[0].name) || 'No document selected';
  var count=validRecipients().length;
  if(people) people.textContent=count + (count===1?' recipient':' recipients');
  var order=document.getElementById('es-order-summary');
  if(order) order.innerHTML='<strong>Signing order</strong><br>' + recipientNames().map(function(n,i){
    return (i+1) + '. ' + esc(n) + (i<count-1?' → ':'');
  }).join(' ');
  if(field) field.textContent=fields.length ? fields.length + (fields.length===1?' field placed':' fields placed') : 'Fields required';
  var placeDoc=document.getElementById('es-place-doc');
  var placePeople=document.getElementById('es-place-rcpts');
  if(placeDoc) placeDoc.textContent=title || (files[0] && files[0].name) || 'No document selected';
  if(placePeople) placePeople.textContent=count + (count===1?' recipient':' recipients');
}
function missingSignatureRecipients(){
  return recipientNames().filter(function(_, i){
    return !fields.some(function(f){ return f.recipientIndex === i && f.type === 'signature'; });
  });
}
document.querySelectorAll('#f-esign [data-es-go]').forEach(function(b){ b.addEventListener('click',function(){
  var target=Number(b.dataset.esGo); if(target<esStep) goEsStep(target);
}); });
document.querySelectorAll('#f-esign [data-es-back]').forEach(function(b){ b.addEventListener('click',function(){ goEsStep(Number(b.dataset.esBack)); }); });
document.getElementById('es-next-doc').addEventListener('click',function(){
  if(!files.length){ showT('Choose at least one PDF to continue','error'); return; }
  if(!document.getElementById('es-title').value.trim()){ showT('Add a document title to continue','error'); document.getElementById('es-title').focus(); return; }
  goEsStep(2);
});
document.getElementById('es-next-rcpt').addEventListener('click',function(){
  if(validRecipients().length !== document.querySelectorAll('#es-rcpts .es-rcpt').length){ showT('Add a name, email, and mobile number for every recipient','error'); return; }
  goEsStep(3);
});

/* ---- navigation -------------------------------------------------------- */
var _ST = window.ST;
window.ST = function(id){
  // Always call through, including for this page's own id. The base ST already
  // shows the right panel, clears the coverage tabs and hides the tab row on
  // pages the tabs do not belong to; skipping it left that row up, and left
  // the other top-nav link still highlighted.
  if(typeof _ST === 'function') _ST(id);
  setNav(id === 'esign');
  if(id === 'esign') loadList();
};
function setNav(on){
  if(navBtn){ navBtn.style.background = on ? 'rgba(255,255,255,.15)' : 'none';
              navBtn.style.color      = on ? '#fff' : 'rgba(255,255,255,.7)'; }
  if(on && navEO){ navEO.style.background = 'none'; navEO.style.color = 'rgba(255,255,255,.7)'; }
}
if(navBtn){
  navBtn.addEventListener('click', function(e){
    e.preventDefault(); history.pushState({}, '', '/esign'); ST('esign');
  });
}
if(location.pathname === '/esign'){ ST('esign'); }

/* ---- file picker --------------------------------------------------------
   Several PDFs may be chosen. They are sent as one document, joined server
   side in the order shown, so the list below is the running order of the
   finished document — which is why it can be reordered.
   ------------------------------------------------------------------------ */
var files = [];
var MAX_FILES = 12, MAX_BYTES = 15 * 1024 * 1024;
var drop = document.getElementById('es-drop'), input = document.getElementById('es-input');
drop.addEventListener('click', function(){ input.click(); });
drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', function(){ drop.classList.remove('over'); });
drop.addEventListener('drop', function(e){
  e.preventDefault(); drop.classList.remove('over');
  if(e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});
input.addEventListener('change', function(){
  if(this.files.length) addFiles(this.files);
  this.value = '';                       // so the same file can be chosen again
});

function totalBytes(){ return files.reduce(function(n, f){ return n + f.size; }, 0); }

function addFiles(list){
  var added = 0;
  for (var i = 0; i < list.length; i++) {
    var f = list[i];
    if(f.type !== 'application/pdf'){ showT(f.name + ' is not a PDF', 'error'); continue; }
    if(files.length >= MAX_FILES){ showT('Up to ' + MAX_FILES + ' files', 'error'); break; }
    // Same name and size twice is a double drop, not a deliberate duplicate.
    if(files.some(function(x){ return x.name === f.name && x.size === f.size; })) continue;
    if(totalBytes() + f.size > MAX_BYTES){
      showT('Adding ' + f.name + ' would take the document over 15 MB', 'error');
      continue;
    }
    files.push(f); added++;
  }
  if(!added) { renderFiles(); return; }

  var t = document.getElementById('es-title');
  if(!t.value && files.length) t.value = files[0].name.replace(/\.pdf$/i, '');
  renderFiles();
  loadDocs();
}

function moveFile(i, by){
  var j = i + by;
  if(j < 0 || j >= files.length) return;
  var tmp = files[i]; files[i] = files[j]; files[j] = tmp;
  // Page numbers move with the files, so placed fields would land on the wrong
  // page. Clearing them is honest; silently remapping them is not.
  if(fields.length) showT('Fields cleared — the page order changed', 'info');
  renderFiles();
  loadDocs();
}

function removeFile(i){
  files.splice(i, 1);
  if(fields.length) showT('Fields cleared — the pages changed', 'info');
  fields = [];
  renderFiles();
  if(files.length) loadDocs();
  else {
    pdfDoc = null; docs = []; curPage = 1; pageCount = 1;
    closePlacer();
    var re = document.getElementById('es-openplace');
    if(re) re.hidden = true;
  }
}

document.getElementById('es-title').addEventListener('input', refreshReady);

function renderFiles(){
  var el = document.getElementById('es-files');
  var label = document.getElementById('es-file');
  if(!files.length){
    el.innerHTML = '';
    label.textContent = 'Click to choose PDFs, or drop them here';
    return;
  }
  label.textContent = files.length === 1
    ? 'Add another PDF, or drop one here'
    : files.length + ' files — add another, or drop one here';

  el.innerHTML = files.map(function(f, i){
    var pages = docs[i] && docs[i].pages;
    return '<div class="es-doc">' +
      '<span class="es-doc-n">' + (i + 1) + '</span>' +
      '<span class="es-doc-name" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
      '<span class="es-doc-meta">' + (pages ? pages + (pages === 1 ? ' page · ' : ' pages · ') : '') +
        Math.round(f.size / 1024) + ' KB</span>' +
      '<button type="button" data-mv="-1" data-i="' + i + '" title="Move up"' + (i === 0 ? ' disabled' : '') + '>&uarr;</button>' +
      '<button type="button" data-mv="1" data-i="' + i + '" title="Move down"' + (i === files.length - 1 ? ' disabled' : '') + '>&darr;</button>' +
      '<button type="button" data-rm="' + i + '" title="Remove" class="es-danger">&times;</button>' +
    '</div>';
  }).join('') +
  (files.length > 1
    ? '<div style="font-size:11px;color:var(--muted);margin-top:6px">Sent as one document, in this order.</div>'
    : '');

  el.querySelectorAll('[data-mv]').forEach(function(b){
    b.addEventListener('click', function(e){ e.preventDefault(); moveFile(+b.dataset.i, +b.dataset.mv); });
  });
  el.querySelectorAll('[data-rm]').forEach(function(b){
    b.addEventListener('click', function(e){ e.preventDefault(); removeFile(+b.dataset.rm); });
  });
}

/* ---- field placement --------------------------------------------------
   Laid out like a preparation studio: every field type visible per
   recipient, and one page shown at a time scaled to fit, so nothing has to
   be scrolled to reach a field or a part of the page.

   Coordinates stay normalised against the page, so they hold at whatever
   scale the page happens to be drawn here.
   ---------------------------------------------------------------------- */
var COLORS = ['#1a4a4a','#a35a19','#3b5aa3','#6b2f6b','#1a6b45'];
var TYPES = [
  { id: 'signature', label: 'Signature' },
  { id: 'initials',  label: 'Initials'  },
  { id: 'date',      label: 'Date signed' },
  { id: 'checkbox',  label: 'Checkbox' },
  { id: 'text',      label: 'Text' },
];
var fields = [], pdfDoc = null, curPage = 1, pageCount = 1;
var suppressFieldAutosave = false;
/* One entry per chosen file: its rendered document and how many pages it has.
   Page numbers run continuously across them, matching the merged PDF the
   server builds, so a field placed on "page 7" lands on page 7 of the result. */
var docs = [];
var DEFAULT_ZOOM = 1;
var zoom = DEFAULT_ZOOM;   // multiplier on the fit-to-screen scale; 1 = whole page visible
var pick = { recipientIndex: 0, type: 'signature' };
var stageEl, whoListEl;

function recipientNames(){
  var out = [];
  rcpts.querySelectorAll('.es-rcpt').forEach(function(r, i){
    out.push(r.querySelector('.es-name').value.trim() || ('Recipient ' + (i + 1)));
  });
  return out;
}

function previewInitials(name){
  return String(name || '').trim().split(/\s+/).filter(Boolean).map(function(part){ return part.charAt(0).toUpperCase(); }).join('').slice(0, 4) || 'AB';
}
function sampleFor(type, name){
  return ({ signature: '<span class="es-preview-signature">' + esc(name || 'Full name') + '</span>',
    initials: esc(previewInitials(name)), date: new Date().toLocaleDateString('en-US'),
    checkbox: '<span class="es-preview-check">☑</span>', text: 'Enter text' })[type] || '';
}
function refreshWho(){
  whoListEl = document.getElementById('es-who-list');
  if(!whoListEl) return;
  var names = recipientNames();
  if(pick.recipientIndex >= names.length) pick.recipientIndex = 0;
  fields = fields.filter(function(f){ return f.recipientIndex < names.length; });

  whoListEl.innerHTML = names.map(function(nm, i){
    var c = COLORS[i % COLORS.length];
    return '<div class="es-who" style="border-left-color:' + c + '">' +
      '<div class="es-who-name" style="color:' + c + '">' + esc(nm) + '</div>' +
      '<div class="es-chips">' + TYPES.map(function(t){
        return '<button type="button" class="es-chip" style="border-color:' + c + ';color:' + c + '"' +
          ' data-r="' + i + '" data-t="' + t.id + '" aria-label="Drag ' + t.label + ' for ' + esc(nm) + '">' +
          '<span class="es-field-sample">' + sampleFor(t.id, nm) + '</span><small>' + t.label + '</small></button>';
      }).join('') + '</div></div>';
  }).join('');

  whoListEl.querySelectorAll('.es-chip').forEach(function(btn){
    btn.addEventListener('pointerdown', beginFieldDrag);
  });
  drawFields();
}

function beginFieldDrag(e){
  if(e.button !== 0 && e.pointerType === 'mouse') return;
  e.preventDefault();
  var source = e.currentTarget;
  var index = Number(source.dataset.r), type = source.dataset.t;
  var ghost = document.createElement('div');
  ghost.className = 'es-drag-ghost';
  ghost.style.borderColor = COLORS[index % COLORS.length];
  ghost.innerHTML = source.innerHTML;
  document.body.appendChild(ghost);
  function move(ev){
    ghost.style.left = (ev.clientX - 75) + 'px';
    ghost.style.top = (ev.clientY - 22) + 'px';
    var scroll = document.getElementById('es-stage-inner');
    var rect = scroll.getBoundingClientRect();
    if(ev.clientX >= rect.left && ev.clientX <= rect.right){
      if(ev.clientY > rect.bottom - 35) scroll.scrollTop += 16;
      if(ev.clientY < rect.top + 35) scroll.scrollTop -= 16;
    }
  }
  function up(ev){
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    var layer = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.es-layer');
    ghost.remove();
    if(!layer) return;
    var rect = layer.getBoundingClientRect();
    var w = Math.min(150, rect.width), h = Math.min(44, rect.height);
    var x = Math.max(0, Math.min(rect.width - w, ev.clientX - rect.left - w/2));
    var y = Math.max(0, Math.min(rect.height - h, ev.clientY - rect.top - h/2));
    fields.push({ page:Number(layer.parentElement.dataset.page), type:type, recipientIndex:index,
      x:x/rect.width, y:y/rect.height, w:w/rect.width, h:h/rect.height });
    drawFields();
  }
  function cancel(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); ghost.remove(); }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up, { once:true });
  window.addEventListener('pointercancel', cancel, { once:true });
  move(e);
}

function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function(res, rej){
    var sc = document.createElement('script');
    sc.src = '/vendor/pdfjs/pdf.min.js';
    sc.onload = function(){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        '/vendor/pdfjs/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    sc.onerror = function(){ rej(new Error('Could not load the PDF viewer')); };
    document.head.appendChild(sc);
  });
}

/* The workspace covers the page while it is open, so the page behind it is
   frozen rather than scrolling underneath. */
function openPlacer(){
  document.getElementById('es-place-sec').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closePlacer(){
  document.getElementById('es-place-sec').hidden = true;
  document.body.style.overflow = '';
  var re = document.getElementById('es-openplace');
  if(re) re.hidden = !pdfDoc;
  refreshReady();
}

/* Reads the chosen PDFs so page counts are known and the editor has something
   to draw. It deliberately does not open the editor: with several files the
   running order has to be settled first, and a full-screen editor covering the
   file list is no place to settle it. The sender opens it when ready. */
async function loadDocs(){
  if(!files.length) return;
  suppressFieldAutosave = true;
  stageEl = document.getElementById('es-stage-inner');
  fields = []; curPage = 1; zoom = DEFAULT_ZOOM;
  var openNow = !document.getElementById('es-place-sec').hidden;
  if(openNow) stageEl.innerHTML = '<div style="padding:24px;font-size:12.5px;color:var(--muted)">Rendering document…</div>';
  refreshWho();
  var note = document.getElementById('es-docnote');
  if(note) note.textContent = 'Reading…';
  try {
    var pdfjs = await loadPdfJs();
    docs = [];
    for (var i = 0; i < files.length; i++) {
      var doc = await pdfjs.getDocument({ data: await files[i].arrayBuffer() }).promise;
      docs.push({ doc: doc, pages: doc.numPages });
    }
    showPlaceProblem(null);
    pageCount = docs.reduce(function(n, d){ return n + d.pages; }, 0);
    pdfDoc = docs.length ? docs[0].doc : null;
    renderFiles();                       // page counts are known now
    if(note) note.textContent = '';
    if(openNow){ restoreLocalFields(); suppressFieldAutosave=false; await renderAllPages(); }
  } catch(e){
    pdfDoc = null; docs = [];
    if(note) note.textContent = e.message + ' — choose a readable PDF before continuing.';
    // The same failure, said on the placement step. Without this the step
    // renders with no controls and no reason, which reads as the feature
    // having been removed.
    showPlaceProblem(e.message);
    if(openNow) stageEl.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#a32219;max-width:420px">' +
      esc(e.message) + '. Choose a readable PDF before continuing.</div>';
  }
  if(!pdfDoc) suppressFieldAutosave = false;
  var re = document.getElementById('es-openplace');
  if(re) re.hidden = !pdfDoc;
}

/* A continuous page number -> the file holding it, and the page within it. */
function locate(n){
  var left = n;
  for (var i = 0; i < docs.length; i++) {
    if (left <= docs[i].pages) return { docIndex: i, doc: docs[i].doc, local: left };
    left -= docs[i].pages;
  }
  return null;
}

// Render the whole document as one continuous stack. Fields stay normalized to
// each page, while the sender can scroll naturally from beginning to end.
async function renderAllPages(){
  if(!docs.length) return;
  var previousScroll = stageEl.scrollTop;
  var availW = Math.max(280, (stageEl.clientWidth || 760) - 54);
  stageEl.innerHTML = '';
  for(var n = 1; n <= pageCount; n++){
    var at = locate(n);
    if(!at) continue;
    var page = await at.doc.getPage(at.local);
    var v1 = page.getViewport({ scale: 1 });
    var fit = Math.min(availW / v1.width, 1.5);
    var cssScale = Math.min(fit * zoom, 4);
    var density = Math.min(window.devicePixelRatio || 1, 2.5);
    var vp = page.getViewport({ scale: cssScale * density });
    var wrap = document.createElement('div');
    wrap.className = 'es-page-wrap';
    var label = document.createElement('div');
    label.className = 'es-pgnum';
    label.textContent = 'Page ' + n + ' of ' + pageCount +
      (files.length > 1 && files[at.docIndex] ? ' · ' + files[at.docIndex].name : '');
    wrap.appendChild(label);
    var holder = document.createElement('div');
    holder.className = 'es-page'; holder.dataset.page = n;
    var cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    cv.style.width = Math.round(v1.width * cssScale) + 'px';
    cv.style.height = Math.round(v1.height * cssScale) + 'px';
    holder.appendChild(cv);
    var layer = document.createElement('div');
    layer.className = 'es-layer'; holder.appendChild(layer);
    wrap.appendChild(holder); stageEl.appendChild(wrap);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  }
  document.getElementById('es-pgnum').textContent = pageCount + (pageCount === 1 ? ' page' : ' pages') + ' · scroll to review all';
  document.getElementById('es-zlvl').textContent = Math.round(zoom * 100) + '%';
  drawFields();
  stageEl.scrollTop = previousScroll;
}

function drawFields(){
  refreshReady();
  var c = document.getElementById('es-count');
  if(c) c.textContent = fields.length + (fields.length === 1 ? ' field placed' : ' fields placed');
  refreshReview();
  saveLocalFields();
  if(!stageEl) return;
  var names = recipientNames();
  var LABEL = {}; TYPES.forEach(function(t){ LABEL[t.id] = t.label; });
  stageEl.querySelectorAll('.es-page').forEach(function(holder){
    var pageNum = Number(holder.dataset.page);
    var layer = holder.querySelector('.es-layer');
    layer.innerHTML = '';
    var r = layer.getBoundingClientRect();
    fields.forEach(function(f, idx){
    if(f.page !== pageNum) return;
    var color = COLORS[f.recipientIndex % COLORS.length];
    var el = document.createElement('div');
    el.className = 'es-fld';
    el.style.cssText = 'left:' + (f.x * r.width) + 'px;top:' + (f.y * r.height) + 'px;' +
      'width:' + (f.w * r.width) + 'px;height:' + (f.h * r.height) + 'px;' +
      'border-color:' + color + ';background:' + color + '1a;color:' + color;
    // A text field can be typed into here and now. Anything typed is the
    // agent's own entry: it prints with the document and is not asked of the
    // signer. Left empty, it stays a box for them to fill.
    var typed = f.type === 'text' && String(f.value || '').trim();
    var inner = f.type === 'text'
      ? '<span class="es-fld-label"><input class="es-fld-text" type="text" ' +
          'value="' + esc(f.value || '') + '" placeholder="Type here, or leave for the signer" ' +
          'aria-label="Text for this field"></span>' +
        '<span class="es-fld-tag">' + (typed ? 'You fill this' : 'Signer fills this') + '</span>'
      : '<span class="es-fld-label"><span class="es-field-sample">' +
          sampleFor(f.type, names[f.recipientIndex]) + '</span><span style="opacity:.75;font-size:9px">' +
          esc(LABEL[f.type] || f.type) + ' · ' + esc(names[f.recipientIndex] || '') + '</span></span>';

    el.innerHTML = inner +
      '<span class="es-del" title="Delete this field" aria-label="Delete this field">&times;</span>' +
      '<span class="es-rz" title="Resize"></span>';

    var box = el.querySelector('.es-fld-text');
    if(box){
      // Typing must not drag the field out from under the cursor.
      box.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
      box.addEventListener('input', function(){
        f.value = this.value;
        var tag = el.querySelector('.es-fld-tag');
        if(tag) tag.textContent = String(f.value || '').trim() ? 'You fill this' : 'Signer fills this';
        saveLocalFields();
      });
    }

    el.querySelector('.es-del').addEventListener('pointerdown', function(e){
      e.stopPropagation(); fields.splice(idx, 1); drawFields();
    });
    el.querySelector('.es-rz').addEventListener('pointerdown', function(e){
      e.stopPropagation(); e.preventDefault();
      var lr = layer.getBoundingClientRect();
      function move(ev){
        f.w = Math.max(0.03, Math.min(1 - f.x, (ev.clientX - lr.left) / lr.width  - f.x));
        f.h = Math.max(0.012, Math.min(1 - f.y, (ev.clientY - lr.top)  / lr.height - f.y));
        el.style.width = (f.w * lr.width) + 'px';
        el.style.height = (f.h * lr.height) + 'px';
      }
      function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveLocalFields(); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once:true });
    });
    el.addEventListener('pointerdown', function(e){
      if(e.target.classList.contains('es-del') || e.target.classList.contains('es-rz')) return;
      e.stopPropagation(); e.preventDefault();
      var lr = layer.getBoundingClientRect();
      var offX = e.clientX - (lr.left + f.x * lr.width);
      var offY = e.clientY - (lr.top + f.y * lr.height);
      function move(ev){
        f.x = Math.max(0, Math.min(1 - f.w, (ev.clientX - offX - lr.left) / lr.width));
        f.y = Math.max(0, Math.min(1 - f.h, (ev.clientY - offY - lr.top) / lr.height));
        el.style.left = (f.x * lr.width) + 'px';
        el.style.top  = (f.y * lr.height) + 'px';
      }
      function up(){ window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveLocalFields(); }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once:true });
    });
    layer.appendChild(el);
    });
  });
}

/* Says why the placement step is empty, on the step itself. */
function showPlaceProblem(msg){
  var box = document.getElementById('es-place-problem');
  if(!box) return;
  if(!msg){ box.hidden = true; return; }
  document.getElementById('es-place-problem-text').textContent =
    msg + ' Field placement needs the document to load first.';
  box.hidden = false;
}
document.getElementById('es-place-retry').addEventListener('click', function(e){
  e.preventDefault();
  showPlaceProblem(null);
  loadDocs().then(function(){ if(docs.length) goEsStep(3); });
});

function localFieldKey(){ return 'esign-fields:' + files.map(function(f){return f.name + ':' + f.size;}).join('|'); }
function saveLocalFields(){
  if(!files.length || suppressFieldAutosave) return;
  try { localStorage.setItem(localFieldKey(), JSON.stringify(fields)); } catch(_) {}
}
function restoreLocalFields(){
  // A draft reopened from the server already holds the fields that were saved
  // with it. The local autosave is keyed on file name and size, so a resumed
  // draft matches an older key and would otherwise overwrite the real thing.
  if(resumeId){ refreshWho(); return; }
  try {
    var saved = JSON.parse(localStorage.getItem(localFieldKey()) || '[]');
    if(Array.isArray(saved) && saved.every(function(f){return f.page>=1 && f.page<=pageCount;})) fields=saved;
  } catch(_) {}
  refreshWho();
}

function setZoom(z){ zoom = Math.max(0.5, Math.min(3, z)); renderAllPages(); }
document.getElementById('es-zin').addEventListener('click',  function(e){ e.preventDefault(); setZoom(zoom + 0.25); });
document.getElementById('es-zout').addEventListener('click', function(e){ e.preventDefault(); setZoom(zoom - 0.25); });
document.getElementById('es-zfit').addEventListener('click', function(e){ e.preventDefault(); setZoom(1); });
document.getElementById('es-zlvl').textContent = Math.round(DEFAULT_ZOOM * 100) + '%';

var refitTimer = null;
window.addEventListener('resize', function(){
  if(!pdfDoc) return;
  clearTimeout(refitTimer);
  refitTimer = setTimeout(function(){ renderAllPages(); }, 180);
});

document.getElementById('es-clearfields').addEventListener('click', function(e){ e.preventDefault(); fields = []; drawFields(); });
/* The id of the draft being continued, or null for a new request. Everything
   that writes has to know which of the two it is doing. */
var resumeId = null;

/* Saves the request without sending it: the document, the recipients and the
   fields as they stand, to be picked up later. */
async function saveDraftAndExit(btn){
  var title = document.getElementById('es-title').value.trim();
  if(!title){ showT('Give the document a title before saving', 'error'); goEsStep(1); return; }
  var list = collectRecipients();
  if(!list.length){ showT('Add a recipient before saving', 'error'); goEsStep(2); return; }

  var was = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    if(resumeId){
      var r = await fetch('/api/esign/envelopes/' + resumeId + '/draft', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, recipients: JSON.stringify(list), fields: JSON.stringify(fields) }),
      });
      var d = await r.json();
      if(!r.ok || !d.success) throw new Error(d.error || 'Could not save');
    } else {
      if(!files.length) throw new Error('Choose a PDF first');
      var fd = new FormData();
      files.forEach(function(f){ fd.append('document', f); });
      fd.append('title', title);
      fd.append('recipients', JSON.stringify(list));
      fd.append('fields', JSON.stringify(fields));
      fd.append('language', document.getElementById('es-lang').value);
      var r2 = await fetch('/api/esign/envelopes', { method: 'POST', body: fd });
      var d2 = await r2.json();
      if(!r2.ok || !d2.success) throw new Error(d2.error || 'Could not save');
    }
    showT('Saved. Pick it up from the list below whenever you are ready.', 'success');
    closePlacer();
    resetForm();
    loadList();
  } catch(err){
    showT(err.message, 'error');
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = was; }
  }
}

function collectRecipients(){
  var list = [];
  rcpts.querySelectorAll('.es-rcpt').forEach(function(r){
    var n = r.querySelector('.es-name').value.trim(), e = r.querySelector('.es-email').value.trim();
    var ph = r.querySelector('.es-phone').value.trim();
    if(n && e && ph) list.push({ name: n, email: e, phone: ph, delivery: 'both' });
  });
  return list;
}

document.getElementById('es-savedraft').addEventListener('click', function(e){
  e.preventDefault(); saveDraftAndExit(this);
});

document.getElementById('es-doneplace').addEventListener('click', async function(e){
  e.preventDefault();
  var missing = missingSignatureRecipients();
  if(missing.length){ showT('Add a signature field for ' + missing.join(', '), 'error'); return; }
  closePlacer(); goEsStep(4);
});
document.getElementById('es-openplace').addEventListener('click', function(e){
  e.preventDefault();
  if(!docs.length) return;
  openPlacer();
  renderAllPages();
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !document.getElementById('es-place-sec').hidden) showT('Complete required field placement before continuing', 'error');
});

/* ---- recipients -------------------------------------------------------- */
var rcpts = document.getElementById('es-rcpts');
rcpts.addEventListener('input', refreshReady);
var savedRecipients = [];
function renumberRecipients(){
  rcpts.querySelectorAll('.es-rcpt').forEach(function(row, i){
    row.querySelector('.es-rcpt-num').textContent = String(i + 1);
  });
  refreshWho();
}
function applySavedPerson(row, person){
  if(!person) return;
  row.querySelector('.es-name').value = person.name || '';
  row.querySelector('.es-email').value = person.email || '';
  row.querySelector('.es-phone').value = person.phone || '';
  refreshWho();
}
function addRecipient(name, email, phone){
  var row = document.createElement('div');
  row.className = 'es-rcpt es-rcpt3';
  row.innerHTML = '<div class="es-rcpt-num">' + (rcpts.children.length + 1) + '</div>' +
                  '<label><span>Full legal name</span><input type="text" class="es-name" list="es-name-suggestions" autocomplete="off" placeholder="e.g. Maria Hernandez"></label>' +
                  '<label><span>Email address</span><input type="email" class="es-email" list="es-email-suggestions" autocomplete="off" placeholder="maria@example.com"></label>' +
                  '<label><span>Mobile number (required)</span><input type="tel" class="es-phone" placeholder="(509) 555-0123" required></label>' +
                  '<span class="es-rcpt-nav"><button type="button" class="es-up" aria-label="Move signer earlier">↑</button><button type="button" class="es-down" aria-label="Move signer later">↓</button></span>' +
                  '<button class="es-x" type="button" title="Remove">&times;</button>';
  row.querySelector('.es-x').addEventListener('click', function(){
    if(rcpts.children.length > 1){
      var at=Array.from(rcpts.children).indexOf(row);
      fields=fields.filter(function(f){return f.recipientIndex!==at;}).map(function(f){
        return Object.assign({}, f, {recipientIndex:f.recipientIndex>at?f.recipientIndex-1:f.recipientIndex});
      });
      row.remove(); renumberRecipients();
    }
  });
  function move(by){
    var at=Array.from(rcpts.children).indexOf(row), target=at+by;
    if(target<0 || target>=rcpts.children.length) return;
    var other=rcpts.children[target];
    if(by<0) rcpts.insertBefore(row, other); else rcpts.insertBefore(other, row);
    fields.forEach(function(f){ if(f.recipientIndex===at) f.recipientIndex=target;
      else if(f.recipientIndex===target) f.recipientIndex=at; });
    renumberRecipients();
  }
  row.querySelector('.es-up').addEventListener('click', function(){ move(-1); });
  row.querySelector('.es-down').addEventListener('click', function(){ move(1); });
  row.querySelector('.es-name').addEventListener('input', refreshWho);
  ['.es-name','.es-email'].forEach(function(selector){
    row.querySelector(selector).addEventListener('change', function(){
      var val=this.value.trim().toLowerCase();
      var matches=savedRecipients.filter(function(p){return String(p[selector==='.es-name'?'name':'email']).toLowerCase()===val;});
      if(matches.length===1) applySavedPerson(row, matches[0]);
    });
  });
  if(name)  row.querySelector('.es-name').value = name;
  if(email) row.querySelector('.es-email').value = email;
  if(phone) row.querySelector('.es-phone').value = phone;
  rcpts.appendChild(row);
  renumberRecipients();
}
document.getElementById('es-add').addEventListener('click', function(e){ e.preventDefault(); addRecipient(); refreshWho(); });
addRecipient();

async function loadSavedRecipients(){
  try {
    var r = await fetch('/api/esign/recipients');
    var d = await r.json();
    if(!r.ok || !d.success) throw new Error(d.error || 'Could not load saved recipients');
    savedRecipients = d.recipients || [];
    ['name','email'].forEach(function(key){
      var list=document.getElementById('es-' + key + '-suggestions');
      list.innerHTML='';
      savedRecipients.forEach(function(person){
        var option=document.createElement('option'); option.value=person[key];
        option.label=key==='name'?person.email:person.name;
        list.appendChild(option);
      });
    });
  } catch(e) {
    console.warn('saved recipients:', e.message);
  }
}
loadSavedRecipients();

// Prefill from the client details already on the page, when they're there.
var gName = document.getElementById('global-client-name');
var gMail = document.getElementById('global-client-email');
function prefill(){
  var first = rcpts.querySelector('.es-rcpt');
  if(!first) return;
  var n = first.querySelector('.es-name'), m = first.querySelector('.es-email');
  if(gName && gName.value && !n.value) n.value = gName.value;
  if(gMail && gMail.value && !m.value) m.value = gMail.value;
  refreshWho();
}
if(gName) gName.addEventListener('input', prefill);
if(gMail) gMail.addEventListener('input', prefill);

/* ---- send -------------------------------------------------------------- */
document.getElementById('es-send').addEventListener('click', async function(){
  var btn = this;
  if(!files.length){ showT('Choose a PDF to send','error'); return; }
  var title = document.getElementById('es-title').value.trim();
  if(!title){ showT('Give the document a title','error'); return; }

  var list = [];
  rcpts.querySelectorAll('.es-rcpt').forEach(function(r){
    var n = r.querySelector('.es-name').value.trim(), e = r.querySelector('.es-email').value.trim();
    var ph = r.querySelector('.es-phone').value.trim();
    if(n && e && ph) list.push({ name: n, email: e, phone: ph, delivery: 'both' });
  });
  if(list.length !== rcpts.querySelectorAll('.es-rcpt').length){ showT('Every recipient needs a name, email, and mobile number','error'); goEsStep(2); return; }
  var missing = missingSignatureRecipients();
  if(missing.length){ showT('Add a signature field for ' + missing.join(', '), 'error'); goEsStep(3); return; }

  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    var fd = new FormData();
    files.forEach(function(f){ fd.append('document', f); });
    fd.append('title', title);
    fd.append('recipients', JSON.stringify(list));
    fd.append('fields', JSON.stringify(fields));
    fd.append('language', document.getElementById('es-lang').value);

    var r = await fetch('/api/esign/envelopes', { method: 'POST', body: fd });
    var d = await r.json();
    if(!r.ok || !d.success) throw new Error(d.error || 'Upload failed');

    btn.textContent = 'Sending…';
    var r2 = await fetch('/api/esign/envelopes/' + d.envelopeId + '/send', { method: 'POST' });
    var d2 = await r2.json();

    if(d2.sent && d2.sent.length) showT('Sent to ' + d2.sent.join(', '), 'success');
    if(d2.failed && d2.failed.length){
      showT('Could not email ' + d2.failed.map(function(f){ return f.email; }).join(', ') + ' — ' + d2.failed[0].error, 'error');
    }
    resetForm();
    loadSavedRecipients();
    loadList();
  } catch(e){
    showT(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Send by email + text';
  }
});

function resetForm(){
  if(files.length) try { localStorage.removeItem(localFieldKey()); } catch(_) {}
  resumeId = null;
  files = []; docs = []; input.value = '';
  renderFiles();
  document.getElementById('es-title').value = '';
  rcpts.innerHTML = ''; addRecipient();
  fields = [];
  pdfDoc = null;
  if(stageEl) stageEl.innerHTML = '';
  closePlacer();
  refreshWho();
  goEsStep(1);
}
document.getElementById('es-reset').addEventListener('click', function(e){ e.preventDefault(); resetForm(); });

/* ---- sent list --------------------------------------------------------- */
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

function when(ts){ return ts ? new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'; }

/* What the status means to the sender, rather than the column name. The
   stored value stays as it is — 'completed' is what the signing flow sets when
   the last signature lands, and reading that as "Signed" is the whole point. */
function statusLabel(s, e){
  // A draft that has fields on it is work someone stopped part way through,
  // which is a different thing to an empty one.
  if(s === 'draft') return (e && e.field_count > 0) ? 'Field placement' : 'Draft';
  return ({ draft: 'Draft', sent: 'Sent', completed: 'Signed',
            declined: 'Declined', voided: 'Voided' })[s] || s;
}

/* Reopens a saved draft in the editor: its document, its recipients and its
   fields, exactly as they were left. */
async function continueDraft(id){
  showT('Opening…', 'info');
  try {
    var r = await fetch('/api/esign/envelopes/' + id);
    var d = await r.json();
    if(!r.ok || !d.success) throw new Error(d.error || 'Could not open it');

    // The stored document comes back as the one file this request is now made
    // of, however many were uploaded to build it.
    var blob = await (await fetch('/api/esign/envelopes/' + id + '/document')).blob();
    var f = new File([blob], d.envelope.file_name || 'document.pdf', { type: 'application/pdf' });

    resetForm();
    resumeId = id;
    files = [f];
    document.getElementById('es-title').value = d.envelope.title || '';
    renderFiles();

    rcpts.innerHTML = '';
    (d.recipients || []).forEach(function(p){
      addRecipient(p.name, p.email);
      var row = rcpts.lastElementChild;
      if(row && p.phone) row.querySelector('.es-phone').value = p.phone;
    });
    if(!rcpts.children.length) addRecipient();

    await loadDocs();
    fields = (d.fields || []).map(function(x){
      return { recipientIndex: Number(x.recipientIndex) || 0, type: x.type, page: Number(x.page) || 1,
               x: Number(x.x), y: Number(x.y), w: Number(x.w), h: Number(x.h),
               label: x.label || '', required: x.required !== false, value: x.value || '' };
    });
    suppressFieldAutosave = false;
    saveLocalFields();                   // the net now matches what was restored
    refreshWho();
    goEsStep(3);                         // which opens the editor and draws the pages
    showT(fields.length + (fields.length === 1 ? ' field' : ' fields') + ' restored — carry on where you left off', 'success');
  } catch(err){
    showT(err.message, 'error');
  }
}

async function onContinue(e){
  e.preventDefault();
  await continueDraft(this.dataset.id);
}

/* Pulls a sent request back. Destructive enough to say so plainly first. */
async function onRecall(e){
  e.preventDefault();
  var btn = this, id = btn.dataset.id, title = btn.dataset.title;
  var signed = Number(btn.dataset.signed || 0);
  var warn = 'Recall "' + title + '"?\n\nThe links already sent will stop working.';
  if(signed) warn += '\n\n' + signed + (signed === 1 ? ' signature that has' : ' signatures that have') +
    ' already been given will be discarded.';
  warn += '\n\nYou can then change the fields and send it again.';
  if(!confirm(warn)) return;
  btn.disabled = true;
  try {
    var r = await fetch('/api/esign/envelopes/' + id + '/recall', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    var d = await r.json();
    if(!r.ok || !d.success) throw new Error(d.error || 'Could not recall it');
    showT('Recalled. The old links no longer work.', 'success');
    loadList();
    await continueDraft(id);
  } catch(err){
    showT(err.message, 'error');
  } finally { btn.disabled = false; }
}

async function onResend(e){
  e.preventDefault();
  var btn = this, id = btn.dataset.id, was = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    var r = await fetch('/api/esign/envelopes/' + id + '/send', { method: 'POST' });
    var d = await r.json();
    if (d.success) {
      showT('Sent to ' + d.sent.join(', '), 'success');
    } else {
      // The provider's own reason, not a generic failure.
      var why = (d.failed && d.failed.length) ? d.failed[0].error : (d.error || 'Nothing could be sent');
      showT(why, 'error');
    }
  } catch(err){
    showT(err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = was;
    loadList();
  }
}

async function onDelete(e){
  e.preventDefault();
  var btn = this, id = btn.dataset.id, title = btn.dataset.title;
  if(!confirm('Delete "' + title + '"?\n\nThis removes the document, its recipients and its audit trail. It cannot be undone.')) return;
  btn.disabled = true;
  try {
    var r = await fetch('/api/esign/envelopes/' + id, { method: 'DELETE' });
    var d = await r.json();
    // A signed document is the record of the signature, so the server asks
    // again before destroying one.
    if (!r.ok && d.needsConfirm === 'signed') {
      if(!confirm(d.error + '\n\nDelete it anyway?')) { btn.disabled = false; return; }
      r = await fetch('/api/esign/envelopes/' + id + '?confirm=signed', { method: 'DELETE' });
      d = await r.json();
    }
    if (!r.ok || !d.success) throw new Error(d.error || 'Could not delete');
    showT('Deleted', 'success');
  } catch(err){
    showT(err.message, 'error');
  } finally {
    btn.disabled = false;
    loadList();
  }
}

async function loadList(){
  var el = document.getElementById('es-list');
  try {
    var r = await fetch('/api/esign/envelopes');
    var d = await r.json();
    if(!r.ok || !d.success) throw new Error(d.error || 'Could not load');
    if(!d.envelopes.length){ el.innerHTML = '<div style="font-size:12.5px;color:var(--muted)">Nothing sent yet.</div>'; return; }

    var rows = d.envelopes.map(function(e){
      var canResend = e.status === 'draft' || e.status === 'sent';
      var who = (e.recipients || []).map(function(p){
        return '<strong>' + esc(p.order) + '.</strong> ' + esc(p.name) +
          ' <span style="color:var(--muted)">(' + esc(p.status === 'pending' && p.order > 1 ? 'waiting in order' : p.status) + ')</span>';
      }).join('<br>');
      var dl = e.status === 'completed'
        ? '<a class="es-link" href="/api/esign/envelopes/' + e.id + '/document?signed=1" target="_blank" rel="noopener">Signed PDF</a>'
        : '<a class="es-link" href="/api/esign/envelopes/' + e.id + '/document" target="_blank" rel="noopener">Original</a>';
      var fail = e.last_failure
        ? '<div style="color:#a32219;font-size:11px;margin-top:3px">Delivery failed (' +
          esc(e.last_failure.channel || 'email') + ' to ' + esc(e.last_failure.to || '') + '): ' +
          esc(e.last_failure.error || '') + '</div>'
        : '';
      var rem = e.status === 'sent' && e.reminders_enabled
        ? '<span class="es-link" title="Automatic reminders at 3 PM Pacific each business day, up to seven times">Reminders on</span>'
        : '';

      var signedCount = (e.recipients || []).filter(function(p){ return p.status === 'signed'; }).length;
      var cont = e.status === 'draft'
        ? '<button class="es-link es-act" data-act="continue" data-id="' + e.id + '" type="button">Continue</button>'
        : '';
      // Recall applies to something out for signature; a finished document is
      // a record, and Delete is the deliberate way to be rid of one.
      var recall = e.status === 'sent'
        ? '<button class="es-link es-act" data-act="recall" data-id="' + e.id +
          '" data-title="' + esc(e.title) + '" data-signed="' + signedCount + '" type="button" ' +
          'title="Stop the links that were sent and edit this request">Recall</button>'
        : '';

      var actions = cont +
        (canResend ? '<button class="es-link es-act" data-act="resend" data-id="' + e.id + '" type="button">' +
                     (e.status === 'draft' ? 'Send' : 'Resend') + '</button>' : '') + rem + recall +
        '<button class="es-link es-act es-danger" data-act="delete" data-id="' + e.id +
          '" data-title="' + esc(e.title) + '" data-status="' + esc(e.status) + '" type="button">Delete</button>';

      return '<tr>' +
        '<td><div style="font-weight:500">' + esc(e.title) + '</div>' +
          '<div style="color:var(--muted);font-size:11.5px">' + esc(e.file_name) + '</div>' + fail + '</td>' +
        '<td>' + esc(e.agent_name || '—') + '</td>' +
        '<td>' + who + '</td>' +
        '<td><span class="es-pill es-' + esc(e.status) + '">' + esc(statusLabel(e.status, e)) + '</span></td>' +
        '<td>' + when(e.sent_at || e.created_at) + '</td>' +
        '<td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + dl + actions + '</div></td>' +
      '</tr>';
    }).join('');

    el.innerHTML = '<table class="es-t"><thead><tr>' +
      '<th>Document</th><th>Agent</th><th>Recipients</th><th>Status</th><th>Sent</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
    el.querySelectorAll('.es-act').forEach(function(b){
      b.addEventListener('click',
        b.dataset.act === 'resend'   ? onResend :
        b.dataset.act === 'continue' ? onContinue :
        b.dataset.act === 'recall'   ? onRecall : onDelete);
    });
  } catch(e){
    // A raw driver error ("connect ECONNREFUSED 127.0.0.1:5432") tells an agent
    // nothing they can act on. Say what happened and keep the detail available.
    var friendly = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed|NetworkError|Failed to fetch/i.test(e.message)
      ? 'Could not reach the server. Check your connection and try again.'
      : e.message;
    el.innerHTML = '<div style="font-size:12.5px;color:#a32219">' + esc(friendly) +
      ' <button class="es-link" id="es-retry" type="button" style="margin-left:6px">Try again</button></div>' +
      (friendly === e.message ? '' :
        '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + esc(e.message) + '</div>');
    var again = document.getElementById('es-retry');
    if (again) again.addEventListener('click', function(ev){ ev.preventDefault(); loadList(); });
  }
}

})();
