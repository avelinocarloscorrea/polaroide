/* Polaroide Studio — js/design-ui.js
   Painéis de design com as peças do núcleo (as mesmas do Planner e do
   Calendar): Fundo da folha (EPBackground), Marca d'água (EPWatermark),
   efeitos prontos da legenda (EPTextFx) e Meus projetos (EPProjects).
   (parte de app; carregado por último) */
"use strict";

const _designGate=EPStudio.gate(()=>pushHistory('design'));
function setBackground(bg,live){
  _designGate(live);
  state.settings.bg=EPBackground.clean(bg);
  refreshLayers(); if(!live){ save(); syncControls(); }
  if(typeof sheetEditor!=='undefined') sheetEditor.refresh();
}
function setWatermark(wm,live){
  _designGate(live);
  state.settings.wm=EPWatermark.clean(wm);
  refreshLayers(); if(!live){ save(); designSync(); }
}
const designColors=()=>{ const s=state.settings; return [s.captionColor,s.cardColor,'#35594d','#1f3a52','#8a2f2f','#c9a24a'].filter(c=>HEX.test(c||'')); };
const bgOpts=()=>({ get:()=>state.settings.bg, set:setBackground, pickImage:cb=>psPickImage(cb,2200), colors:designColors });
const wmOpts=()=>({ get:()=>state.settings.wm, set:setWatermark, pickImage:cb=>psPickImage(cb,1200), colors:designColors,
  ctx:()=>({ink:state.settings.captionColor,fam:famOfFont(state.settings.captionFont)}), defaultText:'Nossas memórias' });

let _bgPanel=null,_wmPanel=null,_popPanel=null;
function openBackgroundPop(){ EPStudio.pop({id:'bg',title:'Fundo da folha',build:h=>{ _popPanel=EPBackground.panel(h,bgOpts()); },onClose:()=>{ _popPanel=null; }}); }
function openWatermarkPop(){ EPStudio.pop({id:'wm',title:"Marca d'água",build:h=>{ _popPanel=EPWatermark.panel(h,wmOpts()); },onClose:()=>{ _popPanel=null; }}); }

// efeitos prontos da legenda: itálico/caixa alta/cor viram os campos da aba Estilo
function applyCaptionPreset(id){
  const patch=EPTextFx.preset(id); if(!patch) return;
  pushHistory('capfx');
  const s=state.settings, rest={...patch};
  if('italic' in rest){ s.captionItalic=!!rest.italic; delete rest.italic; }
  if('upper' in rest){ s.captionUpper=!!rest.upper; delete rest.upper; }
  if('color' in rest){ if(rest.color) s.captionColor=rest.color; delete rest.color; }
  s.capFx=EPTextFx.merge(s.capFx,rest);
  syncControls(); render(); save();
}
function buildCaptionFx(){
  const row=$('#capFxRow'); if(!row||row.childElementCount) return;
  row.innerHTML=EPTextFx.PRESETS.map(p=>`<button type="button" class="ce-preset" data-cfx="${p.id}"><span class="ce-preset__aa" data-prev="${p.id}">Aa</span><i>${esc(p.label)}</i></button>`).join('');
  row.querySelectorAll('[data-prev]').forEach(el=>{ const p=EPTextFx.PRESETS.find(x=>x.id===el.dataset.prev); EPTextFx.cssPreview(el,p.patch); });
  row.addEventListener('click',e=>{ const b=e.target.closest('[data-cfx]'); if(b) applyCaptionPreset(b.dataset.cfx); });
}

function designSync(){
  if(_bgPanel) _bgPanel.refresh();
  if(_wmPanel) _wmPanel.refresh();
  if(_popPanel) _popPanel.refresh();
  const row=$('#capFxRow');
  if(row) row.querySelectorAll('.ce-preset__aa').forEach(el=>{ el.style.fontFamily=`${state.settings.captionFont}`; });
}

