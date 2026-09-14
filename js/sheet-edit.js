/* Polaroide Studio — js/sheet-edit.js
   Edição direta na folha, estilo Canva — o MESMO motor do Planner e do
   Calendar (vendor/core/canvas-edit*.js):
   - foto: tocar seleciona; arrastar enquadra, roda/pinça dá zoom; a barra
     tem zoom, endireitar, 90°, espelhar, filtros, trocar, duplicar, ordem;
   - legenda: tocar seleciona, tocar de novo digita ali mesmo; fonte, tamanho,
     cor, negrito, itálico, alinhamento, efeitos (contorno, fundo, sombra),
     giro e posição — o estilo vale para todas as legendas;
   - tocar na folha fora de tudo abre "Adicionar": texto, ilustração, imagem,
     fotos, fundo e marca d'água.
   Desenho: js/design.js. (parte de app; carregado depois de shell-ui.js) */
"use strict";

const PS_ICON={
  text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  art:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20c-4-3-8-6-8-10a4 4 0 017.5-2A4 4 0 0120 10c0 4-4 7-8 10z"/><path d="M18 2.5l.8 1.7 1.7.8-1.7.8L18 7.5l-.8-1.7-1.7-.8 1.7-.8z"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/></svg>',
  photos:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="16" rx="1.5"/><rect x="6" y="6" width="8" height="8"/><path d="M20 8v12a1 1 0 01-1 1H8"/></svg>',
  bg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l6-6 12 12M14 3l7 7"/></svg>',
  wm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5.5" stroke-dasharray="2 2"/><path d="M9.5 12h5"/></svg>',
  adjust:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17M12 7.5a4.5 4.5 0 010 9"/></svg>',
  prev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  date:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  pages:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="13" height="16" rx="1.5"/><path d="M4 7v13a1 1 0 001 1h11"/></svg>',
};
const psSplit=key=>{ const i=key.indexOf(':'); return [key.slice(0,i),key.slice(i+1)]; };
const psPhoto=id=>state.photos.find(p=>p.id===id);
const psExtra=id=>(state.settings.extras||[]).find(x=>x.id===id);
const psPageIdx=pg=>pg&&pg.dataset.idx!=null?+pg.dataset.idx:-1;

// redesenho: 'cap' (legendas), 'layers' (fundo/elementos) ou tudo
let _psRaf=0;
function psRedraw(what,live){
  const run=()=>{ _psRaf=0; if(what==='cap') refreshCaptions(); else if(what==='layers') refreshLayers(); else render(); if(!live) save(); };
  if(live){ if(!_psRaf) _psRaf=requestAnimationFrame(run); }
  else { if(_psRaf){ cancelAnimationFrame(_psRaf); _psRaf=0; } run(); }
}
function psReselect(p,key){
  sheetEditor.clear();
  setTimeout(()=>{ const pg=sheetsEl.querySelector(`.page[data-idx="${p}"]`); if(pg) sheetEditor.select(pg,key); },40);
}
// imagem do aparelho -> dataURL reduzido (núcleo: EPStudio.pickImage)
const psPickImage=(cb,max=1600)=>EPStudio.pickImage(cb,{max,onError:toast});

let _psHist=null;          // histórico só na primeira alteração de fato (ações próprias já gravam o delas)
const psHistory=()=>{ if(_psHist){ pushHistory('sheet-'+_psHist); _psHist=null; } };

