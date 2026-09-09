# Segurança e privacidade

Princípio: **nada do usuário sai do computador** — nem imagem, nem legenda,
nem nome de arquivo, nem configuração. E imagens ou projetos abertos são
tratados como não confiáveis.

## 1. Nada é enviado

Content-Security-Policy (no `<meta>` do `index.html` e repetida como header no
`.htaccess`):

```
default-src 'none';
base-uri 'none'; form-action 'none'; frame-ancestors 'none';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
media-src 'self' blob:;
font-src 'self';
manifest-src 'self';
```

- `default-src 'none'` — a base é "nada". Toda diretiva de busca não listada
  (`connect-src`, `object-src`, `worker-src`, `child-src`…) herda `'none'`.
  Ou seja: `fetch`, `XMLHttpRequest`, `sendBeacon`, WebSocket, EventSource,
  `<object>`/`<embed>` ficam **bloqueados**. Não há como o código vazar dados,
  mesmo que quisesse. (Listar essas diretivas com `'none'` explicitamente não
  muda nada e ainda gera aviso no console — por isso ficaram de fora.)
- `manifest-src 'self'` — única exceção, e apenas para carregar o
  `manifest.webmanifest` (permite instalar o app na tela de início / PWA). É
  um arquivo de metadados estático do próprio domínio; não abre canal de rede
  nem executa nada. Não há service worker.
- `script-src 'self'` — nenhum script inline e nenhum script de terceiros.
  Só `js/*.js`, do mesmo domínio. Fecha injeção de `<script>` e handlers
  `onclick=` embutidos.
- O código **não faz nenhuma chamada de rede**. Não há `fetch`, nem `<link>`
  ou `<img>` externo, nem `http(s)://` no código (fora o link do acervo).
- `font-src 'self'` — a fonte de marca (Playfair Display) e o favicon vêm de
  `assets/`, do próprio site.
- `img-src` ainda aceita `data:` só para o caminho de fallback de decodificação
  de imagem (`img.src = dataURL` quando `createImageBitmap` falha); `data:`
  não permite exfiltração.
- `style-src 'self'` — sem `'unsafe-inline'`. O CSS está em `css/*.css`; não
  há bloco `<style>` nem atributo `style=` na página (nem no `guia.html`). O
  `@page` da impressão é definido por uma `CSSStyleSheet` construída em JS e
  adicionada em `adoptedStyleSheets` (CSSOM não passa pelo `style-src`). As
  manipulações de `element.style` no código também são CSSOM, não `style=`.

Complementos: `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `X-Robots-Tag: noindex`.

> **Antivírus que injeta script** (Kaspersky, alguns proxies): tenta inserir
> `<script src=…>` de terceiros na página. O `script-src 'self'` **recusa** —
> aparece um aviso no console, mas é a proteção funcionando. Alguns desses
> produtos ainda reescrevem o cabeçalho CSP no trânsito, o que pode gerar
> avisos de "'none' alongside other sources"; não há como o site impedir isso.

## 2. Imagens são neutralizadas

Toda imagem — de arquivo, colada, arrastada ou vinda de um `.json` — passa por
`bakeImage()`:

1. **Tipo**: só `image/{jpeg,png,webp,gif,bmp,avif}`. SVG é recusado (pode
   conter script). O `accept=` dos inputs e `acceptable()` filtram antes.
2. **Tamanho**: arquivo até 45 MB.
3. **Dimensão**: lado até 12000 px e área até 140 MP — barra "bombas" de
   descompressão antes de alocar memória à toa.
4. **Redesenho**: `createImageBitmap` → `<canvas>` → `toBlob('image/jpeg')`.
   O que sobra é só pixel. EXIF, GPS, perfil ICC, comentários, chunks extras,
   polyglots — tudo fica para trás.

## 3. Projeto `.json` não é confiável

`importProject()`:

- rejeita arquivo acima de 250 MB e estrutura que não seja objeto;
- limita a 400 fotos;
- cada `_img` precisa casar `^data:image/(jpeg|png|webp);base64,` e ter menos
  de 45 MB antes de virar Blob;
- **cada imagem importada volta a passar por `bakeImage()`** — mesma limpeza
  das imagens novas;
- `settings` passa por `migrateSettings()`; cada foto por `normPhoto()`.

## 4. Nada não sanitizado chega a CSS ou canvas

`migrateSettings()` força:

- números dentro de faixas (largura, margens, dpi, colunas, linhas, etc.);
- `marginMm` nunca abaixo de `SAFE_MARGIN` (5 mm);
- cores só se casarem `^#([0-9a-f]{3}|[0-9a-f]{6})$` — senão, o padrão;
- `captionFont` só se estiver na lista fixa de fontes — senão, o padrão
  (fecha injeção de CSS via `font-family`);
- `tape` só um dos valores da lista fixa (`none` / `tape-…` / `staple-…` /
  `brad-…` / `pin-…`); `pageSize` só uma chave de `PAGE_SIZES`; `format` só
  uma chave de `FORMATS`; `columns`/`rows` só `'auto'` ou "1".."12";
- booleanos coeridos (`autoFit`, `bgGradient`, `cornerMarks`, …).

`normPhoto()` faz o mesmo para cada foto (zoom, deslocamento, rotação e todos
os valores de filtro em faixa; `caption` vira string com `sanitizeText`).

Templates e modelos de folha (`TEMPLATES`, `LAYOUTS`) são só conjuntos
parciais de `settings`; ao aplicar, passam por `migrateSettings()` — o mesmo
crivo. Nada vindo deles chega cru a CSS ou canvas.

## 5. Legenda

A legenda é um `<textarea>` (`maxlength=500`), não HTML editável:

- só texto — não há como colar marcação;
- no `input`, `sanitizeText()` remove caracteres de controle e corta em
  500 chars;
- no canvas de exportação a legenda é desenhada com `fillText()` (string
  pura), nunca interpretada.

## 6. Servidor

- Arquivos 100% estáticos. Nenhum código roda no servidor; nenhum banco de
  dados. Ao dividir hospedagem com outro app, use docroot separado.
- `.htaccess` na raiz (`docs/DEPLOY.md` explica cada bloco):
  - `Require all denied` para `.php`, `.cgi`, `.sh` e afins — nada executa;
  - sem listagem de diretório; dotfiles e arquivos de fonte/backup negados;
  - repete todos os cabeçalhos de segurança (CSP, HSTS, `frame-ancestors`,
    `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `nosniff`);
  - `RewriteEngine Off`.
- Em hospedagem que ignora `.htaccess` (GitHub Pages, etc.), a CSP em `<meta>`
  segue valendo; replique os cabeçalhos pelo mecanismo do provedor.

## O que fazer se mudar algo

- Mexeu na CSP no `<meta>`? Replique no `.htaccess` (e vice-versa).
- Adicionou um novo campo em `settings`? Adicione a validação dele em
  `migrateSettings()`.
- Novo campo por foto? Valide em `normPhoto()`.
- Novo recurso que baixa algo da internet? **Não.** Isso quebra o modelo, e a
  CSP não deixa. Se precisar de um asset, coloque em `assets/` e sirva do
  próprio site.
