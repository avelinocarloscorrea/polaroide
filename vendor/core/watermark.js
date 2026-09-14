/* packages/core/watermark.js — EPWatermark
 *
 * Marca d'água, a MESMA nas três ferramentas, desenhada com a caneta (tela e
 * PDF vetorial). Estilos:
 *   text     texto (cheio ou só contorno)
 *   seal     selo redondo com anel duplo, texto e linha menor
 *   stamp    carimbo retangular (bordas duplas, caixa alta espaçada)
 *   ribbon   faixa atravessando a página com o texto
 *   frame    texto correndo pelas quatro bordas
 *   art      ilustração do catálogo       image  imagem do aparelho (logo)
 * Posições: center, top, bottom, tl, tr, bl, br, tile (repetida), dense (repetida miúda).
 *
 *   wm = { on, kind, text, text2, art, src, opacity, size, rot, pos, color, fam, outline, covers }
 *   EPWatermark.clean(raw)   EPWatermark.draw(pen, W, H, wm, { ink, paper, fam })
 *   EPWatermark.panel(host, { get, set(wm, live), pickImage(cb), colors(), coversLabel })
 */
(function (root) {
  "use strict";
  const PT = 72 / 25.4;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const DATA_IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const num = (v, d) => (v != null && v !== '' && isFinite(+v)) ? +v : d;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const sanitize = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);

  const KINDS = [['text', 'Texto'], ['seal', 'Selo'], ['stamp', 'Carimbo'], ['ribbon', 'Faixa'], ['frame', 'Borda'], ['art', 'Ilustração'], ['image', 'Imagem']];
  const POS = [['center', 'Centro'], ['top', 'Topo'], ['bottom', 'Embaixo'], ['tl', '↖'], ['tr', '↗'], ['bl', '↙'], ['br', '↘'], ['tile', 'Repetida'], ['dense', 'Miúda']];
  const DEFAULT = { on: false, kind: 'text', text: '', text2: '', art: '', src: '', opacity: 0.1, size: 1, rot: -30, pos: 'center', color: '', fam: '', outline: false, covers: false };

  function clean(w) {
    w = w && typeof w === 'object' ? w : {};
    const fams = (root.EPFontMetrics && root.EPFontMetrics.families) || {};
    const pos = w.pos === 'corner' ? 'br' : w.pos;
    return {
      on: !!w.on,
      kind: KINDS.some(k => k[0] === w.kind) ? w.kind : 'text',
      text: sanitize(w.text, 60), text2: sanitize(w.text2, 40),
      art: root.EPArt ? (root.EPArt.isId(w.art) ? w.art : '') : (/^[a-z0-9-]+\/[a-z0-9-]+$/.test(w.art || '') ? w.art : ''),
      src: typeof w.src === 'string' && w.src.length < 5e6 && DATA_IMG.test(w.src) ? w.src : '',
      opacity: Math.round(clamp(num(w.opacity, DEFAULT.opacity), 0.03, 0.8) * 100) / 100,
      size: Math.round(clamp(num(w.size, 1), 0.3, 3) * 100) / 100,
      rot: Math.round(clamp(num(w.rot, DEFAULT.rot), -90, 90)),
      pos: POS.some(p => p[0] === pos) ? pos : 'center',
      color: HEX.test(w.color || '') ? w.color.toLowerCase() : '',
      fam: w.fam && (fams[w.fam] || !root.EPFontMetrics) && /^[A-Za-z]{2,24}$/.test(w.fam) ? w.fam : '',
      outline: !!w.outline, covers: !!w.covers,
    };
  }

  function artBox(id, base) {
    const it = root.EPArt ? root.EPArt.get(id) : null, ar = it ? it.w / it.h : 1;
    return ar >= 1 ? [base, base / ar] : [base * ar, base];
  }

  // um "carimbo" centrado em cx, cy (sem giro) — devolve nada
  function unit(pen, W, H, wm, ctx, cx, cy, scale) {
    const color = wm.color || ctx.ink || '#1f2522', paper = ctx.paper || '#ffffff';
    const fam = wm.fam || ctx.fam || 'sans', k = wm.size * scale;
    const txt = wm.text || 'Esmeralda Paper';
    const tx = (str, x, y, size, o = {}) => {
      if (wm.outline && pen.mark) {
        const m = pen.mark();
        pen.text(str, x, y, { size, color, align: 'c', baseline: 'middle', family: fam, font: 'bold', ...o });
        const w = pen.textWidth(str, size, true, fam), h = size / PT * 1.2;
        pen.fxWrap(m, { x: x - w / 2, y: y - h / 2, w, h }, { ol: o.color || color, olw: 0.25, hol: true });
      } else pen.text(str, x, y, { size, color, align: 'c', baseline: 'middle', family: fam, font: 'bold', ...o });
    };
    if (wm.kind === 'art' && wm.art && pen.art) {
      const [w, h] = artBox(wm.art, 70 * k);
      pen.art(wm.art, cx - w / 2, cy - h / 2, w, h, { color });
    } else if (wm.kind === 'image' && wm.src) {
      const w = 70 * k, dim = root.imageDims ? root.imageDims(wm.src) : null, h = dim && dim.w ? w * dim.h / dim.w : w;
      pen.image(wm.src, cx - w / 2, cy - h / 2, w, h, { fit: 'meet' });
    } else if (wm.kind === 'seal') {
      const R = 26 * k;
      pen.circle(cx, cy, R, { stroke: color, w: 1.1 * k });
      pen.circle(cx, cy, R * 0.86, { stroke: color, w: 0.35 * k });
      const up = txt.toLocaleUpperCase('pt-BR');
      const size = pen.fitText(up, R * 1.45, 15 * k, 5, true, fam);
      tx(up, cx, cy - (wm.text2 ? size / PT * 0.35 : 0), size);
      if (wm.text2) pen.text(wm.text2.toLocaleUpperCase('pt-BR'), cx, cy + size / PT * 0.75, { size: Math.min(size * 0.5, 8 * k), color, align: 'c', baseline: 'middle', family: fam, tracking: 0.6 * k });
      [-1, 1].forEach(sd => { const sx = cx + sd * R * 0.62, sy = cy + R * 0.5; pen.poly(star(sx, sy, 1.6 * k), { fill: color }); });
      pen.poly(star(cx, cy - R * 0.62, 2.2 * k), { fill: color });
    } else if (wm.kind === 'stamp') {
      const up = txt.toLocaleUpperCase('pt-BR'), size = 16 * k, trk = 1.2 * k;
      const tw = pen.textWidth(up, size, true, fam) + Math.max(0, up.length - 1) * trk, th = size / PT * 1.25;
      const bw = tw + 12 * k, bh = th + (wm.text2 ? 9 * k : 6 * k);
      pen.rect(cx - bw / 2, cy - bh / 2, bw, bh, { stroke: color, w: 1.2 * k, rx: 1.5 * k });
      pen.rect(cx - bw / 2 + 1.8 * k, cy - bh / 2 + 1.8 * k, bw - 3.6 * k, bh - 3.6 * k, { stroke: color, w: 0.35 * k, rx: 1 * k });
      tx(up, cx, cy - (wm.text2 ? 2 * k : 0), size, { tracking: trk });
      if (wm.text2) pen.text(wm.text2, cx, cy + th * 0.55, { size: 6.5 * k, color, align: 'c', baseline: 'middle', family: fam });
    } else {
      const size = pen.fitText(txt, (wm.pos === 'center' ? W * 0.9 : W * 0.5) * wm.size * scale, 54 * k, 6, true, fam);
      tx(txt, cx, cy, size);
      if (wm.text2) pen.text(wm.text2, cx, cy + size / PT * 0.8, { size: size * 0.35, color, align: 'c', baseline: 'middle', family: fam });
    }
    return paper;
  }
  function star(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return pts;
  }

  function draw(pen, W, H, raw, ctx = {}) {
    const wm = raw && raw.kind ? raw : clean(raw);
    if (!wm.on) return;
    const color = wm.color || ctx.ink || '#1f2522', fam = wm.fam || ctx.fam || 'sans';
    pen.clip(0, 0, W, H);
    if (pen.alpha) pen.alpha(wm.opacity);
    const txt = wm.text || 'Esmeralda Paper';
    if (wm.kind === 'ribbon') {
      const size = 20 * wm.size, bandH = size / PT * 1.9;
      if (pen.rotate) pen.rotate(wm.rot, W / 2, H / 2);
      const D = Math.hypot(W, H) + 20;
      pen.rect(W / 2 - D / 2, H / 2 - bandH / 2, D, bandH, { fill: color });
      const seg = `${txt}   ·   `, rep = seg.repeat(Math.max(1, Math.ceil(D / Math.max(4, pen.textWidth(seg, size, true, fam)))));
      pen.text(rep, W / 2, H / 2, { size, color: ctx.paper || '#ffffff', align: 'c', baseline: 'middle', family: fam, font: 'bold' });
      if (pen.rotate) pen.unclip();
    } else if (wm.kind === 'frame') {
      const size = 8 * wm.size, m = size / PT * 0.9 + 2;
      const line = `${txt}  ·  `;
      const repeatTo = len => { const one = pen.textWidth(line, size, true, fam); return line.repeat(Math.max(1, Math.ceil(len / Math.max(1, one)) + 1)); };
      pen.clip(m * 0.2, 0, W - m * 0.4, H);
      pen.text(repeatTo(W), W / 2, m, { size, color, align: 'c', baseline: 'middle', family: fam, font: 'bold' });
      pen.text(repeatTo(W), W / 2, H - m, { size, color, align: 'c', baseline: 'middle', family: fam, font: 'bold' });
      pen.unclip();
      if (pen.rotate) {
        pen.rotate(-90, m, H / 2); pen.clip(m - H / 2 + m * 2, H / 2 - size, H - m * 4, size * 2);
        pen.text(repeatTo(H), m, H / 2, { size, color, align: 'c', baseline: 'middle', family: fam, font: 'bold' }); pen.unclip(); pen.unclip();
        pen.rotate(90, W - m, H / 2); pen.clip(W - m - H / 2 + m * 2, H / 2 - size, H - m * 4, size * 2);
        pen.text(repeatTo(H), W - m, H / 2, { size, color, align: 'c', baseline: 'middle', family: fam, font: 'bold' }); pen.unclip(); pen.unclip();
      }
    } else {
      const one = (cx, cy, scale = 1) => {
        const rot = wm.kind === 'stamp' || wm.kind === 'seal' ? wm.rot * 0.4 : wm.rot;
        if (pen.rotate && rot) pen.rotate(rot, cx, cy);
        unit(pen, W, H, wm, { ...ctx, ink: color, fam }, cx, cy, scale);
        if (pen.rotate && rot) pen.unclip();
      };
      const mX = Math.min(W, H) * 0.2, mY = Math.min(W, H) * 0.14;
      if (wm.pos === 'tile' || wm.pos === 'dense') {
        const sc = wm.pos === 'dense' ? 0.5 : 0.8, step = (wm.kind === 'text' ? 70 : 62) * wm.size * sc;
        for (let y = step * 0.35, r = 0; y < H + step / 2; y += step * 0.8, r++)
          for (let x = (r % 2 ? step / 2 : 0) + step * 0.2; x < W + step / 2; x += step) one(x, y, sc * 0.75);
      } else if (wm.pos === 'top') one(W / 2, H * 0.12, 0.8);
      else if (wm.pos === 'bottom') one(W / 2, H * 0.88, 0.8);
      else if (wm.pos === 'tl') one(mX, mY, 0.55);
      else if (wm.pos === 'tr') one(W - mX, mY, 0.55);
      else if (wm.pos === 'bl') one(mX, H - mY, 0.55);
      else if (wm.pos === 'br') one(W - mX, H - mY, 0.55);
      else one(W / 2, H / 2, 1);
    }
    if (pen.alpha) pen.unclip();
    pen.unclip();
  }

  function thumb(raw, ctx) {
    if (!root.SvgPen) return '';
    const W = 60, H = 80, pen = root.SvgPen(W, H, { bg: '#ffffff' });
    draw(pen, W, H, { ...clean(raw), on: true, opacity: Math.max(0.35, clean(raw).opacity * 3) }, ctx || {});
    return pen.svg().replace(/ width="[^"]*mm" height="[^"]*mm"/, '');
  }

  /* ---------------- painel ---------------- */
  function panel(host, o) {
    const wrap = document.createElement('div');
    wrap.className = 'epwm';
    host.appendChild(wrap);
    const cur = () => clean(o.get());
    const fams = () => Object.entries((root.EPFontMetrics && root.EPFontMetrics.families) || {}).map(([v, f]) => [v, f.label.split(' — ')[0]]);
    function build() {
      const w = cur(), ctx = o.ctx ? o.ctx() : {};
      const needsText = !['art', 'image'].includes(w.kind);
      let h = `<label class="row epwm-on"><input type="checkbox" data-chk="on"${w.on ? ' checked' : ''}> Usar marca d'água</label>`;
      if (w.on) {
        h += `<div class="epbg-grid epwm-kinds">${KINDS.map(([v, l]) => `<button type="button" class="epbg-t${w.kind === v ? ' on' : ''}" data-kind="${v}">${thumb({ ...w, kind: v, pos: v === 'frame' || v === 'ribbon' ? 'center' : 'center', size: v === 'text' ? 0.7 : 0.55, rot: v === 'frame' ? 0 : w.rot }, ctx)}<span>${l}</span></button>`).join('')}</div>`;
        if (needsText) {
          h += `<label>Texto <input type="text" data-txt="text" maxlength="60" value="${esc(w.text)}" placeholder="ex.: seu nome ou marca"></label>`;
          if (['seal', 'stamp', 'text'].includes(w.kind)) h += `<label>Linha menor <input type="text" data-txt="text2" maxlength="40" value="${esc(w.text2)}" placeholder="opcional — ex.: desde 2020"></label>`;
          h += `<label>Fonte <select data-sel="fam"><option value="">Padrão</option>${fams().map(([v, l]) => `<option value="${v}"${w.fam === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
          if (['text', 'stamp', 'seal'].includes(w.kind)) h += `<label class="row"><input type="checkbox" data-chk="outline"${w.outline ? ' checked' : ''}> Só o contorno das letras</label>`;
        }
        if (w.kind === 'art') h += `<div class="wm-pick"><span class="wm-pick__prev">${w.art && root.EPArt ? root.EPArt.svg(w.art, w.color || ctx.ink || '#1f2522') : ''}</span><button type="button" data-act="art">${w.art ? 'Trocar ilustração' : 'Escolher ilustração'}</button></div>`;
        if (w.kind === 'image') h += `<div class="wm-pick"><span class="wm-pick__prev epwm-img"></span><button type="button" data-act="image">${w.src ? 'Trocar imagem' : 'Escolher imagem'}</button></div>`;
        if (!['ribbon', 'frame'].includes(w.kind)) h += `<span class="fld-lbl">Posição</span><div class="grp epwm-pos">${POS.map(([v, l]) => `<button type="button" class="chip${w.pos === v ? ' on' : ''}" data-pos="${v}">${l}</button>`).join('')}</div>`;
        h += `<label class="epbg-rng"><span>Transparência <b data-out="opacity">${Math.round(w.opacity * 100)}%</b></span><input type="range" data-rng="opacity" min="3" max="80" step="1" value="${Math.round(w.opacity * 100)}"></label>`;
        h += `<div class="epbg-two"><label class="epbg-rng"><span>Tamanho <b data-out="size">${Math.round(w.size * 100)}%</b></span><input type="range" data-rng="size" min="30" max="300" step="5" value="${Math.round(w.size * 100)}"></label>`;
        if (w.kind !== 'frame') h += `<label class="epbg-rng"><span>Giro <b data-out="rot">${w.rot}°</b></span><input type="range" data-rng="rot" min="-90" max="90" step="5" value="${w.rot}"></label>`;
        h += `</div>`;
        const cols = [...new Set([...(o.colors ? o.colors() : []), '#1f2522', '#ffffff', '#35594d', '#8a2f2f', '#1f3a52', '#c9a24a', '#9a9a9a'].filter(c => HEX.test(c)).map(c => c.toLowerCase()))];
        h += `<span class="fld-lbl">Cor</span><div class="epbg-sw"><button type="button" class="epbg-c epbg-c--auto${w.color ? '' : ' on'}" data-color="" title="Cor do texto do documento">A</button>${cols.map(c => `<button type="button" class="epbg-c${w.color === c ? ' on' : ''}" data-color="${c}" title="${c}"><i data-c="${c}"></i></button>`).join('')}<label class="epbg-c epbg-c--pick" title="Outra cor"><input type="color" data-pick="color" value="${w.color || '#1f2522'}"></label></div>`;
        if (o.coversLabel) h += `<label class="row"><input type="checkbox" data-chk="covers"${w.covers ? ' checked' : ''}> ${esc(o.coversLabel)}</label>`;
      }
      wrap.innerHTML = h;
      wrap.querySelectorAll('i[data-c]').forEach(i => { i.style.background = i.dataset.c; });
      const ip = wrap.querySelector('.epwm-img'); if (ip && w.src) { const im = new Image(); im.alt = ''; im.src = w.src; ip.appendChild(im); }
      if (w.kind === 'art' && w.art && root.EPArt && !root.EPArt.get(w.art)) root.EPArt.ensure([w.art]).then(build);
    }
    const set = (patch, live) => { o.set(clean({ ...cur(), ...patch }), !!live); if (!live) build(); };
    wrap.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.kind) {
        const patch = { kind: d.kind };
        if (d.kind === 'seal' || d.kind === 'stamp') { if (cur().pos === 'tile') patch.pos = 'center'; patch.opacity = Math.max(cur().opacity, 0.14); }
        if (d.kind === 'art' && !cur().art && root.EPArtPicker) { root.EPArtPicker.open({ title: "Ilustração da marca d'água", onPick: id => root.EPArt.ensure([id]).then(() => set({ kind: 'art', art: id })) }); return; }
        if (d.kind === 'image' && !cur().src && o.pickImage) { o.pickImage(src => set({ kind: 'image', src })); return; }
        set(patch);
      }
      else if (d.pos) set({ pos: d.pos, rot: ['tl', 'tr', 'bl', 'br', 'top', 'bottom'].includes(d.pos) ? 0 : cur().rot });
      else if (d.color != null && 'color' in d) set({ color: d.color });
      else if (d.act === 'art' && root.EPArtPicker) root.EPArtPicker.open({ title: "Ilustração da marca d'água", current: cur().art, onPick: id => root.EPArt.ensure([id]).then(() => set({ kind: 'art', art: id })) });
      else if (d.act === 'image' && o.pickImage) o.pickImage(src => set({ kind: 'image', src }));
    });
    wrap.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.rng) {
        const k = t.dataset.rng, v = +t.value, val = k === 'rot' ? v : v / 100;
        const out = wrap.querySelector(`[data-out="${k}"]`); if (out) out.textContent = k === 'rot' ? v + '°' : v + '%';
        o.set(clean({ ...cur(), [k]: val }), true);
      } else if (t.dataset.txt) o.set(clean({ ...cur(), [t.dataset.txt]: t.value }), true);
      else if (t.dataset.pick) o.set(clean({ ...cur(), [t.dataset.pick]: t.value }), true);
    });
    wrap.addEventListener('change', e => {
      const t = e.target, d = t.dataset;
      if (d.rng) set({ [d.rng]: d.rng === 'rot' ? +t.value : +t.value / 100 });
      else if (d.chk) set(d.chk === 'on' && t.checked && !cur().text ? { on: true, text: o.defaultText || 'Esmeralda Paper' } : { [d.chk]: t.checked });
      else if (d.sel) set({ [d.sel]: t.value });
      else if (d.pick) set({ [d.pick]: t.value });
      else if (d.txt) o.set(clean({ ...cur(), [d.txt]: t.value }), false);
    });
    build();
    return { refresh: build, el: wrap };
  }

  root.EPWatermark = { DEFAULT, KINDS, POS, clean, draw, thumb, panel };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.EPWatermark;
})(typeof window !== 'undefined' ? window : globalThis);
