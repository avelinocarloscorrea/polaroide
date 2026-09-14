/* packages/core/text-fx.js — EPTextFx
 *
 * Estilo de um elemento editável na folha (texto, ilustração ou imagem),
 * o MESMO modelo nas três ferramentas. Um objeto plano, guardado junto do
 * documento, só com o que a pessoa mudou:
 *
 *   dx, dy (mm)   s (escala)     rot (graus)     op (transparência 0.05–1)
 *   color  fam  bold  italic  upper  align ('l'|'c'|'r')
 *   ls (espaço entre letras, fração do corpo)   lh (altura da linha)
 *   ol (cor do contorno)  olw (espessura 0–1)  hol (só contorno, vazado)
 *   bg (cor do fundo)  bgo (opacidade)  bgp (folga 0–1)  bgr (arredondado 0–1)
 *   sh (cor da sombra)  shd (distância 0–1)  sho (opacidade)
 *   hide
 *
 * Desenho: o app continua desenhando o elemento como sempre, só que por uma
 * "caneta com estilo":
 *
 *   const P = EPTextFx.pen(pen, f);   // f = EPTextFx.norm(ajustes)
 *   P.text(...)  P.art(...)            // itálico, caixa alta, espaçamento e transparência
 *   P.done(box)                        // fundo, sombra, contorno e giro em volta do que foi desenhado
 *
 * Funciona com SvgPen (tela) e PdfPen (PDF vetorial) — pen.mark()/fxWrap().
 * Para texto livre de várias linhas: EPTextFx.block(pen, str, cx, cy, size, f, def).
 */
