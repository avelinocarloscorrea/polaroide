/* Polaroide Studio — js/m-sheet.js
   Amarra as folhas de baixo do celular (#medit e #menu) ao resto: fechar ao
   tocar num item, fechar ao selecionar/desmarcar foto. O gesto de arrastar e
   as funções mEdit/mMenu/mScrim ficam em m-core.js. */
"use strict";

function mBindSheet(){
  if(!$('#mroot')) return;

  // qualquer item do menu ⋯ fecha a folha no celular
  const menu=$('#menu');
  if(menu) menu.addEventListener('click',e=>{
    if(!mMob()) return;
    if(e.target.closest('button, a')) mMenu(false);
  });

  // "Novo projeto" e afins já disparam render/select; garante a folha fechada
  ['m_new','m_open','m_save'].forEach(id=>{
    const b=$('#'+id);
    if(b) b.addEventListener('click',()=>{ if(mMob()){ mEdit(false); mMenu(false); } });
  });
}
