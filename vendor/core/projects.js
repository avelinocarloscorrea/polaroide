/* packages/core/projects.js — EPProjects
 *
 * "Meus projetos": projetos guardados SÓ neste computador (IndexedDB do
 * navegador), quando a pessoa quiser — nada sai do aparelho. Igual nas três
 * ferramentas. Cada projeto tem nome, miniatura, data e o conteúdo completo
 * (fotos incluídas), e pode ser aberto, renomeado, duplicado, baixado como
 * .json ou apagado.
 *
 *   EPProjects.init({
 *     app: 'planner', label: 'Planner Studio',
 *     serialize: async () => dados   (string ou objeto clonável — Blobs valem),
 *     restore:   async dados => {},
 *     thumb:     async () => dataURL (jpeg pequeno),
 *     docName:   () => 'nome sugerido',
 *     download:  (dados, nome) => {}  // opcional: baixar .json
 *     hasContent: () => bool           // opcional: pede confirmação antes de trocar de projeto
 *     toast:     msg => {}
 *   })
 *   EPProjects.save()        salva (atualiza o projeto aberto ou pergunta o nome)
 *   EPProjects.saveAs()      sempre um projeto novo
 *   EPProjects.changed()     chamar a cada alteração salva — com "salvar automaticamente" ligado,
 *                            atualiza o projeto aberto alguns segundos depois
 *   EPProjects.dialog()      janela com a lista
 *   EPProjects.strip(host)   faixa "Seus projetos" para a tela inicial
 *   EPProjects.detach()      desliga o documento atual do projeto salvo (ex.: "novo projeto")
 */
