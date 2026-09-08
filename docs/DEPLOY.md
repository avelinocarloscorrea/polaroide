# Deploy

O projeto é um conjunto de arquivos estáticos. Serve em qualquer coisa que
entregue arquivo: Apache/LiteSpeed, Nginx, GitHub Pages, Netlify, etc.

## O que vai para o ar

Tudo o que está versionado, **menos** `docs/`, `README.md`, `CHANGELOG.md`,
`LICENSE` e `.git` — esses são só do repositório. Na prática:

```
public_html/            (ou o docroot do host)
    index.html
    .htaccess           só em Apache/LiteSpeed
    css/*.css            (base, layout, polaroid, effects, components, util, print)
    js/*.js              (9 arquivos)
    assets/
        favicon.svg
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
scp -P <porta> -r index.html .htaccess css js assets \
    <usuario>@<host>:<caminho-do-docroot>/

ssh -p <porta> <usuario>@<host> \
  'cd <caminho-do-docroot> && find . -type d -exec chmod 755 {} + && find . -type f -exec chmod 644 {} +'
```

## Conferir

```
BASE=https://<seu-dominio>

curl -sI $BASE/ | grep -i -e '^HTTP' -e content-security-policy \
  -e x-frame-options -e x-content-type-options -e strict-transport-security

curl -s -o /dev/null -w '%{http_code}\n' $BASE/.htaccess       # 403
curl -s -o /dev/null -w '%{http_code}\n' $BASE/qualquer.php    # 403 ou 404
curl -s -o /dev/null -w '%{http_code}\n' $BASE/js/config.js    # 200, text/javascript
```

O HTML servido não pode ter nenhuma URL externa além dos links `<a>` para o
GitHub:

```
curl -s $BASE/ | grep -oE 'https?://[^" )]+' | grep -v github.com
# (sem saída)
```

## `.htaccess`

O arquivo versionado (`.htaccess`, na raiz) já traz:

- `Options -Indexes` — sem listagem de diretório;
- `Require all denied` para `.php`, `.cgi`, `.sh`, etc. — nada executa;
- dotfiles e arquivos de fonte/backup (`.bak`, `.md`, `.map`, …) negados;
- todos os cabeçalhos de segurança (a mesma CSP do `<meta>`, mais
  `frame-ancestors`, HSTS, `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, COOP/CORP);
- `RewriteEngine Off`.

Tudo dentro de `<IfModule>` para não derrubar a pasta com erro 500 se algum
módulo não estiver presente. Sem `php_flag` (quebra no LiteSpeed).

## GitHub Pages / Netlify / etc.

`.htaccess` é ignorado; a CSP em `<meta>` continua valendo. Se o provedor
deixar configurar cabeçalhos (Netlify `_headers`, Cloudflare Rules…), replique
a CSP e o HSTS de lá para ter a mesma proteção que o `.htaccess` dá.
