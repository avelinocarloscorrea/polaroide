/* Polaroide Studio — js/mobile.js
   Casca de celular (abas Fotos / Folha / Estilo / Exportar). Os controles
   escrevem no mesmo state.settings e chamam render(), igual aos do desktop.
   Só roda se #mroot existir; no desktop os elementos ficam com display:none. */
"use strict";

/* ---------- helpers ---------- */
function mSegSet(sel,val){
  const c=$(sel); if(!c) return;
  c.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.v===String(val)));
}
function mSeg(sel,cb){
  const c=$(sel); if(!c) return;
  c.querySelectorAll('button').forEach(b=>{ b.onclick=()=>cb(b.dataset.v); });
}
function mStepSet(key,val){
  const b=document.querySelector('.stepper[data-key="'+key+'"] b'); if(b) b.textContent=val;
}
function mRng(sel,key,fmt,forceCustom){
  const el=$(sel), out=$(sel+'v'); if(!el) return;
  el.addEventListener('pointerdown',()=>pushHistory('mr_'+key));
  el.addEventListener('input',()=>{
    state.settings[key]=parseFloat(el.value);
    if(out) out.textContent=fmt(el.value);
    if(forceCustom && state.settings.format!=='custom') state.settings.format='custom';
    applyVars(); render(); save();
  });
}
function mRngSet(sel,v,txt){ const el=$(sel); if(!el) return; el.value=v; const o=$(sel+'v'); if(o) o.textContent=txt; }

