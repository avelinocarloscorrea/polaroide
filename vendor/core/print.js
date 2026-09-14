/* packages/core/print.js — EPPrint
 *
 * Matemática de pré-impressão compartilhada pelas ferramentas. Tudo em mm.
 *
 *   PAPERS            formatos ISO 216 (A/B), norte-americanos e brasileiros
 *   boxes()           caixas de corte (trim), sangria (bleed) e segurança (safe)
 *   markSegments()    marcas de corte FORA da sangria (no slug), nunca sobre a arte
 *   nUp()             quantas peças cabem na folha (com medianiz, sangria e giro)
 *   twoUp()           2 por folha: "exato" (100 %) ou "reduzir para caber"
 *   bookletOrder()    ordem do livreto (dobra ao meio) + creep por folha
 *   backRect()        posição do verso no duplex (virar pela borda longa/curta)
 *   BINDING_SPECS     furação padrão (wire-o 3:1 / 2:1, espiral 4:1, discos, fichário)
 *   holes()           furos centralizados na borda, com a distância padrão da borda
 *   bindingSide()     lado da lombada de cada página (espelha no verso)
 *
 * Navegador: window.EPPrint.  Node/teste: require.
 */
(function (root) {
  "use strict";

  const IN = 25.4, PT = 72 / IN;
  const r3 = v => Math.round(v * 1000) / 1000;

  /* ---------------- formatos ---------------- */
  const PAPERS = {
    a3: { w: 297, h: 420, label: 'A3', iso: true }, a4: { w: 210, h: 297, label: 'A4', iso: true },
    a5: { w: 148, h: 210, label: 'A5', iso: true }, a6: { w: 105, h: 148, label: 'A6', iso: true },
    a7: { w: 74, h: 105, label: 'A7', iso: true },
    b4: { w: 250, h: 353, label: 'B4', iso: true }, b5: { w: 176, h: 250, label: 'B5', iso: true },
    b6: { w: 125, h: 176, label: 'B6', iso: true },
    letter: { w: 215.9, h: 279.4, label: 'Carta' }, half: { w: 139.7, h: 215.9, label: 'Meia carta' },
    legal: { w: 215.9, h: 355.6, label: 'Ofício (Legal)' },
    // cadernos brasileiros (medidas comerciais mais comuns)
    universitario: { w: 200, h: 275, label: 'Universitário' },
    brochura: { w: 140, h: 200, label: 'Brochura (1/4)' },
    brochurao: { w: 200, h: 275, label: 'Brochurão' },
    desenho: { w: 275, h: 200, label: 'Cartografia / desenho' },
    // fotográficos
    f10x15: { w: 101.6, h: 152.4, label: '10 × 15 (4 × 6")' },
    f13x18: { w: 127, h: 177.8, label: '13 × 18 (5 × 7")' },
    f10x10: { w: 102, h: 102, label: '10 × 10' },
    f15x21: { w: 152.4, h: 203.2, label: '15 × 21 (6 × 8")' },
  };
  const isFullSheet = (w, h, sw, sh, tol = 0.5) =>
    (Math.abs(w - sw) < tol && Math.abs(h - sh) < tol) || (Math.abs(w - sh) < tol && Math.abs(h - sw) < tol);

  /* ---------------- caixas ---------------- */
  // origem no canto superior-esquerdo da FOLHA (media); a arte começa em `slug`.
  function boxes(W, H, o = {}) {
    const bleed = Math.max(0, +o.bleed || 0), safe = Math.max(0, o.safe == null ? 4 : +o.safe);
    const slug = Math.max(bleed, o.marks ? bleed + markReach(o) : bleed);
    const mediaW = W + 2 * slug, mediaH = H + 2 * slug;
    return {
      media: { x: 0, y: 0, w: mediaW, h: mediaH },
      bleed: { x: slug - bleed, y: slug - bleed, w: W + 2 * bleed, h: H + 2 * bleed },
      trim: { x: slug, y: slug, w: W, h: H },
      safe: { x: slug + safe, y: slug + safe, w: Math.max(0, W - 2 * safe), h: Math.max(0, H - 2 * safe) },
      slug,
    };
  }
  // caixa (mm, origem em cima) → caixa PDF (pt, origem embaixo) [x0 y0 x1 y1]
  function pdfBox(b, mediaH) { return [r3(b.x * PT), r3((mediaH - b.y - b.h) * PT), r3((b.x + b.w) * PT), r3((mediaH - b.y) * PT)]; }

  /* ---------------- marcas de corte ---------------- */
  const MARK = { len: 5, gap: 1, w: 0.1 };      // 0,1 mm ≈ 0,28 pt (fio padrão)
  function markReach(o = {}) { return (o.markGap != null ? o.markGap : MARK.gap) + (o.markLen != null ? o.markLen : MARK.len) + 0.5; }
  // segmentos [x1,y1,x2,y2] das marcas dos 4 cantos de `trim`. Começam além da
  // sangria (offset = sangria + folga) — nunca invadem a área impressa.
  // `inner`: omite os braços que apontariam para dentro de outra peça vizinha.
  function markSegments(trim, o = {}) {
    const bleed = Math.max(0, +o.bleed || 0);
    const off = bleed + (o.markGap != null ? o.markGap : MARK.gap), L = o.markLen != null ? o.markLen : MARK.len;
    const { x, y, w, h } = trim;
    const segs = [];
    const skip = o.skip || {};            // { left, right, top, bottom }: não desenhar desse lado
    [[x, y, -1, -1], [x + w, y, 1, -1], [x, y + h, -1, 1], [x + w, y + h, 1, 1]].forEach(([px, py, dx, dy]) => {
      const horizSide = dx < 0 ? 'left' : 'right', vertSide = dy < 0 ? 'top' : 'bottom';
      if (!skip[horizSide]) segs.push([px + dx * off, py, px + dx * (off + L), py]);   // braço horizontal (marca a linha y)
      if (!skip[vertSide]) segs.push([px, py + dy * off, px, py + dy * (off + L)]);    // braço vertical (marca a linha x)
    });
    return segs;
  }

  /* ---------------- n por folha ---------------- */
  // Maior grade de peças W×H (+sangria de cada lado) numa folha sw×sh, com
  // medianiz `gutter` entre peças e margem não imprimível `margin`.
  // Testa folha em pé/deitada e peça girada. Sem redução: tamanho exato.
  function nUp(sw, sh, W, H, o = {}) {
    const bleed = Math.max(0, +o.bleed || 0), gutter = Math.max(0, o.gutter == null ? 0 : +o.gutter);
    const margin = Math.max(0, o.margin == null ? 5 : +o.margin);
    const reach = o.marks ? markReach(o) : 0;
    let best = null;
    const tries = [];
    [[sw, sh], [sh, sw]].forEach(([fw, fh]) => [[W, H, false], [H, W, true]].forEach(([pw, ph, rot]) => tries.push({ fw, fh, pw, ph, rot })));
    for (const t of tries) {
      if (o.lockSheet && t.fw !== sw) continue;
      if (o.noRotate && t.rot) continue;
      // cada peça ocupa pw+2·bleed; entre peças vizinhas, medianiz (≥ 2·bleed se houver sangria
      // própria, a menos que a medianiz seja 0 e as peças compartilhem a linha de corte)
      const cellW = t.pw + 2 * bleed, cellH = t.ph + 2 * bleed;
      const availW = t.fw - 2 * Math.max(margin, reach), availH = t.fh - 2 * Math.max(margin, reach);
      const cols = Math.floor((availW + gutter) / (cellW + gutter) + 1e-9);
      const rows = Math.floor((availH + gutter) / (cellH + gutter) + 1e-9);
      if (cols < 1 || rows < 1) continue;
      const count = cols * rows;
      const usedW = cols * cellW + (cols - 1) * gutter, usedH = rows * cellH + (rows - 1) * gutter;
      const waste = t.fw * t.fh - count * t.pw * t.ph;
      const cand = { count, cols, rows, sheetW: t.fw, sheetH: t.fh, pieceW: t.pw, pieceH: t.ph, rotated: t.rot, usedW, usedH, waste };
      if (!best || count > best.count || (count === best.count && !t.rot && best.rotated) ||
          (count === best.count && t.rot === best.rotated && t.fw === sw && best.sheetW !== sw)) best = cand;
    }
    if (!best) return { count: 0, cols: 0, rows: 0, slots: [] };
    const ox = (best.sheetW - best.usedW) / 2 + bleed, oy = (best.sheetH - best.usedH) / 2 + bleed;
    best.slots = [];
    for (let r = 0; r < best.rows; r++) for (let c = 0; c < best.cols; c++)
      best.slots.push({ x: r3(ox + c * (best.pieceW + 2 * bleed + gutter)), y: r3(oy + r * (best.pieceH + 2 * bleed + gutter)), w: best.pieceW, h: best.pieceH, rotated: best.rotated, col: c, row: r });
    best.efficiency = r3(best.count * best.pieceW * best.pieceH / (best.sheetW * best.sheetH));
    return best;
  }

  // 2 páginas por folha lado a lado (ou empilhadas, se a página for deitada).
  // fit: 'exact' (100 %, nunca reduz — A5 sai 148 × 210) | 'shrink' (reduz só se não couber
  // com a margem não imprimível da impressora).
  function twoUp(sw, sh, W, H, o = {}) {
    const portrait = H >= W;
    const fw = portrait ? Math.max(sw, sh) : Math.min(sw, sh), fh = portrait ? Math.min(sw, sh) : Math.max(sw, sh);
    const cols = portrait ? 2 : 1, rows = portrait ? 1 : 2;
    const margin = Math.max(0, o.margin == null ? 0 : +o.margin);
    let sc = 1;
    if (o.fit === 'shrink') sc = Math.min(1, (fw - 2 * margin) / (cols * W), (fh - 2 * margin) / (rows * H));
    const pw = W * sc, ph = H * sc, bw = cols * pw, bh = rows * ph;
    const overflow = bw > fw + 0.01 || bh > fh + 0.01;
    const bx = (fw - bw) / 2, by = (fh - bh) / 2;
    const slots = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: r3(bx + c * pw), y: r3(by + r * ph), w: pw, h: ph, sc });
    return { sheetW: fw, sheetH: fh, cols, rows, sc: r3(sc), slots, block: { x: bx, y: by, w: bw, h: bh },
      foldX: cols === 2 ? fw / 2 : null, foldY: rows === 2 ? fh / 2 : null, overflow };
  }

  /* ---------------- livreto ---------------- */
  // Ordem de montagem para dobra ao meio: Np múltiplo de 4, cada folha tem
  // frente [última, primeira] e verso [segunda, penúltima].
  // creep: páginas das folhas internas avançam para fora da dobra ao serem
  // aparadas; compensamos deslocando a arte para a dobra `shift` mm
  // (folha externa = 0; cresce ~espessura do papel por folha).
  function bookletOrder(nPages, o = {}) {
    const Np = Math.max(4, Math.ceil(nPages / 4) * 4), sheets = Np / 4;
    const caliper = Math.max(0, +o.caliperMm || 0);
    const out = [];
    for (let k = 0; k < sheets; k++) {
      const shift = r3(caliper * k);
      const pg = i => (i < nPages ? i : null);
      out.push({ sheet: k, side: 'front', left: pg(Np - 1 - 2 * k), right: pg(2 * k), shift });
      out.push({ sheet: k, side: 'back', left: pg(2 * k + 1), right: pg(Np - 2 - 2 * k), shift });
    }
    return { pages: Np, blanks: Np - nPages, sheets, sides: out };
  }

  /* ---------------- duplex ---------------- */
  // Onde um retângulo da FRENTE aparece no VERSO (coordenadas do verso no PDF).
  // flip: 'long' (virar pela borda longa) | 'short' (borda curta).
  // A borda de virada vira o eixo do espelho: se ela é vertical na página do
  // PDF, espelha em x; se é horizontal, em y.
  function backRect(r, sheetW, sheetH, flip = 'long') {
    const verticalEdge = (flip === 'long') === (sheetH >= sheetW);
    return verticalEdge ? { x: r3(sheetW - r.x - r.w), y: r.y, w: r.w, h: r.h } : { x: r.x, y: r3(sheetH - r.y - r.h), w: r.w, h: r.h };
  }
  const duplexAxis = (sheetW, sheetH, flip = 'long') => ((flip === 'long') === (sheetH >= sheetW) ? 'x' : 'y');

  /* ---------------- encadernação e furação ---------------- */
  // Medidas padrão de mercado. edge = distância da borda ao CENTRO do furo.
  const BINDING_SPECS = {
    wireo31: { label: 'Wire-o 3:1', pitch: IN / 3, shape: 'rect', hw: 4, hh: 4, edge: 5, end: 4 },
    wireo21: { label: 'Wire-o 2:1', pitch: IN / 2, shape: 'rect', hw: 5, hh: 6.5, edge: 6.5, end: 5 },
    coil41: { label: 'Espiral 4:1', pitch: IN / 4, shape: 'circle', r: 2, edge: 5, end: 4 },
    coil5mm: { label: 'Espiral passo 5 mm', pitch: 5, shape: 'circle', r: 1.75, edge: 5, end: 4 },
    disc: { label: 'Discos', pitch: IN * 0.75 / 1.5, shape: 'disc', r: 2.6, edge: 7, fixed: 'disc' },
    ring2: { label: 'Fichário 2 furos (ISO 838)', shape: 'circle', r: 3, edge: 12, fixed: [-40, 40] },
    ring4: { label: 'Fichário 4 furos (ISO 838)', shape: 'circle', r: 3, edge: 12, fixed: [-120, -40, 40, 120] },
    ring6: { label: 'Fichário 6 furos (A5/pessoal)', shape: 'circle', r: 2.75, edge: 7, fixed: [-50.5, -31.5, -12.5, 12.5, 31.5, 50.5] },
  };
  // margem mínima de lombada para o conteúdo não encostar no furo (segurança 3 mm)
  function bindingMargin(specId, safe = 3) {
    const s = BINDING_SPECS[specId]; if (!s) return 0;
    const half = s.shape === 'rect' ? s.hw / 2 : s.r;
    return r3(s.edge + half + safe);
  }
  // furos ao longo de uma borda de comprimento `len` (mm). Centralizados: a
  // sobra fica igual nas duas pontas. Retorna posições ao longo da borda (t)
  // e a distância do centro à borda (edge).
  function holes(specId, len) {
    const s = BINDING_SPECS[specId]; if (!s) return [];
    let ts;
    if (Array.isArray(s.fixed)) ts = s.fixed.map(v => len / 2 + v).filter(t => t > s.r + 2 && t < len - s.r - 2);
    else if (s.fixed === 'disc') {
      // discos: ~1 furo a cada 1,5 cm para A5 (11 furos em 210 mm), centralizado
      const n = Math.max(3, Math.round((len - 12) / 19.4) + 1), p = (len - 24) / (n - 1);
      ts = Array.from({ length: n }, (_, i) => 12 + i * p);
    } else {
      const n = Math.floor((len - 2 * (s.end + (s.shape === 'rect' ? s.hh / 2 : s.r))) / s.pitch) + 1;
      const span = (n - 1) * s.pitch, t0 = (len - span) / 2;
      ts = Array.from({ length: Math.max(0, n) }, (_, i) => t0 + i * s.pitch);
    }
    return ts.map(t => ({ t: r3(t), edge: s.edge, shape: s.shape, r: s.r, w: s.hw, h: s.hh }));
  }
  // lado da lombada de uma página (índice 0 = primeira página, recto).
  // bindEdge: 'left' | 'top' (calendário de parede) | 'right' (leitura da direita p/ esquerda)
  // duplex: frente e verso na mesma folha → no verso a lombada troca de lado.
  function bindingSide(pageIndex, o = {}) {
    const edge = o.bindEdge || 'left';
    if (edge === 'top') return (o.duplex && pageIndex % 2 === 1 && o.flip === 'long') ? 'bottom' : 'top';
    const isBack = !!o.duplex && pageIndex % 2 === 1;
    if (!isBack) return edge;
    return edge === 'left' ? 'right' : 'left';
  }

  /* ---------------- resolução de imagem ---------------- */
  // DPI efetivo de uma imagem de wPx × hPx impressa em wMm × hMm (o menor dos dois eixos)
  function effectiveDpi(wPx, hPx, wMm, hMm) {
    if (!wPx || !hPx || !wMm || !hMm) return 0;
    return Math.round(Math.min(wPx / (wMm / IN), hPx / (hMm / IN)));
  }
  const dpiLevel = dpi => (dpi >= 300 ? 'ok' : dpi >= 200 ? 'warn' : 'bad');

  /* ---------------- unidades ---------------- */
  const units = { mmToPt: v => v * PT, ptToMm: v => v / PT, mmToIn: v => v / IN, inToMm: v => v * IN, mmToPx: (v, dpi) => v / IN * dpi };

  const api = { PT, IN, PAPERS, MARK, isFullSheet, boxes, pdfBox, markReach, markSegments, nUp, twoUp, bookletOrder,
    backRect, duplexAxis, BINDING_SPECS, bindingMargin, holes, bindingSide, effectiveDpi, dpiLevel, units };
  root.EPPrint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
