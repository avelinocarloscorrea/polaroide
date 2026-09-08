# Arquitetura

## Visão geral

```
index.html          marcação
css/app.css          estilo
js/config.js         constantes, utilitários, ícones
js/state.js          estado, localStorage + IndexedDB, validação
js/images.js         pipeline de imagem (decodifica, redesenha, limpa)
js/layout.js         geometria da folha e DPI
js/render.js         render da tela (DOM), seleção, zoom
js/history.js        desfazer/refazer e mutações
js/export.js         canvas -> PDF/PNG e projeto .json
js/ui.js             feedback, seletor de cor, painéis, bindAll
js/events.js         eventos globais + init()
assets/              favicon.svg, playfair.woff2
```

Sem framework, sem bundler, sem passo de build.

Os `js/*.js` são **scripts clássicos** (não módulos ES) carregados em ordem
pelo `index.html`. Compartilham o mesmo escopo global — cada arquivo é uma
"seção" do antigo `app.js`. Ordem importa: `config` primeiro (define os
utilitários), `events` por último (chama `init()`). Motivo de não usar
`type="module"`: módulos não carregam por `file://` (CORS), e a ferramenta
também precisa abrir com dois cliques.

Nenhum código inline: `script-src 'self'`, `style-src 'self'`. O `@page` da
impressão é definido por uma folha de estilo construída em JS
(`CSSStyleSheet` + `adoptedStyleSheets`), que não passa pelo `style-src`.

## Estado

```
state = {
  settings: { … },     // layout da folha, cores, legenda, exportação
  photos:   [ { id, caption, zoomF, ox, oy, rot, flipH, seed, natW, natH, filter } ]
}
```

`state.photos` guarda só metadados. Os bytes das imagens ficam separados:

- `media[id]` (em memória) — `{ full, fullURL, previewURL, natW, natH, name }`.
  `full` é um Blob JPEG ~3000px; a prévia (`previewURL`) é ~1400px, usada na
  tela para o DOM ficar leve.
- **IndexedDB** (`polaroide-a4` / store `media`) — persiste `full` + `preview`
  por `id`, para as fotos sobreviverem ao fechar o navegador.
- **localStorage** (`polaroide-a4-v2`) — só `settings` + `photos` (metadados).
  `polaroide-ui-v1` guarda o estado dos painéis.

Ao carregar: lê o localStorage, depois hidrata cada foto do IndexedDB. Se o
IndexedDB não estiver disponível (alguns navegadores em `file://`), o app
funciona na sessão mas avisa que nada será salvo — o backup nesse caso é
**Salvar projeto** (`.json` com as imagens embutidas em base64).

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
grande (na resolução escolhida) reproduzindo o layout em milímetros;
`exportPNG()` baixa esse canvas, `exportPDF()` empacota um JPEG por folha num
PDF escrito à mão (`pdfFromImages()`).

## Mapa dos módulos

| arquivo | o que tem |
|---|---|
| `js/config.js`  | `$` `$$` `clamp` `num` `uid` `downloadBlob` `sanitizeText` `safeName`; `SAFE_IMG` e limites; `ICONS` + `injectIcons()`; `ACERVO_URL`; `PAGE_SIZES` `FORMATS` `BASE_FONTS` `PRESETS` `DEFAULTS` `COLOR_DEFAULTS` `HEX` |
| `js/state.js`   | `migrateSettings()`; `state` `media` `uiState` `stage` `sheetsEl` `appEl`; `DB` (wrapper IndexedDB); `save` `loadProject` `normPhoto` `hydrate` |
| `js/images.js`  | `dataURLtoBlob` `decode` `toBlob` `bakeImage` `processFile` `acceptable` `addFiles` `rebuildDerived` `rotate90` |
| `js/layout.js`  | `geom` `pageDims` `layout` `tiltOf` `cssFilter` `photoDPI` `dpiClass` |
| `js/render.js`  | `pageSheet` (folha construída p/ o `@page`); `applyVars` `polEl` `imgTransform` `styleImg` `render` `cur` `select` `fillRight` `livePhoto` `applyZoom` `fit` `gotoPage` |
| `js/history.js` | `past`/`future`; `pushHistory` `applySnap` `undo` `redo` `updateHistoryButtons` `mutate` `move` `removePhoto` `duplicate` `doClear` `wipeAll` |
| `js/export.js`  | `roundRect` `wrapText` `ensureFullImages` `ensureFonts` `drawPage` `drawPol` `pdfFromImages` `exportPDF` `exportPNG` `blobToDataURL` `exportProject` `importProject` |
| `js/ui.js`      | `toast` `busy` `unbusy`; `rebuildFontOptions` `syncControls` `bindRange` `applyFormat` `applyUI`; seletor de cor (`setupColorFields` `openCF`); `bindAll()` |
| `js/events.js`  | listeners globais (teclado, drag&drop, paste, resize, print) + `init()` |

Cada arquivo tem `"use strict";` e um cabeçalho curto. Não há `export`/`import`
— tudo compartilha o escopo global e a ordem de carregamento (acima) resolve as
dependências de topo de arquivo.

## Render

`render()` é a única função que reconstrói o DOM das folhas. Toda mudança de
`settings` ou da lista de fotos chama `render()`. Ajustes ao vivo de uma foto
(arrastar, sliders de cor) usam `livePhoto()`, que só mexe no `style` do
elemento existente — sem reconstruir nada.

A escala da tela é o `zoom` CSS aplicado em `#sheets`. A folha em si é
dimensionada em `mm`, então o que aparece é fiel ao papel.
