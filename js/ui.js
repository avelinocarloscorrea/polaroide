/* Polaroide Studio — js/ui.js
   feedback, seletor de cor, painéis, syncControls, bindAll
   (parte de app; carregado em ordem por index.html) */
"use strict";

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

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
  const eff=geom().polW;
  const wDerived = fitMode() && s.columns!=='auto' && s.rows!=='auto';
  $('#c_w').value=s.polaroidWidthMm;
  $('#v_w').textContent = wDerived ? eff.toFixed(0)+' mm (encaixado)' : s.polaroidWidthMm+' mm';
  $('#c_w').disabled = wDerived;
  $('#c_fill').hidden = s.autoFit;
  $('#c_aw').value=s.aspectW; $('#c_ah').value=s.aspectH; $('#c_apreset').value='';
  setR('#c_frame',s.frameMm,s.frameMm+' mm');
  setR('#c_frameTop',s.frameTopMm,s.frameTopMm+' mm');
  { const e=$('#c_pdfColor'); if(e) e.value=s.pdfColor; const b=$('#c_backSide'); if(b) b.value=s.backSide; const gm=$('#c_gamma'); if(gm) gm.value=String(s.printGamma); }
  setR('#c_cap',s.captionMm,s.captionMm<=0?'0 mm (sem legenda)':s.captionMm+' mm');
  setR('#c_radius',s.radiusMm,s.radiusMm+' mm');
  setR('#c_tilt',s.tiltDeg,s.tiltDeg+'°');
  $('#c_pageSize').value=s.pageSize; $('#c_landscape').checked=s.landscape;
  $('#c_autofit').checked=s.autoFit;
  { const af=$('#c_autofit'), real=isRealFormat(); af.disabled=real;
    const lb=af.closest('label'); if(lb) lb.title=real?'Formato real de filme: o tamanho é fixo, o encaixe só decide quantos cabem na folha.':''; }
  setR('#c_margin',s.marginMm,s.marginMm+' mm');
  setR('#c_gap',s.gapMm,s.gapMm+' mm');
  $('#c_cols').value=s.columns; $('#c_rows').value=s.rows; $('#c_align').value=s.align;
  $('#c_cardLine').checked=s.cardLine; $('#c_cardLineColor').value=s.cardLineColor;
  $('#c_marks').checked=s.cornerMarks;
  setR('#c_mo',s.markOffset,s.markOffset+' mm');
  setR('#c_ml',s.markLen,s.markLen+' mm');
  $('#c_cardColor').value=s.cardColor; $('#c_capColor').value=s.captionColor;
  $('#c_tape').value=s.tape; $('#c_tapeColor').value=s.tapeColor;
  setR('#c_fs',s.captionSizePt,s.captionSizePt+' pt');
  setR('#c_ls',Math.round((s.capFx.ls||0)*100),Math.round((s.capFx.ls||0)*100)+'%');
  $('#c_bold').classList.toggle('on',s.captionBold);
  $('#c_italic').classList.toggle('on',s.captionItalic);
  $('#c_upper').classList.toggle('on',s.captionUpper);
  $('#c_shadowtxt').classList.toggle('on',!!s.capFx.sh);
  if(typeof designSync==='function') designSync();
  $('#c_shadow').checked=s.screenShadow;
  $('#c_acrylic').checked=s.acrylic;
  $('#c_dpi').value=s.exportDPI;
  document.body.classList.toggle('acrylic',!!s.acrylic);
  rebuildFontOptions(); $('#c_font').value=s.captionFont;
  refreshColorFields();
  if(typeof mSync==='function') mSync();
}
function bindRange(id,key,fmt){
  const el=$(id), out=$(id.replace('#c_','#v_').replace('#f_','#v_'));
  el.addEventListener('pointerdown',()=>pushHistory('rng'+key));
  el.addEventListener('input',()=>{
    state.settings[key]=parseFloat(el.value);
    out.textContent=fmt(el.value);
    if(state.settings.format!=='custom' && ['polaroidWidthMm','frameMm','frameTopMm','captionMm'].includes(key)){
      state.settings.format='custom'; $('#c_format').value='custom';
    }
    render(); save();
  });
}
function applyFormat(k){
  const F=FORMATS[k]; if(!F||F.custom){ state.settings.format='custom'; return; }
  Object.assign(state.settings,{format:k,polaroidWidthMm:F.w,aspectW:F.aw,aspectH:F.ah,frameMm:F.frame,frameTopMm:F.top,captionMm:F.cap});
}

