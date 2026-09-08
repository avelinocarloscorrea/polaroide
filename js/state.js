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
  s.captionMm=clamp(num(s.captionMm,23),0,160);
  s.aspectW=clamp(num(s.aspectW,1),1,100); s.aspectH=clamp(num(s.aspectH,1),1,100);
  s.radiusMm=clamp(num(s.radiusMm,1.5),0,40);
  s.tiltDeg=clamp(num(s.tiltDeg,0),0,20);
  s.marginMm=clamp(num(s.marginMm,12),0,120);
  s.gapMm=clamp(num(s.gapMm,8),0,120);
  s.markOffset=clamp(num(s.markOffset,2),0,40);
  s.markLen=clamp(num(s.markLen,4),0,40);
  s.captionSizePt=clamp(num(s.captionSizePt,14),4,96);
  s.captionSpacing=clamp(num(s.captionSpacing,0),-2,10);
  s.captionUpper=!!s.captionUpper; s.captionShadow=!!s.captionShadow;
  // efeito de canto: compat com os valores antigos só de fita (2/4/top)
  if(s.tape==='2') s.tape='tape-2';
  else if(s.tape==='4') s.tape='tape-4';
  else if(s.tape==='top') s.tape='tape-top';
  s.tape=['none','tape-2','tape-4','tape-top','staple-2','staple-4','staple-top'].includes(s.tape)?s.tape:'none';
  s.exportDPI=clamp(Math.round(num(s.exportDPI,300)),72,600);
  s.igScale=clamp(Math.round(num(s.igScale,2)),1,4);
  s.acrylic=s.acrylic!==false;
  s.bgGradient=!!s.bgGradient;
  s.bgAngle=clamp(Math.round(num(s.bgAngle,160)),0,360);
  s.pageSize=PAGE_SIZES[s.pageSize]?s.pageSize:'a4';
  s.landscape=!!s.landscape;
  s.align=s.align==='left'?'left':'center';
  s.columns=(s.columns==='auto'||s.columns==null)?'auto':String(clamp(Math.round(num(s.columns,1)),1,20));
  s.format=FORMATS[s.format]?s.format:'custom';
  s.cardColor=hex(s.cardColor,'#ffffff'); s.pageBg=hex(s.pageBg,'#ffffff');
  s.pageBg2=hex(s.pageBg2,'#e9e2d3');
  s.captionColor=hex(s.captionColor,'#222222'); s.cardLineColor=hex(s.cardLineColor,'#c9c9c9');
  s.tapeColor=hex(s.tapeColor,'#e7dfce');
  s.cardLine=!!s.cardLine; s.cornerMarks=!!s.cornerMarks;
  s.captionBold=!!s.captionBold; s.captionItalic=!!s.captionItalic;
  s.screenShadow=s.screenShadow!==false;
  if(!BASE_FONTS.map(f=>f.v).includes(s.captionFont)) s.captionFont=BASE_FONTS[0].v;
  return s;
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
  for(const ph of state.photos){
    try{ const rec=idbOK?await DB.get(ph.id):null; if(rec) hydrate(ph.id,rec); }catch(e){ idbFail(e); }
  }
}
function normPhoto(p){
  p.caption=sanitizeText(p.caption,500);
  p.zoomF=clamp(num(p.zoomF,1),.2,6);
  p.ox=clamp(num(p.ox,0),-95,95); p.oy=clamp(num(p.oy,0),-95,95);
  p.rot=clamp(num(p.rot,0),-45,45);
  p.flipH=!!p.flipH;
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
