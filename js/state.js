/* Polaroide Studio — js/state.js
   estado, persistência (localStorage + IndexedDB), validação
   (parte de app; carregado em ordem por index.html) */
"use strict";


// Recebe settings de qualquer origem (localStorage, projeto .json, snapshot de
// undo) e devolve um objeto são: converte campos antigos, força faixas
// numéricas, valida cores (só hex) e a fonte (só da lista). Isso também é
// barreira de segurança — nada daqui vai pra CSS/canvas sem passar por aqui.
function migrateSettings(s){
  if(s.cutMode!==undefined){ s.cardLine=s.cutMode==='line'; s.cornerMarks=s.cutMode==='marks'; delete s.cutMode; }
  const hex=(v,d)=>HEX.test(v)?v:d;
  s.polaroidWidthMm=clamp(num(s.polaroidWidthMm,88),10,400);
  s.frameMm=clamp(num(s.frameMm,6),0,120);
  s.frameTopMm=clamp(num(s.frameTopMm,s.frameMm),0,120);
  // projetos antigos: formatos prontos tinham medidas erradas (clássica 88 de
  // largura com foto 76×76 e 105 de altura, Instax Wide com 99…). Reaplica as
  // medidas reais do filme uma única vez. (A8)
  if(s.fmtV!==2){ const F=FORMATS[s.format]; if(F&&!F.custom) Object.assign(s,{polaroidWidthMm:F.w,aspectW:F.aw,aspectH:F.ah,frameMm:F.frame,frameTopMm:F.top,captionMm:F.cap}); else s.frameTopMm=s.frameMm; s.fmtV=2; }
  s.pdfColor=s.pdfColor==='cmyk'?'cmyk':'rgb';
  s.printGamma=clamp(num(s.printGamma,1),1,1.4);
  s.backSide=['none','caption','lines'].includes(s.backSide)?s.backSide:'none';
  s.captionMm=clamp(num(s.captionMm,23),0,160);
  s.aspectW=clamp(num(s.aspectW,1),1,100); s.aspectH=clamp(num(s.aspectH,1),1,100);
  s.radiusMm=clamp(num(s.radiusMm,1.5),0,40);
  s.tiltDeg=clamp(num(s.tiltDeg,0),0,20);
  s.pageSize=PAGE_SIZES[s.pageSize]?s.pageSize:'a4';
  s.marginMm=clamp(num(s.marginMm,10),minMargin(s.pageSize),60);   // nunca abaixo da margem de segurança (0 em papel fotográfico)
  s.gapMm=clamp(num(s.gapMm,8),0,60);
  s.markOffset=clamp(num(s.markOffset,2),0,40);
  s.markLen=clamp(num(s.markLen,4),0,40);
  s.captionSizePt=clamp(num(s.captionSizePt,14),4,96);
  s.captionSpacing=clamp(num(s.captionSpacing,0),-2,10);
  s.captionUpper=!!s.captionUpper; s.captionShadow=!!s.captionShadow;
  // efeito de canto: compat com os valores antigos só de fita (2/4/top)
  if(s.tape==='2') s.tape='tape-2';
  else if(s.tape==='4') s.tape='tape-4';
  else if(s.tape==='top') s.tape='tape-top';
  s.tape=['none',
    'tape-2','tape-4','tape-top',
    'staple-2','staple-4','staple-top',
    'brad-2','brad-4','brad-top',
    'pin-2','pin-top'].includes(s.tape)?s.tape:'none';
  s.exportDPI=clamp(Math.round(num(s.exportDPI,300)),72,600);
  s.filterPreset=PRESETS[s.filterPreset]?s.filterPreset:'original';
  s.acrylic=s.acrylic!==false;
  s.autoFit=s.autoFit!==false;
  s.bgGradient=!!s.bgGradient;
  s.bgAngle=clamp(Math.round(num(s.bgAngle,160)),0,360);
  s.pageSize=PAGE_SIZES[s.pageSize]?s.pageSize:'a4';
  s.landscape=!!s.landscape;
  s.align=s.align==='left'?'left':'center';
  const grid=v=>(v==='auto'||v==null)?'auto':String(clamp(Math.round(num(v,3)),1,12));
  s.columns=grid(s.columns);
  s.rows=grid(s.rows);
  s.format=FORMATS[s.format]?s.format:'custom';
  s.cardColor=hex(s.cardColor,'#ffffff'); s.pageBg=hex(s.pageBg,'#ffffff');
  s.pageBg2=hex(s.pageBg2,'#e9e2d3');
  s.captionColor=hex(s.captionColor,'#222222'); s.cardLineColor=hex(s.cardLineColor,'#c9c9c9');
  s.tapeColor=hex(s.tapeColor,'#e7dfce');
  s.cardLine=!!s.cardLine; s.cornerMarks=!!s.cornerMarks;
  s.captionBold=!!s.captionBold; s.captionItalic=!!s.captionItalic;
  s.screenShadow=s.screenShadow!==false;
  if(!BASE_FONTS.map(f=>f.v).includes(s.captionFont)){
    const first=String(s.captionFont||'').split(',')[0].replace(/["']/g,'').trim();
    s.captionFont=FONT_MIGRATE[first]||BASE_FONTS[0].v;
  }
  // fundo, marca d'água e estilo da legenda no modelo único do núcleo
  // (background.js / watermark.js / text-fx.js). Projetos antigos: a cor ou o
  // degradê da folha e o espaçamento/sombra da legenda viram o formato novo.
  if(!s.designV){
    const b=s.bg&&typeof s.bg==='object'?s.bg:null;
    if(!(b&&b.kind&&b.kind!=='none')){
      if(s.bgGradient) s.bg={kind:'gradient',c1:s.pageBg,c2:s.pageBg2,angle:s.bgAngle};
      else if(HEX.test(s.pageBg||'')&&s.pageBg.toLowerCase()!=='#ffffff') s.bg={kind:'color',c1:s.pageBg};
    }
    const fx=s.capFx&&typeof s.capFx==='object'?{...s.capFx}:{};
    if(+s.captionSpacing && fx.ls==null) fx.ls=(+s.captionSpacing*25.4/96)/(s.captionSizePt/(72/25.4));
    if(s.captionShadow && !fx.sh) Object.assign(fx,{sh:'#000000',shd:0.25,sho:0.3});
    s.capFx=fx;
    s.designV=1;
  }
  delete s.captionSpacing; delete s.captionShadow;
  s.bg=EPBackground.clean(s.bg);
  s.wm=EPWatermark.clean(s.wm);
  s.capFx=EPTextFx.clean(s.capFx);
  delete s.capFx.fam; delete s.capFx.color; delete s.capFx.bold; delete s.capFx.italic; delete s.capFx.upper; delete s.capFx.s; delete s.capFx.hide;
  s.extras=cleanExtras(s.extras);
  return s;
}
// textos, ilustrações e imagens soltos na folha: page = índice da folha, ou -1 (todas)
const DATA_IMG=/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
function cleanExtras(raw){
  if(!Array.isArray(raw)) return [];
  const isArt=id=>typeof EPArt!=='undefined'?EPArt.isId(id):/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id||'');
  return raw.slice(0,120).map(x=>{
    x=x&&typeof x==='object'?x:{};
    const type=['image','art'].includes(x.type)?x.type:'text';
    return {...EPTextFx.clean(x),
      id:/^[A-Za-z0-9_-]{1,24}$/.test(x.id||'')?x.id:uid(), type,
      page:Number.isInteger(x.page)&&x.page>=-1&&x.page<400?x.page:-1,
      text:type==='text'?sanitizeText(x.text||'',400):'',
      art:type==='art'&&isArt(x.art)?x.art:'',
      src:type==='image'&&typeof x.src==='string'&&x.src.length<4e6&&DATA_IMG.test(x.src)?x.src:''};
  }).filter(x=>x.type==='text'||x.art||x.src);
}
const KEY='polaroide-a4-v2';
const UIKEY='polaroide-ui-v1';

let state={settings:{...DEFAULTS},photos:[]};
let selectedId=null, zoom=.55, userZoomed=false, dragId=null, currentPage=0;
let idbOK=true, idbWarned=false;
let zen=false;
const uiState={left:true,right:true};
const media={};
const stage=$('#stage'), sheetsEl=$('#sheets'), appEl=$('#app');

/* ================= IndexedDB ================= */
const DB=(()=>{
  let p;
  const open=()=>p||(p=new Promise((res,rej)=>{
    const r=indexedDB.open('polaroide-a4',1);
    r.onupgradeneeded=()=>r.result.createObjectStore('media');
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  }));
  const store=async m=>(await open()).transaction('media',m).objectStore('media');
  const wrap=req=>new Promise((res,rej)=>{req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error);});
  return{
    get:async k=>wrap(await store('readonly').then(s=>s.get(k))),
    set:async (k,v)=>wrap(await store('readwrite').then(s=>s.put(v,k))),
    del:async k=>wrap(await store('readwrite').then(s=>s.delete(k))),
    keys:async ()=>wrap(await store('readonly').then(s=>s.getAllKeys())),
  };
})();
function idbFail(e){ idbOK=false; console.warn('IDB indisponível',e);
  if(!idbWarned){ idbWarned=true;
    toast('Aviso: este navegador não guarda as fotos ao fechar. Use "Salvar projeto".'); } }