// TEMPLATE (tela inicial) = configuração completa; redefine tudo
function applyTemplate(id){
  const t=TEMPLATES.find(x=>x.id===id); if(!t) return;
  pushHistory('template');
  const keep={acrylic:state.settings.acrylic,exportDPI:state.settings.exportDPI};
  state.settings=migrateSettings({...DEFAULTS,...t.settings,...keep});
  selectedId=null;
  syncControls(); applyVars(); render(); save(); fit();
  $$('#tplList .tpl-card').forEach(b=>b.classList.toggle('on',b.dataset.tpl===id));
  toast('Template aplicado: '+t.name);
}

/* ============ miniatura gráfica do template (tela inicial) ============
   Um template redefine formato+folha+efeito por inteiro — a miniatura desenha
   de fato a grade de polaroides resultante (colunas × linhas, cor de fundo,
   leve inclinação, fita/marcas de corte), não um ícone genérico. */
function tplThumbSVG(t){
  const s=t.settings||{};
  const cols=Math.max(1,Math.min(parseInt(s.columns,10)||3,8));
  const rows=Math.max(1,Math.min(parseInt(s.rows,10)||3,9));
  const ps=PAGE_SIZES[s.pageSize]||PAGE_SIZES.a4;
  const pw=s.landscape?ps.h:ps.w, ph=s.landscape?ps.w:ps.h;
  const W=100,H=Math.round(W*(ph/pw)),R=7,pad=9;
  const bg=(s.bg&&s.bg.kind==='color'&&s.bg.c1)||(s.bg&&(s.bg.kind==='gradient'||s.bg.kind==='pattern')&&s.bg.c1)||s.pageBg||'var(--surface)';
  const gap=cols>=6||rows>=7?1.3:cols>=4?2:3;
  const gridW=W-pad*2,gridH=H-pad*2;
  const tileW=(gridW-gap*(cols-1))/cols, tileH=(gridH-gap*(rows-1))/rows;
  const noCaption=s.captionMm===0;
  const tilt=s.tiltDeg?Math.min(s.tiltDeg*0.5,3.5):0;
  let tiles='';
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const x=pad+c*(tileW+gap), y=pad+r*(tileH+gap);
    const cx=x+tileW/2, cy=y+tileH/2;
    const rot=tilt?((r+c)%2===0?tilt:-tilt):0;
    const capH=noCaption?tileH*0.06:tileH*0.22;
    const photoH=Math.max(1,tileH-capH-tileH*0.08);
    tiles+=`<g transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})">
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${tileW.toFixed(1)}" height="${tileH.toFixed(1)}" fill="#fff" stroke="rgba(20,20,20,.12)" stroke-width=".7"/>
      <rect x="${(x+tileW*0.07).toFixed(1)}" y="${(y+tileH*0.06).toFixed(1)}" width="${(tileW*0.86).toFixed(1)}" height="${photoH.toFixed(1)}" fill="var(--brand-soft)"/>
    </g>`;
  }
  let tape='';
  if(s.tape){
    const tx=pad+tileW/2, ty=pad;
    tape=`<rect x="${(tx-6).toFixed(1)}" y="${(ty-3.5).toFixed(1)}" width="12" height="7" rx="1" fill="${s.tapeColor||'#e3c877'}" opacity=".82" transform="rotate(-8 ${tx.toFixed(1)} ${ty.toFixed(1)})"/>`;
  }
  let corners='';
  if(s.cornerMarks){
    const m=4,len=5,cw='rgba(0,0,0,.32)';
    const pts=[[m,m,1,1],[W-m,m,-1,1],[m,H-m,1,-1],[W-m,H-m,-1,-1]];
    corners=pts.map(([px,py,dx,dy])=>
      `<path d="M${px} ${py+dy*len} V${py} H${px+dx*len}" fill="none" stroke="${cw}" stroke-width="1"/>`).join('');
  }
  const cid='tc-'+t.id;
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs><clipPath id="${cid}"><rect x="0" y="0" width="${W}" height="${H}" rx="${R}"/></clipPath></defs>
    <g clip-path="url(#${cid})">
      <rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>
      ${tiles}${tape}${corners}
      <rect x=".5" y=".5" width="${W-1}" height="${H-1}" rx="${R}" fill="none" stroke="var(--line)" stroke-width="1"/>
    </g>
  </svg>`;
}
/* ============ miniatura de UM polaroide (passo "Formato", guia) ============
   Diferente da grade acima — aqui o que muda de opção pra opção é a
   proporção do próprio polaroide (quadrado/retrato/instantâneo), a
   moldura e a faixa de legenda, então desenha só um cartão, no tamanho real. */
function formatThumbSVG(id){
  const F=FORMATS[id]; if(!F||F.custom) return '';
  const aw=F.aw||1, ah=F.ah||1;
  const photoW=58, photoH=photoW*(ah/aw);
  const frame=Math.max(2,F.frame/F.w*photoW), top=Math.max(2,(F.top||F.frame)/F.w*photoW);
  const cap=F.cap/F.w*photoW;
  const W=photoW+frame*2, H=photoH+top+cap, R=2;
  return `<svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" aria-hidden="true">
    <rect x=".5" y=".5" width="${(W-1).toFixed(1)}" height="${(H-1).toFixed(1)}" rx="${R}" fill="#fff" stroke="rgba(20,20,20,.15)" stroke-width="1"/>
    <rect x="${frame.toFixed(1)}" y="${top.toFixed(1)}" width="${photoW.toFixed(1)}" height="${photoH.toFixed(1)}" fill="var(--brand-soft)"/>
  </svg>`;
}
/* ============ miniatura de efeito (passo "Efeito", guia) ============
   Sem foto real pra filtrar ainda — mostra uma cor representativa de cada
   preset (não é o algoritmo de verdade, só uma pista visual do tom). */
const PRESET_SWATCH = { original: '#b9c2bd', bw: '#9a9a9a', sepia: '#b98a55', vintage: '#c99a5c', fade: '#d9cfc0', vivid: '#3f8f8a', cool: '#5f7fa6' };
function effectThumbSVG(id) {
  const c = PRESET_SWATCH[id] || PRESET_SWATCH.original;
  const vignette = (id === 'vintage' || id === 'bw') ? `<rect x="0" y="0" width="60" height="60" fill="url(#vg-${id})"/>` : '';
  return `<svg viewBox="0 0 68 80" aria-hidden="true">
    <defs><radialGradient id="vg-${id}" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".28"/></radialGradient></defs>
    <rect x=".5" y=".5" width="67" height="79" rx="2" fill="#fff" stroke="rgba(20,20,20,.15)" stroke-width="1"/>
    <rect x="4" y="4" width="60" height="60" fill="${c}"/>
    ${vignette}
  </svg>`;
}
// MODELO DE FOLHA (painel esquerdo) = só o desenho da folha; mescla, não reseta
function applyLayout(id){
  const l=LAYOUTS.find(x=>x.id===id); if(!l) return;
  pushHistory('layout');
  Object.assign(state.settings,l.settings);
  migrateSettings(state.settings);
  syncControls(); applyVars(); render(); save(); fit();
  $$('#layoutRow .chip').forEach(b=>b.classList.toggle('on',b.dataset.layout===id));
  toast('Modelo de folha: '+l.name);
}
const isMobile=()=>matchMedia('(max-width:820px)').matches;
// escurece o fundo quando uma gaveta OU o menu ⋯ está aberto (só no celular)
function syncScrim(){
  const sc=$('#scrim'); if(!sc) return;
  // no celular o escurecido é controlado por mScrim() (m-core.js)
  if(isMobile()){ if(typeof mScrim==='function') mScrim(); return; }
  sc.hidden=true;
}
// no celular os painéis viram gavetas sobrepostas — só uma aberta por vez
function togglePanel(side,on){
  if(on===undefined) on=!(side==='left'?uiState.left:uiState.right);
  if(side==='left'){ uiState.left=on; if(on&&isMobile()) uiState.right=false; }
  else{ uiState.right=on; if(on&&isMobile()) uiState.left=false; }
  if(on&&isMobile()){ $('#menu').hidden=true; }
  applyUI();
}
function applyUI(){
  appEl.classList.toggle('hide-left',!uiState.left);
  appEl.classList.toggle('hide-right',!uiState.right);
  appEl.classList.toggle('zen',zen);
  $('#b_pl').classList.toggle('on',uiState.left&&!zen);
  $('#b_pr').classList.toggle('on',uiState.right&&!zen);
  $('#b_zen').classList.toggle('on',zen);
  $('#zenExit').hidden=!zen;
  syncScrim();
  try{ localStorage.setItem(UIKEY,JSON.stringify(uiState)); }catch(e){}
  // no celular os painéis são folhas sobrepostas — não mudam o tamanho do
  // quadro, então não precisa reajustar o zoom
  clearTimeout(applyUI._t); applyUI._t=setTimeout(()=>{ if(!userZoomed && !isMobile()) fit(); },240);
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
addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeCF(); closeExportPop(); closeHistoryPop(); } },true);
addEventListener('scroll',closeCF,true);
addEventListener('resize',closeCF);

/* ================= histórico visual (lista de passos pra voltar) ================= */
function relTime(ms){
  const s=Math.max(0,Math.round((Date.now()-ms)/1000));
  if(s<5) return 'agora mesmo';
  if(s<60) return `há ${s}s`;
  const m=Math.round(s/60);
  if(m<60) return `há ${m} min`;
  return `há ${Math.round(m/60)} h`;
}
let _histPop=null;
function closeHistoryPop(){ if(_histPop){ _histPop.remove(); _histPop=null; } }
function openHistoryPop(){
  closeHistoryPop();
  if(!histMeta.length){ toast('Nada no histórico ainda.'); return; }
  const pop=document.createElement('div'); pop.className='popmenu histpop scrl';
  pop.insertAdjacentHTML('beforeend','<div class="tm-h">Voltar até…</div>');
  for(let i=histMeta.length-1;i>=0;i--){
    const n=histMeta.length-i;
    pop.insertAdjacentHTML('beforeend',`<button type="button" data-n="${n}">${relTime(histMeta[i].t)}</button>`);
  }
  pop.addEventListener('click',e=>{ const b=e.target.closest('[data-n]'); if(!b) return; closeHistoryPop(); undoTo(+b.dataset.n); });
  document.body.appendChild(pop);
  const anchor=$('#b_more'), r=anchor.getBoundingClientRect();
  pop.style.left=Math.max(8,Math.min(innerWidth-pop.offsetWidth-8,r.right-pop.offsetWidth))+'px';
  pop.style.top=Math.min(innerHeight-pop.offsetHeight-8,r.bottom+6)+'px';
  _histPop=pop;
}
document.addEventListener('pointerdown',e=>{ if(_histPop && !_histPop.contains(e.target) && !(e.target.closest&&e.target.closest('#b_more,#mu_more'))) closeHistoryPop(); });
addEventListener('scroll',closeHistoryPop,true);
addEventListener('resize',closeHistoryPop);

/* ================= popover "Configurar exportação" (ancorado no botão da barra) ================= */
// Exportação e interface sai da lista do painel esquerdo — os mesmos campos
// (acrílico, sombra, DPI) continuam os mesmos nós do DOM, só exibidos como
// popover ancorado no botão da barra em vez de dentro da lista que rola.
let exportPopOpen=false;
function closeExportPop(){
  const exp=$('#d_exportWrap');
  if(!exp || !exportPopOpen) return;
  exp.classList.remove('pop-open'); exp.open=false; exportPopOpen=false;
  $('#b_exportCfg') && $('#b_exportCfg').classList.remove('on');
}
function toggleExportPop(anchor){
  const exp=$('#d_exportWrap');
  if(!exp || isMobile()) return;
  if(exportPopOpen){ closeExportPop(); return; }
  closeCF();
  exp.open=true; exp.classList.add('pop-open'); exportPopOpen=true;
  anchor.classList.add('on');
  const r=anchor.getBoundingClientRect();
  exp.style.left=Math.max(8,Math.min(innerWidth-exp.offsetWidth-8, r.right-exp.offsetWidth))+'px';
  exp.style.top=(r.bottom+6+exp.offsetHeight>innerHeight ? Math.max(8,r.top-6-exp.offsetHeight) : r.bottom+6)+'px';
}
document.addEventListener('pointerdown',e=>{
  const exp=$('#d_exportWrap'), btn=$('#b_exportCfg');
  if(exportPopOpen && exp && !exp.contains(e.target) && !(btn && btn.contains(e.target))) closeExportPop();
});
addEventListener('scroll',e=>{
  const exp=$('#d_exportWrap'), t=e.target;
  if(exportPopOpen && exp && (t===exp || (t && t.nodeType===1 && exp.contains(t)))) return;
  closeExportPop();
},true);
addEventListener('resize',closeExportPop);
function bindAll(){
  Object.entries(FORMATS).forEach(([k,v])=>$('#c_format').add(new Option(v.label,k)));
  for(let i=1;i<=12;i++){ $('#c_cols').add(new Option(i,i)); $('#c_rows').add(new Option(i,i)); }

  // TEMPLATES — cartões com miniatura gráfica na tela inicial
  const tplList=$('#tplList');
  if(tplList) TEMPLATES.forEach(t=>{
    const b=document.createElement('button');
    b.type='button'; b.className='tpl-card'; b.dataset.tpl=t.id;
    b.innerHTML=`<span class="tpl-card__thumb">${tplThumbSVG(t)}</span>
      <span class="tpl-card__name">${esc(t.name)}</span>
      <span class="tpl-card__desc">${esc(t.desc)}</span>`;
    b.onclick=()=>applyTemplate(t.id);
    tplList.appendChild(b);
  });
  // MODELOS DE FOLHA — chips no painel esquerdo
  const layoutRow=$('#layoutRow');
  if(layoutRow) LAYOUTS.forEach(l=>{
    const c=document.createElement('button');
    c.type='button'; c.className='chip'; c.dataset.layout=l.id; c.textContent=l.name;
    c.onclick=()=>applyLayout(l.id);
    layoutRow.appendChild(c);
  });
  Object.keys(PRESET_LABELS).forEach(k=>{
    const b=document.createElement('button'); b.className='chip'; b.dataset.p=k; b.textContent=PRESET_LABELS[k];
    b.onclick=()=>{ const ph=cur(); if(!ph) return; pushHistory('preset');
      ph.filter={...PRESETS[k],preset:k}; fillRight(ph); livePhoto(ph); save(); };
    $('#presetRow').appendChild(b);
  });
  Object.keys(CAPTION_STYLE_LABELS).forEach(k=>{
    const b=document.createElement('button'); b.className='chip'; b.textContent=CAPTION_STYLE_LABELS[k];
    b.onclick=()=>{ pushHistory('capstyle'); const st=CAPTION_STYLES[k];
      Object.assign(state.settings,{captionColor:COLOR_DEFAULTS.captionColor},st,{capFx:{...st.capFx}}); state.settings=migrateSettings(state.settings);
      syncControls(); applyVars(); render(); save(); };
    $('#capStyleRow').appendChild(b);
  });

  $('#c_format').onchange=e=>{ pushHistory('fmt'); applyFormat(e.target.value); syncControls(); render(); save(); };
  bindRange('#c_w','polaroidWidthMm',v=>v+' mm');
  bindRange('#c_frame','frameMm',v=>v+' mm');
  bindRange('#c_frameTop','frameTopMm',v=>v+' mm');
  [['#c_pdfColor','pdfColor',v=>v],['#c_backSide','backSide',v=>v],['#c_gamma','printGamma',v=>+v]].forEach(([id,k,f])=>{ const e=$(id); if(e) e.onchange=()=>{ state.settings[k]=f(e.value); state.settings=migrateSettings(state.settings); save(); }; });
  { const sd=$('#s_date'); if(sd) sd.onclick=()=>{ const ph=cur(); if(!ph||!ph.taken) return; pushHistory('date');
      const d=ph.taken.split('-').reverse().join('/'); ph.caption=(ph.caption||'').trim()?ph.caption.trim()+' · '+d:d; save(); render(); }; }
  bindRange('#c_cap','captionMm',v=>+v<=0?'0 mm (sem legenda)':v+' mm');
  bindRange('#c_radius','radiusMm',v=>v+' mm');
  bindRange('#c_tilt','tiltDeg',v=>v+'°');
  bindRange('#c_margin','marginMm',v=>v+' mm');
  bindRange('#c_gap','gapMm',v=>v+' mm');
  bindRange('#c_mo','markOffset',v=>v+' mm');
  bindRange('#c_ml','markLen',v=>v+' mm');
  bindRange('#c_fs','captionSizePt',v=>v+' pt');
  { const el=$('#c_ls'); el.addEventListener('pointerdown',()=>pushHistory('ls'));
    el.addEventListener('input',()=>{ state.settings.capFx={...state.settings.capFx,ls:+el.value/100}; $('#v_ls').textContent=el.value+'%'; refreshCaptions(); save(); if(typeof sheetEditor!=='undefined') sheetEditor.refresh(); }); }

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
  $('#c_landscape').onchange=e=>{ pushHistory('pg'); state.settings.landscape=e.target.checked; syncControls(); render(); save(); fit(); };
  $('#c_autofit').onchange=e=>{ pushHistory('autofit'); state.settings.autoFit=e.target.checked; syncControls(); applyVars(); render(); save(); fit(); };
  $('#c_cols').onchange=e=>{ pushHistory('cols'); state.settings.columns=e.target.value; syncControls(); applyVars(); render(); save(); };
  $('#c_rows').onchange=e=>{ pushHistory('rows'); state.settings.rows=e.target.value; syncControls(); applyVars(); render(); save(); };
  $('#c_align').onchange=e=>{ pushHistory('align'); state.settings.align=e.target.value; render(); save(); };
  $('#c_cardLine').onchange=e=>{ pushHistory('cut'); state.settings.cardLine=e.target.checked; applyVars(); render(); save(); };
  $('#c_cardLineColor').oninput=e=>{ state.settings.cardLineColor=e.target.value; applyVars(); render(); save(); };
  $('#c_marks').onchange=e=>{ pushHistory('cut'); state.settings.cornerMarks=e.target.checked; render(); save(); };
  $('#c_font').onchange=e=>{ pushHistory('font'); state.settings.captionFont=e.target.value; render(); save(); };
  $('#c_upper').onclick=()=>{ pushHistory('upper'); state.settings.captionUpper=!state.settings.captionUpper; syncControls(); applyVars(); render(); save(); };
  $('#c_shadowtxt').onclick=()=>{ pushHistory('capsh'); const fx={...state.settings.capFx};
    if(fx.sh){ delete fx.sh; delete fx.shd; delete fx.sho; } else Object.assign(fx,{sh:'#000000',shd:0.25,sho:0.3});
    state.settings.capFx=EPTextFx.clean(fx); syncControls(); render(); save(); };
  $('#c_tape').onchange=e=>{ pushHistory('tape'); state.settings.tape=e.target.value; render(); save(); };
  $('#c_tapeColor').oninput=e=>{ state.settings.tapeColor=e.target.value; render(); save(); };
  $('#c_capColor').oninput=e=>{ state.settings.captionColor=e.target.value; applyVars(); render(); save(); };
  $('#c_cardColor').oninput=e=>{ state.settings.cardColor=e.target.value; applyVars(); render(); save(); };
  $('#c_resetColors').onclick=()=>{ pushHistory('colors'); Object.assign(state.settings,COLOR_DEFAULTS,{bg:{kind:'none'}});
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
  $('#b_print').onclick=()=>{ select(null); setTimeout(printDoc,80); };
  $('#b_pdf').onclick=exportPDF;
  $('#b_png').onclick=exportPNG;
  $('#b_exportCfg').onclick=e=>{ e.stopPropagation(); toggleExportPop(e.currentTarget); };

  // painéis / zen / menu
  $('#b_pl').onclick=()=>togglePanel('left');
  $('#b_pr').onclick=()=>togglePanel('right');
  $('#b_zen').onclick=()=>{ zen=!zen; applyUI(); };
  $('#zenExit').onclick=()=>{ zen=false; applyUI(); };
  const scrim=$('#scrim');
  if(scrim) scrim.onclick=()=>{ $('#menu').hidden=true; uiState.left=false; uiState.right=false; applyUI(); };
  const menu=$('#menu');
  $('#b_more').onclick=e=>{ e.stopPropagation(); menu.hidden=!menu.hidden; syncScrim(); };
  document.addEventListener('pointerdown',e=>{
    if(!menu.hidden && !menu.contains(e.target) && !(e.target.closest&&e.target.closest('#b_more,#mu_more'))){ menu.hidden=true; syncScrim(); }
  });
  const mclose=()=>{ menu.hidden=true; syncScrim(); };
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
  if(typeof FEEDBACK_URL!=='undefined' && FEEDBACK_URL){
    const af=$('#asideFeedback');
    if(af){ af.href=FEEDBACK_URL; af.target='_blank'; af.hidden=false; }
  }
  $('#m_pdf').onclick=()=>{ mclose(); exportPDF(); };
  $('#m_png').onclick=()=>{ mclose(); exportPNG(); };
  $('#m_print').onclick=()=>{ mclose(); select(null); setTimeout(printDoc,80); };
  $('#m_history').onclick=()=>{ mclose(); openHistoryPop(); };
  $('#m_new').onclick=()=>{ mclose(); newProject(); };
  $('#m_save').onclick=()=>{ mclose(); exportProject(); };
  // predefinição: só os ajustes (papel, margens, cores, saída…), sem páginas nem fotos.
  // Abrir o arquivo em "Abrir projeto…" aplica os ajustes ao documento atual.
  $('#m_preset').onclick = () => { mclose(); const keep = PRESET_DROP.reduce((o, k) => (delete o[k], o), JSON.parse(JSON.stringify(state.settings)));
    downloadBlob(new Blob([JSON.stringify({ preset: true, app: 'polaroidestudio', settings: keep })], { type: 'application/json' }), 'predefinicao-polaroide.json'); toast('Predefinição salva.'); };
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
  $('#f_applyAll').onclick=()=>{
    const ph=cur(); if(!ph) return;
    const targets=state.photos.filter(p=>p!==ph);
    if(!targets.length){ toast('Nenhuma outra foto na folha.'); return; }
    pushHistory('applyAllFilter');
    const filter={...ph.filter};
    targets.forEach(p=>{ p.filter={...filter}; });
    render(); save();
    toast(`Ajuste aplicado a ${targets.length} foto${targets.length>1?'s':''}.`);
  };
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
