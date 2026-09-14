/* Polaroide Studio — js/shell-ui.js
   Casca de interface: trilho de abas, etapas da barra (Modelo → Fotos →
   Imprimir), faixa de fotos no painel, galeria de modelos com miniaturas
   desenhadas pelo MESMO renderizador do PDF (com fotos de exemplo geradas
   no canvas) e o diálogo "Imprimir e baixar" com a prévia real de cada
   folha e a verificação antes de imprimir.
   Carregado por último; só liga peças novas nos ids/funções existentes. */
"use strict";

const SH_ICON = {
  wand: '<path d="M4 20l10-10"/><path d="M15 3v3M13.5 4.5h3M19 8v2M18 9h2M9 3v2M8 4h2"/>',
  marks: '<rect x="7" y="6" width="10" height="12" rx="1"/><path d="M3 6h2M6 3v2M19 6h2M18 3v2M3 18h2M6 19v2M19 18h2M18 19v2"/>',
  line: '<rect x="5" y="4" width="14" height="16" rx="2" stroke-dasharray="2.5 2"/>',
  none: '<rect x="5" y="4" width="14" height="16" rx="2"/>',
  both: '<rect x="7" y="6" width="10" height="12" rx="1" stroke-dasharray="2.5 2"/><path d="M3 6h2M6 3v2M19 6h2M18 3v2M3 18h2M6 19v2M19 18h2M18 19v2"/>',
};
const shIcon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SH_ICON[n]}</svg>`;
const PAPER_NAME = { a4: 'A4', letter: 'Carta', a3: 'A3', a5: 'A5' };

/* ================= trilho ================= */
EPShell.initRail({
  rail: $('#rail'), panes: $('#panes'), storageKey: 'polaroide-pane', initial: 'fotos',
  isCollapsed: () => !uiState.left,
  onCollapse: hide => togglePanel('left', !hide),
});
$('#e_add2').onclick = () => $('#file_add').click();
// "Escolher fotos" direto na tela inicial, sem modelo escolhido: usa o clássico
$('#e_add').onclick = () => {
  if (!state.photos.length && !_tplChosen && typeof TEMPLATES !== 'undefined' && TEMPLATES.some(t => t.id === 'classico')) { applyTemplate('classico'); _tplChosen = true; }
  $('#file_add').click();
};
if (typeof finishWizard === 'function') { const _fw = finishWizard; finishWizard = function () { _tplChosen = true; _fw(); }; }

/* ================= etapas ================= */
function setStep(k) {
  ['st_model', 'st_edit', 'st_print'].forEach((id, i) => {
    const b = $('#' + id); if (!b) return;
    b.classList.toggle('on', i === k); b.classList.toggle('done', i < k);
  });
}
$('#st_model').onclick = () => openStart();
$('#st_edit').onclick = () => { const d = $('#exportDlg'); if (d.open) d.close(); closeStart(); };
$('#st_print').onclick = () => openExportDlg();

/* ================= fotos de exemplo (miniaturas dos modelos) ================= */
const SAMPLE_SKIES = [
  ['#f6d8b6', '#e9a07a', '#6f8f7e', '#44604f'], ['#cfe3ee', '#9ec3d6', '#7c9a86', '#4d6a58'],
  ['#fbe3c4', '#f2b38d', '#a7876b', '#6e5745'], ['#dfe9dc', '#b6cfae', '#6d8d68', '#3f5a3f'],
  ['#e8dff0', '#c4b3d8', '#8a7a96', '#564a63'], ['#fdf0d8', '#f5c98e', '#c48a5a', '#7d573a'],
];
const SAMPLE_CAPS = ['verão', 'nós dois', 'praia', 'domingo', 'aniversário', 'viagem', 'família', 'café', 'pôr do sol'];
let _samples = null;
function samplePhotos() {
  if (_samples) return _samples;
  _samples = SAMPLE_SKIES.map((c, i) => {
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 360;
    const g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 360); sky.addColorStop(0, c[0]); sky.addColorStop(1, c[1]);
    g.fillStyle = sky; g.fillRect(0, 0, 360, 360);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(90 + i * 34, 100, 30, 0, Math.PI * 2); g.fill();
    const hill = (y, amp, col, ph) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 360);
      for (let x = 0; x <= 360; x += 10) g.lineTo(x, y + Math.sin(x / 55 + ph) * amp + Math.sin(x / 19 + ph * 2) * amp * 0.25);
      g.lineTo(360, 360); g.closePath(); g.fill();
    };
    hill(220, 20, c[2], i); hill(270, 14, c[3], i + 2);
    cv.naturalWidth = cv.width; cv.naturalHeight = cv.height;   // drawPol lê naturalWidth
    return cv;
  });
  return _samples;
}
// desenha a 1ª folha de um conjunto de ajustes com fotos de exemplo, usando o
// renderizador do PDF (drawPage). O corpo de drawPage é síncrono, então o
// estado real volta no `finally` antes de qualquer outra coisa rodar.
function sampleSheetURL(settings, dpi) {
  const saved = state, ids = [];
  try {
    state = { settings: migrateSettings({ ...DEFAULTS, ...settings }), photos: [] };
    const n = Math.min(layout().perPage, 30), ph = samplePhotos();
    for (let i = 0; i < n; i++) {
      const id = '__smp' + i;
      const p = { id, caption: state.settings.captionMm > 0 ? SAMPLE_CAPS[i % SAMPLE_CAPS.length] : '', seed: ((i * 7919) % 97) / 97, natW: 360, natH: 360 };
      normPhoto(p);
      if (state.settings.filterPreset && PRESETS[state.settings.filterPreset]) p.filter = { ...PRESETS[state.settings.filterPreset], preset: state.settings.filterPreset };
      state.photos.push(p);
      media[id] = { fullImg: ph[i % ph.length], natW: 360, natH: 360 };
      ids.push(id);
    }
    const pr = drawPage(0, dpi || 26);
    return pr.then(cv => cv.toDataURL('image/jpeg', 0.86));
  } finally {
    state = saved;
    ids.forEach(id => delete media[id]);
  }
}
let _thumbSeq = 0;
function asyncThumb(settings) {
  const id = 'pt' + (++_thumbSeq);
  setTimeout(() => {
    sampleSheetURL(settings).then(url => { const im = document.getElementById(id); if (im) { im.src = url; im.hidden = false; } }).catch(e => console.error(e));
  }, 0);
  return `<img class="pt-img" id="${id}" alt="" hidden>`;
}

/* ================= galeria ================= */
const TPL_CATS = [{ id: 'polaroide', label: 'Polaroide' }, { id: 'foto', label: 'Fotos e cartelas' }];
const TPL_CAT = { classico: 'polaroide', memories: 'polaroide', scrapbook: 'polaroide', minimal: 'polaroide', instax: 'foto', contato: 'foto', retrato: 'foto' };
let _pendingTpl = null, _tplChosen = false, _prevCount = -1;
function galleryItems(forPanel) {
  const items = [];
  if (!forPanel) items.push({ id: '_wiz', name: 'Montar passo a passo', desc: 'Formato, grade da folha e efeito em 3 escolhas.', variant: 'wizard', always: true, thumb: () => `<span class="tt-ic"><span>${shIcon('wand')}</span></span>` });
  TEMPLATES.forEach(t => {
    const tmp = migrateSettings({ ...DEFAULTS, ...t.settings });
    items.push({
      id: t.id, name: t.name, desc: t.desc, cat: TPL_CAT[t.id] || 'polaroide', tpl: t,
      meta: `${PAPER_NAME[tmp.pageSize] || 'A4'} · ${tmp.columns}×${tmp.rows} por folha`,
      thumb: () => asyncThumb(t.settings),
    });
  });
  return items;
}
function pickTemplate(it) {
  if (it.id === '_wiz') { if (typeof showWizardPane === 'function') showWizardPane(); $('#empty').scrollTop = 0; return; }
  applyTemplate(it.id); _tplChosen = true;
  $$('.ep-tpl').forEach(b => b.classList.remove('on'));
  $$(`.ep-tpl`).filter(b => b.querySelector('.ep-tpl__name') && b.querySelector('.ep-tpl__name').textContent === it.name).forEach(b => b.classList.add('on'));
  if (!state.photos.length) {
    _pendingTpl = it.tpl;
    $('#ob_dropTitle').textContent = `Modelo "${it.name}" escolhido. Agora, as fotos:`;
    $('#ob_dropSub').textContent = 'Escolha várias de uma vez — elas se encaixam sozinhas nas folhas. Também dá para arrastar para cá.';
    $('#ob_drop').classList.add('is-ready');
    $('#empty').scrollTop = 0;
    $('#file_add').click();
  } else {
    closeStart();
  }
}
EPShell.gallery({ grid: $('#tplList'), filters: $('#tplFilters'), categories: TPL_CATS, items: galleryItems(false), onPick: pickTemplate });
EPShell.gallery({ grid: $('#tplPanel'), items: galleryItems(true), onPick: pickTemplate });

let _startOpen = false;
function openStart() {
  const d = $('#exportDlg'); if (d.open) d.close();
  if (typeof showTemplatesPane === 'function') showTemplatesPane();
  _startOpen = true;
  stage.scrollTop = 0;
  $('#empty').hidden = false;
  $('#ob_close').hidden = !state.photos.length;
  document.body.classList.add('onboarding');
  setStep(0);
}
function closeStart() {
  _startOpen = false;
  if (!state.photos.length) return;
  $('#empty').hidden = true;
  document.body.classList.remove('onboarding');
  setStep(1);
  requestAnimationFrame(() => { if (!userZoomed) fit(); });
}
$('#ob_close').onclick = closeStart;
$('#ob_open').onclick = e => { e.preventDefault(); $('#file_open').click(); };

/* ================= faixa de fotos + status (a cada render) ================= */
function renderPhotoStrip() {
  const box = $('#photoStrip'); if (!box) return;
  const n = state.photos.length, L = layout();
  $('#ph_count').textContent = n
    ? `${n} ${n === 1 ? 'foto' : 'fotos'} em ${L.pages} ${L.pages === 1 ? 'folha' : 'folhas'} (${L.cols}×${L.rows} por folha).`
    : 'Arraste imagens para a janela, cole com Ctrl+V ou escolha do computador.';
  box.innerHTML = '';
  const frag = document.createDocumentFragment();
  state.photos.forEach((ph, i) => {
    const m = media[ph.id], d = photoDPI(ph);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ps-item' + (ph.id === selectedId ? ' on' : '');
    b.title = ph.caption || `Foto ${i + 1}`;
    b.innerHTML = (m ? `<img src="${m.previewURL}" alt="">` : `<span class="ps-miss">!</span>`) +
      (d != null && d < 150 ? `<span class="ps-warn" title="Resolução baixa (${d} dpi)">!</span>` : '') +
      `<span class="ps-n">${i + 1}</span>`;
    b.onclick = () => {
      select(ph.id);
      const p = Math.floor(i / L.perPage);
      if (p !== currentPage) gotoPage(p);
      const el = sheetsEl.querySelector(`.pol[data-id="${ph.id}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      renderPhotoStrip();
    };
    frag.appendChild(b);
  });
  box.appendChild(frag);
}
{
  const _render = render;
  render = function () {
    _render();
    if (_startOpen && state.photos.length && !_pendingTpl) { $('#empty').hidden = false; document.body.classList.add('onboarding'); }
    if (_pendingTpl && state.photos.length) { _pendingTpl = null; _startOpen = false; }
    if (state.photos.length && _prevCount === 0 && !_startOpen) { setStep(1); userZoomed = false; setTimeout(() => fit(), 260); }
    if (!state.photos.length) setStep(0);
    _prevCount = state.photos.length;
    const L = layout(), n = state.photos.length;
    $('#stat').textContent = n ? `${n} ${n === 1 ? 'foto' : 'fotos'} · ${L.pages} ${L.pages === 1 ? 'folha' : 'folhas'} ${PAPER_NAME[state.settings.pageSize] || ''}` : '';
    renderPhotoStrip();
    const d = $('#exportDlg');
    if ((d && d.open) || (isMobile() && $('#mroot').classList.contains('tab-exportar'))) { clearTimeout(render._x); render._x = setTimeout(xpRefresh, 60); }
  };
  const _select = select;
  select = function (id, keep) { _select(id, keep); $$('#photoStrip .ps-item').forEach((b, i) => b.classList.toggle('on', state.photos[i] && state.photos[i].id === selectedId)); };
}

