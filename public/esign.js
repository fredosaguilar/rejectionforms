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
  // The field placer is a full-viewport workspace: the page it is preparing is
  // the whole job, so it gets the whole screen rather than a band inside a
  // form the reader has to scroll down to.
  '#f-esign #es-place-sec{position:fixed;inset:0;z-index:600;margin:0;padding:0;border:none;border-radius:0;background:#f4f2ee;display:flex;flex-direction:column}',
  '#f-esign #es-place-sec[hidden]{display:none}',
  '#f-esign .es-ovbar{flex:0 0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:9px 16px;background:#fff;border-bottom:1px solid var(--border)}',
  '#f-esign .es-ovttl{font-size:13px;font-weight:600;color:var(--navy);margin-right:auto}',
  '#f-esign .es-studio{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:230px 1fr}',
  '@media(max-width:900px){#f-esign .es-studio{grid-template-columns:1fr;overflow:auto}}',
  '#f-esign .es-palette{overflow:auto;padding:14px;background:#fff;border:none;border-right:1px solid var(--border);border-radius:0}',
  '#f-esign .es-who{border-left:3px solid;padding:9px 10px;border-radius:0 var(--radius) var(--radius) 0;background:var(--bg);margin-bottom:10px}',
  '#f-esign .es-who-name{font-size:12.5px;font-weight:600;margin-bottom:7px}',
  '#f-esign .es-chips{display:flex;flex-wrap:wrap;gap:5px}',
  '#f-esign .es-chip{font-family:inherit;font-size:11px;padding:4px 9px;border-radius:20px;border:1px solid var(--border2);background:#fff;color:var(--text);cursor:pointer;white-space:nowrap}',
  '#f-esign .es-chip:hover{border-color:var(--navy)}',
  '#f-esign .es-chip.on{color:#fff}',
  '#f-esign .es-stage{min-width:0;min-height:0;display:flex;flex-direction:column;background:#eceae4;padding:9px;border:none;border-radius:0}',
  '#f-esign .es-scroll{flex:1 1 auto;min-height:0;width:100%;overflow:auto;display:flex;justify-content:center;align-items:flex-start}',
  '#f-esign .es-zoom{display:flex;gap:4px;align-items:center}',
  '#f-esign .es-zoom button{font-family:inherit;font-size:12px;line-height:1;min-width:30px;padding:5px 10px;border:1px solid var(--border2);border-radius:var(--radius);background:#fff;cursor:pointer}',
  '#f-esign .es-zoom button:hover{border-color:var(--navy)}',
  '#f-esign .es-pgbar{display:flex;gap:10px;align-items:center;font-size:11.5px;color:var(--muted)}',
  '#f-esign .es-pgbar button{font-family:inherit;font-size:11.5px;padding:3px 10px;border:1px solid var(--border2);border-radius:var(--radius);background:#fff;cursor:pointer}',
  '#f-esign .es-pgbar button:disabled{opacity:.4;cursor:default}',
  '#f-esign .es-page{position:relative;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.16);width:fit-content}',
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
    '<button class="btn btn-sec" id="es-openplace" type="button" hidden style="margin-top:12px;font-size:12px;padding:6px 14px">Place signature fields on the document</button>' +
  '</div>' +

  '<div class="sec"><div class="sec-title">Recipients</div>' +
    '<div id="es-rcpts"></div>' +
    '<button class="btn btn-sec" id="es-add" style="margin-top:4px">Add recipient</button>' +
    '<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Each recipient gets their own signing link. The document completes once everyone has signed.</div>' +
    '<div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
      '<button class="btn btn-sec" id="es-smstest" style="font-size:12px;padding:6px 12px">Test text messaging</button>' +
      '<span id="es-smsres" style="font-size:11.5px;color:var(--muted)"></span>' +
      '<div id="es-smsdetail" style="flex-basis:100%;font-size:11.5px;color:var(--muted);line-height:1.6"></div>' +
    '</div>' +
  '</div>' +

  '<div class="sec" id="es-place-sec" hidden>' +
    '<div class="es-ovbar">' +
      '<span class="es-ovttl">Place fields</span>' +
      '<span class="es-pgbar">' +
        '<button id="es-prev" type="button">&larr; Previous</button>' +
        '<span id="es-pgnum">Page 1 of 1</span>' +
        '<button id="es-next" type="button">Next &rarr;</button>' +
      '</span>' +
      '<span class="es-zoom">' +
        '<button id="es-zout" type="button" title="Smaller">&minus;</button>' +
        '<button id="es-zfit" type="button" title="Fit the whole page">Fit</button>' +
        '<button id="es-zin" type="button" title="Larger">+</button>' +
        '<span id="es-zlvl" style="min-width:40px;text-align:right;font-size:11.5px;color:var(--muted)">100%</span>' +
      '</span>' +
      '<button class="btn btn-pri" id="es-doneplace" type="button" style="font-size:12px;padding:6px 18px">Done</button>' +
    '</div>' +
    '<div class="es-studio">' +
      '<div class="es-palette">' +
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:8px">Click a field, then click the page</div>' +
        '<div id="es-who-list"></div>' +
        '<button class="btn btn-sec" id="es-clearfields" style="width:100%;font-size:12px;padding:6px 10px;margin-top:4px">Clear all fields</button>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5"><span id="es-count">0 fields</span><br>Drag a field to move it, or its corner to resize.</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:10px;line-height:1.5">Place no fields to append a signature page instead of putting signatures on the document.</div>' +
      '</div>' +
      '<div class="es-stage"><div class="es-scroll" id="es-stage-inner"></div></div>' +
    '</div>' +
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
  { id: 'text',      label: 'Text' },
];
var fields = [], pdfDoc = null, curPage = 1, pageCount = 1;
var zoom = 1;   // multiplier on the fit-to-screen scale; 1 = the whole page visible
var pick = { recipientIndex: 0, type: 'signature' };
var stageEl, whoListEl;

