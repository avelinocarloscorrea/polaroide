/*
 * Esmeralda Paper — packages/core/imgedit.js
 *
 * Editor de foto reaproveitável (arrastar para posicionar, zoom, rotação,
 * espelhar, filtros) — a mesma ideia que o Polaroide Studio já tinha, só que
 * genérica: qualquer ferramenta que precise encaixar uma foto numa caixa
 * (capa, fundo, uma página de mês…) usa o MESMO editor, **embutido no
 * próprio painel** (`mount`) — sem popup, igual ao Polaroide Studio (lá os
 * controles ficam direto no painel direito, editando a foto ao vivo).
 *
 * Só roda no navegador (constrói DOM, desenha em <canvas>) — como pen.js,
 * não é testável em Node e não entra em `npm test`. Carregado via
 * <script src="vendor/core/imgedit.js"> (build.sh copia de packages/core/),
 * define window.EPImgEdit.
 *
 * Diferença importante para quem for reaproveitar: o Polaroide Studio
 * exporta em RASTER (desenha cada folha inteira num <canvas> e vira JPEG no
 * PDF) — a "verdade" fica em zoom/pan/rot/filtro, recalculados a cada
 * exportação. Planner Studio e Calendar Studio exportam em PDF VETORIAL
 * (`pen.image()` só desenha x,y,w,h, sem transformação nenhuma), então este
 * módulo "assa" (bake) o ajuste numa imagem final via <canvas> — mas só
 * quando o gesto termina (soltar o arraste, soltar o slider), nunca a cada
 * pixel arrastado. Enquanto o gesto está em andamento, o ajuste é só uma
 * prévia local (CSS transform/filter na <img>) — leve, sem re-assar nada.
 */
