# Histórico

## 0.22 — interface redesenhada e impressão com prévia
- **Interface nova**: etapas Modelo → Fotos → Imprimir, abas (Fotos, Polaroide,
  Folha, Estilo, Modelos), faixa com todas as fotos, galeria inicial com a
  folha de verdade em miniatura; escolher um modelo já abre as fotos.
- **Imprimir e baixar**: prévia de cada folha, papel/orientação, guia de corte
  (marcas, contorno, os dois ou nenhum), qualidade e verificação — com botão
  para completar a última folha repetindo fotos.
- Fonte da interface Arimo, igual às outras ferramentas.

## 0.21 — tela inicial com assistente de montagem
- Além dos modelos prontos já existentes, a tela inicial (sem fotos ainda)
  ganhou um assistente de 3 passos curtos pra quem prefere montar do zero:
  formato do polaroide → grade da folha → efeito/legenda — cada passo já
  mostra a miniatura real com as escolhas acumuladas até ali (`js/wizard.js`).
- Correção: o link "Mais ferramentas" apontava para o endereço antigo da
  página de ferramentas (o redirecionamento ainda funcionava, mas indireto);
  agora aponta direto para o endereço atual.
- Preparação interna: os módulos de datas/feriados, construtor de blocos por
  arrastar, estimativa de encadernação e editor de foto — usados por Planner
  Studio e Calendar Studio — passaram a ser copiados também para
  `vendor/core/` deste projeto pelo processo de build do monorepo. Ainda não
  são usados aqui; nenhuma mudança de comportamento pra quem usa a ferramenta.

## 0.20 — celular: marcar ≠ editar, e sem mexer na foto sem querer
- Tocar numa foto **não abre mais** a folha de edição sozinha. Aparece uma
  **barra da foto** embaixo (legenda + botão **Ajustar**) e o quadro fica
  todo à vista.
- **Ajustar** abre uma folha **curta** (± meia tela); a foto marcada rola
  para a faixa de cima e continua visível enquanto se mexe nos controles.
- **Enquadrar** (arrastar dentro da moldura) só vale com a folha Ajustar
  aberta. Fora dela, o dedo na foto **rola a folha** — nunca reposiciona a
  imagem por acidente. Toque simples ainda marca a foto.
- Arrastar a folha Ajustar pra baixo só a fecha; a foto segue marcada.

## 0.19 — celular reconstruído
- A interface de celular foi refeita numa **grade** (`#mroot`: barra / corpo /
  abas). O quadro de trabalho e o painel da foto agora são **movidos** para
  dentro dela — não há mais duas cópias dos controles a dessincronizar.
- O gesto de **arrastar pra baixo** passou a viver só na barrinha (pega) no
  topo de cada folha. Antes o gesto cobria o painel inteiro e tropeçava nos
  sliders, nos steppers e na rolagem.
- Tocar numa foto abre a folha de edição; tocar fora (ou desmarcar) fecha.
- Código dividido: `css/mobile.css` → `css/m-shell.css` + `m-panels.css` +
  `m-sheet.css`; `js/mobile.js` → `js/m-core.js` + `m-panels.js` +
  `m-sheet.js` + `m-install.js`. O desktop não muda.

## 0.18 — instalar como app e gestos no celular
- **Instalar na tela de início** (PWA): `manifest.webmanifest` + `assets/icon.svg`.
  Menu <kbd>⋯</kbd> → “Instalar na tela de início” (Android/Chrome mostra na
  hora; iPhone via Compartilhar). Sem service worker — a CSP só ganhou
  `manifest-src 'self'`.
- **Arrastar pra baixo fecha** no celular: a edição da foto, o menu <kbd>⋯</kbd>
  e as abas Folha/Estilo/Exportar. Segue o dedo; solta passando do limite.
  Pega (barra) visível no topo de cada painel.
- A folha de edição da foto ficou um pouco menor (mais foto à vista).

## 0.17 — tela inicial enxuta e “Novo projeto”
- A tela inicial (sem fotos) perdeu o cartão: agora é só o logo, o botão
  **Adicionar fotos** e os templates como pílulas de texto (a descrição
  aparece ao passar o mouse). Mais limpa.
- Menu <kbd>⋯</kbd> → **Novo projeto**: descarta fotos e ajustes e volta ao
  padrão (com confirmação).
- Textos de ajuda encurtados nos painéis "Modelos de folha" e "Folha e grade".

## 0.16 — interface dedicada de celular
- Em telas ≤ 820 px a casca de desktop (barra + painel esquerdo) dá lugar a
  uma **interface própria** com quatro abas na base: **Fotos** (o quadro +
  botão “+”), **Folha** (papel, orientação, colunas × linhas com −/+, margem),
  **Estilo** (formato, borda, legenda, efeito, cores, corte) e **Exportar**
  (PDF/PNG/Imprimir, resolução, salvar/abrir).
- Tocar numa foto abre a edição (enquadramento, cor, **legenda** num campo
  próprio, ordem) numa folha que sobe pela base.