(function initDesign(){
  const bh=$('#bgHost'); if(bh) _bgPanel=EPBackground.panel(bh,bgOpts());
  const wh=$('#wmHost'); if(wh) _wmPanel=EPWatermark.panel(wh,wmOpts());
  buildCaptionFx();
  designSync();

  /* ---------- Meus projetos ---------- */
  const serialize=async()=>({
    v:3, app:'polaroidestudio',
    settings:JSON.parse(JSON.stringify(state.settings)),
    photos:state.photos.map(p=>({...p,filter:{...p.filter}})),
    blobs:Object.fromEntries(state.photos.filter(p=>media[p.id]&&media[p.id].full).map(p=>{ const m=media[p.id]; return [p.id,{full:m.full,preview:m.preview||m.full,natW:m.natW,natH:m.natH,name:m.name}]; })),
  });
  const restore=async d=>{
    if(!d||typeof d!=='object') throw new Error('projeto inválido');
    busy('Abrindo projeto…');
    try{
      try{ const ks=await DB.keys(); for(const k of ks){ try{ await DB.del(k); }catch(_){} } }catch(_){}
      Object.values(media).forEach(m=>{ try{ URL.revokeObjectURL(m.fullURL); URL.revokeObjectURL(m.previewURL); }catch(_){} });
      Object.keys(media).forEach(k=>delete media[k]);
      state={settings:migrateSettings({...DEFAULTS,...(d.settings||{})}),photos:[]};
      for(const raw of (Array.isArray(d.photos)?d.photos.slice(0,400):[])){
        const ph={...raw}; normPhoto(ph);
        const b=d.blobs&&d.blobs[raw.id];
        if(b&&b.full){ const rec={full:b.full,preview:b.preview||b.full,natW:b.natW,natH:b.natH,name:safeName(b.name)}; if(idbOK){ try{ await DB.set(ph.id,rec); }catch(e){ idbFail(e); } } hydrate(ph.id,rec); }
        state.photos.push(ph);
      }
      selectedId=null; past.length=0; future.length=0; histMeta.length=0;
      if(typeof sheetEditor!=='undefined') sheetEditor.clear();
      syncControls(); save(); render(); fit();
      if(typeof closeStart==='function') closeStart();
      const ra=$('#resumeAsk'); if(ra&&!ra.hidden){ ra.hidden=true; document.body.classList.remove('onboarding'); try{ sessionStorage.setItem('polaroidestudio-resumed','1'); }catch(_){} }
    }finally{ unbusy(); }
  };
  const download=async(d,name)=>{
    busy('Empacotando projeto…');
    try{
      const out={v:2,settings:d.settings,photos:[]};
      for(const p of d.photos||[]){ const b=d.blobs&&d.blobs[p.id]; out.photos.push({...p,_img:b?await blobToDataURL(b.full):null,_prev:b?await blobToDataURL(b.preview||b.full):null,natW:b?b.natW:p.natW,natH:b?b.natH:p.natH,name:b?b.name:'foto.jpg'}); }
      downloadBlob(new Blob([JSON.stringify(out)],{type:'application/json'}),(String(name||'polaroides').replace(/[^\wÀ-ÿ .-]/g,'').trim()||'polaroides')+'.json');
    }catch(e){ console.error(e); toast('Erro ao baixar o projeto.'); }
    unbusy();
  };
  EPProjects.init({
    app:'polaroidestudio', label:'Polaroide Studio', serialize, restore, download, toast,
    hasContent:()=>state.photos.length>0,
    docName:()=>{ const n=state.photos.length; const cap=(state.photos.find(p=>(p.caption||'').trim())||{}).caption; return cap?String(cap).split('\n')[0].slice(0,40):`Polaroides — ${n} ${n===1?'foto':'fotos'}`; },
    thumb:async()=>{ await ensureFullImages(); const cv=await drawPage(0,22); return cv.toDataURL('image/jpeg',0.78); },
  });
  { const _save=save; save=function(){ _save.apply(this,arguments); EPProjects.changed(); }; }
  { const _np=newProject; newProject=async function(){ const had=state.photos.length; await _np.apply(this,arguments); if(!state.photos.length&&had) EPProjects.detach(); }; }
  const menuClose=()=>{ $('#menu').hidden=true; syncScrim(); if(typeof mMenu==='function'&&isMobile()) mMenu(false); };
  { const b=$('#m_projects'); if(b) b.onclick=()=>{ menuClose(); EPProjects.dialog(); }; }
  { const b=$('#m_saveLocal'); if(b) b.onclick=()=>{ menuClose(); if(!state.photos.length){ toast('Adicione fotos primeiro.'); return; } EPProjects.save(); }; }
  { const b=$('#mx_projects'); if(b) b.onclick=()=>EPProjects.dialog(); }
  { const h=$('#ob_projects'); if(h) EPProjects.strip(h,{onOpen:()=>{}}); }
  addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){ e.preventDefault(); if(state.photos.length) EPProjects.save(); else toast('Adicione fotos primeiro.'); }
  });
  injectIcons();
})();

{ const _undo=undo, _redo=redo;
  undo=function(){ _undo.apply(this,arguments); designSync(); if(typeof sheetEditor!=='undefined') sheetEditor.refresh(); };
  redo=function(){ _redo.apply(this,arguments); designSync(); if(typeof sheetEditor!=='undefined') sheetEditor.refresh(); };
  $('#b_undo').onclick=()=>undo(); $('#b_redo').onclick=()=>redo();
  const mu=$('#mu_undo'), mr=$('#mu_redo'); if(mu) mu.onclick=()=>undo(); if(mr) mr.onclick=()=>redo();
}
