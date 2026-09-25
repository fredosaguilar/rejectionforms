/* Money on the E&O forms and the fee agreement.

   One accounting format everywhere: a leading $, thousands grouped, two
   decimals — $1,234.56 — applied as the amount is typed rather than left to
   whoever is filling the form.

   Several of these fields legitimately hold something that is not an amount:
   a wind/hail deductible can be "1%", a named-storm deductible "2% of
   Coverage A", a commission "10% of premium". Anything that is not purely an
   amount is left exactly as it was typed. */
(function(){
  'use strict';

  // An entry that is nothing but an amount. Everything else is a phrase the
  // agent means to keep.
  var BARE = /^\$?\s*[\d,]*\.?\d*$/;
  var attached = [];

  function group(whole){
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /* `partial` is for mid-typing: the decimals are left exactly as far as they
     have got, so "12." and "12.5" stay typeable. Without it the value is
     completed to two decimals, which is what prints.

     `optionalCents` is for coverage limits, where cents are shown only if
     somebody typed them: a limit reads "$100,000", a premium "$1,875.50". */
  function format(value, partial, optionalCents){
    var s = String(value == null ? '' : value).trim();
    if(!s) return '';
    if(!BARE.test(s)) return s;
    var digits = s.replace(/[^0-9.]/g, '');
    if(!/\d/.test(digits)) return partial ? s : '';
    var dot = digits.indexOf('.');
    var whole = dot < 0 ? digits : digits.slice(0, dot);
    var cents = dot < 0 ? null : digits.slice(dot + 1).replace(/\./g, '');
    if(partial || (optionalCents && cents === null)){
      whole = group(whole.replace(/^0+(?=\d)/, '') || '0');
      return '$' + whole + (cents === null ? '' : '.' + cents.slice(0, 2));
    }
    // Settled: rounded to the cent rather than truncated there.
    var n = parseFloat(whole + '.' + (cents || '0'));
    if(!isFinite(n)) return '';
    var fixed = n.toFixed(2).split('.');
    return '$' + group(fixed[0]) + '.' + fixed[1];
  }

  /* The caret is kept against the digits and the decimal point, so grouping
     commas appearing and disappearing do not move it out from under the
     person typing. */
  function significantBefore(el){
    return (el.value.slice(0, el.selectionStart).match(/[\d.]/g) || []).length;
  }
  function restoreCaret(el, n){
    if(n <= 0){ var at = Math.min(1, el.value.length); el.setSelectionRange(at, at); return; }
    var seen = 0, i = 0;
    for(; i < el.value.length; i++){
      if(/[\d.]/.test(el.value[i])){ seen++; if(seen >= n){ i++; break; } }
    }
    el.setSelectionRange(i, i);
  }

  function reformat(el, partial){
    // Leaving the field settles it; trimming there costs nobody a caret.
    if(!partial && el.value !== el.value.trim()) el.value = el.value.trim();
    var raw = el.value;

    // A trailing space is someone part-way into a phrase — "$25,000 each
    // person" — so nothing is touched until they stop.
    if(partial && /\s$/.test(raw)) return;

    if(!BARE.test(raw)){
      // Not an amount any more: a percentage, a phrase. Give back exactly what
      // was typed, less a $ this code added while it still looked like one.
      if(el.dataset.moneyAdded === '1' && raw.charAt(0) === '$'){
        var at = el.selectionStart;
        el.dataset.moneyAdded = '';
        el.value = raw.slice(1);
        if(document.activeElement === el){
          var back = Math.max(0, at - 1);
          el.setSelectionRange(back, back);
        }
      }
      return;
    }

    var pos = significantBefore(el);
    var next = format(raw, partial, el.dataset.moneyOptionalCents === '1');
    el.dataset.moneyAdded = (next && raw.charAt(0) !== '$') ? '1'
                          : (next ? el.dataset.moneyAdded : '');
    if(next === raw) return;
    el.value = next;
    if(document.activeElement === el) restoreCaret(el, pos);
  }

  function attach(el, opts){
    if(!el || el.dataset.money === '1') return;
    el.dataset.money = '1';
    if(opts && opts.optionalCents) el.dataset.moneyOptionalCents = '1';
    el.setAttribute('inputmode', 'decimal');
    attached.push(el);

    // Backspacing onto a grouping comma should take the digit with it, or the
    // comma reappears and the key seems to have done nothing.
    el.addEventListener('beforeinput', function(e){
      if(e.inputType !== 'deleteContentBackward') return;
      var at = el.selectionStart;
      if(at !== el.selectionEnd || at < 2 || el.value[at - 1] !== ',') return;
      e.preventDefault();
      el.value = el.value.slice(0, at - 2) + el.value.slice(at);
      el.setSelectionRange(at - 2, at - 2);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    el.addEventListener('input',  function(){ reformat(el, true); });
    el.addEventListener('blur',   function(){ reformat(el, false); });
    reformat(el, false);                 // whatever was already in there
  }

  /* Values set in code — an autofilled policy, a restored draft — arrive
     without an input event, so they are swept up here. */
  function refresh(){
    attached.forEach(function(el){ reformat(el, false); });
  }

  window.CBIMoney = { format: format, attach: attach, refresh: refresh };
})();
