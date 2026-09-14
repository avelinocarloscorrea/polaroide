/* packages/core/art.js — EPArt
 *
 * Catálogo de ilustrações (adesivos coloridos, traços e enfeites) usado nas
 * páginas e capas. As categorias ficam em vendor/core/art/<categoria>.js e
 * são carregadas só quando alguém abre a categoria ou quando o documento
 * usa uma ilustração dela. Id de uma ilustração: "categoria/nome".
 *
 *   EPArt.cats()                    -> [{ id, label, mono, n, thumb:[body,w,h], names }]
 *   EPArt.get('flores/rose')        -> { id, label, body, w, h, mono } | null (se não carregada)
 *   EPArt.load('flores')            -> Promise
 *   EPArt.ensure(['flores/rose'])   -> Promise (tudo carregado)
 *   EPArt.onLoad(fn)                // chamado quando uma categoria chega (para redesenhar)
 *   EPArt.svg(id|item, color)       -> <svg> para miniaturas
 *   EPArt.search(q)                 -> ids (nas categorias carregadas) + categorias cujo nome bate
 */
(function (root) {
  "use strict";
  let INDEX = [];
  const CATS = new Map();          // id -> { vb, mono, items: Map(name -> item) }
  const pending = new Map();       // id -> Promise
  const listeners = [];
  const ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;

  // pasta das categorias (ao lado deste arquivo) e o ?v= do deploy, para o cache renovar junto
  function url(id) {
    const s = document.querySelector('script[src*="core/art.js"]'), src = s ? s.getAttribute('src') : 'vendor/core/art.js';
    const v = (src.match(/\?v=[\w.-]+/) || [''])[0];
    return src.replace(/art\.js.*$/, 'art/') + id + '.js' + v;
  }
  function index(list) { INDEX = Array.isArray(list) ? list : []; }
  function define(id, data) {
    const items = new Map();
    (data.items || []).forEach(([name, label, body, box]) => {
      const [w, h] = box || data.vb || [32, 32];
      items.set(name, { id: id + '/' + name, label, body, w, h, mono: !!data.mono });
    });
    CATS.set(id, { mono: !!data.mono, items });
    listeners.forEach(fn => { try { fn(id); } catch (_) {} });
  }
  function load(id) {
    if (CATS.has(id)) return Promise.resolve();
    if (!INDEX.some(c => c.id === id)) return Promise.resolve();
    if (pending.has(id)) return pending.get(id);
    const p = new Promise(res => {
      if (typeof document === 'undefined') return res();
      const s = document.createElement('script');
      s.src = url(id);
      s.onload = s.onerror = () => { pending.delete(id); res(); };
      document.head.appendChild(s);
    });
    pending.set(id, p);
    return p;
  }
  function get(id) {
    if (typeof id !== 'string' || !ID.test(id)) return null;
    const [c, n] = id.split('/'), cat = CATS.get(c);
    if (!cat) { load(c); return null; }
    return cat.items.get(n) || null;
  }
  const ensure = ids => Promise.all([...new Set((ids || []).filter(i => typeof i === 'string' && ID.test(i)).map(i => i.split('/')[0]))].map(load));
  function svg(it, color) {
    if (typeof it === 'string') it = get(it);
    if (!it) return '';
    return `<svg viewBox="0 0 ${it.w} ${it.h}" aria-hidden="true"${it.mono ? ` color="${color || 'currentColor'}"` : ''}>${it.body}</svg>`;
  }
  function items(catId) { const c = CATS.get(catId); return c ? [...c.items.values()] : []; }
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function search(q) {
    q = norm(q).trim(); if (!q) return { ids: [], cats: [] };
    const ids = [], cats = [];
    INDEX.forEach(c => {
      if (norm(c.label).includes(q)) cats.push(c.id);
      if (norm(c.names).split('|').some(n => n.includes(q))) { if (!CATS.has(c.id)) load(c.id); }
    });
    CATS.forEach((cat, cid) => cat.items.forEach(it => { if (norm(it.label).includes(q)) ids.push(it.id); }));
    return { ids, cats };
  }

  root.EPArt = Object.assign(root.EPArt || {}, {
    index, define, load, get, ensure, svg, items, search,
    cats: () => INDEX.slice(),
    onLoad: fn => listeners.push(fn),
    isId: id => typeof id === 'string' && ID.test(id),
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPArt;
})(typeof window !== 'undefined' ? window : globalThis);
