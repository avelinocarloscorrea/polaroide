/* packages/core/shell.js — EPShell
 *
 * Peças de interface compartilhadas pelas três ferramentas (Planner, Calendar,
 * Polaroide): trilho de abas do painel esquerdo, cartões de opção e controles
 * segmentados ligados a um <select> existente, prévia da folha impressa
 * (imposição) e galeria de modelos com filtro.
 *
 * Só-navegador (constrói DOM), como imgedit.js. Não conhece o estado de
 * nenhuma ferramenta: cada app passa callbacks. Os <select> originais
 * continuam sendo a fonte da verdade — os cartões só escrevem neles e
 * disparam `change`, então toda a lógica de migrate/save/render que já estava
 * ligada nesses campos segue valendo sem mudança.
 *
 * Sem estilo inline em atributo (a CSP `style-src 'self'` bloqueia): o que
 * precisa de cor/posição dinâmica usa CSSOM (`el.style.x = …`).
 */
(function (root) {
  "use strict";

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  /* ---------- trilho de abas (painel esquerdo) ----------
     rail: <nav> com botões [data-pane]; panes: container com <section data-pane>.
     Clicar na aba já ativa recolhe o painel (onCollapse(true)), igual a
     editores de código; clicar em outra aba abre e troca. */
  function initRail(o) {
    const rail = o.rail, panes = o.panes;
    if (!rail || !panes) return null;
    const btns = [...rail.querySelectorAll('[data-pane]')];
    const secs = [...panes.querySelectorAll(':scope > [data-pane]')];
    let cur = store.get(o.storageKey) || o.initial || (btns[0] && btns[0].dataset.pane);
    if (!secs.some(s => s.dataset.pane === cur)) cur = btns[0] && btns[0].dataset.pane;
    function show(id, opts = {}) {
      cur = id;
      btns.forEach(b => { const on = b.dataset.pane === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      secs.forEach(s => { s.hidden = s.dataset.pane !== id; });
      store.set(o.storageKey, id);
      if (!opts.keepScroll) panes.scrollTop = 0;
      if (o.onShow) o.onShow(id);
    }
    btns.forEach(b => {
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => {
        const id = b.dataset.pane;
        const collapsed = o.isCollapsed ? o.isCollapsed() : false;
        if (id === cur && !collapsed && o.onCollapse) { o.onCollapse(true); return; }
        show(id);
        if (collapsed && o.onCollapse) o.onCollapse(false);
      });
    });
    show(cur, { keepScroll: true });
    return { show, current: () => cur };
  }

  /* ---------- cartões de opção ligados a um <select> ----------
     defs: [{ v, title, desc, icon (svg string), badge }]. `desc` pode ser
     função (recalculada em sync) para mostrar a decisão do modo automático. */
  function optionCards(container, select, defs, o = {}) {
    if (!container || !select) return null;
    container.classList.add('ep-cards');
    container.setAttribute('role', 'radiogroup');
    function build() {
      container.innerHTML = '';
      defs.forEach(d => {
        if (d.hidden && d.hidden()) return;
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ep-card'; b.dataset.v = d.v;
        b.setAttribute('role', 'radio');
        const desc = typeof d.desc === 'function' ? d.desc() : d.desc;
        b.innerHTML =
          (d.icon ? `<span class="ep-card__ic">${d.icon}</span>` : '') +
          `<span class="ep-card__tx"><b>${esc(d.title)}${d.badge ? ` <em>${esc(d.badge)}</em>` : ''}</b>` +
          (desc ? `<span>${desc}</span>` : '') + `</span><span class="ep-card__dot" aria-hidden="true"></span>`;
        b.addEventListener('click', () => {
          if (select.value === String(d.v)) return;
          select.value = d.v;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          sync();
          if (o.onChange) o.onChange(d.v);
        });
        container.appendChild(b);
      });
      sync();
    }
    function sync() {
      [...container.children].forEach(b => {
        const on = b.dataset.v === String(select.value);
        b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
    }
    build();
    return { build, sync };
  }

  /* ---------- controle segmentado ligado a um <select> ou checkbox ---------- */
  function segmented(container, input, o = {}) {
    if (!container || !input) return null;
    container.classList.add('ep-seg');
    const isChk = input.type === 'checkbox';
    const opts = o.options || (isChk
      ? [{ v: 'false', label: o.off || 'Não' }, { v: 'true', label: o.on || 'Sim' }]
      : [...input.options].map(op => ({ v: op.value, label: op.dataset.short || op.text.split(' — ')[0] })));
    container.innerHTML = '';
    opts.forEach(op => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.v = op.v; b.textContent = op.label;
      b.addEventListener('click', () => {
        if (isChk) { const want = op.v === 'true'; if (input.checked === want) return; input.checked = want; }
        else { if (input.value === op.v) return; input.value = op.v; }
        input.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
      });
      container.appendChild(b);
    });
    function sync() {
      const cur = isChk ? String(input.checked) : input.value;
      [...container.children].forEach(b => b.classList.toggle('on', b.dataset.v === cur));
    }
    sync();
    return { sync };
  }

  /* ---------- prévia de uma folha impressa ----------
     sheet: { w, h (mm), slots: [{x,y,w,h, svg (string da página inteira)}],
              trims: [[x,y,w,h]], ticks: [x,y,w,h]|null, foldX, foldY, label }
     Aninha o SVG real de cada página dentro de um SVG da folha. */
  /* sheet = { w, h, slots:[{x,y,w,h,svg,num,rot?:180,clip?}], marks?:[[x1,y1,x2,y2]…],
   *           trims?/ticks? (legado), foldX?, foldY?, trimBox?, bleedBox?, guides?: true }
   * Mesma geometria da folha do PDF (EPPen.composeSheetPdf). */
  function sheetSVG(sheet) {
    const n = v => Math.round(v * 100) / 100;
    let body = `<rect x="0" y="0" width="${n(sheet.w)}" height="${n(sheet.h)}" fill="#fff"/>`;
    let clipSeq = 0;
    const defs = [];
    (sheet.slots || []).forEach(sl => {
      if (!sl.svg) {
        body += `<rect x="${n(sl.x)}" y="${n(sl.y)}" width="${n(sl.w)}" height="${n(sl.h)}" fill="#f3f1ec"/>`;
        return;
      }
      const inner = String(sl.svg).replace(/^<svg\b([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/, '<svg$1')
        .replace(/^<svg\b/, `<svg x="${n(sl.x)}" y="${n(sl.y)}" width="${n(sl.w)}" height="${n(sl.h)}"`);
      let g = inner;
      if (sl.rot === 180) g = `<g transform="rotate(180 ${n(sl.x + sl.w / 2)} ${n(sl.y + sl.h / 2)})">${g}</g>`;
      if (sl.clip) {
        const id = 'epsc' + (++sheetSeq) + '_' + (++clipSeq);
        defs.push(`<clipPath id="${id}"><rect x="${n(sl.clip.x)}" y="${n(sl.clip.y)}" width="${n(sl.clip.w)}" height="${n(sl.clip.h)}"/></clipPath>`);
        g = `<g clip-path="url(#${id})">${g}</g>`;
      }
      body += g;
      if (sl.num != null) {
        const r = Math.max(4, Math.min(sl.w, sl.h) * 0.065), digits = String(sl.num).length;
        const bw = Math.max(2 * r, r * (0.9 + 0.62 * digits)), bx = sl.x + sl.w - r * 0.6 - bw, by = sl.y + r * 0.6;
        body += `<g class="ep-sheet__num"><rect x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(2 * r)}" rx="${n(r)}"/>` +
          `<text x="${n(bx + bw / 2)}" y="${n(by + r)}" font-size="${n(r * 1.05)}">${esc(sl.num)}</text></g>`;
      }
    });
    // guias de pré-impressão: sangria (vermelho) e corte (azul) — só na prévia
    if (sheet.guides) {
      const box = (b, c) => b ? `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="none" stroke="${c}" stroke-width="0.35" stroke-dasharray="2 1.4"/>` : '';
      if (sheet.bleedBox && sheet.trimBox && sheet.bleedBox.w > sheet.trimBox.w + 0.01) body += box(sheet.bleedBox, '#d0443a');
      (sheet.trimBoxes || (sheet.trimBox ? [sheet.trimBox] : [])).forEach(b => { body += box(b, '#2f6fd0'); });
    }
    // prévia: traço mais grosso para ser visível; impressão (print): fio real de 0,1 mm
    const L = 5, g = 2.2, sw = sheet.print ? 0.1 : 0.35;
    const seg = (x1, y1, x2, y2) => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${sheet.print ? '#000' : '#222'}" stroke-width="${sw}"/>`;
    (sheet.marks || []).forEach(([x1, y1, x2, y2]) => { body += seg(x1, y1, x2, y2); });
    (sheet.trims || []).forEach(([x, y, w, h]) => {
      [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]].forEach(([px, py, dx, dy]) => {
        body += seg(px + dx * g, py, px + dx * (g + L), py) + seg(px, py + dy * g, px, py + dy * (g + L));
      });
    });
    if (sheet.ticks) {
      const [x, y, w, h] = sheet.ticks, t = 3.5;
      [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, dx, dy]) => {
        body += seg(px, py, px + dx * t, py) + seg(px, py, px, py + dy * t);
      });
    }
    const dash = sheet.print ? `stroke="#8a8a8a" stroke-width="0.1" stroke-dasharray="1.2 1.2"` : `stroke="#b4462f" stroke-width="0.5" stroke-dasharray="3 2"`;
    if (sheet.foldX != null) body += `<line x1="${n(sheet.foldX)}" y1="0" x2="${n(sheet.foldX)}" y2="${n(sheet.h)}" ${dash}/>`;
    if (sheet.foldY != null) body += `<line x1="0" y1="${n(sheet.foldY)}" x2="${n(sheet.w)}" y2="${n(sheet.foldY)}" ${dash}/>`;
    return `<svg class="ep-sheet__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(sheet.w)} ${n(sheet.h)}" preserveAspectRatio="xMidYMid meet">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
  }
  let sheetSeq = 0;

  /* ---------- galeria de modelos com filtro por categoria ----------
     o: { grid, filters (container), items: [{ id, name, desc, meta, cat, thumb() }],
          categories: [{ id, label }], onPick(item), lead: [elementos extras no início] } */
  function gallery(o) {
    const grid = o.grid, bar = o.filters;
    if (!grid) return null;
    let cat = 'all';
    const cards = [];
    function card(it) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ep-tpl' + (it.variant ? ' ep-tpl--' + it.variant : ''); b.dataset.cat = it.cat || '';
      b.innerHTML = `<span class="ep-tpl__thumb"></span>` +
        `<span class="ep-tpl__body"><b class="ep-tpl__name">${esc(it.name)}</b>` +
        (it.meta ? `<span class="ep-tpl__meta">${esc(it.meta)}</span>` : '') +
        (it.desc ? `<span class="ep-tpl__desc">${esc(it.desc)}</span>` : '') + `</span>`;
      b.addEventListener('click', () => o.onPick(it));
      cards.push({ el: b, it, drawn: false });
      return b;
    }
    // miniaturas desenhadas sob demanda (quando entram na tela)
    const io = ('IntersectionObserver' in root) ? new IntersectionObserver(ents => {
      ents.forEach(e => { if (e.isIntersecting) { draw(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '200px' }) : null;
    function draw(el) {
      const c = cards.find(x => x.el === el); if (!c || c.drawn) return;
      c.drawn = true;
      try { el.querySelector('.ep-tpl__thumb').innerHTML = c.it.thumb ? c.it.thumb() : ''; } catch (e) { console.error(e); }
    }
    function build() {
      grid.innerHTML = ''; cards.length = 0;
      (o.items || []).forEach(it => {
        const el = card(it); grid.appendChild(el);
        if (io) io.observe(el); else draw(el);
      });
      if (bar && o.categories && o.categories.length) {
        bar.innerHTML = '';
        [{ id: 'all', label: 'Todos' }, ...o.categories].forEach(c => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'ep-chip' + (c.id === cat ? ' on' : ''); b.textContent = c.label; b.dataset.cat = c.id;
          b.addEventListener('click', () => filter(c.id));
          bar.appendChild(b);
        });
      }
      filter(cat);
    }
    function filter(id) {
      cat = id;
      cards.forEach(c => { c.el.hidden = !(id === 'all' || c.it.cat === id || c.it.always); });
      if (bar) [...bar.children].forEach(b => b.classList.toggle('on', b.dataset.cat === id));
      // cartões que estavam escondidos entram na tela sem o observer disparar
      cards.forEach(c => { if (!c.el.hidden && !c.drawn && !io) draw(c.el); });
    }
    build();
    return { build, filter, drawAll: () => cards.forEach(c => draw(c.el)) };
  }

  /* ---------- lista de verificação (antes de imprimir) ----------
     items: [{ level: 'ok'|'warn'|'bad'|'info', text (html), action: {label, fn} }] */
  function checklist(el, items) {
    if (!el) return;
    el.innerHTML = '';
    el.classList.add('ep-check');
    items.forEach(it => {
      const li = document.createElement('li');
      li.className = 'ep-check__it is-' + (it.level || 'info');
      li.innerHTML = `<span class="ep-check__ic" aria-hidden="true"></span><span class="ep-check__tx">${it.text}</span>`;
      if (it.action) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ep-linkbtn'; b.textContent = it.action.label;
        b.addEventListener('click', it.action.fn);
        li.appendChild(b);
      }
      el.appendChild(li);
    });
  }

  /* fim da inicialização: a página nasce com <body class="booting"> (esqueleto
     do editor invisível) e só aparece depois que o app decidiu entre tela
     inicial, "bem-vindo de volta" e editor — sem piscar a barra lateral. */
  function ready() {
    const done = () => document.body.classList.remove('booting');
    requestAnimationFrame(() => requestAnimationFrame(done));
  }

  root.EPShell = { ready, initRail, optionCards, segmented, sheetSVG, gallery, checklist, esc };
})(typeof window !== 'undefined' ? window : globalThis);
