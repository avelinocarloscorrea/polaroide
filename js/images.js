/* Polaroide Studio — js/images.js
   pipeline de imagem: decodifica, redesenha, limpa metadados
   (parte de app; carregado em ordem por index.html) */
"use strict";


/* ================= importação de imagem ================= */
function dataURLtoBlob(u){
  const c=u.indexOf(','), meta=u.slice(0,c), body=u.slice(c+1);
  const mime=(meta.match(/data:([^;]+)/)||[])[1]||'application/octet-stream';
  if(/;base64/i.test(meta)){
    const bin=atob(body), arr=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    return new Blob([arr],{type:mime});
  }
  return new Blob([decodeURIComponent(body)],{type:mime});
}
async function decode(src){
  try{
    const blob=src instanceof Blob?src:dataURLtoBlob(src);
    return await createImageBitmap(blob,{imageOrientation:'from-image'});
  }catch(e){
    const url=src instanceof Blob?URL.createObjectURL(src):src;
    return await loadImg(url);
  }
}
function toBlob(srcImg,max,q){
  let w=srcImg.width||srcImg.naturalWidth, h=srcImg.height||srcImg.naturalHeight;
  const k=Math.min(1,max/Math.max(w,h)); w=Math.round(w*k); h=Math.round(h*k);
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,w,h);
  ctx.drawImage(srcImg,0,0,w,h);
  return new Promise(r=>c.toBlob(r,'image/jpeg',q));
}
// Toda imagem que entra no app passa por aqui: valida tipo/tamanho/dimensão,
// decodifica e REDESENHA num canvas. O que sai são dois JPEGs limpos (full +
// preview) — sem EXIF/GPS, sem perfil de cor, sem nada além de pixels. Serve
// tanto para arquivos escolhidos pelo usuário quanto para imagens vindas de um
// projeto .json (que também não são confiáveis).
async function bakeImage(src){
  if(src instanceof Blob){
    if(src.size>MAX_BYTES) throw new Error('Arquivo muito grande (máx. 45 MB).');
    if(src.type && !SAFE_IMG.test(src.type)) throw new Error('Tipo não suportado: '+src.type);
  }
  const bmp=await decode(src);
  const w=bmp.width||bmp.naturalWidth, h=bmp.height||bmp.naturalHeight;
  if(!w||!h) throw new Error('Imagem inválida.');
  if(w>MAX_SIDE||h>MAX_SIDE||w*h>MAX_AREA) throw new Error('Imagem com dimensões excessivas.');
  const [full,preview]=await Promise.all([toBlob(bmp,3000,0.92),toBlob(bmp,1400,0.82)]);
  if(bmp.close) bmp.close();
  return {full,preview,natW:w,natH:h};
}
async function processFile(file){
  const {full,preview,natW,natH}=await bakeImage(file);
  const id=uid();
  const rec={full,preview,natW,natH,name:safeName(file.name)};
  if(idbOK){ try{ await DB.set(id,rec); }catch(e){ idbFail(e); } }
  hydrate(id,rec);
  return {id,caption:'',zoomF:1,ox:0,oy:0,rot:0,flipH:false,seed:Math.random(),natW,natH,filter:{...FILTER0}};
}
function acceptable(f){
  const t=f.type||'';
  return SAFE_IMG.test(t) || (t==='' && /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name||''));
}
async function addFiles(list){
  const all=[...list];
  const files=all.filter(acceptable);
  const rejected=all.length-files.length;
  if(!files.length){
    if(all.length) toast('Formato não suportado. Use JPG, PNG, WebP, GIF, BMP ou AVIF.');
    return;
  }
  pushHistory('add');
  busy(`Carregando ${files.length} foto(s)…`);
  for(const f of files){
    try{ state.photos.push(await processFile(f)); }
    catch(e){ console.error(e); toast('Falha ao ler '+(f.name||'imagem')+(e.message?': '+e.message:'')); }
  }
  unbusy();
  if(rejected) toast(rejected+' arquivo(s) ignorado(s) — não é imagem válida.');
  save(); render();
}
async function rebuildDerived(ph, transform){
  const m=media[ph.id]; if(!m) return;
  const img=await loadImg(m.fullURL);
  const {cw,ch,draw}=transform(img);
  const c=document.createElement('canvas'); c.width=cw; c.height=ch;
  draw(c.getContext('2d'));
  const full=await new Promise(r=>c.toBlob(r,'image/jpeg',0.92));
  const c2=document.createElement('canvas');
  const k=Math.min(1,1400/Math.max(cw,ch)); c2.width=Math.round(cw*k); c2.height=Math.round(ch*k);
  c2.getContext('2d').drawImage(c,0,0,c2.width,c2.height);
  const preview=await new Promise(r=>c2.toBlob(r,'image/jpeg',0.82));
  URL.revokeObjectURL(m.fullURL); URL.revokeObjectURL(m.previewURL);
  const rec={full,preview,natW:cw,natH:ch,name:m.name};
  if(idbOK){ try{ await DB.set(ph.id,rec); }catch(e){ idbFail(e); } }
  hydrate(ph.id,rec);
  ph.natW=cw; ph.natH=ch;
}
async function rotate90(ph){
  pushHistory('rot90'); busy('Girando…');
  try{
    await rebuildDerived(ph,img=>({cw:img.naturalHeight,ch:img.naturalWidth,
      draw:ctx=>{ctx.translate(img.naturalHeight/2,img.naturalWidth/2);ctx.rotate(Math.PI/2);
        ctx.drawImage(img,-img.naturalWidth/2,-img.naturalHeight/2);}}));
  }catch(e){ console.error(e); toast('Não foi possível girar a foto.'); }
  unbusy(); save(); render();
}
