/* Polaroide Studio — js/wizard.js
   Tela inicial sem menus: modelos prontos OU montar do zero em 3 passos
   curtos (formato do polaroide → grade da folha → efeito/legenda). Cada
   opção já mostra a miniatura real (formatThumbSVG/tplThumbSVG, de ui.js)
   com as escolhas acumuladas até ali. No fim, abre direto o seletor de
   fotos — a única coisa que falta pra terminar é a foto em si.
   (parte de app; carregado depois de ui.js — usa tplThumbSVG/formatThumbSVG/
   esc/$ dela) */
"use strict";

const WIZ_STEPS = [
  { kind: 'format', title: 'Que formato de polaroide?', desc: 'A proporção e a moldura de cada foto.',
    options: Object.keys(FORMATS).filter(id => !FORMATS[id].custom)
      .map(id => ({ id, label: FORMATS[id].label, desc: '', settings: {
        format: id, polaroidWidthMm: FORMATS[id].w, aspectW: FORMATS[id].aw, aspectH: FORMATS[id].ah,
        frameMm: FORMATS[id].frame, frameTopMm: FORMATS[id].top, captionMm: FORMATS[id].cap,
      } })) },
  { kind: 'layout', title: 'Como distribuir na folha?', desc: 'Papel, colunas e linhas por folha.',
    options: LAYOUTS.map(l => ({ id: l.id, label: l.name, desc: '', settings: { ...l.settings } })) },
  { kind: 'effect', title: 'Qual efeito nas fotos?', desc: 'Aplica em toda foto nova que você adicionar.',
    options: Object.keys(PRESET_LABELS).map(id => ({ id, label: PRESET_LABELS[id], desc: '', settings: { filterPreset: id } })) },
];

let wizStep = 0;
let wizDraft = null;
const wizDefaultDraft = () => ({ ...DEFAULTS });

function showTemplatesPane() {
  $('#ob_wizard').hidden = true;
  $('#ob_templates').hidden = false;
}
function showWizardPane() {
  wizStep = 0; wizDraft = wizDefaultDraft();
  $('#ob_templates').hidden = true;
  $('#ob_wizard').hidden = false;
  renderWizStep();
}
function renderWizStep() {
  const step = WIZ_STEPS[wizStep];
  $('#ob_wizStep').textContent = `Passo ${wizStep + 1} de ${WIZ_STEPS.length}`;
  $('#ob_wizTitle').textContent = step.title;
  $('#ob_wizDesc').textContent = step.desc || '';
  const grid = $('#ob_wizGrid');
  grid.className = 'tpl-list' + (step.kind !== 'layout' ? ' tpl-list--format' : '');
  grid.innerHTML = '';
  step.options.forEach(opt => {
    const merged = { ...wizDraft, ...opt.settings };
    const thumb = step.kind === 'format' ? formatThumbSVG(opt.id)
      : step.kind === 'effect' ? effectThumbSVG(opt.id)
      : tplThumbSVG({ id: 'wiz-' + opt.id, settings: merged });
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tpl-card';
    b.innerHTML = `<span class="tpl-card__thumb">${thumb}</span>
      <span class="tpl-card__name">${esc(opt.label)}</span>
      ${opt.desc ? `<span class="tpl-card__desc">${esc(opt.desc)}</span>` : ''}`;
    b.onclick = () => {
      Object.assign(wizDraft, opt.settings);
      if (wizStep < WIZ_STEPS.length - 1) { wizStep++; renderWizStep(); }
      else finishWizard();
    };
    grid.appendChild(b);
  });
}
function finishWizard() {
  pushHistory('template');
  const keep = { acrylic: state.settings.acrylic, exportDPI: state.settings.exportDPI };
  state.settings = migrateSettings({ ...DEFAULTS, ...wizDraft, ...keep });
  syncControls(); applyVars(); render(); save();
  toast('Ajustes prontos — agora é só escolher as fotos.');
  $('#e_add').click();
}

(function initWizard() {
  $('#ob_wizStart').onclick = showWizardPane;
  $('#ob_wizBack').onclick = () => { if (wizStep > 0) { wizStep--; renderWizStep(); } else showTemplatesPane(); };
})();
