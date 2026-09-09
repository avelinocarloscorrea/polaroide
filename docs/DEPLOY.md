# Deploy

O projeto é um conjunto de arquivos estáticos. Serve em qualquer coisa que
entregue arquivo: Apache/LiteSpeed, Nginx, GitHub Pages, Netlify, etc.

## O que vai para o ar

Tudo o que está versionado, **menos** `docs/`, `marketing/`, `README.md`,
`CHANGELOG.md`, `LICENSE`, `acervo.html` e `.git` — esses são só do
repositório. Na prática:

```
public_html/            (ou o docroot do host)
    index.html
    guia.html
    manifest.webmanifest   (PWA — instalar na tela de início)
    .htaccess           só em Apache/LiteSpeed
    css/*.css           base, layout, polaroid, effects, components, util,
                        print, mobile, guia
    js/*.js             10 arquivos (config, state, images, layout, render,
                        history, export, ui, mobile, events)
    assets/
        favicon.svg
        icon.svg           ícone do app (192/512, maskable)
        playfair.woff2
        fonts/*.woff2
```

Caminhos são relativos, então funciona tanto na raiz de um domínio quanto
numa subpasta.

## Apache / LiteSpeed (hospedagem compartilhada)

Se o host compartilha espaço com outro app (um WordPress, por exemplo), use um
**docroot separado** (um subdomínio próprio) — nada de `.htaccess` nem pasta
em comum.

```
scp -P <porta> -r index.html guia.html manifest.webmanifest .htaccess css js assets \
    <usuario>@<host>:<caminho-do-docroot>/

ssh -p <porta> <usuario>@<host> \
  'cd <caminho-do-docroot> && find . -type d -exec chmod 755 {} + && find . -type f -exec chmod 644 {} +'
```

As tags têm um `?v=NNN` de cache-buster; suba com o número novo quando mudar
CSS/JS.

## Conferir

```
BASE=https://<seu-dominio>

curl -sI $BASE/ | grep -i -e '^HTTP' -e content-security-policy \
  -e x-frame-options -e x-content-type-options -e strict-transport-security

curl -s -o /dev/null -w '%{http_code}\n' $BASE/.htaccess       # 403
curl -s -o /dev/null -w '%{http_code}\n' $BASE/qualquer.php    # 403 ou 404
curl -s -o /dev/null -w '%{http_code}\n' $BASE/js/config.js    # 200, text/javascript
curl -s -o /dev/null -w '%{http_code}\n' $BASE/css/mobile.css  # 200, text/css
curl -s -o /dev/null -w '%{http_code}\n' $BASE/guia.html       # 200, text/html
curl -sI $BASE/manifest.webmanifest | grep -i -e '^HTTP' -e content-type  # 200, application/manifest+json
```

O HTML servido não pode ter nenhuma URL externa além do link `<a>` para o
GitHub (na aba "Sobre"):

```
curl -s $BASE/ | grep -oE 'https?://[^" )]+' | grep -v github.com
# (sem saída)
```

## `.htaccess`

O arquivo versionado (`.htaccess`, na raiz) já traz:

- `Options -Indexes` — sem listagem de diretório;
- `Require all denied` para `.php`, `.cgi`, `.sh`, etc. — nada executa;
- dotfiles e arquivos de fonte/backup (`.bak`, `.md`, `.map`, …) negados;
- todos os cabeçalhos de segurança: a mesma CSP do `<meta>` (só as diretivas
  que diferem de `default-src 'none'`) + `frame-ancestors 'none'`, HSTS,
  `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`,
  `X-Frame-Options`, COOP/CORP, `X-Robots-Tag`;
- MIME e cache (`.js`/`.css`/`.svg` = 1 h, `.woff2` = 1 semana immutable,
  `.html` = no-cache);
- `RewriteEngine Off`.

Tudo dentro de `<IfModule>` para não derrubar a pasta com erro 500 se algum
módulo não estiver presente. Sem `php_flag` (quebra no LiteSpeed).

## GitHub Pages / Netlify / etc.

`.htaccess` é ignorado; a CSP em `<meta>` continua valendo. Se o provedor
deixar configurar cabeçalhos (Netlify `_headers`, Cloudflare Rules…), replique
a CSP (com `frame-ancestors 'none'`) e a HSTS de lá para ter a mesma proteção
que o `.htaccess` dá.
