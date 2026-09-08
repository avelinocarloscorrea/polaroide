# Desenvolvimento

## Estrutura

```
index.html     marcação
css/app.css    estilo
js/*.js        lógica (9 arquivos, carregados em ordem) — ver ARQUITETURA.md
assets/        favicon.svg, playfair.woff2
```

## Rodar

Não tem build. Abra `index.html` no navegador:

```
xdg-open index.html          # Linux
explorer.exe index.html      # WSL/Windows
```

Funciona por `file://` porque os `js/*.js` são scripts clássicos (não
módulos). Para testar com a CSP vindo como cabeçalho (o `.htaccess`), sirva
a pasta:

```
python3 -m http.server 8000
# http://localhost:8000/
```

## Editar

- Estilo: `css/app.css`.
- Lógica: `js/*.js`. Cada arquivo é uma seção; a ordem no `index.html`
  importa (`config` primeiro, `events` por último). Não há `import`/`export`.
- Ícones: objeto `ICONS` em `js/config.js` (SVG 24×24, só o miolo do `<svg>`).
  Um `data-i="nome"` em qualquer elemento vira o ícone no `init()`.
- Ao mover código entre arquivos: nada no topo de um arquivo pode usar algo
  definido num arquivo posterior (funções chamadas em runtime tudo bem).

## Convenções

- Português nos comentários e nas mensagens de UI.
- Sem dependências. Sem `fetch`. Sem recurso baixado da internet.
- Um `<script>` só, clássico (não módulo) — senão quebra em `file://`.
- Toda entrada externa (arquivo, projeto, clipboard) passa por `bakeImage()` /
  `migrateSettings()` / `normPhoto()`. Ao criar campo novo, estenda essas
  funções (ver `SEGURANCA.md`).
- `render()` reconstrói o DOM das folhas; ajuste ao vivo usa `livePhoto()`.
- Mudou o `<meta>` da CSP? Atualize também o `.htaccess`.

## Checklist antes de publicar

- [ ] `index.html` abre por `file://` sem erro no console
- [ ] adicionar / arrastar / colar foto
- [ ] arrastar para enquadrar, sliders de cor, girar 90°, espelhar
- [ ] reordenar (⠿), duplicar, trocar, remover, desfazer/refazer
- [ ] trocar formato/papel/colunas; "preencher colunas"
- [ ] seletor de cor: amostra + "Personalizada…"
- [ ] painéis `[` `]`, tela cheia `.` / `Esc`
- [ ] Exportar PDF (várias folhas) e PNG; imprimir
- [ ] Salvar projeto → recarregar página → Abrir projeto
- [ ] recarregar com fotos: elas voltam (IndexedDB)
- [ ] menu Privacidade → "Apagar todos os dados"
- [ ] `git diff` sem lixo; nenhuma chamada de rede na aba Network

## Publicar

Ver `DEPLOY.md`. Em resumo: subir `index.html`, `css/`, `js/`, `assets/` e
`.htaccess` para o docroot e conferir os cabeçalhos com `curl -I`.
