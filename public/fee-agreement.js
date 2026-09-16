/* ============================================================================
   Washington Insurance Fee Agreement & Compensation Disclosure — self-contained tab
   Columbia Basin Insurance E&O Forms Portal

   Drop-in: include <script src="/fee-agreement.js"></script> right before </body>
   (after the main inline script). It injects its own tab button + form section,
   wires its own signature pads, generates the 3-page PDF with jsPDF, and saves
   the submission to /api/forms/submit as formType "fee_agreement".
   ========================================================================== */
(function(){
'use strict';

/* --------------------------------------------------------------------------
   1. Inject tab button + form markup
   -------------------------------------------------------------------------- */
var tabsEl = document.querySelector('.tabs');
var lastForm = document.getElementById('f-auth') || document.querySelector('.fc:last-of-type');
if(!tabsEl || !lastForm){ console.warn('fee-agreement.js: tabs/form container not found'); return; }

/* The agreement is reached from the top navigation ('/fee-agreement'), not from
   the form tab strip, so no tab button is added to .tabs. */
var navBtn = document.getElementById('nav-fee');
var navEO  = document.getElementById('nav-eo');
var AGENCY_OIC = '1329935';   // WA business entity license — fixed, not editable

// Licensed producers. Selecting a name fills that producer's WAOIC number.
var PRODUCERS = [
  { name: 'ALFREDO AGUILAR-ROBLES', oic: '1102040' },
  { name: 'ENRIQUE HERNANDEZ',      oic: '863041'  },
  { name: 'JESUS ALBERTO QUINTERO', oic: '1214266' }
];
function producerByName(v){
  v = (v || '').trim().toLowerCase();
  if(!v) return null;
  for(var i=0;i<PRODUCERS.length;i++){
    var n = PRODUCERS[i].name.toLowerCase();
    if(n === v || n.indexOf(v) === 0 || v.indexOf(n) === 0) return PRODUCERS[i];
  }
  return null;
}

var css = document.createElement('style');
css.textContent = [
  '.fee-table{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:8px}',
  '.fee-table th{text-align:left;padding:6px 8px;background:var(--navy);color:#fff;font-weight:500;font-size:11px}',
  '.fee-table td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top}',
  '.fee-table tr:nth-child(even) td{background:#faf9f6}',
  '.fee-note{font-size:11px;color:var(--muted);line-height:1.5;margin-bottom:8px}',
  '.fee-fixed{font-size:13px;padding:7px 9px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)}',
  '.fee-inline{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--muted)}',
  '.fee-inline input[type=text]{width:90px}',
  '#f-fee .btn-row{display:flex;gap:8px;justify-content:flex-end;padding:1rem 1.25rem;border-top:1px solid var(--border)}',
  '#f-fee .rp input{margin:0}'
].join('');
document.head.appendChild(css);

function txt(id, ph, extra){ return '<input type="text" id="'+id+'" placeholder="'+(ph||'')+'"'+(extra||'')+'>'; }
function fld(label, inner, full){ return '<div class="fld'+(full?' full':'')+'"><div class="lbl">'+label+'</div>'+inner+'</div>'; }
function radio(name, val, label, checked){ return '<label class="rp'+(checked?' sel':'')+'"><input type="radio" name="'+name+'" value="'+val+'"'+(checked?' checked':'')+'> '+label+'</label>'; }

var html =
'<div id="f-fee" class="fc">' +
  '<div class="fhdr"><div><div class="ftitle">Washington Insurance Fee Agreement &amp; Compensation Disclosure / Acuerdo de Tarifas y Divulgación de Compensación</div>' +
  '<div class="fsub">RCW 48.17.270 · WAC 284-30-750 · Complete before each policy is purchased or renewed / Complete antes de comprar o renovar cada póliza</div></div>' +
  '<span class="badge badge-eo">Fee Disclosure</span></div>' +
  '<div class="fbody">' +

  // Parties
  '<div class="sec"><div class="sec-title">Agreement parties / Partes del acuerdo</div><div class="g2">' +
    fld('Agency / Agencia', '<div class="fee-fixed">Quincy Alliance Insurance LLC DBA Columbia Basin Insurance</div>') +
    fld('WA business entity license / Licencia de entidad', '<div class="fee-fixed">WAOIC #' + AGENCY_OIC + '</div>') +
    fld('Producer name / Nombre del productor', '<select id="fee-producer"><option value="">Select producer</option>' + PRODUCERS.map(function(pr){ return '<option value="'+pr.name+'">'+pr.name+'</option>'; }).join('') + '</select>') +
    fld('Producer WA license / Licencia WA del productor', '<input type="text" id="fee-producer-lic" readonly placeholder="Set by producer">') +
    fld('Client / Cliente', txt('fee-client','Client full legal name'), true) +
  '</div></div>' +

  // Schedule reference (read-only)
  '<div class="sec"><div class="sec-title">Fee schedule (printed on PDF) / Tabla de tarifas</div>' +
    '<div class="fee-note">Quoting is free. A policy fee applies only if the client purchases or renews through us. The schedule below is fixed and prints on the agreement; the Transaction Disclosure controls if it differs. / Cotizar es gratis. La tarifa aplica solo si el cliente compra o renueva con nosotros.</div>' +
    '<table class="fee-table"><thead><tr><th>Personal policy type</th><th>New</th><th>Renewal</th></tr></thead><tbody>' +
      '<tr><td>Personal auto – standard</td><td>$20</td><td>$20</td></tr>' +
      '<tr><td>Personal auto – nonstandard</td><td>$50</td><td>$50</td></tr>' +
      '<tr><td>Homeowners or condominium</td><td>$30</td><td>$30</td></tr>' +
      '<tr><td>Landlord or rental dwelling</td><td>$15</td><td>$15</td></tr>' +
      '<tr><td>Renters</td><td>$50</td><td>$50</td></tr>' +
      '<tr><td>Recreational vehicle, motorcycle, boat, or similar</td><td>$20</td><td>$20</td></tr>' +
      '<tr><td>Personal umbrella</td><td>$20</td><td>$20</td></tr>' +
    '</tbody></table>' +
    '<table class="fee-table"><thead><tr><th>Commercial policy or service</th><th>Agency fee</th><th>When charged</th></tr></thead><tbody>' +
      '<tr><td>Commercial auto – standard or admitted</td><td>$100 per year</td><td>At placement and each annual renewal</td></tr>' +
      '<tr><td>Commercial auto – surplus lines or nonstandard</td><td>$150 per year</td><td>At placement and each annual renewal</td></tr>' +
      '<tr><td>Businessowners policy or commercial general liability</td><td>$50 per year</td><td>At placement and each annual renewal</td></tr>' +
      '<tr><td>Workers\' compensation</td><td>$100 per year</td><td>At placement and each annual renewal</td></tr>' +
      '<tr><td>Surety bond</td><td>$50 per year</td><td>At issuance and each annual renewal</td></tr>' +
      '<tr><td>Add seasonal vehicle(s) or unit(s)</td><td>$150 per request</td><td>Before requested change</td></tr>' +
      '<tr><td>Remove or suspend seasonal vehicle(s) or unit(s)</td><td>$100 per request</td><td>Before requested change</td></tr>' +
    '</tbody></table>' +
  '</div>' +

  // Transaction disclosure
  '<div class="sec"><div class="sec-title">Policy transaction disclosure / Divulgación de la transacción</div>' +
    '<div class="fee-note">Records the actual compensation for one policy. Completed amounts control over the general schedule. / Registra la compensación real de una póliza.</div>' +
    '<div class="g2">' +
    fld('Client name / Nombre del cliente', txt('fee-tx-client','Same as client above')) +
    fld('Full legal name of insurer / Aseguradora', txt('fee-insurer','Insurer full legal name')) +
    fld('Line of business / Línea de negocio', txt('fee-lob','e.g. Commercial auto')) +
    fld('Policy number or "New pending" / Número de póliza', txt('fee-policy','Policy # or New pending')) +
    fld('Policy term / Vigencia', txt('fee-term','e.g. 09/01/2026 – 09/01/2027')) +
    fld('Annual or term premium / Prima', txt('fee-premium','$')) +
    '</div>' +
    '<div class="g2" style="margin-top:10px">' +
      '<div class="fld"><div class="lbl">Transaction / Transacción</div><div class="rr">' + radio('fee-tx','New policy','New policy') + radio('fee-tx','Renewal','Renewal') + radio('fee-tx','Other','Other') + '</div>' + txt('fee-tx-other','If other, describe',' style="margin-top:6px"') + '</div>' +
      '<div class="fld"><div class="lbl">Payment basis / Base de pago</div><div class="rr">' + radio('fee-basis','One-time fee','One-time fee') + radio('fee-basis','Annual fee','Annual fee') + radio('fee-basis','Other','Other') + '</div>' + txt('fee-basis-other','If other, amount $',' style="margin-top:6px"') + '</div>' +
    '</div>' +
    '<div class="g2" style="margin-top:10px">' +
    fld('Full agency broker fee for this policy transaction / Tarifa total', txt('fee-total','$')) +
    fld('Transaction processing fee / Cargo de procesamiento', '<div class="fee-fixed" id="fee-processing-box">Enter the agency fee above to calculate</div><div class="fee-note" style="margin:6px 0 0">$3.50 per $100 of the agency fee, $3.50 minimum. Calculated automatically. / $3.50 por cada $100 de la tarifa de agencia, mínimo $3.50.</div>') +
    '</div>' +
    '<div class="g2" style="margin-top:10px">' +
    fld('Full commission paid by insurer / Comisión de la aseguradora', txt('fee-commission','e.g. 10% of premium / $')) +
    '<div class="fld"><div class="lbl">Fee and commission relationship / Relación</div><div class="rr">' + radio('fee-offset','No offset or reimbursement','No offset or reimbursement', true) + radio('fee-offset','Offset','Offset or reimbursement') + '</div>' + txt('fee-offset-desc','Describe offset or reimbursement',' style="margin-top:6px"') + '</div>' +
    '</div>' +
    '<div class="fld" style="margin-top:10px"><div class="lbl">Other separately stated charges not retained by the agency / Otros cargos</div><div class="g4">' +
      fld('Carrier or vendor charge', txt('fee-ch-carrier','$')) + fld('Surplus-lines tax', txt('fee-ch-sltax','$')) + fld('Stamping fee', txt('fee-ch-stamp','$')) + fld('Other', txt('fee-ch-other','$')) +
    '</div></div>' +
    '<div class="g2" style="margin-top:10px">' +
      '<div class="fld"><div class="lbl">Surplus-lines placement / Colocación surplus lines</div><div class="rr">' + radio('fee-sl','No','No', true) + radio('fee-sl','Yes','Yes — notices, taxes and stamping fees shown separately') + '</div></div>' +
      '<div class="fld"><div class="lbl">Possible incentive compensation / Compensación de incentivo</div><div class="rr">' + radio('fee-incent','applies','Section 6 notice applies', true) + radio('fee-incent','none','No incentive compensation may be received') + '</div></div>' +
    '</div>' +
  '</div>' +

  // Signatures
  '<div class="sec"><div class="sec-title">Acknowledgment, consent &amp; signatures / Reconocimiento, consentimiento y firmas</div><div class="ack-box">' +
    '<div class="ack-txt"><b>Client acknowledgment (Section 3):</b> I received this fee schedule before services began. I understand that I am not required to purchase insurance through the agency and that no fee may be charged unless the applicable amount is disclosed and accepted as stated in this agreement.</div>' +
    '<div class="ack-txt"><b>Consent (Section 7):</b> I received this disclosure before purchasing the policy. I understand and agree to the fee stated above, acknowledge the disclosed insurer commission and any offset or reimbursement, and consent to the agency receiving that compensation.</div>' +
    '<div class="ack-es">Recibí esta tabla de tarifas antes de que comenzaran los servicios. Entiendo que no estoy obligado a comprar seguro a través de la agencia. Entiendo y acepto la tarifa indicada, reconozco la comisión de la aseguradora divulgada y consiento que la agencia reciba esa compensación.</div>' +
    '<label class="chk-item" style="margin-bottom:10px"><input type="checkbox" id="fee-ack"><div><div class="chk-en">Client received the fee schedule and transaction disclosure before purchase and agrees to the statements above.</div><div class="chk-es">El cliente recibió la tabla de tarifas y la divulgación antes de la compra y acepta las declaraciones anteriores.</div></div></label>' +
    '<div class="fee-note">The signatures below are applied to both the agreement acknowledgment (page 1) and the transaction consent (page 3).</div>' +
    '<div class="g2">' +
      '<div class="fld"><div class="lbl">Client signature / Firma del cliente</div><canvas class="sig-c" id="s-fee-c"></canvas><div class="sig-ctrl"><button class="sig-clr" onclick="CS(\'s-fee-c\')">Clear</button></div></div>' +
      '<div class="fld"><div class="lbl">Producer signature / Firma del productor</div><canvas class="sig-c" id="s-fee-a"></canvas><div class="sig-ctrl"><button class="sig-clr" onclick="CS(\'s-fee-a\')">Clear</button></div></div>' +
      fld('Client print name / Nombre en molde', txt('fee-client-print','Full name')) +
      fld('Producer print name / Nombre del productor', txt('fee-producer-print','Full name')) +
      fld('Date / Fecha', '<input type="date" id="fee-sig-date">') +
    '</div>' +
  '</div></div>' +

  '</div>' +
  '<div class="btn-row"><button class="btn btn-sec" onclick="CF(\'f-fee\')">Clear</button><button class="btn btn-sec" onclick="window.print()">Print</button><button class="btn btn-pri" id="submit-fee" onclick="submitFeeAgreement()">Save &amp; Download PDF</button></div>' +
'</div>';

lastForm.insertAdjacentHTML('afterend', html);

/* --------------------------------------------------------------------------
   2. Hook into existing app helpers (tab switching, client sync, history)
   -------------------------------------------------------------------------- */
var _ST = window.ST;
window.ST = function(id){
  if(typeof _ST === 'function') _ST(id);
  if(id === 'fee'){
    document.querySelectorAll('.fc').forEach(function(f){ f.classList.remove('vis'); });
    document.getElementById('f-fee').classList.add('vis');
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.remove('active'); });
    setNav(true);
  } else {
    setNav(false);
  }
};

