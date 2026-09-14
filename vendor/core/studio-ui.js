/* packages/core/studio-ui.js — EPStudio
 *
 * Peças pequenas de interface usadas do mesmo jeito nas três ferramentas:
 *
 *   EPStudio.pop({ id, title, build(host), onClose })
 *     painel flutuante não-modal (computador: ao lado da prancheta; celular:
 *     folha inferior) — a página continua visível e muda ao vivo. Usado pelos
 *     painéis de Fundo e Marca d'água abertos a partir da folha.
 *   EPStudio.gate(push)
 *     histórico de alterações "ao vivo": chama push() uma vez no começo de cada
 *     gesto (arrastar um controle) e uma vez em cada clique.
 *       const g = EPStudio.gate(pushHistory); g(live) // antes de aplicar
 */
(function (root) {
  "use strict";
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  let cur = null;

  function close() {
    if (!cur) return;
    const c = cur; cur = null;
    c.el.remove();
    document.body.classList.remove('ep-pop-open');
    if (c.onClose) c.onClose();
  }
  function pop(o) {
    if (cur && cur.id === o.id) { close(); return null; }
    close();
    const el = document.createElement('div');
    el.className = 'ep-pop';
    el.innerHTML = `<div class="ep-pop__head"><b>${esc(o.title || '')}</b><button type="button" class="ep-pop__x" aria-label="Fechar" title="Fechar (Esc)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="ep-pop__body"></div>`;
    document.body.appendChild(el);
    document.body.classList.add('ep-pop-open');
    cur = { id: o.id, el, onClose: o.onClose };
    el.querySelector('.ep-pop__x').onclick = close;
    o.build(el.querySelector('.ep-pop__body'));
    return { el, close };
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && cur && !document.querySelector('dialog[open]')) { e.stopPropagation(); close(); } }, true);

  function gate(push) {
    let live = false;
    return isLive => {
      if (isLive) { if (!live) { push(); live = true; } }
      else { if (!live) push(); live = false; }
    };
  }

  // <svg> (com fontes do núcleo embutidas) -> JPEG pequeno, para miniaturas de projetos
  async function svgToDataURL(svg, maxW = 360) {
    if (!svg) return '';
    const css = root.embeddedFontStyle ? await root.embeddedFontStyle(svg) : '';
    const full = css ? svg.replace(/(<svg[^>]*>)/, '$1' + css) : svg;
    const url = URL.createObjectURL(new Blob([full], { type: 'image/svg+xml' }));
    try {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg), ar = vb ? +vb[2] / +vb[1] : 1.41;
      const c = document.createElement('canvas'); c.width = maxW; c.height = Math.round(maxW * ar);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8);
    } finally { URL.revokeObjectURL(url); }
  }

  // escolher imagem do aparelho -> dataURL redesenhado (sem EXIF/GPS), no máx. `max` px.
  // PNG/GIF/WebP continuam PNG (transparência de logos e adesivos); fotos viram JPEG.
  function pickImage(cb, o = {}) {
    const max = o.max || 1600;
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/gif';
    inp.onchange = () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 30 * 1024 * 1024 || !/^image\/(png|jpe?g|webp|gif)$/i.test(f.type || '')) { o.onError && o.onError('Use uma imagem JPG, PNG, WebP ou GIF de até 30 MB.'); return; }
      const url = URL.createObjectURL(f), im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const w0 = im.naturalWidth, h0 = im.naturalHeight; if (!w0 || !h0) return;
        const k = Math.min(1, max / Math.max(w0, h0)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        let out = /png|gif|webp/i.test(f.type) ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
        if (out.length > 3.5e6) out = c.toDataURL('image/jpeg', 0.8);
        cb(out);
      };
      im.onerror = () => { URL.revokeObjectURL(url); o.onError && o.onError('Não foi possível ler a imagem.'); };
      im.src = url;
    };
    inp.click();
  }

  root.EPStudio = { pop, closePop: close, gate, esc, svgToDataURL, pickImage };
})(typeof window !== 'undefined' ? window : globalThis);
