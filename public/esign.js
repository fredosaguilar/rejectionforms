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
  '#f-esign .es-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:9px 10px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;position:sticky;top:64px;z-index:20}',
  '#f-esign .es-tools select{padding:6px 9px;font-size:12px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;background:#fff}',
  '#f-esign .es-tools .es-tip{font-size:11.5px;color:var(--muted)}',
  '#f-esign .es-pages{max-height:620px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);background:#eceae4;padding:12px}',
  '#f-esign .es-page{position:relative;margin:0 auto 12px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.14);width:fit-content}',
  '#f-esign .es-page canvas{display:block}',
  '#f-esign .es-layer{position:absolute;inset:0;cursor:crosshair}',
  '#f-esign .es-fld{position:absolute;border:1.5px solid;border-radius:3px;font-size:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;cursor:move;user-select:none}',
  '#f-esign .es-fld .es-del{position:absolute;top:-9px;right:-9px;width:18px;height:18px;border-radius:50%;background:#a32219;color:#fff;font-size:12px;line-height:18px;text-align:center;cursor:pointer}',
  '#f-esign .es-fld .es-rz{position:absolute;right:-5px;bottom:-5px;width:12px;height:12px;border-radius:2px;background:#fff;border:1.5px solid currentColor;cursor:nwse-resize}',
  '#f-esign .es-rcpt3{display:grid;grid-template-columns:1fr 1fr 150px 120px auto;gap:8px;margin-bottom:8px;align-items:center}',
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

  '<div class="sec"><div class="sec-title">Document</div>' +
    '<div class="es-drop" id="es-drop">' +
      '<div class="es-file" id="es-file">Click to choose a PDF, or drop one here</div>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">PDF only, up to 15 MB</div>' +
      '<input type="file" id="es-input" accept="application/pdf" style="display:none">' +
    '</div>' +
    '<div class="es-grid" style="margin-top:12px">' +
      '<div class="fld"><div class="lbl">Document title</div><input type="text" id="es-title" placeholder="e.g. Broker fee agreement — G. Ayala"></div>' +
      '<div class="fld"><div class="lbl">Message to recipients (optional)</div><input type="text" id="es-msg" placeholder="Shown in the email and on the signing page"></div>' +
    '</div>' +
    '<div class="fld" style="margin-top:10px;max-width:320px"><div class="lbl">Signing language / Idioma de firma</div>' +
      '<select id="es-lang" style="width:100%;padding:7px 9px;font-size:13px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;background:#fff">' +
        '<option value="en">English</option><option value="es">Español</option>' +
      '</select>' +
      '<div style="font-size:11.5px;color:var(--muted);margin-top:5px">Sets the language of the consent disclosure, the signing page and the notifications. Recorded on the certificate.</div>' +
    '</div>' +
  '</div>' +

  '<div class="sec"><div class="sec-title">Recipients</div>' +
    '<div id="es-rcpts"></div>' +
    '<button class="btn btn-sec" id="es-add" style="margin-top:4px">Add recipient</button>' +
    '<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Each recipient gets their own signing link. The document completes once everyone has signed.</div>' +
    '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-sec" id="es-smstest" style="font-size:12px;padding:6px 12px">Test text messaging</button>' +
      '<span id="es-smsres" style="font-size:11.5px;color:var(--muted)"></span>' +
    '</div>' +
  '</div>' +

  '<div class="sec" id="es-place-sec" hidden><div class="sec-title">Place fields</div>' +
    '<div class="es-tools">' +
      '<span class="es-tip">Add for</span>' +
      '<select id="es-who"></select>' +
      '<select id="es-type">' +
        '<option value="signature">Signature</option>' +
        '<option value="initials">Initials</option>' +
        '<option value="date">Date signed</option>' +
        '<option value="text">Text</option>' +
      '</select>' +
      '<span class="es-tip">Drag on the page to place. Drag a field to move it, click &times; to remove.</span>' +
      '<span class="es-tip" style="margin-left:auto" id="es-count">0 fields</span>' +
    '</div>' +
    '<div class="es-pages" id="es-pages"></div>' +
    '<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Leave this empty to append a signature page instead of placing signatures on the document.</div>' +
  '</div>' +

  '<div class="sec"><div class="sec-title">Sent documents</div>' +
    '<div id="es-list"><div style="font-size:12.5px;color:var(--muted)">Loading…</div></div>' +
  '</div>' +

  '</div>' +
  '<div class="btn-row">' +
    '<button class="btn btn-sec" id="es-reset">Clear</button>' +
    '<button class="btn btn-pri" id="es-send">Send for signature</button>' +
  '</div>' +
