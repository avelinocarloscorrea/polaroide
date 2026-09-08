# Histórico

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
