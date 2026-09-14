/*
 * Polaroide Studio
 *
 * App de página única para montar polaroides numa folha e exportar em PDF/PNG.
 * Roda inteiro no navegador: nada é enviado a servidor nenhum.
 *
 * Não tem build. Edite este arquivo direto; ele é carregado por index.html
 * como script clássico (funciona também abrindo o arquivo em file://).
 *
 * Mapa do arquivo, de cima para baixo:
 *   1. utilitários curtos
 *   2. limites e limpeza de arquivos (segurança)
 *   3. ícones (SVG desenhados à mão)
 *   4. constantes de layout (papéis, formatos, fontes, filtros)
 *   5. estado + persistência (localStorage p/ metadados, IndexedDB p/ blobs)
 *   6. importação de imagem (decode -> canvas -> jpeg, remove metadados)
 *   7. geometria e layout da folha
 *   8. render da tela (DOM)
 *   9. seleção / painel direito
 *  10. zoom e navegação de folhas
 *  11. histórico (desfazer/refazer)
 *  12. mutações do estado
 *  13. render em canvas -> PDF / PNG
 *  14. arquivo de projeto (.json)
 *  15. controles, seletor de cor, painéis, atalhos
 *  16. eventos globais + init
 *
 * Detalhes de segurança e arquitetura: pasta docs/.
 */
"use strict";

const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const MM=96/25.4;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const num=(v,d)=>{const n=+v;return Number.isFinite(n)?n:d;};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const loadImg=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src;});
const downloadBlob=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);};

/* segurança de arquivos */
const SAFE_IMG=/^image\/(jpeg|jpg|png|webp|gif|bmp|avif)$/i;
const MAX_BYTES=45*1024*1024;
const MAX_SIDE=12000;
const FULL_SIDE=3600;   // lado maior da imagem guardada para impressão (≥300 dpi até 30 cm)
const MAX_AREA=140*1000*1000;
function sanitizeText(v,max=500){
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}
function safeName(v){
  const n=sanitizeText(v,120).replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim();
  return n||'foto.jpg';
}

