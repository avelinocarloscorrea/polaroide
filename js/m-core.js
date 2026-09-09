/* Polaroide Studio — js/m-core.js
   Casca de celular (≤ 820 px): move #stage e #rightSel para dentro de #mroot,
   troca de abas, barra superior e o gesto de arrastar-pra-baixo.
   O motor (render/layout/export) é o mesmo do desktop. */
"use strict";

const mMob=()=>matchMedia('(max-width:820px)').matches;

/* ---------- move #stage / #rightSel entre a casca de desktop e a de celular ---------- */
function mPlace(){
  const stage=$('#stage'), rightSel=$('#rightSel'), mbody=$('#mbody'), medit=$('#medit');
  if(!stage||!mbody||!medit) return;
  if(mMob()){
    if(stage.parentElement!==mbody) mbody.insertBefore(stage, mbody.firstChild);
    if(rightSel && rightSel.parentElement!==medit) medit.appendChild(rightSel);
    medit.hidden=false;
  }else{
    const app=$('#app'), right=$('#right');
    if(app && right && stage.parentElement!==app) app.insertBefore(stage, right);
    if(rightSel && right && rightSel.parentElement!==right) right.appendChild(rightSel);
    medit.hidden=true; medit.classList.remove('open');
  }
}

/* ---------- abas ---------- */
const M_TABS=['fotos','folha','estilo','exportar'];
function mTab(name){
  if(!M_TABS.includes(name)) name='fotos';
  const root=$('#mroot'); if(!root) return;
  M_TABS.forEach(t=>root.classList.toggle('tab-'+t, t===name));
  M_TABS.forEach(t=>{
    if(t==='fotos') return;
    const p=$('#mp_'+t); if(p){ p.hidden=(t!==name); p.style.transform=''; }
  });
  $$('#mtabs button').forEach(b=>b.classList.toggle('on', b.dataset.tab===name));
  mEdit(false); mMenu(false);
  if(name==='fotos' && typeof fit==='function' && !userZoomed) requestAnimationFrame(fit);
}

/* ---------- folha de edição da foto (#medit) e menu (#menu) ---------- */
function mEdit(open){
  const m=$('#medit'); if(!m) return;
  if(open){ m.hidden=false; m.style.transform=''; requestAnimationFrame(()=>m.classList.add('open')); }
  else m.classList.remove('open');
  mScrim();
}
function mMenu(open){
  const m=$('#menu'); if(!m) return;
  m.hidden=!open;
  if(open) m.style.transform='';
  mScrim();
}
function mScrim(){
  const s=$('#scrim'); if(!s||!mMob()) return;
  const menuOpen=!$('#menu').hidden;
  const editOpen=$('#medit') && $('#medit').classList.contains('open');
  s.hidden=!(menuOpen||editOpen);
}

/* ---------- arrastar a pega (.m-grab) pra baixo = fechar ----------
   O gesto vive só na barrinha (touch-action:none no CSS), então nunca briga
   com a rolagem, os sliders ou os steppers do painel. */
function mDragClose(grab, sheet, onClose){
  if(!grab||!sheet) return;
  let y0=0, dy=0, t0=0, on=false;
  grab.addEventListener('touchstart',e=>{
    if(e.touches.length!==1) return;
    y0=e.touches[0].clientY; dy=0; t0=Date.now(); on=true;
    sheet.style.transition='none';
  },{passive:true});
  grab.addEventListener('touchmove',e=>{
    if(!on) return;
    dy=e.touches[0].clientY-y0; if(dy<0) dy=0;
    sheet.style.transform='translateY('+dy+'px)';
    if(e.cancelable) e.preventDefault();
  },{passive:false});
  grab.addEventListener('touchend',()=>{
    if(!on) return;
    on=false;
    const vy=dy/Math.max(1,Date.now()-t0);
    sheet.style.transition=''; sheet.style.transform='';
    if(dy>120 || (dy>44 && vy>0.5)) onClose();
  },{passive:true});
}

/* ---------- ligações da casca ---------- */
function mSetup(){
  const root=$('#mroot'); if(!root) return;

  mPlace();
  root.classList.add('tab-fotos');

  // barra superior
  const fab=$('#mfab');   if(fab) fab.onclick=()=>{ const f=$('#file_add')||$('#b_add'); if(f) f.click(); };
  const mu =$('#mu_undo');if(mu)  mu.onclick=()=>{ if(typeof undo==='function') undo(); };
  const mr =$('#mu_redo');if(mr)  mr.onclick=()=>{ if(typeof redo==='function') redo(); };
  const mm =$('#mu_more');if(mm)  mm.onclick=e=>{ e.stopPropagation(); mMenu($('#menu').hidden); };

  // abas
  $$('#mtabs button').forEach(b=>{ b.onclick=()=>mTab(b.dataset.tab); });

  // arrastar pra baixo fecha
  ['folha','estilo','exportar'].forEach(t=>{
    const p=$('#mp_'+t); if(p) mDragClose(p.querySelector('.m-grab'), p, ()=>mTab('fotos'));
  });
  const med=$('#medit'); if(med) mDragClose(med.querySelector('.m-grab'), med, ()=>{ if(typeof select==='function') select(null); else mEdit(false); });
  const men=$('#menu');  if(men){
    let g=men.querySelector('.m-grab');
    if(!g){ g=document.createElement('div'); g.className='m-grab'; g.appendChild(document.createElement('i')); men.insertBefore(g, men.firstChild); }
    mDragClose(g, men, ()=>mMenu(false));
  }

  // scrim fecha tudo
  const s=$('#scrim');
  if(s) s.addEventListener('click',()=>{ if(mMob()){ mEdit(false); mMenu(false); } });

  // reposiciona ao cruzar o breakpoint
  let rt;
  addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{ mPlace(); if(mMob()) mScrim(); },160); });
}
