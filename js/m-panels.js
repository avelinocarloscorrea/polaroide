/* Polaroide Studio — js/m-panels.js
   Controles das abas Folha / Estilo / Exportar do celular. Escrevem no mesmo
   state.settings e chamam render(), igual aos do desktop. */
"use strict";

/* ---------- helpers de widget ---------- */
function mSegSet(sel,val){
  const c=$(sel); if(!c) return;
  c.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.v===String(val)));
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
  el.addEventListener('pointerdown',()=>{ if(typeof pushHistory==='function') pushHistory('mr_'+key); });
  el.addEventListener('input',()=>{
    state.settings[key]=parseFloat(el.value);
    if(out) out.textContent=fmt(el.value);
    if(forceCustom && state.settings.format!=='custom'){
      state.settings.format='custom'; const mf=$('#me_format'); if(mf) mf.value='custom';
    }
    applyVars(); render(); save();
  });
}
function mRngSet(sel,v,txt){ const el=$(sel); if(!el) return; el.value=v; const o=$(sel+'v'); if(o) o.textContent=txt; }

/* ---------- reflete o estado nos controles do celular ---------- */
function mSync(){
  if(!mMob() || !$('#mroot') || !$('#mf_paper')) return;
  const s=state.settings, G=(typeof gridCount==='function')?gridCount():{cols:0,rows:0};
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

/* ---------- liga os controles ---------- */
function mBindPanels(){
  if(!$('#mroot')||!$('#me_format')) return;

  Object.entries(FORMATS).forEach(([k,v])=>$('#me_format').add(new Option(v.label,k)));
  BASE_FONTS.forEach(f=>$('#me_capfont').add(new Option(f.label,f.v)));

  // modelos de folha
  const lr=$('#mLayoutRow');
  if(lr && typeof LAYOUTS!=='undefined') LAYOUTS.forEach(l=>{
    const b=document.createElement('button');
    b.type='button'; b.dataset.layout=l.id; b.textContent=l.name;
    b.onclick=()=>{ applyLayout(l.id); };
    lr.appendChild(b);
  });

  // steppers: colunas, linhas, tamanho da legenda
  $$('.stepper').forEach(st=>{
    const key=st.dataset.key, mn=+st.dataset.min||1, mx=+st.dataset.max||12;
    st.querySelectorAll('button').forEach(btn=>{
      btn.onclick=()=>{
        const d=+btn.dataset.d;
        if(typeof pushHistory==='function') pushHistory('mstep_'+key);
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
  $('#mf_paper').onchange=e=>{ pushHistory('pg'); state.settings.pageSize=e.target.value; syncControls(); render(); save(); if(typeof fit==='function') fit(); };
  mSeg('#mf_orient',v=>{ pushHistory('pg'); state.settings.landscape=(v==='l'); syncControls(); render(); save(); if(typeof fit==='function') fit(); });
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
  $('#mx_pdf').onclick=()=>{ if(typeof exportPDF==='function') exportPDF(); };
  $('#mx_png').onclick=()=>{ if(typeof exportPNG==='function') exportPNG(); };
  $('#mx_print').onclick=()=>{ if(typeof select==='function') select(null); setTimeout(()=>window.print(),80); };
  $('#mx_save').onclick=()=>{ if(typeof exportProject==='function') exportProject(); };
  $('#mx_open').onclick=()=>{ const f=$('#file_open'); if(f) f.click(); };

  // legenda no painel da foto
  const sc=$('#s_caption');
  if(sc) sc.addEventListener('input',()=>{
    const ph=(typeof cur==='function')?cur():null; if(!ph) return;
    ph.caption=sanitizeText(sc.value,500);
    const t=sheetsEl.querySelector(`.pol[data-id="${ph.id}"] .capfield`);
    if(t) t.value=ph.caption;
    save();
  });

  mSync();
}
