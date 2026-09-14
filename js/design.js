/* Polaroide Studio — js/design.js
   Tudo o que é desenhado com a caneta do núcleo (a mesma do Planner e do
   Calendar), igual na tela e na impressão:
   - fundo da folha (EPBackground) e marca d'água (EPWatermark), por baixo;
   - legenda de cada polaroide, com o estilo único (EPTextFx): fonte, cor,
     negrito/itálico/caixa alta da aba Estilo + efeitos (contorno, fundo,
     sombra, giro, posição) em settings.capFx;
   - textos, ilustrações e imagens soltos na folha (settings.extras).
   Na tela: um <svg> por baixo e outro por cima de cada folha, e um por card
   (a legenda gira junto com o card). No PDF/PNG: os mesmos desenhos viram
   imagem por cima da foto (svgLayer).
   (parte de app; carregado depois de layout.js) */
"use strict";

const PT_MM=72/25.4;
// ids das legendas/fotos/elementos na edição na folha
const CAP_KEY=id=>'cap:'+id, PH_KEY=id=>'ph:'+id, X_KEY=id=>'x:'+id;

/* ---------- geometria ---------- */
// canto de cada card na folha (mm) — mesma conta de drawPage e do grid da tela
function cardPos(i,L=layout(),g=geom()){
  const s=state.settings, A=printArea();
  const blockW=L.cols*g.polW+(L.cols-1)*s.gapMm;
  const ox=s.align==='center'?(L.PW-blockW)/2:A.m;
  return {x:ox+(i%L.cols)*(g.polW+s.gapMm), y:A.m+Math.floor(i/L.cols)*(g.polH+s.gapMm)};
}
const pagePhotos=(p,L=layout())=>state.photos.slice(p*L.perPage,(p+1)*L.perPage);
const pageExtras=p=>(state.settings.extras||[]).filter(x=>x.page===-1||x.page===p);

/* ---------- legenda ---------- */
// estilo completo da legenda (o que a barra da folha mostra e o desenho usa)
function capStyle(){
  const s=state.settings;
  return EPTextFx.norm({...s.capFx, fam:famOfFont(s.captionFont), color:s.captionColor, bold:s.captionBold, italic:s.captionItalic, upper:s.captionUpper, s:s.captionSizePt/14});
}
// desenha a legenda do card com o canto em (ox, oy); devolve a caixa (mm) ou null
function drawCaption(pen,ph,g,ox,oy,opt={}){
  const s=state.settings, f=capStyle();
  let txt=String(ph.caption||'').trim();
  if(g.cap<=1 && !f.dy) return null;
  const size=s.captionSizePt, fam=f.fam, bold=!!f.bold;
  const cx=ox+g.polW/2+f.dx, cy=oy+g.top+g.winH+g.cap/2+f.dy;
  if(!txt){
    if(!opt.hits) return null;
    const h=Math.max(4,Math.min(g.cap-1,size/PT_MM*1.3)), w=g.polW-2*g.frame-2;
    return {x:cx-w/2,y:cy-h/2,w,h,empty:true};
  }
  const maxW=Math.max(8,g.polW-6);
  const lines=pen.wrapText(EPTextFx.txt(txt,f),maxW,size,bold,3,fam);
  const lh=size*(f.lh||1.16)/PT_MM, al=f.align||'c';
  const wmax=Math.max(1,...lines.map(l=>pen.textWidth(l,size,bold,fam)+(f.ls?Math.max(0,[...l].length-1)*f.ls*size/PT_MM:0)));
  const top=cy-lines.length*lh/2, x0=cx-wmax/2;
  // o texto já veio em caixa alta/quebrado; a caneta com estilo só aplica espaçamento/itálico/transparência
  const fDraw={...f,upper:false};
  const P2=EPTextFx.pen(pen,fDraw);
  lines.forEach((l,j)=>P2.text(l,al==='l'?x0:al==='r'?x0+wmax:cx,top+(j+0.5)*lh,{size,family:fam,font:bold?'bold':undefined,color:f.color,align:al,baseline:'middle'}));
  const box={x:x0,y:top,w:wmax,h:lines.length*lh};
  P2.done(box);
  return box;
}
// svg da legenda de um card (tela): cobre o card inteiro, sem fundo
function cardCaptionSVG(ph,g=geom()){
  if(!String(ph.caption||'').trim()) return '';
  const pen=SvgPen(g.polW,g.polH,{bg:'none'});
  drawCaption(pen,ph,g,0,0);
  return pen.svg();
}

/* ---------- elementos soltos ---------- */
const EXTRA_BASE={text:16,art:34,image:50};
function extraArtBox(id,base){
  const it=typeof EPArt!=='undefined'?EPArt.get(id):null, ar=it?it.w/it.h:1;
  return ar>=1?[base,base/ar]:[base*ar,base];
}
function drawExtras(pen,p,W,H,hits){
  pageExtras(p).forEach(x=>{
    const f=EPTextFx.norm(x); if(f.hide) return;
    const cx=W/2+f.dx, cy=H/2+f.dy, key=X_KEY(x.id);
    if(x.type==='text'){
      const box=EPTextFx.block(pen,x.text||'Texto',cx,cy,EXTRA_BASE.text*f.s,f,{fam:'playfair',color:'#1f2522',lh:1.2});
      if(hits) hits.push({key,label:'Texto',kind:'text',...box});
      return;
    }
    const P=EPTextFx.pen(pen,f);
    let w,h;
    if(x.type==='art'){
      [w,h]=extraArtBox(x.art,EXTRA_BASE.art*f.s);
      P.art(x.art,cx-w/2,cy-h/2,w,h,{color:f.color||'#35594d'});
    }else{
      w=EXTRA_BASE.image*f.s;
      const dim=typeof imageDims==='function'?imageDims(x.src):null; h=dim&&dim.w?w*dim.h/dim.w:w;
      P.image(x.src,cx-w/2,cy-h/2,w,h,{fit:'meet'});
    }
    const box={x:cx-w/2,y:cy-h/2,w,h};
    P.done(box);
    if(hits) hits.push({key,label:x.type==='art'?'Ilustração':'Imagem',kind:x.type,...box});
  });
}

