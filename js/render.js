/* Polaroide Studio — js/render.js
   render da tela (DOM), seleção, zoom, navegação de folhas
   (parte de app; carregado em ordem por index.html) */
"use strict";

// folha de estilo só para o @page da impressão (CSSOM, fora do style-src)
const pageSheet = new CSSStyleSheet();
try{ document.adoptedStyleSheets = [...document.adoptedStyleSheets, pageSheet]; }catch(e){}


/* ================= render (tela) ================= */
function applyVars(){
  const s=state.settings, g=geom();
  const r=sheetsEl.style;
  r.setProperty('--frame',s.frameMm+'mm');
  r.setProperty('--caption',s.captionMm+'mm');
  r.setProperty('--radius',s.radiusMm+'mm');
  r.setProperty('--winAspect',String(g.aspect));
  r.setProperty('--capFont',s.captionFont);
  r.setProperty('--capSize',s.captionSizePt+'pt');
  r.setProperty('--capColor',s.captionColor);
  r.setProperty('--capWeight',s.captionBold?'700':'400');
  r.setProperty('--capStyle',s.captionItalic?'italic':'normal');
  r.setProperty('--capTransform',s.captionUpper?'uppercase':'none');
  r.setProperty('--capSpacing',(s.captionSpacing||0)+'px');
  r.setProperty('--capShadow',s.captionShadow?'0 1px 1px rgba(0,0,0,.30)':'none');
  r.setProperty('--cardBg',s.cardColor);
  r.setProperty('--pm',Math.max(s.marginMm,5)+'mm');   // margem de segurança (guia na tela)
  const cut = s.cardLine ? `0 0 0 .2mm ${s.cardLineColor}` : null;
  const drop = s.screenShadow ? '0 2mm 5mm rgba(0,0,0,.16)' : null;
  r.setProperty('--polShadow',[cut,drop].filter(Boolean).join(',')||'none');
  r.setProperty('--polCut',cut||'none');
  const [PW,PH]=pageDims();
  try{ pageSheet.replaceSync(`@media print{@page{size:${PW}mm ${PH}mm;margin:0}}`); }catch(e){}
}
function polEl(ph){
  const s=state.settings, g=geom();
  const pol=document.createElement('div');
  pol.className='pol'; pol.dataset.id=ph.id;
  pol.style.width=g.polW+'mm';
  pol.style.transform=`rotate(${tiltOf(ph)}deg)`;

  const handle=document.createElement('div');
  handle.className='handle'; handle.title='Arraste para reordenar';
  handle.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  handle.draggable=true;
  handle.addEventListener('dragstart',e=>{dragId=ph.id;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',ph.id);});
  handle.addEventListener('dragend',()=>{dragId=null;$$('.dragover',sheetsEl).forEach(x=>x.classList.remove('dragover'));});

  const dpi=photoDPI(ph);
  const badge=document.createElement('div');
  badge.className='dpi '+dpiClass(dpi);
  badge.textContent=dpi?dpi+' dpi':'';

  const win=document.createElement('div'); win.className='win';
  const img=document.createElement('img');
  img.src=media[ph.id]?media[ph.id].previewURL:'';
  img.alt=''; img.draggable=false;
  styleImg(img,ph);
  const vig=document.createElement('div'); vig.className='vig'; vig.style.opacity=ph.filter.vignette*0.8;
  win.append(img,vig);

  // legenda: <textarea> plano dentro de um wrapper centralizado.
  const cap=document.createElement('div'); cap.className='cap';
  const ta=document.createElement('textarea');
  ta.className='capfield'; ta.rows=1; ta.spellcheck=false; ta.maxLength=500;
  ta.value=ph.caption||'';   // sem legenda = faixa branca (igual à impressão)
  ta.setAttribute('aria-label','Legenda da foto');
  ta.title='Clique para escrever a legenda';
  const grow=()=>{ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; };
  ta.addEventListener('focus',()=>select(ph.id));
  ta.addEventListener('input',()=>{
    ph.caption=ta.value;
    if(selectedId===ph.id){ const th=$('#s_thumb'); if(th) th.title=ta.value; }
    grow(); save();
  });
  cap.appendChild(ta);
  if(g.cap<1) cap.style.display='none';
  requestAnimationFrame(grow);

  win.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    if(e.pointerType==='touch' && e.isPrimary===false) return;   // 2º dedo = pinça, não arrasto
    select(ph.id);
    const rect=win.getBoundingClientRect();
    const sx=e.clientX,sy=e.clientY,sox=ph.ox,soy=ph.oy; let moved=false,hist=false;
    win.setPointerCapture(e.pointerId); win.classList.add('drag');
    const mv=ev=>{
      if(typeof _pinch!=='undefined' && _pinch) return;          // congela a foto durante a pinça
      const dx=ev.clientX-sx,dy=ev.clientY-sy;
      if(!moved&&Math.abs(dx)+Math.abs(dy)>3){ moved=true; if(!hist){pushHistory('pan');hist=true;} }
      ph.ox=clamp(sox+dx/rect.width*100,-90,90);
      ph.oy=clamp(soy+dy/rect.height*100,-90,90);
      img.style.transform=imgTransform(ph);
    };
    const up=()=>{ win.releasePointerCapture(e.pointerId); win.classList.remove('drag');
      win.removeEventListener('pointermove',mv); win.removeEventListener('pointerup',up); if(moved) save(); };
    win.addEventListener('pointermove',mv); win.addEventListener('pointerup',up);
  });

  pol.addEventListener('dragover',e=>{ if(dragId&&dragId!==ph.id){e.preventDefault();pol.classList.add('dragover');} });
  pol.addEventListener('dragleave',()=>pol.classList.remove('dragover'));
  pol.addEventListener('drop',e=>{
    e.preventDefault(); pol.classList.remove('dragover');
    if(!dragId||dragId===ph.id) return;
    pushHistory('reorder');
    const from=state.photos.findIndex(p=>p.id===dragId), to=state.photos.findIndex(p=>p.id===ph.id);
    if(from<0||to<0) return;
    const [m]=state.photos.splice(from,1); state.photos.splice(to,0,m);
    dragId=null; save(); render();
  });

  if(s.cornerMarks){
    const mk=document.createElementNS('http://www.w3.org/2000/svg','svg');
    mk.setAttribute('class','marks'); mk.setAttribute('viewBox',`0 0 ${g.polW} ${g.polH}`);
    mk.setAttribute('preserveAspectRatio','none');
    const o=+s.markOffset||0,l=+s.markLen||0,W=g.polW,H=g.polH;
    const seg=(x1,y1,x2,y2)=>`M${x1} ${y1}L${x2} ${y2}`;
    const d=[seg(-o-l,0,-o,0),seg(0,-o-l,0,-o),
             seg(W+o,0,W+o+l,0),seg(W,-o-l,W,-o),
             seg(-o-l,H,-o,H),seg(0,H+o,0,H+o+l),
             seg(W+o,H,W+o+l,H),seg(W,H+o,W,H+o+l)].join('');
    mk.innerHTML=`<path d="${d}" stroke="#333" stroke-width="0.16" fill="none"/>`;
    pol.appendChild(mk);
  }

  pol.append(handle,badge,win,cap);

  // efeitos "presos" nos cantos da foto — fita, grampo, mini brad, percevejo.
  // Vão dentro de .decorclip, que recorta tudo no contorno do card: nada
  // escapa da borda do polaroide.
  if(s.tape && s.tape!=='none'){
    const [kind,where]=s.tape.split('-');
    const spots = where==='top' ? ['tc'] : where==='2' ? ['tl','tr'] : ['tl','tr','bl','br'];
    const clip=document.createElement('div'); clip.className='decorclip';
    spots.forEach(pos=>{
      const t=document.createElement('i');
      t.className='decor '+kind+' '+pos;
      if(kind==='tape') t.style.setProperty('--tapeC',s.tapeColor);
      else if(kind==='staple') t.innerHTML='<svg viewBox="0 0 24 12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/></svg>';
      clip.appendChild(t);
    });
    pol.appendChild(clip);
  }
  return pol;
}
function imgTransform(ph){
  return `translate(-50%,-50%) translate(${ph.ox}%,${ph.oy}%) rotate(${ph.rot}deg) scale(${ph.flipH?-ph.zoomF:ph.zoomF},${ph.zoomF})`;
}
function styleImg(img,ph){ img.style.transform=imgTransform(ph); img.style.filter=cssFilter(ph); }

