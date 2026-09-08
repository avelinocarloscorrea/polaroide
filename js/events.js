/* Polaroide Studio — js/events.js
   eventos globais de teclado/drag e init()
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= eventos globais ================= */

// mostra o polegar da barra de rolagem só enquanto rola; some ~1s depois
addEventListener('scroll',e=>{
  const el=e.target;
  if(el instanceof Element && el.classList.contains('scrl')){
    el.classList.add('is-scrolling');
    clearTimeout(el._sT); el._sT=setTimeout(()=>el.classList.remove('is-scrolling'),1500);
  }
},true);

stage.addEventListener('pointerdown',e=>{ if(e.target===stage||e.target===sheetsEl) select(null); });

// Enquanto o usuário rola / arrasta / dá zoom, o blur do acrílico cai para
// quase nada (body.interacting em effects.css) — mantém a interação fluida.
let _intT;
function markInteracting(){
  if(!document.body.classList.contains('acrylic')) return;
  document.body.classList.add('interacting');
  clearTimeout(_intT); _intT=setTimeout(()=>document.body.classList.remove('interacting'),200);
}

/* ---- atalhos do quadro de trabalho (sem barra de rolagem visível) ---- */
// Ctrl/Cmd + roda do mouse (ou pinça no trackpad) = zoom apontando o cursor
stage.addEventListener('wheel',e=>{
  markInteracting();
  if(!(e.ctrlKey||e.metaKey)) return;         // roda sem Ctrl = rolagem normal
  e.preventDefault();
  zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*0.0016));
},{passive:false});

// Botão do meio arrasta = deslocar a vista (não conflita com foto/handle, que só usam o botão 0)
let _pan=null;
stage.addEventListener('pointerdown',e=>{
  if(e.button!==1) return;
  e.preventDefault();
  _pan={x:e.clientX,y:e.clientY,sl:stage.scrollLeft,st:stage.scrollTop};
  try{ stage.setPointerCapture(e.pointerId); }catch(_){}
  document.body.classList.add('panning');
},true);
stage.addEventListener('pointermove',e=>{
  if(!_pan) return;
  markInteracting();
  stage.scrollLeft=_pan.sl-(e.clientX-_pan.x);
  stage.scrollTop =_pan.st-(e.clientY-_pan.y);
});
const _endPan=e=>{ if(!_pan) return; _pan=null; document.body.classList.remove('panning');
  try{ stage.releasePointerCapture(e.pointerId); }catch(_){} };
stage.addEventListener('pointerup',_endPan);
stage.addEventListener('pointercancel',_endPan);

