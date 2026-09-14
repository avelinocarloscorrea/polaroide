/* Polaroide Studio — js/layout.js
   geometria da folha e cálculo de DPI
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= geometria / layout =================
   Regra: nada pode sair da área imprimível. A margem nunca fica abaixo de
   SAFE_MARGIN. Com "Encaixar na folha" (autoFit), a LARGURA do polaroide é
   calculada a partir das colunas × linhas para caber exatamente. */
function pageDims(){
  const s=state.settings, pg=PAGE_SIZES[s.pageSize]||PAGE_SIZES.a4;
  return s.landscape?[pg.h,pg.w]:[pg.w,pg.h];
}
function printArea(){
  const s=state.settings, [PW,PH]=pageDims();
  const m=Math.max(num(s.marginMm,10),minMargin(s.pageSize));
  return {PW,PH,m,printW:Math.max(10,PW-2*m),printH:Math.max(10,PH-2*m)};
}
function polHFromW(w){
  const s=state.settings, aspect=(s.aspectW||1)/(s.aspectH||1);
  return s.frameTopMm+(w-2*s.frameMm)/aspect+s.captionMm;
}
// formato real (filme de verdade): tamanho exato, nunca escalado
function isRealFormat(){ const F=FORMATS[state.settings.format]; return !!(F&&F.real); }
function fitMode(){ return state.settings.autoFit && !isRealFormat(); }
// quantas colunas/linhas: número fixo, ou "auto" pela largura de referência
function gridCount(){
  const s=state.settings, A=printArea(), g=num(s.gapMm,8);
  const cols = s.columns==='auto'
    ? Math.max(1,Math.floor((A.printW+g)/(s.polaroidWidthMm+g)))
    : clamp(Math.round(+s.columns||3),1,12);
  const rows = s.rows==='auto'
    ? Math.max(1,Math.floor((A.printH+g)/(polHFromW(s.polaroidWidthMm)+g)))
    : clamp(Math.round(+s.rows||3),1,12);
  return {cols,rows};
}
// largura que faz cols×linhas caberem na área imprímivel (com folga p/ gaps)
function fitWidth(cols,rows){
  const s=state.settings, A=printArea(), g=num(s.gapMm,8);
  const aspect=(s.aspectW||1)/(s.aspectH||1);
  const cellW=(A.printW-(cols-1)*g)/cols;
  const cellH=(A.printH-(rows-1)*g)/rows;
  const byH=aspect*(cellH-s.frameTopMm-s.captionMm)+2*s.frameMm;   // limite pela altura da célula
  return clamp(Math.floor(Math.min(cellW,byH)*10)/10,15,400);
}
function geom(){
  const s=state.settings;
  const aspect=(s.aspectW||1)/(s.aspectH||1), frame=s.frameMm, cap=s.captionMm;
  let polW=s.polaroidWidthMm;
  if(fitMode()){ const G=gridCount(); polW=fitWidth(G.cols,G.rows); }
  const top=s.frameTopMm;
  const winW=polW-2*frame, winH=winW/aspect;
  return {aspect,polW,polH:top+winH+cap,frame,top,cap,winW,winH};
}
function exportDPI(){ return clamp(Math.round(num(state.settings.exportDPI,300)),72,600); }
function layout(){
  const s=state.settings, g=geom(), A=printArea();
  const maxCols=Math.max(1,Math.floor((A.printW+s.gapMm)/(g.polW+s.gapMm)));
  const maxRows=Math.max(1,Math.floor((A.printH+s.gapMm)/(g.polH+s.gapMm)));
  let wantCols,wantRows;
  if(fitMode()){
    const G=gridCount(); wantCols=G.cols; wantRows=G.rows;
  }else{
    wantCols=s.columns==='auto' ? maxCols : clamp(Math.round(+s.columns||3),1,12);
    wantRows=s.rows==='auto' ? maxRows : clamp(Math.round(+s.rows||3),1,12);
  }
  // trava dura: nunca deixa passar da folha
  const cols=Math.min(wantCols,maxCols), rows=Math.min(wantRows,maxRows);
  const perPage=Math.max(1,cols*rows);
  const pages=Math.max(1,Math.ceil(state.photos.length/perPage));
  return {cols,rows,perPage,pages,PW:A.PW,PH:A.PH,printW:A.printW,printH:A.printH,
          capped:(cols<wantCols||rows<wantRows), wantCols,wantRows};
}
function tiltOf(ph){ return (ph.seed*2-1)*state.settings.tiltDeg; }
function cssFilter(ph){
  const f=ph.filter;
  return `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) `+
         `hue-rotate(${f.hue}deg) sepia(${f.sepia}) grayscale(${f.grayscale})`;
}
// DPI real na impressão. Conta com a imagem que o app GUARDA (redimensionada
// para no máximo FULL_SIDE px no lado maior), não com o arquivo original —
// antes uma foto de 6000 px aparecia com o dobro da resolução que sai no PDF.
function photoDPI(ph){
  const g=geom(), m=media[ph.id]; if(!m) return null;
  const k=Math.min(1,FULL_SIDE/Math.max(m.natW,m.natH));
  const W=m.fullImg?m.fullImg.naturalWidth:m.natW*k, H=m.fullImg?m.fullImg.naturalHeight:m.natH*k;
  const A=g.aspect, natA=W/H;
  let sw,sh;
  if(natA>A){ sh=H/ph.zoomF; sw=H*A/ph.zoomF; }
  else{ sw=W/ph.zoomF; sh=W/A/ph.zoomF; }
  return Math.round(Math.min(sw/(g.winW/25.4), sh/(g.winH/25.4)));
}
// alvo de impressão: 300 dpi (ótima), 200–299 (aceitável), abaixo de 200 (baixa)
function dpiClass(d){ return d==null?'':d>=300?'ok':d>=200?'warn':'bad'; }

// Marcas de corte de um polaroide (coordenadas do próprio card, sem inclinação).
// Nunca invadem o card vizinho: do lado onde há outro card, o traço é
// limitado à metade do espaço entre eles; na borda da grade, à margem da folha.
function markSegs(col,row,L,g){
  const s=state.settings, o=+s.markOffset||0, len=+s.markLen||0, gap=+s.gapMm||0, m=printArea().m;
  const lim=(hasNeighbor)=>Math.max(0,Math.min(len,(hasNeighbor?gap/2:m)-o-0.3));
  const lL=lim(col>0), lR=lim(col<L.cols-1), lT=lim(row>0), lB=lim(row<L.rows-1);
  const W=g.polW,H=g.polH, segs=[];
  const add=(x1,y1,x2,y2)=>{ if(Math.abs(x2-x1)+Math.abs(y2-y1)>0.2) segs.push([x1,y1,x2,y2]); };
  add(-o-lL,0,-o,0); add(0,-o-lT,0,-o);
  add(W+o,0,W+o+lR,0); add(W,-o-lT,W,-o);
  add(-o-lL,H,-o,H); add(0,H+o,0,H+o+lB);
  add(W+o,H,W+o+lR,H); add(W,H+o,W,H+o+lB);
  return segs;
}
