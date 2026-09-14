/* packages/core/canvas-edit.js — EPCanvasEdit
 *
 * Edição direta na folha, estilo Canva, para as ferramentas vetoriais
 * (Planner Studio, Calendar Studio e Polaroide Studio). O app desenha a página normalmente;
 * este módulo sobrepõe caixas nos elementos editáveis (título, nome, logo,
 * textos, imagens e ilustrações livres…) e permite:
 *   - tocar/clicar para selecionar; tocar de novo (ou clique duplo) num
 *     texto para digitar ali mesmo (canvas-edit-text.js);
 *   - arrastar para mover (com guias de centro que "grudam");
 *   - puxar a alça do canto para aumentar/diminuir;
 *   - barra de ícones (canvas-edit-bar.js): editar, fonte, tamanho, cor,
 *     negrito, centralizar, duplicar, trocar, restaurar, ocultar/excluir.
 *
 * O módulo não sabe nada do documento: tudo passa pelas funções do app.
 *
 *   const ce = EPCanvasEdit.create({
 *     sheets,                               // container das páginas (.page)
 *     zoom(), isMobile(), scroller(),
 *     hits(pageEl)  -> { w, h, items:[{ key, label, kind:'text'|'image'|'art'|'photo', x, y, w, h }] } | null   (mm)
 *     get(pageEl, key) -> { dx, dy, s, color, fam, bold, text?, textLabel?, multiline?, maxlength?,
 *                           removable?, duplicable?, canReplace?, colorable? }
 *     begin(pageEl, key)                    // antes de uma alteração (histórico)
 *     set(pageEl, key, patch, { live })     // aplica e redesenha a página
 *     action(pageEl, key, name)             // 'reset'|'hide'|'delete'|'image'|'duplicate' (duplicate devolve a nova chave)
 *     photo(pageEl, key, win, tools)        // opcional: ajuste de foto na folha (EPImgEdit.onSheet)
 *     fonts: [{ v, label }],  colors(pageEl) -> [hex…],  onSelect(page, key)
 *     addTools: [{ a, label, icon }], add(pageEl, a)   // opcional: barra "Adicionar" ao tocar na página
 *   })
 *   ce.pick(pageEl, clientX, clientY) -> true se pegou um elemento
 *   ce.show(pageEl)  ce.select(pageEl, key)  ce.editText()  ce.refresh()  ce.clear()
 *
 * Estilo de cada elemento (efeitos, giro, transparência…): modelo único em
 * text-fx.js (EPTextFx) — get() devolve os campos e set() recebe os patches.
 */