stage.addEventListener('scroll',()=>{
  markInteracting();
  const L=layout(); if(L.pages<2) return;
  const mid=stage.scrollTop+stage.clientHeight/2;
  let best=0,bd=1e9;
  [...sheetsEl.children].forEach((pg,i)=>{ const c=pg.offsetTop*zoom+pg.offsetHeight*zoom/2;
    const d=Math.abs(c-mid); if(d<bd){bd=d;best=i;} });
  if(best!==currentPage){ currentPage=best; $('#pageLbl').textContent=`${best+1} / ${L.pages}`; }
});
addEventListener('keydown',e=>{
  const t=e.target;
  const typing=t.isContentEditable||/INPUT|TEXTAREA|SELECT/.test(t.tagName);
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); return; }
  if((e.ctrlKey||e.metaKey)&&(e.key.toLowerCase()==='y'||(e.shiftKey&&e.key.toLowerCase()==='z'))){ e.preventDefault(); redo(); return; }
  if(e.key==='Escape'){
    if(!$('#menu').hidden){ $('#menu').hidden=true; return; }
    if(zen){ zen=false; applyUI(); return; }
    if(selectedId){ select(null); return; }
  }
  if(typing) return;
  if(e.key==='['){ togglePanel('left'); e.preventDefault(); return; }
  if(e.key===']'){ togglePanel('right'); e.preventDefault(); return; }
  if(e.key==='.'){ zen=!zen; applyUI(); e.preventDefault(); return; }
  const ph=cur(); if(!ph) return;
  if(e.key==='Delete'||e.key==='Backspace'){ removePhoto(ph.id); e.preventDefault(); }
  else if(e.key==='ArrowLeft'){ pushHistory('nudge'); ph.ox=clamp(ph.ox-2,-90,90); livePhoto(ph); save(); e.preventDefault(); }
  else if(e.key==='ArrowRight'){ pushHistory('nudge'); ph.ox=clamp(ph.ox+2,-90,90); livePhoto(ph); save(); e.preventDefault(); }
  else if(e.key==='ArrowUp'){ pushHistory('nudge'); ph.oy=clamp(ph.oy-2,-90,90); livePhoto(ph); save(); e.preventDefault(); }
  else if(e.key==='ArrowDown'){ pushHistory('nudge'); ph.oy=clamp(ph.oy+2,-90,90); livePhoto(ph); save(); e.preventDefault(); }
  else if(e.key==='+'||e.key==='='){ pushHistory('zk'); ph.zoomF=clamp(ph.zoomF+.1,1,4); fillRight(ph); livePhoto(ph); save(); }
  else if(e.key==='-'){ pushHistory('zk'); ph.zoomF=clamp(ph.zoomF-.1,1,4); fillRight(ph); livePhoto(ph); save(); }
});
addEventListener('dragover',e=>{ if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){ e.preventDefault(); document.body.classList.add('dropping'); }});
addEventListener('dragleave',e=>{ if(e.relatedTarget===null) document.body.classList.remove('dropping'); });
addEventListener('drop',e=>{
  if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length){
    e.preventDefault(); document.body.classList.remove('dropping'); addFiles(e.dataTransfer.files);
  }
});
addEventListener('paste',e=>{
  if(e.target && e.target.isContentEditable) return;   // deixa colar texto na legenda
  const imgs=[...(e.clipboardData?.items||[])].filter(i=>i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);
  if(imgs.length){ e.preventDefault(); addFiles(imgs); }
});
let rT; addEventListener('resize',()=>{ clearTimeout(rT); rT=setTimeout(()=>{ applyUI(); if(!userZoomed) fit(); },150); });

/* ---- pinça (2 dedos) para zoom no celular ---- */
let _pinch=null;
const _tdist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
stage.addEventListener('touchstart',e=>{
  if(e.touches.length===2){
    _pinch={d:_tdist(e.touches)};
    if(_pan){ _pan=null; document.body.classList.remove('panning'); }
  }
},{passive:true});
stage.addEventListener('touchmove',e=>{
  if(!_pinch||e.touches.length!==2) return;
  e.preventDefault();
  const d=_tdist(e.touches);
  const cx=(e.touches[0].clientX+e.touches[1].clientX)/2;
  const cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
  if(_pinch.d>0 && d>0) zoomAt(cx,cy,d/_pinch.d);
  _pinch.d=d; markInteracting();
},{passive:false});
const _endPinch=e=>{ if(_pinch && (!e.touches||e.touches.length<2)) _pinch=null; };
stage.addEventListener('touchend',_endPinch);
stage.addEventListener('touchcancel',_endPinch);
addEventListener('beforeprint',()=>select(null));

/* ================= init ================= */
(async function init(){
  injectIcons();
  try{
    const stored=JSON.parse(localStorage.getItem(UIKEY)||'null');
    if(stored&&typeof stored==='object'){ uiState.left=stored.left!==false; uiState.right=stored.right!==false; }
    else if(innerWidth<1200){ uiState.right=false; if(innerWidth<960) uiState.left=false; }
  }catch(e){}
  bindAll();
  setupColorFields();
  syncControls();
  applyUI();
  render();
  fit();
  try{
    await Promise.race([DB.keys(), new Promise((_,r)=>setTimeout(()=>r(new Error('idb-timeout')),2500))]);
  }catch(e){ idbFail(e); }
  try{ await loadProject(); }catch(e){ console.error(e); }
  syncControls();
  render();
  fit();
})();
