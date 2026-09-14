/* Polaroide Studio — js/export.js
   render em canvas -> PDF / PNG e arquivo de projeto .json
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= renderer canvas (exportação) ================= */
function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
function wrapText(ctx,text,cx,cy,maxW,lh){
  const words=text.replace(/\n/g,' \n ').split(/ +/), lines=[]; let line='';
  for(const w of words){
    if(w==='\n'){ lines.push(line); line=''; continue; }
    const t=line?line+' '+w:w;
    if(ctx.measureText(t).width>maxW&&line){ lines.push(line); line=w; } else line=t;
  }
  if(line) lines.push(line);
  const shown=lines.slice(0,3);
  if(lines.length>3) shown[2]=shown[2].replace(/.$/,'…');
  const y0=cy-(shown.length-1)*lh/2;
  shown.forEach((ln,i)=>ctx.fillText(ln,cx,y0+i*lh));
}
async function ensureFullImages(){
  for(const ph of state.photos){
    const m=media[ph.id]; if(!m) continue;
    if(!m.fullImg) m.fullImg=await loadImg(m.fullURL);
  }
}
async function ensureFonts(){
  try{ if(typeof EPArt!=='undefined') await EPArt.ensure(usedArt()); }catch(e){}
  try{
    await document.fonts.ready;
    const fam=state.settings.captionFont.split(',')[0].replace(/["']/g,'').trim();
    await document.fonts.load(`700 ${state.settings.captionSizePt*4}px "${fam}"`).catch(()=>{});
    await document.fonts.load(`400 ${state.settings.captionSizePt*4}px "${fam}"`).catch(()=>{});
  }catch(e){}
}
// opts.back: verso da folha (frente e verso, virar pela borda longa) — as
// posições espelham na horizontal para cada verso cair atrás do seu card.
// Tudo o que depende do estado é lido ANTES do primeiro await (as miniaturas
// dos modelos trocam `state` só durante a parte síncrona): fundo/marca d'água
// e legendas/elementos viram SVG (a mesma caneta da tela) e as fotos são
// guardadas por referência.
async function drawPage(pageIndex,dpi,opts={}){
  const s=state.settings, g=geom(), L=layout();
  const px=mm=>mm*dpi/25.4;
  const cv=document.createElement('canvas');
  cv.width=Math.round(px(L.PW)); cv.height=Math.round(px(L.PH));
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,cv.width,cv.height);
  const under=underSVG(), over=pageOverExportSVG(pageIndex,opts);
  const slice=pagePhotos(pageIndex,L);
  const jobs=slice.map((ph,i)=>{
    const col=i%L.cols, row=Math.floor(i/L.cols), c=cardPos(i,L,g);
    return {ph, m:media[ph.id], x:c.x, y:c.y, tilt:tiltOf(ph), marks:markSegs(col,row,L,g), filter:cssFilter(ph)};
  });
  const [imU,imO]=await Promise.all([svgImage(under),svgImage(over)]);
  if(imU) ctx.drawImage(imU,0,0,cv.width,cv.height);
  jobs.forEach(j=>{
    if(opts.back) drawPolBack(ctx,px,j.ph,L.PW-j.x-g.polW,j.y,g,s,j.tilt);
    else drawPol(ctx,px,j,g,s);
  });
  if(imO) ctx.drawImage(imO,0,0,cv.width,cv.height);
  return cv;
}
function drawPol(ctx,px,job,g,s){
  const {ph,x:xMm,y:yMm,tilt,marks,m}=job;
  const w=px(g.polW),h=px(g.polH);
  ctx.save();
  ctx.translate(px(xMm)+w/2,px(yMm)+h/2);
  if(tilt) ctx.rotate(tilt*Math.PI/180);
  ctx.translate(-w/2,-h/2);

  roundRect(ctx,0,0,w,h,px(s.radiusMm)); ctx.fillStyle=s.cardColor||'#ffffff'; ctx.fill();

  const wx=px(g.frame),wy=px(g.top),ww=px(g.winW),wh=px(g.winH);
  ctx.save(); ctx.beginPath(); ctx.rect(wx,wy,ww,wh); ctx.clip();
  if(m&&m.fullImg){
    const img=m.fullImg, iw=img.naturalWidth, ih=img.naturalHeight;
    const f=Math.max(ww/iw,wh/ih)*ph.zoomF, dw=iw*f, dh=ih*f;
    const icx=wx+ww/2+(ph.ox/100)*ww, icy=wy+wh/2+(ph.oy/100)*wh;
    ctx.filter=job.filter;
    ctx.save(); ctx.translate(icx,icy);
    if(ph.rot) ctx.rotate(ph.rot*Math.PI/180);
    if(ph.flipH) ctx.scale(-1,1);
    ctx.drawImage(img,-dw/2,-dh/2,dw,dh);
    ctx.restore(); ctx.filter='none';
    if(ph.filter.vignette>0){
      const rg=ctx.createRadialGradient(wx+ww/2,wy+wh/2,Math.min(ww,wh)*0.30,wx+ww/2,wy+wh/2,Math.max(ww,wh)*0.72);
      rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(1,`rgba(0,0,0,${0.8*ph.filter.vignette})`);
      ctx.fillStyle=rg; ctx.fillRect(wx,wy,ww,wh);
    }
  }else{ ctx.fillStyle='#e9e9e9'; ctx.fillRect(wx,wy,ww,wh); }
  ctx.restore();

  if(s.cardLine){
    ctx.strokeStyle=s.cardLineColor||'#c9c9c9'; ctx.lineWidth=Math.max(1,px(0.2));
    roundRect(ctx,0,0,w,h,px(s.radiusMm)); ctx.stroke();
  }
  if(s.tape && s.tape!=='none'){
    ctx.save();
    roundRect(ctx,0,0,w,h,px(s.radiusMm)); ctx.clip();   // efeitos nunca saem do card
    drawDecor(ctx,px,g,s.tape,s.tapeColor);
    ctx.restore();
  }
  // marcas de corte no MESMO espaço inclinado do card (antes ficavam retas
  // enquanto o card girava — cortar pela marca cortava a foto). (A10)
  if(s.cornerMarks && marks){
    ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1,px(0.12));
    marks.forEach(([a,b,c,d])=>{ ctx.beginPath(); ctx.moveTo(px(a),px(b)); ctx.lineTo(px(c),px(d)); ctx.stroke(); });
  }
  ctx.restore();
}
// verso do card: legenda e data da foto (ou linhas para escrever à mão)
function drawPolBack(ctx,px,ph,xMm,yMm,g,s,t){
  const tilt=-t;
  const w=px(g.polW),h=px(g.polH);
  ctx.save();
  ctx.translate(px(xMm)+w/2,px(yMm)+h/2);
  if(tilt) ctx.rotate(tilt*Math.PI/180);
  ctx.translate(-w/2,-h/2);
  roundRect(ctx,0,0,w,h,px(s.radiusMm)); ctx.fillStyle=s.cardColor||'#ffffff'; ctx.fill();
  ctx.fillStyle=s.captionColor; ctx.strokeStyle=s.captionColor; ctx.textAlign='center'; ctx.textBaseline='middle';
  if(s.backSide==='lines'){
    ctx.globalAlpha=0.35; ctx.lineWidth=Math.max(1,px(0.15));
    for(let y=px(g.top+10); y<h-px(8); y+=px(8)){ ctx.beginPath(); ctx.moveTo(px(g.frame+2),y); ctx.lineTo(w-px(g.frame+2),y); ctx.stroke(); }
    ctx.globalAlpha=1;
  }else{
    const cap=(ph.caption||'').trim();
    ctx.font=`400 ${px(Math.min(g.polW*0.09,6))}px ${s.captionFont}`;
    if(cap) wrapText(ctx,s.captionUpper?cap.toUpperCase():cap,w/2,h*0.45,w-px(10),px(Math.min(g.polW*0.09,6))*1.2);
    if(ph.taken){ ctx.font=`400 ${px(3.2)}px 'Arimo',sans-serif`; ctx.globalAlpha=0.7; ctx.fillText(ph.taken.split('-').reverse().join('/'),w/2,h*0.45+px(Math.min(g.polW*0.09,6))*2.2); ctx.globalAlpha=1; }
  }
  ctx.restore();
}
// efeitos (fita / grampo / mini brad / percevejo) presos nos cantos da janela
// da foto, no espaço local já inclinado do polaroide e recortado no card.
// g = geometria em mm; px converte mm->px.
function drawDecor(ctx,px,g,mode,color){
  const [kind,where]=mode.split('-');
  const wx=px(g.frame),wy=px(g.top),ww=px(g.winW),wh=px(g.winH);
  const inx=px(1.5);
  const spots = where==='top'
    ? [[wx+ww/2,wy+px(1),-2]]
    : where==='2'
      ? [[wx+inx,wy+inx,-45],[wx+ww-inx,wy+inx,45]]
      : [[wx+inx,wy+inx,-45],[wx+ww-inx,wy+inx,45],[wx+inx,wy+wh-inx,45],[wx+ww-inx,wy+wh-inx,-45]];
  const disc = kind==='brad' ? {d:px(4.6),col:'#a97f3d',shadow:0.4,blur:0.5,oy:0.35,edge:0.34,slit:true}
             : kind==='pin'  ? {d:px(5.6),col:'#b23b2c',shadow:0.42,blur:1.4,oy:0.9,edge:0.42,dot:true}
             : null;
  spots.forEach(([cx,cy,deg])=>{
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate(deg*Math.PI/180);
    if(kind==='tape') tapePiece(ctx,px,px(where==='top'?22:18),px(6),color);
    else if(kind==='staple') staplePiece(ctx,px,px(7),px(3.4));
    else if(disc) discPiece(ctx,px,disc);
    ctx.restore();
  });
}
function discPiece(ctx,px,o){
  const r=o.d/2;
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,'+o.shadow+')'; ctx.shadowBlur=Math.max(1,px(o.blur)); ctx.shadowOffsetY=Math.max(1,px(o.oy));
  ctx.fillStyle=o.col; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
  ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.clip();
  const hi=ctx.createRadialGradient(-r*0.35,-r*0.42,r*0.1,-r*0.1,-r*0.1,r*1.2);
  hi.addColorStop(0,'rgba(255,255,255,0.92)'); hi.addColorStop(0.45,'rgba(255,255,255,0)');
  ctx.fillStyle=hi; ctx.fillRect(-r,-r,o.d,o.d);
  const sh=ctx.createRadialGradient(r*0.25,r*0.32,r*0.15,0,0,r);
  sh.addColorStop(0.55,'rgba(0,0,0,0)'); sh.addColorStop(1,'rgba(0,0,0,'+o.edge+')');
  ctx.fillStyle=sh; ctx.fillRect(-r,-r,o.d,o.d);
  if(o.slit){ ctx.save(); ctx.rotate(0.6); ctx.fillStyle='rgba(0,0,0,0.32)';
    ctx.fillRect(-r*0.55,-r*0.13,r*1.1,r*0.26); ctx.restore(); }
  else if(o.dot){ ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(0,0,r*0.27,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}
function tapePiece(ctx,px,tw,th,color){
  ctx.globalAlpha=0.76;
  ctx.shadowColor='rgba(0,0,0,0.16)'; ctx.shadowBlur=Math.max(1,px(0.7)); ctx.shadowOffsetY=Math.max(1,px(0.4));
  ctx.fillStyle=color||'#e7dfce';
  ctx.fillRect(-tw/2,-th/2,tw,th);
  ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
  const lg=ctx.createLinearGradient(-tw/2,0,tw/2,0);
  lg.addColorStop(0,'rgba(255,255,255,0.42)'); lg.addColorStop(0.42,'rgba(255,255,255,0)'); lg.addColorStop(1,'rgba(0,0,0,0.07)');
  ctx.fillStyle=lg; ctx.fillRect(-tw/2,-th/2,tw,th);
  ctx.globalAlpha=1;
}
function staplePiece(ctx,px,sw,sh){
  ctx.strokeStyle='#8b9199'; ctx.lineWidth=Math.max(1,px(0.75));
  ctx.lineJoin='round'; ctx.lineCap='round';
  ctx.shadowColor='rgba(0,0,0,0.30)'; ctx.shadowBlur=Math.max(1,px(0.4)); ctx.shadowOffsetY=Math.max(1,px(0.3));
  ctx.beginPath();
  ctx.moveTo(-sw/2,sh/2); ctx.lineTo(-sw/2,-sh/2);
  ctx.lineTo(sw/2,-sh/2); ctx.lineTo(sw/2,sh/2);
  ctx.stroke();
  ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
}

/* ---------- exportações ---------- */

// folhas de saída: frente (e verso, se ligado) na ordem de impressão duplex
function outputSheets(){
  const L=layout(), out=[];
  for(let p=0;p<L.pages;p++){ out.push({p,back:false}); if(state.settings.backSide!=='none') out.push({p,back:true}); }
  return out;
}
// compensação de ganho de ponto: clareia os meios-tons (gamma > 1) direto nos pixels
function applyGamma(imgData,gamma){
  if(!gamma||gamma===1) return;
  const lut=new Uint8Array(256); for(let v=0;v<256;v++) lut[v]=Math.round(255*Math.pow(v/255,1/gamma));
  const d=imgData.data; for(let i=0;i<d.length;i+=4){ d[i]=lut[d[i]]; d[i+1]=lut[d[i+1]]; d[i+2]=lut[d[i+2]]; }
}
// PDF pelo gerador do núcleo (vendor/core/pdf.js): RGB para casa ou CMYK
// FOGRA39 · PDF/X-4 para gráfica — a mesma saída das outras ferramentas.
async function exportPDF(){
  if(!state.photos.length){ toast('Adicione fotos primeiro.'); return; }
  const s=state.settings, dpi=exportDPI(), cmyk=s.pdfColor==='cmyk';
  busy('Gerando PDF em '+dpi+' dpi…');
  try{
    await ensureFonts(); await ensureFullImages();
    const L=layout(), sheets=outputSheets(), images=[], pages=[];
    const cm=cmyk?await EPPen.loadCmyk():null;
    const wPt=L.PW/25.4*72, hPt=L.PH/25.4*72;
    for(let i=0;i<sheets.length;i++){
      busy(`Folha ${i+1} de ${sheets.length}${cmyk?' · convertendo para CMYK':''}…`);
      await new Promise(r=>setTimeout(r,0));
      const cv=await drawPage(sheets[i].p,dpi,{back:sheets[i].back});
      const ctx=cv.getContext('2d');
      let bytes;
      if(cmyk||s.printGamma!==1){
        const id=ctx.getImageData(0,0,cv.width,cv.height);
        if(!cmyk) applyGamma(id,s.printGamma);
        if(cmyk) bytes=EPJpeg.encode(cm.rgbaToCmyk(id.data,cv.width,cv.height,{gamma:s.printGamma}),cv.width,cv.height,4,92);
        else { ctx.putImageData(id,0,0); bytes=new Uint8Array(await (await new Promise(r=>cv.toBlob(r,'image/jpeg',0.93))).arrayBuffer()); }
      }else bytes=new Uint8Array(await (await new Promise(r=>cv.toBlob(r,'image/jpeg',0.93))).arrayBuffer());
      const nm='Im'+(i+1);
      images.push({name:nm,bytes,dict:`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace ${cmyk?'/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]':'/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode >>`});
      pages.push({content:`q ${wPt.toFixed(3)} 0 0 ${hPt.toFixed(3)} 0 0 cm /${nm} Do Q`,wPt,hPt});
    }
    busy('Montando o arquivo…');
    const pdf=await EPPdf.build({pages,images,fonts:{resolve:()=>null},deflate:null,
      meta:{title:'Polaroides',creator:'Polaroide Studio — Esmeralda Paper'},
      pdfx:cm?{icc:cm.icc,identifier:'FOGRA39',info:'Coated FOGRA39 (ISO 12647-2:2004)'}:null});
    downloadBlob(new Blob([pdf],{type:'application/pdf'}),cmyk?'polaroides-grafica-CMYK.pdf':'polaroides.pdf');
    toast('PDF'+(cmyk?' para gráfica (CMYK · PDF/X-4)':'')+': '+sheets.length+' página(s)'+(s.backSide!=='none'?' (frente e verso)':'')+'.');
  }catch(e){ console.error(e); toast('Erro ao gerar PDF.'); }
  unbusy();
}
// Impressão pelo MESMO renderizador do PDF (antes imprimia o DOM da tela, que
// podia diferir do arquivo: fontes, filtros e marcas). (A11)
async function printDoc(){
  if(!state.photos.length){ toast('Adicione fotos primeiro.'); return; }
  const dpi=Math.min(300,exportDPI());
  busy('Preparando impressão…');
  try{
    await ensureFonts(); await ensureFullImages();
    const L=layout(), sheets=outputSheets();
    const old=document.getElementById('printRoot'); if(old) old.remove();
    const root=document.createElement('div'); root.id='printRoot';
    const urls=[];
    for(const sh of sheets){
      const cv=await drawPage(sh.p,dpi,{back:sh.back});
      if(state.settings.printGamma!==1){ const c=cv.getContext('2d'), id=c.getImageData(0,0,cv.width,cv.height); applyGamma(id,state.settings.printGamma); c.putImageData(id,0,0); }
      const url=URL.createObjectURL(await new Promise(r=>cv.toBlob(r,'image/jpeg',0.93)));
      urls.push(url);
      const img=document.createElement('img'); img.className='psheet'; img.alt=''; img.src=url;
      img.style.width=L.PW+'mm'; img.style.height=(L.PH-0.2)+'mm';
      root.appendChild(img);
    }
    document.body.appendChild(root);
    await Promise.all([...root.querySelectorAll('img')].map(im=>im.decode().catch(()=>{})));
    const [PW,PH]=pageDims();
    try{ pageSheet.replaceSync(`@media print{@page{size:${PW}mm ${PH}mm;margin:0} body>*:not(#printRoot){display:none!important} #printRoot{display:block!important} #printRoot .psheet{display:block;break-after:page;page-break-after:always} #printRoot .psheet:last-child{break-after:auto;page-break-after:auto}} @media screen{#printRoot{display:none}}`); }catch(e){}
    unbusy();
    let done=false;
    const cleanup=()=>{ if(done) return; done=true; root.remove(); urls.forEach(u=>URL.revokeObjectURL(u)); applyVars(); removeEventListener('afterprint',onAfter); };
    const onAfter=()=>setTimeout(cleanup,4000);
    addEventListener('afterprint',onAfter); setTimeout(cleanup,120000);
    toast(`Impressão: ${sheets.length} página(s) — escala 100%, margens Nenhuma${state.settings.backSide!=='none'?', frente e verso pela borda longa':''}.`);
    window.print();
  }catch(e){ console.error(e); toast('Erro ao preparar a impressão.'); unbusy(); }
}
async function exportPNG(){
  if(!state.photos.length){ toast('Adicione fotos primeiro.'); return; }
  busy('Gerando PNG da folha '+(currentPage+1)+'…');
  try{
    await ensureFonts(); await ensureFullImages();
    const cv=await drawPage(currentPage,exportDPI());
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
    downloadBlob(blob,`polaroides-folha-${currentPage+1}.png`);
  }catch(e){ console.error(e); toast('Erro ao gerar PNG.'); }
  unbusy();
}

/* ================= arquivo de projeto ================= */
function blobToDataURL(b){ return new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b);}); }
async function exportProject(){
  busy('Empacotando projeto…');
  try{
    const out={v:2,settings:state.settings,photos:[]};
    for(const ph of state.photos){
      const m=media[ph.id];
      out.photos.push({...ph, _img:m?await blobToDataURL(m.full):null, _prev:m?await blobToDataURL(m.preview||m.full):null,
        natW:m?m.natW:ph.natW, natH:m?m.natH:ph.natH, name:m?m.name:'foto.jpg'});
    }
    downloadBlob(new Blob([JSON.stringify(out)],{type:'application/json'}),'polaroides-projeto.json');
  }catch(e){ console.error(e); toast('Erro ao salvar o projeto.'); }
  unbusy();
}
const PRESET_DROP=[];
async function importProject(file){
  if(file.size>250*1024*1024){ alert('Arquivo de projeto grande demais.'); return; }
  busy('Abrindo projeto…');
  try{
    const d=JSON.parse(await file.text());
    if(!d||typeof d!=='object'||Array.isArray(d)) throw new Error('estrutura');
    if(d.preset===true&&d.settings&&typeof d.settings==='object'){
      pushHistory('preset'); state.settings=migrateSettings({...state.settings,...d.settings});
      syncControls(); applyVars(); render(); save(); fit(); toast('Predefinição aplicada.'); unbusy(); return;
    }
    const raw=Array.isArray(d.photos)?d.photos.slice(0,400):[];
    Object.keys(media).forEach(k=>delete media[k]);
    state={settings:migrateSettings({...DEFAULTS,...(d.settings&&typeof d.settings==='object'?d.settings:{})}),photos:[]};
    let bad=0;
    for(const p of raw){
      if(!p||typeof p!=='object') continue;
      const ph={caption:p.caption,zoomF:p.zoomF,ox:p.ox,oy:p.oy,rot:p.rot,flipH:p.flipH,seed:p.seed,natW:p.natW,natH:p.natH,filter:p.filter};
      ph.id=uid(); normPhoto(ph);
      if(typeof p._img==='string' && /^data:image\/(jpe?g|png|webp);base64,/i.test(p._img) && p._img.length<45*1024*1024){
        try{
          const {full,preview,natW,natH}=await bakeImage(p._img);
          const rec={full,preview,natW,natH,name:safeName(p.name)};
          if(idbOK){ try{ await DB.set(ph.id,rec); }catch(e){ idbFail(e); } }
          hydrate(ph.id,rec); ph.natW=natW; ph.natH=natH;
        }catch(e){ bad++; }
      } else if(p._img!=null){ bad++; }
      state.photos.push(ph);
    }
    selectedId=null; past.length=0; future.length=0; histMeta.length=0;
    syncControls(); save(); render(); fit();
    toast(bad? `Projeto carregado — ${bad} imagem(ns) não puderam ser lidas.` : 'Projeto carregado.');
  }catch(e){ console.error(e); alert('Arquivo de projeto inválido.'); }
  unbusy();
}