(function (root) {
  "use strict";

  function clamp(v, a, b) { const n = +v; return isFinite(n) ? Math.min(b, Math.max(a, n)) : a; }

  function defaultEdit() {
    return { zoom: 1, ox: 0, oy: 0, rot: 0, flipH: false,
      filter: { brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0 } };
  }
  // Campo ausente/inválido cai no PADRÃO daquele campo (zoom 1×, sem giro,
  // filtros neutros) — nunca no mínimo do slider. `clamp()` sozinho não
  // sabe distinguir "não veio nada" de "veio 0": um número inválido vira
  // NaN e o clamp devolve o piso (`a`), que só por coincidência é o padrão
  // em ox/oy (0 não, o piso é -90) — por isso o valor-padrão de cada campo
  // é decidido AQUI, antes do clamp, não dentro dele.
  function normEdit(raw) {
    const d = defaultEdit();
    const r = (raw && typeof raw === 'object') ? raw : d;
    const f = (r.filter && typeof r.filter === 'object') ? r.filter : d.filter;
    const pick = (v, def) => (v == null || !isFinite(+v)) ? def : +v;
    return {
      zoom: clamp(pick(r.zoom, d.zoom), 0.4, 4),
      ox: clamp(pick(r.ox, d.ox), -90, 90),
      oy: clamp(pick(r.oy, d.oy), -90, 90),
      rot: clamp(pick(r.rot, d.rot), -45, 45),
      flipH: !!r.flipH,
      filter: {
        brightness: clamp(pick(f.brightness, d.filter.brightness), 0.4, 1.8),
        contrast: clamp(pick(f.contrast, d.filter.contrast), 0.4, 1.8),
        saturate: clamp(pick(f.saturate, d.filter.saturate), 0, 2.2),
        sepia: clamp(pick(f.sepia, d.filter.sepia), 0, 1),
        grayscale: clamp(pick(f.grayscale, d.filter.grayscale), 0, 1),
      },
    };
  }
  function cssFilter(edit) {
    const f = edit.filter;
    return `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) sepia(${f.sepia}) grayscale(${f.grayscale})`;
  }
  // transform CSS da prévia ao vivo — a janela (.imgedit-win) tem
  // position:relative + overflow:hidden; a <img> fica centralizada nela
  // (top:50%;left:50%) e este transform faz o resto.
  function imgTransform(edit) {
    return `translate(-50%,-50%) translate(${edit.ox}%,${edit.oy}%) rotate(${edit.rot}deg) scale(${edit.flipH ? -edit.zoom : edit.zoom},${edit.zoom})`;
  }
  // assa o recorte final num canvas outW×outH (px) — mesma matemática da
  // prévia (a janela sempre é "coberta" pela foto; zoom multiplica esse
  // preenchimento natural). Devolve o <canvas> (chamador decide o formato).
  function bake(imgEl, edit, outW, outH) {
    const e = normEdit(edit);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(outW));
    cv.height = Math.max(1, Math.round(outH));
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // sobra da foto sai branca (papel), não preta
    const iw = imgEl.naturalWidth || imgEl.width, ih = imgEl.naturalHeight || imgEl.height;
    const f = Math.max(cv.width / iw, cv.height / ih) * e.zoom;
    const dw = iw * f, dh = ih * f;
    const icx = cv.width / 2 + (e.ox / 100) * cv.width;
    const icy = cv.height / 2 + (e.oy / 100) * cv.height;
    ctx.save();
    ctx.translate(icx, icy);
    if (e.rot) ctx.rotate(e.rot * Math.PI / 180);
    if (e.flipH) ctx.scale(-1, 1);
    try { ctx.filter = cssFilter(e); } catch (err) {}
    ctx.drawImage(imgEl, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
    return cv;
  }
  function bakeDataURL(imgEl, edit, outW, outH, mime, quality) {
    const cv = bake(imgEl, edit, outW, outH);
    return cv.toDataURL(mime || 'image/jpeg', quality == null ? 0.88 : quality);
  }
  function outSize(aspect, outMax) {
    const a = Math.max(0.05, +aspect || 1), m = clamp(outMax, 400, 3600);
    return a >= 1 ? [m, Math.round(m / a)] : [Math.round(m * a), m];
  }
  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('Não consegui abrir a imagem.'));
      im.src = src;
    });
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

  // presets de filtro — só os 2 básicos por design (nada de galeria de
  // efeitos): "Básico" (neutro) e "Clássico" (um tom quente e suave, a
  // mesma família visual das ferramentas). Mexem só no `filter`, nunca em
  // zoom/posição/rotação.
  const FILTER_PRESETS = {
    basico: { label: 'Básico', filter: { brightness: 1, contrast: 1, saturate: 1, sepia: 0, grayscale: 0 } },
    classico: { label: 'Clássico', filter: { brightness: 1.04, contrast: 1.08, saturate: 0.9, sepia: 0.22, grayscale: 0 } },
  };

  const TOOLS_HTML =
    `<div class="imgedit-stage"><div class="imgedit-win"><img class="imgedit-img" alt=""></div>` +
    `<p class="imgedit-hint">Arraste para posicionar · roda ou pinça para zoom</p></div>` +
    `<div class="imgedit-tools">` +
      `<div class="imgedit-btnrow">` +
        `<button type="button" data-flip>Espelhar</button>` +
        `<button type="button" data-reset>Centralizar</button>` +
      `</div>` +
      `<label>Zoom <span class="v" data-zoomv></span><input type="range" data-zoom min="0.4" max="4" step="0.01"></label>` +
      `<label>Rotação <span class="v" data-rotv></span><input type="range" data-rot min="-45" max="45" step="0.5"></label>` +
      `<div class="imgedit-btnrow imgedit-presets">` +
        Object.entries(FILTER_PRESETS).map(([k, p]) => `<button type="button" class="chip" data-preset="${k}">${escHtml(p.label)}</button>`).join('') +
      `</div>` +
      `<label>Brilho <span class="v" data-brv></span><input type="range" data-br min="0.4" max="1.8" step="0.01"></label>` +
      `<label>Contraste <span class="v" data-cov></span><input type="range" data-co min="0.4" max="1.8" step="0.01"></label>` +
      `<label>Saturação <span class="v" data-sav></span><input type="range" data-sa min="0" max="2.2" step="0.01"></label>` +
      `<label>Sépia <span class="v" data-sev></span><input type="range" data-se min="0" max="1" step="0.01"></label>` +
      `<label>Preto e branco <span class="v" data-grv></span><input type="range" data-gr min="0" max="1" step="0.01"></label>` +
    `</div>`;

  // liga os controles (slider/arraste/roda/pinça) dentro de `root` sobre um
  // <img> já presente — comum a `open()` (modal) e `mount()` (embutido).
  // opts: { edit0, aspect, onHistoryPoint(), onLive(edit), onSettle(edit) }
  // onHistoryPoint: chamado 1x no INÍCIO de cada gesto (pointerdown/slider) —
  //   o app pendura o próprio pushHistory() aqui, pra 1 arraste = 1 undo.
  // onLive: chamado a cada tique (só atualiza a prévia, nada de assar/salvar).
  // onSettle: chamado quando o gesto termina (soltar o arraste/slider) — é
  //   aqui que o app assa (bake) e persiste.
  function wireControls(root, win, img, opts) {
    let edit = normEdit(opts.edit0);
    const els = {
      zoom: root.querySelector('[data-zoom]'), zoomv: root.querySelector('[data-zoomv]'),
      rot: root.querySelector('[data-rot]'), rotv: root.querySelector('[data-rotv]'),
      br: root.querySelector('[data-br]'), brv: root.querySelector('[data-brv]'),
      co: root.querySelector('[data-co]'), cov: root.querySelector('[data-cov]'),
      sa: root.querySelector('[data-sa]'), sav: root.querySelector('[data-sav]'),
      se: root.querySelector('[data-se]'), sev: root.querySelector('[data-sev]'),
      gr: root.querySelector('[data-gr]'), grv: root.querySelector('[data-grv]'),
    };
    const presetBtns = Array.from(root.querySelectorAll('[data-preset]'));
    function activePreset() {
      const f = edit.filter;
      for (const [k, p] of Object.entries(FILTER_PRESETS)) {
        const pf = p.filter;
        if (Math.abs(f.brightness - pf.brightness) < 0.005 && Math.abs(f.contrast - pf.contrast) < 0.005 &&
            Math.abs(f.saturate - pf.saturate) < 0.005 && Math.abs(f.sepia - pf.sepia) < 0.005 && Math.abs(f.grayscale - pf.grayscale) < 0.005) return k;
      }
      return null;
    }
    function syncUI() {
      els.zoom.value = edit.zoom; els.zoomv.textContent = edit.zoom.toFixed(2) + '×';
      els.rot.value = edit.rot; els.rotv.textContent = edit.rot.toFixed(1) + '°';
      els.br.value = edit.filter.brightness; els.brv.textContent = Math.round(edit.filter.brightness * 100) + '%';
      els.co.value = edit.filter.contrast; els.cov.textContent = Math.round(edit.filter.contrast * 100) + '%';
      els.sa.value = edit.filter.saturate; els.sav.textContent = Math.round(edit.filter.saturate * 100) + '%';
      els.se.value = edit.filter.sepia; els.sev.textContent = Math.round(edit.filter.sepia * 100) + '%';
      els.gr.value = edit.filter.grayscale; els.grv.textContent = Math.round(edit.filter.grayscale * 100) + '%';
      const ap = activePreset();
      presetBtns.forEach(b => b.classList.toggle('on', b.dataset.preset === ap));
    }
    function paint() { img.style.transform = imgTransform(edit); img.style.filter = cssFilter(edit); }
    syncUI(); paint();

    let histOpen = false;
    const startGesture = () => { if (!histOpen) { histOpen = true; if (opts.onHistoryPoint) opts.onHistoryPoint(); } };
    const settle = () => { histOpen = false; syncUI(); if (opts.onSettle) opts.onSettle(normEdit(edit)); };
    const live = () => { if (opts.onLive) opts.onLive(edit); };

    const rangeBind = (el, apply) => {
      el.addEventListener('pointerdown', startGesture);
      el.addEventListener('input', () => { apply(parseFloat(el.value)); syncUI(); paint(); live(); });
      el.addEventListener('change', settle);
    };
    rangeBind(els.zoom, v => edit.zoom = clamp(v, 0.4, 4));
    rangeBind(els.rot, v => edit.rot = clamp(v, -45, 45));
    rangeBind(els.br, v => edit.filter.brightness = clamp(v, 0.4, 1.8));
    rangeBind(els.co, v => edit.filter.contrast = clamp(v, 0.4, 1.8));
    rangeBind(els.sa, v => edit.filter.saturate = clamp(v, 0, 2.2));
    rangeBind(els.se, v => edit.filter.sepia = clamp(v, 0, 1));
    rangeBind(els.gr, v => edit.filter.grayscale = clamp(v, 0, 1));

    root.querySelector('[data-flip]').onclick = () => { startGesture(); edit.flipH = !edit.flipH; paint(); settle(); };
    root.querySelector('[data-reset]').onclick = () => { startGesture(); edit = defaultEdit(); syncUI(); paint(); settle(); };
    presetBtns.forEach(b => b.onclick = () => {
      const p = FILTER_PRESETS[b.dataset.preset]; if (!p) return;
      startGesture(); edit.filter = { ...p.filter }; syncUI(); paint(); settle();
    });

    // arrastar pra posicionar
    let drag = null;
    win.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      startGesture();
      const rect = win.getBoundingClientRect();
      drag = { sx: e.clientX, sy: e.clientY, sox: edit.ox, soy: edit.oy, rw: rect.width, rh: rect.height };
      win.setPointerCapture(e.pointerId); win.classList.add('drag');
    });
    win.addEventListener('pointermove', e => {
      if (!drag) return;
      edit.ox = clamp(drag.sox + (e.clientX - drag.sx) / drag.rw * 100, -90, 90);
      edit.oy = clamp(drag.soy + (e.clientY - drag.sy) / drag.rh * 100, -90, 90);
      paint(); live();
    });
    const endDrag = e => { if (!drag) return; try { win.releasePointerCapture(e.pointerId); } catch (_) {} win.classList.remove('drag'); drag = null; settle(); };
    win.addEventListener('pointerup', endDrag);
    win.addEventListener('pointercancel', endDrag);
    // roda / Ctrl+roda = zoom
    win.addEventListener('wheel', e => {
      e.preventDefault();
      startGesture();
      edit.zoom = clamp(edit.zoom * Math.exp(-e.deltaY * 0.0016), 0.4, 4);
      syncUI(); paint(); live();
      clearTimeout(win._wheelT); win._wheelT = setTimeout(settle, 220);
    }, { passive: false });
    // pinça (2 dedos) = zoom
    let pinch = null;
    const tdist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    win.addEventListener('touchstart', e => { if (e.touches.length === 2) { startGesture(); pinch = { d: tdist(e.touches), z: edit.zoom }; } }, { passive: true });
    win.addEventListener('touchmove', e => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const d = tdist(e.touches);
      if (pinch.d > 0 && d > 0) edit.zoom = clamp(pinch.z * (d / pinch.d), 0.4, 4);
      syncUI(); paint(); live();
    }, { passive: false });
    const endPinch = e => { if (pinch && (!e.touches || e.touches.length < 2)) { pinch = null; settle(); } };
    win.addEventListener('touchend', endPinch); win.addEventListener('touchcancel', endPinch);

    return { getEdit: () => edit, setEdit: v => { edit = normEdit(v); syncUI(); paint(); } };
  }

  function sizeWin(win, hostWidth, aspectN, maxHRatio) {
    const avail = Math.min(hostWidth || 440, 440) - 4;
    const maxH = Math.round(innerHeight * (maxHRatio || 0.40));
    let ww = Math.max(100, avail), hh = ww / aspectN;
    if (hh > maxH) { hh = maxH; ww = hh * aspectN; }
    win.style.width = Math.round(ww) + 'px';
    win.style.height = Math.round(hh) + 'px';
  }

  /* ===================== embutido no painel (uso normal) ===================== */
  // container: elemento onde o editor entra por inteiro (o app já reserva o
  // espaço no seu próprio painel direito — nada de popup/scrim).
  // opts: { key, src, aspect, edit, outMax, onHistoryPoint(), onCommit(res) }
  //   `key` identifica o campo (ex.: 'cover' ou 'month:3') — junto com `src`
  //   forma a "marca" que evita remontar (e perder um arraste em curso)
  //   quando o app re-renderiza o painel por qualquer outro motivo.
  // res do onCommit: { dataURL, edit }
  // Devolve { destroy() }; chamar mount() de novo com a MESMA key+src não
  // desmonta nada (idempotente) — é seguro chamar a cada render() do app.
  function mount(container, opts) {
    const o = Object.assign({ aspect: 1, outMax: 1800 }, opts || {});
    const marker = String(o.key || '') + '' + String(o.src || '');
    if (container._imgeditMarker === marker && container._imgeditApi) return container._imgeditApi;
    container.innerHTML = '';
    container.classList.add('imgedit-inline');
    container.innerHTML = TOOLS_HTML;
    if (typeof injectIcons === 'function') { try { injectIcons(container); } catch (e) {} }
    const win = container.querySelector('.imgedit-win');
    const img = container.querySelector('.imgedit-img');
    sizeWin(win, container.clientWidth, Math.max(0.05, +o.aspect || 1), 0.34);

    let natEl = null, ready = false;
    const commit = edit => {
      if (!ready || !natEl || !o.onCommit) return;
      const [outW, outH] = outSize(o.aspect, o.outMax);
      let dataURL;
      try { dataURL = bakeDataURL(natEl, edit, outW, outH); } catch (e) { console.error(e); return; }
      o.onCommit({ dataURL, edit });
    };
    const ctl = wireControls(container, win, img, {
      edit0: o.edit,
      onHistoryPoint: o.onHistoryPoint,
      onSettle: commit,
    });

    loadImage(o.src).then(im => {
      natEl = im; ready = true; img.src = o.src;
      commit(ctl.getEdit());   // 1ª vez: já deixa uma foto pronta sem exigir gesto nenhum
    }).catch(() => {
      container.querySelector('.imgedit-stage').insertAdjacentHTML('beforeend', '<p class="hint">Não consegui carregar a imagem.</p>');
    });

    const api = { destroy() { container.innerHTML = ''; container.classList.remove('imgedit-inline'); container._imgeditMarker = null; container._imgeditApi = null; } };
    container._imgeditMarker = marker;
    container._imgeditApi = api;
    return api;
  }

  /* ===================== direto na folha =====================
     A janela de ajuste é a PRÓPRIA área da foto na página (o app posiciona
     `win` exatamente sobre ela): arrastar enquadra, pinça/roda dá zoom e o
     resultado aparece ali mesmo, em cima da folha. Os sliders (zoom, giro,
     filtros) entram em `tools`. Ao terminar cada gesto assa e chama onCommit. */
  const STAGE_HTML = `<div class="imgedit-stage"><div class="imgedit-win"><img class="imgedit-img" alt=""></div>` +
    `<p class="imgedit-hint">Arraste para posicionar · roda ou pinça para zoom</p></div>`;
  function onSheet(win, tools, opts) {
    const o = Object.assign({ aspect: 1, outMax: 1800 }, opts || {});
    win.classList.add('imgedit-win', 'imgedit-win--sheet');
    win.innerHTML = '<img class="imgedit-img" alt="">';
    tools.innerHTML = TOOLS_HTML.replace(STAGE_HTML, '');
    tools.classList.add('imgedit-inline', 'imgedit-inline--sheet');
    const img = win.querySelector('img');
    let natEl = null, ready = false;
    const commit = edit => {
      if (!ready || !natEl || !o.onCommit) return;
      const [outW, outH] = outSize(o.aspect, o.outMax);
      let dataURL;
      try { dataURL = bakeDataURL(natEl, edit, outW, outH); } catch (e) { console.error(e); return; }
      o.onCommit({ dataURL, edit: normEdit(edit) });
    };
    // a foto solta só aparece durante o gesto; parada, vale a página já redesenhada (textos por cima)
    let liveT = 0;
    const onLive = () => { win.classList.add('is-live'); clearTimeout(liveT); liveT = setTimeout(() => win.classList.remove('is-live'), 900); };
    const ctl = wireControls(tools, win, img, { edit0: o.edit, onHistoryPoint: o.onHistoryPoint, onSettle: commit, onLive });
    win.addEventListener('pointerdown', onLive);
    // gestos na janela não chegam à prancheta (pinça não dá zoom na página, roda não rola)
    ['touchstart', 'touchmove', 'wheel'].forEach(t => win.addEventListener(t, e => e.stopPropagation(), { passive: t !== 'wheel' }));
    loadImage(o.src).then(im => { natEl = im; ready = true; img.src = o.src; }).catch(() => {});
    return { ctl, destroy() { win.innerHTML = ''; tools.innerHTML = ''; } };
  }

  /* ===================== modal (reserva — não usado por padrão) =====================
     Mantido pra quem preferir um popup em vez de embutir no painel; Planner
     Studio e Calendar Studio usam mount() acima. */
  let _active = null;
  function closeActive() { if (_active) { _active.close(); _active = null; } }
  function open(opts) {
    closeActive();
    const o = Object.assign({ aspect: 1, title: 'Editar foto', outMax: 1800, applyLabel: 'Aplicar' }, opts || {});
    const scrim = document.createElement('div'); scrim.className = 'imgedit-scrim';
    const modal = document.createElement('div'); modal.className = 'imgedit-modal';
    modal.innerHTML =
      `<div class="imgedit-head"><span>${escHtml(o.title)}</span><button type="button" class="iconbtn ghost" data-x title="Fechar">✕</button></div>` +
      TOOLS_HTML.replace('class="imgedit-tools"', 'class="imgedit-tools scrl"') +
      `<div class="imgedit-foot"><button type="button" data-cancel>Cancelar</button>` +
      `<button type="button" class="primary" data-apply>${escHtml(o.applyLabel)}</button></div>`;
    document.body.append(scrim, modal);
    if (typeof injectIcons === 'function') { try { injectIcons(modal); } catch (e) {} }
    const win = modal.querySelector('.imgedit-win');
    const img = modal.querySelector('.imgedit-img');
    sizeWin(win, modal.clientWidth, Math.max(0.05, +o.aspect || 1), 0.40);

    let natEl = null, ready = false;
    const ctl = wireControls(modal, win, img, { edit0: o.edit });
    loadImage(o.src).then(im => { natEl = im; ready = true; img.src = o.src; }).catch(() => {
      modal.querySelector('.imgedit-stage').insertAdjacentHTML('beforeend', '<p class="hint">Não consegui carregar a imagem.</p>');
    });

    function close() { scrim.remove(); modal.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) { if (e.key === 'Escape') { close(); if (o.onCancel) o.onCancel(); } }
    document.addEventListener('keydown', onKey, true);
    scrim.addEventListener('pointerdown', () => { close(); if (o.onCancel) o.onCancel(); });
    modal.querySelector('[data-x]').onclick = modal.querySelector('[data-cancel]').onclick = () => { close(); if (o.onCancel) o.onCancel(); };
    modal.querySelector('[data-apply]').onclick = () => {
      if (!ready || !natEl) return;
      const [outW, outH] = outSize(o.aspect, o.outMax);
      let dataURL;
      try { dataURL = bakeDataURL(natEl, ctl.getEdit(), outW, outH); } catch (e) { console.error(e); return; }
      close();
      if (o.onApply) o.onApply({ dataURL, edit: ctl.getEdit() });
    };
    _active = { close };
    return _active;
  }

  const api = { mount, onSheet, open, close: closeActive, bake, bakeDataURL, normEdit, defaultEdit, cssFilter, imgTransform, loadImage, FILTER_PRESETS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EPImgEdit = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
