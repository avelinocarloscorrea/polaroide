/* packages/core/canvas-edit-bar.js — EPCanvasEditBar
 *
 * Barra de ferramentas da edição na folha (usada por canvas-edit.js), igual
 * nas três ferramentas. Estilo Canva: UMA fileira de ícones; os controles
 * maiores abrem um painel logo acima (celular) ou abaixo (computador) da
 * fileira — a folha continua visível e muda ao vivo.
 *
 *   Texto:        Editar · Fonte · Tamanho · Cor · Negrito · Itálico · Alinhar ·
 *                 Efeitos (estilos prontos, contorno, fundo, sombra) ·
 *                 Ajustes (transparência, giro, espaçamento, caixa alta, camada) ·
 *                 Duplicar · Excluir/Ocultar
 *   Ilustração/imagem: Trocar · Tamanho · Cor · Efeitos (sombra, fundo) · Ajustes · Duplicar · Excluir
 *   Ferramentas próprias do app: get().tools = [{ a, label, icon }] -> o.action(page, key, a)
 *
 * O app informa em get() o que o elemento aceita: text, multiline, alignable,
 * removable, duplicable, canReplace, colorable, layer (frente/trás), noFx.
 *
 *   const bar = EPCanvasEditBar.create(ctx)
 *     ctx: { o, cur(), item(), data(), mobile(), place(), move(), select(page,key), clear(), editText(), photoTools() }
 *   bar.open()  bar.close()  bar.position()  bar.el
 */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const I = {
    minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    alignl: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>', alignc: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>', alignr: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    center: '<path d="M12 3v18"/><rect x="6" y="8" width="12" height="8" rx="1.5"/>',
    reset: '<path d="M4 12a8 8 0 108-8"/><path d="M4 4v5h5"/>',
    hide: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0112 5c5.5 0 9 7 9 7a16 16 0 01-3.2 4.2M6.2 6.2A15.7 15.7 0 003 12s3.5 7 9 7a9.6 9.6 0 004.2-1"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
    art: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    size: '<path d="M3 7V5h10v2M8 5v14M6 19h4"/><path d="M14 12v-1.5h7V12M17.5 10.5V19M16 19h3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
    front: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 012-2h10"/>',
    fx: '<path d="M5 19c3-1 4-4 5-8s2-7 5-7"/><path d="M8 11h7"/><path d="M15.5 15.5l4 4M19.5 15.5l-4 4"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>', down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    rotl: '<path d="M4 12a8 8 0 108-8H9"/><path d="M11 1L8 4l3 3"/>', rotr: '<path d="M20 12a8 8 0 11-8-8h3"/><path d="M13 1l3 3-3 3"/>',
    hcenter: '<path d="M12 3v18"/><rect x="5" y="8" width="14" height="8" rx="1.5"/>', vcenter: '<path d="M3 12h18"/><rect x="8" y="5" width="8" height="14" rx="1.5"/>',
    caps: '<path d="M3 18l4.5-12L12 18M4.7 14h5.6M14 18l3-8 3 8M15 15.5h4"/>',
  };
  const svg = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || n}</svg>`;
  const famCss = v => { const F = root.EPFontMetrics && root.EPFontMetrics.families && root.EPFontMetrics.families[v]; return F ? F.css : ''; };
  const FX_COLORS = ['#1f2522', '#ffffff', '#000000', '#35594d', '#1f3a52', '#8a2f2f', '#b23b2c', '#c9a24a', '#ffe066', '#f3e3c3', '#ff4f9a', '#6fb3d9'];

  function create(ctx) {
    const o = ctx.o;
    let el = null, panel = '';          // painel aberto: '' | 'font' | 'size' | 'color' | 'fx' | 'more'
    let photoOpen = null;               // painel de foto: null = automático (recolhe se cobrir a página)

    function close() {
      if (el) { el.remove(); el = null; }
      document.body.classList.remove('ce-bar-open');
    }
    const tool = (a, icon, label, extra, attrs) =>
      `<button type="button" class="ce-tool${extra || ''}" data-ce="${a}" title="${esc(label)}"${attrs || ''}>${icon}<span>${esc(label)}</span></button>`;

    function toolsHTML(it, f) {
      const k = it.kind, isText = k === 'text', mob = ctx.mobile();
      const colorable = isText || f.colorable;
      let h = '';
      if (isText && f.text != null) h += tool('edit', svg('edit'), 'Editar');
      (f.tools || []).forEach(t => { h += tool('app:' + t.a, t.icon || svg('sliders'), t.label, t.on ? ' on' : ''); });
      if (isText) {
        const lab = (o.fonts || []).find(x => x.v === f.fam);
        h += tool('font', svg('type'), mob ? 'Fonte' : (lab ? lab.label : 'Fonte padrão'), ' ce-tool--font' + (panel === 'font' ? ' on' : ''));
      }
      if ((k === 'image' || k === 'art') && f.canReplace) h += tool('image', svg(k === 'art' ? 'art' : 'image'), 'Trocar');
      h += tool('size', svg('size'), mob ? 'Tamanho' : Math.round((f.s || 1) * 100) + '%', panel === 'size' ? ' on' : '');
      if (colorable) h += `<button type="button" class="ce-tool${panel === 'color' ? ' on' : ''}" data-ce="color-panel" title="Cor"><i class="ce-dot" data-dot="${esc(f.color || '')}"></i><span>Cor</span></button>`;
      if (isText) {
        h += tool('bold', svg('bold'), 'Negrito', f.bold ? ' on' : '');
        h += tool('italic', svg('italic'), 'Itálico', f.italic ? ' on' : '');
        if (f.alignable) h += tool('align', svg('align' + (f.align || 'c')), 'Alinhar');
      }
      if (!f.noFx) h += tool('fx', svg('fx'), 'Efeitos', panel === 'fx' ? ' on' : '');
      h += tool('more', svg('sliders'), 'Ajustes', panel === 'more' ? ' on' : '');
      if (f.duplicable) h += tool('duplicate', svg('copy'), 'Duplicar');
      h += f.removable ? tool('delete', svg('trash'), 'Excluir', ' is-danger') : tool('hide', svg('hide'), 'Ocultar');
      return h;
    }
    const swatches = (k, val, list, none) =>
      (none ? `<button type="button" class="ce-sw ce-sw--none${val ? '' : ' on'}" data-ce="fxc" data-k="${k}" data-c="" title="Sem">${svg('x')}</button>` : '') +
      list.map(c => `<button type="button" class="ce-sw${(val || '').toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-ce="fxc" data-k="${k}" data-c="${c}" title="${c}"><i data-c="${c}"></i></button>`).join('') +
      `<label class="ce-sw ce-sw--pick" title="Outra cor"><input type="color" data-ce="fxpick" data-k="${k}" value="${/^#[0-9a-f]{6}$/i.test(val || '') ? val : '#333333'}"></label>`;
    const rng = (k, label, min, max, step, val, unit, mult) =>
      `<label class="ce-rng"><span>${esc(label)}</span><input type="range" class="ce-range" data-ce="fxr" data-k="${k}" data-mult="${mult || 1}" data-unit="${unit || ''}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${val}${unit || ''}</output></label>`;
    function palette() {
      const cur = ctx.cur();
      const colors = (o.colors && cur && o.colors(cur.page)) || [];
      return [...new Set([...colors.map(c => c.toLowerCase()), ...FX_COLORS])].slice(0, 16);
    }

    function panelHTML(it, f) {
      const isText = it.kind === 'text';
      if (panel === 'font') {
        return `<div class="ce-panel ce-panel--font"><button type="button" class="ce-fontchip${f.fam ? '' : ' on'}" data-ce="fam" data-v="">Padrão</button>` +
          (o.fonts || []).map(x => `<button type="button" class="ce-fontchip${x.v === f.fam ? ' on' : ''}" data-ce="fam" data-v="${esc(x.v)}" data-css="${esc(famCss(x.v))}">${esc(x.label)}</button>`).join('') + '</div>';
      }
      if (panel === 'size') {
        const p = Math.round((f.s || 1) * 100);
        return `<div class="ce-panel ce-panel--size"><button type="button" class="ce-ib" data-ce="smaller" title="Menor">${svg('minus')}</button>` +
          `<input type="range" class="ce-range" data-ce="srange" min="20" max="400" step="1" value="${clamp(p, 20, 400)}" aria-label="Tamanho">` +
          `<button type="button" class="ce-ib" data-ce="bigger" title="Maior">${svg('plus')}</button><output class="ce-sval">${p}%</output></div>`;
      }
      if (panel === 'color') {
        const c0 = (f.color || '').toLowerCase();
        return `<div class="ce-panel ce-panel--color"><button type="button" class="ce-sw ce-sw--auto${f.color ? '' : ' on'}" data-ce="color" data-c="" title="Cor do estilo">A</button>` +
          palette().map(c => `<button type="button" class="ce-sw${c0 === c.toLowerCase() ? ' on' : ''}" data-ce="color" data-c="${c}" title="${c}"><i data-c="${c}"></i></button>`).join('') +
          `<label class="ce-sw ce-sw--pick" title="Outra cor"><input type="color" data-ce="colorpick" value="${/^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#333333'}"></label></div>`;
      }
      if (panel === 'fx') {
        const pal = palette();
        let h = '<div class="ce-panel ce-panel--stack">';
        if (isText && root.EPTextFx) {
          h += `<div class="ce-fxsec"><b>Estilos prontos</b><div class="ce-presets">${root.EPTextFx.PRESETS.map(p => `<button type="button" class="ce-preset" data-ce="preset" data-v="${p.id}"><span class="ce-preset__aa" data-prev="${p.id}">Aa</span><i>${esc(p.label)}</i></button>`).join('')}</div></div>`;
          h += `<div class="ce-fxsec"><b>Contorno</b><div class="ce-swrow">${swatches('ol', f.ol, pal, true)}</div>` +
            (f.ol ? `<div class="ce-rrow">${rng('olw', 'Espessura', 5, 100, 1, Math.round((f.olw == null ? 0.4 : f.olw) * 100), '%', 100)}<label class="ce-chk"><input type="checkbox" data-ce="fxchk" data-k="hol"${f.hol ? ' checked' : ''}> Vazado</label></div>` : '') + '</div>';
        }
        h += `<div class="ce-fxsec"><b>Fundo</b><div class="ce-swrow">${swatches('bg', f.bg, pal, true)}</div>` +
          (f.bg ? `<div class="ce-rrow">${rng('bgo', 'Opacidade', 5, 100, 1, Math.round((f.bgo == null ? 1 : f.bgo) * 100), '%', 100)}${rng('bgp', 'Folga', 0, 100, 1, Math.round((f.bgp == null ? 0.3 : f.bgp) * 100), '%', 100)}${rng('bgr', 'Cantos', 0, 100, 1, Math.round((f.bgr == null ? 0.25 : f.bgr) * 100), '%', 100)}</div>` : '') + '</div>';
        h += `<div class="ce-fxsec"><b>Sombra</b><div class="ce-swrow">${swatches('sh', f.sh, pal, true)}</div>` +
          (f.sh ? `<div class="ce-rrow">${rng('shd', 'Distância', 0, 100, 1, Math.round((f.shd == null ? 0.4 : f.shd) * 100), '%', 100)}${rng('sho', 'Opacidade', 5, 100, 1, Math.round((f.sho == null ? 0.35 : f.sho) * 100), '%', 100)}</div>` : '') + '</div>';
        return h + '</div>';
      }
      if (panel === 'more') {
        let h = '<div class="ce-panel ce-panel--stack"><div class="ce-rrow">';
        h += rng('op', 'Transparência', 5, 100, 1, Math.round((f.op == null ? 1 : f.op) * 100), '%', 100);
        h += rng('rot', 'Girar', -180, 180, 1, Math.round(f.rot || 0), '°', 1);
        if (isText) {
          h += rng('ls', 'Espaço entre letras', -10, 100, 1, Math.round((f.ls || 0) * 100), '', 100);
          if (f.multiline) h += rng('lh', 'Altura da linha', 70, 300, 5, Math.round((f.lh || 1.25) * 100), '%', 100);
        }
        h += '</div><div class="ce-btnrow">';
        h += `<button type="button" class="ce-chipbtn" data-ce="rot0">${svg('rotl')}Endireitar</button>`;
        if (isText) h += `<button type="button" class="ce-chipbtn${f.upper ? ' on' : ''}" data-ce="upper">${svg('caps')}Caixa alta</button>`;
        h += `<button type="button" class="ce-chipbtn" data-ce="center">${svg('hcenter')}Centro horizontal</button>`;
        h += `<button type="button" class="ce-chipbtn" data-ce="vcenter">${svg('vcenter')}Centro vertical</button>`;
        if (f.layer) h += `<button type="button" class="ce-chipbtn" data-ce="front">${svg('up')}Para frente</button><button type="button" class="ce-chipbtn" data-ce="back">${svg('down')}Para trás</button>`;
        h += `<button type="button" class="ce-chipbtn" data-ce="reset">${svg('reset')}Restaurar</button>`;
        return h + '</div></div>';
      }
      return '';
    }

    // página tocada sem elemento: barra "Adicionar" (texto, ilustração, imagem, fundo…)
    function openAdd(cur) {
      if (!o.addTools) return close();
      const mob = ctx.mobile();
      if (el) el.remove();
      el = document.createElement('div');
      el.className = 'ce-bar ce-bar--add ' + (mob ? 'ce-bar--sheet' : 'ce-bar--top');
      el.innerHTML = `<div class="ce-tools">${mob ? '' : '<b class="ce-bar__name">Adicionar</b>'}` +
        o.addTools.map(t => `<button type="button" class="ce-tool" data-add="${esc(t.a)}" title="${esc(t.title || t.label)}">${t.icon}<span>${esc(t.label)}</span></button>`).join('') +
        `<button type="button" class="ce-done" data-ce="close" title="Concluir (Esc)">${svg('check')}<span>Concluir</span></button></div>`;
      document.body.appendChild(el);
      document.body.classList.add('ce-bar-open');
      position();
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-add],[data-ce]'); if (!b) return;
        if (b.dataset.ce === 'close') { ctx.clear(); return; }
        o.add(cur.page, b.dataset.add);
      });
    }

    function open() {
      const cur = ctx.cur(); if (!cur) return close();
      if (!cur.key) return openAdd(cur);
      const it = ctx.item(), f = it && o.get(cur.page, cur.key);
      if (!it || !f) return close();
      const mob = ctx.mobile();
      const keepScroll = el && el.querySelector('.ce-tools') ? el.querySelector('.ce-tools').scrollLeft : 0;
      const pEl = el && el.querySelector('.ce-panel');
      const hadPanelScroll = pEl ? pEl.scrollLeft : 0, hadPanelTop = pEl ? pEl.scrollTop : 0;
      if (el) el.remove();
      el = document.createElement('div');
      el.className = 'ce-bar ' + (mob ? 'ce-bar--sheet' : 'ce-bar--top');
      const done = `<button type="button" class="ce-done" data-ce="close" title="Concluir (Esc)">${svg('check')}<span>Concluir</span></button>`;
      if (it.kind === 'photo') {
        el.className += ' ce-bar--photo';
        const extra = (f.tools || []).map(t => tool('app:' + t.a, t.icon || svg('sliders'), t.label, t.on ? ' on' : '')).join('');
        el.innerHTML = `<div class="ce-bar__head"><b>${esc(it.label || 'Foto')}</b><span class="ce-bar__hint">${esc(f.hint || 'Arraste a foto na folha para enquadrar · pinça ou roda para zoom')}</span>` +
          `<button type="button" class="ce-ptoggle" data-ce="ptoggle" aria-expanded="true">Ajustes</button></div>` +
          '<div class="ce-bar__tools-slot"></div>' +
          `<div class="ce-tools">${f.canReplace ? tool('image', svg('image'), 'Trocar foto') : ''}${extra}${f.duplicable ? tool('duplicate', svg('copy'), 'Duplicar') : ''}${f.removable ? tool('delete', svg('trash'), 'Remover', ' is-danger') : ''}${done}</div>`;
        const pt = ctx.photoTools(); if (pt) el.querySelector('.ce-bar__tools-slot').replaceWith(pt);
        else el.querySelector('.ce-bar__tools-slot').remove();
      } else {
        el.innerHTML = panelHTML(it, f) + `<div class="ce-tools">${mob ? '' : `<b class="ce-bar__name">${esc(it.label || '')}</b>`}${toolsHTML(it, f)}${done}</div>`;
      }
      el.querySelectorAll('i[data-c]').forEach(i => { i.style.background = i.dataset.c; });
      el.querySelectorAll('[data-dot]').forEach(i => { if (i.dataset.dot) i.style.background = i.dataset.dot; else i.classList.add('is-auto'); });
      el.querySelectorAll('[data-css]').forEach(b => { if (b.dataset.css) b.style.fontFamily = b.dataset.css; });
      if (root.EPTextFx) el.querySelectorAll('[data-prev]').forEach(s => {
        const p = root.EPTextFx.PRESETS.find(x => x.id === s.dataset.prev); if (p) root.EPTextFx.cssPreview(s, p.patch);
        if (f.fam) s.style.fontFamily = famCss(f.fam);
      });
      document.body.appendChild(el);
      document.body.classList.add('ce-bar-open');
      const ts = el.querySelector('.ce-tools'); if (ts) ts.scrollLeft = keepScroll;
      const ps = el.querySelector('.ce-panel'); if (ps) {
        ps.scrollLeft = hadPanelScroll; ps.scrollTop = hadPanelTop;
        const on = ps.querySelector('.ce-fontchip.on'); if (on && !hadPanelScroll && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      }
      position();
      bind(cur.page, cur.key);
    }

    // computador: barra centralizada no topo da prancheta (painel da foto ao lado da página)
    function position() {
      if (!el) return;
      const cur = ctx.cur(); if (!cur) return;
      if (ctx.mobile()) { el.style.left = el.style.top = el.style.width = ''; return; }
      const sc = o.scroller && o.scroller();
      const r = sc ? sc.getBoundingClientRect() : { left: 0, top: 60, width: innerWidth, height: innerHeight - 60 };
      if (el.classList.contains('ce-bar--photo')) {
        const pr = cur.page.getBoundingClientRect();
        const leftFree = pr.left - r.left, rightFree = r.left + r.width - pr.right;
        const x = rightFree > leftFree ? Math.min(r.left + r.width - 312, pr.right + 12) : Math.max(r.left + 12, pr.left - 312);
        el.style.width = '300px'; el.style.left = x + 'px'; el.style.top = (r.top + 12) + 'px';
        el.style.maxHeight = Math.max(240, r.height - 24) + 'px';
        // sem espaço ao lado da página, os controles começam recolhidos para não cobrir a foto
        const covers = x < pr.right && x + 300 > pr.left;
        const open = photoOpen == null ? !covers : photoOpen;
        el.classList.toggle('is-collapsed', !open);
        const t = el.querySelector('.ce-ptoggle'); if (t) t.setAttribute('aria-expanded', String(open));
        return;
      }
      el.style.width = '';
      // painéis laterais flutuando sobre a prancheta (telas estreitas) encurtam a área livre
      let L = r.left, R = r.left + r.width;
      ['#left', '#right'].forEach(sel => {
        const p = document.querySelector(sel); if (!p || !p.offsetWidth) return;
        const pr = p.getBoundingClientRect();
        if (pr.right <= L || pr.left >= R) return;
        if (pr.left > L + (R - L) / 2) R = Math.min(R, pr.left); else L = Math.max(L, pr.right);
      });
      // pouco espaço: só ícones (os nomes continuam no title/tooltip)
      el.classList.remove('ce-bar--compact');
      if (el.offsetWidth > R - L - 24) el.classList.add('ce-bar--compact');
      const bw = Math.min(R - L - 24, el.offsetWidth);
      el.style.maxWidth = (R - L - 24) + 'px';
      el.style.left = Math.max(L + 12, L + (R - L - bw) / 2) + 'px';
      el.style.top = (r.top + 12) + 'px';
      const ps = el.querySelector('.ce-panel--stack'); if (ps) ps.style.maxHeight = Math.max(180, r.height - 90) + 'px';
    }

    function bind(page, k) {
      const again = () => { ctx.place(); };
      const setS = (s, live) => o.set(page, k, { s: clamp(Math.round(s * 100) / 100, 0.2, 6) }, { live });
      const step = d => { const f = o.get(page, k) || {}; o.begin(page, k); setS((+f.s || 1) + d, false); again(); };
      const put = patch => { o.begin(page, k); o.set(page, k, patch, { live: false }); again(); };
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-ce]'); if (!b || b.tagName === 'INPUT') return;
        const a = b.dataset.ce;
        if (a === 'close') { photoOpen = null; ctx.select(page, null); return; }
        if (a === 'ptoggle') { photoOpen = el.classList.contains('is-collapsed'); position(); return; }
        if (['font', 'size', 'color-panel', 'fx', 'more'].includes(a)) { const p = a === 'color-panel' ? 'color' : a; panel = panel === p ? '' : p; open(); return; }
        if (a === 'edit') { panel = ''; ctx.editText(); return; }
        const f = o.get(page, k) || {};
        if (a.startsWith('app:')) { o.begin(page, k); const res = o.action(page, k, a.slice(4)); if (res !== false) again(); return; }
        if (a === 'smaller') step(-0.05);
        else if (a === 'bigger') step(0.05);
        else if (a === 'fam') put({ fam: b.dataset.v || null });
        else if (a === 'bold') put({ bold: !f.bold });
        else if (a === 'italic') put({ italic: !f.italic });
        else if (a === 'upper') put({ upper: !f.upper });
        else if (a === 'align') put({ align: { l: 'c', c: 'r', r: 'l' }[f.align || 'c'] });
        else if (a === 'color') put({ color: b.dataset.c || null });
        else if (a === 'fxc') put({ [b.dataset.k]: b.dataset.c || null });
        else if (a === 'preset' && root.EPTextFx) put(root.EPTextFx.preset(b.dataset.v));
        else if (a === 'rot0') put({ rot: null });
        else if (a === 'center' || a === 'vcenter') {
          const it = ctx.item(), d = ctx.data(); if (!it || !d) return;
          if (a === 'center') put({ dx: Math.round(((+f.dx || 0) + d.w / 2 - (it.x + it.w / 2)) * 10) / 10 });
          else put({ dy: Math.round(((+f.dy || 0) + d.h / 2 - (it.y + it.h / 2)) * 10) / 10 });
        } else if (/^(reset|hide|delete|image|duplicate|front|back)$/.test(a)) {
          if (a !== 'front' && a !== 'back') panel = '';
          o.begin(page, k); const res = o.action(page, k, a);
          if (a === 'hide' || a === 'delete') ctx.select(page, null);
          else if (a === 'duplicate' && typeof res === 'string') ctx.select(page, res);
          else again();
        }
      });
      const r = el.querySelector('[data-ce="srange"]');
      if (r) {
        let began = false;
        const out = el.querySelector('.ce-sval');
        r.addEventListener('input', () => { if (!began) { o.begin(page, k); began = true; } setS(r.value / 100, true); out.textContent = r.value + '%'; ctx.move(); });
        r.addEventListener('change', () => { began = false; setS(r.value / 100, false); again(); });
      }
      el.querySelectorAll('[data-ce="fxr"]').forEach(inp => {
        let began = false;
        const val = () => { const m = +inp.dataset.mult || 1; return Math.round(+inp.value / m * 1000) / 1000; };
        const out = inp.nextElementSibling;
        inp.addEventListener('input', () => {
          if (!began) { o.begin(page, k); began = true; }
          if (out) out.textContent = inp.value + (inp.dataset.unit || '');
          o.set(page, k, { [inp.dataset.k]: val() }, { live: true }); ctx.move();
        });
        inp.addEventListener('change', () => { began = false; o.set(page, k, { [inp.dataset.k]: val() }, { live: false }); again(); });
      });
      el.querySelectorAll('[data-ce="fxchk"]').forEach(inp => inp.addEventListener('change', () => put({ [inp.dataset.k]: inp.checked || null })));
      el.querySelectorAll('[data-ce="fxpick"]').forEach(cp => {
        let began = false;
        cp.addEventListener('input', () => { if (!began) { o.begin(page, k); began = true; } o.set(page, k, { [cp.dataset.k]: cp.value }, { live: true }); });
        cp.addEventListener('change', () => { began = false; o.set(page, k, { [cp.dataset.k]: cp.value }, { live: false }); again(); });
      });
      const cp = el.querySelector('[data-ce="colorpick"]');
      if (cp) {
        let began = false;
        cp.addEventListener('input', () => { if (!began) { o.begin(page, k); began = true; } o.set(page, k, { color: cp.value }, { live: true }); });
        cp.addEventListener('change', () => { began = false; o.set(page, k, { color: cp.value }, { live: false }); again(); });
      }
    }

    return {
      open, close, position,
      reset() { panel = ''; photoOpen = null; },
      get el() { return el; },
    };
  }

  root.EPCanvasEditBar = { create, icon: svg };
})(typeof window !== 'undefined' ? window : globalThis);