// The top nav links are styled inline, so swap the two that can be current.
function setNav(feeActive){
  if(navBtn){ navBtn.style.background = feeActive ? 'rgba(255,255,255,.15)' : 'none';
              navBtn.style.color      = feeActive ? '#fff' : 'rgba(255,255,255,.7)'; }
  if(navEO){  navEO.style.background  = feeActive ? 'none' : 'rgba(255,255,255,.15)';
              navEO.style.color       = feeActive ? 'rgba(255,255,255,.7)' : '#fff'; }
}

// '/fee-agreement' serves the same page; open the agreement instead of the forms.
if(navBtn){
  navBtn.addEventListener('click', function(e){
    e.preventDefault();
    history.pushState({}, '', '/fee-agreement');
    ST('fee');
  });
}
if(location.pathname === '/fee-agreement'){ ST('fee'); }

var _sync = window.syncClientName;
window.syncClientName = function(){
  if(typeof _sync === 'function') _sync();
  var g = document.getElementById('global-client-name');
  if(!g) return;
  ['fee-client','fee-tx-client','fee-client-print'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=g.value; });
};
// keep tx client + print name in step with the fee client field
document.getElementById('fee-client').addEventListener('input', function(){
  var v=this.value; ['fee-tx-client','fee-client-print'].forEach(function(id){ document.getElementById(id).value=v; });
});
// producer name -> print name; global agent -> producer
document.getElementById('fee-producer').addEventListener('change', function(){
  var pr = producerByName(this.value);
  document.getElementById('fee-producer-print').value = this.value;
  document.getElementById('fee-producer-lic').value = pr ? pr.oic : '';
});
function setProducer(name){
  var pr = producerByName(name);
  if(!pr) return false;
  document.getElementById('fee-producer').value = pr.name;
  document.getElementById('fee-producer-lic').value = pr.oic;
  document.getElementById('fee-producer-print').value = pr.name;
  return true;
}
var ga=document.getElementById('global-agent-name');
if(ga){ ga.addEventListener('input', function(){ var p=document.getElementById('fee-producer'); if(p && !p.value) setProducer(ga.value); }); }
var navAgent=document.getElementById('nav-agent');
if(navAgent && navAgent.textContent) setProducer(navAgent.textContent);
// Transaction processing fee: $3.50 per $100 of premium, never below $3.50.
var PROC_RATE = 0.035, PROC_MIN = 3.50;
function brokerFeeValue(){
  var raw = (document.getElementById('fee-total').value || '').replace(/[^0-9.]/g, '');
  var n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : 0;
}
function processingFee(){
  var f = brokerFeeValue();
  return f ? Math.max(PROC_MIN, f * PROC_RATE) : 0;
}
function processingFeeText(){
  var f = processingFee();
  return f ? '$' + f.toFixed(2) : '';
}
function renderProcessingFee(){
  var box = document.getElementById('fee-processing-box'), f = brokerFeeValue();
  if(!box) return;
  box.textContent = f
    ? processingFeeText() + '  (on $' + f.toFixed(2) + ' broker fee)'
    : 'Enter the agency fee above to calculate';
}
document.getElementById('fee-total').addEventListener('input', renderProcessingFee);
renderProcessingFee();

