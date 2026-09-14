/* packages/core/svgart.js — EPSvgArt
 *
 * Converte o corpo SVG de uma ilustração (subconjunto usado pelos catálogos
 * Fluent Emoji Flat e Phosphor) em formas vetoriais simples para o PDF:
 *   path (M L H V C S Q T A Z, relativos e absolutos), circle, ellipse, rect
 *   (com rx), line, polyline, polygon, g aninhado, transform (matrix,
 *   translate, scale, rotate), fill/stroke/stroke-width/opacity/fill-rule,
 *   currentColor e gradientes (vira a cor média das paradas).
 * Saída: [{ subpaths: [[{ op:'M'|'L'|'C', p:[x,y,…] }…, closed]…], fill, stroke, sw, evenodd, alpha, cap, join }]
 * em coordenadas do viewBox. Sem DOM: roda no navegador e no Node (testes).
 */
(function (root) {
  "use strict";

  const num = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

  function parseAttrs(s) {
    const out = {};
    s.replace(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g, (m, k, q, a, b) => { out[k] = a != null ? a : b; return m; });
    if (out.style) out.style.split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim(); });
    return out;
  }
  // árvore mínima de elementos
  function parseXml(src) {
    const rootEl = { tag: 'root', attrs: {}, kids: [] }, stack = [rootEl];
    const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g;
    let m;
    while ((m = re.exec(src))) {
      const [, close, tag, rest, self] = m;
      if (close) { if (stack.length > 1) stack.pop(); continue; }
      const el = { tag, attrs: parseAttrs(rest), kids: [] };
      stack[stack.length - 1].kids.push(el);
      if (!self) stack.push(el);
    }
    return rootEl;
  }

  const I = [1, 0, 0, 1, 0, 0];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  function parseTransform(t) {
    let M = I;
    if (!t) return M;
    t.replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g, (m, fn, args) => {
      const v = (args.match(num) || []).map(Number);
      let T = I;
      if (fn === 'matrix' && v.length === 6) T = v;
      else if (fn === 'translate') T = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
      else if (fn === 'scale') T = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
      else if (fn === 'rotate') {
        const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        T = [c, s, -s, c, 0, 0];
        if (v.length === 3) T = mul(mul([1, 0, 0, 1, v[1], v[2]], T), [1, 0, 0, 1, -v[1], -v[2]]);
      } else if (fn === 'skewX') T = [1, 0, Math.tan((v[0] || 0) * Math.PI / 180), 1, 0, 0];
      else if (fn === 'skewY') T = [1, Math.tan((v[0] || 0) * Math.PI / 180), 0, 1, 0, 0];
      M = mul(M, T);
      return m;
    });
    return M;
  }
  const ap = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

  // arco SVG -> curvas cúbicas (algoritmo padrão da especificação, F.6)
  function arcToCubics(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
    const rad = phi * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sign = fa === fs ? -1 : 1;
    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const co = sign * Math.sqrt(Math.max(0, num2 / (rx * rx * y1p * y1p + ry * ry * x1p * x1p)));
    const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
    let t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
    const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2)), d = dt / segs, k = 4 / 3 * Math.tan(d / 4);
    const out = [];
    for (let i = 0; i < segs; i++) {
      const a1 = t1 + i * d, a2 = a1 + d;
      const e1 = [Math.cos(a1), Math.sin(a1)], e2 = [Math.cos(a2), Math.sin(a2)];
      const p = (ex, ey) => [cos * rx * ex - sin * ry * ey + cx, sin * rx * ex + cos * ry * ey + cy];
      const c1 = p(e1[0] - k * e1[1], e1[1] + k * e1[0]), c2 = p(e2[0] + k * e2[1], e2[1] - k * e2[0]), pe = p(e2[0], e2[1]);
      out.push([...c1, ...c2, ...pe]);
    }
    return out;
  }

  // "d" -> subcaminhos com M/L/C absolutos, já transformados por M
  function parsePath(d, M) {
    const toks = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
    const subs = []; let cur = null;
    let x = 0, y = 0, sx = 0, sy = 0, cmd = '', pcx = null, pcy = null, qcx = null, qcy = null;
    let i = 0;
    const n = () => +toks[i++];
    const moveTo = (nx, ny) => { cur = { segs: [{ op: 'M', p: ap(M, nx, ny) }], closed: false }; subs.push(cur); x = sx = nx; y = sy = ny; };
    const lineTo = (nx, ny) => { if (!cur) moveTo(x, y); cur.segs.push({ op: 'L', p: ap(M, nx, ny) }); x = nx; y = ny; };
    const curveTo = (a, b, c, d2, e, f) => { if (!cur) moveTo(x, y); cur.segs.push({ op: 'C', p: [...ap(M, a, b), ...ap(M, c, d2), ...ap(M, e, f)] }); x = e; y = f; };
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      if (C === 'Z') { if (cur) { cur.closed = true; x = sx; y = sy; } cmd = ''; pcx = qcx = null; if (i < toks.length && !/[a-zA-Z]/.test(toks[i])) i++; continue; }
      if (i >= toks.length || /[a-zA-Z]/.test(toks[i])) { if (!cmd) i++; continue; }
      if (C === 'M') { moveTo(n() + ox, n() + oy); cmd = rel ? 'l' : 'L'; pcx = qcx = null; }
      else if (C === 'L') { lineTo(n() + ox, n() + oy); pcx = qcx = null; }
      else if (C === 'H') { lineTo(n() + ox, y); pcx = qcx = null; }
      else if (C === 'V') { lineTo(x, n() + oy); pcx = qcx = null; }
      else if (C === 'C') { const a = n() + ox, b = n() + oy, c = n() + ox, d2 = n() + oy, e = n() + ox, f = n() + oy; curveTo(a, b, c, d2, e, f); pcx = c; pcy = d2; qcx = null; }
      else if (C === 'S') { const c1x = pcx != null ? 2 * x - pcx : x, c1y = pcx != null ? 2 * y - pcy : y; const c = n() + ox, d2 = n() + oy, e = n() + ox, f = n() + oy; curveTo(c1x, c1y, c, d2, e, f); pcx = c; pcy = d2; qcx = null; }
      else if (C === 'Q') { const qx = n() + ox, qy = n() + oy, e = n() + ox, f = n() + oy; curveTo(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), e + 2 / 3 * (qx - e), f + 2 / 3 * (qy - f), e, f); qcx = qx; qcy = qy; pcx = null; }
      else if (C === 'T') { const qx = qcx != null ? 2 * x - qcx : x, qy = qcx != null ? 2 * y - qcy : y; const e = n() + ox, f = n() + oy; curveTo(x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), e + 2 / 3 * (qx - e), f + 2 / 3 * (qy - f), e, f); qcx = qx; qcy = qy; pcx = null; }
      else if (C === 'A') {
        const rx = n(), ry = n(), phi = n(), fa = n(), fs = n(), ex = n() + ox, ey = n() + oy;
        arcToCubics(x, y, rx, ry, phi, fa ? 1 : 0, fs ? 1 : 0, ex, ey).forEach(c => curveTo(...c));
        x = ex; y = ey; pcx = qcx = null;
      } else i++;
    }
    return subs;
  }
  // elipse com 4 cúbicas
  function ellipseSubs(cx, cy, rx, ry, M) {
    const k = 0.5523;
    const pts = [[cx + rx, cy], [cx, cy + ry], [cx - rx, cy], [cx, cy - ry]];
    const segs = [{ op: 'M', p: ap(M, ...pts[0]) }];
    const ctl = [[cx + rx, cy + k * ry, cx + k * rx, cy + ry], [cx - k * rx, cy + ry, cx - rx, cy + k * ry], [cx - rx, cy - k * ry, cx - k * rx, cy - ry], [cx + k * rx, cy - ry, cx + rx, cy - k * ry]];
    for (let j = 0; j < 4; j++) segs.push({ op: 'C', p: [...ap(M, ctl[j][0], ctl[j][1]), ...ap(M, ctl[j][2], ctl[j][3]), ...ap(M, ...pts[(j + 1) % 4])] });
    return [{ segs, closed: true }];
  }
  function rectSubs(x, y, w, h, rx, ry, M) {
    if (!(rx > 0 || ry > 0)) return [{ segs: [{ op: 'M', p: ap(M, x, y) }, { op: 'L', p: ap(M, x + w, y) }, { op: 'L', p: ap(M, x + w, y + h) }, { op: 'L', p: ap(M, x, y + h) }], closed: true }];
    rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
    const d = `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    return parsePath(d, M);
  }

  const NAMED = { black: '#000000', white: '#ffffff', red: '#ff0000', none: 'none', transparent: 'none' };
  function normColor(c, grads) {
    if (c == null) return null;
    c = String(c).trim();
    if (!c) return null;
    if (c === 'none' || c === 'transparent') return 'none';
    if (c === 'currentColor') return 'currentColor';
    const u = c.match(/url\(#([^)]+)\)/); if (u) return grads[u[1]] || '#888888';
    if (NAMED[c]) return NAMED[c];
    let m = c.match(/^#([0-9a-f]{3})$/i); if (m) return '#' + m[1].split('').map(x => x + x).join('').toLowerCase();
    m = c.match(/^#([0-9a-f]{6})/i); if (m) return '#' + m[1].toLowerCase();
    m = c.match(/rgba?\(([^)]+)\)/); if (m) { const v = m[1].split(',').map(parseFloat); return '#' + v.slice(0, 3).map(q => Math.round(q).toString(16).padStart(2, '0')).join(''); }
    return null;
  }

  function parse(body) {
    const tree = parseXml(body);
    // gradientes -> cor média das paradas
    const grads = {};
    (function walk(el) {
      if (/Gradient$/.test(el.tag) && el.attrs.id) {
        const cols = [];
        el.kids.forEach(k => { if (k.tag === 'stop') { const c = normColor(k.attrs['stop-color'], {}); if (c && c[0] === '#') cols.push(c); } });
        if (cols.length) {
          const avg = [0, 1, 2].map(q => Math.round(cols.reduce((a, c) => a + parseInt(c.slice(1 + q * 2, 3 + q * 2), 16), 0) / cols.length));
          grads[el.attrs.id] = '#' + avg.map(v => v.toString(16).padStart(2, '0')).join('');
        }
      }
      el.kids.forEach(walk);
    })(tree);
    const shapes = [];
    (function walk(el, M, inh) {
      if (/^(defs|clipPath|mask|filter|linearGradient|radialGradient|title|desc|style)$/.test(el.tag)) return;
      const a = el.attrs;
      const st = {
        fill: a.fill != null ? normColor(a.fill, grads) : inh.fill,
        stroke: a.stroke != null ? normColor(a.stroke, grads) : inh.stroke,
        sw: a['stroke-width'] != null ? parseFloat(a['stroke-width']) : inh.sw,
        alpha: inh.alpha * (a.opacity != null ? parseFloat(a.opacity) : 1),
        fillAlpha: a['fill-opacity'] != null ? parseFloat(a['fill-opacity']) : inh.fillAlpha,
        evenodd: a['fill-rule'] != null ? a['fill-rule'] === 'evenodd' : (a['clip-rule'] === 'evenodd' ? true : inh.evenodd),
        cap: a['stroke-linecap'] || inh.cap, join: a['stroke-linejoin'] || inh.join,
        dash: a['stroke-dasharray'] != null ? ((a['stroke-dasharray'].match(num) || []).map(Number).filter(v => v >= 0)) : inh.dash,
      };
      const MM = a.transform ? mul(M, parseTransform(a.transform)) : M;
      let subs = null;
      const f = k => parseFloat(a[k]) || 0;
      if (el.tag === 'path') subs = parsePath(a.d, MM);
      else if (el.tag === 'circle') subs = ellipseSubs(f('cx'), f('cy'), f('r'), f('r'), MM);
      else if (el.tag === 'ellipse') subs = ellipseSubs(f('cx'), f('cy'), f('rx'), f('ry'), MM);
      else if (el.tag === 'rect') subs = rectSubs(f('x'), f('y'), f('width'), f('height'), f('rx'), f('ry'), MM);
      else if (el.tag === 'line') subs = parsePath(`M${f('x1')} ${f('y1')}L${f('x2')} ${f('y2')}`, MM);
      else if (el.tag === 'polyline' || el.tag === 'polygon') {
        const v = (a.points || '').match(num) || [];
        let d = ''; for (let j = 0; j + 1 < v.length; j += 2) d += (j ? 'L' : 'M') + v[j] + ' ' + v[j + 1];
        if (el.tag === 'polygon') d += 'Z';
        subs = parsePath(d, MM);
      }
      if (subs && subs.length) {
        const scale = Math.sqrt(Math.abs(MM[0] * MM[3] - MM[1] * MM[2])) || 1;
        shapes.push({ subs, fill: st.fill == null ? '#000000' : st.fill, stroke: st.stroke || 'none', sw: (st.sw == null ? 1 : st.sw) * scale,
          evenodd: !!st.evenodd, alpha: st.alpha * (st.fillAlpha == null ? 1 : st.fillAlpha), cap: st.cap, join: st.join,
          dash: st.dash && st.dash.length && st.dash.some(v => v > 0) ? st.dash.map(v => v * scale) : null });
      }
      el.kids.forEach(k => walk(k, MM, st));
    })(tree, I, { fill: null, stroke: null, sw: null, alpha: 1, fillAlpha: null, evenodd: false, cap: null, join: null, dash: null });
    return shapes;
  }

  root.EPSvgArt = { parse, parsePath, arcToCubics, parseTransform };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPSvgArt;
})(typeof window !== 'undefined' ? window : globalThis);
