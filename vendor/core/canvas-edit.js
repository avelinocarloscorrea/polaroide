/* packages/core/canvas-edit.js — EPCanvasEdit
 *
 * Edição direta na folha, estilo Canva, para as ferramentas vetoriais
 * (Planner Studio e Calendar Studio). O app desenha a página normalmente;
 * este módulo sobrepõe caixas nos elementos editáveis (título, subtítulo,
 * nome, logo, textos e imagens livres…) e permite:
 *   - tocar/clicar para selecionar;
 *   - arrastar para mover (com guias de centro que "grudam");
 *   - puxar a alça do canto para aumentar/diminuir;
 *   - barra de ferramentas: texto, fonte, tamanho, cor, negrito, centralizar,
 *     restaurar, ocultar/excluir, trocar imagem.
 * No celular a barra vira um painel inferior curto e a folha continua visível.
 *
 * O módulo não sabe nada do documento: tudo passa pelas funções do app.
 *
 *   const ce = EPCanvasEdit.create({
 *     sheets,                               // container das páginas (.page)
 *     zoom(),  isMobile(),
 *     hits(pageEl)  -> { w, h, items:[{ key, label, kind:'text'|'image', x, y, w, h }] } | null   (mm)
 *     get(pageEl, key) -> { dx, dy, s, color, fam, bold, hide, text?, textLabel?, removable?, multiline? }
 *     begin(pageEl, key)                    // antes de uma alteração (histórico)
 *     set(pageEl, key, patch, { live })     // aplica e redesenha a página
 *     action(pageEl, key, name)             // 'reset' | 'hide' | 'delete' | 'image'
 *     fonts: [{ v, label }],  colors(pageEl) -> [hex…]
 *   })
 *   ce.pick(pageEl, clientX, clientY) -> true se pegou um elemento
 *   ce.refresh()  (depois de redesenhar)      ce.clear()
 */