/* --------------------------------------------------------------------------
   Policy upload autofill. index.html hands us the fields Claude extracted from
   the uploaded PDF; we fill the agreement from them.
   -------------------------------------------------------------------------- */
var LOB_BY_FORM = {
  auto_cov:       'Personal auto',
  home_cov:       'Homeowners',
  trucking_cov:   'Commercial auto',
  contractor_cov: 'Commercial general liability'
};
function usDate(iso){
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? m[2] + '/' + m[3] + '/' + m[1] : (iso || '').trim();
}
function setIfValue(id, val){
  if(val === null || val === undefined) return;
  val = String(val).trim();
  if(!val || val === 'null') return;
  var el = document.getElementById(id);
  if(el) el.value = val;
}
window.feeAutofill = function(d){
  if(!d) return;
  setIfValue('fee-client', d.clientName);
  setIfValue('fee-tx-client', d.clientName);
  setIfValue('fee-client-print', d.clientName);
  setIfValue('fee-insurer', d.carrier);
  setIfValue('fee-policy', d.policyNumber);
  setIfValue('fee-lob', d.lineOfBusiness || LOB_BY_FORM[d.formType]);
  setIfValue('fee-premium', d.annualPremium);

  var eff = usDate(d.effectiveDate), exp = usDate(d.expirationDate);
  if(eff) setIfValue('fee-term', exp ? eff + ' \u2013 ' + exp : eff);

  // A policy number on the document means this is an existing policy renewing.
  var tx = document.querySelector('#f-fee input[name="fee-tx"][value="' +
           (d.policyNumber ? 'Renewal' : 'New policy') + '"]');
  if(tx && !document.querySelector('#f-fee input[name="fee-tx"]:checked')){
    tx.checked = true;
    tx.closest('.rp').classList.add('sel');
  }

  renderProcessingFee();
};
// radio pill highlighting
document.querySelectorAll('#f-fee .rp input[type=radio]').forEach(function(r){ r.addEventListener('change', function(){
  document.querySelectorAll('#f-fee .rp input[name="'+r.name+'"]').forEach(function(o){ o.closest('.rp').classList.toggle('sel', o.checked); });
});});

