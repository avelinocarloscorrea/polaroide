/* packages/core/pen.js — "caneta" única da tela (SVG) e do PDF vetorial
 *
 * Os tipos de página desenham chamando os mesmos métodos; a mesma rotina serve
 * para a TELA (SvgPen) e para o PDF (PdfPen). Unidades em mm, origem no canto
 * superior-esquerdo, y para baixo.
 *
 *   line, rect, dot, circle, text, image, textWidth, fitText, wrapText,
 *   clip(x,y,w,h)/unclip()
 *
 * Texto: fontes livres INCORPORADAS no PDF (packages/core/fonts) — as mesmas
 * da tela, com as mesmas larguras, então quebra de linha e ajuste de tamanho
 * são idênticos na prévia e no impresso. Qualquer caractere da fonte funciona
 * (não há mais o limite WinAnsi).
 *
 * Cor: a caneta PDF grava a cor como marcador; buildPDF resolve para RGB
 * (PDF para casa) ou CMYK pelo perfil FOGRA39 (PDF/X-4 para gráfica).
 *
 * Globais expostos (scripts clássicos): SvgPen, PdfPen, buildPDF,
 * resetPdfImages, imageDims, hexRGB, esc, penTextWidthMm, fitTextSize,
 * wrapTextLines, fontCss, embeddedFontStyle, EPPen.
 */
