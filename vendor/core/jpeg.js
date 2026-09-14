/* packages/core/jpeg.js — EPJpeg
 *
 * Codificador JPEG baseline (DCT sequencial, Huffman padrão) com 1, 3 ou 4
 * componentes, sem subamostragem. O navegador só gera JPEG RGB; a gráfica
 * precisa das fotos em CMYK dentro do PDF — por isso existe este módulo.
 *
 *   EPJpeg.encode(pixels, width, height, comps, quality) -> Uint8Array
 *     pixels: Uint8Array intercalado (comps bytes por pixel)
 *     comps 1 = cinza, 3 = RGB (convertido para YCbCr), 4 = CMYK (gravado na
 *     convenção Adobe: invertido + APP14; no PDF use /Decode [1 0 1 0 1 0 1 0])
 *
 * Baseado no algoritmo clássico do IJG / codificador JPEG de Andreas Ritter
 * (domínio público / BSD) — reescrito para aceitar CMYK.
 */
(function (root) {
  "use strict";

  const ZIGZAG = [0, 1, 5, 6, 14, 15, 27, 28, 2, 4, 7, 13, 16, 26, 29, 42, 3, 8, 12, 17, 25, 30, 41, 43, 9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54, 20, 22, 33, 38, 46, 51, 55, 60, 21, 34, 37, 47, 50, 56, 59, 61, 35, 36, 48, 49, 57, 58, 62, 63];
  const STD_LUM_Q = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
  const STD_CHR_Q = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
  const DC_LUM_NRC = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], DC_LUM_VAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const AC_LUM_NRC = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
  const AC_LUM_VAL = [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
    0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
    0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
    0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
    0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
    0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
    0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];
  const DC_CHR_NRC = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], DC_CHR_VAL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const AC_CHR_NRC = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
  const AC_CHR_VAL = [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
    0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
    0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
    0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
    0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
    0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
    0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa];

  function huffTable(nrc, val) {
    const t = [];
    let code = 0, k = 0;
    for (let len = 1; len <= 16; len++) {
      for (let j = 0; j < nrc[len]; j++) { t[val[k]] = [code, len]; k++; code++; }
      code <<= 1;
    }
    return t;
  }
  const HT = {
    dcY: huffTable(DC_LUM_NRC, DC_LUM_VAL), acY: huffTable(AC_LUM_NRC, AC_LUM_VAL),
    dcC: huffTable(DC_CHR_NRC, DC_CHR_VAL), acC: huffTable(AC_CHR_NRC, AC_CHR_VAL),
  };
  // categoria e bits de um coeficiente
  const CAT = new Uint8Array(65535), BITS = new Array(65535);
  (function () {
    let lo = 1, hi = 2;
    for (let n = 1; n <= 15; n++) {
      for (let v = lo; v < hi; v++) { CAT[32767 + v] = n; BITS[32767 + v] = [v, n]; }
      for (let v = -(hi - 1); v <= -lo; v++) { CAT[32767 + v] = n; BITS[32767 + v] = [hi - 1 + v, n]; }
      lo <<= 1; hi <<= 1;
    }
  })();
  const AAN = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.541196100, 0.275899379];

  function quantTables(quality) {
    quality = Math.max(1, Math.min(100, Math.round(quality)));
    const sf = quality < 50 ? Math.floor(5000 / quality) : Math.floor(200 - quality * 2);
    const make = std => {
      const q = new Uint8Array(64), fdtbl = new Float64Array(64);
      for (let i = 0; i < 64; i++) {
        let t = Math.floor((std[i] * sf + 50) / 100);
        q[ZIGZAG[i]] = Math.max(1, Math.min(255, t));
      }
      let k = 0;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { fdtbl[k] = 1 / (q[ZIGZAG[k]] * AAN[r] * AAN[c] * 8); k++; }
      return { q, fdtbl };
    };
    return { Y: make(STD_LUM_Q), C: make(STD_CHR_Q) };
  }

  function fdctQuant(d, fdtbl, out) {
    let o = 0;
    for (let i = 0; i < 8; i++) {
      const d0 = d[o], d1 = d[o + 1], d2 = d[o + 2], d3 = d[o + 3], d4 = d[o + 4], d5 = d[o + 5], d6 = d[o + 6], d7 = d[o + 7];
      const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
      let t10 = t0 + t3, t13 = t0 - t3, t11 = t1 + t2, t12 = t1 - t2;
      d[o] = t10 + t11; d[o + 4] = t10 - t11;
      const z1 = (t12 + t13) * 0.707106781;
      d[o + 2] = t13 + z1; d[o + 6] = t13 - z1;
      t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
      const z5 = (t10 - t12) * 0.382683433, z2 = 0.541196100 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
      const z11 = t7 + z3, z13 = t7 - z3;
      d[o + 5] = z13 + z2; d[o + 3] = z13 - z2; d[o + 1] = z11 + z4; d[o + 7] = z11 - z4;
      o += 8;
    }
    o = 0;
    for (let i = 0; i < 8; i++) {
      const d0 = d[o], d1 = d[o + 8], d2 = d[o + 16], d3 = d[o + 24], d4 = d[o + 32], d5 = d[o + 40], d6 = d[o + 48], d7 = d[o + 56];
      const t0 = d0 + d7, t7 = d0 - d7, t1 = d1 + d6, t6 = d1 - d6, t2 = d2 + d5, t5 = d2 - d5, t3 = d3 + d4, t4 = d3 - d4;
      let t10 = t0 + t3, t13 = t0 - t3, t11 = t1 + t2, t12 = t1 - t2;
      d[o] = t10 + t11; d[o + 32] = t10 - t11;
      const z1 = (t12 + t13) * 0.707106781;
      d[o + 16] = t13 + z1; d[o + 48] = t13 - z1;
      t10 = t4 + t5; t11 = t5 + t6; t12 = t6 + t7;
      const z5 = (t10 - t12) * 0.382683433, z2 = 0.541196100 * t10 + z5, z4 = 1.306562965 * t12 + z5, z3 = t11 * 0.707106781;
      const z11 = t7 + z3, z13 = t7 - z3;
      d[o + 40] = z13 + z2; d[o + 24] = z13 - z2; d[o + 8] = z11 + z4; d[o + 56] = z11 - z4;
      o++;
    }
    for (let i = 0; i < 64; i++) {
      const v = d[i] * fdtbl[i];
      out[i] = v > 0 ? (v + 0.5) | 0 : (v - 0.5) | 0;
    }
  }

  function encode(pixels, width, height, comps, quality) {
    if (![1, 3, 4].includes(comps)) throw new Error('EPJpeg: comps deve ser 1, 3 ou 4');
    const QT = quantTables(quality == null ? 90 : quality);
    let buf = new Uint8Array(Math.max(1 << 16, width * height * comps >> 2)), len = 0;
    let bytenew = 0, bytepos = 7;
    const w8 = v => { if (len >= buf.length) { const nb = new Uint8Array(buf.length * 2); nb.set(buf); buf = nb; } buf[len++] = v & 0xFF; };
    const w16 = v => { w8(v >> 8); w8(v); };
    const writeBits = bs => {
      const value = bs[0];
      let posval = bs[1] - 1;
      while (posval >= 0) {
        if (value & (1 << posval)) bytenew |= (1 << bytepos);
        posval--; bytepos--;
        if (bytepos < 0) {
          if (bytenew === 0xFF) { w8(0xFF); w8(0); } else w8(bytenew);
          bytepos = 7; bytenew = 0;
        }
      }
    };
    // cabeçalhos
    w16(0xFFD8);
    // CMYK na convenção Adobe (a do Photoshop/Acrobat, que RIPs e leitores
    // esperam): dados INVERTIDOS + marcador APP14 com transform 0. No PDF a
    // imagem vai com /Decode [1 0 1 0 1 0 1 0].
    if (comps === 4) {
      w16(0xFFEE); w16(14);
      [0x41, 0x64, 0x6F, 0x62, 0x65].forEach(w8); w16(100); w16(0); w16(0); w8(0);
    } else {                                 // JFIF
      w16(0xFFE0); w16(16); [0x4A, 0x46, 0x49, 0x46, 0].forEach(w8); w8(1); w8(1); w8(0); w16(1); w16(1); w8(0); w8(0);
    }
    const useChroma = comps === 3;
    w16(0xFFDB); w16(useChroma ? 132 : 67);
    w8(0); for (let i = 0; i < 64; i++) w8(QT.Y.q[i]);
    if (useChroma) { w8(1); for (let i = 0; i < 64; i++) w8(QT.C.q[i]); }
    // SOF0
    w16(0xFFC0); w16(8 + comps * 3); w8(8); w16(height); w16(width); w8(comps);
    for (let c = 0; c < comps; c++) { w8(c + 1); w8(0x11); w8(useChroma && c > 0 ? 1 : 0); }
    // DHT
    const dht = (cls, id, nrc, val) => { w8((cls << 4) | id); for (let i = 1; i <= 16; i++) w8(nrc[i]); val.forEach(w8); };
    w16(0xFFC4);
    w16(2 + (17 + 12) + (17 + 162) + (useChroma ? (17 + 12) + (17 + 162) : 0));
    dht(0, 0, DC_LUM_NRC, DC_LUM_VAL); dht(1, 0, AC_LUM_NRC, AC_LUM_VAL);
    if (useChroma) { dht(0, 1, DC_CHR_NRC, DC_CHR_VAL); dht(1, 1, AC_CHR_NRC, AC_CHR_VAL); }
    // SOS
    w16(0xFFDA); w16(6 + comps * 2); w8(comps);
    for (let c = 0; c < comps; c++) { w8(c + 1); w8(useChroma && c > 0 ? 0x11 : 0x00); }
    w8(0); w8(0x3F); w8(0);

    const DU = new Float64Array(64), Q = new Int32Array(64);
    const prevDC = new Int32Array(comps);
    const blocks = [];
    for (let c = 0; c < comps; c++) blocks.push(new Float64Array(64));
    const coder = c => (useChroma && c > 0) ? { dc: HT.dcC, ac: HT.acC, fd: QT.C.fdtbl } : { dc: HT.dcY, ac: HT.acY, fd: QT.Y.fdtbl };
    const coders = []; for (let c = 0; c < comps; c++) coders.push(coder(c));
    const EOB = 0x00, M16 = 0xF0;

    function processDU(c) {
      const cd = coders[c];
      DU.set(blocks[c]);
      fdctQuant(DU, cd.fd, Q);
      const zz = new Int32Array(64);
      for (let j = 0; j < 64; j++) zz[ZIGZAG[j]] = Q[j];
      const diff = zz[0] - prevDC[c]; prevDC[c] = zz[0];
      if (diff === 0) writeBits(cd.dc[0]);
      else { const p = 32767 + diff; writeBits(cd.dc[CAT[p]]); writeBits(BITS[p]); }
      let end0 = 63;
      while (end0 > 0 && zz[end0] === 0) end0--;
      if (end0 === 0) { writeBits(cd.ac[EOB]); return; }
      let i = 1;
      while (i <= end0) {
        const start = i;
        while (zz[i] === 0 && i <= end0) i++;
        let nz = i - start;
        if (nz >= 16) { const lng = nz >> 4; for (let n = 1; n <= lng; n++) writeBits(cd.ac[M16]); nz &= 0xF; }
        const p = 32767 + zz[i];
        writeBits(cd.ac[(nz << 4) + CAT[p]]); writeBits(BITS[p]);
        i++;
      }
      if (end0 !== 63) writeBits(cd.ac[EOB]);
    }

    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        for (let k = 0; k < 64; k++) {
          const row = Math.min(height - 1, y + (k >> 3)), col = Math.min(width - 1, x + (k & 7));
          const p = (row * width + col) * comps;
          if (comps === 3) {
            const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
            blocks[0][k] = (0.299 * r + 0.587 * g + 0.114 * b) - 128;
            blocks[1][k] = (-0.16874 * r - 0.33126 * g + 0.5 * b);
            blocks[2][k] = (0.5 * r - 0.41869 * g - 0.08131 * b);
          } else {
            if (comps === 4) for (let c = 0; c < 4; c++) blocks[c][k] = 127 - pixels[p + c];   // 255 - v - 128
            else blocks[0][k] = pixels[p] - 128;
          }
        }
        for (let c = 0; c < comps; c++) processDU(c);
      }
    }
    if (bytepos >= 0) writeBits([(1 << (bytepos + 1)) - 1, bytepos + 1]);
    w16(0xFFD9);
    return buf.slice(0, len);
  }

  root.EPJpeg = { encode };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPJpeg;
})(typeof window !== 'undefined' ? window : globalThis);
