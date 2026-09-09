/* Polaroide Studio — js/m-install.js
   Instalar na tela de início (PWA). Sem service worker: só captura o
   beforeinstallprompt e mostra o item no menu ⋯. iOS não dispara o evento,
   então cai num aviso com o passo a passo. */
"use strict";

let _deferredInstall=null;
addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); _deferredInstall=e; const b=$('#m_install'); if(b) b.hidden=false; });
addEventListener('appinstalled',()=>{ _deferredInstall=null; const b=$('#m_install'); if(b) b.hidden=true; try{toast('App instalado.');}catch(_){} });
function _isStandalone(){ return matchMedia('(display-mode: standalone)').matches || navigator.standalone===true; }
function _isIOS(){ return /iP(hone|ad|od)/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent); }
function initInstall(){
  const b=$('#m_install'); if(!b) return;
  b.onclick=async()=>{
    $('#menu').hidden=true; try{syncScrim();}catch(_){} try{ if(typeof mMenu==='function') mMenu(false); }catch(_){}
    if(_deferredInstall){
      _deferredInstall.prompt();
      try{ await _deferredInstall.userChoice; }catch(_){}
      _deferredInstall=null; b.hidden=true; return;
    }
    if(_isIOS()) alert('Para instalar no iPhone/iPad:\n\n1. Toque em Compartilhar (o quadrado com a seta pra cima).\n2. Escolha “Adicionar à Tela de Início”.');
  };
  if(_isIOS() && !_isStandalone()) b.hidden=false;   // iOS não dispara beforeinstallprompt
}