var _lh = window.loadHistory;
if(typeof _lh === 'function'){
  window.loadHistory = async function(){
    await _lh();
    document.querySelectorAll('#hist-body td').forEach(function(td){ if(td.textContent.trim()==='fee_agreement') td.textContent='WA Fee Agreement'; });
  };
}

/* --------------------------------------------------------------------------
   3. Signature pads (own wiring so the tab works regardless of main script)
   -------------------------------------------------------------------------- */
function initPad(c){
  if(c.dataset.feePad) return; c.dataset.feePad='1';
  function size(){ var r=c.getBoundingClientRect(); if(r.width && c.width!==Math.round(r.width)){ c.width=Math.round(r.width); c.height=Math.round(r.height||72); } }
  var ctx=c.getContext('2d'), drawing=false;
  function pos(e){ var r=c.getBoundingClientRect(); var p=e.touches?e.touches[0]:e; return {x:(p.clientX-r.left)*(c.width/r.width), y:(p.clientY-r.top)*(c.height/r.height)}; }
  function start(e){ size(); drawing=true; ctx.lineWidth=2; ctx.lineCap='round'; ctx.strokeStyle='#1a1a1a'; var p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); e.preventDefault(); }
  function move(e){ if(!drawing) return; var p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); c.dataset.signed='1'; e.preventDefault(); }
  function end(){ drawing=false; }
  c.addEventListener('mousedown',start); c.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
  c.addEventListener('touchstart',start,{passive:false}); c.addEventListener('touchmove',move,{passive:false}); c.addEventListener('touchend',end);
}
['s-fee-c','s-fee-a'].forEach(function(id){ initPad(document.getElementById(id)); });
if(typeof window.CS !== 'function'){
  window.CS = function(id){ var c=document.getElementById(id); if(!c) return; c.getContext('2d').clearRect(0,0,c.width,c.height); delete c.dataset.signed; };
}
// make sure the generic Clear also drops the signed flag
var _CF = window.CF;
if(typeof _CF === 'function'){ window.CF = function(id){ _CF(id); if(id==='f-fee'){ ['s-fee-c','s-fee-a'].forEach(function(i){ delete document.getElementById(i).dataset.signed; }); } }; }