const sheetEditor=EPCanvasEdit.create({
  sheets:sheetsEl,
  zoom:()=>zoom,
  isMobile:()=>isMobile(),
  scroller:()=>stage,
  fonts:BASE_FONTS.map(f=>({v:f.fam,label:f.label.split(' — ')[1]||f.label})),
  addTools:[
    {a:'text',label:'Texto',icon:PS_ICON.text,title:'Adicionar texto nesta folha'},
    {a:'art',label:'Ilustração',icon:PS_ICON.art,title:'Adicionar ilustração do catálogo'},
    {a:'image',label:'Imagem',icon:PS_ICON.image,title:'Adicionar imagem (logo, adesivo…)'},
    {a:'photos',label:'Fotos',icon:PS_ICON.photos,title:'Adicionar mais fotos'},
    {a:'bg',label:'Fundo',icon:PS_ICON.bg,title:'Fundo da folha'},
    {a:'wm',label:"Marca d'água",icon:PS_ICON.wm,title:"Marca d'água"},
  ],
  add(pageEl,a){
    const p=psPageIdx(pageEl); if(p<0) return;
    if(a==='photos'){ $('#file_add').click(); return; }
    if(a==='bg'){ openBackgroundPop(); return; }
    if(a==='wm'){ openWatermarkPop(); return; }
    const put=patch=>{
      pushHistory('sheet-add');
      const x={id:uid(),type:a,text:'',art:'',src:'',page:p,...patch};
      state.settings.extras=[...(state.settings.extras||[]),x];
      save(); render(); psReselect(p,X_KEY(x.id));
    };
    if(a==='text') put({text:'Seu texto'});
    else if(a==='art') EPArtPicker.open({title:'Adicionar ilustração',onPick:id=>EPArt.ensure([id]).then(()=>put({art:id}))});
    else if(a==='image') psPickImage(src=>put({src}));
  },
  hits(pageEl){ const p=psPageIdx(pageEl); if(p<0) return null; try{ return pageHits(p); }catch(e){ console.error(e); return null; } },
  get(pageEl,key){
    const [t,id]=psSplit(key);
    if(t==='cap'){
      const ph=psPhoto(id); if(!ph) return null;
      return {...capStyle(), text:ph.caption||'', textLabel:'Legenda desta foto', multiline:true, maxlength:500, alignable:true, removable:true,
        tools:ph.taken?[{a:'date',label:'Data da foto',icon:PS_ICON.date}]:[]};
    }
    if(t==='ph'){
      const ph=psPhoto(id); if(!ph) return null;
      return {dx:0,dy:0,s:1,canReplace:true,removable:true,duplicable:true,noFx:true,
        hint:isMobile()?'Arraste para enquadrar · pinça para zoom':'Arraste para enquadrar · roda do mouse para zoom',
        tools:[{a:'adjust',label:'Cor e ajustes',icon:PS_ICON.adjust},{a:'prev',label:'Antes',icon:PS_ICON.prev},{a:'next',label:'Depois',icon:PS_ICON.next}]};
    }
    const x=psExtra(id); if(!x) return null;
    const out={...EPTextFx.norm(x),removable:true,duplicable:true,layer:true,
      tools:[{a:'pages',label:x.page===-1?'Em todas as folhas':'Só nesta folha',icon:PS_ICON.pages,on:x.page===-1}]};
    if(x.type==='text'){ Object.assign(out,{text:x.text,textLabel:'Texto',multiline:true,maxlength:400,alignable:true}); }
    else { out.canReplace=true; if(x.type==='art'){ const it=EPArt.get(x.art); out.colorable=!it||it.mono; } else out.noFx=false; }
    return out;
  },
  begin(pageEl,key){ _psHist=key; },
  set(pageEl,key,patch,opts){
    const [t,id]=psSplit(key), live=!!(opts&&opts.live);
    psHistory();
    if(t==='cap'){
      const ph=psPhoto(id); if(!ph) return;
      const s=state.settings, rest={...patch};
      if('text' in rest){ ph.caption=sanitizeText(rest.text,500); delete rest.text; }
      if('fam' in rest){ s.captionFont=(rest.fam&&fontOfFam(rest.fam))||BASE_FONTS[0].v; delete rest.fam; }
      if('color' in rest){ s.captionColor=rest.color||COLOR_DEFAULTS.captionColor; delete rest.color; }
      ['bold','italic','upper'].forEach(k=>{ if(k in rest){ s['caption'+k[0].toUpperCase()+k.slice(1)]=!!rest[k]; delete rest[k]; } });
      if('s' in rest){ s.captionSizePt=clamp(Math.round(rest.s*14*2)/2,4,96); delete rest.s; }
      if(Object.keys(rest).length) s.capFx=EPTextFx.merge(s.capFx,rest);
      psRedraw('cap',live);
      if(!live) syncControls();
      return;
    }
    if(t==='ph'){
      const ph=psPhoto(id); if(!ph) return;
      const g=geom();
      if('dx' in patch) ph.ox=clamp(ph.ox+patch.dx/g.winW*100,-90,90);
      if('dy' in patch) ph.oy=clamp(ph.oy+patch.dy/g.winH*100,-90,90);
      livePhoto(ph); if(!live) save();
      return;
    }
    const x=psExtra(id); if(!x) return;
    if('text' in patch) x.text=sanitizeText(patch.text,400);
    const fx={...patch}; delete fx.text;
    if(Object.keys(fx).length){
      const merged=EPTextFx.merge(EPTextFx.clean(x),fx);
      EPTextFx.KEYS.forEach(k=>{ delete x[k]; }); Object.assign(x,merged);
    }
    psRedraw('layers',live);
  },
  action(pageEl,key,name){
    const [t,id]=psSplit(key), p=psPageIdx(pageEl);
    if(t==='ph'){
      _psHist=null;
      const ph=psPhoto(id); if(!ph) return;
      if(selectedId!==id) select(id,true);
      if(name==='image'){ $('#file_replace').click(); return false; }
      if(name==='delete'||name==='hide'){ removePhoto(id); return; }
      if(name==='duplicate'){ duplicate(); const i=state.photos.findIndex(q=>q.id===selectedId); psReselect(Math.floor(i/layout().perPage),PH_KEY(selectedId)); return; }
      if(name==='adjust'){ if(isMobile()){ if(typeof mEdit==='function') mEdit(true); } else togglePanel('right',true); return false; }
      if(name==='prev'||name==='next'){ move(name==='prev'?-1:1); const i=state.photos.findIndex(q=>q.id===id), L=layout(), np=Math.floor(i/L.perPage); if(np!==p){ gotoPage(np); psReselect(np,key); } return; }
      return;
    }
    if(t==='cap'){
      const ph=psPhoto(id); if(!ph) return;
      psHistory();
      if(name==='reset'){ state.settings.capFx={}; toast('Posição e efeitos da legenda restaurados.'); }
      else if(name==='delete'||name==='hide') ph.caption='';
      else if(name==='date'&&ph.taken){ const d=ph.taken.split('-').reverse().join('/'); ph.caption=(ph.caption||'').trim()?ph.caption.trim()+' · '+d:d; }
      psRedraw('cap',false); syncControls();
      return;
    }
    const list=state.settings.extras||[], x=psExtra(id); if(!x) return;
    if(name==='image'){
      _psHist=null;
      if(x.type==='art') EPArtPicker.open({title:'Trocar ilustração',current:x.art,onPick:aid=>{ pushHistory('sheet-art'); x.art=aid; EPArt.ensure([aid]).then(()=>{ save(); render(); psReselect(p,key); }); }});
      else psPickImage(src=>{ pushHistory('sheet-img'); x.src=src; save(); render(); psReselect(p,key); });
      return false;
    }
    psHistory();
    const i=list.indexOf(x);
    if(name==='delete'||name==='hide') list.splice(i,1);
    else if(name==='reset'){ EPTextFx.KEYS.forEach(k=>{ delete x[k]; }); }
    else if(name==='duplicate'){ const c={...x,id:uid(),dx:(+x.dx||0)+8,dy:(+x.dy||0)+8}; list.splice(i+1,0,c); psRedraw('layers',false); return X_KEY(c.id); }
    else if(name==='front'&&i<list.length-1){ list.splice(i,1); list.push(x); }
    else if(name==='back'&&i>0){ list.splice(i,1); list.unshift(x); }
    else if(name==='pages'){ x.page=x.page===-1?Math.max(0,p):-1; toast(x.page===-1?'Aparece em todas as folhas.':'Só nesta folha.'); }
    psRedraw('layers',false);
  },
  photo(pageEl,key,win,tools){
    const [t,id]=psSplit(key); if(t!=='ph') return null;
    const ph=psPhoto(id); if(!ph) return null;
    const pts=new Map(); let g0=null, saveT=0;
    const later=()=>{ clearTimeout(saveT); saveT=setTimeout(()=>{ save(); fillRight(ph); },250); };
    const sync=()=>{
      const z=tools.querySelector('[data-p="zoom"]'), r=tools.querySelector('[data-p="rot"]');
      if(z){ z.value=ph.zoomF; z.nextElementSibling.textContent=ph.zoomF.toFixed(2)+'×'; }
      if(r){ r.value=ph.rot; r.nextElementSibling.textContent=ph.rot.toFixed(1)+'°'; }
      tools.querySelectorAll('[data-f]').forEach(b=>b.classList.toggle('on',b.dataset.f===ph.filter.preset));
    };
    win.addEventListener('pointerdown',e=>{
      if(e.button>0) return;
      e.preventDefault(); e.stopPropagation();
      try{ win.setPointerCapture(e.pointerId); }catch(_){}
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const r=win.getBoundingClientRect(), a=[...pts.values()];
      g0={w:r.width,h:r.height,ox:ph.ox,oy:ph.oy,z:ph.zoomF,x:a[0].x,y:a[0].y,d:a.length>1?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0,moved:false};
      win.classList.add('drag');
    });
    win.addEventListener('pointermove',e=>{
      if(!g0||!pts.has(e.pointerId)) return;
      pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const a=[...pts.values()];
      if(a.length>1&&g0.d){
        if(!g0.moved){ g0.moved=true; pushHistory('pinch'); }
        ph.zoomF=clamp(g0.z*Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)/g0.d,1,4);
      }else{
        const dx=a[0].x-g0.x, dy=a[0].y-g0.y;
        if(!g0.moved&&Math.hypot(dx,dy)>3){ g0.moved=true; pushHistory('pan'); }
        if(!g0.moved) return;
        ph.ox=clamp(g0.ox+dx/g0.w*100,-90,90); ph.oy=clamp(g0.oy+dy/g0.h*100,-90,90);
      }
      livePhoto(ph); sync();
    });
    const end=e=>{
      pts.delete(e.pointerId);
      if(pts.size) { const r=win.getBoundingClientRect(), a=[...pts.values()]; g0={w:r.width,h:r.height,ox:ph.ox,oy:ph.oy,z:ph.zoomF,x:a[0].x,y:a[0].y,d:0,moved:true}; return; }
      win.classList.remove('drag');
      if(g0&&g0.moved) later();
      g0=null;
    };
    win.addEventListener('pointerup',end); win.addEventListener('pointercancel',end);
    win.addEventListener('wheel',e=>{ e.preventDefault(); pushHistory('zwheel'); ph.zoomF=clamp(ph.zoomF*Math.exp(-e.deltaY*0.0015),1,4); livePhoto(ph); sync(); later(); },{passive:false});
    tools.innerHTML=`<div class="ps-ptools">
      <label class="ps-rng"><span>Zoom</span><input type="range" data-p="zoom" min="1" max="4" step="0.02"><output></output></label>
      <label class="ps-rng"><span>Endireitar</span><input type="range" data-p="rot" min="-20" max="20" step="0.5"><output></output></label>
      <div class="ps-btns"><button type="button" data-a="r90">Girar 90°</button><button type="button" data-a="flip">Espelhar</button><button type="button" data-a="center">Centralizar</button></div>
      <span class="fld-lbl">Filtro</span>
      <div class="ps-filters">${Object.keys(PRESET_LABELS).map(k=>`<button type="button" class="chip" data-f="${k}">${esc(PRESET_LABELS[k])}</button>`).join('')}</div>
    </div>`;
    tools.addEventListener('pointerdown',e=>{ const r=e.target.closest('input[type=range]'); if(r) pushHistory('ptool-'+r.dataset.p); });
    tools.addEventListener('input',e=>{
      const r=e.target; if(!r.dataset.p) return;
      if(r.dataset.p==='zoom') ph.zoomF=+r.value; else ph.rot=+r.value;
      livePhoto(ph); sync(); later();
    });
    tools.addEventListener('click',e=>{
      const b=e.target.closest('button'); if(!b) return;
      if(b.dataset.f){ pushHistory('preset'); ph.filter={...PRESETS[b.dataset.f],preset:b.dataset.f}; livePhoto(ph); sync(); later(); }
      else if(b.dataset.a==='r90') rotate90(ph);
      else if(b.dataset.a==='flip'){ pushHistory('flip'); ph.flipH=!ph.flipH; livePhoto(ph); later(); }
      else if(b.dataset.a==='center'){ pushHistory('centerframe'); ph.ox=ph.oy=0; ph.zoomF=1; ph.rot=0; livePhoto(ph); sync(); later(); }
    });
    sync();
    return {destroy(){ clearTimeout(saveT); }};
  },
  colors(){
    const s=state.settings;
    return [...new Set([s.captionColor,s.cardColor,s.bg&&s.bg.c1,'#1f2522','#ffffff','#35594d','#8a2f2f','#1f3a52','#c9a24a','#d98c9a','#b23b2c'].filter(c=>HEX.test(c||'')).map(c=>c.toLowerCase()))];
  },
  onSelect(pageEl,key){
    if(!key) return;
    const [t,id]=psSplit(key);
    if((t==='ph'||t==='cap')&&selectedId!==id){ _psFromEditor=true; try{ select(id,true); }finally{ _psFromEditor=false; } }
  },
});
let _psFromEditor=false;

