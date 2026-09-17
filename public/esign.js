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
  '#f-esign .es-link{font-size:11.5px;color:var(--navy);text-decoration:none;border:1px solid var(--border2);border-radius:20px;padding:2px 9px;white-space:nowrap}'
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
  '</div>' +

  '<div class="sec"><div class="sec-title">Recipients</div>' +
    '<div id="es-rcpts"></div>' +
    '<button class="btn btn-sec" id="es-add" style="margin-top:4px">Add recipient</button>' +
    '<div style="font-size:11.5px;color:var(--muted);margin-top:8px">Each recipient gets their own signing link. The document completes once everyone has signed.</div>' +
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
}

/* ---- recipients -------------------------------------------------------- */
var rcpts = document.getElementById('es-rcpts');
function addRecipient(name, email){
  var row = document.createElement('div');
  row.className = 'es-rcpt';
  row.innerHTML = '<input type="text" class="es-name" placeholder="Full name">' +
                  '<input type="text" class="es-email" placeholder="email@example.com">' +
                  '<button class="es-x" type="button" title="Remove">&times;</button>';
  row.querySelector('.es-x').addEventListener('click', function(){
    if(rcpts.children.length > 1) rcpts.removeChild(row);
  });
  if(name)  row.querySelector('.es-name').value = name;
  if(email) row.querySelector('.es-email').value = email;
  rcpts.appendChild(row);
}
document.getElementById('es-add').addEventListener('click', function(e){ e.preventDefault(); addRecipient(); });
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
    if(n && e) list.push({ name: n, email: e });
  });
  if(!list.length){ showT('Add at least one recipient with a name and email','error'); return; }

  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    var fd = new FormData();
    fd.append('document', file);
    fd.append('title', title);
    fd.append('message', document.getElementById('es-msg').value.trim());
    fd.append('recipients', JSON.stringify(list));

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