/* --------------------------------------------------------------------------
   4. PDF — three pages mirroring the WA Fee Agreement document
   -------------------------------------------------------------------------- */
function gv(id){ var el=document.getElementById(id); return el ? (el.value||'').trim() : ''; }
// Amounts print as currency. Only a bare number is reformatted; anything
// carrying words or a percent sign ("10% of premium") prints as entered, so a
// rate is never rewritten into a dollar figure.
function money(v){
  v = (v || '').trim();
  if(!v) return '';
  if(!/^\$?\s*[\d,]+(\.\d+)?$/.test(v)) return v;
  var n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return isFinite(n) ? '$' + n.toFixed(2) : v;
}
function rv(name){ var el=document.querySelector('#f-fee input[name="'+name+'"]:checked'); return el ? el.value : ''; }
function sigData(id){ var c=document.getElementById(id); return (c && c.dataset.signed) ? c.toDataURL('image/png') : null; }

window.buildFeeAgreementPDF = function(){
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({unit:'pt', format:'letter'});
  var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  var M = 48, CW = W - M*2;
  var navy=[26,74,74], gold=[200,146,42], muted=[107,101,96], ink=[26,26,26], line=[150,150,150];
  var y = M;

  function font(style,size,color){ doc.setFont('helvetica',style||'normal'); doc.setFontSize(size||9); var c=color||ink; doc.setTextColor(c[0],c[1],c[2]); }
  function title(t){ font('bold',13,navy); doc.text(t, W/2, y, {align:'center'}); y+=18; }
  function subtitle(t){ font('italic',8.5,muted); doc.text(t, W/2, y, {align:'center'}); y+=14; }
  function heading(n,t){ y+=6; font('bold',10.5,navy); doc.text(n+'  '+t, M, y); doc.setDrawColor(gold[0],gold[1],gold[2]); doc.setLineWidth(1); doc.line(M,y+3,M+CW,y+3); y+=14; }
  function para(t, size){ font('normal',size||8.5); var ls=doc.splitTextToSize(t, CW); doc.text(ls, M, y); y+=ls.length*(size?size*1.28:11)+4; }
  function paraB(lead, t){ font('bold',8.5); doc.text(lead, M, y); var lw=doc.getTextWidth(lead+' '); font('normal',8.5); var first=doc.splitTextToSize(t, CW-lw); doc.text(first[0], M+lw, y); var rest=doc.splitTextToSize(first.slice(1).join(' '), CW); if(rest.length&&rest[0]){ doc.text(rest, M, y+11); y+=rest.length*11; } y+=15; }
  function field(label, value, labelW){ labelW=labelW||150; font('normal',8.5,muted); doc.text(label, M, y); doc.setDrawColor(line[0],line[1],line[2]); doc.setLineWidth(0.5); doc.line(M+labelW, y+2, M+CW, y+2); if(value){ font('normal',9); doc.text(value, M+labelW+3, y-0.5); } y+=15; }
  function fieldRow(items){ // [[label,value,widthFraction],...] on one line
    var x=M, total=CW; items.forEach(function(it){ var w=total*it[2]; font('normal',8.5,muted); doc.text(it[0], x, y); var lw=doc.getTextWidth(it[0])+3; if(!it[3]){ doc.setDrawColor(line[0],line[1],line[2]); doc.setLineWidth(0.5); doc.line(x+lw, y+2, x+w-8, y+2); } if(it[1]){ font('normal',9); doc.text(it[1], x+lw+2, y-0.5); } x+=w; }); y+=15; }
  function box(x, checked){ doc.setDrawColor(ink[0],ink[1],ink[2]); doc.setLineWidth(0.6); doc.rect(x, y-7, 8, 8); if(checked){ doc.setFillColor(navy[0],navy[1],navy[2]); doc.rect(x+1.5, y-5.5, 5, 5, 'F'); } }
  function checks(label, opts, sel, otherText){ // opts: array of labels; sel: selected label
    font('normal',8.5,muted); doc.text(label, M, y); var x=M+doc.getTextWidth(label)+8;
    opts.forEach(function(o){ box(x, o===sel); font('normal',8.5); var t=o; doc.text(t, x+11, y); x+=11+doc.getTextWidth(t)+10; });
    if(otherText!==undefined){ doc.setDrawColor(line[0],line[1],line[2]); doc.line(x, y+2, M+CW, y+2); if(otherText){ font('normal',9); doc.text(otherText, x+2, y-0.5); } }
    y+=15;
  }
  function table(head, rows, widths){
    var rh=15;
    doc.setFillColor(navy[0],navy[1],navy[2]); doc.rect(M,y,CW,rh,'F'); font('bold',8,[255,255,255]);
    var x=M; head.forEach(function(h,i){ doc.text(h, x+5, y+10); x+=widths[i]; }); y+=rh;
    rows.forEach(function(r,ri){
      font('normal',8.5); var lines=r.map(function(c,i){ return doc.splitTextToSize(String(c), widths[i]-10); });
      var h=Math.max.apply(null, lines.map(function(l){return l.length;}))*10+6;
      if(ri%2){ doc.setFillColor(248,247,244); doc.rect(M,y,CW,h,'F'); }
      var x=M; lines.forEach(function(l,i){ doc.text(l, x+5, y+10); x+=widths[i]; });
      doc.setDrawColor(224,220,212); doc.setLineWidth(0.4); doc.line(M,y+h,M+CW,y+h); y+=h;
    });
    y+=14;
  }
  function sigBlock(clientLabel, producerLabel, withLicense){
    var colW=(CW-30)/2, lx=M, rx=M+colW+30;
    var sc=sigData('s-fee-c'), sa=sigData('s-fee-a');
    var top=y;
    if(sc){ try{ doc.addImage(sc,'PNG',lx,top-2,colW*0.8,38); }catch(e){} }
    if(sa){ try{ doc.addImage(sa,'PNG',rx,top-2,colW*0.8,38); }catch(e){} }
    y=top+40;
    doc.setDrawColor(ink[0],ink[1],ink[2]); doc.setLineWidth(0.6); doc.line(lx,y,lx+colW,y); doc.line(rx,y,rx+colW,y);
    font('normal',7.5,muted); doc.text(clientLabel, lx, y+9); doc.text(producerLabel, rx, y+9); y+=24;
    function under(x,w,label,val){ if(val){ font('normal',9); doc.text(val, x+2, y-2); } doc.setDrawColor(line[0],line[1],line[2]); doc.setLineWidth(0.5); doc.line(x,y,x+w,y); font('normal',7.5,muted); doc.text(label, x, y+9); }
    under(lx,colW,'Print name',gv('fee-client-print')); under(rx,colW,'Print name',gv('fee-producer-print')); y+=22;
    var d=gv('fee-sig-date'); if(d){ var p=d.split('-'); if(p.length===3) d=p[1]+'/'+p[2]+'/'+p[0]; }
    if(withLicense){ under(lx,colW,'Date',d); under(rx,colW,'Producer OIC #',gv('fee-producer-lic')); y+=22; under(rx,colW,'Date',d); y+=22; }
    else { under(lx,colW,'Date',d); under(rx,colW,'Date',d); y+=22; }
  }
  function footer(){
    var n=doc.internal.getNumberOfPages();
    for(var i=1;i<=n;i++){ doc.setPage(i); doc.setFillColor(gold[0],gold[1],gold[2]); doc.rect(M,H-30,CW,0.8,'F'); font('normal',7.5,muted); doc.text('Columbia Basin Insurance | Washington Fee Agreement', M, H-18); doc.text('Page '+i+' of '+n, M+CW, H-18, {align:'right'}); }
  }

  /* ---------------- PAGE 1 ---------------- */
  title('WASHINGTON INSURANCE FEE AGREEMENT AND'); title('COMPENSATION DISCLOSURE');
  y+=2;
  para('This agreement explains the fees you may pay to Columbia Basin Insurance. Insurance premiums, taxes, insurer charges, premium-finance charges, and other third-party charges are separate. Complete and sign the transaction disclosure before each policy is purchased or renewed and before any separately charged service is performed.');
  y+=4;
  field('Agency', 'Quincy Alliance Insurance LLC DBA Columbia Basin Insurance');
  field('WA OIC #', AGENCY_OIC);
  field('Producer', gv('fee-producer'));
  field('Producer OIC #', gv('fee-producer-lic'));
  field('Client', gv('fee-client'));

  heading('1','How fees work');
  para('Quoting is free. A policy fee applies only if you choose to purchase or renew coverage through us. Agency fees are charged at placement and at each renewal; no agency fee is billed monthly. A separately listed service fee applies only when you request that service and approve the charge in advance.');
  para('We may receive both a fee from you and commission from an insurer. Before each policy is sold, we will disclose the exact fee, the full insurer commission, any offset or reimbursement, the insurer\'s full name, and possible incentive compensation. The completed transaction disclosure controls if it differs from this schedule.');

  heading('2','Personal policy fees');
  table(['Policy type','New policy','Renewal'],[
    ['Personal auto - standard','$20','$20'],
    ['Personal auto - nonstandard','$50','$50'],
    ['Homeowners or condominium','$30','$30'],
    ['Landlord or rental dwelling','$15','$15'],
    ['Renters','$50','$50'],
    ['Recreational vehicle, motorcycle, boat, or similar','$20','$20'],
    ['Personal umbrella','$20','$20']
  ],[CW-200,100,100]);
  para('Each fee is per policy transaction. For a six-month policy, the renewal fee applies at each six-month renewal.');

  heading('3','Client acknowledgment');
  para('I received this fee schedule before services began. I understand that I am not required to purchase insurance through the agency and that no fee may be charged unless the applicable amount is disclosed and accepted as stated in this agreement.');
  y+=6;
  sigBlock('Client signature','Producer signature',false);

  /* ---------------- PAGE 2 ---------------- */
  doc.addPage(); y=M;
  title('COMMERCIAL POLICY AND SERVICE FEES');
  subtitle('Complete the transaction disclosure before binding or renewing coverage');

  heading('4','Commercial policy fees');
  table(['Policy or service','Agency fee','When charged'],[
    ['Commercial auto - standard or admitted','$100 per year','At placement and each annual renewal'],
    ['Commercial auto - surplus lines or nonstandard','$150 per year','At placement and each annual renewal'],
    ['Businessowners policy or commercial general liability','$50 per year','At placement and each annual renewal'],
    ['Workers\' compensation','$100 per year','At placement and each annual renewal'],
    ['Surety bond','$50 per year','At issuance and each annual renewal'],
    ['Add seasonal vehicle(s) or unit(s)','$150 per request','Before requested change'],
    ['Remove or suspend seasonal vehicle(s) or unit(s)','$100 per request','Before requested change']
  ],[CW-320,150,170]);
  paraB('Annual-fee disclosure:', 'Commercial agency fees are annual and are charged in full at placement and again at each annual renewal. No agency fee is billed monthly and no installment balance accrues. The surety bond fee is $50 at issuance and $50 at each annual renewal.');
  font('bold',9.5,navy); doc.text('Processing fees', M, y); y+=12;
  para('A transaction processing fee of $3.50 for each $100 of the agency fee, with a minimum of $3.50, applies to every policy transaction. It is calculated from the agency fee charged, not from the premium, and is stated in the transaction disclosure before the policy is purchased. Carrier, surplus-lines, stamping, tax, premium-finance, card, or vendor charges must be separately identified and are not agency fees.');

  heading('5','General terms');
  paraB('No fee without disclosure.', 'The client receives the amount or calculation basis in writing before services are rendered. For every policy carrying an agency fee, the client receives and signs the policy-specific compensation disclosure before purchase.');
  paraB('Fees are not premium.', 'Agency fees are retained by the agency and do not change coverage. Insurer, governmental, association, premium-finance, card, or other third-party charges are shown separately and are paid or retained by the applicable third party.');
  paraB('Refunds.', 'A policy-placement fee is refunded if no policy is bound or issued. If coverage is rescinded, voided, or flat-cancelled from inception, the policy-placement fee is refunded. Fees for a completed policy term and for completed separately requested services are not refunded.');
  paraB('Cancellation.', 'Agency fees are not charged for any term beginning after the applicable policy, bond, or service ends. No future balance or finance charge is owed. This agreement does not cancel insurance; policy cancellation must follow the insurer\'s requirements.');
  paraB('Renewals.', 'A renewal is a new policy transaction for disclosure purposes. The applicable fee and commission disclosure must be completed before the renewal is purchased.');
  paraB('Uniform treatment.', 'The schedule is applied consistently to similarly situated clients. A client may decline and seek insurance elsewhere.');
  paraB('Records and electronic transactions.', 'Signed policy disclosures are retained for at least five years. Electronic signatures and documented telephone or electronic consent may be used when allowed by Washington law.');

  heading('6','Incentive compensation notice');
  para('The agency may receive future incentive compensation from an insurer, including contingent commissions, awards, or bonuses. These may depend on sales volume, growth, profitability, or retention and are paid only if the performance criteria in the agency-insurer agreement are met. We will provide specific information about additional compensation upon request.');

  /* ---------------- PAGE 3 ---------------- */
  doc.addPage(); y=M;
  title('POLICY TRANSACTION DISCLOSURE');
  subtitle('Complete and sign before each new policy or renewal is purchased');
  para('This page records the actual compensation for one policy. The completed amounts below control over the general schedule.');
  y+=2;
  field('Client name', gv('fee-tx-client')||gv('fee-client'));
  field('Full legal name of insurer', gv('fee-insurer'));
  field('Line of business', gv('fee-lob'));
  field('Policy number or New pending', gv('fee-policy'));
  field('Policy term', gv('fee-term'));
  field('Annual or term premium', money(gv('fee-premium')));
  checks('Transaction:', ['New policy','Renewal','Other:'], rv('fee-tx')==='Other'?'Other:':rv('fee-tx'), gv('fee-tx-other'));
  checks('Payment basis:', ['One-time fee','Annual fee','Other: $'], rv('fee-basis')==='Other'?'Other: $':rv('fee-basis'), gv('fee-basis-other'));
  field('Full agency broker fee for this policy transaction', money(gv('fee-total')), 255);
  field('Transaction processing fee ($3.50 per $100 of agency fee, $3.50 min)', processingFeeText(), 285);
  field('Full commission paid by insurer', money(gv('fee-commission')), 215);
  var off=rv('fee-offset');
  checks('Fee and commission relationship:', ['No offset or reimbursement','Offset or reimbursement described here:'], off==='Offset'?'Offset or reimbursement described here:':off);
  field('', gv('fee-offset-desc'), 0);
  font('normal',8.5,muted); doc.text('Other separately stated charges not retained by the agency:', M, y); y+=13;
  fieldRow([['Carrier or vendor charge $', gv('fee-ch-carrier'), 0.3],['Surplus-lines tax $', gv('fee-ch-sltax'), 0.24],['Stamping fee $', gv('fee-ch-stamp'), 0.23],['Other $', gv('fee-ch-other'), 0.23]]);
  var sl=rv('fee-sl');
  font('normal',8.5,muted); doc.text('Surplus-lines placement:', M, y); var sx=M+doc.getTextWidth('Surplus-lines placement:')+8;
  box(sx, sl==='No'); font('normal',8.5); doc.text('No', sx+11, y); sx+=11+doc.getTextWidth('No')+10; box(sx, sl==='Yes'); doc.text('Yes. If yes, required surplus-lines notices, taxes, and stamping fees will be shown', sx+11, y); y+=11; doc.text('separately on the quote or invoice.', M, y); y+=15;
  var inc=rv('fee-incent');
  checks('Possible incentive compensation:', ['The notice in Section 6 applies','No incentive compensation may be received'], inc==='none'?'No incentive compensation may be received':'The notice in Section 6 applies');

  heading('7','Consent');
  para('I received this disclosure before purchasing the policy. I understand and agree to the fee stated above, acknowledge the disclosed insurer commission and any offset or reimbursement, and consent to the agency receiving that compensation.');
  y+=6;
  sigBlock('Client signature','Producer signature',true);
  y+=4;
  font('italic',7.5,muted); var refs=doc.splitTextToSize('Washington references: RCW 48.17.270; WAC 284-30-750. RCW 48.30.157 may apply to charges for services beyond those customarily provided in soliciting and procuring insurance.', CW); doc.text(refs, M, y);

  footer();
  return doc;
};