(function (root) {
  "use strict";
  const DB_NAME = 'ep-projects', STORE = 'projects';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} },
  };
  let O = null, dbp = null, dirtyT = 0, busy = false, stripHosts = [];

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!root.indexedDB) { rej(new Error('sem IndexedDB')); return; }
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { const st = r.result.createObjectStore(STORE, { keyPath: 'id' }); st.createIndex('app', 'app'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function tx(mode, fn) { const d = await db(); const t = d.transaction(STORE, mode); const out = await fn(t.objectStore(STORE)); return out; }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const curKey = () => 'ep-projects-cur:' + O.app, autoKey = () => 'ep-projects-auto:' + O.app;

  function sizeOf(data) {
    if (typeof data === 'string') return data.length;
    let n = 0;
    const walk = v => {
      if (v == null) return;
      if (typeof Blob !== 'undefined' && v instanceof Blob) n += v.size;
      else if (typeof v === 'string') n += v.length;
      else if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'object') Object.values(v).forEach(walk);
      else n += 8;
    };
    walk(data);
    return n;
  }
  const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  function fmtWhen(t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 86400) return `há ${Math.round(s / 3600)} h`;
    const d = new Date(t);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  async function list() {
    try {
      const all = await tx('readonly', st => req(st.index('app').getAll(O.app)));
      return all.map(p => ({ id: p.id, name: p.name, updated: p.updated, created: p.created, thumb: p.thumb, size: p.size }))
        .sort((a, b) => b.updated - a.updated);
    } catch (e) { return []; }
  }
  const linked = () => ls.get(curKey());
  const autoOn = () => ls.get(autoKey()) !== '0';

  async function write(id, name, isNew) {
    if (busy) return null;
    busy = true;
    try {
      const [data, thumb] = await Promise.all([O.serialize(), O.thumb ? O.thumb().catch(() => '') : '']);
      const now = Date.now();
      let created = now;
      if (!isNew) { try { const old = await tx('readonly', st => req(st.get(id))); if (old) { created = old.created; if (!name) name = old.name; } } catch (_) {} }
      const rec = { id, app: O.app, name: name || 'Projeto sem nome', created, updated: now, thumb: thumb || '', size: sizeOf(data), data };
      await tx('readwrite', st => req(st.put(rec)));
      ls.set(curKey(), id);
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      refreshStrips();
      return rec;
    } catch (e) {
      console.error(e);
      O.toast && O.toast(/quota/i.test(String(e && (e.name || e.message))) ? 'Sem espaço no navegador para guardar este projeto.' : 'Não foi possível guardar o projeto neste computador.');
      return null;
    } finally { busy = false; }
  }

  function askName(title, value) {
    return new Promise(res => {
      const d = document.createElement('dialog');
      d.className = 'epp-ask';
      d.innerHTML = `<form method="dialog"><b>${esc(title)}</b><input type="text" maxlength="80" value="${esc(value)}" required autocomplete="off">` +
        `<p class="hint">Fica guardado só neste navegador, neste computador.</p><div class="epp-ask__row"><button type="button" value="" data-x>Cancelar</button><button class="primary" value="ok">Salvar</button></div></form>`;
      document.body.appendChild(d);
      const inp = d.querySelector('input');
      d.querySelector('[data-x]').onclick = () => d.close('');
      d.addEventListener('close', () => { const v = d.returnValue === 'ok' ? inp.value.trim() : null; d.remove(); res(v); });
      d.showModal(); inp.select();
    });
  }

  async function saveAs() {
    const name = await askName('Salvar em Meus projetos', (O.docName && O.docName()) || 'Meu projeto');
    if (!name) return null;
    const rec = await write(uid(), name, true);
    if (rec) O.toast && O.toast(`“${rec.name}” guardado neste computador.`);
    return rec;
  }
  async function save() {
    const id = linked();
    if (id) {
      const exists = await tx('readonly', st => req(st.getKey(id))).catch(() => null);
      if (exists) { const rec = await write(id, null, false); if (rec) O.toast && O.toast(`“${rec.name}” atualizado.`); return rec; }
    }
    return saveAs();
  }
  function changed() {
    if (!O || !autoOn() || !linked()) return;
    clearTimeout(dirtyT);
    dirtyT = setTimeout(async () => {
      const id = linked(); if (!id) return;
      const exists = await tx('readonly', st => req(st.getKey(id))).catch(() => null);
      if (exists) write(id, null, false); else ls.set(curKey(), null);
    }, 4000);
  }
  function detach() { clearTimeout(dirtyT); ls.set(curKey(), null); }

  async function open(id) {
    const rec = await tx('readonly', st => req(st.get(id))).catch(() => null);
    if (!rec) { O.toast && O.toast('Projeto não encontrado.'); return false; }
    // documento atual com conteúdo e não guardado em Meus projetos: confirma antes de trocar
    if (O.hasContent && O.hasContent() && linked() !== id) {
      const cur = linked(), known = cur && await tx('readonly', st => req(st.getKey(cur))).catch(() => null);
      if (!(known && autoOn()) && !confirm('Abrir “' + rec.name + '” substitui o que está aberto agora. ' + (known ? 'As últimas alterações que não foram salvas se perdem. ' : 'O trabalho atual não está em Meus projetos. ') + 'Continuar?')) return false;
      if (known && autoOn()) { clearTimeout(dirtyT); await write(cur, null, false); }
    }
    clearTimeout(dirtyT);
    ls.set(curKey(), null);            // o app salva ao restaurar: não pode cair no projeto anterior
    try { await O.restore(rec.data); } finally { clearTimeout(dirtyT); }
    ls.set(curKey(), id);
    O.toast && O.toast(`“${rec.name}” aberto.`);
    return true;
  }
  async function remove(id) {
    await tx('readwrite', st => req(st.delete(id))).catch(() => {});
    if (linked() === id) ls.set(curKey(), null);
    refreshStrips();
  }
  async function rename(id, name) {
    const rec = await tx('readonly', st => req(st.get(id))).catch(() => null); if (!rec) return;
    rec.name = name; await tx('readwrite', st => req(st.put(rec)));
    refreshStrips();
  }
  async function duplicate(id) {
    const rec = await tx('readonly', st => req(st.get(id))).catch(() => null); if (!rec) return;
    const copy = { ...rec, id: uid(), name: rec.name + ' (cópia)', created: Date.now(), updated: Date.now() };
    await tx('readwrite', st => req(st.put(copy)));
    refreshStrips();
  }
  async function download(id) {
    const rec = await tx('readonly', st => req(st.get(id))).catch(() => null); if (!rec || !O.download) return;
    O.download(rec.data, rec.name);
  }

  /* ---------------- janela ---------------- */
  const ICON = {
    open: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    more: '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', save: '<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><path d="M17 21v-8H7v8M7 3v5h7"/>',
    empty: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  };
  const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  function cardsHTML(items, cur) {
    return items.map(p => `<div class="epp-card${p.id === cur ? ' is-cur' : ''}" data-id="${esc(p.id)}">
      <button type="button" class="epp-card__thumb" data-act="open" title="Abrir">${p.thumb ? `<img alt="" data-src="${esc(p.thumb)}">` : ic('empty')}</button>
      <div class="epp-card__body"><b title="${esc(p.name)}">${esc(p.name)}</b><span>${p.id === cur ? 'aberto agora · ' : ''}${fmtWhen(p.updated)} · ${fmtSize(p.size || 0)}</span></div>
      <button type="button" class="epp-card__more" data-act="menu" title="Mais" aria-label="Mais ações">${ic('more')}</button></div>`).join('');
  }
  function hydrateImgs(host) { host.querySelectorAll('img[data-src]').forEach(im => { im.src = im.dataset.src; im.removeAttribute('data-src'); }); }

  function menuFor(btn, id, after) {
    document.querySelectorAll('.epp-menu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'epp-menu';
    m.innerHTML = `<button type="button" data-m="open">Abrir</button><button type="button" data-m="rename">Renomear</button><button type="button" data-m="dup">Duplicar</button>` +
      (O.download ? `<button type="button" data-m="dl">Baixar arquivo (.json)</button>` : '') + `<button type="button" data-m="del" class="danger">Apagar</button>`;
    (btn.closest('dialog') || document.body).appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(innerWidth - 200, r.right - 190)) + 'px';
    m.style.top = Math.min(innerHeight - 220, r.bottom + 4) + 'px';
    const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
    m.addEventListener('click', async e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      m.remove(); document.removeEventListener('pointerdown', off, true);
      const act = b.dataset.m;
      if (act === 'open') { if (await open(id)) after && after('open'); }
      else if (act === 'rename') { const all = await list(); const p = all.find(x => x.id === id); const nm = await askName('Renomear projeto', p ? p.name : ''); if (nm) { await rename(id, nm); after && after(); } }
      else if (act === 'dup') { await duplicate(id); after && after(); }
      else if (act === 'dl') download(id);
      else if (act === 'del') { if (confirm('Apagar este projeto deste computador? Não dá para desfazer.')) { await remove(id); after && after(); } }
    });
  }

  async function dialog() {
    let d = document.getElementById('eppDlg');
    if (!d) {
      d = document.createElement('dialog');
      d.id = 'eppDlg'; d.className = 'epp-dlg';
      document.body.appendChild(d);
      d.addEventListener('click', async e => {
        if (e.target === d) { d.close(); return; }
        const b = e.target.closest('[data-act]'); if (!b) return;
        const card = b.closest('.epp-card'), id = card && card.dataset.id;
        if (b.dataset.act === 'close') d.close();
        else if (b.dataset.act === 'save') { await save(); fill(); }
        else if (b.dataset.act === 'saveas') { await saveAs(); fill(); }
        else if (b.dataset.act === 'open' && id) { if (await open(id)) d.close(); }
        else if (b.dataset.act === 'menu' && id) menuFor(b, id, a => { if (a === 'open') d.close(); else fill(); });
      });
      d.addEventListener('change', e => { if (e.target.dataset.auto != null) { ls.set(autoKey(), e.target.checked ? '1' : '0'); } });
    }
    async function fill() {
      const items = await list(), cur = linked();
      let est = '';
      try { if (navigator.storage && navigator.storage.estimate) { const q = await navigator.storage.estimate(); if (q && q.quota) est = `${fmtSize(q.usage || 0)} usados de ${fmtSize(q.quota)} disponíveis neste navegador`; } } catch (_) {}
      const curItem = items.find(x => x.id === cur);
      d.innerHTML = `<div class="dhead"><div><span>Meus projetos</span><span class="sub">${esc(O.label || '')} · guardados só neste computador</span></div><button type="button" class="iconbtn ghost" data-act="close" title="Fechar">${ic('x')}</button></div>
        <div class="epp-top">
          <button type="button" class="primary" data-act="save">${ic('save')} ${curItem ? 'Salvar alterações em “' + esc(curItem.name) + '”' : 'Salvar este projeto'}</button>
          ${curItem ? '<button type="button" data-act="saveas">Salvar como novo…</button>' : ''}
          <label class="row epp-auto"><input type="checkbox" data-auto${autoOn() ? ' checked' : ''}> Atualizar sozinho o projeto aberto enquanto edito</label>
        </div>
        <div class="epp-grid">${items.length ? cardsHTML(items, cur) : `<div class="epp-empty">${ic('empty')}<p><b>Nenhum projeto guardado ainda.</b><br>Clique em “Salvar este projeto” para guardar uma cópia neste computador — com fotos e tudo. Nada é enviado para a internet.</p></div>`}</div>
        <p class="epp-foot">Limpar os dados do navegador apaga estes projetos. Para levar a outro aparelho ou guardar um backup, use “Baixar arquivo”.${est ? ' · ' + esc(est) : ''}</p>`;
      hydrateImgs(d);
    }
    await fill();
    if (!d.open) d.showModal();
  }

  /* ---------------- faixa da tela inicial ---------------- */
  async function renderStrip(host) {
    const items = (await list()).slice(0, host._limit || 8), cur = linked();
    host.hidden = !items.length;
    if (!items.length) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="epp-strip__head"><b>Seus projetos neste computador</b><button type="button" class="ep-linkbtn" data-act="all">Ver todos</button></div><div class="epp-strip__row">${cardsHTML(items, cur)}</div>`;
    hydrateImgs(host);
  }
  function strip(host, o = {}) {
    if (!host || host._epp) return;
    host._epp = true; host._limit = o.limit || 8; host.classList.add('epp-strip');
    stripHosts.push(host);
    host.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const card = b.closest('.epp-card'), id = card && card.dataset.id;
      if (b.dataset.act === 'all') dialog();
      else if (b.dataset.act === 'open' && id) { if (await open(id)) o.onOpen && o.onOpen(); }
      else if (b.dataset.act === 'menu' && id) menuFor(b, id, a => { if (a === 'open') o.onOpen && o.onOpen(); else renderStrip(host); });
    });
    renderStrip(host);
  }
  function refreshStrips() { stripHosts.forEach(h => { if (h.isConnected) renderStrip(h); }); }

  function init(o) { O = o; }

  root.EPProjects = { init, save, saveAs, changed, detach, dialog, strip, list, open, remove, linked, refreshStrips };
})(typeof window !== 'undefined' ? window : globalThis);
