/* Polaroide Studio — js/ui.js
   feedback, seletor de cor, painéis, syncControls, bindAll
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= feedback ================= */
let toastT;
function toast(m){ const t=$('#toast'); t.textContent=m; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,3800); }
function busy(m){ $('#busyTxt').textContent=m||'Processando…'; $('#busy').hidden=false; }
function unbusy(){ $('#busy').hidden=true; }

/* ---------- controles ---------- */
function rebuildFontOptions(){
  const sel=$('#c_font'), keep=state.settings.captionFont;
  sel.innerHTML=''; BASE_FONTS.forEach(f=>sel.add(new Option(f.label,f.v)));
  if([...sel.options].some(o=>o.value===keep)) sel.value=keep;
  else state.settings.captionFont=sel.value;
}
function syncControls(){
  const s=state.settings;
  const setR=(id,val,txt)=>{ $(id).value=val; $(id.replace('#c_','#v_').replace('#f_','#v_')).textContent=txt; };
  $('#c_format').value=s.format;
  setR('#c_w',s.polaroidWidthMm,s.polaroidWidthMm+' mm');
  $('#c_aw').value=s.aspectW; $('#c_ah').value=s.aspectH; $('#c_apreset').value='';
  setR('#c_frame',s.frameMm,s.frameMm+' mm');
  setR('#c_cap',s.captionMm,s.captionMm+' mm');
  setR('#c_radius',s.radiusMm,s.radiusMm+' mm');
  setR('#c_tilt',s.tiltDeg,s.tiltDeg+'°');
  $('#c_pageSize').value=s.pageSize; $('#c_landscape').checked=s.landscape;
  setR('#c_margin',s.marginMm,s.marginMm+' mm');
  setR('#c_gap',s.gapMm,s.gapMm+' mm');
  $('#c_cols').value=s.columns; $('#c_align').value=s.align;
  $('#c_cardLine').checked=s.cardLine; $('#c_cardLineColor').value=s.cardLineColor;
  $('#c_marks').checked=s.cornerMarks;
  setR('#c_mo',s.markOffset,s.markOffset+' mm');
  setR('#c_ml',s.markLen,s.markLen+' mm');
  $('#c_cardColor').value=s.cardColor; $('#c_bg').value=s.pageBg; $('#c_capColor').value=s.captionColor;
  $('#c_bg2').value=s.pageBg2; $('#c_bgGrad').checked=s.bgGradient;
  $('#c_bgang').value=s.bgAngle; $('#v_bgang').textContent=s.bgAngle+'°';
  $('#c_bg2Row').hidden=!s.bgGradient; $('#c_bgAngleRow').hidden=!s.bgGradient;
  $('#c_tape').value=s.tape; $('#c_tapeColor').value=s.tapeColor;
  setR('#c_fs',s.captionSizePt,s.captionSizePt+' pt');
  setR('#c_ls',s.captionSpacing,(+s.captionSpacing).toFixed(1)+' px');
  $('#c_bold').classList.toggle('on',s.captionBold);
  $('#c_italic').classList.toggle('on',s.captionItalic);
  $('#c_upper').classList.toggle('on',s.captionUpper);
  $('#c_shadowtxt').classList.toggle('on',s.captionShadow);
  $('#c_shadow').checked=s.screenShadow;
  $('#c_acrylic').checked=s.acrylic;
  const social=!!(PAGE_SIZES[s.pageSize]||{}).social;
  $('#c_dpi').value=s.exportDPI; $('#c_igscale').value=s.igScale;
  $('#c_dpiRow').hidden=social; $('#c_igscaleRow').hidden=!social;
  document.body.classList.toggle('acrylic',!!s.acrylic);
  rebuildFontOptions(); $('#c_font').value=s.captionFont;
  refreshColorFields();
}
function bindRange(id,key,fmt){
  const el=$(id), out=$(id.replace('#c_','#v_').replace('#f_','#v_'));
  el.addEventListener('pointerdown',()=>pushHistory('rng'+key));
  el.addEventListener('input',()=>{
    state.settings[key]=parseFloat(el.value);
    out.textContent=fmt(el.value);
    if(state.settings.format!=='custom' && ['polaroidWidthMm','frameMm','captionMm'].includes(key)){
      state.settings.format='custom'; $('#c_format').value='custom';
    }
    render(); save();
  });
}
function applyFormat(k){
  const F=FORMATS[k]; if(!F||F.custom){ state.settings.format='custom'; return; }
  Object.assign(state.settings,{format:k,polaroidWidthMm:F.w,aspectW:F.aw,aspectH:F.ah,frameMm:F.frame,captionMm:F.cap});
}
function applyUI(){
  appEl.classList.toggle('hide-left',!uiState.left);
  appEl.classList.toggle('hide-right',!uiState.right);
  appEl.classList.toggle('zen',zen);
  $('#b_pl').classList.toggle('on',uiState.left&&!zen);
  $('#b_pr').classList.toggle('on',uiState.right&&!zen);
  $('#b_zen').classList.toggle('on',zen);
  $('#zenExit').hidden=!zen;
  try{ localStorage.setItem(UIKEY,JSON.stringify(uiState)); }catch(e){}
  clearTimeout(applyUI._t); applyUI._t=setTimeout(()=>{ if(!userZoomed) fit(); },240);
}

