/* Polaroide Studio — js/m-sheet.js
   Barra da foto selecionada (#mselbar) e amarras das folhas de baixo
   (#medit / #menu). As funções mEdit/mMenu/mScrim/mScrollSel ficam em
   m-core.js. */
"use strict";

/* Mostra/atualiza a barra da foto marcada. Chamada por select() no celular.
   Passar null esconde a barra. NÃO abre a folha de edição — isso agora é só
   pelo botão "Ajustar". */
function mSelBar(ph){
  const bar=$('#mselbar'), root=$('#mroot');
  if(!bar||!root) return;
  const on=!!ph && mMob();
  bar.hidden=!on;
  root.classList.toggle('sel',on);
  if(on){
    const cap=$('#msb_cap');
    if(cap && cap!==document.activeElement) cap.value=ph.caption||'';
  }
}

function mBindSheet(){
  if(!$('#mroot')) return;

  /* ---- barra da foto selecionada ---- */
  const close=$('#msb_close');
  if(close) close.onclick=()=>{ if(typeof select==='function') select(null); };
  const edit=$('#msb_edit');
  if(edit) edit.onclick=()=>{ if(typeof mEdit==='function') mEdit(true); };
  const cap=$('#msb_cap');
  if(cap) cap.addEventListener('input',()=>{
    const ph=(typeof cur==='function')?cur():null; if(!ph) return;
    ph.caption=sanitizeText(cap.value,500);
    const t=sheetsEl.querySelector(`.pol[data-id="${ph.id}"] .capfield`);
    if(t){ t.value=ph.caption; t.dispatchEvent(new Event('input')); }
    else save();
    const s2=$('#s_caption'); if(s2 && s2!==document.activeElement) s2.value=ph.caption;
  });

  /* ---- menu ⋯ ---- */
  const menu=$('#menu');
  if(menu) menu.addEventListener('click',e=>{
    if(!mMob()) return;
    if(e.target.closest('button, a')) mMenu(false);
  });

  // "Novo projeto" e afins já disparam render/select; garante as folhas fechadas
  ['m_new','m_open','m_save'].forEach(id=>{
    const b=$('#'+id);
    if(b) b.addEventListener('click',()=>{ if(mMob()){ mEdit(false); mMenu(false); } });
  });
}
