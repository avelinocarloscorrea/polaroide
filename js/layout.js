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
  const m=Math.max(num(s.marginMm,10),SAFE_MARGIN);
  return {PW,PH,m,printW:Math.max(10,PW-2*m),printH:Math.max(10,PH-2*m)};
}
function polHFromW(w){
  const s=state.settings, aspect=(s.aspectW||1)/(s.aspectH||1);
  return s.frameMm+(w-2*s.frameMm)/aspect+s.captionMm;
}
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
  const byH=aspect*(cellH-s.frameMm-s.captionMm)+2*s.frameMm;   // limite pela altura da célula
  return clamp(Math.floor(Math.min(cellW,byH)*10)/10,15,400);
}
function geom(){
  const s=state.settings;
  const aspect=(s.aspectW||1)/(s.aspectH||1), frame=s.frameMm, cap=s.captionMm;
  let polW=s.polaroidWidthMm;
  if(s.autoFit){ const G=gridCount(); polW=fitWidth(G.cols,G.rows); }
  const winW=polW-2*frame, winH=winW/aspect;
  return {aspect,polW,polH:frame+winH+cap,frame,cap,winW,winH};
}
function exportDPI(){ return clamp(Math.round(num(state.settings.exportDPI,300)),72,600); }
function layout(){
  const s=state.settings, g=geom(), A=printArea();
  const maxCols=Math.max(1,Math.floor((A.printW+s.gapMm)/(g.polW+s.gapMm)));
  const maxRows=Math.max(1,Math.floor((A.printH+s.gapMm)/(g.polH+s.gapMm)));
  let wantCols,wantRows;
  if(s.autoFit){
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
function photoDPI(ph){
  const g=geom(), m=media[ph.id]; if(!m) return null;
  const A=g.aspect, natA=m.natW/m.natH;
  let sw,sh;
  if(natA>A){ sh=m.natH/ph.zoomF; sw=m.natH*A/ph.zoomF; }
  else{ sw=m.natW/ph.zoomF; sh=m.natW/A/ph.zoomF; }
  return Math.round(Math.min(sw/(g.winW/25.4), sh/(g.winH/25.4)));
}
function dpiClass(d){ return d==null?'':d>=240?'ok':d>=150?'warn':'bad'; }
