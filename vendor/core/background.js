/* packages/core/background.js — EPBackground
 *
 * Fundo da página, o MESMO nas três ferramentas: cor lisa, degradê (linear
 * ou radial), estampa vetorial (poá, xadrez, listras, corações, confete,
 * ilustração repetida…) ou foto. Desenhado com a caneta (SvgPen na tela,
 * PdfPen no PDF), então sai idêntico e vetorial na impressão.
 *
 *   bg = { kind:'none'|'color'|'gradient'|'pattern'|'image',
 *          c1, c2, angle, radial,            // cor / degradê
 *          pat, pc, ps, pw, art,             // estampa: tipo, cor, escala, traço, ilustração
 *          src, wash }                       // foto (dataURL) e véu claro por cima (0–0.9)
 *
 *   EPBackground.clean(raw)          -> objeto válido
 *   EPBackground.active(bg)          -> true se desenha algo além da cor do papel
 *   EPBackground.draw(pen, x, y, w, h, bg, paper)
 *   EPBackground.thumb(bg, w, h)     -> <svg> pequeno (miniaturas do painel)
 *   EPBackground.panel(host, { get, set(patch, live), pickImage(cb), colors() })
 */
(function (root) {
  "use strict";
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const DATA_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (v != null && v !== '' && isFinite(+v)) ? +v : d;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  function rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
  function mix(a, b, t) {
    if (!HEX.test(a || '')) a = '#ffffff'; if (!HEX.test(b || '')) b = '#000000';
    const A = rgb(a), B = rgb(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  const PATTERNS = [
    ['dots', 'Poá'], ['grid', 'Quadriculado'], ['dotgrid', 'Pontilhado'], ['lines', 'Pautado'], ['stripes', 'Listras'],
    ['diagonal', 'Diagonal'], ['gingham', 'Xadrez'], ['hearts', 'Corações'], ['stars', 'Estrelas'], ['confetti', 'Confete'],
    ['waves', 'Ondas'], ['zigzag', 'Zigue-zague'], ['triangles', 'Triângulos'], ['rings', 'Círculos'], ['scallop', 'Escamas'], ['art', 'Ilustração'],
  ];
  const PAT_IDS = PATTERNS.map(p => p[0]);
  const DEFAULT = { kind: 'none', c1: '#f6efe3', c2: '#e3d2b8', angle: 160, radial: false, pat: 'dots', pc: '#e2c9a6', ps: 1, pw: 1, art: '', src: '', wash: 0 };

  function clean(raw) {
    const b = raw && typeof raw === 'object' ? raw : {};
    const isArt = id => root.EPArt ? root.EPArt.isId(id) : /^[a-z0-9-]+\/[a-z0-9-]+$/.test(id || '');
    const out = {
      kind: ['none', 'color', 'gradient', 'pattern', 'image'].includes(b.kind) ? b.kind : 'none',
      c1: HEX.test(b.c1 || '') ? b.c1.toLowerCase() : DEFAULT.c1,
      c2: HEX.test(b.c2 || '') ? b.c2.toLowerCase() : DEFAULT.c2,
      angle: Math.round(clamp(num(b.angle, DEFAULT.angle), 0, 360)),
      radial: !!b.radial,
      pat: PAT_IDS.includes(b.pat) ? b.pat : DEFAULT.pat,
      pc: HEX.test(b.pc || '') ? b.pc.toLowerCase() : DEFAULT.pc,
      ps: Math.round(clamp(num(b.ps, 1), 0.3, 4) * 100) / 100,
      pw: Math.round(clamp(num(b.pw, 1), 0.3, 4) * 100) / 100,
      art: isArt(b.art) ? b.art : '',
      src: typeof b.src === 'string' && b.src.length < 8e6 && DATA_IMG.test(b.src) ? b.src : '',
      wash: Math.round(clamp(num(b.wash, 0), 0, 0.9) * 100) / 100,
    };
    if (out.kind === 'image' && !out.src) out.kind = 'none';
    return out;
  }
  const active = bg => !!(bg && bg.kind && bg.kind !== 'none');

  /* ---------------- desenho ---------------- */
  // semente determinística (confete igual na tela e no PDF)
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function heart(cx, cy, r) {
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28 * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      pts.push([cx + x * r / 17, cy - y * r / 17]);
    }
    return pts;
  }
  function star(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return pts;
  }

  function drawPattern(pen, x, y, w, h, b) {
    const u = 9 * b.ps, pc = b.pc, lw = 0.25 * b.pw, X1 = x + w, Y1 = y + h;
    const grid = (stepX, stepY, fn, stagger) => {
      for (let r = 0, yy = y - stepY; yy < Y1 + stepY; yy += stepY, r++)
        for (let xx = x - stepX + (stagger && r % 2 ? stepX / 2 : 0); xx < X1 + stepX; xx += stepX) fn(xx, yy, r);
    };
    switch (b.pat) {
      case 'dots': grid(u, u * 0.87, (px, py) => pen.circle(px, py, u * 0.13 * b.pw, { fill: pc }), true); break;
      case 'dotgrid': grid(u * 0.55, u * 0.55, (px, py) => pen.circle(px, py, 0.28 * b.pw, { fill: pc })); break;
      case 'grid':
        for (let xx = x; xx <= X1; xx += u * 0.6) pen.line(xx, y, xx, Y1, { w: lw, color: pc });
        for (let yy = y; yy <= Y1; yy += u * 0.6) pen.line(x, yy, X1, yy, { w: lw, color: pc });
        break;
      case 'lines': for (let yy = y + u * 0.8; yy <= Y1; yy += u * 0.8) pen.line(x, yy, X1, yy, { w: lw, color: pc }); break;
      case 'stripes': for (let xx = x; xx < X1; xx += u) pen.rect(xx, y, u * 0.45 * Math.min(1.8, b.pw), h, { fill: pc }); break;
      case 'diagonal': {
        const L = w + h;
        for (let d = -h; d < w + h; d += u * 0.8) pen.poly([[x + d, y], [x + d + u * 0.3 * b.pw, y], [x + d + u * 0.3 * b.pw - L, y + L], [x + d - L, y + L]], { fill: pc });
        break;
      }
      case 'gingham': {
        const soft = mix(b.c1, pc, 0.5), s = u * 0.5;
        for (let xx = x; xx < X1; xx += u) pen.rect(xx, y, s, h, { fill: soft });
        for (let yy = y; yy < Y1; yy += u) pen.rect(x, yy, w, s, { fill: soft });
        for (let xx = x; xx < X1; xx += u) for (let yy = y; yy < Y1; yy += u) pen.rect(xx, yy, s, s, { fill: pc });
        break;
      }
      case 'hearts': grid(u * 1.3, u * 1.1, (px, py) => pen.poly(heart(px, py, u * 0.26 * b.pw), { fill: pc }), true); break;
      case 'stars': grid(u * 1.3, u * 1.1, (px, py) => pen.poly(star(px, py, u * 0.3 * b.pw), { fill: pc }), true); break;
      case 'confetti': {
        const R = rng(Math.round(w * 13 + h * 7)), cols = [pc, mix(pc, b.c1, 0.35), mix(pc, '#000000', 0.18)];
        const n = Math.round(w * h / (u * u) * 1.6);
        for (let i = 0; i < n; i++) {
          const px = x + R() * w, py = y + R() * h, c = cols[i % 3], k = R();
          if (k < 0.4) pen.circle(px, py, u * 0.07 * b.pw, { fill: c });
          else {
            const a = R() * Math.PI, L = u * 0.2 * b.pw, t = u * 0.06 * b.pw, ca = Math.cos(a), sa = Math.sin(a);
            pen.poly([[px - ca * L - sa * t, py - sa * L + ca * t], [px + ca * L - sa * t, py + sa * L + ca * t], [px + ca * L + sa * t, py + sa * L - ca * t], [px - ca * L + sa * t, py - sa * L - ca * t]], { fill: c });
          }
        }
        break;
      }
      case 'waves':
        for (let yy = y; yy < Y1 + u; yy += u * 0.7) {
          const pts = []; for (let xx = x; xx <= X1 + 1; xx += 1) pts.push([xx, yy + Math.sin((xx - x) / u * Math.PI * 2) * u * 0.14]);
          pen.poly(pts, { stroke: pc, w: lw * 1.6, close: false });
        }
        break;
      case 'zigzag':
        for (let yy = y; yy < Y1 + u; yy += u * 0.7) {
          const pts = []; let i = 0; for (let xx = x - u / 2; xx <= X1 + u; xx += u / 2, i++) pts.push([xx, yy + (i % 2 ? u * 0.18 : -u * 0.18)]);
          pen.poly(pts, { stroke: pc, w: lw * 1.6, close: false });
        }
        break;
      case 'triangles': grid(u, u * 0.87, (px, py, r) => pen.poly([[px, py - u * 0.3], [px + u * 0.3, py + u * 0.22], [px - u * 0.3, py + u * 0.22]], { fill: r % 2 ? pc : mix(pc, b.c1, 0.45) }), true); break;
      case 'rings': grid(u * 1.1, u * 0.95, (px, py) => pen.circle(px, py, u * 0.28, { stroke: pc, w: lw * 1.4 }), true); break;
      case 'scallop':
        for (let r = 0, yy = y - u; yy < Y1 + u; yy += u * 0.5, r++)
          for (let xx = x - u + (r % 2 ? u / 2 : 0); xx < X1 + u; xx += u) {
            const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI + i / 16 * Math.PI; pts.push([xx + Math.cos(a) * u / 2, yy + Math.sin(a) * u / 2]); }
            pen.poly(pts, { stroke: pc, w: lw * 1.3, close: false });
          }
        break;
      case 'art':
        if (b.art && pen.art) grid(u * 2, u * 2, (px, py) => pen.art(b.art, px - u * 0.6 * b.pw, py - u * 0.6 * b.pw, u * 1.2 * b.pw, u * 1.2 * b.pw, { color: pc }), true);
        break;
    }
  }

  function draw(pen, x, y, w, h, raw, paper) {
    const b = raw && raw.kind ? raw : clean(raw);
    if (!active(b)) return;
    pen.clip(x, y, w, h);
    if (b.kind === 'color') pen.rect(x, y, w, h, { fill: b.c1 });
    else if (b.kind === 'gradient') {
      pen.rect(x, y, w, h, { fill: b.c1 });
      const N = 72;
      if (b.radial) {
        const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2;
        for (let i = 0; i < N; i++) { const t = i / (N - 1); pen.circle(cx, cy, R * (1 - t) + 0.4, { fill: mix(b.c2, b.c1, t) }); }
      } else {
        const cx = x + w / 2, cy = y + h / 2, D = Math.hypot(w, h), step = D / N;
        if (pen.rotate) pen.rotate(b.angle - 180, cx, cy);
        for (let i = 0; i < N; i++) pen.rect(cx - D / 2, cy - D / 2 + i * step, D, step + 0.35, { fill: mix(b.c1, b.c2, i / (N - 1)) });
        if (pen.rotate) pen.unclip();
      }
    } else if (b.kind === 'pattern') {
      pen.rect(x, y, w, h, { fill: b.c1 });
      drawPattern(pen, x, y, w, h, b);
    } else if (b.kind === 'image' && b.src) {
      pen.rect(x, y, w, h, { fill: paper || '#ffffff' });
      pen.image(b.src, x, y, w, h, { fit: 'cover' });
      if (b.wash > 0) pen.rect(x, y, w, h, { fill: paper || '#ffffff', fillOpacity: b.wash });
    }
    pen.unclip();
  }

  function thumb(raw, w = 40, h = 52) {
    if (!root.SvgPen) return '';
    const b = clean(raw), pen = root.SvgPen(w, h, { bg: '#ffffff' });
    draw(pen, 0, 0, w, h, { ...b, ps: b.ps * Math.min(1, w / 60) }, '#ffffff');
    return pen.svg().replace(/ width="[^"]*mm" height="[^"]*mm"/, '');
  }

  /* ---------------- painel ---------------- */
  const SWATCHES = ['#ffffff', '#faf6ee', '#f6efe3', '#efe6d6', '#e8dcc6', '#d9c3a1', '#fde8e4', '#f8d7da', '#fbe3ec', '#ede4f5', '#e3ecf7', '#dff0ea',
    '#e6f2d9', '#fff4cc', '#fde2c0', '#1f2522', '#2f4840', '#35594d', '#1f3a52', '#5b3a55', '#8a2f2f', '#c9a24a', '#b0781d', '#7c8a6e'];
  const GRADIENTS = [
    ['Areia', '#f7f0e3', '#e2cfb0', 170], ['Pêssego', '#fde6d2', '#f4b8a0', 160], ['Rosé', '#fbe7ea', '#e8b9c4', 200], ['Lavanda', '#efe8f8', '#c9b8e6', 150],
    ['Céu', '#eaf4fb', '#b9d6ee', 180], ['Menta', '#eaf6ef', '#b8dcc8', 160], ['Pôr do sol', '#ffe2b8', '#f19a8f', 135], ['Floresta', '#35594d', '#1f2f29', 180],
    ['Noite', '#23304a', '#0f1624', 180], ['Dourado', '#fff2cf', '#d9ae5b', 135],
  ];

  function panel(host, o) {
    const wrap = document.createElement('div');
    wrap.className = 'epbg';
    host.appendChild(wrap);
    const cur = () => clean(o.get());
    const KINDS = [['none', 'Papel'], ['color', 'Cor'], ['gradient', 'Degradê'], ['pattern', 'Estampa'], ['image', 'Foto']];
    function colorRow(k, label, val) {
      const extra = (o.colors ? o.colors() : []).filter(c => HEX.test(c));
      const list = [...new Set([...extra.map(c => c.toLowerCase()), ...SWATCHES])].slice(0, 30);
      return `<div class="epbg-sub"><span class="fld-lbl">${esc(label)}</span><div class="epbg-sw">` +
        list.map(c => `<button type="button" class="epbg-c${c === val ? ' on' : ''}" data-set="${k}" data-v="${c}" title="${c}"><i data-c="${c}"></i></button>`).join('') +
        `<label class="epbg-c epbg-c--pick" title="Outra cor"><input type="color" data-pick="${k}" value="${val}"></label></div></div>`;
    }
    function range(k, label, min, max, step, val, fmt) {
      return `<label class="epbg-rng"><span>${esc(label)} <b data-out="${k}">${fmt(val)}</b></span><input type="range" data-rng="${k}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
    }
    function build() {
      const b = cur();
      let h = `<div class="epbg-kinds" role="radiogroup">${KINDS.map(([v, l]) => `<button type="button" class="chip${b.kind === v ? ' on' : ''}" data-kind="${v}" aria-checked="${b.kind === v}">${l}</button>`).join('')}</div>`;
      if (b.kind === 'none') h += `<p class="hint">A página usa a cor do papel. Escolha cor, degradê, estampa ou uma foto de fundo.</p>`;
      if (b.kind === 'color') h += colorRow('c1', 'Cor do fundo', b.c1);
      if (b.kind === 'gradient') {
        h += `<div class="epbg-grid epbg-grid--grad">${GRADIENTS.map(([n, a, c, ang]) => `<button type="button" class="epbg-t" data-grad="${a},${c},${ang}" title="${esc(n)}">${thumb({ kind: 'gradient', c1: a, c2: c, angle: ang }, 30, 30)}<span>${esc(n)}</span></button>`).join('')}</div>`;
        h += colorRow('c1', 'Cor inicial', b.c1) + colorRow('c2', 'Cor final', b.c2);
        h += `<div class="epbg-two">${range('angle', 'Direção', 0, 360, 5, b.angle, v => v + '°')}<label class="row"><input type="checkbox" data-chk="radial"${b.radial ? ' checked' : ''}> Do centro</label></div>`;
      }
      if (b.kind === 'pattern') {
        h += `<div class="epbg-grid">${PATTERNS.map(([id, l]) => `<button type="button" class="epbg-t${b.pat === id ? ' on' : ''}" data-pat="${id}" title="${esc(l)}">${thumb({ ...b, kind: 'pattern', pat: id, ps: 0.8 }, 30, 30)}<span>${esc(l)}</span></button>`).join('')}</div>`;
        if (b.pat === 'art') h += `<button type="button" class="wfull" data-act="art">${b.art ? 'Trocar ilustração' : 'Escolher ilustração'}</button>`;
        h += colorRow('c1', 'Fundo', b.c1) + colorRow('pc', 'Estampa', b.pc);
        h += `<div class="epbg-two">${range('ps', 'Tamanho', 30, 300, 5, Math.round(b.ps * 100), v => v + '%')}${range('pw', 'Espessura', 30, 300, 5, Math.round(b.pw * 100), v => v + '%')}</div>`;
      }
      if (b.kind === 'image') {
        h += `<div class="epbg-img">${b.src ? '<span class="epbg-imgprev"></span>' : ''}<button type="button" data-act="image">${b.src ? 'Trocar foto' : 'Escolher foto'}</button></div>`;
        h += range('wash', 'Clarear (para o texto aparecer)', 0, 90, 5, Math.round(b.wash * 100), v => v + '%');
      }
      wrap.innerHTML = h;
      wrap.querySelectorAll('i[data-c]').forEach(i => { i.style.background = i.dataset.c; });
      const ip = wrap.querySelector('.epbg-imgprev'); if (ip) { const im = new Image(); im.alt = ''; im.src = b.src; ip.appendChild(im); }
    }
    const set = (patch, live) => { o.set(clean({ ...cur(), ...patch }), !!live); if (!live) build(); };
    wrap.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.kind) {
        if (d.kind === 'image' && !cur().src) { o.pickImage && o.pickImage(src => set({ kind: 'image', src })); return; }
        if (d.kind === 'pattern' && cur().kind !== 'pattern') set({ kind: 'pattern', pc: mix(cur().c1, '#1f2522', 0.14) });
        else set({ kind: d.kind });
      }
      else if (d.set) set({ [d.set]: d.v });
      else if (d.grad) { const [a, c, ang] = d.grad.split(','); set({ c1: a, c2: c, angle: +ang }); }
      else if (d.pat) { if (d.pat === 'art' && !cur().art && root.EPArtPicker) root.EPArtPicker.open({ title: 'Ilustração da estampa', onPick: id => root.EPArt.ensure([id]).then(() => set({ pat: 'art', art: id })) }); else set({ pat: d.pat }); }
      else if (d.act === 'art' && root.EPArtPicker) root.EPArtPicker.open({ title: 'Ilustração da estampa', current: cur().art, onPick: id => root.EPArt.ensure([id]).then(() => set({ art: id })) });
      else if (d.act === 'image' && o.pickImage) o.pickImage(src => set({ kind: 'image', src }));
    });
    wrap.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.rng) {
        const k = t.dataset.rng, v = +t.value, val = k === 'ps' || k === 'pw' || k === 'wash' ? v / 100 : v;
        const out = wrap.querySelector(`[data-out="${k}"]`); if (out) out.textContent = k === 'angle' ? v + '°' : v + '%';
        o.set(clean({ ...cur(), [k]: val }), true);
      } else if (t.dataset.pick) o.set(clean({ ...cur(), [t.dataset.pick]: t.value }), true);
    });
    wrap.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.rng) { const k = t.dataset.rng, v = +t.value; set({ [k]: k === 'ps' || k === 'pw' || k === 'wash' ? v / 100 : v }); }
      else if (t.dataset.pick) set({ [t.dataset.pick]: t.value });
      else if (t.dataset.chk) set({ [t.dataset.chk]: t.checked });
    });
    build();
    return { refresh: build, el: wrap };
  }

  root.EPBackground = { DEFAULT, PATTERNS, GRADIENTS, SWATCHES, clean, active, draw, thumb, panel, mix };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPBackground;
})(typeof window !== 'undefined' ? window : globalThis);