// clique na folha: seleciona o que estiver embaixo ou mostra "Adicionar"
sheetsEl.addEventListener('click',e=>{
  if(window._panMovedAt&&Date.now()-window._panMovedAt<350) return;
  if(e.target.closest('.handle')) return;
  const pg=e.target.closest('.page'); if(!pg) return;
  if(!sheetEditor.pick(pg,e.clientX,e.clientY)) sheetEditor.show(pg);
});
sheetsEl.addEventListener('dblclick',e=>{
  const pg=e.target.closest('.page'); if(!pg||isMobile()) return;
  if(sheetEditor.pick(pg,e.clientX,e.clientY)) sheetEditor.editText();
});

{
  const _render=render;
  render=function(){ _render.apply(this,arguments); if(!sheetEditor.isBusy()) sheetEditor.refresh(); };
  const _zoom=applyZoom;
  applyZoom=function(){ _zoom.apply(this,arguments); if(sheetEditor.current()) sheetEditor.refresh(); };
  // seleção pelo app (faixa de fotos, Esc, remover…) acompanha a folha
  const _select=select;
  select=function(id,keep){
    _select(id,keep);
    if(_psFromEditor||keep) return;
    const c=sheetEditor.current();
    if(!id){ if(c&&c.key&&/^(ph|cap):/.test(c.key)) sheetEditor.clear(); return; }
    const i=state.photos.findIndex(p=>p.id===id); if(i<0) return;
    const pg=sheetsEl.querySelector(`.page[data-idx="${Math.floor(i/layout().perPage)}"]`);
    if(pg&&!(c&&c.key===PH_KEY(id))) sheetEditor.select(pg,PH_KEY(id));
  };
  // no celular a barra da folha substitui a antiga barra da foto
  if(typeof mSelBar==='function') mSelBar=function(){ const b=$('#mselbar'); if(b) b.hidden=true; const r=$('#mroot'); if(r) r.classList.remove('sel'); };
  let artT=0;
  EPArt.onLoad(()=>{ clearTimeout(artT); artT=setTimeout(()=>{ if(sheetsEl.children.length){ refreshLayers(); sheetEditor.refresh(); } },30); });
  EPArt.ensure(usedArt()).catch(()=>{});
}