- Mesmo motor por baixo: os controles gravam em `state.settings` e chamam
  `render()`. O desktop não muda.
- `css/mobile.css` + `js/mobile.js`.

## 0.15 — CSP limpa e mais correções de mobile
- **CSP enxuta**: só as diretivas que diferem de `default-src 'none'`.
  Removidos `connect-src`/`object-src`/`manifest-src` com `'none'` — eram
  redundantes (herdam de `default-src`) e geravam avisos no console
  (“'none' alongside other sources”). A proteção é a mesma. Ajustado no
  `<meta>`, no `.htaccess` e na guia.
- Diálogo de Privacidade explica: se um antivírus injeta script na página
  (ex.: Kaspersky), o navegador recusa aqui e mostra aviso — é a proteção
  funcionando.
- `viewport-fit=cover` — respeita as bordas de telas com notch.
- Campos dos painéis com `font-size:16px` no celular — acaba o zoom
  automático do iOS ao focar um campo.
- Alturas em `dvh` (`#app`, painéis, menu) — corrige conteúdo cortado pela
  barra de endereço do Safari.
- Tela inicial rola quando não cabe (sem corte no topo).
- Exportar PNG movido para o menu <kbd>⋯</kbd>; barra esconde PNG/Imprimir
  em telas bem estreitas.

## 0.14 — celular mais fácil e sem tropeços
- Os painéis no celular agora **sobem pela base da tela** (folha) em vez de
  gaveta lateral — a foto que você está editando continua visível em cima.
- **Tocar numa foto** abre o painel de edição e rola o quadro para mostrá-la
  acima do painel.
- **Toque duplo** numa área vazia do quadro: ajusta à tela; de novo, aproxima 2×.
- Pinça de zoom mais estável (`touch-action` no quadro — o zoom do navegador
  não briga mais).
- Alvos de toque maiores nos painéis (sliders, botões, selects, cor).
- **Imprimir** e **Exportar PDF** também no menu <kbd>⋯</kbd>; a barra some o
  botão de imprimir em telas bem estreitas.
- Aviso (toast) vai para o topo no celular; margens de tela (notch)
  respeitadas.

## 0.13 — foco em impressão: grade que nunca corta
- Removido tudo de rede social (Story/Post/Reels, escala de imagem, dpi
  social). Só papel: A4, Carta, A3, A5.
- **Encaixar as fotos na folha** (ligado por padrão): informe
  **Colunas × Linhas** por folha (1–12 cada) e o tamanho do polaroide é
  calculado para caber exatinho na área imprimível. Trava dura: nunca passa
  da folha; se pedir demais, reduz a grade e avisa na barra de status
  (“limitado pela folha”).
- **Margem de segurança** nunca abaixo de 5 mm (impressora não chega na
  borda), com linha tracejada na tela que some na impressão/exportação.
- **Legenda vazia = faixa em branco**, sem texto de exemplo — igual sai
  impresso.
- Templates e Modelos de folha refeitos só para impressão, todos já
  encaixando na folha.

## 0.12 — template ≠ modelo de folha
- **Template** (tela inicial): configuração completa e pronta (formato +
  folha + efeito + cores + legenda). Agora numa lista compacta de linhas com
  miniatura pequena — acabou o cartão gigante antes de escolher as fotos.
  6 opções: Recordações, Scrapbook, Minimalista, Cartela Instax, Story, Post.
- **Modelos de folha** (painel esquerdo): mexem só no desenho da folha
  (papel, grade, margens, corte) e mantêm cores, efeitos, legenda e o
  formato do polaroide. 8 opções (A4 automático, 2 colunas, apertado,
  deitado, A3, Story, Post, Retrato).
- Nenhum dos dois apaga ou move as fotos já adicionadas.

## 0.11 — acrílico estável, menus no celular e modelos prontos
- Vidro acrílico com desfoque e opacidade **constantes** (85% + blur 16) —
  não muda mais ao rolar/dar zoom, acabou o efeito de "piscar" translúcido.
- **Celular**: a barra de ferramentas quebra em linhas em vez de rolar na
  horizontal (nenhum botão some); o menu ⋯ vira uma folha na base da tela;
  o fundo escurecido cobre também o menu; a pinça de dois dedos dispensa os
  botões +/- em telas estreitas.
- **Modelos prontos**: 8 pontos de partida (Polaroid clássico, Mural com
  fita, Scrapbook, Cartela Instax, 10×15, Grade minimalista, Story, Post),
  com miniatura, escolhíveis no estado vazio (antes de carregar as fotos) e
  numa seção do painel esquerdo. Aplicar um modelo não mexe nas fotos.

## 0.10 — mais efeitos, recorte no card e uso no celular
- Novos efeitos de canto: **mini brad** (fixador de papel, cabecinha metálica
  com fenda) e **percevejo** (fixar a foto, cabeça em cúpula com sombra).
- Todo efeito agora é **recortado no contorno do card** (`.decorclip` na tela,
  `clip` no canvas): nada passa da borda do polaroide. Peças também recuam
  ~1,5 mm para dentro da foto.