/* ---- seletor de cor --------------------------------------------------------
   Troca cada <input type=color> por um botão com amostra + um popover com
   cores comuns. O input nativo fica escondido no DOM, servindo de modelo e
   como opção "Personalizada…". Sem libs, sem nada baixado. */
const CF_SWATCHES=[
  '#ffffff','#faf8f3','#f2eee6','#e5dfd3','#c9c9c9','#8a857a',
  '#000000','#23272c','#4a4a4a','#6d6a62','#3d5c52','#2f4840',
  '#6f9384','#a97f3d','#d8c9a8','#b23b2c','#b0781d','#2b5f8a',
];
let cfOpen=null;
function closeCF(){ if(cfOpen){ cfOpen.pop.remove(); cfOpen=null; } }
function paintCF(btn,hex){
  btn.querySelector('.sw').style.background=hex;
  btn.querySelector('.hx').textContent=hex;
}
function refreshColorFields(){
  $$('.cf-btn').forEach(btn=>{ const inp=document.getElementById(btn.dataset.for); if(inp) paintCF(btn,inp.value); });
}
function setupColorFields(){
  $$('input[type=color]').forEach(inp=>{
    if(inp.classList.contains('cf-native')) return;
    inp.classList.add('cf-native');
    const btn=document.createElement('button');
    btn.type='button'; btn.className='cf-btn'; btn.dataset.for=inp.id;
    btn.innerHTML='<span class="sw"></span><span class="hx"></span>'+
      '<span class="cv"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>';
    inp.after(btn);
    paintCF(btn,inp.value);
    inp.addEventListener('input',()=>paintCF(btn,inp.value));
    btn.addEventListener('click',e=>{ e.stopPropagation(); openCF(btn,inp); });
  });
}
function openCF(btn,inp){
  if(cfOpen && cfOpen.input===inp){ closeCF(); return; }
  closeCF();
  const pop=document.createElement('div'); pop.className='cfpop';
  const grid=document.createElement('div'); grid.className='row1';
  const cur=(inp.value||'').toLowerCase();
  CF_SWATCHES.forEach(hex=>{
    const s=document.createElement('button');
    s.type='button'; s.className='s'+(hex===cur?' on':''); s.style.background=hex; s.title=hex;
    s.addEventListener('click',()=>{ inp.value=hex; inp.dispatchEvent(new Event('input',{bubbles:true})); closeCF(); });
    grid.appendChild(s);
  });
  const custom=document.createElement('button');
  custom.type='button'; custom.className='custom'; custom.textContent='Personalizada…';
  custom.addEventListener('click',()=>{ closeCF(); inp.click(); });
  pop.append(grid,custom);
  document.body.appendChild(pop);
  const r=btn.getBoundingClientRect(), w=pop.offsetWidth, h=pop.offsetHeight;
  let x=r.left, y=r.bottom+6;
  if(x+w>innerWidth-8) x=innerWidth-8-w;
  if(y+h>innerHeight-8) y=r.top-6-h;
  pop.style.left=Math.max(8,x)+'px';
  pop.style.top=Math.max(8,y)+'px';
  cfOpen={pop,input:inp,btn};
}
document.addEventListener('pointerdown',e=>{
  if(cfOpen && !cfOpen.pop.contains(e.target) && !cfOpen.btn.contains(e.target)) closeCF();
});
addEventListener('keydown',e=>{ if(e.key==='Escape') closeCF(); },true);
addEventListener('scroll',closeCF,true);
addEventListener('resize',closeCF);
function bindAll(){
  Object.entries(FORMATS).forEach(([k,v])=>$('#c_format').add(new Option(v.label,k)));
  for(let i=1;i<=8;i++) $('#c_cols').add(new Option(i,i));
  Object.keys(PRESET_LABELS).forEach(k=>{
    const b=document.createElement('button'); b.className='chip'; b.dataset.p=k; b.textContent=PRESET_LABELS[k];
    b.onclick=()=>{ const ph=cur(); if(!ph) return; pushHistory('preset');
      ph.filter={...PRESETS[k],preset:k}; fillRight(ph); livePhoto(ph); save(); };
    $('#presetRow').appendChild(b);
  });
  Object.keys(CAPTION_STYLE_LABELS).forEach(k=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=CAPTION_STYLE_LABELS[k];
    b.onclick=()=>{ pushHistory('capstyle'); Object.assign(state.settings,CAPTION_STYLES[k]);
      syncControls(); applyVars(); render(); save(); };
    $('#capStyleRow').appendChild(b);
  });

  $('#c_format').onchange=e=>{ pushHistory('fmt'); applyFormat(e.target.value); syncControls(); render(); save(); };
  bindRange('#c_w','polaroidWidthMm',v=>v+' mm');
  bindRange('#c_frame','frameMm',v=>v+' mm');
  bindRange('#c_cap','captionMm',v=>v+' mm');
  bindRange('#c_radius','radiusMm',v=>v+' mm');
  bindRange('#c_tilt','tiltDeg',v=>v+'°');
  bindRange('#c_margin','marginMm',v=>v+' mm');
  bindRange('#c_gap','gapMm',v=>v+' mm');
  bindRange('#c_mo','markOffset',v=>v+' mm');
  bindRange('#c_ml','markLen',v=>v+' mm');
  bindRange('#c_fs','captionSizePt',v=>v+' pt');
  bindRange('#c_ls','captionSpacing',v=>(+v).toFixed(1)+' px');
  bindRange('#c_bgang','bgAngle',v=>v+'°');

  const aspChange=()=>{ pushHistory('asp');
    state.settings.aspectW=clamp(+$('#c_aw').value||1,1,60);
    state.settings.aspectH=clamp(+$('#c_ah').value||1,1,60);
    state.settings.format='custom'; $('#c_format').value='custom'; render(); save(); };
  $('#c_aw').addEventListener('change',aspChange);
  $('#c_ah').addEventListener('change',aspChange);
  $('#c_apreset').addEventListener('change',e=>{
    if(!e.target.value) return;
    const [w,h]=e.target.value.split(',');
    $('#c_aw').value=w; $('#c_ah').value=h; aspChange(); e.target.value='';
  });

  $('#c_pageSize').onchange=e=>{ pushHistory('pg'); state.settings.pageSize=e.target.value; syncControls(); render(); save(); fit(); };
  $('#c_landscape').onchange=e=>{ pushHistory('pg'); state.settings.landscape=e.target.checked; render(); save(); fit(); };
  $('#c_cols').onchange=e=>{ pushHistory('cols'); state.settings.columns=e.target.value; render(); save(); };
  $('#c_align').onchange=e=>{ pushHistory('align'); state.settings.align=e.target.value; render(); save(); };
  $('#c_cardLine').onchange=e=>{ pushHistory('cut'); state.settings.cardLine=e.target.checked; applyVars(); render(); save(); };
  $('#c_cardLineColor').oninput=e=>{ state.settings.cardLineColor=e.target.value; applyVars(); render(); save(); };
  $('#c_marks').onchange=e=>{ pushHistory('cut'); state.settings.cornerMarks=e.target.checked; render(); save(); };
  $('#c_font').onchange=e=>{ pushHistory('font'); state.settings.captionFont=e.target.value; render(); save(); };
  $('#c_upper').onclick=()=>{ pushHistory('upper'); state.settings.captionUpper=!state.settings.captionUpper; syncControls(); applyVars(); render(); save(); };
  $('#c_shadowtxt').onclick=()=>{ pushHistory('capsh'); state.settings.captionShadow=!state.settings.captionShadow; syncControls(); applyVars(); render(); save(); };
  $('#c_tape').onchange=e=>{ pushHistory('tape'); state.settings.tape=e.target.value; render(); save(); };
  $('#c_tapeColor').oninput=e=>{ state.settings.tapeColor=e.target.value; render(); save(); };
  $('#c_capColor').oninput=e=>{ state.settings.captionColor=e.target.value; applyVars(); render(); save(); };
  $('#c_cardColor').oninput=e=>{ state.settings.cardColor=e.target.value; applyVars(); render(); save(); };
  $('#c_bg').oninput=e=>{ state.settings.pageBg=e.target.value; render(); save(); };
  $('#c_bg2').oninput=e=>{ state.settings.pageBg2=e.target.value; render(); save(); };
  $('#c_bgGrad').onchange=e=>{ pushHistory('grad'); state.settings.bgGradient=e.target.checked; syncControls(); render(); save(); };
  $('#c_resetColors').onclick=()=>{ pushHistory('colors'); Object.assign(state.settings,COLOR_DEFAULTS);
    syncControls(); applyVars(); render(); save(); };
  $('#c_bold').onclick=()=>{ pushHistory('b'); state.settings.captionBold=!state.settings.captionBold; syncControls(); render(); save(); };
  $('#c_italic').onclick=()=>{ pushHistory('i'); state.settings.captionItalic=!state.settings.captionItalic; syncControls(); render(); save(); };
  $('#c_shadow').onchange=e=>{ state.settings.screenShadow=e.target.checked; applyVars(); save(); };
  $('#c_acrylic').onchange=e=>{
    state.settings.acrylic=e.target.checked;
    document.body.classList.toggle('acrylic',e.target.checked);
    save(); clearTimeout($('#c_acrylic')._t); $('#c_acrylic')._t=setTimeout(()=>{ if(!userZoomed) fit(); },260);
  };
  $('#c_dpi').onchange=e=>{ state.settings.exportDPI=+e.target.value; save(); };
  $('#c_igscale').onchange=e=>{ state.settings.igScale=+e.target.value; save(); };
  $('#c_fill').onclick=()=>{
    const s=state.settings,L=layout();
    const cols=s.columns==='auto'?L.cols:+s.columns;
    pushHistory('fill');
    s.polaroidWidthMm=Math.max(20,Math.floor(((s.landscape?PAGE_SIZES[s.pageSize].h:PAGE_SIZES[s.pageSize].w)-2*s.marginMm-(cols-1)*s.gapMm)/cols*10)/10);
    s.format='custom'; syncControls(); render(); save();
  };

  // barra
  $('#b_add').onclick=$('#e_add').onclick=()=>$('#file_add').click();
  $('#file_add').addEventListener('change',e=>{ addFiles(e.target.files); e.target.value=''; });
  $('#b_undo').onclick=undo; $('#b_redo').onclick=redo;
  $('#b_prev').onclick=()=>gotoPage(currentPage-1); $('#b_next').onclick=()=>gotoPage(currentPage+1);
  $('#b_zin').onclick=()=>{ userZoomed=true; zoom=clamp(zoom+.1,.12,2.4); applyZoom(); };
  $('#b_zout').onclick=()=>{ userZoomed=true; zoom=clamp(zoom-.1,.12,2.4); applyZoom(); };
  $('#b_fit').onclick=fit;
  $('#b_print').onclick=()=>{ select(null); setTimeout(()=>window.print(),80); };
  $('#b_pdf').onclick=exportPDF;
  $('#b_png').onclick=exportPNG;

  // painéis / zen / menu
  $('#b_pl').onclick=()=>{ uiState.left=!uiState.left; applyUI(); };
  $('#b_pr').onclick=()=>{ uiState.right=!uiState.right; applyUI(); };
  $('#b_zen').onclick=()=>{ zen=!zen; applyUI(); };
  $('#zenExit').onclick=()=>{ zen=false; applyUI(); };
  const menu=$('#menu');
  $('#b_more').onclick=e=>{ e.stopPropagation(); menu.hidden=!menu.hidden; };
  document.addEventListener('pointerdown',e=>{
    if(!menu.hidden && !menu.contains(e.target) && !$('#b_more').contains(e.target)) menu.hidden=true;
  });
  const mclose=()=>menu.hidden=true;
  if(ACERVO_URL){
    const bl=$('#brandLink');
    bl.href=ACERVO_URL; bl.target='_blank'; bl.title='Acervo — mais ferramentas';
    const ma=$('#m_acervo');
    ma.href=ACERVO_URL; ma.target='_blank'; ma.rel='noopener noreferrer'; ma.hidden=false;
    const aa=$('#asideAcervo');
    if(aa){ aa.href=ACERVO_URL; aa.target='_blank'; aa.hidden=false; }
  }else{
    $('#brandLink').style.cursor='default';
  }
  $('#m_save').onclick=()=>{ mclose(); exportProject(); };
  $('#m_open').onclick=()=>{ mclose(); $('#file_open').click(); };
  $('#m_help').onclick=()=>{ mclose(); $('#help').showModal(); };
  $('#m_privacy').onclick=()=>{ mclose(); $('#privacy').showModal(); };
  $('#m_about').onclick=()=>{ mclose(); $('#about').showModal(); };
  $('#m_clear').onclick=()=>{ mclose(); doClear(); };
  $$('#menu a').forEach(a=>a.addEventListener('click',mclose));
  $$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('#p_wipe').onclick=wipeAll;

  $('#file_open').addEventListener('change',e=>{ if(e.target.files[0]) importProject(e.target.files[0]); e.target.value=''; });

  // painel direito
  $('#s_zoom').addEventListener('pointerdown',()=>pushHistory('zoomdrag'));
  $('#s_zoom').addEventListener('input',e=>{ const ph=cur(); if(!ph)return;
    ph.zoomF=parseFloat(e.target.value); $('#v_pz').textContent=ph.zoomF.toFixed(2)+'×'; livePhoto(ph); save(); });
  $('#s_rot').addEventListener('pointerdown',()=>pushHistory('rotdrag'));
  $('#s_rot').addEventListener('input',e=>{ const ph=cur(); if(!ph)return;
    ph.rot=parseFloat(e.target.value); $('#v_rot').textContent=ph.rot.toFixed(1)+'°'; livePhoto(ph); save(); });
  $('#s_r90').onclick=()=>{ const ph=cur(); if(ph) rotate90(ph); };
  $('#s_flip').onclick=()=>{ const ph=cur(); if(!ph)return; pushHistory('flip'); ph.flipH=!ph.flipH; livePhoto(ph); save(); };
  $('#s_center').onclick=()=>{ const ph=cur(); if(!ph)return; pushHistory('centerframe');
    ph.ox=ph.oy=0; ph.zoomF=1; ph.rot=0; fillRight(ph); livePhoto(ph); save(); };
  const fbind=(id,key,fmt)=>{
    $(id).addEventListener('pointerdown',()=>pushHistory('f'+key));
    $(id).addEventListener('input',e=>{ const ph=cur(); if(!ph)return;
      ph.filter[key]=parseFloat(e.target.value); ph.filter.preset='custom';
      $(id.replace('#f_','#v_')).textContent=fmt(e.target.value);
      $$('#presetRow button').forEach(b=>b.classList.remove('on'));
      livePhoto(ph); save(); });
  };
  fbind('#f_br','brightness',v=>Math.round(v*100)+'%');
  fbind('#f_co','contrast',v=>Math.round(v*100)+'%');
  fbind('#f_sa','saturate',v=>Math.round(v*100)+'%');
  fbind('#f_hu','hue',v=>(v>0?'+':'')+v);
  fbind('#f_se','sepia',v=>Math.round(v*100)+'%');
  fbind('#f_gr','grayscale',v=>Math.round(v*100)+'%');
  fbind('#f_vi','vignette',v=>Math.round(v*100)+'%');
  $('#s_left').onclick=()=>move(-1); $('#s_right').onclick=()=>move(1);
  $('#s_dup').onclick=duplicate;
  $('#s_replace').onclick=()=>$('#file_replace').click();
  $('#file_replace').addEventListener('change',async e=>{
    const ph=cur(),f=e.target.files[0]; e.target.value='';
    if(!ph||!f) return;
    if(!acceptable(f)){ toast('Formato não suportado.'); return; }
    pushHistory('replace'); busy('Trocando foto…');
    try{
      const {full,preview,natW,natH}=await bakeImage(f);
      const rec={full,preview,natW,natH,name:safeName(f.name)};
      if(idbOK){ try{ await DB.set(ph.id,rec); }catch(err){ idbFail(err); } }
      if(media[ph.id]){ URL.revokeObjectURL(media[ph.id].fullURL); URL.revokeObjectURL(media[ph.id].previewURL); }
      hydrate(ph.id,rec); ph.natW=natW; ph.natH=natH;
    }catch(err){ console.error(err); toast('Falha ao trocar a foto'+(err.message?': '+err.message:'')); }
    unbusy(); save(); render();
  });
  $('#s_remove').onclick=()=>{ const ph=cur(); if(ph) removePhoto(ph.id); };
}