(function (root) {
  "use strict";

  const PT = 72 / 25.4;
  const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
  function hexRGB(hex) {
    hex = HEX.test(hex) ? hex : '#000000';
    if (hex.length === 4) hex = '#' + [...hex.slice(1)].map(c => c + c).join('');
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }
  const hex6 = hex => { const [r, g, b] = hexRGB(hex); return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  // caminho base do núcleo (para carregar fontes/ICC sob demanda)
  let BASE = '';
  try {
    const cs = root.document && root.document.currentScript;
    if (cs && cs.src) BASE = cs.src.replace(/[^/]*$/, '');
  } catch (e) {}

  /* ---------------- fontes ---------------- */
  const M = () => root.EPFontMetrics || { faces: {}, families: {} };
  function faceId(fam, font) {
    const F = M().families[fam] || M().families.sans;
    if (!F) return 'sans-r';
    const f = F.faces;
    if (font === 'bold') return f.b || f.r;
    if (font === 'it') return f.i || f.r;
    if (font === 'bi') return f.bi || f.b || f.r;
    return f.r;
  }
  function fontCss(fam) {
    const F = M().families[fam] || M().families.sans;
    return F ? F.css : 'Arimo, Helvetica, Arial, sans-serif';
  }
  // avanço em pt, pelas larguras reais da fonte
  function textAdvance(str, sizePt, font, fam) {
    const face = M().faces[faceId(fam, font)];
    let w = 0;
    if (!face) { for (const ch of String(str == null ? '' : str)) w += 556; return w / 1000 * sizePt; }
    const W = face.w, miss = face.miss;
    for (const ch of String(str == null ? '' : str)) { const v = W[ch.codePointAt(0)]; w += v != null ? v : miss; }
    return w / 1000 * sizePt;
  }
  const fontKey = b => b === true ? 'bold' : b === false || b == null ? undefined : b;
  function penTextWidthMm(str, sizePt, bold, fam) { return textAdvance(str, sizePt, fontKey(bold), fam) / PT; }
  // maior tamanho (pt) que faz `str` caber em maxWmm, entre min e start.
  function fitTextSize(str, maxWmm, startPt, minPt, bold, fam) {
    const lim = maxWmm * 0.98;
    let s = startPt;
    while (s > minPt && penTextWidthMm(str, s, bold, fam) > lim) s -= 0.5;
    return Math.max(minPt, Math.round(s * 2) / 2);
  }
  // quebra em linhas que cabem em maxWmm (mantém quebras \n).
  function wrapTextLines(str, maxWmm, sizePt, bold, maxLines, fam) {
    const out = [];
    for (const para of String(str == null ? '' : str).split('\n')) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(''); continue; }
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (penTextWidthMm(t, sizePt, bold, fam) > maxWmm && line) { out.push(line); line = w; }
        else line = t;
      }
      if (line) out.push(line);
    }
    if (maxLines && out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.$/, '…'); }
    return out;
  }
  // deslocamento da linha de base (em fração do corpo) — igual ao SVG:
  // "central" = meio entre ascendente e descendente; "text-before-edge" = ascendente
  function baselineShift(fam, font, baseline) {
    const f = M().faces[faceId(fam, font)] || { asc: 905, desc: -212 };
    if (baseline === 'middle') return (f.asc + f.desc) / 2000;
    if (baseline === 'top') return f.asc / 1000;
    return 0;
  }

  // carregamento sob demanda (script-src 'self'; fetch é bloqueado pela CSP)
  const loading = new Map();
  function loadScript(rel) {
    if (loading.has(rel)) return loading.get(rel);
    const p = new Promise((res, rej) => {
      if (!root.document) { try { require(BASE + rel); res(); } catch (e) { rej(e); } return; }
      const s = root.document.createElement('script');
      s.src = BASE + rel; s.onload = () => res(); s.onerror = () => { loading.delete(rel); rej(new Error('falha ao carregar ' + rel)); };
      root.document.head.appendChild(s);
    });
    loading.set(rel, p);
    return p;
  }
  const b64bytes = b64 => {
    if (typeof Buffer !== 'undefined' && !root.atob) return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  };
  const parsedFonts = {};
  async function loadFaces(ids) {
    await Promise.all(ids.map(id => (root.EPFontData && root.EPFontData[id]) ? null : loadScript('fonts/' + id + '.js')));
    ids.forEach(id => { if (!parsedFonts[id]) parsedFonts[id] = root.EPTtf.parse(b64bytes(root.EPFontData[id])); });
  }
  let converter = null;
  async function loadCmyk() {
    if (converter) return converter;
    if (!root.EPIccData) await loadScript('icc/fogra39.js');
    converter = root.EPColor.createConverter(b64bytes(root.EPIccData));
    converter.icc = b64bytes(root.EPIccData);
    return converter;
  }

  // @font-face com as fontes em data: (SVG dentro de <img> não carrega arquivos)
  async function embeddedFontStyle(svgText) {
    const ids = new Set();
    const fams = M().families;
    for (const k of Object.keys(fams)) {
      const css = fams[k].css.split(',')[0].replace(/'/g, '');
      if (svgText && svgText.indexOf(css) < 0) continue;
      Object.values(fams[k].faces).forEach(id => ids.add(id));
    }
    const list = [...ids];
    await loadFaces(list).catch(() => {});
    let css = '';
    for (const id of list) {
      if (!root.EPFontData || !root.EPFontData[id]) continue;
      const fam = Object.values(fams).find(f => Object.values(f.faces).includes(id));
      const short = Object.entries(fam.faces).find(([, v]) => v === id)[0];
      css += `@font-face{font-family:${fam.css.split(',')[0]};font-weight:${/b/.test(short) ? 700 : 400};font-style:${/i/.test(short) ? 'italic' : 'normal'};src:url(data:font/ttf;base64,${root.EPFontData[id]}) format('truetype')}`;
    }
    return css ? `<style>${css}</style>` : '';
  }

  /* ===================== SvgPen (tela) ===================== */
  let SVGPEN_CLIP_SEQ = 0;   // ids únicos no documento inteiro (vários SVGs na página)
  function SvgPen(wMm, hMm, o = {}) {
    const parts = [], defs = [];
    let openClips = 0, LS = 1;
    const n = v => (+v).toFixed(4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    const sw = w => n((w == null ? 0.2 : w) * LS);
    const stroke = s => {
      const a = [`stroke="${s.color || '#000'}"`, `stroke-width="${sw(s.w)}"`];
      if (s.dash) a.push(`stroke-dasharray="${s.dash.map(n).join(' ')}"`);
      if (s.opacity != null) a.push(`stroke-opacity="${s.opacity}"`);
      if (s.cap) a.push(`stroke-linecap="${s.cap}"`);
      return a.join(' ');
    };
    const api = {
      isPdf: false,
      setLineScale(k) { LS = (+k > 0 ? +k : 1); },
      clip(x, y, w, h) {
        const id = 'c' + (++SVGPEN_CLIP_SEQ);
        defs.push(`<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/></clipPath>`);
        parts.push(`<g clip-path="url(#${id})">`); openClips++;
      },
      unclip() { if (openClips > 0) { parts.push('</g>'); openClips--; } },
      line(x1, y1, x2, y2, s = {}) { parts.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" ${stroke(s)}/>`); },
      rect(x, y, w, h, s = {}) {
        const a = [`x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"`, `fill="${s.fill || 'none'}"`];
        if (s.fill && s.fillOpacity != null) a.push(`fill-opacity="${s.fillOpacity}"`);
        if (s.stroke) a.push(`stroke="${s.stroke}" stroke-width="${sw(s.w)}"`);
        if (s.dash) a.push(`stroke-dasharray="${s.dash.map(n).join(' ')}"`);
        if (s.rx) a.push(`rx="${n(s.rx)}"`);
        parts.push(`<rect ${a.join(' ')}/>`);
      },
      dot(cx, cy, r, s = {}) { parts.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * Math.min(1.6, Math.sqrt(LS)))}" fill="${s.fill || '#000'}"${s.opacity != null ? ` fill-opacity="${s.opacity}"` : ''}/>`); },
      circle(cx, cy, r, s = {}) {
        const a = [`cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"`, `fill="${s.fill || 'none'}"`];
        if (s.stroke) a.push(`stroke="${s.stroke}" stroke-width="${sw(s.w)}"`);
        parts.push(`<circle ${a.join(' ')}/>`);
      },
      // caminho poligonal (pontos em mm) — usado por furos, lua, abas
      poly(pts, s = {}) {
        if (!pts || pts.length < 2) return;
        const d = pts.map((p, i) => (i ? 'L' : 'M') + n(p[0]) + ' ' + n(p[1])).join('') + (s.close === false ? '' : 'Z');
        const a = [`d="${d}"`, `fill="${s.fill || 'none'}"`];
        if (s.stroke) a.push(`stroke="${s.stroke}" stroke-width="${sw(s.w)}"`);
        parts.push(`<path ${a.join(' ')}/>`);
      },
      text(str, x, y, s = {}) {
        str = String(str == null ? '' : str);
        const size = (s.size || 9) / PT;
        const anchor = s.align === 'c' ? 'middle' : s.align === 'r' ? 'end' : 'start';
        // linha de base calculada pelas métricas (mesma conta do PDF), não pelo
        // dominant-baseline do navegador — que varia entre motores.
        const by = y + baselineShift(s.family, s.font, s.baseline) * size;
        const a = [`x="${n(x)}" y="${n(by)}"`, `font-size="${n(size)}"`, `font-family="${esc(fontCss(s.family))}"`,
          `fill="${s.color || '#000'}"`, `text-anchor="${anchor}"`];
        if (s.font === 'bold' || s.font === 'bi') a.push('font-weight="700"');
        if (s.font === 'it' || s.font === 'bi') a.push('font-style="italic"');
        if (s.opacity != null) a.push(`opacity="${s.opacity}"`);
        if (s.tracking) a.push(`letter-spacing="${n(s.tracking)}"`);
        parts.push(`<text ${a.join(' ')}>${esc(str)}</text>`);
      },
      image(href, x, y, w, h, s = {}) {
        if (!href || typeof href !== 'string' || href.slice(0, 5) !== 'data:') return;
        const a = [`x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"`,
          `preserveAspectRatio="${s.fit === 'cover' ? 'xMidYMid slice' : s.fit === 'stretch' ? 'none' : 'xMidYMid meet'}"`,
          `href="${esc(href)}"`];
        if (s.opacity != null) a.push(`opacity="${s.opacity}"`);
        parts.push(`<image ${a.join(' ')}/>`);
      },
      // ilustração do catálogo (EPArt) encaixada na caixa; false se ainda não carregou
      art(id, x, y, w, h, s = {}) {
        const it = root.EPArt && root.EPArt.get(id); if (!it) return false;
        const a = [`x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${it.w} ${it.h}" preserveAspectRatio="xMidYMid meet" overflow="visible"`];
        if (it.mono) a.push(`color="${HEX.test(s.color || '') ? s.color : '#000'}"`);
        if (s.opacity != null && s.opacity < 1) a.push(`opacity="${n(clamp01(s.opacity))}"`);
        parts.push(`<svg ${a.join(' ')}>${it.body}</svg>`);
        return true;
      },
      // gira o que vier depois (graus, sentido horário) até o próximo unclip()
      rotate(deg, cx, cy) { parts.push(`<g transform="rotate(${n(deg)} ${n(cx)} ${n(cy)})">`); openClips++; },
      textWidth: penTextWidthMm, fitText: fitTextSize, wrapText: wrapTextLines,
      svg() {
        while (openClips > 0) api.unclip();
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(wMm)} ${n(hMm)}" ` +
          `width="${n(wMm)}mm" height="${n(hMm)}mm" preserveAspectRatio="xMidYMid meet" shape-rendering="geometricPrecision" text-rendering="geometricPrecision">` +
          (defs.length ? `<defs>${defs.join('')}</defs>` : '') +
          `<rect width="${n(wMm)}" height="${n(hMm)}" fill="${o.bg || '#fff'}"/>` +
          parts.join('') + `</svg>`;
      },
    };
    return api;
  }

  // formas vetoriais de uma ilustração, convertidas uma vez só
  const ART_SHAPES = new Map();
  function artShapes(it) {
    let v = ART_SHAPES.get(it.id);
    if (!v) { v = root.EPSvgArt.parse(it.body); ART_SHAPES.set(it.id, v); }
    return v;
  }

  /* registro de imagens/opacidades — preenchido pelas canetas, consumido por buildPDF */
  const PDF_IMG = new Map();                 // dataURI -> nome
  const PDF_GS = new Map();                  // alfa -> nome
  function resetPdfImages() { PDF_IMG.clear(); PDF_GS.clear(); }
  function registerPdfImage(href) {
    if (!href || typeof href !== 'string' || href.slice(0, 5) !== 'data:') return null;
    let nm = PDF_IMG.get(href);
    if (!nm) { nm = 'Im' + (PDF_IMG.size + 1); PDF_IMG.set(href, nm); }
    return nm;
  }
  function registerPdfGS(alpha) {
    const a = Math.round(clamp01(alpha) * 100) / 100;
    let nm = PDF_GS.get(a);
    if (!nm) { nm = 'GSa' + (PDF_GS.size + 1); PDF_GS.set(a, nm); }
    return nm;
  }

  /* ===================== PdfPen (exportação) ===================== */
  // cor gravada como marcador "{c:rrggbb} rg" — resolvido no buildPDF (RGB ou CMYK)
  function PdfPen(wMm, hMm, offXMm = 0, offYMm = offXMm) {
    const H = hMm * PT, OX = offXMm * PT, OY = offYMm * PT;
    const ops = [];
    const n = v => { const s = (+v).toFixed(2); return s === '-0.00' ? '0' : s.replace(/\.?0+$/, '') || '0'; };
    const X = mm => n(mm * PT + OX);
    const Y = mm => n(H - (mm * PT + OY));
    let curStroke = null, curFill = null, curDash = null, curW = null, LS = 1;
    const setStroke = c => { const k = hex6(c || '#000'); if (k !== curStroke) { ops.push(`{c:${k}} RG`); curStroke = k; } };
    const setFill = c => { const k = hex6(c || '#000'); if (k !== curFill) { ops.push(`{c:${k}} rg`); curFill = k; } };
    const setDash = d => { const k = d ? d.join(',') : ''; if (k !== curDash) { ops.push(d ? `[${d.map(v => n(v * PT)).join(' ')}] 0 d` : '[] 0 d'); curDash = k; } };
    const setW = w => { const v = n((w == null ? 0.2 : w) * PT * LS); if (v !== curW) { ops.push(`${v} w`); curW = v; } };
    const reset = () => { curStroke = curFill = curDash = curW = null; };
    const api = {
      isPdf: true,
      setLineScale(k) { LS = (+k > 0 ? +k : 1); },
      clip(x, y, w, h) { ops.push(`q ${X(x)} ${Y(y + h)} ${n(w * PT)} ${n(h * PT)} re W n`); },
      unclip() { ops.push('Q'); reset(); },
      line(x1, y1, x2, y2, s = {}) {
        setStroke(s.color); setDash(s.dash); setW(s.w);
        if (s.cap) ops.push(`${s.cap === 'round' ? 1 : s.cap === 'square' ? 2 : 0} J`);
        ops.push(`${X(x1)} ${Y(y1)} m ${X(x2)} ${Y(y2)} l S`);
        if (s.cap) ops.push('0 J');
      },
      rect(x, y, w, h, s = {}) {
        const re = `${X(x)} ${Y(y + h)} ${n(w * PT)} ${n(h * PT)} re`;
        if (s.fill) {
          const a = s.fillOpacity != null && s.fillOpacity < 1 ? clamp01(s.fillOpacity) : 1;
          if (a < 1) { ops.push(`q /${registerPdfGS(a)} gs`); curFill = null; setFill(s.fill); ops.push(`${re} f Q`); curFill = null; }
          else { setFill(s.fill); ops.push(`${re} f`); }
        }
        if (s.stroke) { setStroke(s.stroke); setDash(s.dash); setW(s.w); ops.push(`${re} S`); }
      },
      dot(cx, cy, r, s = {}) {                       // ponto = quadradinho (1 op, barato)
        setFill(s.fill || '#000');
        const rr = r * Math.min(1.6, Math.sqrt(LS)), d = n(rr * 2 * PT);
        ops.push(`${X(cx - rr)} ${Y(cy + rr)} ${d} ${d} re f`);
      },
      circle(cx, cy, r, s = {}) {
        const k = 0.5523, rp = r * PT, x = cx * PT + OX, y = H - (cy * PT + OY);
        const c = `${X(cx - r)} ${n(y)} m ` +
          `${n(x - rp)} ${n(y + k * rp)} ${n(x - k * rp)} ${n(y + rp)} ${n(x)} ${n(y + rp)} c ` +
          `${n(x + k * rp)} ${n(y + rp)} ${n(x + rp)} ${n(y + k * rp)} ${n(x + rp)} ${n(y)} c ` +
          `${n(x + rp)} ${n(y - k * rp)} ${n(x + k * rp)} ${n(y - rp)} ${n(x)} ${n(y - rp)} c ` +
          `${n(x - k * rp)} ${n(y - rp)} ${n(x - rp)} ${n(y - k * rp)} ${n(x - rp)} ${n(y)} c`;
        if (s.fill) { setFill(s.fill); ops.push(`${c} f`); }
        if (s.stroke) { setStroke(s.stroke); setDash(null); setW(s.w); ops.push(`${c} S`); }
      },
      poly(pts, s = {}) {
        if (!pts || pts.length < 2) return;
        const d = pts.map((p, i) => `${X(p[0])} ${Y(p[1])} ${i ? 'l' : 'm'}`).join(' ') + (s.close === false ? '' : ' h');
        if (s.fill) { setFill(s.fill); ops.push(`${d} f`); }
        if (s.stroke) { setStroke(s.stroke); setDash(null); setW(s.w); ops.push(`${d} S`); }
      },
      text(str, x, y, s = {}) {
        str = String(str == null ? '' : str);
        if (!str) return;
        const size = s.size || 9;
        const face = faceId(s.family, s.font);
        let tx = x;
        const w = textAdvance(str, size, s.font, s.family) + (s.tracking ? Math.max(0, [...str].length - 1) * s.tracking * PT : 0);
        if (s.align === 'c') tx = x - w / 2 / PT;
        else if (s.align === 'r') tx = x - w / PT;
        const by = y + baselineShift(s.family, s.font, s.baseline) * size / PT;
        const alpha = s.opacity != null && s.opacity < 1 ? clamp01(s.opacity) : 1;
        if (alpha < 1) { ops.push(`q /${registerPdfGS(alpha)} gs`); reset(); }
        setFill(s.color);
        ops.push('BT');
        if (s.tracking) ops.push(`${n(s.tracking * PT)} Tc`);
        ops.push(`/@F:${face} ${n(size)} Tf ${X(tx)} ${Y(by)} Td ${root.EPPdf.textToken(str)} Tj`);
        if (s.tracking) ops.push('0 Tc');
        ops.push('ET');
        if (alpha < 1) { ops.push('Q'); reset(); }
      },
      image(href, x, y, w, h, s = {}) {
        const nm = registerPdfImage(href); if (!nm) return;
        let dx = x, dy = y, dw = w, dh = h, clipBox = false;
        const dim = (s.fit === 'meet' || s.fit === 'cover') ? imageDims(href) : null;
        if (dim && dim.w > 0 && dim.h > 0) {
          const k = s.fit === 'meet' ? Math.min(w / dim.w, h / dim.h) : Math.max(w / dim.w, h / dim.h);
          dw = dim.w * k; dh = dim.h * k; dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
          clipBox = s.fit === 'cover';
        }
        ops.push('q');
        if (s.opacity != null && s.opacity < 1) ops.push(`/${registerPdfGS(s.opacity)} gs`);
        if (clipBox) ops.push(`${X(x)} ${Y(y + h)} ${n(w * PT)} ${n(h * PT)} re W n`);
        ops.push(`${n(dw * PT)} 0 0 ${n(dh * PT)} ${X(dx)} ${Y(dy + dh)} cm /${nm} Do Q`);
        reset();
      },
      art(id, x, y, w, h, s = {}) {
        const it = root.EPArt && root.EPArt.get(id); if (!it || !root.EPSvgArt) return false;
        const k = Math.min(w / it.w, h / it.h), ox = x + (w - it.w * k) / 2, oy = y + (h - it.h * k) / 2;
        const P = (px, py) => `${X(ox + px * k)} ${Y(oy + py * k)}`;
        const op = s.opacity != null ? clamp01(s.opacity) : 1;
        const col = c => (c === 'currentColor' ? (HEX.test(s.color || '') ? s.color : '#000') : c);
        ops.push('q'); reset();
        artShapes(it).forEach(sh => {
          const fill = sh.fill && sh.fill !== 'none' ? col(sh.fill) : null;
          const strk = sh.stroke && sh.stroke !== 'none' && sh.sw > 0 ? col(sh.stroke) : null;
          if (!fill && !strk) return;
          const d = sh.subs.map(sp => sp.segs.map(g => g.op === 'M' ? `${P(g.p[0], g.p[1])} m` : g.op === 'L' ? `${P(g.p[0], g.p[1])} l`
            : `${P(g.p[0], g.p[1])} ${P(g.p[2], g.p[3])} ${P(g.p[4], g.p[5])} c`).join(' ') + (sp.closed ? ' h' : '')).join(' ');
          const a = sh.alpha * op;
          if (a < 0.995) { ops.push(`q /${registerPdfGS(a)} gs`); reset(); }
          if (fill) setFill(fill);
          if (strk) {
            setStroke(strk); setDash(sh.dash ? sh.dash.map(v => v * k) : null);
            ops.push(`${n(sh.sw * k * PT)} w ${sh.cap === 'round' ? 1 : sh.cap === 'square' ? 2 : 0} J ${sh.join === 'round' ? 1 : sh.join === 'bevel' ? 2 : 0} j`); curW = null;
          }
          ops.push(`${d} ${fill && strk ? (sh.evenodd ? 'B*' : 'B') : fill ? (sh.evenodd ? 'f*' : 'f') : 'S'}`);
          if (a < 0.995) { ops.push('Q'); reset(); }
        });
        ops.push('Q'); reset();
        return true;
      },
      rotate(deg, cx, cy) {
        const t = -deg * Math.PI / 180, c = Math.cos(t), si = Math.sin(t);
        const px = cx * PT + OX, py = H - (cy * PT + OY);
        const f = v => (+v).toFixed(5);
        ops.push(`q ${f(c)} ${f(si)} ${f(-si)} ${f(c)} ${f(px - c * px + si * py)} ${f(py - si * px - c * py)} cm`);
      },
      textWidth: penTextWidthMm, fitText: fitTextSize, wrapText: wrapTextLines,
      stream() { return ops.join('\n'); },
    };
    return api;
  }

  /* dimensões (px) de um data: URI, lidas do cabeçalho (PNG, JPEG, GIF, WebP) */
  const _dimCache = new Map();
  function imageDims(href) {
    if (_dimCache.has(href)) return _dimCache.get(href);
    let out = null;
    try {
      const i = href.indexOf(','); const b64 = href.slice(i + 1, i + 1 + 64000);
      const bin = atob(b64.slice(0, b64.length - (b64.length % 4)));
      const u = k => bin.charCodeAt(k);
      const be16 = k => (u(k) << 8) | u(k + 1), be32 = k => ((u(k) << 24) >>> 0) + (u(k + 1) << 16) + (u(k + 2) << 8) + u(k + 3);
      if (bin.slice(1, 4) === 'PNG') out = { w: be32(16), h: be32(20) };
      else if (bin.slice(0, 3) === 'GIF') out = { w: u(6) | (u(7) << 8), h: u(8) | (u(9) << 8) };
      else if (u(0) === 0xFF && u(1) === 0xD8) {
        let k = 2;
        while (k < bin.length - 9) {
          if (u(k) !== 0xFF) { k++; continue; }
          const m = u(k + 1);
          if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { out = { h: be16(k + 5), w: be16(k + 7) }; break; }
          k += 2 + be16(k + 2);
        }
      } else if (bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WEBP') {
        const t = bin.slice(12, 16);
        if (t === 'VP8X') out = { w: 1 + (u(24) | (u(25) << 8) | (u(26) << 16)), h: 1 + (u(27) | (u(28) << 8) | (u(29) << 16)) };
        else if (t === 'VP8L') { const b0 = u(21), b1 = u(22), b2 = u(23), b3 = u(24); out = { w: 1 + (((b1 & 0x3F) << 8) | b0), h: 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) }; }
        else if (t === 'VP8 ') out = { w: (u(26) | (u(27) << 8)) & 0x3FFF, h: (u(28) | (u(29) << 8)) & 0x3FFF };
      }
    } catch (e) { out = null; }
    _dimCache.set(href, out);
    return out;
  }

  /* JPEG pronto para o PDF: bytes originais + dimensões/componentes (do SOF) */
  function jpegPassthrough(href) {
    if (!/^data:image\/jpeg;base64,/i.test(href)) return null;
    try {
      const bytes = b64bytes(href.slice(href.indexOf(',') + 1));
      if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
      let k = 2;
      while (k < bytes.length - 9) {
        if (bytes[k] !== 0xFF) { k++; continue; }
        const m = bytes[k + 1];
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
          const h = (bytes[k + 5] << 8) | bytes[k + 6], w = (bytes[k + 7] << 8) | bytes[k + 8], comps = bytes[k + 9];
          if (!w || !h || ![1, 3, 4].includes(comps)) return null;
          return { w, h, comps, bytes };
        }
        if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { k += 2; continue; }
        k += 2 + ((bytes[k + 2] << 8) | bytes[k + 3]);
      }
    } catch (e) {}
    return null;
  }

  async function decodeImageRGBA(dataURI) {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = dataURI; });
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('dim');
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    return { w, h, rgba: cx.getImageData(0, 0, w, h).data };
  }

  async function deflate(bytes) {
    try {
      if (typeof CompressionStream === 'undefined') return null;
      const cs = new CompressionStream('deflate');
      const blob = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).blob();
      return new Uint8Array(await blob.arrayBuffer());
    } catch (e) { return null; }
  }

  /* ===================== buildPDF =====================
   * pages = [{ stream, wPt, hPt, trimBox?, bleedBox? }]
   * opts  = { color: 'rgb'|'cmyk', title, inkSave: 0..0.6, deflate }
   *   rgb  → PDF 1.4 para imprimir em casa (fontes incorporadas)
   *   cmyk → PDF/X-4: cores e imagens convertidas pelo FOGRA39, OutputIntent,
   *          TrimBox/BleedBox, XMP. É o arquivo para a gráfica.
   */
  async function buildPDF(pages, opts = {}) {
    const cmyk = opts.color === 'cmyk';
    const zip = opts.deflate || deflate;
    const ink = clamp01(opts.inkSave || 0);
    const cm = cmyk ? await loadCmyk() : null;
    const f3 = v => { const s = v.toFixed(3); return s.replace(/\.?0+$/, '') || '0'; };
    const colorOp = (hex, op) => {
      let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      if (ink) { r += (255 - r) * ink; g += (255 - g) * ink; b += (255 - b) * ink; }
      if (!cm) return `${f3(r / 255)} ${f3(g / 255)} ${f3(b / 255)} ${op}`;
      const c = cm.rgbToCmyk(Math.round(r), Math.round(g), Math.round(b));
      return `${c.map(f3).join(' ')} ${op === 'rg' ? 'k' : 'K'}`;
    };
    const colorCache = new Map();
    const faces = new Set();
    let usesAlpha = PDF_GS.size > 0;
    const out = pages.map(pg => {
      const content = String(pg.stream).replace(/\{c:([0-9a-f]{6})\} (rg|RG)/g, (m, hex, op) => {
        const key = hex + op; let v = colorCache.get(key);
        if (!v) { v = colorOp(hex, op); colorCache.set(key, v); }
        return v;
      });
      content.replace(/\/@F:([A-Za-z0-9_\-]+)/g, (m, id) => { faces.add(id); return m; });
      return { content, wPt: pg.wPt, hPt: pg.hPt, trimBox: pg.trimBox, bleedBox: pg.bleedBox };
    });
    await loadFaces([...faces]);

    // imagens
    const images = [];
    for (const [href, nm] of PDF_IMG.entries()) {
      const jpg = jpegPassthrough(href);
      if (jpg && (!cm || jpg.comps === 4 || jpg.comps === 1) && !ink) {
        // JPEG entra como está (DCT): mesma qualidade e ~10× menor que cru
        const cs = jpg.comps === 1 ? '/DeviceGray' : jpg.comps === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB';
        images.push({ name: nm, dict: `<< /Type /XObject /Subtype /Image /Width ${jpg.w} /Height ${jpg.h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode >>`, bytes: jpg.bytes });
        continue;
      }
      let dec = null;
      try { dec = await decodeImageRGBA(href); } catch (e) { continue; }
      const { w, h, rgba } = dec, px = w * h;
      let hasA = false;
      const alpha = new Uint8Array(px);
      for (let i = 0; i < px; i++) { alpha[i] = rgba[i * 4 + 3]; if (alpha[i] !== 255) hasA = true; }
      if (hasA) {       // cor "pura" por baixo da máscara (sem compor com branco)
        for (let i = 0; i < px; i++) rgba[i * 4 + 3] = 255;
        usesAlpha = true;
      }
      if (ink) for (let i = 0; i < px * 4; i++) if ((i & 3) !== 3) rgba[i] += (255 - rgba[i]) * ink;
      let smask = null;
      if (hasA) {
        const z = await zip(alpha);
        smask = { dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceGray /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''} >>`, bytes: z || alpha };
      }
      if (cm) {
        const cmykPx = cm.rgbaToCmyk(rgba, w, h);
        if (jpg || px > 250000) {   // foto → JPEG CMYK (qualidade alta)
          const bytes = root.EPJpeg.encode(cmykPx, w, h, 4, 92);
          images.push({ name: nm, dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /DCTDecode /Decode [1 0 1 0 1 0 1 0] >>`, bytes, smask });
        } else {
          const z = await zip(cmykPx);
          images.push({ name: nm, dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceCMYK /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''} >>`, bytes: z || cmykPx, smask });
        }
      } else {
        const rgb = new Uint8Array(px * 3);
        for (let i = 0; i < px; i++) { rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2]; }
        if (jpg) {
          const bytes = root.EPJpeg.encode(rgb, w, h, 3, 92);
          images.push({ name: nm, dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode >>`, bytes, smask });
        } else {
          const z = await zip(rgb);
          images.push({ name: nm, dict: `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8${z ? ' /Filter /FlateDecode' : ''} >>`, bytes: z || rgb, smask });
        }
      }
    }
    const gs = [...PDF_GS.entries()].map(([alpha, name]) => ({ name, alpha }));
    out.forEach(p => { p.transparency = usesAlpha; });
    const bytes = await root.EPPdf.build({
      pages: out, images, gs, deflate: zip,
      fonts: { resolve: id => parsedFonts[id] },
      meta: { title: opts.title || 'Documento', creator: opts.creator || 'Esmeralda Paper' },
      pdfx: cm ? { icc: cm.icc, identifier: 'FOGRA39', info: 'Coated FOGRA39 (ISO 12647-2:2004)', registry: 'http://www.color.org' } : null,
    });
    PDF_IMG.clear(); PDF_GS.clear();
    return bytes;
  }

  /* ===================== folha montada =====================
   * sheet = { slots: [{ src, ox, oy, sc, rot?: 180, clip?: {x,y,w,h} }], marks: [[x1,y1,x2,y2]…],
   *           foldX?, foldY?, trimBox?: {x,y,w,h}, bleedBox?: {x,y,w,h} }   (mm, origem em cima)
   * draw(pen, slot) desenha a página do slot com origem no canto do corte.
   * Devolve a página pronta para buildPDF.
   */
  function composeSheetPdf(o) {
    const { sheet, sheetW, sheetH, W, H } = o;
    const f = v => (+v).toFixed(3);
    let content = '';
    if (o.bg) { const bg = PdfPen(sheetW, sheetH); bg.rect(0, 0, sheetW, sheetH, { fill: o.bg }); content += bg.stream(); }
    for (const slot of sheet.slots) {
      const sp = PdfPen(W, H, 0, 0);
      o.draw(sp, slot);
      const sc = slot.sc || 1;
      let body = sp.stream();
      if (slot.clip) {        // recorte do slot (coordenadas da folha)
        const c = slot.clip;
        content += `\nq ${f(c.x * PT)} ${f((sheetH - c.y - c.h) * PT)} ${f(c.w * PT)} ${f(c.h * PT)} re W n`;
      }
      if (slot.rot === 180) {
        const tx = (slot.ox + W * sc) * PT, ty = (sheetH - slot.oy) * PT;
        content += `\nq ${f(-sc)} 0 0 ${f(-sc)} ${f(tx)} ${f(ty)} cm\n${body}\nQ`;
      } else {
        const tx = slot.ox * PT, ty = (sheetH - slot.oy - H * sc) * PT;
        content += `\nq ${f(sc)} 0 0 ${f(sc)} ${f(tx)} ${f(ty)} cm\n${body}\nQ`;
      }
      if (slot.clip) content += '\nQ';
    }
    const deco = PdfPen(sheetW, sheetH);
    // marcas: fio de 0,1 mm (≈0,28 pt) em preto de registro
    (sheet.marks || []).forEach(([x1, y1, x2, y2]) => deco.line(x1, y1, x2, y2, { w: o.markW || 0.1, color: '#000000' }));
    const fd = { w: 0.1, color: '#8a8a8a', dash: [1.2, 1.2] };
    if (sheet.foldX != null && o.foldLines !== false) {
      // linha de dobra/corte só nas margens (fora da arte), como na gráfica
      const top = sheet.foldMarks ? Math.max(0, (sheet.trimBox ? sheet.trimBox.y : 0) - 1) : sheetH;
      if (sheet.foldMarks) { deco.line(sheet.foldX, 0, sheet.foldX, top, fd); deco.line(sheet.foldX, sheetH - top, sheet.foldX, sheetH, fd); }
      else deco.line(sheet.foldX, 0, sheet.foldX, sheetH, fd);
    }
    if (sheet.foldY != null && o.foldLines !== false) deco.line(0, sheet.foldY, sheetW, sheet.foldY, fd);
    content += '\n' + deco.stream();
    const pb = b => b && root.EPPrint ? root.EPPrint.pdfBox(b, sheetH) : null;
    return { stream: content, wPt: sheetW * PT, hPt: sheetH * PT, trimBox: pb(sheet.trimBox), bleedBox: pb(sheet.bleedBox || sheet.trimBox) };
  }

  /* ===================== folha de calibração =====================
   * Confere, antes de imprimir o trabalho de verdade, se a impressora está em
   * 100 % (régua de 100 mm e quadrado de 50 mm), a margem que ela não imprime
   * (faixas de 1 a 8 mm na borda), fios finos, corpo mínimo de texto e a
   * escala de cinza/cores (ganho de ponto, economia de tinta).
   * Desenha numa página W×H (mm) com qualquer caneta.
   */
  function drawCalibration(pen, W, H, o = {}) {
    const ink = '#000000', mid = '#808080';
    const x0 = 15, y0 = 18;
    pen.text(o.title || 'Folha de calibração', x0, y0, { size: 16, font: 'bold', color: ink, baseline: 'top' });
    pen.text('Imprima em escala 100 % e margens "Nenhuma". Meça com uma régua: a linha deve ter 100 mm e o quadrado 50 × 50 mm.', x0, y0 + 9, { size: 8, color: mid, baseline: 'top' });
    // borda: faixas de 1–8 mm mostram até onde a impressora chega
    for (let k = 1; k <= 8; k++) {
      pen.rect(W / 2 - 40 + (k - 1) * 10, 0, 8, k, { fill: ink });
      pen.text(k + '', W / 2 - 36 + (k - 1) * 10, k + 1.5, { size: 5, color: mid, align: 'c', baseline: 'top' });
    }
    pen.text('a faixa mais curta que aparece inteira = margem mínima da impressora (mm)', W / 2, 13, { size: 5.5, color: mid, align: 'c', baseline: 'top' });
    // régua horizontal de 100 mm
    let y = y0 + 22;
    pen.line(x0, y, x0 + 100, y, { w: 0.2, color: ink });
    for (let i = 0; i <= 100; i++) {
      const L = i % 10 === 0 ? 4 : i % 5 === 0 ? 2.6 : 1.4;
      pen.line(x0 + i, y, x0 + i, y + L, { w: 0.1, color: ink });
      if (i % 10 === 0) pen.text(String(i / 10), x0 + i, y + 5, { size: 5, color: ink, align: 'c', baseline: 'top' });
    }
    pen.text('100 mm', x0 + 104, y + 2, { size: 7, color: ink, baseline: 'middle' });
    // régua vertical de 100 mm
    const vx = W - 22;
    pen.line(vx, y, vx, y + 100, { w: 0.2, color: ink });
    for (let i = 0; i <= 100; i++) {
      const L = i % 10 === 0 ? 4 : i % 5 === 0 ? 2.6 : 1.4;
      pen.line(vx, y + i, vx - L, y + i, { w: 0.1, color: ink });
      if (i % 10 === 0) pen.text(String(i / 10), vx + 1.5, y + i, { size: 5, color: ink, baseline: 'middle' });
    }
    // quadrado e círculo de 50 mm
    y += 14;
    pen.rect(x0, y, 50, 50, { stroke: ink, w: 0.2 });
    pen.line(x0, y, x0 + 50, y + 50, { w: 0.1, color: mid }); pen.line(x0 + 50, y, x0, y + 50, { w: 0.1, color: mid });
    pen.circle(x0 + 80, y + 25, 25, { stroke: ink, w: 0.2 });
    pen.text('50 × 50 mm', x0 + 25, y + 53, { size: 6, color: mid, align: 'c', baseline: 'top' });
    pen.text('Ø 50 mm (deve ser redondo)', x0 + 80, y + 53, { size: 6, color: mid, align: 'c', baseline: 'top' });
    // fios
    y += 64;
    [0.05, 0.1, 0.15, 0.25, 0.35, 0.5, 1].forEach((w, i) => {
      pen.line(x0, y + i * 4, x0 + 60, y + i * 4, { w, color: ink });
      pen.text(w.toString().replace('.', ',') + ' mm', x0 + 63, y + i * 4, { size: 5.5, color: mid, baseline: 'middle' });
    });
    // corpo de texto
    [4, 5, 6, 7, 8, 10, 12].forEach((sz, i) => pen.text(sz + ' pt — Aa Bb Çç 0123', x0 + 90, y + i * 4, { size: sz, color: ink, baseline: 'middle' }));
    // escala de cinza (preto só) e cores
    y += 34;
    pen.text('Escala de cinza (a cada 10 %) — todos os tons devem ser distinguíveis', x0, y, { size: 6.5, color: ink, baseline: 'top' });
    const cw = Math.min(16, (W - 2 * x0 - 10) / 11);
    for (let i = 0; i <= 10; i++) {
      const v = Math.round(255 * (1 - i / 10)).toString(16).padStart(2, '0');
      pen.rect(x0 + i * cw, y + 5, cw, 12, { fill: '#' + v + v + v, stroke: '#bbbbbb', w: 0.1 });
      pen.text(i * 10 + '%', x0 + i * cw + cw / 2, y + 19, { size: 5, color: mid, align: 'c', baseline: 'top' });
    }
    y += 27;
    const sw = [['#00a0e9', 'ciano'], ['#e4007f', 'magenta'], ['#fff100', 'amarelo'], ['#000000', 'preto'], ['#e60012', 'vermelho'], ['#009944', 'verde'], ['#1d2088', 'azul'], ['#8a6d3b', 'pele / terra'], ['#35594d', 'esmeralda']];
    sw.forEach(([c, n], i) => {
      pen.rect(x0 + i * 20, y, 18, 14, { fill: c });
      pen.text(n, x0 + i * 20 + 9, y + 16, { size: 5, color: mid, align: 'c', baseline: 'top' });
    });
    if (o.footer) pen.text(o.footer, x0, H - 12, { size: 6, color: mid, baseline: 'middle' });
  }
  // PDF A4 de calibração, pronto para baixar (qualquer ferramenta)
  async function calibrationPdf(o = {}) {
    const W = 210, H = 297;
    const pen = PdfPen(W, H);
    pen.rect(0, 0, W, H, { fill: '#ffffff' });
    drawCalibration(pen, W, H, { title: 'Folha de calibração — Esmeralda Paper', footer: o.footer || (o.color === 'cmyk' ? 'PDF/X-4 · CMYK FOGRA39' : 'PDF RGB (impressora de casa)') });
    return buildPDF([{ stream: pen.stream(), wPt: W * PT, hPt: H * PT }], { color: o.color, title: 'Folha de calibração' });
  }

  const EPPen = { PT, SvgPen, composeSheetPdf, drawCalibration, calibrationPdf, PdfPen, buildPDF, resetPdfImages, imageDims, hexRGB, esc, penTextWidthMm, fitTextSize, wrapTextLines,
    textAdvance, fontCss, faceId, baselineShift, embeddedFontStyle, loadFaces, loadCmyk, families: () => M().families };
  root.EPPen = EPPen;
  ['SvgPen', 'PdfPen', 'buildPDF', 'composeSheetPdf', 'drawCalibration', 'resetPdfImages', 'imageDims', 'hexRGB', 'esc', 'penTextWidthMm', 'fitTextSize', 'wrapTextLines', 'fontCss', 'embeddedFontStyle']
    .forEach(k => { if (!(k in root)) root[k] = EPPen[k]; });
  if (typeof module !== 'undefined' && module.exports) module.exports = EPPen;
})(typeof window !== 'undefined' ? window : globalThis);
