/* packages/core/pdf.js — EPPdf
 *
 * Escritor de PDF único das ferramentas. Recebe as páginas já desenhadas
 * (operadores PDF) e serializa com:
 *   - fontes TrueType INCORPORADAS em subconjunto (Type0 / CIDFontType2,
 *     Identity-H, ToUnicode) — qualquer caractere da fonte funciona;
 *   - MediaBox, TrimBox (corte) e BleedBox (sangria) por página;
 *   - imagens já codificadas (JPEG DCT ou Flate, com SMask);
 *   - opacidades (ExtGState);
 *   - modo PDF/X-4: versão 1.6, OutputIntent com o perfil ICC de saída
 *     embutido, metadados XMP (pdfxid), /Trapped, /ID.
 *
 * Nas páginas, o texto chega com marcadores que só são resolvidos aqui,
 * depois que as fontes estão carregadas:
 *     /@F:<face> 9 Tf ... <@U:48,6f,e7> Tj
 *
 *   const bytes = await EPPdf.build({ pages, fonts, images, gs, meta, pdfx, deflate })
 */
(function (root) {
  "use strict";

  const enc = new TextEncoder();
  const hex4 = n => n.toString(16).toUpperCase().padStart(4, '0');
  const pdfDate = d => {
    const p = n => String(n).padStart(2, '0');
    return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  };
  const isoDate = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const pdfText = s => '(' + String(s == null ? '' : s).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7E]/g, '?') + ')';
  // texto Unicode para o dicionário Info (UTF-16BE com BOM)
  const pdfUtf16 = s => {
    let h = 'FEFF';
    for (const ch of String(s || '')) { const cp = ch.codePointAt(0); if (cp > 0xFFFF) { const v = cp - 0x10000; h += hex4(0xD800 + (v >> 10)) + hex4(0xDC00 + (v & 0x3FF)); } else h += hex4(cp); }
    return '<' + h + '>';
  };
  const xmlEsc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  function randomHex(n) {
    let s = '';
    const a = new Uint8Array(n);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(a); else for (let i = 0; i < n; i++) a[i] = Math.random() * 256;
    a.forEach(b => { s += b.toString(16).padStart(2, '0'); });
    return s.toUpperCase();
  }
  const subsetTag = () => Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

  function toUnicodeCMap(pairs) {
    const lines = [];
    const arr = [...pairs].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < arr.length; i += 100) {
      const chunk = arr.slice(i, i + 100);
      lines.push(`${chunk.length} beginbfchar`);
      chunk.forEach(([gid, cp]) => {
        let u = '';
        if (cp > 0xFFFF) { const v = cp - 0x10000; u = hex4(0xD800 + (v >> 10)) + hex4(0xDC00 + (v & 0x3FF)); } else u = hex4(cp);
        lines.push(`<${hex4(gid)}> <${u}>`);
      });
      lines.push('endbfchar');
    }
    return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n` +
      `/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${lines.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  }

  /*
   * opts.pages:  [{ content: string, wPt, hPt, trimBox?: [x0,y0,x1,y1], bleedBox?: [...], transparency?: bool }]
   * opts.fonts:  { resolve(faceId) -> EPTtf font }   (fontes já carregadas)
   * opts.images: [{ name, dict: '<< ... >>' (sem /Length), bytes: Uint8Array, smask?: {dict, bytes} }]
   * opts.gs:     [{ name, alpha }]
   * opts.meta:   { title, author, subject, creator, keywords }
   * opts.pdfx:   null | { icc: Uint8Array, identifier: 'FOGRA39', info: '...', registry: 'http://www.color.org' }
   * opts.deflate: async (Uint8Array) => Uint8Array|null
   */
  async function build(opts) {
    const pages = opts.pages || [];
    const deflate = opts.deflate || (async () => null);
    const pdfx = opts.pdfx || null;
    const meta = opts.meta || {};
    const now = new Date();

    // ---- 1. resolve marcadores de fonte/texto ----
    const faceName = new Map();      // faceId -> 'F1'
    const faceUse = new Map();       // faceId -> { font, gids:Set, uni: Map gid->cp }
    const faceOf = id => {
      let u = faceUse.get(id);
      if (!u) {
        const font = opts.fonts.resolve(id);
        if (!font) throw new Error('EPPdf: fonte não carregada ' + id);
        u = { font, gids: new Set(), uni: new Map() };
        faceUse.set(id, u); faceName.set(id, 'F' + (faceName.size + 1));
      }
      return u;
    };
    const resolved = pages.map(pg => {
      let curFace = null;
      return String(pg.content)
        .replace(/\/@F:([A-Za-z0-9_\-]+)|<@U:([0-9a-fA-F,]*)>/g, (m, face, uni) => {
          if (face) { curFace = face; faceOf(face); return '/' + faceName.get(face); }
          const u = faceOf(curFace || 'sans-r');
          let h = '';
          (uni ? uni.split(',') : []).forEach(x => {
            const cp = parseInt(x, 16);
            const g = u.font.gid(cp) || u.font.gid(0x3F);
            u.gids.add(g); if (!u.uni.has(g)) u.uni.set(g, cp);
            h += hex4(g);
          });
          return '<' + h + '>';
        });
    });

    // ---- 2. objetos ----
    const objs = [];                  // [num] -> {dict, stream?}
    let next = 1;
    const alloc = () => next++;
    const set = (num, dict, stream) => { objs[num] = { dict, stream }; };
    const CATALOG = alloc(), PAGES = alloc(), RES = alloc(), INFO = alloc();

    // fontes
    const fontRes = [];
    for (const [id, u] of faceUse) {
      const f = u.font, tag = subsetTag(), base = `${tag}+${f.psName}`;
      const sub = (root.EPTtf || require('./ttf.js')).subset(f, u.gids);
      const z = await deflate(sub);
      const ff = alloc(); set(ff, `<< /Length1 ${sub.length}${z ? ' /Filter /FlateDecode' : ''} >>`, z || sub);
      const k = 1000 / f.unitsPerEm;
      const flags = 4 | (f.fixed ? 1 : 0) | (f.italicAngle ? 64 : 0);
      const fd = alloc();
      set(fd, `<< /Type /FontDescriptor /FontName /${base} /Flags ${flags} /FontBBox [${f.bbox.map(v => Math.round(v * k)).join(' ')}] ` +
        `/ItalicAngle ${f.italicAngle.toFixed(2)} /Ascent ${Math.round(f.ascent * k)} /Descent ${Math.round(f.descent * k)} ` +
        `/CapHeight ${Math.round(f.capHeight * k)} /StemV ${f.weight >= 600 ? 120 : 80} /FontFile2 ${ff} 0 R >>`);
      const gids = [...u.gids].sort((a, b) => a - b);
      const W = gids.map(g => `${g} [${Math.round(f.advance(g) * k)}]`).join(' ');
      const cid = alloc();
      set(cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${base} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
        `/FontDescriptor ${fd} 0 R /DW ${Math.round(f.advance(0) * k)} /W [${W}] /CIDToGIDMap /Identity >>`);
      const cmapBytes = enc.encode(toUnicodeCMap(u.uni));
      const cz = await deflate(cmapBytes);
      const tu = alloc(); set(tu, `<<${cz ? ' /Filter /FlateDecode' : ''} >>`, cz || cmapBytes);
      const t0 = alloc();
      set(t0, `<< /Type /Font /Subtype /Type0 /BaseFont /${base} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
      fontRes.push(`/${faceName.get(id)} ${t0} 0 R`);
    }
    // imagens
    const imgRes = [];
    for (const im of opts.images || []) {
      let smaskRef = '';
      if (im.smask) { const sm = alloc(); set(sm, im.smask.dict, im.smask.bytes); smaskRef = ` /SMask ${sm} 0 R`; }
      const num = alloc();
      set(num, im.dict.replace(/>>\s*$/, `${smaskRef} >>`), im.bytes);
      imgRes.push(`/${im.name} ${num} 0 R`);
    }
    // opacidades
    const gsRes = [];
    for (const g of opts.gs || []) { const num = alloc(); set(num, `<< /Type /ExtGState /ca ${g.alpha} /CA ${g.alpha} >>`); gsRes.push(`/${g.name} ${num} 0 R`); }
    set(RES, `<< /ProcSet [/PDF /Text /ImageB /ImageC] ${fontRes.length ? `/Font << ${fontRes.join(' ')} >>` : ''} ` +
      `${imgRes.length ? `/XObject << ${imgRes.join(' ')} >>` : ''} ${gsRes.length ? `/ExtGState << ${gsRes.join(' ')} >>` : ''} >>`);

    // conteúdo (dedupe de páginas idênticas) + páginas
    const contentByText = new Map(), kids = [];
    const cmykGroup = pdfx ? ' /Group << /Type /Group /S /Transparency /CS /DeviceCMYK >>' : '';
    const box = b => `[${b.map(v => (+v).toFixed(3)).join(' ')}]`;
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i], text = resolved[i];
      let cnum = contentByText.get(text);
      if (!cnum) {
        const raw = enc.encode(text), z = await deflate(raw);
        cnum = alloc(); set(cnum, `<<${z ? ' /Filter /FlateDecode' : ''} >>`, z && z.length < raw.length ? z : raw);
        if (!(z && z.length < raw.length)) objs[cnum].dict = '<< >>';
        contentByText.set(text, cnum);
      }
      const media = [0, 0, pg.wPt, pg.hPt];
      const trim = pg.trimBox || media, bleed = pg.bleedBox || trim;
      const pnum = alloc();
      set(pnum, `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox ${box(media)} /BleedBox ${box(bleed)} /TrimBox ${box(trim)} ` +
        `/Resources ${RES} 0 R /Contents ${cnum} 0 R${pg.transparency ? cmykGroup : ''} >>`);
      kids.push(pnum);
    }
    set(PAGES, `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`);

    const title = meta.title || 'Documento';
    const producer = 'Esmeralda Paper EPPdf';
    const creator = meta.creator || 'Esmeralda Paper';
    set(INFO, `<< /Title ${pdfUtf16(title)} /Author ${pdfUtf16(meta.author || 'Esmeralda Paper')} /Creator ${pdfUtf16(creator)} ` +
      `/Producer ${pdfText(producer)} /CreationDate (${pdfDate(now)}) /ModDate (${pdfDate(now)}) /Trapped /False` +
      (pdfx ? ` /GTS_PDFXVersion (PDF/X-4)` : '') + ` >>`);

    let catalogExtra = '';
    if (pdfx) {
      const docId = randomHex(16), instId = randomHex(16);
      const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/">
   <dc:format>application/pdf</dc:format>
   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEsc(title)}</rdf:li></rdf:Alt></dc:title>
   <dc:creator><rdf:Seq><rdf:li>${xmlEsc(meta.author || 'Esmeralda Paper')}</rdf:li></rdf:Seq></dc:creator>
   <xmp:CreateDate>${isoDate(now)}</xmp:CreateDate>
   <xmp:ModifyDate>${isoDate(now)}</xmp:ModifyDate>
   <xmp:MetadataDate>${isoDate(now)}</xmp:MetadataDate>
   <xmp:CreatorTool>${xmlEsc(creator)}</xmp:CreatorTool>
   <pdf:Producer>${xmlEsc(producer)}</pdf:Producer>
   <pdf:Trapped>False</pdf:Trapped>
   <xmpMM:DocumentID>uuid:${docId}</xmpMM:DocumentID>
   <xmpMM:InstanceID>uuid:${instId}</xmpMM:InstanceID>
   <xmpMM:VersionID>1</xmpMM:VersionID>
   <xmpMM:RenditionClass>default</xmpMM:RenditionClass>
   <pdfxid:GTS_PDFXVersion>PDF/X-4</pdfxid:GTS_PDFXVersion>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
      const md = alloc(); set(md, `<< /Type /Metadata /Subtype /XML >>`, enc.encode(xmp));
      const iz = await deflate(pdfx.icc);
      const icc = alloc(); set(icc, `<< /N 4${iz ? ' /Filter /FlateDecode' : ''} >>`, iz || pdfx.icc);
      const oi = alloc();
      set(oi, `<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier ${pdfText(pdfx.identifier || 'FOGRA39')} ` +
        `/RegistryName ${pdfText(pdfx.registry || 'http://www.color.org')} /Info ${pdfText(pdfx.info || pdfx.identifier || 'FOGRA39')} ` +
        `/OutputCondition ${pdfText(pdfx.info || '')} /DestOutputProfile ${icc} 0 R >>`);
      catalogExtra = ` /Metadata ${md} 0 R /OutputIntents [${oi} 0 R]`;
    }
    set(CATALOG, `<< /Type /Catalog /Pages ${PAGES} 0 R${catalogExtra} >>`);

    // ---- 3. serialização ----
    const chunks = []; let len = 0;
    const out = d => { const u = d instanceof Uint8Array ? d : enc.encode(d); chunks.push(u); len += u.length; };
    out(`%PDF-${pdfx ? '1.6' : '1.4'}\n`); out(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const off = [];
    for (let n = 1; n < next; n++) {
      const o = objs[n]; if (!o) continue;
      off[n] = len;
      if (o.stream) {
        const dict = o.dict.replace(/>>\s*$/, ` /Length ${o.stream.length} >>`);
        out(`${n} 0 obj\n${dict}\nstream\n`); out(o.stream); out('\nendstream\nendobj\n');
      } else out(`${n} 0 obj\n${o.dict}\nendobj\n`);
    }
    const xref = len, id = randomHex(16);
    out(`xref\n0 ${next}\n0000000000 65535 f \n`);
    for (let n = 1; n < next; n++) out(String(off[n] || 0).padStart(10, '0') + ' 00000 n \n');
    out(`trailer\n<< /Size ${next} /Root ${CATALOG} 0 R /Info ${INFO} 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`);
    const buf = new Uint8Array(len); let p = 0;
    for (const c of chunks) { buf.set(c, p); p += c.length; }
    return buf;
  }

  // codifica texto como marcador (resolvido em build) — usado pela caneta PDF
  function textToken(str) {
    const cps = [];
    for (const ch of String(str == null ? '' : str)) cps.push(ch.codePointAt(0).toString(16));
    return `<@U:${cps.join(',')}>`;
  }

  root.EPPdf = { build, textToken };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPPdf;
})(typeof window !== 'undefined' ? window : globalThis);