(function (root) {
  "use strict";
  const MM = 96 / 25.4;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  function create(o) {
    const sheets = o.sheets;
    const layer = document.createElement('div');
    layer.className = 'ce-layer';
    let cur = null;          // { page, key }
    let data = null;         // resultado de hits() da página ativa
    let guideV = null, guideH = null;
    let photo = null;        // { page, key, win, tools, api } — ajuste de foto direto na folha
    let typing = null;       // editor de texto aberto na folha

    const mobile = () => !!(o.isMobile && o.isMobile());
    const zoom = () => (o.zoom && o.zoom()) || 1;
    const ensureLayer = () => { if (layer.parentNode !== sheets) sheets.appendChild(layer); };
    const item = () => (cur && data && data.items.find(i => i.key === cur.key)) || null;
    const bar = root.EPCanvasEditBar.create({
      o, mobile, cur: () => cur, item, data: () => data,
      place: () => place(), move: () => movePlace(), select: (p, k) => select(p, k), clear: () => clear(),
      editText: () => editText(), photoTools: () => (photo ? photo.tools : null),
    });

    const boxPos = (b, it, org) => {
      b.style.left = (org.x + it.x * MM) + 'px'; b.style.top = (org.y + it.y * MM) + 'px';
      b.style.width = Math.max(4, it.w * MM) + 'px'; b.style.height = Math.max(4, it.h * MM) + 'px';
    };
    const HANDLES = '<i class="ce-h ce-h--br" data-h="br"></i><i class="ce-h ce-h--tl" data-h="tl"></i><i class="ce-h ce-h--tr" data-h="tr"></i><i class="ce-h ce-h--bl" data-h="bl"></i>';

    function place() {
      ensureLayer();
      layer.innerHTML = '';
      if (!cur || !cur.page.isConnected) { bar.close(); return; }
      data = o.hits(cur.page);
      if (!data) { clear(); return; }
      const org = { x: cur.page.offsetLeft, y: cur.page.offsetTop };
      data.items.forEach(it => {
        const b = document.createElement('div');
        const sel = it.key === cur.key;
        b.className = 'ce-box is-' + it.kind + (sel ? ' is-sel' : '');
        b.dataset.key = it.key;
        boxPos(b, it, org);
        b.title = it.label || '';
        if (sel && it.kind === 'photo') {
          // a área da foto vira a janela de ajuste (arrastar/pinça/roda) — prévia na própria folha
          if (!photo || photo.page !== cur.page || photo.key !== it.key) startPhoto(it);
          if (photo) b.appendChild(photo.win);
        } else if (sel) b.insertAdjacentHTML('beforeend', HANDLES);
        if (sel) b.insertAdjacentHTML('beforeend', `<span class="ce-tag">${esc(it.label || '')}</span>`);
        layer.appendChild(b);
      });
      guideV = document.createElement('i'); guideV.className = 'ce-guide ce-guide--v'; guideV.hidden = true;
      guideH = document.createElement('i'); guideH.className = 'ce-guide ce-guide--h'; guideH.hidden = true;
      guideV.style.left = (org.x + data.w * MM / 2) + 'px'; guideV.style.top = org.y + 'px'; guideV.style.height = data.h * MM + 'px';
      guideH.style.top = (org.y + data.h * MM / 2) + 'px'; guideH.style.left = org.x + 'px'; guideH.style.width = data.w * MM + 'px';
      layer.append(guideV, guideH);
      if (!cur.key || !data.items.some(i => i.key === cur.key && i.kind === 'photo')) stopPhoto();
      if (cur.key && item()) { if (!typing) { bar.open(); if (mobile()) keepVisible(); } }
      else if (!cur.key && o.addTools) bar.open();
      else bar.close();
      if (typing) typing.reposition();
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
      if (typing && cur && cur.page === page && cur.key === key) return;   // o "click" que segue o toque não fecha a digitação
      if (typing) typing.close(false);
      if (photo && (photo.page !== page || photo.key !== key)) stopPhoto();
      if (!cur || cur.key !== key) bar.reset();
      cur = { page, key: key || null };
      document.body.classList.toggle('ce-editing', !!key);
      place();
      if (o.onSelect) o.onSelect(page, key || null);
    }
    function clear() {
      if (typing) typing.close(false);
      stopPhoto();
      const had = !!cur;
      cur = null; data = null; layer.innerHTML = ''; bar.close();
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
      if (typing) return true;
      const it = itemAt(page, cx, cy);
      if (!it) { if (cur && cur.page === page && cur.key) select(page, null); return false; }
      select(page, it.key);
      return true;
    }
    // mostra os contornos dos elementos editáveis de uma página (sem selecionar nenhum)
    function show(page) { if (!typing && (!cur || cur.page !== page)) select(page, null); }

    // depois de o app redesenhar (a página pode ter virado outro elemento)
    function refresh() {
      if (!cur) { ensureLayer(); return; }
      if (!cur.page.isConnected) {
        const idx = cur.page.dataset.idx;
        const np = idx != null && sheets.querySelector(`.page[data-idx="${idx}"]`);
        if (np) cur.page = np; else { clear(); return; }
      }
      place();
    }

    /* ---------- digitar na folha ---------- */
    function editText() {
      if (!cur || !cur.key) return false;
      const page = cur.page, k = cur.key, it = item(), f = o.get(page, k);
      if (!it || it.kind !== 'text' || !f || f.text == null) return false;
      if (typing) typing.close(false);
      bar.close();
      layer.classList.add('is-typing');
      // no celular, sobe a folha para o texto ficar acima do teclado
      if (mobile()) { const sc = o.scroller && o.scroller(), box = layer.querySelector('.ce-box.is-sel'); if (sc && box) { const r = box.getBoundingClientRect(), sr = sc.getBoundingClientRect(); sc.scrollTop += r.top - sr.top - Math.min(120, sr.height * 0.2); } }
      let began = false;
      const F = root.EPFontMetrics && root.EPFontMetrics.families;
      typing = root.EPCanvasEditText.open({
        anchor: () => layer.querySelector('.ce-box.is-sel'),
        text: f.text, multiline: !!f.multiline, maxlength: f.maxlength || (f.multiline ? 400 : 140),
        placeholder: f.textLabel || 'Texto', fontCss: F && f.fam && F[f.fam] ? F[f.fam].css : '', color: f.color,
        scroller: o.scroller && o.scroller(),
        onInput: v => { if (!began) { o.begin(page, k); began = true; } o.set(page, k, { text: v }, { live: true }); movePlace(); },
        onDone: () => {
          typing = null; layer.classList.remove('is-typing');
          if (began) o.set(page, k, {}, { live: false });
          if (cur && cur.key === k) refresh();
        },
      });
      return true;
    }

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
      drag = { key, h: e.target.dataset.h || null, x0: e.clientX, y0: e.clientY, dx0: +f.dx || 0, dy0: +f.dy || 0, s0: +f.s || 1,
        it: item(), started: false, id: e.pointerId, t0: Date.now() };
      try { box.setPointerCapture(e.pointerId); } catch (_) {}
    }, true);
    layer.addEventListener('pointermove', e => {
      if (!drag || drag.tapSelect || e.pointerId !== drag.id) return;
      const k = zoom() * MM;
      const mx = (e.clientX - drag.x0) / k, my = (e.clientY - drag.y0) / k;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < (e.pointerType === 'touch' ? 6 : 3)) return;
        drag.started = true; o.begin(cur.page, drag.key); layer.classList.add('is-dragging'); document.body.classList.add('ce-dragging');
      }
      if (drag.h) {
        // alça: escala pela distância ao centro do elemento
        const it = drag.it;
        const sx = drag.h.includes('r') ? 1 : -1, sy = drag.h.includes('b') ? 1 : -1;
        const r0 = Math.hypot(it.w / 2, it.h / 2);
        const r1 = Math.hypot(it.w / 2 + sx * mx, it.h / 2 + sy * my);
        o.set(cur.page, drag.key, { s: clamp(Math.round(drag.s0 * (r1 / Math.max(1, r0)) * 100) / 100, 0.2, 6) }, { live: true });
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
      layer.classList.remove('is-dragging'); document.body.classList.remove('ce-dragging');
      if (d.tapSelect) {
        if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8 && cur) select(cur.page, d.tapSelect);
        return;
      }
      if (d.started) { o.set(cur.page, d.key, {}, { live: false }); place(); return; }
      // toque sem arrastar num texto já selecionado: digitar ali mesmo
      if (e.type === 'pointerup' && !d.h && Date.now() - d.t0 < 600) editText();
    };
    layer.addEventListener('pointerup', endDrag);
    layer.addEventListener('pointercancel', endDrag);
    // durante o arraste só reposiciona as caixas
    function movePlace() {
      if (!cur) return;
      const d = o.hits(cur.page); if (!d) return;
      data = d;
      const org = { x: cur.page.offsetLeft, y: cur.page.offsetTop };
      layer.querySelectorAll('.ce-box').forEach(b => {
        const it = d.items.find(i => i.key === b.dataset.key); if (it) boxPos(b, it, org);
      });
      if (typing) typing.reposition();
    }

    // no celular: rola a prancheta para o elemento ficar acima da barra
    function keepVisible() {
      const sc = o.scroller && o.scroller();
      requestAnimationFrame(() => {
        const box = layer.querySelector('.ce-box.is-sel'), el = bar.el; if (!box || !sc || !el) return;
        const r = box.getBoundingClientRect(), sr = sc.getBoundingClientRect(), bt = el.getBoundingClientRect().top;
        const bottom = Math.min(sr.bottom, bt) - 16;
        if (r.bottom > bottom || r.top < sr.top + 8) sc.scrollBy({ top: r.top - (sr.top + (bottom - sr.top) / 2 - r.height / 2), behavior: 'smooth' });
      });
    }

    // teclado (desktop): setas movem, Delete oculta/exclui, Esc sai, Enter digita
    addEventListener('keydown', e => {
      if (cur && !cur.key && !typing && e.key === 'Escape' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { clear(); return; }
      if (!cur || !cur.key || typing) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
      const page = cur.page, k = cur.key, f = o.get(page, k); if (!f) return;
      const d = e.shiftKey ? 5 : 0.5;
      const mv = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key];
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); o.begin(page, k); o.set(page, k, { dx: Math.round(((+f.dx || 0) + mv[0]) * 10) / 10, dy: Math.round(((+f.dy || 0) + mv[1]) * 10) / 10 }, { live: false }); place(); }
      else if (e.key === 'Escape') { e.stopImmediatePropagation(); select(page, null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && f.duplicable) { e.preventDefault(); e.stopImmediatePropagation(); o.begin(page, k); const nk = o.action(page, k, 'duplicate'); if (typeof nk === 'string') select(page, nk); }
      else if (e.key === 'Enter' && f.text != null) { e.preventDefault(); e.stopImmediatePropagation(); editText(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); o.begin(page, k); o.action(page, k, f.removable ? 'delete' : 'hide'); select(page, null); }
    }, true);
    addEventListener('resize', () => bar.position());
    if (o.scroller) { const sc = o.scroller(); if (sc) sc.addEventListener('scroll', () => { if (!mobile()) bar.position(); }, { passive: true }); }
    // clicar fora da folha/barra encerra a seleção do elemento
    document.addEventListener('pointerdown', e => {
      if (!cur || typing) return;
      const t = e.target;
      if ((bar.el && bar.el.contains(t)) || layer.contains(t) || (t.closest && t.closest('.page'))) return;
      if (t.closest && t.closest('#mtabs,#mtop,.ce-keep,.ep-art,.toast,#toast')) return;
      if (cur.key) select(cur.page, null); else if (bar.el) clear();
    }, true);

    return {
      pick, show, select, clear, itemAt, editText,
      refresh,
      current() { return cur ? { page: cur.page, key: cur.key } : null; },
      isBusy() { return !!drag || !!typing; },
    };
  }

  root.EPCanvasEdit = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPCanvasEdit;
})(typeof window !== 'undefined' ? window : globalThis);