function render(){
  const s=state.settings, L=layout();
  applyVars();
  currentPage=clamp(currentPage,0,L.pages-1);
  sheetsEl.innerHTML='';
  for(let p=0;p<L.pages;p++){
    const page=document.createElement('div'); page.className='page';
    page.style.width=L.PW+'mm'; page.style.height=L.PH+'mm';
    page.style.background=s.bgGradient
      ? `linear-gradient(${s.bgAngle}deg, ${s.pageBg}, ${s.pageBg2})`
      : s.pageBg;
    const grid=document.createElement('div');
    grid.className='grid '+(s.align==='center'?'center':'left');
    grid.style.padding=Math.max(s.marginMm,5)+'mm';
    grid.style.gap=s.gapMm+'mm';
    grid.style.gridTemplateColumns=`repeat(${L.cols}, ${geom().polW}mm)`;
    state.photos.slice(p*L.perPage,(p+1)*L.perPage).forEach(ph=>grid.appendChild(polEl(ph)));
    page.appendChild(grid); sheetsEl.appendChild(page);
  }
  applyZoom();
  $('#empty').hidden=state.photos.length>0;
  const gm=geom();
  const capMsg=L.capped?` · limitado pela folha (pediu ${L.wantCols}×${L.wantRows})`:'';
  $('#stat').textContent=`${state.photos.length} foto(s) · ${L.pages} folha(s) · ${L.cols}×${L.rows} por folha · `
    +`${gm.polW.toFixed(0)}×${gm.polH.toFixed(0)} mm cada${capMsg}`;
  if($('#c_w').disabled) $('#v_w').textContent=gm.polW.toFixed(0)+' mm (encaixado)';
  $('#pageLbl').textContent=`${currentPage+1} / ${L.pages}`;
  { const mpg=$('#mpg'); if(mpg) mpg.textContent=L.pages>1?`Folha ${currentPage+1}/${L.pages}`:''; }
  select(selectedId,true);
  updateHistoryButtons();
}