(function (root) {
  "use strict";
  const MM = 96 / 25.4;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const I = {
    minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>', bold: '<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"/>',
    center: '<path d="M12 3v18"/><rect x="6" y="8" width="12" height="8" rx="1.5"/>', reset: '<path d="M4 12a8 8 0 108-8"/><path d="M4 4v5h5"/>',
    hide: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c5.5 0 9 7 9 7a16 16 0 01-3.2 4.2M6.2 6.2A15.7 15.7 0 003 12s3.5 7 9 7a9.6 9.6 0 004.2-1"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  };
  const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;

  function create(o) {
    const sheets = o.sheets;
    const layer = document.createElement('div');
    layer.className = 'ce-layer';
    let cur = null;          // { page, key }
    let data = null;         // resultado de hits() da página ativa
    let bar = null, guideV = null, guideH = null;
    let photo = null;        // { page, key, win, tools, api } — ajuste de foto direto na folha

    const zoom = () => (o.zoom && o.zoom()) || 1;
    const ensureLayer = () => { if (layer.parentNode !== sheets) sheets.appendChild(layer); };
    const pageOrigin = page => ({ x: page.offsetLeft, y: page.offsetTop });

    function place() {
      ensureLayer();
      layer.innerHTML = '';
      if (!cur || !cur.page.isConnected) { closeBar(); return; }
      data = o.hits(cur.page);
      if (!data) { clear(); return; }
      const org = pageOrigin(cur.page);
      data.items.forEach(it => {
        const b = document.createElement('div');
        const sel = it.key === cur.key;
        b.className = 'ce-box' + (sel ? ' is-sel' : '') + (it.kind === 'image' ? ' is-img' : '') + (it.kind === 'photo' ? ' is-photo' : '');
        b.dataset.key = it.key;
        b.style.left = (org.x + it.x * MM) + 'px'; b.style.top = (org.y + it.y * MM) + 'px';
        b.style.width = Math.max(4, it.w * MM) + 'px'; b.style.height = Math.max(4, it.h * MM) + 'px';
        b.title = it.label || '';
        if (sel && it.kind === 'photo') {
          // a área da foto vira a janela de ajuste (arrastar/pinça/roda) — prévia na própria folha
          if (!photo || photo.page !== cur.page || photo.key !== it.key) startPhoto(it);
          if (photo) b.appendChild(photo.win);
          b.insertAdjacentHTML('beforeend', `<span class="ce-tag">${esc(it.label || '')}</span>`);
        } else if (sel) {
          b.insertAdjacentHTML('beforeend', '<i class="ce-h ce-h--br" data-h="br"></i><i class="ce-h ce-h--tl" data-h="tl"></i><i class="ce-h ce-h--tr" data-h="tr"></i><i class="ce-h ce-h--bl" data-h="bl"></i>' +
            `<span class="ce-tag">${esc(it.label || '')}</span>`);
        }
        layer.appendChild(b);
      });
      guideV = document.createElement('i'); guideV.className = 'ce-guide ce-guide--v'; guideV.hidden = true;
      guideH = document.createElement('i'); guideH.className = 'ce-guide ce-guide--h'; guideH.hidden = true;
      guideV.style.left = (org.x + data.w * MM / 2) + 'px'; guideV.style.top = org.y + 'px'; guideV.style.height = data.h * MM + 'px';
      guideH.style.top = (org.y + data.h * MM / 2) + 'px'; guideH.style.left = org.x + 'px'; guideH.style.width = data.w * MM + 'px';
      layer.append(guideV, guideH);
      if (!cur.key || !data.items.some(i => i.key === cur.key && i.kind === 'photo')) stopPhoto();
      if (cur.key) openBar(); else closeBar();
    }
    function startPhoto(it) {
      stopPhoto();
      if (!o.photo) return;
      const win = document.createElement('div'); win.className = 'ce-photo';
      const tools = document.createElement('div'); tools.className = 'ce-phototools';
      const api = o.photo(cur.page, it.key, win, tools);
      if (!api) return;
      photo = { page: cur.page, key: it.key, win, tools, api };
    }
    function stopPhoto() { if (photo) { try { photo.api.destroy && photo.api.destroy(); } catch (_) {} photo = null; } }

    function select(page, key) {
      if (photo && (photo.page !== page || photo.key !== key)) stopPhoto();
      cur = { page, key: key || null };
      document.body.classList.toggle('ce-editing', !!key);
      place();
      if (o.onSelect) o.onSelect(page, key || null);
    }
    function clear() {
      stopPhoto();
      const had = !!cur;
      cur = null; data = null; layer.innerHTML = ''; closeBar();
      document.body.classList.remove('ce-editing');
      if (had && o.onSelect) o.onSelect(null, null);
    }

    function itemAt(page, cx, cy) {
      const d = o.hits(page); if (!d) return null;
      const r = page.getBoundingClientRect(), k = r.width / (d.w * MM);   // px de tela por px de layout
      const mx = (cx - r.left) / k / MM, my = (cy - r.top) / k / MM;
      // o menor elemento que contém o ponto (texto sobre fundo, logo sobre título…)
      let best = null;
      d.items.forEach(it => {
        const pad = 1.5;
        if (mx >= it.x - pad && mx <= it.x + it.w + pad && my >= it.y - pad && my <= it.y + it.h + pad) {
          if (!best || it.w * it.h < best.w * best.h) best = it;
        }
      });
      return best;
    }
    function pick(page, cx, cy) {
      const it = itemAt(page, cx, cy);
      if (!it) { if (cur && cur.page === page && cur.key) select(page, null); return false; }
      select(page, it.key);
      return true;
    }
    // mostra os contornos dos elementos editáveis de uma página (sem selecionar nenhum)
    function show(page) { if (!cur || cur.page !== page || cur.key) { if (!cur || cur.page !== page) select(page, null); } }

    /* ---------- arrastar / redimensionar ---------- */
    let drag = null;
    layer.addEventListener('pointerdown', e => {
      const box = e.target.closest('.ce-box'); if (!box || !cur) return;
      const key = box.dataset.key;
      if (key === cur.key && box.classList.contains('is-photo')) return;
      if (key !== cur.key) {                       // tocou noutro elemento: seleciona
        e.stopPropagation();
        drag = { tapSelect: key, x0: e.clientX, y0: e.clientY, id: e.pointerId };
        return;
      }
      e.preventDefault(); e.stopPropagation();
      const f = o.get(cur.page, key) || {};
      const it = data.items.find(i => i.key === key);
      drag = { key, h: e.target.dataset.h || null, x0: e.clientX, y0: e.clientY, dx0: +f.dx || 0, dy0: +f.dy || 0, s0: +f.s || 1,
        it, started: false, id: e.pointerId };
      try { box.setPointerCapture(e.pointerId); } catch (_) {}
    }, true);
    layer.addEventListener('pointermove', e => {
      if (!drag || drag.tapSelect || e.pointerId !== drag.id) return;
      const k = zoom() * MM;
      const mx = (e.clientX - drag.x0) / k, my = (e.clientY - drag.y0) / k;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 3) return;
        drag.started = true; o.begin(cur.page, drag.key); layer.classList.add('is-dragging'); closeBar(true);
      }
      if (drag.h) {
        // alça: escala pela distância ao centro do elemento
        const it = drag.it, cxm = it.x + it.w / 2, cym = it.y + it.h / 2;
        const sx = drag.h.includes('r') ? 1 : -1, sy = drag.h.includes('b') ? 1 : -1;
        const r0 = Math.hypot(it.w / 2, it.h / 2);
        const r1 = Math.hypot(it.w / 2 + sx * mx, it.h / 2 + sy * my);
        const s = clamp(Math.round(drag.s0 * (r1 / Math.max(1, r0)) * 100) / 100, 0.25, 5);
        void cxm; void cym;
        o.set(cur.page, drag.key, { s }, { live: true });
      } else {
        let dx = drag.dx0 + mx, dy = drag.dy0 + my;
        const it = drag.it, cxNow = it.x + it.w / 2 + mx, cyNow = it.y + it.h / 2 + my;
        const snap = 1.6 / Math.min(1.5, zoom());
        const nearV = Math.abs(cxNow - data.w / 2) < snap, nearH = Math.abs(cyNow - data.h / 2) < snap;
        if (nearV) dx += data.w / 2 - cxNow;
        if (nearH) dy += data.h / 2 - cyNow;
        guideV.hidden = !nearV; guideH.hidden = !nearH;
        o.set(cur.page, drag.key, { dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 }, { live: true });
      }
      movePlace();
    });
    const endDrag = e => {
      if (!drag) return;
      const d = drag; drag = null;
      layer.classList.remove('is-dragging');
      if (d.tapSelect) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8 && cur) select(cur.page, d.tapSelect);
        return;
      }
      if (d.started) { o.set(cur.page, d.key, {}, { live: false }); place(); }
    };
    layer.addEventListener('pointerup', endDrag);
    layer.addEventListener('pointercancel', endDrag);
    // durante o arraste só reposiciona as caixas (sem reabrir a barra)
    function movePlace() {
      if (!cur) return;
      const d = o.hits(cur.page); if (!d) return;
      data = d;
      const org = pageOrigin(cur.page);
      layer.querySelectorAll('.ce-box').forEach(b => {
        const it = d.items.find(i => i.key === b.dataset.key); if (!it) return;
        b.style.left = (org.x + it.x * MM) + 'px'; b.style.top = (org.y + it.y * MM) + 'px';
        b.style.width = Math.max(4, it.w * MM) + 'px'; b.style.height = Math.max(4, it.h * MM) + 'px';
      });
      if (drag && drag.it) {
        const it = d.items.find(i => i.key === drag.key);
        if (it && drag.h) drag.it = drag.it;   // a escala usa a caixa do início do gesto
      }
    }

    /* ---------- barra de ferramentas ---------- */
    function closeBar(keepSel) {
      if (bar) { bar.remove(); bar = null; }
      document.body.classList.remove('ce-bar-open');
      if (!keepSel) void 0;
    }
    function openBar() {
      if (!cur || !cur.key) return;
      const f = o.get(cur.page, cur.key); if (!f) return;
      const it = data.items.find(i => i.key === cur.key); if (!it) return;
      const mob = o.isMobile && o.isMobile();
      const focused = bar && bar.contains(document.activeElement) ? document.activeElement.dataset.ce : null;
      if (bar) bar.remove();
      bar = document.createElement('div');
      bar.className = 'ce-bar' + (mob ? ' ce-bar--sheet' : ' ce-bar--top');
      const colors = (o.colors && o.colors(cur.page)) || [];
      const isText = it.kind === 'text';
      if (it.kind === 'photo') {
        bar.className += ' ce-bar--photo';
        bar.innerHTML = (mob ? '<div class="ce-bar__grab"><i></i></div>' : '') +
          `<div class="ce-bar__head"><b>${esc(it.label || 'Foto')}</b><span class="ce-bar__hint">Arraste a foto na folha para enquadrar · pinça ou roda para zoom</span>` +
          `<button type="button" class="ce-ib" data-ce="close" title="Concluir (Esc)">${svg('x')}</button></div>` +
          `<div class="ce-bar__row ce-bar__acts">` + (f.canReplace ? `<button type="button" class="ce-btn" data-ce="image">${svg('image')}<span>Trocar foto</span></button>` : '') +
          (f.removable ? `<button type="button" class="ce-btn is-danger" data-ce="delete">${svg('trash')}<span>Remover</span></button>` : '') + '</div>';
        if (photo) bar.appendChild(photo.tools);
        document.body.appendChild(bar);
        document.body.classList.add('ce-bar-open');
        if (!mob) positionBar(); else scrollIntoViewAbove();
        bindBar();
        return;
      }
      const fam = f.fam || '';
      bar.innerHTML =
        (mob ? '<div class="ce-bar__grab"><i></i></div>' : '') +
        `<div class="ce-bar__head"><b>${esc(it.label || 'Elemento')}</b><span class="ce-bar__hint">${mob ? 'Arraste na folha para mover' : 'Arraste para mover · alças para o tamanho'}</span>` +
        (mob ? `<button type="button" class="ce-ib" data-ce="close" title="Concluir">${svg('x')}</button>` : '') + '</div>' +
        (isText && f.text != null ? (f.multiline
          ? `<textarea class="ce-text" data-ce="text" rows="3" placeholder="${esc(f.textLabel || 'Texto')}">${esc(f.text)}</textarea>`
          : `<input class="ce-text" data-ce="text" type="text" maxlength="140" value="${esc(f.text)}" placeholder="${esc(f.textLabel || 'Texto')}">`) : '') +
        '<div class="ce-bar__row">' +
        (isText ? `<select class="ce-font" data-ce="fam" title="Fonte"><option value="">Fonte padrão</option>${(o.fonts || []).map(x => `<option value="${esc(x.v)}"${x.v === fam ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select>` : '') +
        `<div class="ce-step" title="Tamanho"><button type="button" class="ce-ib" data-ce="smaller">${svg('minus')}</button><span data-ce="sval">${Math.round((f.s || 1) * 100)}%</span><button type="button" class="ce-ib" data-ce="bigger">${svg('plus')}</button></div>` +
        (isText ? `<button type="button" class="ce-ib${f.bold ? ' on' : ''}" data-ce="bold" title="Negrito">${svg('bold')}</button>` : '') +
        (it.kind === 'image' && f.canReplace ? `<button type="button" class="ce-btn" data-ce="image">${svg('image')}<span>Trocar</span></button>` : '') +
        '</div>' +
        (isText ? `<div class="ce-bar__row ce-colors">${colors.map(c => `<button type="button" class="ce-sw${(f.color || '').toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-ce="color" data-c="${c}" title="${c}"><i data-c="${c}"></i></button>`).join('')}` +
          `<label class="ce-sw ce-sw--pick" title="Outra cor"><input type="color" data-ce="colorpick" value="${/^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#333333'}"></label>` +
          `<button type="button" class="ce-sw ce-sw--auto${f.color ? '' : ' on'}" data-ce="color" data-c="" title="Cor do estilo">A</button></div>` : '') +
        '<div class="ce-bar__row ce-bar__acts">' +
        `<button type="button" class="ce-btn" data-ce="center" title="Centralizar na página">${svg('center')}<span>Centralizar</span></button>` +
        `<button type="button" class="ce-btn" data-ce="reset" title="Restaurar posição, tamanho e cor">${svg('reset')}<span>Restaurar</span></button>` +
        (f.removable ? `<button type="button" class="ce-btn is-danger" data-ce="delete" title="Excluir">${svg('trash')}<span>Excluir</span></button>`
                     : `<button type="button" class="ce-btn" data-ce="hide" title="Ocultar">${svg('hide')}<span>Ocultar</span></button>`) +
        (mob ? '' : `<button type="button" class="ce-ib ce-close" data-ce="close" title="Concluir (Esc)">${svg('x')}</button>`) +
        '</div>';
      // cores via CSSOM (a CSP proíbe style="")
      bar.querySelectorAll('i[data-c]').forEach(i => { i.style.background = i.dataset.c; });
      document.body.appendChild(bar);
      document.body.classList.add('ce-bar-open');
      if (!mob) positionBar();
      else scrollIntoViewAbove();
      if (focused) { const el = bar.querySelector(`[data-ce="${focused}"]`); if (el) { el.focus(); if (el.setSelectionRange) { const n = el.value.length; el.setSelectionRange(n, n); } } }
      bindBar();
    }
    // desktop: barra fixa no topo da prancheta (não cobre a página, como no Canva)
    function positionBar() {
      if (!bar || !cur) return;
      const sc = o.scroller && o.scroller();
      const r = sc ? sc.getBoundingClientRect() : { left: 0, top: 60, width: innerWidth };
      if (bar.classList.contains('ce-bar--photo')) {
        // painel do lado da página com mais espaço livre
        const pr = cur.page.getBoundingClientRect();
        const leftFree = pr.left - r.left, rightFree = r.left + r.width - pr.right;
        const x = rightFree > leftFree ? Math.min(r.left + r.width - 312, pr.right + 12) : Math.max(r.left + 12, pr.left - 312);
        bar.style.width = '300px'; bar.style.left = x + 'px'; bar.style.top = (r.top + 12) + 'px';
        bar.style.maxHeight = Math.max(240, r.height - 24) + 'px';
        return;
      }
      const bw = Math.min(r.width - 24, 900);
      bar.style.width = bw + 'px';
      bar.style.left = (r.left + (r.width - bw) / 2) + 'px';
      bar.style.top = (r.top + 12) + 'px';
    }
    // no celular: rola a prancheta para o elemento ficar acima do painel
    function scrollIntoViewAbove() {
      const box = layer.querySelector('.ce-box.is-sel'); const sc = o.scroller && o.scroller(); if (!box || !sc || !bar) return;
      requestAnimationFrame(() => {
        const r = box.getBoundingClientRect(), sr = sc.getBoundingClientRect(), bh = bar.getBoundingClientRect().top;
        const visibleBottom = Math.min(sr.bottom, bh) - 16;
        if (r.bottom > visibleBottom || r.top < sr.top + 8) sc.scrollBy({ top: r.top - (sr.top + (visibleBottom - sr.top) / 2 - r.height / 2), behavior: 'smooth' });
      });
    }
    function bindBar() {
      const k = cur.key, page = cur.page;
      const step = d => { const f = o.get(page, k) || {}; o.begin(page, k); o.set(page, k, { s: clamp(Math.round(((+f.s || 1) + d) * 100) / 100, 0.25, 5) }, { live: false }); place(); };
      bar.addEventListener('click', e => {
        const b = e.target.closest('[data-ce]'); if (!b) return;
        const a = b.dataset.ce;
        if (a === 'close') { select(page, null); return; }
        if (a === 'smaller') step(-0.05);
        else if (a === 'bigger') step(0.05);
        else if (a === 'bold') { const f = o.get(page, k); o.begin(page, k); o.set(page, k, { bold: !f.bold }, { live: false }); place(); }
        else if (a === 'color') { o.begin(page, k); o.set(page, k, { color: b.dataset.c || null }, { live: false }); place(); }
        else if (a === 'center') {
          const it = data.items.find(i => i.key === k), f = o.get(page, k);
          o.begin(page, k); o.set(page, k, { dx: Math.round(((+f.dx || 0) + data.w / 2 - (it.x + it.w / 2)) * 10) / 10 }, { live: false }); place();
        }
        else if (a === 'reset' || a === 'hide' || a === 'delete' || a === 'image') {
          o.begin(page, k); o.action(page, k, a);
          if (a === 'hide' || a === 'delete') select(page, null); else place();
        }
      });
      const t = bar.querySelector('[data-ce="text"]');
      if (t) {
        let began = false;
        t.addEventListener('input', () => { if (!began) { o.begin(page, k); began = true; } o.set(page, k, { text: t.value }, { live: true }); movePlace(); if (!(o.isMobile && o.isMobile())) positionBar(); });
        t.addEventListener('change', () => { o.set(page, k, {}, { live: false }); began = false; });
        t.addEventListener('keydown', e => { if (e.key === 'Enter' && t.tagName === 'INPUT') { e.preventDefault(); t.blur(); } e.stopPropagation(); });
      }
      const fs = bar.querySelector('[data-ce="fam"]');
      if (fs) fs.addEventListener('change', () => { o.begin(page, k); o.set(page, k, { fam: fs.value || null }, { live: false }); place(); });
      const cp = bar.querySelector('[data-ce="colorpick"]');
      if (cp) { cp.addEventListener('input', () => o.set(page, k, { color: cp.value }, { live: true })); cp.addEventListener('change', () => { o.begin(page, k); o.set(page, k, { color: cp.value }, { live: false }); place(); }); }
      // painel inferior: arrastar a pega para baixo fecha
      const grab = bar.querySelector('.ce-bar__grab');
      if (grab) {
        let y0 = null;
        grab.addEventListener('pointerdown', e => { y0 = e.clientY; try { grab.setPointerCapture(e.pointerId); } catch (_) {} });
        grab.addEventListener('pointermove', e => { if (y0 != null) bar.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
        grab.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 > 60) select(page, null); else if (bar) bar.style.transform = ''; y0 = null; });
      }
    }

    // teclado (desktop): setas movem, Delete oculta/exclui, Esc sai
    addEventListener('keydown', e => {
      if (!cur || !cur.key) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) { if (e.key === 'Escape') { document.activeElement.blur(); } return; }
      const page = cur.page, k = cur.key, f = o.get(page, k); if (!f) return;
      const d = e.shiftKey ? 5 : 0.5;
      const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); o.begin(page, k); o.set(page, k, { dx: Math.round(((+f.dx || 0) + mv[0]) * 10) / 10, dy: Math.round(((+f.dy || 0) + mv[1]) * 10) / 10 }, { live: false }); place(); }
      else if (e.key === 'Escape') { e.stopImmediatePropagation(); select(page, null); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); o.begin(page, k); o.action(page, k, f.removable ? 'delete' : 'hide'); select(page, null); }
    }, true);
    addEventListener('resize', () => { if (bar && !(o.isMobile && o.isMobile())) positionBar(); });
    if (o.scroller) { const sc = o.scroller(); if (sc) sc.addEventListener('scroll', () => { if (bar && !(o.isMobile && o.isMobile())) positionBar(); }, { passive: true }); }
    // clicar fora da folha/barra encerra a seleção do elemento
    document.addEventListener('pointerdown', e => {
      if (!cur || !cur.key) return;
      const t = e.target;
      if ((bar && bar.contains(t)) || layer.contains(t) || (t.closest && t.closest('.page'))) return;
      if (t.closest && t.closest('#mtabs,#mtop,.ce-keep')) return;
      select(cur.page, null);
    }, true);

    return {
      pick, show, select, clear, itemAt,
      refresh() { if (cur) { if (!cur.page.isConnected) { const idx = cur.page.dataset.idx; const np = idx != null && sheets.querySelector(`.page[data-idx="${idx}"]`); if (np) cur.page = np; else { clear(); return; } } place(); } else ensureLayer(); },
      current() { return cur ? { page: cur.page, key: cur.key } : null; },
      isBusy() { return !!drag; },
    };
  }

  root.EPCanvasEdit = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPCanvasEdit;
})(typeof window !== 'undefined' ? window : globalThis);