/* ================= persistência ================= */
let saveT;
function save(){
  clearTimeout(saveT);
  saveT=setTimeout(()=>{
    try{ localStorage.setItem(KEY,JSON.stringify({settings:state.settings,photos:state.photos.map(p=>({...p}))})); }catch(e){}
  },350);
}
async function loadProject(){
  let meta;
  try{ meta=JSON.parse(localStorage.getItem(KEY)||'null'); }catch(e){}
  if(!meta||typeof meta!=='object') return;
  state={settings:migrateSettings({...DEFAULTS,...(meta.settings&&typeof meta.settings==='object'?meta.settings:{})}),
         photos:Array.isArray(meta.photos)?meta.photos.slice(0,400):[]};
  state.photos.forEach(normPhoto);
  // Achado: quando o IndexedDB perde os registros (armazenamento limpo pelo
  // navegador, aba anônima fechada, pouco espaço em disco) mas o
  // localStorage com a lista/legendas sobrevive, as fotos voltavam como
  // ícone de imagem quebrada sem nenhuma explicação — a pessoa nem sabia
  // que precisava reenviar. idbFail() só cobria erro de LEITURA, não
  // "achei a chave, mas o registro não existe".
  let missing=0;
  for(const ph of state.photos){
    try{ const rec=idbOK?await DB.get(ph.id):null; if(rec) hydrate(ph.id,rec); else missing++; }catch(e){ idbFail(e); missing++; }
  }
  if(missing) toast(`${missing} foto${missing===1?'':'s'} não ${missing===1?'foi encontrada':'foram encontradas'} neste navegador — precisa trocar${missing===1?'':' as marcadas'}.`);
}
function normPhoto(p){
  p.caption=sanitizeText(p.caption,500);
  p.zoomF=clamp(num(p.zoomF,1),.2,6);
  p.ox=clamp(num(p.ox,0),-95,95); p.oy=clamp(num(p.oy,0),-95,95);
  p.rot=clamp(num(p.rot,0),-45,45);
  p.flipH=!!p.flipH;
  p.taken=/^\d{4}-\d{2}-\d{2}$/.test(p.taken||'')?p.taken:'';
  p.seed=(typeof p.seed==='number'&&p.seed>=0&&p.seed<=1)?p.seed:Math.random();
  p.natW=clamp(num(p.natW,1000),1,MAX_SIDE); p.natH=clamp(num(p.natH,1000),1,MAX_SIDE);
  const f=(p.filter&&typeof p.filter==='object')?p.filter:{};
  p.filter={
    preset:typeof f.preset==='string'?f.preset.slice(0,24):'original',
    brightness:clamp(num(f.brightness,1),.2,2),
    contrast:clamp(num(f.contrast,1),.2,2),
    saturate:clamp(num(f.saturate,1),0,3),
    hue:clamp(num(f.hue,0),-180,180),
    sepia:clamp(num(f.sepia,0),0,1),
    grayscale:clamp(num(f.grayscale,0),0,1),
    vignette:clamp(num(f.vignette,0),0,1),
  };
  if(!p.id) p.id=uid();
}
function hydrate(id,rec){
  const fullURL=URL.createObjectURL(rec.full);
  const previewURL=URL.createObjectURL(rec.preview||rec.full);
  media[id]={full:rec.full,fullURL,previewURL,natW:rec.natW,natH:rec.natH,name:rec.name};
}