/* ---------- camadas de uma folha ---------- */
function drawUnder(pen,W,H){
  const s=state.settings;
  EPBackground.draw(pen,0,0,W,H,s.bg,'#ffffff');
  if(s.wm&&s.wm.on) EPWatermark.draw(pen,W,H,s.wm,{ink:s.captionColor,paper:s.cardColor,fam:famOfFont(s.captionFont)});
}
const hasUnder=()=>EPBackground.active(state.settings.bg)||!!(state.settings.wm&&state.settings.wm.on);
function underSVG(){ const [W,H]=pageDims(); if(!hasUnder()) return ''; const pen=SvgPen(W,H,{bg:'none'}); drawUnder(pen,W,H); return pen.svg(); }
function overSVG(p){ const [W,H]=pageDims(); if(!pageExtras(p).length) return ''; const pen=SvgPen(W,H,{bg:'none'}); drawExtras(pen,p,W,H); return pen.svg(); }

// caixas editáveis de uma folha (mm): fotos, legendas e elementos
function pageHits(p){
  const L=layout(), g=geom(), [W,H]=pageDims(), items=[];
  const pen=SvgPen(W,H,{bg:'none'});
  pagePhotos(p,L).forEach((ph,i)=>{
    const c=cardPos(i,L,g);
    items.push({key:PH_KEY(ph.id),label:'Foto '+(p*L.perPage+i+1),kind:'photo',x:c.x+g.frame,y:c.y+g.top,w:g.winW,h:g.winH});
    const b=drawCaption(pen,ph,g,c.x,c.y,{hits:true});
    if(b){
      // área de toque confortável: pelo menos a faixa da legenda inteira
      const w=Math.max(b.w,g.polW-2*g.frame-2), h=Math.max(b.h,Math.min(g.cap-1,14));
      items.push({key:CAP_KEY(ph.id),label:'Legenda',kind:'text',x:b.x+b.w/2-w/2,y:b.y+b.h/2-h/2,w,h});
    }
  });
  drawExtras(pen,p,W,H,items);
  return {w:W,h:H,items};
}

/* ---------- exportação: camadas vetoriais viram imagem ---------- */
// folha inteira: legendas de todos os cards (giradas com o card) e elementos soltos
function pageOverExportSVG(p,opts={}){
  const L=layout(), g=geom(), [W,H]=pageDims();
  const pen=SvgPen(W,H,{bg:'none'});
  let any=false;
  if(!opts.back){
    pagePhotos(p,L).forEach((ph,i)=>{
      if(!String(ph.caption||'').trim()) return;
      const c=cardPos(i,L,g), t=tiltOf(ph);
      if(t) pen.rotate(t,c.x+g.polW/2,c.y+g.polH/2);
      drawCaption(pen,ph,g,c.x,c.y); any=true;
      if(t) pen.unclip();
    });
  }
  if(!opts.back && pageExtras(p).length){ drawExtras(pen,p,W,H); any=true; }
  return any?pen.svg():'';
}
// <svg> -> imagem desenhável no canvas, com as fontes do núcleo embutidas
async function svgImage(svg){
  if(!svg) return null;
  const css=typeof embeddedFontStyle==='function'?await embeddedFontStyle(svg):'';
  const full=css?svg.replace(/(<svg[^>]*>)/,'$1'+css):svg;
  const url=URL.createObjectURL(new Blob([full],{type:'image/svg+xml'}));
  try{ const im=await loadImg(url); if(im.decode) await im.decode().catch(()=>{}); return im; }
  finally{ setTimeout(()=>URL.revokeObjectURL(url),1000); }
}
// ilustrações usadas (carregar antes de exportar)
function usedArt(){
  const s=state.settings, ids=[];
  (s.extras||[]).forEach(x=>{ if(x.type==='art'&&x.art) ids.push(x.art); });
  if(s.bg&&s.bg.kind==='pattern'&&s.bg.pat==='art'&&s.bg.art) ids.push(s.bg.art);
  if(s.wm&&s.wm.on&&s.wm.kind==='art'&&s.wm.art) ids.push(s.wm.art);
  return ids;
}

/* ---------- tela ---------- */
function paintPageLayers(pageEl,p){
  let u=pageEl.querySelector(':scope > .pg-under'); if(!u){ u=document.createElement('div'); u.className='pg-under'; pageEl.prepend(u); }
  let o=pageEl.querySelector(':scope > .pg-over'); if(!o){ o=document.createElement('div'); o.className='pg-over'; pageEl.appendChild(o); }
  u.innerHTML=underSVG(); o.innerHTML=overSVG(p);
}
function paintCaption(polEl2,ph,g=geom()){
  let t=polEl2.querySelector(':scope > .pol-txt'); if(!t){ t=document.createElement('div'); t.className='pol-txt'; polEl2.appendChild(t); }
  t.innerHTML=cardCaptionSVG(ph,g);
}
// redesenhos rápidos (sem refazer o DOM das fotos)
function refreshCaptions(){
  const g=geom();
  $$('.pol',sheetsEl).forEach(el=>{ const ph=state.photos.find(p=>p.id===el.dataset.id); if(ph) paintCaption(el,ph,g); });
}
function refreshLayers(){ [...sheetsEl.querySelectorAll(':scope > .page')].forEach((pg,i)=>paintPageLayers(pg,i)); }
