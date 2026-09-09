# Desenvolvimento

## Estrutura

```
index.html     marcação — #app (desktop) + #mroot (celular)
guia.html      guia do usuário (página à parte)
css/*.css      estilo, dividido por assunto — ver ARQUITETURA.md
js/*.js        lógica (10 arquivos, carregados em ordem) — ver ARQUITETURA.md
assets/        favicon.svg, playfair.woff2, fonts/*.woff2
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

Testar celular: abra o DevTools no modo dispositivo (largura ≤ 820 px) ou
acesse pelo IP da máquina do próprio telefone.

## Editar

- Estilo: `css/*.css` por assunto. Os `css/m-*.css` carregam por último e
  ganham nos empates — **toda** regra de celular (≤ 820 px) mora neles
  (`m-shell` = casca, `m-panels` = abas, `m-sheet` = folhas de baixo).
- Lógica: `js/*.js`. Cada arquivo é uma seção; a ordem no `index.html`
  importa (`config` primeiro, os `m-*` depois de `ui`, `events` por último).
  Não há `import`/`export`.
- Ícones: objeto `ICONS` em `js/config.js` (SVG 24×24, só o miolo do `<svg>`).
  Um `data-i="nome"` em qualquer elemento vira o ícone no `init()`.
- Controle novo no painel: adicione o `#id` no `index.html`, leia/escreva
  `state.settings` num handler em `bindAll()` (`js/ui.js`), reflita em
  `syncControls()`, e **valide** o campo em `migrateSettings()`
  (`js/state.js`). Se ele também deve aparecer no celular, espelhe em
  `js/m-panels.js` (`mBindPanels()` + `mSync()`).
- Ao mover código entre arquivos: nada no topo de um arquivo pode usar algo
  definido num arquivo posterior (funções chamadas em runtime tudo bem).

## Convenções

- Português nos comentários e nas mensagens de UI.
- Sem dependências. Sem `fetch`. Sem recurso baixado da internet.
- Scripts clássicos (não módulo) — senão quebra em `file://`.
- Toda entrada externa (arquivo, projeto, clipboard) passa por `bakeImage()` /
  `migrateSettings()` / `normPhoto()`. Ao criar campo novo, estenda essas
  funções (ver `SEGURANCA.md`).
- `render()` reconstrói o DOM das folhas; ajuste ao vivo usa `livePhoto()`.
- Encaixe na folha nunca corta: mexeu em `geom()`/`layout()`? confira que
  `cols*polW + gaps ≤ printW` e o equivalente na altura.
- Mudou o `<meta>` da CSP? Atualize também o `.htaccess`.
- Guia: `guia.html` + `css/guia.css` (sem JS; CSP própria, também sem inline).

## Checklist antes de publicar

**Desktop**

- [ ] `index.html` abre por `file://` sem erro no console
- [ ] adicionar / arrastar / colar foto
- [ ] arrastar para enquadrar, sliders de cor, girar 90°, espelhar, centrar
- [ ] reordenar (⠿), duplicar, trocar, remover, desfazer/refazer
- [ ] trocar formato/papel; colunas × linhas com "encaixar" ligado e desligado
- [ ] margem nunca abaixo de 5 mm; nada de polaroide cortado/fora da folha
- [ ] legenda vazia = faixa em branco; digitar legenda sem bug de cursor
- [ ] efeitos (fita/grampo/brad/percevejo) na tela e no PDF, dentro do card
- [ ] templates (tela inicial) e modelos de folha (painel)
- [ ] seletor de cor: amostra + "Personalizada…"
- [ ] painéis `[` `]`, tela cheia `.` / `Esc`, vidro acrílico liga/desliga
- [ ] Exportar PDF (várias folhas) e PNG; imprimir
- [ ] Salvar projeto → recarregar → Abrir projeto
- [ ] recarregar com fotos: elas voltam (IndexedDB)
- [ ] menu Privacidade → "Apagar todos os dados"

**Celular (largura ≤ 820 px)**

- [ ] as 4 abas trocam; a de Fotos mostra o quadro + FAB "+"
- [ ] Folha: papel, orientação, colunas/linhas (−/+), margem
- [ ] Estilo: formato, borda, legenda, efeito, cores, corte
- [ ] tocar numa foto abre a edição; campo de legenda funciona
- [ ] Exportar: PDF/PNG/Imprimir; Salvar/Abrir
- [ ] pinça = zoom; toque duplo no vazio = ajustar/2×
- [ ] sem zoom automático do iOS ao focar um campo

**Geral**

- [ ] `git diff` sem lixo; nenhuma chamada de rede na aba Network
- [ ] console sem aviso de CSP (fora antivírus que injeta script)

## Publicar

Ver `DEPLOY.md`. Em resumo: subir `index.html`, `guia.html`, `css/`, `js/`,
`assets/` e `.htaccess` para o docroot e conferir os cabeçalhos com `curl -I`.
