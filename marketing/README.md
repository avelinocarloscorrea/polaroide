# Pasta de divulgação — Polaroide Studio

Peças para promover o **Polaroide Studio** nas redes (foco em Instagram).

Aqui **não há PNG pronto** — este ambiente não renderiza imagem. O que tem são
**mockups em HTML**, desenhados na medida certa, para você **abrir no navegador
e exportar como PNG**. Ficam pixel-a-pixel iguais ao que você vê.

```
marketing/
  README.md          este arquivo
  brand.md           cores, fontes e tom (referência rápida)
  PROMPTS.md         briefing / prompt para gerar stories e posts
  mockups/
    hero.html        a ferramenta em uso — folha A4 com 9 polaroides (imagem principal)
    nao-corta.html   grade 4×5 encaixada, com a margem de segurança à vista
    efeitos.html     fita, grampo, mini brad e percevejo, lado a lado
    celular.html     a interface de celular (abas Fotos/Folha/Estilo/Exportar)
    privado.html     selo "100% no seu navegador · nada é enviado"
  instagram/
    story-1.html     1080 × 1920 — story principal (hero + headline + CTA)
    story-2.html     1080 × 1920 — "monte · imprima · recorte"
    post-1.html      1080 × 1080 — post/capa de carrossel (hero)
    post-2.html      1080 × 1080 — slide de carrossel (efeitos)
```

## Como exportar um PNG (Chrome / Edge)

1. Abra o arquivo `.html` no navegador (duplo clique).
2. `F12` para abrir o DevTools → ícone de **celular/tablet** (Toggle device toolbar,
   `Ctrl+Shift+M`).
3. No topo, escolha **Responsive** e digite o tamanho exato:
   - stories: **1080 × 1920**
   - posts: **1080 × 1080**
   - mockups: use **1600 × 1000** (ou o que o arquivo indicar no comentário do topo).
   - deixe o zoom em **100%**.
4. `Ctrl+Shift+P` → digite **"Capture full size screenshot"** → Enter.
   Sai um PNG com exatamente aquela resolução.

> Firefox: `Shift+F2` → `screenshot --fullpage nome.png`, ou botão direito →
> "Fazer captura de tela".

## Como usar

- **Direto:** exporte `story-1`, `post-1` etc. e publique.
- **Com editor (Canva / Figma / Illustrator):** exporte os `mockups/` como PNG e
  monte os posts em cima do layout que preferir, usando `brand.md`.
- **Com IA de imagem/design:** cole o conteúdo de `PROMPTS.md` e anexe os PNGs
  dos `mockups/` como referência.

## Fontes

Os arquivos tentam carregar **Playfair Display**, **Caveat** e **Inter** do
Google Fonts. Sem internet, caem para fontes do sistema (o layout continua
válido, só o tipo muda). Para o resultado final, garanta que está online ao
exportar, ou substitua pelas fontes da marca no editor.
