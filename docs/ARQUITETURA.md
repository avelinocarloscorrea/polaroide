# Arquitetura

## Visão geral

```
index.html           marcação — #app (desktop) + #mroot (celular) + diálogos
guia.html            guia do usuário (independente)
css/
  base.css           fontes, tokens, resets, botões, campos
  layout.css         grade do #app, barra, painéis, quadro de trabalho
  polaroid.css       o card, a janela da foto, a legenda, o estado vazio, os templates
  effects.css        fita / grampo / brad / percevejo + vidro acrílico
  components.css      menu, toast, busy, diálogos, seletor de cor
  util.css           utilitários
  print.css          @media print
  mobile.css         casca de celular (≤ 820 px)
  guia.css           estilo do guia
js/config.js         constantes, utilitários, ícones, PAGE_SIZES, FORMATS,
                     BASE_FONTS, CAPTION_STYLES, TEMPLATES, LAYOUTS, DEFAULTS
js/state.js          estado, localStorage + IndexedDB, migrateSettings()
js/images.js         pipeline de imagem (decodifica, redesenha, limpa)
js/layout.js         geometria da folha, encaixe (autoFit), DPI
js/render.js         render da tela (DOM), seleção, zoom, painel direito
js/history.js        desfazer/refazer e mutações da lista de fotos
js/export.js         canvas -> PDF/PNG e projeto .json
js/ui.js             feedback, seletor de cor, painéis, templates, bindAll()
js/mobile.js         casca de celular: abas, steppers, syncMobile(), bindMobile()
js/events.js         eventos globais (teclado, toque, drag) + init()
assets/              favicon.svg, playfair.woff2, fonts/*.woff2
```

Sem framework, sem bundler, sem passo de build.

Os `js/*.js` são **scripts clássicos** (não módulos ES) carregados em ordem
pelo `index.html`. Compartilham o mesmo escopo global — cada arquivo é uma
"seção". Ordem importa: `config` primeiro (define os utilitários), `mobile`
depois de `ui` (usa suas funções), `events` por último (chama `init()`).
Motivo de não usar `type="module"`: módulos não carregam por `file://` (CORS),
e a ferramenta também precisa abrir com dois cliques.

Nenhum código inline: `script-src 'self'`, `style-src 'self'`. O `@page` da
impressão é definido por uma folha construída em JS (`CSSStyleSheet` +
`adoptedStyleSheets`), que não passa pelo `style-src`.

## Estado

```
state = {
  settings: { … },     // formato do polaroide, folha/grade, corte, cores,
                       //   legenda, efeito de canto, exportação, acrílico
  photos:   [ { id, caption, zoomF, ox, oy, rot, flipH, seed, natW, natH, filter } ]
}
```

`state.settings` (principais campos):

| grupo | campos |
|---|---|
| polaroide | `format` `polaroidWidthMm` `aspectW` `aspectH` `frameMm` `captionMm` `radiusMm` `tiltDeg` |
| folha/grade | `pageSize` `landscape` `autoFit` `columns` `rows` `marginMm` `gapMm` `align` |
| corte | `cardLine` `cardLineColor` `cornerMarks` `markOffset` `markLen` |
| legenda | `captionFont` `captionSizePt` `captionColor` `captionBold` `captionItalic` `captionUpper` `captionSpacing` `captionShadow` |
| efeito de canto | `tape` (`none` / `tape-2|4|top` / `staple-…` / `brad-…` / `pin-…`) · `tapeColor` |
| cores | `cardColor` `pageBg` `pageBg2` `bgGradient` `bgAngle` |
| interface / export | `screenShadow` `acrylic` `exportDPI` |

`columns` e `rows` são `'auto'` ou um número em string ("1".."12").
`marginMm` nunca fica abaixo de `SAFE_MARGIN` (5 mm) — `migrateSettings()`
força.

`state.photos` guarda só metadados. Os bytes das imagens ficam separados:

- `media[id]` (em memória) — `{ full, fullURL, previewURL, natW, natH, name }`.
  `full` é um Blob JPEG ~3000 px; a prévia (`previewURL`) ~1400 px, usada na
  tela para o DOM ficar leve.
- **IndexedDB** (`polaroide-a4` / store `media`) — persiste `full` + `preview`
  por `id`, para as fotos sobreviverem ao fechar o navegador.
- **localStorage** (`polaroide-a4-v2`) — só `settings` + `photos` (metadados).
  `polaroide-ui-v1` guarda o estado dos painéis.

Ao carregar: lê o localStorage, depois hidrata cada foto do IndexedDB. Se o
IndexedDB não estiver disponível, o app funciona na sessão mas avisa que nada
será salvo — o backup nesse caso é **Salvar projeto** (`.json` com as imagens
embutidas em base64).

## Encaixe na folha (`autoFit`)

Com `autoFit` ligado (padrão), a **largura do polaroide é derivada** de
`columns` × `rows`, não digitada. `js/layout.js`:

```
printArea()   área imprimível = papel − 2 × max(marginMm, SAFE_MARGIN)
gridCount()   nº de colunas/linhas: fixo, ou "auto" pela largura de referência
fitWidth()    largura que faz cols×linhas caberem (menor entre limite de
              largura e limite de altura da célula), com piso de 15 mm
geom()        se autoFit → polW = fitWidth(...); senão → polW = polaroidWidthMm
layout()      cols/rows finais = min(pedido, quanto cabe) — trava dura:
              nada passa da folha; se sobrar pedido, marca L.capped
```

