/* Polaroide Studio — js/history.js
   desfazer/refazer e mutações do estado
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= histórico ================= */
let past=[],future=[],lastHistKey='',lastHistTime=0;
const snap=()=>JSON.stringify({settings:state.settings,photos:state.photos.map(p=>({...p}))});
function pushHistory(key){
  const now=Date.now();
  if(key&&key===lastHistKey&&now-lastHistTime<700){ lastHistTime=now; return; }
  lastHistKey=key||''; lastHistTime=now;
  past.push(snap()); if(past.length>80) past.shift(); future.length=0;
  updateHistoryButtons();
}
function applySnap(str){
  const d=JSON.parse(str);
  state.settings=migrateSettings({...DEFAULTS,...d.settings});
  state.photos=d.photos.map(p=>{normPhoto(p);return p;});
  syncControls(); save(); render();
}
function undo(){ if(!past.length) return; future.push(snap()); applySnap(past.pop()); }
function redo(){ if(!future.length) return; past.push(snap()); applySnap(future.pop()); }
function updateHistoryButtons(){
  $('#b_undo').disabled=!past.length; $('#b_redo').disabled=!future.length;
  const mu=$('#mu_undo'),mr=$('#mu_redo');
  if(mu) mu.disabled=!past.length; if(mr) mr.disabled=!future.length;
}

/* ================= mutações ================= */
function mutate(key,fn){ pushHistory(key); fn(); save(); render(); }
function move(dir){
  const i=state.photos.findIndex(p=>p.id===selectedId), j=i+dir;
  if(i<0||j<0||j>=state.photos.length) return;
  mutate('move',()=>{ [state.photos[i],state.photos[j]]=[state.photos[j],state.photos[i]]; });
}
function removePhoto(id){
  mutate('remove',()=>{ state.photos=state.photos.filter(p=>p.id!==id); if(selectedId===id) selectedId=null; });
}
function duplicate(){
  const ph=cur(); if(!ph) return;
  mutate('dup',()=>{
    const c={...ph,filter:{...ph.filter},id:uid(),seed:Math.random()};
    media[c.id]=media[ph.id];
    if(idbOK&&media[ph.id]){ DB.get(ph.id).then(r=>r&&DB.set(c.id,r)).catch(idbFail); }
    state.photos.splice(state.photos.findIndex(p=>p.id===ph.id)+1,0,c);
    selectedId=c.id;
  });
}
function doClear(){
  if(state.photos.length && !confirm('Remover todas as fotos? As configurações de layout são mantidas.')) return;
  mutate('clear',()=>{ state.photos=[]; selectedId=null; });
}
async function resetProjectData(){
  try{ const ks=await DB.keys(); for(const k of ks){ try{ await DB.del(k); }catch(_){} } }catch(e){}
  Object.keys(media).forEach(k=>delete media[k]);
  state={settings:{...DEFAULTS},photos:[]}; selectedId=null; past.length=0; future.length=0;
  syncControls(); applyVars(); render(); save(); fit();
}
async function newProject(){
  if((state.photos.length||past.length) && !confirm('Começar um novo projeto? As fotos e os ajustes atuais serão descartados.')) return;
  await resetProjectData();
  toast('Novo projeto.');
}
async function wipeAll(){
  if(!confirm('Apagar TODAS as fotos, o projeto e as configurações guardadas neste navegador? Esta ação não pode ser desfeita.')) return;
  try{ const ks=await DB.keys(); for(const k of ks){ try{ await DB.del(k); }catch(_){} } }catch(e){}
  try{ localStorage.removeItem(KEY); localStorage.removeItem(UIKEY); }catch(e){}
  Object.keys(media).forEach(k=>delete media[k]);
  state={settings:{...DEFAULTS},photos:[]}; selectedId=null; past.length=0; future.length=0;
  try{ $('#privacy').close(); }catch(e){}
  syncControls(); render(); fit();
  toast('Tudo apagado. Começando do zero.');
}