/* ---------- abas ---------- */
const M_TABS=['fotos','folha','estilo','exportar'];
function mSetTab(name){
  M_TABS.forEach(t=>{
    document.body.classList.toggle('mtab-'+t,t===name);
    const p=$('#mp_'+t); if(p) p.hidden=(t!==name);
  });
  $$('#mtabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  uiState.right=false; $('#menu').hidden=true; applyUI();
  if(name==='fotos' && !userZoomed) requestAnimationFrame(fit);
}

/* ---------- sincroniza os controles com o estado ---------- */
function syncMobile(){
  if(!$('#mroot')||!$('#mf_paper')) return;
  const s=state.settings, G=gridCount();
  $('#mf_paper').value=s.pageSize;
  mSegSet('#mf_orient', s.landscape?'l':'p');
  mStepSet('columns', s.columns==='auto'?G.cols:+s.columns);
  mStepSet('rows',    s.rows==='auto'?G.rows:+s.rows);
  mRngSet('#mf_gap', s.gapMm, s.gapMm+' mm');
  mRngSet('#mf_margin', s.marginMm, s.marginMm+' mm');

  $('#me_format').value=s.format;
  mRngSet('#me_frame', s.frameMm, s.frameMm+' mm');
  mRngSet('#me_cap', s.captionMm, s.captionMm+' mm');
  mRngSet('#me_tilt', s.tiltDeg, s.tiltDeg+'°');
  $('#me_capfont').value=s.captionFont;
  mStepSet('captionSizePt', s.captionSizePt);
  $('#me_effect').value=s.tape;
  $('#me_bg').value=s.pageBg; $('#me_card').value=s.cardColor; $('#me_capcolor').value=s.captionColor;
  mSegSet('#me_marks', s.cornerMarks?'1':'0');
  mSegSet('#me_cardline', s.cardLine?'1':'0');
  mSegSet('#mx_dpi', s.exportDPI);
  if(typeof refreshColorFields==='function') refreshColorFields();
}

/* ---------- ligações ---------- */
function bindMobile(){
  if(!$('#mroot')) return;

  Object.entries(FORMATS).forEach(([k,v])=>$('#me_format').add(new Option(v.label,k)));
  BASE_FONTS.forEach(f=>$('#me_capfont').add(new Option(f.label,f.v)));

  // modelos de folha (mesma lista do desktop)
  const lr=$('#mLayoutRow');
  if(lr && typeof LAYOUTS!=='undefined') LAYOUTS.forEach(l=>{
    const b=document.createElement('button');
    b.type='button'; b.dataset.layout=l.id; b.textContent=l.name;
    b.onclick=()=>{ applyLayout(l.id); };
    lr.appendChild(b);
  });

  // abas
  $$('#mtabs button').forEach(b=>{ b.onclick=()=>mSetTab(b.dataset.tab); });
  document.body.classList.add('mtab-fotos');

  // topo
  $('#mfab').onclick=()=>$('#file_add').click();
  $('#mu_undo').onclick=undo;
  $('#mu_redo').onclick=redo;
  $('#mu_more').onclick=e=>{ e.stopPropagation(); const m=$('#menu'); m.hidden=!m.hidden; syncScrim(); };

  // steppers (colunas, linhas, tamanho da legenda)
  $$('.stepper').forEach(st=>{
    const key=st.dataset.key, mn=+st.dataset.min||1, mx=+st.dataset.max||12;
    st.querySelectorAll('button').forEach(btn=>{
      btn.onclick=()=>{
        const d=+btn.dataset.d;
        pushHistory('mstep_'+key);
        let cur;
        if(key==='columns') cur=state.settings.columns==='auto'?gridCount().cols:+state.settings.columns;
        else if(key==='rows') cur=state.settings.rows==='auto'?gridCount().rows:+state.settings.rows;
        else cur=+state.settings[key];
        const nv=clamp(Math.round(cur+d),mn,mx);
        if(key==='columns'||key==='rows'){ state.settings.autoFit=true; state.settings[key]=String(nv); }
        else state.settings[key]=nv;
        syncControls(); applyVars(); render(); save();
      };
    });
  });

  // Folha
  $('#mf_paper').onchange=e=>{ pushHistory('pg'); state.settings.pageSize=e.target.value; syncControls(); render(); save(); fit(); };
  mSeg('#mf_orient',v=>{ pushHistory('pg'); state.settings.landscape=(v==='l'); syncControls(); render(); save(); fit(); });
  mRng('#mf_gap','gapMm',v=>v+' mm');
  mRng('#mf_margin','marginMm',v=>v+' mm');

  // Estilo
  $('#me_format').onchange=e=>{ pushHistory('fmt'); applyFormat(e.target.value); syncControls(); render(); save(); };
  mRng('#me_frame','frameMm',v=>v+' mm',true);
  mRng('#me_cap','captionMm',v=>v+' mm',true);
  mRng('#me_tilt','tiltDeg',v=>v+'°');
  $('#me_capfont').onchange=e=>{ pushHistory('font'); state.settings.captionFont=e.target.value; render(); save(); };
  $('#me_effect').onchange=e=>{ pushHistory('tape'); state.settings.tape=e.target.value; render(); save(); };
  $('#me_bg').oninput=e=>{ state.settings.pageBg=e.target.value; render(); save(); };
  $('#me_card').oninput=e=>{ state.settings.cardColor=e.target.value; applyVars(); render(); save(); };
  $('#me_capcolor').oninput=e=>{ state.settings.captionColor=e.target.value; applyVars(); render(); save(); };
  mSeg('#me_marks',v=>{ pushHistory('cut'); state.settings.cornerMarks=(v==='1'); syncControls(); render(); save(); });
  mSeg('#me_cardline',v=>{ pushHistory('cut'); state.settings.cardLine=(v==='1'); syncControls(); applyVars(); render(); save(); });

  // Exportar
  mSeg('#mx_dpi',v=>{ state.settings.exportDPI=+v; syncControls(); save(); });
  $('#mx_pdf').onclick=exportPDF;
  $('#mx_png').onclick=exportPNG;
  $('#mx_print').onclick=()=>{ select(null); setTimeout(()=>window.print(),80); };
  $('#mx_save').onclick=exportProject;
  $('#mx_open').onclick=()=>$('#file_open').click();

  // legenda no painel da foto (mobile)
  const sc=$('#s_caption');
  if(sc) sc.addEventListener('input',()=>{
    const ph=cur(); if(!ph) return;
    ph.caption=sanitizeText(sc.value,500);
    const t=sheetsEl.querySelector(`.pol[data-id="${ph.id}"] .capfield`);
    if(t) t.value=ph.caption;
    save();
  });

  syncMobile();
}