/* --------------------------------------------------------------------------
   5. Save & download
   -------------------------------------------------------------------------- */
window.submitFeeAgreement = async function(){
  var btn=document.getElementById('submit-fee');
  btn.disabled=true; btn.textContent='Generating PDF…';
  try{
    var doc=window.buildFeeAgreementPDF();
    var client=gv('fee-client')||'Client';
    doc.save('WA-Fee-Agreement-'+client.replace(/\s+/g,'-')+'.pdf');
    var payload={
      formType:'fee_agreement',
      clientName:gv('fee-client'),
      clientEmail:gv('global-client-email'),
      policyNumber:gv('fee-policy'),
      carrier:gv('fee-insurer'),
      effectiveDate:gv('fee-term'),
      coverages:[],
      formData:{
        agencyLicense:AGENCY_OIC, producer:gv('fee-producer'), producerLicense:gv('fee-producer-lic'),
        txClient:gv('fee-tx-client'), insurer:gv('fee-insurer'), lineOfBusiness:gv('fee-lob'), policyTerm:gv('fee-term'), premium:gv('fee-premium'),
        transaction:rv('fee-tx'), transactionOther:gv('fee-tx-other'), paymentBasis:rv('fee-basis'), paymentBasisOther:gv('fee-basis-other'),
        agencyFee:gv('fee-total'), processingFee:processingFeeText(),
        commission:gv('fee-commission'), offset:rv('fee-offset'), offsetDescription:gv('fee-offset-desc'),
        chargeCarrier:gv('fee-ch-carrier'), chargeSLTax:gv('fee-ch-sltax'), chargeStamping:gv('fee-ch-stamp'), chargeOther:gv('fee-ch-other'),
        surplusLines:rv('fee-sl'), incentive:rv('fee-incent'), acknowledged:!!document.getElementById('fee-ack').checked,
        clientPrintName:gv('fee-client-print'), producerPrintName:gv('fee-producer-print'), signatureDate:gv('fee-sig-date'),
        agentName:gv('global-agent-name')
      },
      signatureClient:sigData('s-fee-c'), signatureAgent:sigData('s-fee-a')
    };
    try{
      var r=await fetch('/api/forms/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      var d=await r.json();
      if(r.ok&&d.success){ showT('PDF downloaded & saved as EO-'+d.submissionId,'success'); if(typeof loadHistory==='function') loadHistory(); }
      else showT('PDF downloaded, but save failed: '+(d.error||'unknown error'),'error');
    }catch(e){ showT('PDF downloaded, but save failed: '+e.message,'error'); }
  }catch(e){ showT('PDF error: '+e.message,'error'); console.error(e); }
  finally{ btn.disabled=false; btn.textContent='Save & Download PDF'; }
};

})();