/* ================= "Bem-vindo de volta": miniatura ================= */
new MutationObserver(() => {
  const ra = $('#resumeAsk'); if (!ra || ra.hidden) return;
  ensureFullImages().then(() => drawPage(0, 30)).then(cv => {
    $('#ra_thumb').innerHTML = `<img class="pt-img" alt="" src="${cv.toDataURL('image/jpeg', 0.85)}">`;
  }).catch(() => {});
}).observe($('#resumeAsk'), { attributes: true, attributeFilter: ['hidden'] });

/* ================= Imprimir e baixar ================= */
let xpIdx = 0, xpSetupDone = false, xpSegs = [], xpCut = null;
function xpSetup() {
  if (xpSetupDone) return; xpSetupDone = true;
  xpSegs.push(EPShell.segmented($('#xp_paper'), $('#c_pageSize'), { options: [{ v: 'a4', label: 'A4' }, { v: 'letter', label: 'Carta' }, { v: 'a3', label: 'A3' }, { v: 'a5', label: 'A5' }] }));
  xpSegs.push(EPShell.segmented($('#xp_orient'), $('#c_landscape'), { off: 'Em pé', on: 'Deitada' }));
  xpSegs.push(EPShell.segmented($('#xp_dpi'), $('#c_dpi'), { options: [{ v: '200', label: 'Rascunho' }, { v: '300', label: 'Impressão' }, { v: '450', label: 'Alta' }, { v: '600', label: 'Máxima' }] }));
  // modo de corte: um <select> invisível que traduz para os 2 checkboxes reais
  const sel = document.createElement('select'); sel.hidden = true;
  ['none', 'marks', 'line', 'both'].forEach(v => sel.add(new Option(v, v)));
  document.body.appendChild(sel);
  sel.onchange = () => {
    const v = sel.value, mk = $('#c_marks'), cl = $('#c_cardLine');
    const wantM = v === 'marks' || v === 'both', wantL = v === 'line' || v === 'both';
    if (mk.checked !== wantM) { mk.checked = wantM; mk.dispatchEvent(new Event('change', { bubbles: true })); }
    if (cl.checked !== wantL) { cl.checked = wantL; cl.dispatchEvent(new Event('change', { bubbles: true })); }
    syncControls(); xpRefresh();
  };
  xpCut = { sel, cards: EPShell.optionCards($('#xp_cut'), sel, [
    { v: 'marks', title: 'Marcas de corte', icon: shIcon('marks'), desc: 'Pequenas linhas nos cantos, fora da foto. Ideal para guilhotina.' },
    { v: 'line', title: 'Contorno para recortar', icon: shIcon('line'), desc: 'Linha fina em volta de cada polaroide. Ideal para tesoura.' },
    { v: 'both', title: 'Os dois', icon: shIcon('both'), desc: 'Marcas nos cantos e contorno.' },
    { v: 'none', title: 'Sem guia', icon: shIcon('none'), desc: 'Folha limpa, sem nenhuma linha.' },
  ]) };
  $('#xp_body').addEventListener('change', e => { if (e.target !== sel) { clearTimeout(xpSetup._t); xpSetup._t = setTimeout(xpRefresh, 50); } });
}
let _xpRun = 0;
async function xpRefresh() {
  if (!xpSetupDone) return;
  const run = ++_xpRun;
  const s = state.settings, L = layout(), g = geom(), n = state.photos.length;
  xpSegs.forEach(x => x && x.sync());
  if (xpCut) { xpCut.sel.value = s.cornerMarks && s.cardLine ? 'both' : s.cornerMarks ? 'marks' : s.cardLine ? 'line' : 'none'; xpCut.cards.sync(); }
  const total = L.pages;
  xpIdx = clamp(xpIdx - (xpIdx % 2), 0, Math.max(0, total - 1 - ((total - 1) % 2)));
  $('#xp_sub').textContent = `${n} ${n === 1 ? 'foto' : 'fotos'} · ${PAPER_NAME[s.pageSize] || ''}${s.landscape ? ' deitada' : ''} · polaroides de ${g.polW.toFixed(0)}×${g.polH.toFixed(0)} mm`;
  $('#xp_summary').innerHTML = `<span class="big">${total}</span><span class="txt"><b>${total === 1 ? 'folha' : 'folhas'} ${PAPER_NAME[s.pageSize] || ''}</b> · ${L.cols}×${L.rows} polaroides por folha · imprimir só a <b>frente</b></span>`;
  const dpi = exportDPI();
  $('#xp_dpiHint').textContent = dpi <= 200 ? 'Arquivo leve, bom para conferir. Para imprimir, use "Impressão".' : dpi >= 450 ? 'Arquivo bem maior. Só vale com fotos de alta resolução e impressora fotográfica.' : 'O ideal para impressora doméstica ou gráfica rápida.';
  $('#xp_how').innerHTML = `Imprima em <b>${PAPER_NAME[s.pageSize] || 'A4'}${s.landscape ? ' paisagem' : ''}</b>, escala <b>100%</b> e margens <b>Nenhuma</b>. Papel fotográfico ou couché fosco 180 g dá o melhor resultado. Depois recorte ${s.cornerMarks ? 'pelas marcas' : s.cardLine ? 'pelo contorno' : 'em volta de cada foto'}.`;

  // ---- verificação ----
  const chk = [];
  if (!n) chk.push({ level: 'warn', text: 'Nenhuma foto ainda.', action: { label: 'Adicionar', fn: () => { $('#exportDlg').close(); $('#file_add').click(); } } });
  else chk.push({ level: 'ok', text: `${n} ${n === 1 ? 'foto' : 'fotos'} em ${total} ${total === 1 ? 'folha' : 'folhas'}, dentro da margem de impressão.` });
  const low = state.photos.map((ph, i) => ({ ph, i, d: photoDPI(ph) })).filter(x => x.d != null && x.d < 150);
  if (low.length) chk.push({ level: 'bad', text: `<b>${low.length} ${low.length === 1 ? 'foto' : 'fotos'} com resolução baixa</b> (${low[0].d} dpi): podem sair borradas. Use a imagem original ou diminua o zoom.`,
    action: { label: 'Ver', fn: () => { $('#exportDlg').close(); select(low[0].ph.id); } } });
  else if (n) chk.push({ level: 'ok', text: 'Resolução das fotos boa para imprimir.' });
  const missing = state.photos.filter(ph => !media[ph.id]).length;
  if (missing) chk.push({ level: 'bad', text: `${missing} ${missing === 1 ? 'foto não está' : 'fotos não estão'} neste navegador — sairiam em branco. Troque antes de imprimir.` });
  const free = n ? (L.perPage - (n % L.perPage)) % L.perPage : 0;
  if (free) chk.push({ level: 'info', text: `${free === 1 ? 'Sobra' : 'Sobram'} <b>${free}</b> ${free === 1 ? 'espaço' : 'espaços'} na última folha.`, action: { label: 'Repetir fotos', fn: () => fillWithCopies(free) } });
  if (L.capped) chk.push({ level: 'warn', text: `A grade pedida (${L.wantCols}×${L.wantRows}) não cabe na folha — usando ${L.cols}×${L.rows}.` });
  const noCap = state.photos.filter(ph => !(ph.caption || '').trim()).length;
  if (g.cap > 1 && n && noCap === n) chk.push({ level: 'info', text: 'Nenhuma legenda escrita: a faixa branca sai vazia (clique na faixa de cada foto para escrever).' });
  EPShell.checklist($('#xp_check'), chk);

  // ---- prévia (renderizador do PDF em baixa resolução) ----
  const box = $('#xp_preview');
  if (!n) { box.innerHTML = '<div class="xp-empty">Adicione fotos para ver a prévia.</div>'; return; }
  try { await ensureFullImages(); } catch (e) {}
  if (run !== _xpRun) return;
  const pv = Math.max(40, Math.min(70, Math.round(900 / Math.max(L.PW, L.PH) * 25.4 / 3)));
  const urls = [];
  for (const k of [xpIdx, xpIdx + 1]) {
    if (k >= total) break;
    const cv = await drawPage(k, pv);
    if (run !== _xpRun) return;
    urls.push({ k, url: cv.toDataURL('image/jpeg', 0.85) });
  }
  box.innerHTML = `<div class="ep-sheet__stage${L.PW > L.PH * 1.05 ? ' ep-sheet__stage--col' : ''}">` +
    urls.map(u => `<div class="ep-sheet__page"><img class="ep-sheet__svg" alt="" src="${u.url}"><span class="ep-sheet__cap">Folha ${u.k + 1}</span></div>`).join('') +
    `</div><div class="ep-sheet__nav"><button type="button" class="iconbtn ghost" data-nav="-2" title="Anterior">${ICONS.chevleft ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS.chevleft}</svg>` : '‹'}</button>` +
    `<span>${total > 1 ? `folhas ${xpIdx + 1}–${Math.min(total, xpIdx + 2)} de ${total}` : 'folha 1 de 1'}</span>` +
    `<button type="button" class="iconbtn ghost" data-nav="2" title="Próxima">${ICONS.chevright ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS.chevright}</svg>` : '›'}</button></div>`;
  box.querySelectorAll('[data-nav]').forEach(bt => {
    const d = +bt.dataset.nav;
    bt.disabled = (d < 0 && xpIdx === 0) || (d > 0 && xpIdx + 2 >= total);
    bt.onclick = () => { xpIdx = clamp(xpIdx + d, 0, total - 1); xpRefresh(); };
  });
}
// completa a última folha repetindo as fotos em ordem (com as mesmas legendas/ajustes)
function fillWithCopies(free) {
  const src = state.photos.slice();
  if (!src.length) return;
  pushHistory('fillcopies');
  for (let i = 0; i < free; i++) {
    const o = src[i % src.length];
    const c = JSON.parse(JSON.stringify(o)); c.id = uid(); c.seed = Math.random();
    if (media[o.id]) { media[c.id] = media[o.id]; if (idbOK) DB.get(o.id).then(rec => rec && DB.set(c.id, rec)).catch(() => {}); }
    state.photos.push(c);
  }
  save(); render();
  toast(`${free} ${free === 1 ? 'cópia adicionada' : 'cópias adicionadas'} para completar a folha.`);
}
function openExportDlg() {
  if (!state.photos.length) { toast('Adicione fotos primeiro.'); return; }
  xpSetup(); xpIdx = 0;
  if (isMobile()) { if (typeof mTab === 'function') mTab('exportar'); xpRefresh(); return; }
  select(null);
  const d = $('#exportDlg'); if (!d.open) d.showModal();
  setStep(2);
  xpRefresh();
}
$('#exportDlg').addEventListener('close', () => setStep(state.photos.length ? 1 : 0));
$('#b_exportCfg').onclick = e => { e.stopPropagation(); openExportDlg(); };
$('#b_print').onclick = () => { const d = $('#exportDlg'); if (d.open) d.close(); select(null); setTimeout(() => window.print(), 120); };
$('#m_print').onclick = () => { $('#menu').hidden = true; syncScrim(); openExportDlg(); };
addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    const d = $('#exportDlg'); if (d && d.open) return;
    e.preventDefault(); e.stopImmediatePropagation(); openExportDlg();
  }
  if (e.key === 'Escape' && document.querySelector('dialog[open]')) e.stopImmediatePropagation();
}, true);

/* ================= celular: prévia na aba Imprimir ================= */
function placeExportPreview() {
  const prev = $('#xp_prevHost'), mount = $('#mx_prevMount'), main = $('#exportDlg .xdlg-main');
  if (!prev || !mount || !main) return;
  if (isMobile()) { if (prev.parentElement !== mount) mount.appendChild(prev); }
  else if (prev.parentElement !== main) main.insertBefore(prev, main.firstChild);
}
placeExportPreview();
addEventListener('resize', () => { clearTimeout(placeExportPreview._t); placeExportPreview._t = setTimeout(placeExportPreview, 150); });
if (typeof mTab === 'function') {
  const _mTab = mTab;
  mTab = function (name) { _mTab(name); if (name === 'exportar') { xpSetup(); xpIdx = 0; xpRefresh(); } };
  $$('#mtabs button').forEach(b => { b.onclick = () => mTab(b.dataset.tab); });
}

injectIcons();
setStep(document.body.classList.contains('onboarding') ? 0 : 1);