/* ---------- ícones (SVG autorais, injetados sem dados do usuário) ---------- */
const ICONS={
  polaroid:'<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="6" y="7" width="12" height="7" rx="1"/>',
  imageplus:'<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="1.7"/><path d="M4 15.5l4-3.6a2 2 0 0 1 2.7 0L20 19"/>',
  printer:'<path d="M7 9V3h10v6"/><rect x="6" y="14" width="12" height="7" rx="1"/><path d="M6 18H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/>',
  filepdf:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  filenew:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 12v6M9 15h6"/>',
  imagedown:'<rect x="3" y="3" width="18" height="13" rx="2.5"/><circle cx="8.5" cy="8" r="1.5"/><path d="M4 13l4-3.2a2 2 0 0 1 2.6 0L15 13"/><path d="M12 17v5m0 0l2.5-2.5M12 22l-2.5-2.5"/>',
  save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h7"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"/><path d="M3.2 9h17.6l-1.8 9.2A2 2 0 0 1 17 20H7a2 2 0 0 1-2-1.8z"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a6 6 0 0 1 0 12H8"/>',
  redo:'<path d="M15 14l5-5-5-5"/><path d="M20 9H9a6 6 0 0 0 0 12h7"/>',
  chevleft:'<path d="M15 5l-7 7 7 7"/>',
  chevright:'<path d="M9 5l7 7-7 7"/>',
  caret:'<path d="M9 6l6 6-6 6"/>',
  zoomin:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/>',
  zoomout:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M8 11h6"/>',
  fit:'<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/>',
  panelleft:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panelright:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:'<path d="M3 3l18 18"/><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2"/><path d="M9.9 4.2A11 11 0 0 1 12 4c6.5 0 10 7 10 7a17.7 17.7 0 0 1-3 4"/><path d="M6.6 6.6C3.9 8.2 2 12 2 12s3.6 7 10 7a11 11 0 0 0 4.3-.9"/>',
  more:'<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
  rotate:'<path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 4v5h-5"/>',
  flip:'<path d="M12 3v18"/><path d="M9 7 4 12l5 5z"/><path d="M15 7l5 5-5 5z"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  swap:'<path d="M16 4l4 4-4 4"/><path d="M20 8H8"/><path d="M8 20l-4-4 4-4"/><path d="M4 16h12"/>',
  trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M9 7V4h6v3"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.3-2.7 4"/><path d="M12 17h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  external:'<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/>',
  sliders:'<path d="M4 7h9M4 12h4M4 17h11"/><circle cx="16" cy="7" r="2.3"/><circle cx="10" cy="12" r="2.3"/><circle cx="18" cy="17" r="2.3"/>',
  page:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  scissors:'<circle cx="6" cy="7" r="2.3"/><circle cx="6" cy="17" r="2.3"/><path d="M8 8.4 20 17"/><path d="M8 15.6 20 7"/>',
  palette:'<path d="M12 3a9 9 0 1 0 0 18c1.6 0 1.9-1.1 1.2-2-.8-1-.3-2.2 1-2.2H17a4 4 0 0 0 4-4c0-4.5-4-7.8-9-7.8z"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/>',
  type:'<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  settings:'<circle cx="12" cy="12" r="3.1"/><path d="M10.6 3.3a1.5 1.5 0 0 1 2.8 0l.5 1.3a1.5 1.5 0 0 0 2.1.9l1.3-.5a1.5 1.5 0 0 1 1.9 2.6l-.9 1a1.5 1.5 0 0 0 0 2.2l.9 1a1.5 1.5 0 0 1-1.9 2.6l-1.3-.5a1.5 1.5 0 0 0-2.1.9l-.5 1.3a1.5 1.5 0 0 1-2.8 0l-.5-1.3a1.5 1.5 0 0 0-2.1-.9l-1.3.5a1.5 1.5 0 0 1-1.9-2.6l.9-1a1.5 1.5 0 0 0 0-2.2l-.9-1a1.5 1.5 0 0 1 1.9-2.6l1.3.5a1.5 1.5 0 0 0 2.1-.9z"/>',
  download:'<path d="M12 3v13"/><path d="M7 12l5 5 5-5"/><path d="M5 21h14"/>',
  drop:'<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="1.7"/><path d="M4 16l4.5-4a2 2 0 0 1 2.7 0L20 20"/>',
  cursor:'<path d="M5 3l6 16 2.2-6.8L20 10z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  sparkle:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
};