function recipientNames(){
  var out = [];
  rcpts.querySelectorAll('.es-rcpt').forEach(function(r, i){
    out.push(r.querySelector('.es-name').value.trim() || ('Recipient ' + (i + 1)));
  });
  return out;
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
        var on = (pick.recipientIndex === i && pick.type === t.id);
        return '<button type="button" class="es-chip' + (on ? ' on' : '') + '"' +
          (on ? ' style="background:' + c + ';border-color:' + c + '"' : '') +
          ' data-r="' + i + '" data-t="' + t.id + '">' + t.label + '</button>';
      }).join('') + '</div></div>';
  }).join('');

  whoListEl.querySelectorAll('.es-chip').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.preventDefault();
      pick = { recipientIndex: parseInt(btn.dataset.r, 10), type: btn.dataset.t };
      refreshWho();
    });
  });
  drawFields();
}

function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return new Promise(function(res, rej){
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    sc.onload = function(){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
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
}

async function renderForPlacement(f){
  stageEl = document.getElementById('es-stage-inner');
  fields = []; curPage = 1; zoom = 1;
  openPlacer();
  stageEl.innerHTML = '<div style="padding:24px;font-size:12.5px;color:var(--muted)">Rendering document…</div>';
  refreshWho();
  try {
    var pdfjs = await loadPdfJs();
    pdfDoc = await pdfjs.getDocument({ data: await f.arrayBuffer() }).promise;
    pageCount = pdfDoc.numPages;
    await showPage(1);
  } catch(e){
    pdfDoc = null;
    stageEl.innerHTML = '<div style="padding:16px;font-size:12.5px;color:#a32219;max-width:420px">' +
      esc(e.message) + '. You can still send the document — signatures will go on an appended page.</div>';
  }
  var re = document.getElementById('es-openplace');
  if(re) re.hidden = !pdfDoc;
}

// One page, scaled to fit the available box, so the whole page is reachable
// without scrolling.
async function showPage(n){
  if(!pdfDoc) return;
  curPage = Math.max(1, Math.min(pageCount, n));
  var page = await pdfDoc.getPage(curPage);
  var v1 = page.getViewport({ scale: 1 });
  // A portrait page is limited by height, not width, so the working area takes
  // as much of the viewport as the surrounding chrome allows. Zoom multiplies
  // that fit; above 1 the stage scrolls, which is the reader's own choice.
  // Measured, not guessed: the stage is the flex remainder of the workspace, so
  // its own box is exactly the room the page has. Measure before clearing it.
  var availW = Math.max(280, (stageEl.clientWidth  || 760) - 14);
  var availH = Math.max(280, (stageEl.clientHeight || 760) - 14);
  var fit = Math.min(availW / v1.width, availH / v1.height);
  var vp = page.getViewport({ scale: Math.min(fit * zoom, 4) });

  stageEl.innerHTML = '';
  var scroll = stageEl;
  var holder = document.createElement('div');
  holder.className = 'es-page';
  holder.dataset.page = curPage;
  var cv = document.createElement('canvas');
  cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  holder.appendChild(cv);
  var layer = document.createElement('div');
  layer.className = 'es-layer';
  holder.appendChild(layer);
  scroll.appendChild(holder);

  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  wireLayer(layer, curPage);
  document.getElementById('es-pgnum').textContent = 'Page ' + curPage + ' of ' + pageCount;
  document.getElementById('es-zlvl').textContent = Math.round(zoom * 100) + '%';
  document.getElementById('es-prev').disabled = curPage <= 1;
  document.getElementById('es-next').disabled = curPage >= pageCount;
  drawFields();
}

function wireLayer(layer, pageNum){
  var start = null, ghost = null;
  layer.addEventListener('mousedown', function(e){
    if(e.target !== layer) return;
    var r = layer.getBoundingClientRect();
    start = { x: e.clientX - r.left, y: e.clientY - r.top };
    ghost = document.createElement('div');
    ghost.className = 'es-fld';
    var c = COLORS[pick.recipientIndex % COLORS.length];
    ghost.style.borderColor = c; ghost.style.background = c + '1a';
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
    if(w < 12 || h < 8){ w = 150; h = 38; }          // a click, not a drag
    if(x + w > r.width) x = Math.max(0, r.width - w);
    if(y + h > r.height) y = Math.max(0, r.height - h);
    fields.push({
      page: pageNum, type: pick.type, recipientIndex: pick.recipientIndex,
      x: x / r.width, y: y / r.height, w: w / r.width, h: h / r.height,
    });
    drawFields();
  });
}

function drawFields(){
  var holder = stageEl && stageEl.querySelector('.es-page');
  var c = document.getElementById('es-count');
  if(c) c.textContent = fields.length + (fields.length === 1 ? ' field placed' : ' fields placed');
  if(!holder) return;
  var layer = holder.querySelector('.es-layer');
  layer.innerHTML = '';
  var r = layer.getBoundingClientRect();
  var names = recipientNames();
  var LABEL = {}; TYPES.forEach(function(t){ LABEL[t.id] = t.label; });

  fields.forEach(function(f, idx){
    if(f.page !== curPage) return;                  // only this page's fields
    var color = COLORS[f.recipientIndex % COLORS.length];
    var el = document.createElement('div');
    el.className = 'es-fld';
    el.style.cssText = 'left:' + (f.x * r.width) + 'px;top:' + (f.y * r.height) + 'px;' +
      'width:' + (f.w * r.width) + 'px;height:' + (f.h * r.height) + 'px;' +
      'border-color:' + color + ';background:' + color + '1a;color:' + color;
    el.innerHTML = '<span style="pointer-events:none;padding:0 4px;text-align:center;line-height:1.2">' +
      esc(LABEL[f.type] || f.type) + '<br><span style="opacity:.75;font-size:9px">' +
      esc(names[f.recipientIndex] || '') + '</span></span>' +
      '<span class="es-del" title="Remove">&times;</span>' +
      '<span class="es-rz" title="Resize"></span>';

    el.querySelector('.es-del').addEventListener('mousedown', function(e){
      e.stopPropagation(); fields.splice(idx, 1); drawFields();
    });
    el.querySelector('.es-rz').addEventListener('mousedown', function(e){
      e.stopPropagation(); e.preventDefault();
      var lr = layer.getBoundingClientRect();
      function move(ev){
        f.w = Math.max(0.03, Math.min(1 - f.x, (ev.clientX - lr.left) / lr.width  - f.x));
        f.h = Math.max(0.012, Math.min(1 - f.y, (ev.clientY - lr.top)  / lr.height - f.y));
        el.style.width = (f.w * lr.width) + 'px';
        el.style.height = (f.h * lr.height) + 'px';
      }
      function up(){ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    el.addEventListener('mousedown', function(e){
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
      function up(){ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
    layer.appendChild(el);
  });
}

function setZoom(z){ zoom = Math.max(0.5, Math.min(3, z)); showPage(curPage); }
document.getElementById('es-zin').addEventListener('click',  function(e){ e.preventDefault(); setZoom(zoom + 0.25); });
document.getElementById('es-zout').addEventListener('click', function(e){ e.preventDefault(); setZoom(zoom - 0.25); });
document.getElementById('es-zfit').addEventListener('click', function(e){ e.preventDefault(); setZoom(1); });

var refitTimer = null;
window.addEventListener('resize', function(){
  if(!pdfDoc) return;
  clearTimeout(refitTimer);
  refitTimer = setTimeout(function(){ showPage(curPage); }, 180);
});

document.getElementById('es-prev').addEventListener('click', function(e){ e.preventDefault(); showPage(curPage - 1); });
document.getElementById('es-next').addEventListener('click', function(e){ e.preventDefault(); showPage(curPage + 1); });
document.getElementById('es-clearfields').addEventListener('click', function(e){ e.preventDefault(); fields = []; drawFields(); });
document.getElementById('es-doneplace').addEventListener('click', function(e){ e.preventDefault(); closePlacer(); });
document.getElementById('es-openplace').addEventListener('click', function(e){
  e.preventDefault();
  if(!pdfDoc) return;
  openPlacer();
  showPage(curPage);            // the stage had no box while hidden, so re-fit
});
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && !document.getElementById('es-place-sec').hidden) closePlacer();
});

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
  refreshWho();
}
if(gName) gName.addEventListener('input', prefill);
if(gMail) gMail.addEventListener('input', prefill);

/* The account as RingCentral reports it. Shown in full because a number
   listed as SmsSender has still been refused at send time, so the raw list is
   more use than any summary of it. */
function smsDetail(d){
  var rows = [];
  if (d.extension) {
    rows.push('<div style="margin-top:6px">Sending as extension <strong>' +
      esc(d.extension.extensionNumber || d.extension.id || '?') + '</strong>' +
      (d.extension.name ? ' — ' + esc(d.extension.name) : '') +
      (d.extension.type ? ' (' + esc(d.extension.type) + ')' : '') + '</div>');
  }
  rows.push('<div>RINGCENTRAL_FROM is <strong>' + esc(d.from || '(not set)') + '</strong></div>');

  if (d.numbers && d.numbers.length) {
    rows.push('<div style="margin-top:4px">Numbers on this extension:</div>');
    rows.push('<ul style="margin:3px 0 0 16px;padding:0">' + d.numbers.map(function(n){
      return '<li>' + esc(n.number) +
        (n.label ? ' — ' + esc(n.label) : '') +
        (n.usageType ? ' · ' + esc(n.usageType) : '') +
        (n.type ? ' · ' + esc(n.type) : '') +
        ' · <span style="color:' + (n.sms ? '#1a6b45' : '#a32219') + '">' +
        (n.features && n.features.length ? esc(n.features.join(', ')) : 'no features listed') +
        '</span></li>';
    }).join('') + '</ul>');
  } else if (d.success || d.error) {
    rows.push('<div style="margin-top:4px">No numbers were returned for this extension.</div>');
  }
  return rows.join('');
}

document.getElementById('es-smstest').addEventListener('click', async function(e){
  e.preventDefault();
  var btn = this, out = document.getElementById('es-smsres');
  btn.disabled = true; out.style.color = 'var(--muted)'; out.textContent = 'Checking…';
  try {
    var r = await fetch('/api/esign/sms-status');
    var d = await r.json();
    if (d.success) {
      out.style.color = '#1a6b45';
      // Signed in, and nothing in the account data looks wrong — which is not
      // the same as RingCentral agreeing to send. Say only what is known.
      out.textContent = 'Signed in to RingCentral.' + (d.note ? '  ' + d.note : '');
    } else {
      out.style.color = '#a32219';
      out.textContent = d.missing && d.missing.length
        ? 'Not configured — missing: ' + d.missing.join(', ')
        : 'RingCentral rejected the credentials: ' + d.error;
    }
    document.getElementById('es-smsdetail').innerHTML = smsDetail(d);
  } catch (err) {
    out.style.color = '#a32219'; out.textContent = err.message;
  } finally { btn.disabled = false; }
});

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
  pdfDoc = null;
  if(stageEl) stageEl.innerHTML = '';
  closePlacer();
  refreshWho();
}
document.getElementById('es-reset').addEventListener('click', function(e){ e.preventDefault(); resetForm(); });

/* ---- sent list --------------------------------------------------------- */
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
  return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

function when(ts){ return ts ? new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }) : '—'; }

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
      var fail = e.last_failure
        ? '<div style="color:#a32219;font-size:11px;margin-top:3px">Delivery failed (' +
          esc(e.last_failure.channel || 'email') + ' to ' + esc(e.last_failure.to || '') + '): ' +
          esc(e.last_failure.error || '') + '</div>'
        : '';
      return '<tr>' +
        '<td><div style="font-weight:500">' + esc(e.title) + '</div>' +
          '<div style="color:var(--muted);font-size:11.5px">' + esc(e.file_name) + '</div>' + fail + '</td>' +
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