/* ================= seleção / painel direito ================= */
function cur(){ return state.photos.find(p=>p.id===selectedId); }
function select(id,keep){
  const had=selectedId;
  selectedId=(id&&state.photos.some(p=>p.id===id))?id:null;
  $$('.pol.sel',sheetsEl).forEach(e=>e.classList.remove('sel'));
  const ph=cur();
  if(ph){ const el=sheetsEl.querySelector(`.pol[data-id="${ph.id}"]`); el&&el.classList.add('sel'); }
  $('#rightEmpty').hidden=!!ph; $('#rightSel').hidden=!ph;
  if(ph) fillRight(ph);
  // ao selecionar uma foto nova, abre o painel de edição (no celular ele é
  // uma folha na base, então a foto continua visível em cima)
  if(ph && selectedId!==had && !keep && !uiState.right && !zen){
    if(typeof togglePanel==='function') togglePanel('right',true); else { uiState.right=true; applyUI(); }
    if(matchMedia('(max-width:820px)').matches){
      const el=sheetsEl.querySelector(`.pol[data-id="${ph.id}"]`);
      if(el) requestAnimationFrame(()=>el.scrollIntoView({block:'center',behavior:'smooth'}));
    }
  }
}
function fillRight(ph){
  const m=media[ph.id];
  $('#s_thumb').src=m?m.previewURL:'';
  const sc=$('#s_caption'); if(sc && sc!==document.activeElement) sc.value=ph.caption||'';
  const d=photoDPI(ph);
  $('#s_dot').className='dot '+dpiClass(d);
  $('#s_dpi').textContent=d?`Impressão: ~${d} dpi ${d>=240?'(ótima)':d>=150?'(aceitável)':'(baixa — pode borrar)'}`:'—';
  $('#s_zoom').value=ph.zoomF; $('#v_pz').textContent=ph.zoomF.toFixed(2)+'×';
  $('#s_rot').value=ph.rot;    $('#v_rot').textContent=ph.rot.toFixed(1)+'°';
  const f=ph.filter;
  $('#f_br').value=f.brightness; $('#v_br').textContent=Math.round(f.brightness*100)+'%';
  $('#f_co').value=f.contrast;   $('#v_co').textContent=Math.round(f.contrast*100)+'%';
  $('#f_sa').value=f.saturate;   $('#v_sa').textContent=Math.round(f.saturate*100)+'%';
  $('#f_hu').value=f.hue;        $('#v_hu').textContent=(f.hue>0?'+':'')+f.hue;
  $('#f_se').value=f.sepia;      $('#v_se').textContent=Math.round(f.sepia*100)+'%';
  $('#f_gr').value=f.grayscale;  $('#v_gr').textContent=Math.round(f.grayscale*100)+'%';
  $('#f_vi').value=f.vignette;   $('#v_vi').textContent=Math.round(f.vignette*100)+'%';
  $$('#presetRow button').forEach(b=>b.classList.toggle('on',b.dataset.p===f.preset));
}
function livePhoto(ph){
  const el=sheetsEl.querySelector(`.pol[data-id="${ph.id}"]`); if(!el) return;
  const img=$('.win img',el); if(img) styleImg(img,ph);
  const vig=$('.win .vig',el); if(vig) vig.style.opacity=ph.filter.vignette*0.8;
  const badge=$('.dpi',el); const d=photoDPI(ph);
  if(badge){ badge.className='dpi '+dpiClass(d); badge.textContent=d?d+' dpi':''; }
}

/* ================= zoom / páginas ================= */
function applyZoom(){ sheetsEl.style.zoom=zoom; $('#zval').textContent=Math.round(zoom*100)+'%'; }
function fit(){
  const [PW]=pageDims();
  const cs=getComputedStyle(stage);
  const pad=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0);
  const avail=stage.clientWidth-pad-16;
  zoom=clamp(avail/(PW*MM),.12,1.8); userZoomed=false; applyZoom();
}
// zoom mantendo o ponto sob o cursor parado (Ctrl+roda / pinça do trackpad)
function zoomAt(clientX,clientY,factor){
  const z0=zoom, z1=clamp(z0*factor,.1,3);
  if(z1===z0) return;
  const r=stage.getBoundingClientRect();
  const px=stage.scrollLeft+(clientX-r.left), py=stage.scrollTop+(clientY-r.top);
  userZoomed=true; zoom=z1; applyZoom();
  stage.scrollLeft=px*(z1/z0)-(clientX-r.left);
  stage.scrollTop =py*(z1/z0)-(clientY-r.top);
}
function gotoPage(i){
  const L=layout(); currentPage=clamp(i,0,L.pages-1);
  $('#pageLbl').textContent=`${currentPage+1} / ${L.pages}`;
  const pg=sheetsEl.children[currentPage]; if(pg) pg.scrollIntoView({block:'center',behavior:'smooth'});
}
