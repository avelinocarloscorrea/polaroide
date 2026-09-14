/*
 * Esmeralda Paper — packages/core/dates.js
 *
 * Núcleo compartilhado de datas: calendário do Brasil (feriados nacionais e
 * móveis, feriados estaduais por UF, datas comemorativas), números de semana
 * (ISO e "americano"), aritmética de datas e leitura de listas de eventos
 * (texto colado ou CSV). Tudo calculado localmente — nada de rede.
 *
 * Uso no navegador: <script src="vendor/core/dates.js"> define window.EPDates
 * (script clássico, mesma origem, compatível com a CSP das ferramentas).
 * Uso em teste (Node): require('../packages/core/dates.js').
 *
 * Convenções:
 *   - "ymd" = string 'AAAA-MM-DD'.
 *   - Datas são objetos Date no fuso local, sempre à meia-noite.
 *   - Nada aqui toca no DOM nem em armazenamento.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;      // Node / testes
  if (root) root.EPDates = api;                                                   // navegador
})(typeof self !== "undefined" ? self : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";

  /* ===================== aritmética básica ===================== */

  var MS_DAY = 86400000;

  function pad2(n) { return String(n).padStart(2, "0"); }

  // constrói uma Date local à meia-noite (evita surpresas de fuso do `new Date('AAAA-MM-DD')`)
  function ymdToDate(ymd) {
    var m = /^\s*(-?\d{1,6})-(\d{1,2})-(\d{1,2})\s*$/.exec(String(ymd == null ? "" : ymd));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);
    // rejeita overflow (ex.: 31/02 vira 03/03)
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function dateToYmd(dt) {
    return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate());
  }

  function addDays(dt, n) {
    var x = new Date(dt.getTime());
    x.setDate(x.getDate() + n);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // diferença em dias inteiros (b - a), robusta a horário de verão
  function diffDays(a, b) {
    var ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    var ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((ub - ua) / MS_DAY);
  }

  function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  }

  function daysInMonth(y, m1) {          // m1 = 1..12
    return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m1 - 1];
  }

  function daysInYear(y) { return isLeapYear(y) ? 366 : 365; }

  // dia do ano, 1..365/366
  function dayOfYear(dt) {
    return diffDays(new Date(dt.getFullYear(), 0, 1), dt) + 1;
  }

  // "domingo" = 0 … "sábado" = 6, virando índice conforme início da semana
  function startOfWeek(dt, weekStart) {
    var x = new Date(dt.getTime());
    x.setHours(0, 0, 0, 0);
    var dow = x.getDay();
    var back = weekStart === "sun" ? dow : (dow + 6) % 7;
    return addDays(x, -back);
  }

  function endOfWeek(dt, weekStart) { return addDays(startOfWeek(dt, weekStart), 6); }

  /* ===================== números de semana ===================== */

  // ISO 8601: semana começa na segunda; a semana 1 contém a primeira quinta-feira
  // do ano (equivalente: contém o dia 4 de janeiro).
  function isoWeek(dt) {
    var t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    var day = t.getUTCDay() || 7;                 // domingo (0) -> 7
    t.setUTCDate(t.getUTCDate() + 4 - day);       // quinta-feira desta semana
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / MS_DAY) + 1) / 7);
  }

  // ano ao qual a semana ISO pertence (pode ser ano anterior/seguinte na virada)
  function isoWeekYear(dt) {
    var t = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    return t.getUTCFullYear();
  }

  // Número de semana "americano"/simples: a semana 1 é a que contém 1º de janeiro;
  // a semana vira no dia definido por weekStart ('sun' padrão nos EUA, 'mon' aceito).
  function usWeek(dt, weekStart) {
    weekStart = weekStart === "mon" ? "mon" : "sun";
    var jan1 = new Date(dt.getFullYear(), 0, 1);
    var firstWeekStart = startOfWeek(jan1, weekStart);
    var thisWeekStart = startOfWeek(dt, weekStart);
    return Math.floor(diffDays(firstWeekStart, thisWeekStart) / 7) + 1;
  }

  /* ===================== Páscoa e feriados móveis ===================== */

  // Domingo de Páscoa (calendário gregoriano) — algoritmo "Anonymous Gregorian"
  // (Meeus/Jones/Butcher). Válido para qualquer ano gregoriano.
  function easterSunday(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);        // 3 = março, 4 = abril
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    var dt = new Date(year, month - 1, day);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  // Feriados/observâncias móveis presos à Páscoa.
  function movableHolidays(year) {
    var easter = easterSunday(year);
    return [
      { ymd: dateToYmd(addDays(easter, -48)), name: "Carnaval (segunda-feira)", type: "facultativo", key: "carnaval-seg" },
      { ymd: dateToYmd(addDays(easter, -47)), name: "Carnaval", type: "facultativo", key: "carnaval" },
      { ymd: dateToYmd(addDays(easter, -46)), name: "Quarta-feira de Cinzas", type: "facultativo", key: "cinzas" },
      { ymd: dateToYmd(addDays(easter, -2)), name: "Sexta-feira Santa", type: "nacional", key: "sexta-santa" },
      { ymd: dateToYmd(easter), name: "Domingo de Páscoa", type: "nacional", key: "pascoa" },
      { ymd: dateToYmd(addDays(easter, 60)), name: "Corpus Christi", type: "facultativo", key: "corpus-christi" }
    ];
  }

  /* ===================== feriados nacionais fixos ===================== */

  // Feriados civis e religiosos de âmbito nacional (Lei 662/1949, Lei 6.802/1980
  // e Lei 14.759/2023, que tornou 20/11 feriado nacional a partir de 2024).
  var NATIONAL_FIXED = [
    { md: "01-01", name: "Confraternização Universal", type: "nacional", key: "ano-novo" },
    { md: "04-21", name: "Tiradentes", type: "nacional", key: "tiradentes" },
    { md: "05-01", name: "Dia do Trabalho", type: "nacional", key: "trabalho" },
    { md: "09-07", name: "Independência do Brasil", type: "nacional", key: "independencia" },
    { md: "10-12", name: "Nossa Senhora Aparecida", type: "nacional", key: "aparecida" },
    { md: "11-02", name: "Finados", type: "nacional", key: "finados" },
    { md: "11-15", name: "Proclamação da República", type: "nacional", key: "republica" },
    { md: "11-20", name: "Consciência Negra", type: "nacional", key: "consciencia-negra", since: 2024 },
    { md: "12-25", name: "Natal", type: "nacional", key: "natal" }
  ];

  /* ===================== feriados estaduais (opt-in por UF) ===================== */

  // Curadoria dos feriados estaduais mais estabelecidos. Alguns estados não têm
  // feriado civil próprio além dos nacionais; nesses casos a lista vem vazia.
  // "md" = mês-dia fixo; "easterOffset" = dias a partir do Domingo de Páscoa.
  // Datas comemorativas municipais NÃO entram aqui.
  var STATE_HOLIDAYS = {
    AC: [
      { md: "01-23", name: "Dia do Evangélico (AC)" },
      { md: "06-15", name: "Aniversário do Acre" },
      { md: "09-05", name: "Dia da Amazônia (AC)" },
      { md: "11-17", name: "Assinatura do Tratado de Petrópolis (AC)" }
    ],
    AL: [
      { md: "06-24", name: "São João (AL)" },
      { md: "06-29", name: "São Pedro (AL)" },
      { md: "09-16", name: "Emancipação política de Alagoas" }
    ],
    AP: [
      { md: "03-19", name: "São José (AP)" },
      { md: "09-13", name: "Criação do Território Federal do Amapá" }
    ],
    AM: [
      { md: "09-05", name: "Elevação do Amazonas à categoria de província" },
      { md: "11-20", name: "Consciência Negra (AM)" },
      { md: "12-08", name: "Nossa Senhora da Conceição (AM)" }
    ],
    BA: [
      { md: "07-02", name: "Independência da Bahia" }
    ],
    CE: [
      { md: "03-19", name: "São José (CE)" },
      { md: "03-25", name: "Data Magna do Ceará" }
    ],
    DF: [
      { md: "04-21", name: "Fundação de Brasília" },
      { md: "11-30", name: "Dia do Evangélico (DF)" }
    ],
    ES: [
      { easterOffset: 8, name: "Nossa Senhora da Penha (ES)" }
    ],
    GO: [],
    MA: [
      { md: "07-28", name: "Adesão do Maranhão à Independência" }
    ],
    MT: [],
    MS: [
      { md: "10-11", name: "Criação do Estado de Mato Grosso do Sul" }
    ],
    MG: [],
    PA: [
      { md: "08-15", name: "Adesão do Grão-Pará à Independência" }
    ],
    PB: [
      { md: "08-05", name: "Fundação do Estado da Paraíba" }
    ],
    PR: [
      { md: "12-19", name: "Emancipação política do Paraná" }
    ],
    PE: [
      { md: "03-06", name: "Data Magna de Pernambuco (Revolução Pernambucana)" },
      { md: "06-24", name: "São João (PE)" }
    ],
    PI: [
      { md: "10-19", name: "Dia do Piauí" }
    ],
    RJ: [
      { md: "04-23", name: "São Jorge (RJ)" }
    ],
    RN: [
      { md: "10-03", name: "Mártires de Cunhaú e Uruaçu (RN)" }
    ],
    RS: [
      { md: "09-20", name: "Revolução Farroupilha" }
    ],
    RO: [
      { md: "01-04", name: "Criação do Estado de Rondônia" },
      { md: "06-18", name: "Dia do Evangélico (RO)" }
    ],
    RR: [
      { md: "10-05", name: "Criação do Estado de Roraima" }
    ],
    SC: [
      { md: "08-11", name: "Criação da Capitania / Dia de Santa Catarina" }
    ],
    SP: [
      { md: "07-09", name: "Revolução Constitucionalista de 1932" }
    ],
    SE: [
      { md: "07-08", name: "Emancipação política de Sergipe" }
    ],
    TO: [
      { md: "10-05", name: "Criação do Estado do Tocantins" }
    ]
  };

  var UFS = Object.keys(STATE_HOLIDAYS).sort();

  /* ===================== datas comemorativas (opt-in) ===================== */

  // n-ésimo (1..5) dia-da-semana `dow` (0=domingo) de um mês; se estourar, usa o último.
  function nthWeekday(year, month1, dow, n) {
    var first = new Date(year, month1 - 1, 1);
    var shift = (dow - first.getDay() + 7) % 7;
    var day = 1 + shift + (n - 1) * 7;
    if (day > daysInMonth(year, month1)) day -= 7;
    var dt = new Date(year, month1 - 1, day);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  // Datas de apelo comercial para papelaria/gráfica. NÃO são feriado — apenas
  // marcações opcionais.
  function commemorativeDates(year) {
    var thanksgiving = nthWeekday(year, 11, 4, 4);              // 4ª quinta de novembro (EUA)
    return [
      { ymd: year + "-03-15", name: "Dia do Consumidor", type: "comemorativa", key: "consumidor" },
      { ymd: dateToYmd(nthWeekday(year, 5, 0, 2)), name: "Dia das Mães", type: "comemorativa", key: "maes" },
      { ymd: year + "-06-12", name: "Dia dos Namorados", type: "comemorativa", key: "namorados" },
      { ymd: dateToYmd(nthWeekday(year, 8, 0, 2)), name: "Dia dos Pais", type: "comemorativa", key: "pais" },
      { ymd: year + "-09-15", name: "Dia do Cliente", type: "comemorativa", key: "cliente" },
      { ymd: year + "-10-12", name: "Dia das Crianças", type: "comemorativa", key: "criancas" },
      { ymd: year + "-10-15", name: "Dia do Professor", type: "comemorativa", key: "professor" },
      { ymd: dateToYmd(addDays(thanksgiving, 1)), name: "Black Friday", type: "comemorativa", key: "black-friday" }
    ];
  }

  /* ===================== consulta de feriados ===================== */

  function fixedToYmd(year, md) { return year + "-" + md; }

  // Todos os feriados de um ano. options:
  //   { uf: 'RS'|null, includeOptional: true, includeCommemorative: false }
  // Retorna [{ ymd, name, type, key }] ordenado por data. Datas repetidas
  // (ex.: 12/10 nacional + Dia das Crianças) aparecem como entradas separadas.
  function holidaysForYear(year, options) {
    var o = options || {};
    var includeOptional = o.includeOptional !== false;              // padrão: inclui facultativos
    var includeCommemorative = !!o.includeCommemorative;
    var uf = o.uf ? String(o.uf).toUpperCase() : null;
    var out = [];

    NATIONAL_FIXED.forEach(function (h) {
      if (h.since && year < h.since) return;
      out.push({ ymd: fixedToYmd(year, h.md), name: h.name, type: h.type, key: h.key });
    });

    movableHolidays(year).forEach(function (h) {
      if (h.type === "facultativo" && !includeOptional) return;
      out.push({ ymd: h.ymd, name: h.name, type: h.type, key: h.key });
    });

    if (uf && STATE_HOLIDAYS[uf]) {
      var easter = easterSunday(year);
      STATE_HOLIDAYS[uf].forEach(function (h) {
        var ymd = h.md ? fixedToYmd(year, h.md) : dateToYmd(addDays(easter, h.easterOffset));
        out.push({ ymd: ymd, name: h.name, type: "estadual", key: "uf-" + uf + "-" + ymd });
      });
    }

    if (includeCommemorative) {
      commemorativeDates(year).forEach(function (h) { out.push(h); });
    }

    out.sort(function (a, b) { return a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0; });
    return out;
  }

  // Mapa { 'AAAA-MM-DD': [nome, ...] } cobrindo um intervalo de anos (inclusive).
  function holidayMap(fromYear, toYear, options) {
    var map = Object.create(null);
    for (var y = fromYear; y <= toYear; y++) {
      holidaysForYear(y, options).forEach(function (h) {
        (map[h.ymd] || (map[h.ymd] = [])).push(h.name);
      });
    }
    return map;
  }

  // Feriado que cai exatamente em `dt` (ou null). Aceita Date ou ymd.
  function holidayOn(dt, options) {
    var ymd = typeof dt === "string" ? dt : dateToYmd(dt);
    var year = +ymd.slice(0, 4);
    var hit = null;
    holidaysForYear(year, options).forEach(function (h) { if (h.ymd === ymd && !hit) hit = h; });
    return hit;
  }

  function isHoliday(dt, options) { return !!holidayOn(dt, options); }

  function isWeekend(dt) { var d = dt.getDay(); return d === 0 || d === 6; }

  function isBusinessDay(dt, options) { return !isWeekend(dt) && !isHoliday(dt, options); }

  /* ===================== leitura de eventos (texto / CSV) ===================== */

  // Reconhece 'AAAA-MM-DD', 'DD/MM/AAAA', 'DD/MM/AA', 'DD/MM' (recorrente),
  // 'DD-MM' e 'DD.MM.AAAA'. Devolve { year|null, month, day } ou null.
  function parseLooseDate(s) {
    s = String(s || "").trim();
    var m;
    if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s))) {
      return normDMY(+m[3], +m[2], +m[1]);
    }
    if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
      var y = +m[3]; if (y < 100) y += y < 70 ? 2000 : 1900;
      return normDMY(+m[1], +m[2], y);
    }
    if ((m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s))) {
      return normDMY(+m[1], +m[2], null);
    }
    return null;
  }

  function normDMY(d, mo, y) {
    if (mo < 1 || mo > 12) return null;
    var maxD = y == null ? 31 : daysInMonth(y, mo);
    if (mo === 2 && y == null) maxD = 29;                 // 29/02 recorrente é aceito
    if (d < 1 || d > maxD) return null;
    return { year: y, month: mo, day: d };
  }

  function cleanTitle(s) {
    return String(s == null ? "" : s)
      .replace(/[ -]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  // Lê um bloco de texto OU CSV. Cada linha: uma data + um título, separados por
  // vírgula, ponto e vírgula, tabulação ou espaço(s). Linhas em branco e uma
  // eventual linha de cabeçalho ("data,titulo") são ignoradas. Limite: `max`.
  function parseEvents(text, max) {
    max = max || 500;
    var lines = String(text == null ? "" : text).split(/\r\n|\r|\n/);
    var out = [];
    for (var i = 0; i < lines.length && out.length < max; i++) {
      var raw = lines[i].trim();
      if (!raw) continue;
      // recorrentes: "toda segunda Aula de inglês", "todo dia 5 Aluguel"
      var rec = parseRecurring(raw);
      if (rec) { out.push(rec); continue; }
      // separadores: ; , tab, ou "espaço após o primeiro token de data"
      var parts = raw.split(/\s*[;,\t]\s*/);
      var dateTok, rest;
      if (parts.length >= 2 && parseLooseDate(parts[0])) {
        dateTok = parts[0];
        rest = parts.slice(1).join(", ");
      } else {
        var sp = raw.match(/^(\S+)\s+([\s\S]+)$/);
        if (!sp) continue;
        dateTok = sp[1];
        rest = sp[2];
      }
      var d = parseLooseDate(dateTok);
      if (!d) continue;                                    // provável cabeçalho ou lixo
      var title = cleanTitle(rest);
      if (!title) continue;
      out.push({
        year: d.year,
        month: d.month,
        day: d.day,
        recurring: d.year == null,
        ymd: d.year == null ? null : (d.year + "-" + pad2(d.month) + "-" + pad2(d.day)),
        title: title
      });
    }
    return out;
  }

  var DOW_WORDS = { domingo: 0, segunda: 1, terca: 2, "terça": 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6, "sábado": 6,
    dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6, "sáb": 6 };
  function parseRecurring(raw) {
    var m = raw.match(/^tod[ao]s?\s+(?:as\s+|os\s+)?(domingo|segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|dom|seg|ter|qua|qui|sex|s[aá]b)s?(?:-feiras?)?\b\s*[;,:\-\u2013\u2014]?\s*([\s\S]+)$/i);
    if (m) {
      var t = cleanTitle(m[2]);
      if (t) return { recurring: true, rule: "weekly", dow: DOW_WORDS[m[1].toLowerCase()], title: t, year: null, month: null, day: null, ymd: null };
    }
    m = raw.match(/^todo\s+(?:m[eê]s\s+)?(?:no\s+)?dia\s+(\d{1,2})\b\s*[;,:\-\u2013\u2014]?\s*([\s\S]+)$/i);
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      var t2 = cleanTitle(m[2]);
      if (t2) return { recurring: true, rule: "monthly", day: +m[1], title: t2, year: null, month: null, ymd: null };
    }
    return null;
  }

  // Indexa eventos por 'MM-DD' (só os recorrentes, sem ano) e por 'AAAA-MM-DD'
  // (os de data fixa), para consulta rápida ao desenhar um mês/semana/dia.
  // Um evento de data fixa NÃO se repete no aniversário — só cai no ano dele.
  function indexEvents(events) {
    var byMd = Object.create(null), byYmd = Object.create(null), weekly = [[], [], [], [], [], [], []], monthly = Object.create(null);
    (events || []).forEach(function (e) {
      if (e.rule === "weekly") { weekly[e.dow].push(e.title); return; }
      if (e.rule === "monthly") { (monthly[e.day] || (monthly[e.day] = [])).push(e.title); return; }
      if (e.ymd) {
        (byYmd[e.ymd] || (byYmd[e.ymd] = [])).push(e.title);
      } else {
        var md = pad2(e.month) + "-" + pad2(e.day);
        (byMd[md] || (byMd[md] = [])).push(e.title);
      }
    });
    return {
      byMd: byMd,
      byYmd: byYmd,
      on: function (dt) {
        var ymd = typeof dt === "string" ? dt : dateToYmd(dt);
        var md = ymd.slice(5);
        var d = typeof dt === "string" ? ymdToDate(dt) : dt;
        return [].concat(byYmd[ymd] || [], byMd[md] || [], d ? (weekly[d.getDay()] || []) : [], d ? (monthly[d.getDate()] || []) : []);
      }
    };
  }

  /* ===================== fases da lua ===================== */
  // Jean Meeus, "Astronomical Algorithms", cap. 49 (termos principais — erro
  // típico de poucos minutos). Datas no fuso de Brasília (UTC−3) por padrão.
  // phase: 0 nova, 1 quarto crescente, 2 cheia, 3 quarto minguante.
  function moonPhaseJDE(k, phase) {
    var rad = Math.PI / 180, T = k / 1236.85, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.000000150 * T3 + 0.00000000073 * T4;
    var E = 1 - 0.002516 * T - 0.0000074 * T2;
    var M = (2.5534 + 29.10535670 * k - 0.0000014 * T2 - 0.00000011 * T3) * rad;
    var Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * rad;
    var F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * rad;
    var O = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * rad;
    var s = Math.sin, c;
    if (phase === 0 || phase === 2) {
      var n = phase === 0;
      c = (n ? -0.40720 : -0.40614) * s(Mp) + (n ? 0.17241 : 0.17302) * E * s(M) + (n ? 0.01608 : 0.01614) * s(2 * Mp) +
        (n ? 0.01039 : 0.01043) * s(2 * F) + (n ? 0.00739 : 0.00734) * E * s(Mp - M) - (n ? 0.00514 : 0.00515) * E * s(Mp + M) +
        (n ? 0.00208 : 0.00209) * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M) -
        0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O);
    } else {
      c = -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp) + 0.00804 * s(2 * F) +
        0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M) - 0.00180 * s(Mp - 2 * F) - 0.00070 * s(Mp + 2 * F) - 0.00040 * s(3 * Mp) -
        0.00034 * E * s(2 * Mp - M) + 0.00032 * E * s(M + 2 * F) + 0.00032 * E * s(M - 2 * F) - 0.00028 * E * E * s(Mp + 2 * M) +
        0.00027 * E * s(2 * Mp + M) - 0.00017 * s(O);
      var cos = Math.cos;
      var W = 0.00306 - 0.00038 * E * cos(M) + 0.00026 * cos(Mp) - 0.00002 * cos(Mp - M) + 0.00002 * cos(Mp + M) + 0.00002 * cos(2 * F);
      c += phase === 1 ? W : -W;
    }
    return jde + c;
  }
  // fases entre duas datas (inclusive) → [{ ymd, date (Date local com hora), phase }]
  function moonPhases(from, to, utcOffsetH) {
    var off = utcOffsetH == null ? -3 : utcOffsetH;
    var a = from instanceof Date ? from : ymdToDate(from), b = to instanceof Date ? to : ymdToDate(to);
    var yearFrac = a.getFullYear() + (dayOfYear(a) - 1) / 365.25;
    var k0 = Math.floor((yearFrac - 2000) * 12.3685) - 1;
    var out = [], end = +b + 864e5;
    for (var k = k0; ; k++) {
      var done = false;
      for (var p = 0; p < 4; p++) {
        var jde = moonPhaseJDE(k + p / 4, p);
        var ms = (jde - 2440587.5) * 864e5 - 69e3 + off * 3600e3;   // TT→UTC (ΔT≈69 s) e fuso
        var u = new Date(ms);
        var local = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes());
        if (+local >= end) { done = true; break; }
        if (+local >= +a) out.push({ ymd: dateToYmd(local), date: local, phase: p });
      }
      if (done) break;
    }
    return out;
  }
  var MOON_PT = ["Lua nova", "Quarto crescente", "Lua cheia", "Quarto minguante"];

  /* ===================== variáveis dinâmicas de texto ===================== */

  var MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  var DOW_PT = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
    "Quinta-feira", "Sexta-feira", "Sábado"];
  var DOW_SHORT_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  // Substitui marcadores {dia}, {dia_semana}, {mes}, {mes_num}, {ano},
  // {semana_numero}, {dia_do_ano}, {dias_restantes}, {pagina}, {secao},
  // {nome_dono} e {campo:<chave>} (campos personalizados) num texto.
  // ctx: { date, page, section, owner, fields:{}, weekStart }
  function applyVars(text, ctx) {
    ctx = ctx || {};
    var dt = ctx.date || null;
    var repl = {
      dia: dt ? String(dt.getDate()) : "",
      dia_2: dt ? pad2(dt.getDate()) : "",
      dia_semana: dt ? DOW_PT[dt.getDay()] : "",
      dia_semana_abrev: dt ? DOW_SHORT_PT[dt.getDay()] : "",
      mes: dt ? MONTHS_PT[dt.getMonth()] : "",
      mes_abrev: dt ? MONTHS_PT[dt.getMonth()].slice(0, 3) : "",
      mes_num: dt ? pad2(dt.getMonth() + 1) : "",
      ano: dt ? String(dt.getFullYear()) : (ctx.year ? String(ctx.year) : ""),
      semana_numero: dt ? String(isoWeek(dt)) : "",
      dia_do_ano: dt ? String(dayOfYear(dt)) : "",
      dias_restantes: dt ? String(daysInYear(dt.getFullYear()) - dayOfYear(dt)) : "",
      data: dt ? (pad2(dt.getDate()) + "/" + pad2(dt.getMonth() + 1) + "/" + dt.getFullYear()) : "",
      pagina: ctx.page != null ? String(ctx.page) : "",
      secao: ctx.section != null ? String(ctx.section) : "",
      nome_dono: ctx.owner != null ? String(ctx.owner) : "",
      feriado: ctx.holiday != null ? String(ctx.holiday) : "",
      evento: ctx.event != null ? String(ctx.event) : ""
    };
    return String(text == null ? "" : text).replace(/\{([a-z_]+)(?::([^}]*))?\}/gi, function (m, key, arg) {
      key = key.toLowerCase();
      if (key === "campo") {
        var f = ctx.fields || {};
        return f[arg] != null ? String(f[arg]) : "";
      }
      return Object.prototype.hasOwnProperty.call(repl, key) ? repl[key] : m;
    });
  }

  var VAR_NAMES = ["dia", "dia_2", "dia_semana", "dia_semana_abrev", "mes", "mes_abrev",
    "mes_num", "ano", "semana_numero", "dia_do_ano", "dias_restantes", "data",
    "pagina", "secao", "nome_dono", "feriado", "evento", "campo:<chave>"];

  /* ===================== exports ===================== */

  return {
    // aritmética
    MS_DAY: MS_DAY,
    pad2: pad2,
    ymdToDate: ymdToDate,
    dateToYmd: dateToYmd,
    addDays: addDays,
    diffDays: diffDays,
    isLeapYear: isLeapYear,
    daysInMonth: daysInMonth,
    daysInYear: daysInYear,
    dayOfYear: dayOfYear,
    startOfWeek: startOfWeek,
    endOfWeek: endOfWeek,
    nthWeekday: nthWeekday,
    // semanas
    isoWeek: isoWeek,
    isoWeekYear: isoWeekYear,
    usWeek: usWeek,
    // feriados
    easterSunday: easterSunday,
    movableHolidays: movableHolidays,
    holidaysForYear: holidaysForYear,
    holidayMap: holidayMap,
    holidayOn: holidayOn,
    isHoliday: isHoliday,
    isWeekend: isWeekend,
    isBusinessDay: isBusinessDay,
    commemorativeDates: commemorativeDates,
    NATIONAL_FIXED: NATIONAL_FIXED,
    STATE_HOLIDAYS: STATE_HOLIDAYS,
    UFS: UFS,
    // eventos
    parseLooseDate: parseLooseDate,
    parseEvents: parseEvents,
    indexEvents: indexEvents,
    // variáveis
    applyVars: applyVars,
    // lua
    moonPhases: moonPhases,
    MOON_PT: MOON_PT,
    parseRecurring: parseRecurring,
    VAR_NAMES: VAR_NAMES,
    MONTHS_PT: MONTHS_PT,
    DOW_PT: DOW_PT,
    DOW_SHORT_PT: DOW_SHORT_PT
  };
});
