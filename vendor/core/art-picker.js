/* packages/core/art-picker.js — EPArtPicker
 *
 * Janela do catálogo de ilustrações: categorias, busca, usadas recentemente.
 * Celular: painel inferior; computador: janela central.
 *
 *   EPArtPicker.open({ title, current, onPick(id) })
 */
(function (root) {
  "use strict";
  const RECENT = 'ep-art-recent';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT) || '[]').filter(root.EPArt.isId).slice(0, 24); } catch (_) { return []; } };
  const remember = id => { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter(x => x !== id)].slice(0, 24))); } catch (_) {} };
  let el = null, onLoaded = null, hooked = false;

  function close() { onLoaded = null; if (el) { el.remove(); el = null; document.body.classList.remove('ep-art-open'); } }

  function open(opt = {}) {
    close();
    const A = root.EPArt, cats = A.cats();
    const rec = recent();
    let cat = rec.length ? '_recent' : (opt.current && A.isId(opt.current) ? opt.current.split('/')[0] : (cats[0] && cats[0].id));
    el = document.createElement('div');
    el.className = 'ep-art';
    el.innerHTML = `<div class="ep-art__back" data-x></div>
      <div class="ep-art__win" role="dialog" aria-modal="true" aria-label="${esc(opt.title || 'Ilustrações')}">
        <div class="ep-art__head"><b>${esc(opt.title || 'Ilustrações')}</b>
          <button type="button" class="ep-art__close" data-x aria-label="Fechar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div class="ep-art__search"><input type="search" placeholder="Buscar: flor, café, coração…" aria-label="Buscar ilustração" enterkeyhint="search"></div>
        <div class="ep-art__cats"></div>
        <div class="ep-art__grid" tabindex="-1"></div>
        <p class="ep-art__foot">Adesivos coloridos: Fluent Emoji (Microsoft) · Traços: Phosphor Icons — licença MIT</p>
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('ep-art-open');
    const catsEl = el.querySelector('.ep-art__cats'), grid = el.querySelector('.ep-art__grid'), q = el.querySelector('input');

    catsEl.innerHTML = (rec.length ? `<button type="button" class="ep-art__cat" data-cat="_recent"><span class="ep-art__cic ep-art__cic--rec"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></span><span>Recentes</span></button>` : '') +
      cats.map(c => `<button type="button" class="ep-art__cat" data-cat="${esc(c.id)}"><span class="ep-art__cic">${A.svg({ body: c.thumb[0], w: c.thumb[1], h: c.thumb[2], mono: c.mono }, '#35594d')}</span><span>${esc(c.label)}</span></button>`).join('');

    function tiles(list) {
      return list.map(it => `<button type="button" class="ep-art__it${it.id === opt.current ? ' on' : ''}" data-id="${esc(it.id)}" title="${esc(it.label)}">${A.svg(it, '#35594d')}<span>${esc(it.label)}</span></button>`).join('');
    }
    function show() {
      catsEl.querySelectorAll('.ep-art__cat').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
      const term = q.value.trim();
      if (term) {
        const r = A.search(term);
        const list = r.ids.map(id => A.get(id)).filter(Boolean);
        r.cats.forEach(cid => A.items(cid).forEach(it => { if (!list.includes(it)) list.push(it); }));
        grid.innerHTML = list.length ? tiles(list) : '<p class="ep-art__empty">Nada encontrado — tente outra palavra ou escolha uma categoria.</p>';
        return;
      }
      if (cat === '_recent') { grid.innerHTML = tiles(recent().map(id => A.get(id)).filter(Boolean)); A.ensure(recent()).then(() => { if (el && cat === '_recent' && !q.value.trim()) grid.innerHTML = tiles(recent().map(id => A.get(id)).filter(Boolean)); }); return; }
      const items = A.items(cat);
      if (items.length) { grid.innerHTML = tiles(items); return; }
      grid.innerHTML = '<p class="ep-art__empty">Carregando…</p>';
      const want = cat;
      A.load(cat).then(() => { if (el && cat === want && !q.value.trim()) grid.innerHTML = tiles(A.items(cat)); });
    }
    // a busca olha todas as categorias: carrega as que têm nomes parecidos e atualiza
    onLoaded = () => { if (el && q.value.trim()) show(); };
    if (!hooked) { hooked = true; A.onLoad(() => onLoaded && onLoaded()); }

    el.addEventListener('click', e => {
      if (e.target.closest('[data-x]')) { close(); return; }
      const c = e.target.closest('[data-cat]');
      if (c) { cat = c.dataset.cat; q.value = ''; show(); grid.scrollTop = 0; c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
      const it = e.target.closest('[data-id]');
      if (it) { const id = it.dataset.id; remember(id); close(); opt.onPick && opt.onPick(id); }
    });
    q.addEventListener('input', () => { clearTimeout(q._t); q._t = setTimeout(show, 120); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    show();
    const on = catsEl.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (!(root.matchMedia && root.matchMedia('(max-width:820px)').matches)) q.focus();
  }

  root.EPArtPicker = { open, close, isOpen: () => !!el };
})(typeof window !== 'undefined' ? window : globalThis);