(function (root) {
  "use strict";
  const PT = 72 / 25.4;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const numIn = (v, a, b) => (v != null && v !== '' && isFinite(+v)) ? clamp(+v, a, b) : null;

  // [chave, tipo, mín, máx]
  const SPEC = [
    ['dx', 'n', -900, 900], ['dy', 'n', -900, 900], ['s', 'n', 0.2, 6], ['rot', 'n', -180, 180], ['op', 'n', 0.05, 1],
    ['color', 'c'], ['fam', 'f'], ['bold', 'b'], ['italic', 'b'], ['upper', 'b'], ['align', 'a'],
    ['ls', 'n', -0.1, 1], ['lh', 'n', 0.7, 3],
    ['ol', 'c'], ['olw', 'n', 0, 1], ['hol', 'b'],
    ['bg', 'c'], ['bgo', 'n', 0, 1], ['bgp', 'n', 0, 1], ['bgr', 'n', 0, 1],
    ['sh', 'c'], ['shd', 'n', 0, 1], ['sho', 'n', 0, 1],
    ['hide', 'b'],
  ];
  const KEYS = SPEC.map(s => s[0]);
  const families = () => (root.EPFontMetrics && root.EPFontMetrics.families) || {};

  // valida um objeto de ajustes vindo de qualquer lugar (localStorage, .json, desfazer)
  function clean(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    SPEC.forEach(([k, t, a, b]) => {
      const v = raw[k];
      if (v == null || v === '') return;
      if (t === 'n') { const x = numIn(v, a, b); if (x != null) out[k] = Math.round(x * 1000) / 1000; }
      else if (t === 'c') { if (HEX.test(v)) out[k] = v.toLowerCase(); }
      else if (t === 'f') { if (typeof v === 'string' && /^[A-Za-z]{2,24}$/.test(v) && (families()[v] || !root.EPFontMetrics)) out[k] = v; }
      else if (t === 'b') { if (k === 'hide' || k === 'hol') { if (v) out[k] = true; } else out[k] = !!v; }
      else if (t === 'a') { if (['l', 'c', 'r'].includes(v)) out[k] = v; }
    });
    return out;
  }
  // com os padrões preenchidos (o que o desenho lê)
  function norm(raw) {
    const e = clean(raw);
    return {
      dx: e.dx || 0, dy: e.dy || 0, s: e.s || 1, rot: e.rot || 0, op: e.op == null ? 1 : e.op,
      color: e.color || null, fam: e.fam || null, bold: e.bold == null ? null : e.bold, italic: e.italic == null ? null : e.italic,
      upper: !!e.upper, align: e.align || null, ls: e.ls || 0, lh: e.lh || null,
      ol: e.ol || null, olw: e.olw == null ? 0.4 : e.olw, hol: !!e.hol,
      bg: e.bg || null, bgo: e.bgo == null ? 1 : e.bgo, bgp: e.bgp == null ? 0.3 : e.bgp, bgr: e.bgr == null ? 0.25 : e.bgr,
      sh: e.sh || null, shd: e.shd == null ? 0.4 : e.shd, sho: e.sho == null ? 0.35 : e.sho,
      hide: !!e.hide,
    };
  }
  // aplica um patch (valores null/'' removem a chave) e devolve o objeto limpo
  function merge(cur, patch) {
    const o = { ...(cur || {}) };
    Object.keys(patch || {}).forEach(k => {
      if (!KEYS.includes(k)) return;
      const v = patch[k];
      if (v === null || v === '' || v === undefined || v === false && (k === 'hide' || k === 'hol')) delete o[k]; else o[k] = v;
    });
    return clean(o);
  }
  const hasBlock = f => !!(f && (f.rot || f.bg || f.sh || f.ol));
  const styled = f => !!(f && (hasBlock(f) || f.op < 1 || f.upper || f.italic != null || f.ls));

  function fontWith(font, f) {
    if (!f || f.italic == null) return font;
    const b = font === 'bold' || font === 'bi';
    return f.italic ? (b ? 'bi' : 'it') : (b ? 'bold' : undefined);
  }
  const txt = (str, f) => f && f.upper ? String(str == null ? '' : str).toLocaleUpperCase('pt-BR') : String(str == null ? '' : str);

  // caneta com estilo: repassa tudo para a caneta real
  function pen(p, f) {
    f = f || norm({});
    const m = p.mark ? p.mark() : 0;
    const P = Object.create(p);
    P.text = (str, x, y, s = {}) => {
      const size = s.size || 9;
      const o = { ...s, font: fontWith(s.font, f) };
      if (f.ls) o.tracking = (s.tracking || 0) + f.ls * size / PT;
      if (f.op < 1) o.opacity = (s.opacity == null ? 1 : s.opacity) * f.op;
      return p.text(txt(str, f), x, y, o);
    };
    P.textWidth = (str, size, bold, fam) => {
      const t = txt(str, f);
      return p.textWidth(t, size, bold, fam) + (f.ls ? Math.max(0, [...t].length - 1) * f.ls * size / PT : 0);
    };
    P.art = (id, x, y, w, h, s = {}) => p.art ? p.art(id, x, y, w, h, f.op < 1 ? { ...s, opacity: (s.opacity == null ? 1 : s.opacity) * f.op } : s) : false;
    P.image = (href, x, y, w, h, s = {}) => p.image(href, x, y, w, h, f.op < 1 ? { ...s, opacity: (s.opacity == null ? 1 : s.opacity) * f.op } : s);
    P.done = box => { if (box && hasBlock(f) && p.fxWrap) p.fxWrap(m, box, f); return box; };
    return P;
  }

  // texto livre (várias linhas, alinhamento, altura de linha) centrado em cx/cy.
  // def: { size (pt), fam, color, bold, align, lh } — os padrões do app. Devolve a caixa (mm).
  function block(p, str, cx, cy, size, f, def = {}) {
    const P = pen(p, f);
    const fam = f.fam || def.fam || 'sans', bold = f.bold != null ? f.bold : !!def.bold;
    const align = f.align || def.align || 'c', lhK = f.lh || def.lh || 1.25;
    const lines = String(str == null ? '' : str).split('\n');
    const lh = size * lhK / PT;
    const widths = lines.map(l => P.textWidth(l, size, bold, fam));
    const wmax = Math.max(0.5, ...widths);
    const x0 = cx - wmax / 2, top = cy - lines.length * lh / 2;
    lines.forEach((l, j) => {
      const x = align === 'l' ? x0 : align === 'r' ? x0 + wmax : cx;
      P.text(l, x, top + (j + 0.5) * lh, { size, family: fam, font: bold ? 'bold' : undefined, color: f.color || def.color || '#222222', align, baseline: 'middle' });
    });
    const box = { x: x0, y: top, w: wmax, h: lines.length * lh };
    P.done(box);
    return box;
  }

  // estilos prontos (painel "Efeitos"): só as chaves de efeito — posição, tamanho e texto ficam
  const RESET = { ol: null, olw: null, hol: null, bg: null, bgo: null, bgp: null, bgr: null, sh: null, shd: null, sho: null, upper: null, ls: null, italic: null, op: null };
  const PRESETS = [
    { id: 'plain', label: 'Simples', patch: {} },
    { id: 'shadow', label: 'Sombra', patch: { sh: '#000000', shd: 0.45, sho: 0.32 } },
    { id: 'lift', label: 'Elevado', patch: { sh: '#000000', shd: 0.2, sho: 0.18 } },
    { id: 'outline', label: 'Contorno', patch: { color: '#ffffff', ol: '#1f2522', olw: 0.45 } },
    { id: 'hollow', label: 'Vazado', patch: { ol: '#1f2522', olw: 0.3, hol: true } },
    { id: 'label', label: 'Etiqueta', patch: { color: '#ffffff', bg: '#35594d', bgp: 0.35, bgr: 0.2 } },
    { id: 'pill', label: 'Pílula', patch: { color: '#1f2522', bg: '#f3e3c3', bgp: 0.3, bgr: 1 } },
    { id: 'marker', label: 'Marca-texto', patch: { bg: '#ffe066', bgo: 0.85, bgp: 0.08, bgr: 0 } },
    { id: 'retro', label: 'Retrô', patch: { color: '#f4c95d', ol: '#1f2522', olw: 0.35, sh: '#d1495b', shd: 0.8, sho: 1 } },
    { id: 'neon', label: 'Neon', patch: { color: '#ffffff', ol: '#ff4f9a', olw: 0.55, sh: '#ff4f9a', shd: 0.15, sho: 0.45 } },
    { id: 'stamp', label: 'Carimbo', patch: { color: '#b23b2c', upper: true, ls: 0.14, ol: '#b23b2c', olw: 0.25, op: 0.85 } },
    { id: 'spaced', label: 'Espaçado', patch: { upper: true, ls: 0.3 } },
    { id: 'elegant', label: 'Elegante', patch: { italic: true, ls: 0.04 } },
  ];
  const preset = id => { const p = PRESETS.find(x => x.id === id); return p ? { ...RESET, ...p.patch } : null; };

  // prévia CSS de um preset (chips do painel) — só propriedades via CSSOM
  function cssPreview(el, patch) {
    const f = norm(patch);
    el.style.color = f.color || '';
    el.style.fontStyle = f.italic ? 'italic' : '';
    el.style.textTransform = f.upper ? 'uppercase' : '';
    el.style.letterSpacing = f.ls ? f.ls + 'em' : '';
    el.style.opacity = f.op < 1 ? f.op : '';
    el.style.background = f.bg || '';
    el.style.borderRadius = f.bg ? (f.bgr >= 0.9 ? '99px' : Math.round(f.bgr * 12) + 'px') : '';
    el.style.padding = f.bg ? '1px 6px' : '';
    const shadows = [];
    if (f.sh) shadows.push(`${(f.shd * 3).toFixed(1)}px ${(f.shd * 3).toFixed(1)}px 0 ${f.sh}${Math.round(f.sho * 255).toString(16).padStart(2, '0')}`);
    el.style.textShadow = shadows.join(',');
    if (f.ol) { el.style.webkitTextStroke = `${(0.4 + f.olw).toFixed(2)}px ${f.ol}`; if (f.hol) el.style.color = 'transparent'; }
    else el.style.webkitTextStroke = '';
  }

  root.EPTextFx = { KEYS, clean, norm, merge, pen, block, hasBlock, styled, PRESETS, preset, cssPreview, fontWith, txt };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPTextFx;
})(typeof window !== 'undefined' ? window : globalThis);
