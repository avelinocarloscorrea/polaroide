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
  try{
    await document.fonts.ready;
    const fam=state.settings.captionFont.split(',')[0].replace(/["']/g,'').trim();
    await document.fonts.load(`700 ${state.settings.captionSizePt*4}px "${fam}"`).catch(()=>{});
    await document.fonts.load(`400 ${state.settings.captionSizePt*4}px "${fam}"`).catch(()=>{});
  }catch(e){}
}
async function drawPage(pageIndex,dpi){
  const s=state.settings, g=geom(), L=layout();
  const px=mm=>mm*dpi/25.4;
  const cv=document.createElement('canvas');
  cv.width=Math.round(px(L.PW)); cv.height=Math.round(px(L.PH));
  const ctx=cv.getContext('2d');
  if(s.bgGradient){
    const th=s.bgAngle*Math.PI/180, dx=Math.sin(th), dy=-Math.cos(th);
    const cx=cv.width/2, cy=cv.height/2, r=Math.hypot(cv.width,cv.height)/2;
    const grd=ctx.createLinearGradient(cx-dx*r,cy-dy*r,cx+dx*r,cy+dy*r);
    grd.addColorStop(0,s.pageBg); grd.addColorStop(1,s.pageBg2);
    ctx.fillStyle=grd;
  }else ctx.fillStyle=s.pageBg;
  ctx.fillRect(0,0,cv.width,cv.height);
  const slice=state.photos.slice(pageIndex*L.perPage,(pageIndex+1)*L.perPage);
  const blockW=L.cols*g.polW+(L.cols-1)*s.gapMm;
  const originX=s.align==='center'?(L.PW-blockW)/2:s.marginMm;
  for(let i=0;i<slice.length;i++){
    const ph=slice[i], col=i%L.cols, row=Math.floor(i/L.cols);
    drawPol(ctx,px,ph,originX+col*(g.polW+s.gapMm),s.marginMm+row*(g.polH+s.gapMm),g,dpi);
  }
  return cv;
}
function drawPol(ctx,px,ph,xMm,yMm,g,dpi){
  const s=state.settings, tilt=tiltOf(ph);
  const w=px(g.polW),h=px(g.polH);
  ctx.save();
  ctx.translate(px(xMm)+w/2,px(yMm)+h/2);
  if(tilt) ctx.rotate(tilt*Math.PI/180);
  ctx.translate(-w/2,-h/2);

  roundRect(ctx,0,0,w,h,px(s.radiusMm)); ctx.fillStyle=s.cardColor||'#ffffff'; ctx.fill();

  const wx=px(g.frame),wy=px(g.frame),ww=px(g.winW),wh=px(g.winH);
  ctx.save(); ctx.beginPath(); ctx.rect(wx,wy,ww,wh); ctx.clip();
  const m=media[ph.id];
  if(m&&m.fullImg){
    const img=m.fullImg, iw=img.naturalWidth, ih=img.naturalHeight;
    const f=Math.max(ww/iw,wh/ih)*ph.zoomF, dw=iw*f, dh=ih*f;
    const icx=wx+ww/2+(ph.ox/100)*ww, icy=wy+wh/2+(ph.oy/100)*wh;
    ctx.filter=cssFilter(ph);
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

  const capRaw=(ph.caption||'').trim();
  if(capRaw&&g.cap>1){
    const cap = s.captionUpper ? capRaw.toUpperCase() : capRaw;
    ctx.fillStyle=s.captionColor;
    const fpx=s.captionSizePt*dpi/72;
    ctx.font=`${s.captionItalic?'italic ':''}${s.captionBold?'700 ':'400 '}${fpx}px ${s.captionFont}`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    try{ ctx.letterSpacing=((s.captionSpacing||0)*dpi/96)+'px'; }catch(_){}
    if(s.captionShadow){ ctx.shadowColor='rgba(0,0,0,0.30)'; ctx.shadowBlur=Math.max(1,px(0.25)); ctx.shadowOffsetY=Math.max(1,px(0.25)); }
    wrapText(ctx,cap,w/2,px(g.frame+g.winH)+px(g.cap)/2,w-px(6),fpx*1.16);
    ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    try{ ctx.letterSpacing='0px'; }catch(_){}
  }
  if(s.cardLine){
    ctx.strokeStyle=s.cardLineColor||'#c9c9c9'; ctx.lineWidth=Math.max(1,px(0.2));
    roundRect(ctx,0,0,w,h,px(s.radiusMm)); ctx.stroke();
  }
  if(s.tape && s.tape!=='none') drawDecor(ctx,px,g,s.tape,s.tapeColor);
  ctx.restore();

  if(s.cornerMarks){
    const o=px(s.markOffset),l=px(s.markLen),x=px(xMm),y=px(yMm);
    ctx.strokeStyle='#111'; ctx.lineWidth=Math.max(1,px(0.15));
    const seg=(a,b,c,d)=>{ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke();};
    seg(x-o-l,y,x-o,y); seg(x,y-o-l,x,y-o);
    seg(x+w+o,y,x+w+o+l,y); seg(x+w,y-o-l,x+w,y-o);
    seg(x-o-l,y+h,x-o,y+h); seg(x,y+h+o,x,y+h+o+l);
    seg(x+w+o,y+h,x+w+o+l,y+h); seg(x+w,y+h+o,x+w,y+h+o+l);
  }
}
// efeitos (fita / grampo) colados nos cantos da janela da foto, no espaço
// local já inclinado do polaroide. g = geometria em mm; px converte mm->px.
function drawDecor(ctx,px,g,mode,color){
  const [kind,where]=mode.split('-');
  const wx=px(g.frame),wy=px(g.frame),ww=px(g.winW),wh=px(g.winH);
  const spots = where==='top'
    ? [[wx+ww/2,wy,-2]]
    : where==='2'
      ? [[wx,wy,-45],[wx+ww,wy,45]]
      : [[wx,wy,-45],[wx+ww,wy,45],[wx,wy+wh,45],[wx+ww,wy+wh,-45]];
  spots.forEach(([cx,cy,deg])=>{
    ctx.save();
    ctx.translate(cx,cy); ctx.rotate(deg*Math.PI/180);
    if(kind==='tape') tapePiece(ctx,px,px(where==='top'?24:20),px(6),color);
    else staplePiece(ctx,px,px(7),px(3.4));
    ctx.restore();
  });
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

// PDF mínimo escrito na mão: 1 página por folha, cada uma com um JPEG
// (DCTDecode) ocupando o MediaBox inteiro. Sem biblioteca. imgs = [{bytes,w,h}]
// em pixels; wPt/hPt = tamanho da página em pontos (1pt = 1/72 pol).
function pdfFromImages(imgs,wPt,hPt){
  const enc=new TextEncoder(); const chunks=[]; let len=0;
  const out=d=>{ const u=(d instanceof Uint8Array)?d:enc.encode(d); chunks.push(u); len+=u.length; };
  const off=[]; const N=imgs.length; const total=2+3*N;
  out('%PDF-1.4\n'); out(new Uint8Array([37,226,227,207,211,10]));
  const obj=(n,f)=>{ off[n]=len; out(n+' 0 obj\n'); f(); out('\nendobj\n'); };
  obj(1,()=>out('<< /Type /Catalog /Pages 2 0 R >>'));
  const kids=[]; for(let i=0;i<N;i++) kids.push((3+i*3)+' 0 R');
  obj(2,()=>out(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>`));
  for(let i=0;i<N;i++){
    const pg=3+i*3, ct=4+i*3, im=5+i*3;
    const cs=`q\n${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm\n/Im0 Do\nQ`;
    obj(pg,()=>out(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] `+
      `/Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    obj(ct,()=>{ out(`<< /Length ${cs.length} >>\nstream\n`); out(cs); out('\nendstream'); });
    obj(im,()=>{ out(`<< /Type /XObject /Subtype /Image /Width ${imgs[i].w} /Height ${imgs[i].h} `+
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgs[i].bytes.length} >>\nstream\n`);
      out(imgs[i].bytes); out('\nendstream'); });
  }
  const xref=len;
  out(`xref\n0 ${total+1}\n0000000000 65535 f \n`);
  for(let n=1;n<=total;n++) out(String(off[n]).padStart(10,'0')+' 00000 n \n');
  out(`trailer\n<< /Size ${total+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const buf=new Uint8Array(len); let p=0; for(const c of chunks){ buf.set(c,p); p+=c.length; }
  return buf;
}
async function exportPDF(){
  if(!state.photos.length){ toast('Adicione fotos primeiro.'); return; }
  const dpi=exportDPI();
  busy('Gerando PDF em '+dpi+' dpi…');
  try{
    await ensureFonts(); await ensureFullImages();
    const L=layout(), imgs=[];
    for(let p=0;p<L.pages;p++){
      const cv=await drawPage(p,dpi);
      const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.92));
      imgs.push({bytes:new Uint8Array(await blob.arrayBuffer()),w:cv.width,h:cv.height});
    }
    const pdf=pdfFromImages(imgs,L.PW/25.4*72,L.PH/25.4*72);
    downloadBlob(new Blob([pdf],{type:'application/pdf'}),'polaroides.pdf');
    toast('PDF gerado: '+L.pages+' folha(s).');
  }catch(e){ console.error(e); toast('Erro ao gerar PDF.'); }
  unbusy();
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
async function importProject(file){
  if(file.size>250*1024*1024){ alert('Arquivo de projeto grande demais.'); return; }
  busy('Abrindo projeto…');
  try{
    const d=JSON.parse(await file.text());
    if(!d||typeof d!=='object'||Array.isArray(d)) throw new Error('estrutura');
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
    selectedId=null; past.length=0; future.length=0;
    syncControls(); save(); render(); fit();
    toast(bad? `Projeto carregado — ${bad} imagem(ns) não puderam ser lidas.` : 'Projeto carregado.');
  }catch(e){ console.error(e); alert('Arquivo de projeto inválido.'); }
  unbusy();
}