// Link para o acervo (galeria de recursos e ferramentas). Deixe '' para
// esconder o link; ajuste a URL para a página do seu acervo.
const ACERVO_URL = 'https://www.esmeraldapaper.com.br/ferramentas/';
const FEEDBACK_URL = 'https://www.esmeraldapaper.com.br/avaliar-ferramentas/?tool=polaroide';
function injectIcons(root=document){
  root.querySelectorAll('[data-i]').forEach(el=>{
    const g=ICONS[el.getAttribute('data-i')]; if(!g) return;
    el.insertAdjacentHTML('afterbegin',
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${g}</svg>`);
    el.removeAttribute('data-i');
  });
}

/* ---------- dados de layout ---------- */
// Papéis de impressão em mm.
const PAGE_SIZES={
  a4:{w:210,h:297}, letter:{w:215.9,h:279.4}, a3:{w:297,h:420}, a5:{w:148,h:210},
  f10x15:{w:101.6,h:152.4,photo:true}, f13x18:{w:127,h:177.8,photo:true},
};
// Margem mínima de segurança (mm) — nenhuma impressora chega até a borda.
const SAFE_MARGIN=5;
// papel fotográfico (10×15, 13×18) sai em impressora sem margem: aceita 0 mm
const minMargin=pageSize=>(PAGE_SIZES[pageSize]&&PAGE_SIZES[pageSize].photo)?0:SAFE_MARGIN;
// Medidas REAIS dos filmes (cartão inteiro e janela da foto). frame = borda
// lateral, top = borda de cima, cap = faixa de baixo. real:true → sai sempre
// no tamanho exato (o "encaixar na folha" só muda quantos cabem, nunca a medida).
const FORMATS={
  classic:  {label:'Polaroid 600 / i-Type — 88 × 107 mm',       w:88,   aw:1,  ah:1,  frame:4.5,  top:6,   cap:22,   real:true},
  sx70:     {label:'Polaroid SX-70 — 88 × 107 mm',              w:88,   aw:1,  ah:1,  frame:4.5,  top:6,   cap:22,   real:true},
  wide:     {label:'Polaroid Spectra — 102 × 101 mm',           w:102,  aw:92, ah:73, frame:5,    top:6,   cap:22,   real:true},
  go:       {label:'Polaroid Go — 54 × 67 mm',                  w:53.9, aw:47, ah:46, frame:3.45, top:4.3, cap:16.3, real:true},
  instaxMini:{label:'Instax Mini — 54 × 86 mm',                 w:54,   aw:46, ah:62, frame:4,    top:7,   cap:17,   real:true},
  instaxSq: {label:'Instax Square — 72 × 86 mm',                w:72,   aw:1,  ah:1,  frame:5,    top:7,   cap:17,   real:true},
  instaxWide:{label:'Instax Wide — 108 × 86 mm',                w:108,  aw:99, ah:62, frame:4.5,  top:7,   cap:17,   real:true},
  square10: {label:'Quadrado 10 × 10 cm',                       w:102,  aw:1,  ah:1,  frame:5,    top:5,   cap:5,    real:true},
  postcard: {label:'Retrato 10 × 15 cm',                        w:101.6,aw:2,  ah:3,  frame:5,    top:5,   cap:10,   real:true},
  modern:   {label:'Quadrado moderno (borda fina, ajustável)',   w:80,   aw:1,  ah:1,  frame:4,    top:4,   cap:5},
  custom:   {label:'Personalizado', custom:true},
};
// Fontes da legenda. As 3 primeiras são servidas de assets/fonts/ (mesmo
// domínio, font-src 'self') e só baixam quando escolhidas. O resto é pilha
// de fontes do sistema.
// Fontes da legenda: as MESMAS em qualquer aparelho — vêm do núcleo
// (vendor/core/fonts, OFL/Apache), servidas do próprio domínio. Antes a lista
// misturava fontes do sistema (cada computador imprimia diferente) e os
// arquivos de Caveat/Special Elite/Permanent Marker nem estavam no pacote.
const BASE_FONTS=[
  {label:'Manuscrita — Caveat',            v:"'Caveat',cursive"},
  {label:'Caligrafia — Dancing Script',    v:"'Dancing Script',cursive"},
  {label:'Datilografada — Special Elite',  v:"'Special Elite',monospace"},
  {label:'Marcador — Permanent Marker',    v:"'Permanent Marker',cursive"},
  {label:'Elegante — Playfair Display',    v:"'Playfair Display',serif"},
  {label:'Clássica — Lora',                v:"'Lora',serif"},
  {label:'Leitura — Merriweather',         v:"'Merriweather',serif"},
  {label:'Serifada — Tinos',               v:"'Tinos',serif"},
  {label:'Moderna — Montserrat',           v:"'Montserrat',sans-serif"},
  {label:'Sem serifa — Arimo',             v:"'Arimo',sans-serif"},
  {label:'Máquina de escrever — Cousine',  v:"'Cousine',monospace"},
];
// valores antigos → fonte equivalente do pacote (migração de projetos salvos)
const FONT_MIGRATE={Caveat:"'Caveat',cursive",'Special Elite':"'Special Elite',monospace",'Permanent Marker':"'Permanent Marker',cursive",
  'Segoe Script':"'Dancing Script',cursive",'Playfair Display':"'Playfair Display',serif",Georgia:"'Tinos',serif",'Iowan Old Style':"'Lora',serif",
  'Helvetica Neue':"'Arimo',sans-serif",'Trebuchet MS':"'Montserrat',sans-serif",'Courier New':"'Cousine',monospace",'Arial Narrow':"'Arimo',sans-serif",
  'Franklin Gothic Medium':"'Montserrat',sans-serif"};
// Estilos prontos de legenda (aplicam fonte + tamanho + variações de texto).
const CAPTION_STYLES={
  manuscrito:  {captionFont:"'Caveat',cursive",           captionSizePt:17, captionBold:false, captionItalic:false, captionUpper:false, captionSpacing:0,   captionShadow:false},
  datilografado:{captionFont:"'Special Elite',monospace",  captionSizePt:11, captionBold:false, captionItalic:false, captionUpper:false, captionSpacing:0.4, captionShadow:false},
  marcador:    {captionFont:"'Permanent Marker',cursive", captionSizePt:13, captionBold:false, captionItalic:false, captionUpper:false, captionSpacing:0,   captionShadow:false},
  etiqueta:    {captionFont:"'Montserrat',sans-serif", captionSizePt:10, captionBold:true, captionItalic:false, captionUpper:true, captionSpacing:1.6, captionShadow:false},
  editorial:   {captionFont:"'Playfair Display',serif",          captionSizePt:13, captionBold:false, captionItalic:true,  captionUpper:false, captionSpacing:0.2, captionShadow:false},
};
const CAPTION_STYLE_LABELS={manuscrito:'Manuscrito',datilografado:'Datilografado',marcador:'Marcador',etiqueta:'Etiqueta',editorial:'Editorial'};
const FILTER0={preset:'original',brightness:1,contrast:1,saturate:1,hue:0,sepia:0,grayscale:0,vignette:0};
const PRESETS={
  original:{brightness:1,contrast:1,saturate:1,hue:0,sepia:0,grayscale:0,vignette:0},
  bw:      {brightness:1.03,contrast:1.12,saturate:1,hue:0,sepia:0,grayscale:1,vignette:0.12},
  sepia:   {brightness:1.05,contrast:1.05,saturate:1.1,hue:0,sepia:0.72,grayscale:0,vignette:0.14},
  vintage: {brightness:1.08,contrast:0.92,saturate:1.18,hue:6,sepia:0.34,grayscale:0,vignette:0.34},
  fade:    {brightness:1.13,contrast:0.8,saturate:0.85,hue:0,sepia:0.08,grayscale:0,vignette:0},
  vivid:   {brightness:1.02,contrast:1.13,saturate:1.4,hue:0,sepia:0,grayscale:0,vignette:0.08},
  cool:    {brightness:1.03,contrast:1.06,saturate:1.02,hue:-14,sepia:0,grayscale:0,vignette:0.1},
};
const PRESET_LABELS={original:'Original',bw:'P&B',sepia:'Sépia',vintage:'Vintage',fade:'Desbotado',vivid:'Vívido',cool:'Frio'};

const DEFAULTS={
  format:'classic', polaroidWidthMm:88, aspectW:1, aspectH:1, frameMm:4.5, frameTopMm:6, captionMm:22, fmtV:2,
  radiusMm:1.5, tiltDeg:0,
  pageSize:'a4', landscape:false, marginMm:10, gapMm:8,
  autoFit:true, columns:'auto', rows:'auto', align:'center',
  cardLine:false, cardLineColor:'#c9c9c9', cornerMarks:true, markOffset:2, markLen:4,
  captionFont:BASE_FONTS[0].v, captionSizePt:14, captionColor:'#222222',
  captionBold:false, captionItalic:false, captionUpper:false, captionSpacing:0, captionShadow:false,
  tape:'none', tapeColor:'#e7dfce', filterPreset:'original',
  cardColor:'#ffffff', pageBg:'#ffffff', pageBg2:'#e9e2d3', bgGradient:false, bgAngle:160,
  screenShadow:true, acrylic:false, exportDPI:300,
  pdfColor:'rgb', printGamma:1, backSide:'none',
};
const COLOR_DEFAULTS={cardColor:'#ffffff',pageBg:'#ffffff',pageBg2:'#e9e2d3',captionColor:'#222222',cardLineColor:'#c9c9c9',tapeColor:'#e7dfce'};
const HEX=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/* ---------- TEMPLATES (tela inicial) ----------
   Um template é uma configuração COMPLETA pronta: formato + folha + efeito +
   cores + legenda. Aplicar redefine tudo (mantém só acrílico e resolução).
   Todos encaixam na folha automaticamente, sem polaroide cortado. */
const TEMPLATES=[
  {id:'classico', name:'Polaroid clássico', desc:'A4 · 88 × 107 mm reais · marcas de corte',
   settings:{format:'classic',autoFit:true,columns:'auto',rows:'auto',marginMm:8,gapMm:12,cornerMarks:true}},
  {id:'memories', name:'Recordações', desc:'torto · fita · fundo bege · manuscrita',
   settings:{format:'classic',autoFit:true,columns:'auto',rows:'auto',tiltDeg:3,tape:'tape-2',tapeColor:'#e7dfce',
     cornerMarks:false,gapMm:11,pageBg:'#efe9dd',captionFont:"'Caveat',cursive",captionSizePt:17}},
  {id:'scrapbook', name:'Scrapbook', desc:'quadrado · brads · marcador',
   settings:{format:'sx70',autoFit:true,columns:'auto',rows:'auto',tiltDeg:4,tape:'brad-4',cornerMarks:false,
     gapMm:12,pageBg:'#f0e7d6',captionFont:"'Permanent Marker',cursive",captionSizePt:12}},
  {id:'minimal', name:'Minimalista', desc:'borda fina · sem legenda · contorno',
   settings:{format:'modern',autoFit:true,columns:'3',rows:'4',captionMm:0,gapMm:5,marginMm:12,
     cornerMarks:false,cardLine:true,cardLineColor:'#d9d3c6'}},
  {id:'instax', name:'Instax Mini', desc:'cartela · vários por folha',
   settings:{format:'instaxMini',autoFit:true,columns:'auto',rows:'auto',gapMm:12,marginMm:8,cornerMarks:true}},
  {id:'contato', name:'Folha de contato', desc:'grade miúda · sem legenda',
   settings:{format:'modern',autoFit:true,columns:'6',rows:'8',captionMm:0,gapMm:3,marginMm:8,
     cornerMarks:false,cardLine:true,cardLineColor:'#d9d3c6'}},
  {id:'retrato', name:'Retrato 10×15', desc:'papel 10 × 15 · 1 por folha, sem corte',
   settings:{format:'postcard',autoFit:true,columns:'auto',rows:'auto',pageSize:'f10x15',gapMm:0,marginMm:0,cornerMarks:false}},
];

/* ---------- MODELOS DE FOLHA (painel esquerdo) ----------
   Um modelo só mexe no DESENHO DA FOLHA — papel, quantas colunas/linhas por
   folha, margens e acabamento de corte. Cores, efeitos, legenda e o formato do
   polaroide continuam como estão. É uma mesclagem parcial, não um reset. */
const LAYOUTS=[
  {id:'a4auto',   name:'A4 · automático',       settings:{pageSize:'a4',landscape:false,autoFit:true,columns:'auto',rows:'auto',marginMm:10,gapMm:8,cornerMarks:true,cardLine:false}},
  {id:'a4_3x3',   name:'A4 · 3 × 3',            settings:{pageSize:'a4',landscape:false,autoFit:true,columns:'3',rows:'3',marginMm:10,gapMm:6,cornerMarks:true,cardLine:false}},
  {id:'a4_2x3',   name:'A4 · 2 × 3 (grande)',   settings:{pageSize:'a4',landscape:false,autoFit:true,columns:'2',rows:'3',marginMm:14,gapMm:10,cornerMarks:true,cardLine:false}},
  {id:'a4_4x5',   name:'A4 · 4 × 5 (miúdo)',    settings:{pageSize:'a4',landscape:false,autoFit:true,columns:'4',rows:'5',marginMm:8,gapMm:4,cornerMarks:true,cardLine:false}},
  {id:'a4land_5x3',name:'A4 deitado · 5 × 3',   settings:{pageSize:'a4',landscape:true,autoFit:true,columns:'5',rows:'3',marginMm:10,gapMm:6,cornerMarks:true,cardLine:false}},
  {id:'letter_3x3',name:'Carta · 3 × 3',        settings:{pageSize:'letter',landscape:false,autoFit:true,columns:'3',rows:'3',marginMm:10,gapMm:6,cornerMarks:true,cardLine:false}},
  {id:'a3_4x5',   name:'A3 · 4 × 5',            settings:{pageSize:'a3',landscape:false,autoFit:true,columns:'4',rows:'5',marginMm:12,gapMm:8,cornerMarks:true,cardLine:false}},
  {id:'contorno', name:'A4 · 3 × 4 com contorno',settings:{pageSize:'a4',landscape:false,autoFit:true,columns:'3',rows:'4',marginMm:8,gapMm:5,cornerMarks:false,cardLine:true,cardLineColor:'#cfc8ba'}},
];
