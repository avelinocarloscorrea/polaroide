/* packages/core/ttf.js — EPTtf
 *
 * Leitura de fontes TrueType (sfnt com contornos glyf) e geração de
 * subconjunto para incorporar no PDF como CIDFontType2 (Identity-H).
 * Serve ao navegador (exportação) e ao Node (build das fontes e testes).
 *
 *   const f = EPTtf.parse(bytes)
 *   f.gid(codepoint)            -> id do glifo (0 = .notdef)
 *   f.advance(gid)              -> avanço em unidades da fonte
 *   f.widthPer1000(codepoint)   -> largura em milésimos de em
 *   EPTtf.subset(f, gidSet)     -> Uint8Array com a fonte reduzida
 *   EPTtf.woffToSfnt(bytes, inflateSync) -> Uint8Array (só build/Node)
 */
(function (root) {
  "use strict";

  function reader(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    return {
      u8, dv,
      u16: o => dv.getUint16(o), i16: o => dv.getInt16(o),
      u32: o => dv.getUint32(o), i32: o => dv.getInt32(o),
      tag: o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]),
    };
  }

  function parse(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const r = reader(u8);
    const flavor = r.u32(0);
    if (flavor !== 0x00010000 && r.tag(0) !== 'true') throw new Error('EPTtf: só TrueType (glyf) é suportado');
    const numTables = r.u16(4);
    const tables = {};
    for (let i = 0; i < numTables; i++) {
      const o = 12 + i * 16;
      tables[r.tag(o)] = { offset: r.u32(o + 8), length: r.u32(o + 12) };
    }
    const need = ['head', 'hhea', 'hmtx', 'maxp', 'loca', 'glyf', 'cmap'];
    need.forEach(t => { if (!tables[t]) throw new Error('EPTtf: tabela ausente ' + t); });

    const head = tables.head.offset;
    const unitsPerEm = r.u16(head + 18);
    const bbox = [r.i16(head + 36), r.i16(head + 38), r.i16(head + 40), r.i16(head + 42)];
    const indexToLocFormat = r.i16(head + 50);
    const numGlyphs = r.u16(tables.maxp.offset + 4);
    const hhea = tables.hhea.offset;
    const ascent = r.i16(hhea + 4), descent = r.i16(hhea + 6);
    const numHMetrics = r.u16(hhea + 34);

    // avanços
    const adv = new Uint16Array(numGlyphs);
    let last = 0;
    for (let g = 0; g < numGlyphs; g++) {
      if (g < numHMetrics) { last = r.u16(tables.hmtx.offset + g * 4); }
      adv[g] = last;
    }
    // loca
    const loca = new Uint32Array(numGlyphs + 1);
    for (let g = 0; g <= numGlyphs; g++) {
      loca[g] = indexToLocFormat === 0 ? r.u16(tables.loca.offset + g * 2) * 2 : r.u32(tables.loca.offset + g * 4);
    }
    // cmap: prefere formato 12 (3,10), senão 4 (3,1)
    const cmap = new Map();
    const cm = tables.cmap.offset, nSub = r.u16(cm + 2);
    let best = null;
    for (let i = 0; i < nSub; i++) {
      const pid = r.u16(cm + 4 + i * 8), eid = r.u16(cm + 6 + i * 8), off = r.u32(cm + 8 + i * 8);
      const fmt = r.u16(cm + off);
      const score = (fmt === 12 ? 4 : fmt === 4 ? 2 : 0) + ((pid === 3 && (eid === 10 || eid === 1)) || pid === 0 ? 1 : 0);
      if ((fmt === 4 || fmt === 12) && (!best || score > best.score)) best = { off: cm + off, fmt, score };
    }
    if (best && best.fmt === 4) {
      const o = best.off, segX2 = r.u16(o + 6), seg = segX2 / 2;
      const ends = o + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < seg; s++) {
        const end = r.u16(ends + s * 2), start = r.u16(starts + s * 2), delta = r.i16(deltas + s * 2), ro = r.u16(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xFFFF; c++) {
          let g;
          if (ro === 0) g = (c + delta) & 0xFFFF;
          else {
            const gi = ranges + s * 2 + ro + (c - start) * 2;
            g = r.u16(gi); if (g) g = (g + delta) & 0xFFFF;
          }
          if (g) cmap.set(c, g);
        }
      }
    } else if (best && best.fmt === 12) {
      const o = best.off, n = r.u32(o + 12);
      for (let i = 0; i < n; i++) {
        const a = r.u32(o + 16 + i * 12), b = r.u32(o + 20 + i * 12), g0 = r.u32(o + 24 + i * 12);
        for (let c = a; c <= b; c++) cmap.set(c, g0 + (c - a));
      }
    }
    // OS/2 / post / name
    let capHeight = Math.round(ascent * 0.7), weight = 400, italicAngle = 0, fixed = false;
    if (tables['OS/2']) {
      const o = tables['OS/2'].offset, ver = r.u16(o);
      weight = r.u16(o + 4);
      if (ver >= 2 && tables['OS/2'].length >= 90) capHeight = r.i16(o + 88);
    }
    if (tables.post) {
      const o = tables.post.offset;
      italicAngle = r.i32(o + 4) / 65536;
      fixed = r.u32(o + 12) !== 0;
    }
    let psName = 'Font';
    if (tables.name) {
      const o = tables.name.offset, count = r.u16(o + 2), strOff = o + r.u16(o + 4);
      for (let i = 0; i < count; i++) {
        const p = o + 6 + i * 12;
        if (r.u16(p + 6) !== 6) continue;
        const pid = r.u16(p), len = r.u16(p + 8), so = strOff + r.u16(p + 10);
        let s = '';
        if (pid === 3 || pid === 0) for (let k = 0; k < len; k += 2) s += String.fromCharCode(r.u16(so + k));
        else for (let k = 0; k < len; k++) s += String.fromCharCode(u8[so + k]);
        if (s) { psName = s; break; }
      }
    }
    psName = psName.replace(/[^A-Za-z0-9\-]/g, '') || 'Font';

    const font = {
      bytes: u8, tables, unitsPerEm, bbox, ascent, descent, capHeight, weight, italicAngle, fixed,
      numGlyphs, adv, loca, cmap, psName,
      gid(cp) { return cmap.get(cp) || 0; },
      advance(g) { return adv[g] || 0; },
      widthPer1000(cp) { return Math.round((adv[cmap.get(cp) || 0] || 0) * 1000 / unitsPerEm); },
      // componentes de glifos compostos (para incluir no subconjunto)
      components(g) {
        const s = loca[g], e = loca[g + 1];
        if (e <= s) return [];
        const base = tables.glyf.offset + s;
        if (r.i16(base) >= 0) return [];
        const out = [];
        let p = base + 10, more = true;
        while (more) {
          const flags = r.u16(p), cg = r.u16(p + 2);
          out.push(cg);
          p += 4 + ((flags & 1) ? 4 : 2);
          if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
          more = !!(flags & 0x20);
        }
        return out;
      },
    };
    return font;
  }

  function pad4(n) { return (n + 3) & ~3; }
  function checksum(u8, off, len) {
    let sum = 0;
    const dv = new DataView(u8.buffer, u8.byteOffset);
    for (let i = 0; i < len; i += 4) {
      const b0 = u8[off + i] || 0, b1 = i + 1 < len ? u8[off + i + 1] : 0, b2 = i + 2 < len ? u8[off + i + 2] : 0, b3 = i + 3 < len ? u8[off + i + 3] : 0;
      sum = (sum + ((b0 << 24) >>> 0) + (b1 << 16) + (b2 << 8) + b3) >>> 0;
    }
    return sum >>> 0;
  }
  // monta um sfnt a partir de {tag: Uint8Array}
  function buildSfnt(tabs) {
    const tags = Object.keys(tabs).sort();
    const n = tags.length;
    let size = 12 + 16 * n;
    tags.forEach(t => { size += pad4(tabs[t].length); });
    const out = new Uint8Array(size);
    const dv = new DataView(out.buffer);
    let es = 0; while ((1 << (es + 1)) <= n) es++;
    dv.setUint32(0, 0x00010000); dv.setUint16(4, n);
    dv.setUint16(6, (1 << es) * 16); dv.setUint16(8, es); dv.setUint16(10, n * 16 - (1 << es) * 16);
    let off = 12 + 16 * n, headOff = -1;
    tags.forEach((t, i) => {
      const d = tabs[t], p = 12 + i * 16;
      for (let k = 0; k < 4; k++) out[p + k] = t.charCodeAt(k);
      out.set(d, off);
      if (t === 'head') { headOff = off; out[off + 8] = out[off + 9] = out[off + 10] = out[off + 11] = 0; }
      dv.setUint32(p + 4, checksum(out, off, d.length));
      dv.setUint32(p + 8, off); dv.setUint32(p + 12, d.length);
      off += pad4(d.length);
    });
    if (headOff >= 0) dv.setUint32(headOff + 8, (0xB1B0AFBA - checksum(out, 0, out.length)) >>> 0);
    return out;
  }

  // subconjunto: mantém a numeração dos glifos (CIDToGIDMap Identity) e zera
  // os contornos dos que não são usados. Inclui componentes de compostos.
  function subset(font, gids) {
    const keep = new Set([0]);
    const stack = [...gids];
    while (stack.length) {
      const g = stack.pop();
      if (g == null || keep.has(g) || g >= font.numGlyphs) continue;
      keep.add(g);
      font.components(g).forEach(c => { if (!keep.has(c)) stack.push(c); });
    }
    const glyfOff = font.tables.glyf.offset, src = font.bytes;
    let total = 0;
    for (let g = 0; g < font.numGlyphs; g++) if (keep.has(g)) total += pad4(font.loca[g + 1] - font.loca[g]);
    const glyf = new Uint8Array(total || 1);
    const loca = new Uint8Array((font.numGlyphs + 1) * 4);
    const ldv = new DataView(loca.buffer);
    let p = 0;
    for (let g = 0; g < font.numGlyphs; g++) {
      ldv.setUint32(g * 4, p);
      if (keep.has(g)) {
        const s = font.loca[g], e = font.loca[g + 1];
        if (e > s) { glyf.set(src.subarray(glyfOff + s, glyfOff + e), p); p += pad4(e - s); }
      }
    }
    ldv.setUint32(font.numGlyphs * 4, p);
    const tab = t => Uint8Array.prototype.slice.call(src, font.tables[t].offset, font.tables[t].offset + font.tables[t].length);
    const head = tab('head');
    new DataView(head.buffer, head.byteOffset).setInt16(50, 1);          // loca longa
    const out = { head, hhea: tab('hhea'), hmtx: tab('hmtx'), maxp: tab('maxp'), loca, glyf: glyf.subarray(0, Math.max(1, p)) };
    ['cvt ', 'fpgm', 'prep', 'OS/2', 'post', 'cmap', 'name'].forEach(t => { if (font.tables[t]) out[t] = tab(t); });
    return buildSfnt(out);
  }

  // WOFF 1.0 -> sfnt (inflateSync injetado; usado no build com zlib do Node)
  function woffToSfnt(bytes, inflateSync) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const r = reader(u8);
    if (r.tag(0) !== 'wOFF') return u8;
    const num = r.u16(12), tabs = {};
    for (let i = 0; i < num; i++) {
      const o = 44 + i * 20;
      const tag = r.tag(o), off = r.u32(o + 4), comp = r.u32(o + 8), orig = r.u32(o + 12);
      const data = u8.subarray(off, off + comp);
      tabs[tag] = comp < orig ? new Uint8Array(inflateSync(data)) : data.slice();
    }
    return buildSfnt(tabs);
  }

  root.EPTtf = { parse, subset, woffToSfnt, buildSfnt };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPTtf;
})(typeof window !== 'undefined' ? window : globalThis);
