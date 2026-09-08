/* Polaroide Studio — js/layout.js
   geometria da folha e cálculo de DPI
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= geometria / layout ================= */
function geom(){
  const s=state.settings;
  const aspect=(s.aspectW||1)/(s.aspectH||1);
  const polW=s.polaroidWidthMm, frame=s.frameMm, cap=s.captionMm;
  const winW=polW-2*frame, winH=winW/aspect;
  return {aspect,polW,polH:frame+winH+cap,frame,cap,winW,winH};
}
function pageDims(){
  const s=state.settings, pg=PAGE_SIZES[s.pageSize]||PAGE_SIZES.a4;
  return s.landscape?[pg.h,pg.w]:[pg.w,pg.h];
}
function layout(){
  const s=state.settings, g=geom();
  const [PW,PH]=pageDims();
  const printW=PW-2*s.marginMm, printH=PH-2*s.marginMm;
  let cols=s.columns==='auto'
    ? Math.max(1,Math.floor((printW+s.gapMm)/(g.polW+s.gapMm)))
    : clamp(+s.columns,1,20);
  const rows=Math.max(1,Math.floor((printH+s.gapMm)/(g.polH+s.gapMm)));
  const perPage=Math.max(1,cols*rows);
  const pages=Math.max(1,Math.ceil(state.photos.length/perPage));
  return {cols,rows,perPage,pages,PW,PH,printW,printH};
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
