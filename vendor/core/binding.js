/*
 * Esmeralda Paper — packages/core/binding.js
 *
 * Estimativas de acabamento para gráfica pequena:
 *   - contagem de folhas físicas a partir do número de páginas
 *   - espessura aproximada do miolo (folhas × gramatura × fator de volume)
 *   - sugestão de diâmetro de anel/garra wire-o e de espiral (coil)
 *
 * TUDO É ESTIMATIVA. A espessura real depende do papel específico (offset,
 * pólen, couché…), da umidade e do fabricante. Serve para escolher o anel
 * com folga, não para especificação final.
 *
 * Navegador: window.EPBinding.  Node/teste: require.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.EPBinding = api;
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  // 1 folha impressa frente e verso = 2 páginas.
  function sheetsFromPages(nPages) {
    return Math.max(1, Math.ceil((+nPages || 0) / 2));
  }

  // Espessura de 1 folha (mm) ≈ gramatura/1000 × fator de volume.
  // "volume" (bulk) típico: offset comum ~1.1; pólen/avena ~1.5; couché ~0.8.
  var BULK = { offset: 1.1, polen: 1.5, couche: 0.8, reciclado: 1.25 };

  function sheetCaliperMm(gsm, paperKind) {
    var vol = BULK[paperKind] != null ? BULK[paperKind] : 1.1;
    return (Math.max(30, +gsm || 75) / 1000) * vol;
  }

  // Espessura do miolo (mm). Opcionalmente soma capas.
  function bookThicknessMm(opts) {
    var o = opts || {};
    var sheets = o.sheets != null ? o.sheets : sheetsFromPages(o.pages);
    var t = sheets * sheetCaliperMm(o.gsm, o.paperKind);
    if (o.coverGsm) t += 2 * sheetCaliperMm(o.coverGsm, o.coverKind || "couche");
    return Math.round(t * 100) / 100;
  }

  // Tamanhos comerciais de anel Wire-o (garra dupla), em polegadas -> mm.
  // Capacidade prática ≈ 0,80 × diâmetro (o resto é o "loop").
  var WIREO_IN = [1 / 4, 5 / 16, 3 / 8, 7 / 16, 1 / 2, 9 / 16, 5 / 8, 3 / 4, 7 / 8, 1, 1 + 1 / 8, 1 + 1 / 4, 1 + 1 / 2];
  var IN_MM = 25.4;

  function fmtInch(inch) {
    var whole = Math.floor(inch + 1e-9);
    var frac = inch - whole;
    var map = { 0: "", 0.125: "1/8", 0.25: "1/4", 0.3125: "5/16", 0.375: "3/8", 0.4375: "7/16", 0.5: "1/2", 0.5625: "9/16", 0.625: "5/8", 0.75: "3/4", 0.875: "7/8" };
    var f = map[Math.round(frac * 10000) / 10000];
    if (f == null) f = frac ? frac.toFixed(3) : "";
    return (whole ? whole + (f ? " " + f : "") : f) + '"';
  }

  // Passo do wire-o: 3:1 (3 furos por polegada) até ~9/16"; 2:1 acima disso.
  function wireoPitch(inch) { return inch <= 0.5625 ? "3:1" : "2:1"; }

  function suggestWireO(thicknessMm) {
    var need = thicknessMm / 0.8;                 // diâmetro mínimo para a capacidade
    for (var i = 0; i < WIREO_IN.length; i++) {
      if (WIREO_IN[i] * IN_MM >= need - 0.01) {
        var inch = WIREO_IN[i];
        return {
          inch: inch,
          mm: Math.round(inch * IN_MM * 10) / 10,
          label: fmtInch(inch),
          pitch: wireoPitch(inch),
          capacityMm: Math.round(inch * IN_MM * 0.8 * 10) / 10,
          exact: false
        };
      }
    }
    var last = WIREO_IN[WIREO_IN.length - 1];
    return { inch: last, mm: Math.round(last * IN_MM * 10) / 10, label: fmtInch(last) + "+", pitch: wireoPitch(last), capacityMm: Math.round(last * IN_MM * 0.8 * 10) / 10, exact: false, over: true };
  }

  // Espiral / coil plástico — diâmetros comerciais (mm). Capacidade ≈ Ø − 4 mm.
  var COIL_MM = [6, 8, 10, 12, 14, 16, 18, 20, 23, 25, 28, 32, 38, 45, 50];

  function suggestCoil(thicknessMm) {
    var need = thicknessMm + 3;                   // folga do passo do fio
    for (var i = 0; i < COIL_MM.length; i++) {
      if (COIL_MM[i] >= need - 0.01) return { mm: COIL_MM[i], capacityMm: COIL_MM[i] - 4, over: false };
    }
    var last = COIL_MM[COIL_MM.length - 1];
    return { mm: last, capacityMm: last - 4, over: true };
  }

  // Resumo pronto para a interface.
  function estimate(opts) {
    var o = opts || {};
    var sheets = o.sheets != null ? o.sheets : sheetsFromPages(o.pages);
    var thickness = bookThicknessMm(Object.assign({}, o, { sheets: sheets }));
    return {
      sheets: sheets,
      pages: o.pages != null ? +o.pages : sheets * 2,
      gsm: Math.max(30, +o.gsm || 75),
      thicknessMm: thickness,
      wireo: suggestWireO(thickness),
      coil: suggestCoil(thickness),
      multipleOf4: (+o.pages || sheets * 2) % 4 === 0,
      note: "Estimativa — confirme com o papel real antes de comprar o anel."
    };
  }

  return {
    sheetsFromPages: sheetsFromPages,
    sheetCaliperMm: sheetCaliperMm,
    bookThicknessMm: bookThicknessMm,
    suggestWireO: suggestWireO,
    suggestCoil: suggestCoil,
    wireoPitch: wireoPitch,
    estimate: estimate,
    WIREO_IN: WIREO_IN,
    COIL_MM: COIL_MM,
    BULK: BULK
  };
});