- **Uso no celular**: em telas até 820 px os painéis viram gavetas que
  deslizam sobre o quadro, com fundo escurecido (toque fora fecha); só uma
  aberta por vez. Barra compacta com os controles de painel fixos à direita.
- **Pinça de dois dedos** dá zoom no ponto tocado; arrastar a foto na moldura
  não rola mais a folha sem querer (`touch-action`).

## 0.9 — efeitos no card, vidro acrílico e formatos de rede social
- Fita e **grampo** agora ficam colados nos cantos da **foto**, dentro do card
  (antes a fita ficava nas pontas do polaroide, para fora). Vale na tela,
  no PDF/PNG e na impressão.
- **Vidro acrílico**: barra, painéis e menus translúcidos com desfoque; o
  quadro de trabalho passa por trás. Enquanto rola/arrasta/dá zoom o desfoque
  cai sozinho para não pesar. Liga/desliga em *Exportação e interface*;
  respeita "menos transparência" do sistema.
- Novos tamanhos de folha para **rede social** (Story/Reels 1080×1920, post
  quadrado, retrato e paisagem). A exportação sai no pixel exato do formato,
  com escala 1× / 2× / 3×.
- **Fundo em degradê** (duas cores + ângulo) — bom para stories.
- CSS dividido em `css/*.css` por assunto (base, layout, polaroid, effects,
  components, util, print).

## 0.8 — legenda, fontes e efeitos
- Legenda virou `<textarea>` — acabou o bug de cursor/caret ao digitar.
- Fonte de marca (Playfair) estava com caminho quebrado desde a divisão em
  `css/` — corrigido.
- 3 fontes de legenda servidas de `assets/fonts/` (Caveat, Special Elite,
  Permanent Marker), só baixam quando escolhidas; mais pilhas de sistema.
- Estilos prontos de legenda; caixa alta, espaçamento entre letras, sombra.
- Efeito **fita adesiva** nos cantos do polaroide (tela e exportação).
- Botões dos painéis não cortam mais o texto (quebram em vez de clipar);
  barra da ferramenta sem barra de rolagem visível.

## 0.7 — acabamento
- "Esmeralda Paper" de volta como subtítulo no cabeçalho.
- Barra de rolagem própria nos painéis/menus/diálogos: fina, no tom do tema,
  invisível até rolar ou passar o mouse (`.scrl` + `is-scrolling`).
- O quadro de trabalho não tem mais barra de rolagem (rola por roda/arraste).
- `Ctrl` + roda do mouse (ou pinça no trackpad) = zoom no ponto do cursor;
  arrastar com o botão do meio = deslocar a vista.
- Link do acervo movido para o rodapé da barra lateral, junto do aviso
  "Privado" (o rodapé fixo da ferramenta foi removido).

## 0.6 — organização
- `app.js` dividido em `js/*.js` (9 arquivos por assunto, carregados em
  ordem); CSS para `css/app.css`.
- CSP mais fechada: `style-src 'self'` (sem `'unsafe-inline'`); nenhum
  `<style>` ou `style=` na página. O `@page` da impressão vira folha
  construída em JS.
- Rodapé com link para o acervo; travas de overscroll nos painéis e diálogos.

## 0.5 — repositório público
- Projeto separado em `index.html` + `app.js`; fonte e favicon movidos para
  `assets/` (antes eram data-URI). `font-src` e `img-src` só `'self'`.
- Removida a opção de fontes manuscritas online — nenhuma URL `http(s)` no
  código, nenhuma chamada de rede em nenhum caminho.
- Sem nenhuma referência a infraestrutura ou domínio no código.
- `LICENSE` (MIT), documentação revisada.

## 0.4 — interface
- Identidade visual própria (verde/papel, Playfair Display, ícones desenhados).
- Painéis ocultáveis (`[` `]`) e modo tela cheia (`.`).
- Código dividido para usar `script-src 'self'` (nenhum script inline).
- Seletor de cor próprio: amostras + "Personalizada…".
- Toda imagem (inclusive de projeto `.json`) é redesenhada e limpa;
  `migrateSettings`/`normPhoto` validam tudo que chega; legenda só texto puro.

## 0.3 — profissional
- Originais em alta resolução no IndexedDB, prévia leve na tela.
- Formatos reais (Polaroid, Instax, 10×15), marcas de corte / contorno do card.
- Indicador de DPI por foto.
- Exportar PDF e PNG pelo próprio programa (canvas + PDF escrito à mão).
- Desfazer/refazer, atalhos, ajustes de cor por foto (predefinições +
  sliders + vinheta).

## 0.2 — publicação
- Publicado como site estático isolado.
- `.htaccess` com CSP, sem PHP, sem listagem, cabeçalhos de segurança.
- Removidas as chamadas de rede; CSP `connect-src 'none'`.

## 0.1 — primeira versão
- Grade de polaroides em folha A4, arrastar para enquadrar, legenda,
  impressão, salvar/abrir projeto. Arquivo único.
