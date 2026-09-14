/* packages/core/color.js — EPColor
 *
 * Conversão de cor para impressão, 100% no cliente:
 *   - sRGB (tela) -> Lab D50 (espaço de conexão ICC)
 *   - Lab -> CMYK pelo perfil de saída ICC (tabela B2A0 "mft2" — perceptual)
 *   - tabela 3D RGB->CMYK pré-calculada (33³) para converter fotos rápido
 *   - cinzas neutros (texto, linhas) só no preto (K), sem "preto de 4 cores"
 *   - modo economia de tinta e compensação de ganho de ponto (gamma)
 *
 *   const cm = EPColor.createConverter(iccBytes)
 *   cm.hexToCmyk('#33403b')        -> [c,m,y,k] 0..1
 *   cm.rgbaToCmyk(rgba, w, h)      -> Uint8Array cmyk (4 bytes/pixel, 0..255 = 0..100 %)
 *   EPColor.inkSave(hex, 0.5)      -> hex mais claro (economia de tinta)
 */
(function (root) {
  "use strict";

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  function hexToRgb(hex) {
    let h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

  // sRGB -> XYZ (D65) -> Bradford -> D50 -> Lab
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  function rgbToLab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    // matriz sRGB D65 já adaptada a D50 (Bradford), como no perfil sRGB ICC
    const X = 0.4360747 * R + 0.3850649 * G + 0.1430804 * B;
    const Y = 0.2225045 * R + 0.7168786 * G + 0.0606169 * B;
    const Z = 0.0139322 * R + 0.0971045 * G + 0.7141733 * B;
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    const fx = f(X / 0.9642), fy = f(Y / 1.0), fz = f(Z / 0.8249);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  // ---- perfil ICC: tabelas mft2 (A2B0 = CMYK->Lab, B2A0 = Lab->CMYK) ----
  function parseIcc(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const tag4 = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (tag4(16) !== 'CMYK' || tag4(20) !== 'Lab ') throw new Error('EPColor: perfil precisa ser CMYK com PCS Lab');
    const n = dv.getUint32(128), tags = {};
    for (let i = 0; i < n; i++) tags[tag4(132 + i * 12)] = { off: dv.getUint32(136 + i * 12), len: dv.getUint32(140 + i * 12) };
    function mft2(t) {
      if (!t || tag4(t.off) !== 'mft2') return null;
      const o = t.off, inCh = u8[o + 8], outCh = u8[o + 9], grid = u8[o + 10];
      const inEntries = dv.getUint16(o + 48), outEntries = dv.getUint16(o + 50);
      let p = o + 52;
      const readTable = (count, entries) => {
        const arr = [];
        for (let c = 0; c < count; c++) { const a = new Float64Array(entries); for (let e = 0; e < entries; e++) { a[e] = dv.getUint16(p) / 65535; p += 2; } arr.push(a); }
        return arr;
      };
      const inTables = readTable(inCh, inEntries);
      const clutLen = Math.pow(grid, inCh) * outCh, clut = new Float64Array(clutLen);
      for (let i = 0; i < clutLen; i++) { clut[i] = dv.getUint16(p) / 65535; p += 2; }
      const outTables = readTable(outCh, outEntries);
      // avaliação: curvas de entrada -> interpolação multilinear na CLUT -> curvas de saída
      function evalN(input) {
        const pos = new Float64Array(inCh), i0 = new Int32Array(inCh), fr = new Float64Array(inCh);
        for (let k = 0; k < inCh; k++) {
          const x = clamp01(curve(inTables[k], input[k])) * (grid - 1);
          i0[k] = Math.min(grid - 2, Math.floor(x)); fr[k] = x - i0[k];
        }
        const out = new Float64Array(outCh);
        const corners = 1 << inCh;
        for (let m = 0; m < corners; m++) {
          let w = 1, idx = 0;
          for (let k = 0; k < inCh; k++) {
            const bit = (m >> (inCh - 1 - k)) & 1;
            w *= bit ? fr[k] : 1 - fr[k];
            idx = idx * grid + i0[k] + bit;
          }
          if (!w) continue;
          idx *= outCh;
          for (let c = 0; c < outCh; c++) out[c] += w * clut[idx + c];
        }
        return Array.from(out, (v, c) => clamp01(curve(outTables[c], v)));
      }
      return { inCh, outCh, grid, evalN };
    }
    const B2A = mft2(tags.B2A0 || tags.B2A1), A2B = mft2(tags.A2B0 || tags.A2B1);
    if (!B2A) throw new Error('EPColor: tabela B2A (mft2) não encontrada');
    return { B2A, A2B };
  }
  function curve(tab, v) {
    const n = tab.length - 1, x = clamp01(v) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
    return tab[i] + (tab[i + 1] - tab[i]) * f;
  }
  // Lab legado (v2, 16 bits): L 0..100 -> 0..0xFF00 ; a,b -128..127.996 -> 0..0xFFFF
  const labEnc = (L, a, b) => [(L / 100) * 65280 / 65535, (a + 128) * 257 / 65535, (b + 128) * 257 / 65535];
  const labDec = v => [v[0] * 65535 / 65280 * 100, v[1] * 65535 / 257 - 128, v[2] * 65535 / 257 - 128];

  function createConverter(iccBytes) {
    const P = parseIcc(iccBytes);
    const labToCmyk = (L, a, b) => P.B2A.evalN(labEnc(L, a, b));
    const cmykToLab = (c, m, y, k) => P.A2B ? labDec(P.A2B.evalN([c, m, y, k])) : [100 * (1 - k), 0, 0];
    // neutros só no K: para cada L* acha, pelo próprio perfil (A2B), o K puro
    // que dá a mesma luminosidade. Texto e linhas finas saem num canal só.
    const K_BY_L = new Float64Array(101);
    (function () {
      const samples = [];
      for (let i = 0; i <= 200; i++) { const k = i / 200; samples.push([k, cmykToLab(0, 0, 0, k)[0]]); }
      const Lmin = samples[200][1], Lmax = samples[0][1];
      for (let L = 0; L <= 100; L++) {
        if (L >= Lmax) { K_BY_L[L] = 0; continue; }
        if (L <= Lmin) { K_BY_L[L] = 1; continue; }
        for (let i = 1; i <= 200; i++) {
          if (samples[i][1] <= L) {
            const [k0, l0] = samples[i - 1], [k1, l1] = samples[i];
            K_BY_L[L] = k0 + (k1 - k0) * (l0 - L) / Math.max(1e-6, l0 - l1);
            break;
          }
        }
      }
    })();
    // preserveK: cinza neutro só no preto (vetores: texto, linhas). Nas fotos
    // (rgbaToCmyk) usa-se o GCR do próprio perfil, senão a transição entre
    // o eixo neutro e as cores vizinhas criaria desvios de matiz.
    function rgbToCmyk(r, g, b, preserveK = true) {
      if (preserveK && Math.abs(r - g) <= 2 && Math.abs(g - b) <= 2 && Math.abs(r - b) <= 2) {
        const L = rgbToLab(r, g, b)[0], li = Math.floor(L), f = L - li;
        const k = li >= 100 ? 0 : K_BY_L[li] + (K_BY_L[Math.min(100, li + 1)] - K_BY_L[li]) * f;
        return [0, 0, 0, clamp01(k)];
      }
      const lab = rgbToLab(r, g, b);
      return labToCmyk(lab[0], lab[1], lab[2]);
    }
    const N = 33, step = 255 / (N - 1);
    let LUT = null;
    function buildLut() {
      LUT = new Uint8Array(N * N * N * 4);
      let k = 0;
      for (let ri = 0; ri < N; ri++) for (let gi = 0; gi < N; gi++) for (let bi = 0; bi < N; bi++) {
        const c = rgbToCmyk(ri * step, gi * step, bi * step, false);
        for (let q = 0; q < 4; q++) LUT[k++] = Math.round(c[q] * 255);
      }
    }
    function rgbaToCmyk(rgba, w, h, opts = {}) {
      if (!LUT) buildLut();
      const out = new Uint8Array(w * h * 4);
      const gamma = opts.gamma || 1;           // >1 clareia meios-tons (compensa ganho de ponto)
      const gtab = new Float64Array(256);
      for (let v = 0; v < 256; v++) gtab[v] = Math.pow(v / 255, 1 / gamma) * (N - 1);
      const N2 = N * N;
      for (let i = 0, j = 0; i < w * h; i++, j += 4) {
        const a = rgba[j + 3] / 255, ia = 255 * (1 - a);
        const fr = gtab[(rgba[j] * a + ia) | 0], fg = gtab[(rgba[j + 1] * a + ia) | 0], fb = gtab[(rgba[j + 2] * a + ia) | 0];
        const r0 = Math.min(N - 2, fr | 0), g0 = Math.min(N - 2, fg | 0), b0 = Math.min(N - 2, fb | 0);
        const dr = fr - r0, dg = fg - g0, db = fb - b0;
        const b000 = (r0 * N2 + g0 * N + b0) * 4, b001 = b000 + 4, b010 = b000 + N * 4, b011 = b010 + 4;
        const b100 = b000 + N2 * 4, b101 = b100 + 4, b110 = b100 + N * 4, b111 = b110 + 4;
        for (let q = 0; q < 4; q++) {
          const c0 = (LUT[b000 + q] * (1 - db) + LUT[b001 + q] * db) * (1 - dg) + (LUT[b010 + q] * (1 - db) + LUT[b011 + q] * db) * dg;
          const c1 = (LUT[b100 + q] * (1 - db) + LUT[b101 + q] * db) * (1 - dg) + (LUT[b110 + q] * (1 - db) + LUT[b111 + q] * db) * dg;
          out[i * 4 + q] = (c0 * (1 - dr) + c1 * dr + 0.5) | 0;
        }
      }
      return out;
    }
    const cache = new Map();
    function hexToCmyk(hex) {
      let v = cache.get(hex);
      if (!v) { const [r, g, b] = hexToRgb(hex); v = rgbToCmyk(r, g, b); cache.set(hex, v); }
      return v;
    }
    return { labToCmyk, cmykToLab, rgbToCmyk, hexToCmyk, rgbaToCmyk };
  }

  // economia de tinta: aproxima a cor do branco mantendo o matiz
  function inkSave(hex, amount) {
    const [r, g, b] = hexToRgb(hex), t = clamp01(amount);
    return rgbToHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  }

  root.EPColor = { hexToRgb, rgbToHex, rgbToLab, parseIcc, createConverter, inkSave };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPColor;
})(typeof window !== 'undefined' ? window : globalThis);