Sem `autoFit`, `layout()` ainda limita as colunas ao que cabe (nunca corta),
só não redimensiona o polaroide.

## Fluxo de uma imagem

```
arquivo/drop/clipboard/projeto
        │
        ▼
   bakeImage()      valida tipo, tamanho e dimensão
        │           decodifica (createImageBitmap) e REDESENHA em <canvas>
        ▼
   full + preview (JPEG limpos, sem metadados)
        │
        ├── IndexedDB.set(id, …)
        └── media[id] = { …, objectURLs }
        ▼
   state.photos.push({ id, … })  →  render()
```

Exportar faz o caminho de volta: `drawPage()` desenha cada folha num `<canvas>`
grande (na resolução escolhida) reproduzindo o layout em milímetros e
recortando os efeitos no contorno do card; `exportPNG()` baixa esse canvas,
`exportPDF()` empacota um JPEG por folha num PDF escrito à mão
(`pdfFromImages()`).

## Mapa dos módulos

| arquivo | o que tem |
|---|---|
| `js/config.js`  | `$` `$$` `clamp` `num` `uid` `downloadBlob` `sanitizeText` `safeName`; `SAFE_IMG` e limites; `ICONS` + `injectIcons()`; `ACERVO_URL`; `PAGE_SIZES` `SAFE_MARGIN` `FORMATS` `BASE_FONTS` `CAPTION_STYLES` `PRESETS` `DEFAULTS` `COLOR_DEFAULTS` `TEMPLATES` `LAYOUTS` `HEX` |
| `js/state.js`   | `migrateSettings()`; `state` `media` `uiState` `stage` `sheetsEl` `appEl`; `DB` (wrapper IndexedDB); `save` `loadProject` `normPhoto` `hydrate` |
| `js/images.js`  | `dataURLtoBlob` `decode` `toBlob` `bakeImage` `processFile` `acceptable` `addFiles` `rebuildDerived` `rotate90` |
| `js/layout.js`  | `pageDims` `printArea` `polHFromW` `gridCount` `fitWidth` `geom` `exportDPI` `layout` `tiltOf` `cssFilter` `photoDPI` `dpiClass` |
| `js/render.js`  | `pageSheet`; `applyVars` `polEl` `imgTransform` `styleImg` `render` `cur` `select` `fillRight` `livePhoto` `applyZoom` `fit` `zoomAt` `gotoPage` |
| `js/history.js` | `past`/`future`; `pushHistory` `applySnap` `undo` `redo` `updateHistoryButtons` `mutate` `move` `removePhoto` `duplicate` `doClear` `wipeAll` |
| `js/export.js`  | `roundRect` `wrapText` `ensureFullImages` `ensureFonts` `drawPage` `drawPol` `drawDecor` `pdfFromImages` `exportPDF` `exportPNG` `blobToDataURL` `exportProject` `importProject` |
| `js/ui.js`      | `toast` `busy` `unbusy`; `rebuildFontOptions` `syncControls` `bindRange` `applyFormat` `templateThumb` `applyTemplate` `applyLayout`; `isMobile` `syncScrim` `togglePanel` `applyUI`; seletor de cor (`setupColorFields` `openCF`); `bindAll()` |
| `js/mobile.js`  | helpers de casca (`mSeg` `mSegSet` `mStepSet` `mRng` …); `mSetTab`; `syncMobile()` (chamada por `syncControls()`); `bindMobile()` (chamada por `init()`) |
| `js/events.js`  | listeners globais (teclado, roda/pinça, arraste do meio, toque duplo, drag&drop, paste, resize, print) + `init()` |

Cada arquivo tem `"use strict";` e um cabeçalho curto. Não há `export`/`import`.

## Render

`render()` é a única função que reconstrói o DOM das folhas. Toda mudança de
`settings` ou da lista de fotos chama `render()`. Ajustes ao vivo de uma foto
(arrastar, sliders de cor) usam `livePhoto()`, que só mexe no `style` do
elemento existente — sem reconstruir nada.

A escala da tela é o `zoom` CSS aplicado em `#sheets`. A folha é dimensionada
em `mm`, então o que aparece é fiel ao papel. Uma linha tracejada
(`.page::before`, `--pm`) marca a margem de segurança só na tela.

## Interface de celular

Em telas ≤ 820 px, `css/mobile.css` esconde o `#app` de desktop (barra +
painel esquerdo) e mostra `#mroot`:

- `#mtop` — barra fina (nome, "Folha 2/3", desfazer/refazer, menu ⋯);
- `#stage` (o mesmo) fica `position:fixed` entre a barra e as abas;
- `#mtabs` — abas **Fotos / Folha / Estilo / Exportar**. As três últimas são
  `.mpanel` que cobrem o quadro; a de Fotos deixa o quadro à vista com um FAB
  de "adicionar";
- tocar numa foto abre a **folha de edição** (o mesmo `#right` do desktop,
  como bottom sheet), que inclui um campo de legenda `#s_caption` (`.mob-only`).

`js/mobile.js` só liga os controles novos ao **mesmo** `state.settings` +
`render()`. `syncControls()` chama `syncMobile()` no fim, então qualquer
mudança (venha de onde vier) reflete nos dois lados. O motor (layout, canvas,
PDF, histórico, persistência) é idêntico ao do desktop.
