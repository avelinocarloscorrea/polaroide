/* packages/core/canvas-edit-text.js — EPCanvasEditText
 *
 * Digitar direto na folha (estilo Canva): abre um campo exatamente sobre o
 * elemento de texto, com a fonte e a cor dele; a página redesenha enquanto
 * se digita. Fica fora do #sheets (position:fixed) para a letra nunca ficar
 * abaixo de 16px no celular — o iPhone não dá zoom sozinho ao focar.
 *
 *   const ed = EPCanvasEditText.open({
 *     anchor(),                 // -> elemento (a caixa .ce-box) para posicionar
 *     text, multiline, maxlength, placeholder, fontCss, color, scroller,
 *     onInput(value), onDone(value, cancelled)
 *   })
 *   ed.close(cancel)  ed.reposition()
 */
(function (root) {
  "use strict";
  let active = null;

  function open(opt) {
    if (active) active.close(false);
    const wrap = document.createElement('div');
    wrap.className = 'ce-inline';
    const ta = document.createElement('textarea');
    ta.className = 'ce-inline__ta';
    ta.value = opt.text || '';
    ta.rows = 1;
    ta.spellcheck = true;
    ta.setAttribute('enterkeyhint', opt.multiline ? 'enter' : 'done');
    if (opt.maxlength) ta.maxLength = opt.maxlength;
    if (opt.placeholder) ta.placeholder = opt.placeholder;
    if (opt.fontCss) ta.style.fontFamily = opt.fontCss;
    // a cor do elemento, menos quando é clara demais para ler sobre o campo branco
    if (opt.color && /^#[0-9a-f]{6}$/i.test(opt.color)) {
      const v = [1, 3, 5].map(i => parseInt(opt.color.slice(i, i + 2), 16));
      if (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2] < 190) ta.style.color = opt.color;
    }
    const done = document.createElement('button');
    done.type = 'button'; done.className = 'ce-inline__ok'; done.textContent = 'OK';
    wrap.append(ta, done);
    document.body.appendChild(wrap);
    document.body.classList.add('ce-typing');
    const orig = ta.value;
    const measure = document.createElement('canvas');
    let closed = false;

    function fit() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, innerHeight * 0.4) + 'px';
    }
    function reposition() {
      const a = opt.anchor && opt.anchor(); if (!a || !a.isConnected) return;
      const r = a.getBoundingClientRect();
      const vv = root.visualViewport;
      const vw = vv ? vv.width : innerWidth, vh = vv ? vv.height : innerHeight, oy = vv ? vv.offsetTop : 0;
      const lines = Math.max(1, (ta.value.match(/\n/g) || []).length + 1);
      const fs = Math.max(16, Math.min(42, r.height / lines * 0.62));
      ta.style.fontSize = fs + 'px';
      // largura: a da caixa ou a do texto (sem quebrar antes da hora), cabendo na tela
      const g = measure.getContext('2d');
      g.font = `${fs}px ${getComputedStyle(ta).fontFamily}`;
      const tw = Math.max(...(ta.value || ta.placeholder || ' ').split('\n').map(l => g.measureText(l).width));
      const w = Math.min(vw - 24, Math.max(r.width + 24, 180, tw + 80));
      wrap.style.width = w + 'px';
      wrap.style.left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2)) + 'px';
      fit();
      const h = wrap.offsetHeight;
      let top = r.top + r.height / 2 - h / 2;
      top = Math.max(oy + 8, Math.min(oy + vh - h - 8, top));
      wrap.style.top = top + 'px';
    }
    function close(cancel) {
      if (closed) return; closed = true;
      if (cancel && ta.value !== orig) opt.onInput && opt.onInput(orig);
      wrap.remove();
      document.body.classList.remove('ce-typing');
      removeEventListener('resize', reposition);
      if (root.visualViewport) root.visualViewport.removeEventListener('resize', reposition);
      if (sc) sc.removeEventListener('scroll', reposition);
      document.removeEventListener('pointerdown', outside, true);
      active = null;
      opt.onDone && opt.onDone(cancel ? orig : ta.value, !!cancel);
    }
    const outside = e => { if (!wrap.contains(e.target)) close(false); };
    ta.addEventListener('input', () => {
      if (!opt.multiline && ta.value.includes('\n')) ta.value = ta.value.replace(/\n/g, ' ');
      opt.onInput && opt.onInput(ta.value);
      requestAnimationFrame(reposition);
    });
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Enter' && (!opt.multiline || e.ctrlKey || e.metaKey)) { e.preventDefault(); close(false); }
    });
    done.addEventListener('click', () => close(false));
    const sc = opt.scroller || null;
    addEventListener('resize', reposition);
    if (root.visualViewport) root.visualViewport.addEventListener('resize', reposition);
    if (sc) sc.addEventListener('scroll', reposition, { passive: true });
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    reposition();
    ta.focus({ preventScroll: true });
    try { ta.setSelectionRange(0, ta.value.length); } catch (_) {}
    active = { close, reposition };
    return active;
  }

  root.EPCanvasEditText = { open, close: () => active && active.close(false), isOpen: () => !!active };
})(typeof window !== 'undefined' ? window : globalThis);
