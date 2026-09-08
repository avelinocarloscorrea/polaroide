# Polaroide Studio

Ferramenta de página única para montar polaroides numa folha e exportar pronto
para impressão — **PDF**, **PNG** ou impressão direta. Formatos reais (Polaroid,
Instax, 10×15…), marcas de corte, ajustes de foto por item e um indicador de
resolução que avisa se a foto vai sair borrada no tamanho escolhido.

Roda inteira no navegador: sem instalação, sem back-end e **sem enviar nada**.
As imagens e o projeto ficam só no navegador (IndexedDB); para backup ou levar
para outro computador, use **Salvar projeto** (`.json` com as imagens
embutidas).

## Estrutura

```
index.html           marcação
css/app.css          estilo
js/*.js              lógica — 9 scripts clássicos carregados em ordem
assets/
  favicon.svg
  playfair.woff2      fonte de marca (OFL)
.htaccess            blindagem da pasta (Apache / LiteSpeed)
docs/                arquitetura, segurança, desenvolvimento, deploy
```

Sem build, sem dependências. Abra `index.html` no navegador — funciona
inclusive por `file://` (mantenha `css/`, `js/` e `assets/` ao lado).

## Rodar local

```
python3 -m http.server 8000
# http://localhost:8000/
```

Servir por HTTP é útil para testar com a CSP vindo como cabeçalho (o
`.htaccess`), não só pela tag `<meta>`.

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
- [`docs/SEGURANCA.md`](docs/SEGURANCA.md)
- [`docs/DESENVOLVIMENTO.md`](docs/DESENVOLVIMENTO.md)
- [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Autor

Carlos Avelino Correa — <https://github.com/avelinocarloscorrea>

## Licença

[MIT](LICENSE).