'</div>';

lastForm.insertAdjacentHTML('afterend', html);

/* ---- navigation -------------------------------------------------------- */
var _ST = window.ST;
window.ST = function(id){
  if(typeof _ST === 'function' && id !== 'esign') _ST(id);
  if(id === 'esign'){
    document.querySelectorAll('.fc').forEach(function(f){ f.classList.remove('vis'); });
    document.getElementById('f-esign').classList.add('vis');
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    setNav(true);
    loadList();
  } else {
    setNav(false);
  }
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

/* ---- file picker ------------------------------------------------------- */
var file = null;
var drop = document.getElementById('es-drop'), input = document.getElementById('es-input');
drop.addEventListener('click', function(){ input.click(); });
drop.addEventListener('dragover', function(e){ e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', function(){ drop.classList.remove('over'); });
drop.addEventListener('drop', function(e){
  e.preventDefault(); drop.classList.remove('over');
  if(e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
input.addEventListener('change', function(){ if(this.files[0]) setFile(this.files[0]); });
function setFile(f){
  if(f.type !== 'application/pdf'){ showT('Only PDF documents can be sent for signature','error'); return; }
  if(f.size > 15*1024*1024){ showT('That PDF is larger than 15 MB','error'); return; }
  file = f;
  document.getElementById('es-file').textContent = f.name + '  (' + Math.round(f.size/1024) + ' KB)';
  var t = document.getElementById('es-title');
  if(!t.value) t.value = f.name.replace(/\.pdf$/i, '');
  renderForPlacement(f);
}

/* ---- field placement --------------------------------------------------
   Coordinates are stored normalised against each page, so they survive
   whatever width the page happened to be rendered at here.
   ---------------------------------------------------------------------- */
var COLORS = ['#1a4a4a','#a35a19','#3b5aa3','#6b2f6b','#1a6b45'];
var fields = [];
var pagesEl, whoEl, typeEl;

function refreshWho(){
  if(!whoEl) return;
  var prev = whoEl.value;
  var opts = [];
  rcpts.querySelectorAll('.es-rcpt').forEach(function(r, i){
    var nm = r.querySelector('.es-name').value.trim() || ('Recipient ' + (i+1));
    opts.push('<option value="' + i + '">' + esc(nm) + '</option>');
  });
  whoEl.innerHTML = opts.join('');
  if(prev && whoEl.querySelector('option[value="' + prev + '"]')) whoEl.value = prev;
  // A removed recipient must not leave fields pointing at nothing.
  var max = rcpts.querySelectorAll('.es-rcpt').length;
  fields = fields.filter(function(f){ return f.recipientIndex < max; });
  drawFields();
}

function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function(){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror = function(){ rej(new Error('Could not load the PDF viewer')); };
    document.head.appendChild(s);
  });
}

async function renderForPlacement(f){
  var sec = document.getElementById('es-place-sec');
  pagesEl = document.getElementById('es-pages');
  whoEl = document.getElementById('es-who');
  typeEl = document.getElementById('es-type');
  fields = [];
  sec.hidden = false;
  pagesEl.innerHTML = '<div style="padding:20px;text-align:center;font-size:12.5px;color:var(--muted)">Rendering document…</div>';
  refreshWho();

  try {
    var pdfjs = await loadPdfJs();
    var buf = await f.arrayBuffer();
    var doc = await pdfjs.getDocument({ data: buf }).promise;
    pagesEl.innerHTML = '';
    for(var i = 1; i <= doc.numPages; i++){
      var page = await doc.getPage(i);
      var vp0 = page.getViewport({ scale: 1 });
      var scale = Math.min(680 / vp0.width, 2);
      var vp = page.getViewport({ scale: scale });

      var wrapNum = document.createElement('div');
      wrapNum.className = 'es-pgnum';
      wrapNum.textContent = 'Page ' + i + ' of ' + doc.numPages;
      pagesEl.appendChild(wrapNum);

      var holder = document.createElement('div');
      holder.className = 'es-page';
      holder.dataset.page = i;
      var cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      holder.appendChild(cv);
      var layer = document.createElement('div');
      layer.className = 'es-layer';
      holder.appendChild(layer);
      pagesEl.appendChild(holder);

      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      wireLayer(layer, i);
    }
  } catch(e){
    pagesEl.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#a32219">' + esc(e.message) +
      '. You can still send the document — signatures will go on an appended signature page.</div>';
  }
}

function wireLayer(layer, pageNum){
  var start = null, ghost = null;
  layer.addEventListener('mousedown', function(e){
    if(e.target !== layer) return;            // dragging an existing field
    var r = layer.getBoundingClientRect();
    start = { x: e.clientX - r.left, y: e.clientY - r.top };
    ghost = document.createElement('div');
    ghost.className = 'es-fld';
    ghost.style.borderColor = COLORS[whoEl.value % COLORS.length];
    ghost.style.background = 'rgba(26,74,74,.10)';
    layer.appendChild(ghost);
    e.preventDefault();
  });
  layer.addEventListener('mousemove', function(e){
    if(!start || !ghost) return;
    var r = layer.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    ghost.style.left = Math.min(start.x, cx) + 'px';
    ghost.style.top = Math.min(start.y, cy) + 'px';
    ghost.style.width = Math.abs(cx - start.x) + 'px';
    ghost.style.height = Math.abs(cy - start.y) + 'px';
  });
  window.addEventListener('mouseup', function(e){
    if(!start || !ghost) return;
    var r = layer.getBoundingClientRect();
    var cx = e.clientX - r.left, cy = e.clientY - r.top;
    var x = Math.min(start.x, cx), y = Math.min(start.y, cy);
    var w = Math.abs(cx - start.x), h = Math.abs(cy - start.y);
    ghost.remove(); ghost = null; start = null;
    // A click rather than a drag gets a sensible default box.
    if(w < 12 || h < 8){ w = 170; h = 40; }
    if(x + w > r.width) x = Math.max(0, r.width - w);
    if(y + h > r.height) y = Math.max(0, r.height - h);
    fields.push({
      page: pageNum, type: typeEl.value, recipientIndex: parseInt(whoEl.value, 10) || 0,
      x: x / r.width, y: y / r.height, w: w / r.width, h: h / r.height,
    });
    drawFields();
  });
}

function drawFields(){
  if(!pagesEl) return;
  pagesEl.querySelectorAll('.es-layer').forEach(function(l){ l.innerHTML = ''; });
  var LABEL = { signature: 'Signature', initials: 'Initials', date: 'Date signed', text: 'Text' };
  fields.forEach(function(f, idx){
    var holder = pagesEl.querySelector('.es-page[data-page="' + f.page + '"]');
    if(!holder) return;
    var layer = holder.querySelector('.es-layer');
    var r = layer.getBoundingClientRect();
    var color = COLORS[f.recipientIndex % COLORS.length];
    var el = document.createElement('div');
    el.className = 'es-fld';
    el.style.cssText = 'left:' + (f.x * r.width) + 'px;top:' + (f.y * r.height) + 'px;' +
      'width:' + (f.w * r.width) + 'px;height:' + (f.h * r.height) + 'px;' +
      'border-color:' + color + ';background:' + color + '1a;color:' + color;
    var who = (whoEl.querySelector('option[value="' + f.recipientIndex + '"]') || {}).textContent || '';
    el.innerHTML = '<span style="pointer-events:none;padding:0 4px;text-align:center;line-height:1.2">' +
      esc(LABEL[f.type] || f.type) + '<br><span style="opacity:.75;font-size:9px">' + esc(who) + '</span></span>' +
      '<span class="es-del" title="Remove">&times;</span>' +
      '<span class="es-rz" title="Resize"></span>';
    el.querySelector('.es-del').addEventListener('mousedown', function(e){
      e.stopPropagation(); fields.splice(idx, 1); drawFields();
    });
    // drag the corner handle to resize
    el.querySelector('.es-rz').addEventListener('mousedown', function(e){
      e.stopPropagation(); e.preventDefault();
      var lr = layer.getBoundingClientRect();
      function move(ev){
        // keep a usable minimum and stay inside the page
        var nw = Math.max(0.03, Math.min(1 - f.x, (ev.clientX - lr.left) / lr.width  - f.x));
        var nh = Math.max(0.012, Math.min(1 - f.y, (ev.clientY - lr.top)  / lr.height - f.y));
        f.w = nw; f.h = nh;
        el.style.width  = (f.w * lr.width) + 'px';
        el.style.height = (f.h * lr.height) + 'px';
      }
      function up(){ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });

    // drag to reposition
    el.addEventListener('mousedown', function(e){
      if(e.target.classList.contains('es-del') || e.target.classList.contains('es-rz')) return;
      e.stopPropagation(); e.preventDefault();
      var lr = layer.getBoundingClientRect();
      var offX = e.clientX - (lr.left + f.x * lr.width);
      var offY = e.clientY - (lr.top + f.y * lr.height);
      function move(ev){
        var nx = (ev.clientX - offX - lr.left) / lr.width;
        var ny = (ev.clientY - offY - lr.top) / lr.height;
        f.x = Math.max(0, Math.min(1 - f.w, nx));
        f.y = Math.max(0, Math.min(1 - f.h, ny));
        el.style.left = (f.x * lr.width) + 'px';
        el.style.top  = (f.y * lr.height) + 'px';
      }
      function up(){ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    layer.appendChild(el);
  });
  var c = document.getElementById('es-count');
  if(c) c.textContent = fields.length + (fields.length === 1 ? ' field' : ' fields');
}

/* ---- recipients -------------------------------------------------------- */
var rcpts = document.getElementById('es-rcpts');
function addRecipient(name, email){
  var row = document.createElement('div');
  row.className = 'es-rcpt es-rcpt3';
  row.innerHTML = '<input type="text" class="es-name" placeholder="Full name">' +
                  '<input type="text" class="es-email" placeholder="email@example.com">' +
                  '<input type="text" class="es-phone" placeholder="Mobile (for text)">' +
                  '<select class="es-deliv" style="padding:6px 8px;font-size:12px;border:1px solid var(--border2);border-radius:var(--radius);font-family:inherit;background:#fff">' +
                    '<option value="email">Email</option><option value="sms">Text</option><option value="both">Email + text</option>' +
                  '</select>' +
                  '<button class="es-x" type="button" title="Remove">&times;</button>';
  row.querySelector('.es-x').addEventListener('click', function(){
    if(rcpts.children.length > 1){ rcpts.removeChild(row); refreshWho(); }
  });
  row.querySelector('.es-name').addEventListener('input', refreshWho);
  if(name)  row.querySelector('.es-name').value = name;
  if(email) row.querySelector('.es-email').value = email;
  rcpts.appendChild(row);
}
document.getElementById('es-add').addEventListener('click', function(e){ e.preventDefault(); addRecipient(); refreshWho(); });
addRecipient();

// Prefill from the client details already on the page, when they're there.
var gName = document.getElementById('global-client-name');
var gMail = document.getElementById('global-client-email');
function prefill(){
  var first = rcpts.querySelector('.es-rcpt');
  if(!first) return;
  var n = first.querySelector('.es-name'), m = first.querySelector('.es-email');
  if(gName && gName.value && !n.value) n.value = gName.value;
  if(gMail && gMail.value && !m.value) m.value = gMail.value;
}
if(gName) gName.addEventListener('input', prefill);
if(gMail) gMail.addEventListener('input', prefill);

/* ---- send -------------------------------------------------------------- */
document.getElementById('es-send').addEventListener('click', async function(){
  var btn = this;
  if(!file){ showT('Choose a PDF to send','error'); return; }
  var title = document.getElementById('es-title').value.trim();
  if(!title){ showT('Give the document a title','error'); return; }

  var list = [];
  rcpts.querySelectorAll('.es-rcpt').forEach(function(r){
    var n = r.querySelector('.es-name').value.trim(), e = r.querySelector('.es-email').value.trim();
    var ph = r.querySelector('.es-phone').value.trim(), dv = r.querySelector('.es-deliv').value;
    if(n && e) list.push({ name: n, email: e, phone: ph, delivery: dv });
  });
  if(!list.length){ showT('Add at least one recipient with a name and email','error'); return; }

  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    var fd = new FormData();
    fd.append('document', file);
    fd.append('title', title);
    fd.append('message', document.getElementById('es-msg').value.trim());
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
    loadList();
  } catch(e){
    showT(e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Send for signature';
  }
});

function resetForm(){
  file = null; input.value = '';
  document.getElementById('es-file').textContent = 'Click to choose a PDF, or drop one here';
  document.getElementById('es-title').value = '';
  document.getElementById('es-msg').value = '';
  rcpts.innerHTML = ''; addRecipient();
  fields = [];
  var sec = document.getElementById('es-place-sec');
  if(sec){ sec.hidden = true; document.getElementById('es-pages').innerHTML = ''; }
  refreshWho();
}
document.getElementById('es-reset').addEventListener('click', function(e){ e.preventDefault(); resetForm(); });

/* ---- sent list --------------------------------------------------------- */
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

function when(ts){ return ts ? new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'; }

document.getElementById('es-smstest').addEventListener('click', async function(e){
  e.preventDefault();
  var btn = this, out = document.getElementById('es-smsres');
  btn.disabled = true; out.style.color = 'var(--muted)'; out.textContent = 'Checking…';
  try {
    var r = await fetch('/api/esign/sms-status');
    var d = await r.json();
    if (d.success) {
      out.style.color = '#1a6b45';
      out.textContent = 'Connected. Texts will send from ' + d.from + '.';
    } else {
      out.style.color = '#a32219';
      out.textContent = d.missing && d.missing.length
        ? 'Not configured — missing: ' + d.missing.join(', ')
        : 'RingCentral rejected the credentials: ' + d.error;
    }
  } catch (err) {
    out.style.color = '#a32219'; out.textContent = err.message;
  } finally { btn.disabled = false; }
});

async function loadList(){
  var el = document.getElementById('es-list');
  try {
    var r = await fetch('/api/esign/envelopes');
    var d = await r.json();
    if(!r.ok || !d.success) throw new Error(d.error || 'Could not load');
    if(!d.envelopes.length){ el.innerHTML = '<div style="font-size:12.5px;color:var(--muted)">Nothing sent yet.</div>'; return; }

    var rows = d.envelopes.map(function(e){
      var who = (e.recipients || []).map(function(p){
        return esc(p.name) + ' <span style="color:var(--muted)">(' + esc(p.status) + ')</span>';
      }).join('<br>');
      var dl = e.status === 'completed'
        ? '<a class="es-link" href="/api/esign/envelopes/' + e.id + '/document?signed=1" target="_blank" rel="noopener">Signed PDF</a>'
        : '<a class="es-link" href="/api/esign/envelopes/' + e.id + '/document" target="_blank" rel="noopener">Original</a>';
      return '<tr>' +
        '<td><div style="font-weight:500">' + esc(e.title) + '</div>' +
          '<div style="color:var(--muted);font-size:11.5px">' + esc(e.file_name) + '</div></td>' +
        '<td>' + who + '</td>' +
        '<td><span class="es-pill es-' + esc(e.status) + '">' + esc(e.status) + '</span></td>' +
        '<td>' + when(e.sent_at || e.created_at) + '</td>' +
        '<td>' + dl + '</td>' +
      '</tr>';
    }).join('');

    el.innerHTML = '<table class="es-t"><thead><tr>' +
      '<th>Document</th><th>Recipients</th><th>Status</th><th>Sent</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  } catch(e){
    el.innerHTML = '<div style="font-size:12.5px;color:#a32219">' + esc(e.message) + '</div>';
  }
}

})();
