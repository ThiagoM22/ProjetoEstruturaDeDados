---
name: ED Viz
description: Visualizador de Estruturas de Dados — um painel de instrumentos escuro para ver o próprio código executar
colors:
  amber: "#e5a66a"
  amber-hover: "#eeb781"
  amber-text: "#f0c494"
  amber-soft: "rgba(229, 166, 106, 0.12)"
  amber-fill: "rgba(229, 166, 106, 0.22)"
  amber-muted: "rgba(229, 166, 106, 0.38)"
  ink-on-amber: "#17191d"
  surface-canvas: "#131519"
  surface: "#17191d"
  surface-chrome: "#121418"
  surface-raised: "#1e2127"
  surface-hover: "#24272e"
  overlay-soft: "rgba(255, 255, 255, 0.04)"
  backdrop: "rgba(0, 0, 0, 0.60)"
  scrollbar-thumb: "#343941"
  scrollbar-thumb-hover: "#454b54"
  track: "#3a4048"
  border: "#2e3238"
  border-strong: "#383d44"
  text-primary: "#d6d8dc"
  text-secondary: "#8a8e96"
  text-muted: "#9196a0"
  danger: "#e5766d"
  danger-soft: "rgba(229, 118, 109, 0.10)"
  danger-border: "rgba(229, 118, 109, 0.35)"
  warn: "#ecd24c"
  warn-soft: "rgba(236, 210, 76, 0.08)"
  warn-border: "rgba(236, 210, 76, 0.40)"
  success: "#74b98f"
  code-comment: "#6a9955"
  code-string: "#ce9178"
  code-number: "#b5cea8"
  code-keyword: "#569cd6"
  code-control: "#c586c0"
  code-function: "#dcdcaa"
  code-variable: "#9cdcfe"
  code-type: "#4ec9b0"
  code-text: "#d4d4d4"
typography:
  title:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: "1.5"
    letterSpacing: "0.1px"
  control:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "1.5"
    letterSpacing: "0em"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0em"
  label:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "1.5"
    letterSpacing: "0.4px"
  code:
    fontFamily: "JetBrains Mono, Cascadia Code, Consolas, Fira Code, Courier New, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "22px"
    letterSpacing: "0em"
  code-small:
    fontFamily: "JetBrains Mono, Cascadia Code, Consolas, Fira Code, Courier New, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "0em"
  value:
    fontFamily: "JetBrains Mono, Cascadia Code, Consolas, Fira Code, Courier New, monospace"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "0em"
rounded:
  xs: "3px"
  sm: "4px"
  md: "6px"
spacing:
  sp-1: "4px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "24px"
  sp-6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink-on-amber}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-primary-hover:
    backgroundColor: "{colors.amber-hover}"
    textColor: "{colors.ink-on-amber}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  button-ghost-active:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-text}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    size: "30px"
  play-button:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.ink-on-amber}"
    rounded: "{rounded.md}"
    size: "34px"
  select:
    backgroundColor: "transparent"
    textColor: "{colors.text-secondary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "3px 26px 3px 8px"
    height: "28px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 4px"
    height: "26px"
  tab-active:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-text}"
  data-cell:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    typography: "{typography.value}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  data-cell-active:
    backgroundColor: "{colors.amber-fill}"
    textColor: "{colors.amber-text}"
  data-cell-visited:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-text}"
  list-node:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    typography: "{typography.value}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  tooltip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    typography: "{typography.code-small}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  step-chip:
    backgroundColor: "{colors.amber-soft}"
    textColor: "{colors.amber-text}"
    typography: "{typography.code-small}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
    height: "20px"
---

# Design System: ED Viz

## Overview

**Creative North Star: "O Painel de Instrumentos"**

O ED Viz se apresenta como um painel de instrumentos, não como uma página de marketing: uma superfície escura contínua em que editor, desenho e inspeção são mostradores do mesmo mecanismo. Nada decora; tudo lê. O âmbar não é a cor da marca em busca de atenção — é o ponteiro que indica onde a máquina está agora, e por isso aparece pouco. A calibragem é o estilo: hairline de 1px separando planos, raio que nunca passa de 6px, tipografia pequena e densa, monoespaçada em todo número que o aluno precisa conferir.

A atmosfera é didática e generosa, mas a generosidade é de explicação e legibilidade, não de ornamento. Os controles permanecem compactos e quietos, enquanto o palco do desenho recebe espaço, zoom e escala para o conteúdo não se perder. Quem estuda sozinho encontra densidade confortável; quem projeta em sala encontra contraste, hierarquia e um desenho que cresce para ser lido de longe.

Rejeições confirmadas: brinquedo educativo colorido, dashboard SaaS genérico e IDE neon. Não há gradientes, glassmorphism, glow, cards soltos, emojis nem uma cor por estrutura. A identidade vem da precisão dos detalhes e do contrato de que o desenho nunca mente sobre a execução.

**Key Characteristics:**
- Três mostradores contínuos (código, visualização, inspeção) entre duas barras fixas; nenhum card solto.
- Âmbar racionado como sinal de execução — botão Executar, play, linha atual, elemento afetado e timeline.
- Planos tonais separados por hairlines de 1px; sombra apenas em camadas que flutuam.
- Tipografia de 11 a 14px; a mono carrega todo dado, índice, passo e variável.
- Geometria contida (raio máximo de 6px), com círculos reservados aos nós da árvore.
- Palco rebaixado com grid pontilhado, pan/zoom e escala automática para estruturas curtas.
- Generosidade didática concentrada na faixa de explicação e na legibilidade do desenho.

## Colors

A paleta é a de um instrumento: grafite azulado frio ao fundo, âmbar quente racionado como leitura, e dois estados semânticos em uso que nunca competem com o sinal principal.

### Primary

- **Âmbar de Mostrador** (#e5a66a): o único acento cromático. Preenche o botão Executar e o play, desenha a barra de 2px da linha atual, a borda e o preenchimento do elemento afetado, o trecho percorrido da timeline e o anel de foco.
- **Âmbar Aceso** (#eeb781): estado hover do âmbar; nunca aparece em repouso.
- **Âmbar Claro** (#f0c494): texto e valores sobre preenchimentos âmbar suaves, onde o âmbar cheio não teria contraste.
- **Véus de Âmbar** (rgba(229, 166, 106, 0.12) / rgba(229, 166, 106, 0.22) / rgba(229, 166, 106, 0.38)): três passos com papéis fixos — 12% para "visitado" e seleção secundária, 22% para o elemento ativo, 38% para bordas e traços ativos.
- **Tinta sobre Âmbar** (#17191d): todo texto ou ícone dentro de uma superfície âmbar cheia.

**A Regra do Um Sinal.** O âmbar significa estado ativo e nada mais: execução (botão Executar, play, linha atual, elemento afetado, timeline) ou seleção corrente (aba ativa, anel de foco). Se um elemento não responde "onde estou agora", ele não pode ser âmbar. O contrato de execução está registrado no README e vale para qualquer tela futura.

### Neutral

- **Ardósia do Palco** (#131519): fundo da área de visualização, um tom abaixo dos painéis; cria o recesso onde o desenho acontece.
- **Grafite do Editor** (#17191d): superfície do editor e dos painéis; também é a tinta sobre âmbar.
- **Grafite das Molduras** (#121418): barras superior e inferior, status do editor e faixa de explicação.
- **Grafite Elevado** (#1e2127): células de dados, aba ativa do editor, popovers, tooltip e a lista de opções do select.
- **Grafite de Hover** (#24272e): resposta de hover em botões, abas, células e itens de lista.
- **Véu de Interface** (rgba(255, 255, 255, 0.04)): etiquetas HEAD/TAIL, chips de ponteiro e o marcador REAR sobre superfícies escuras.
- **Thumb de Scrollbar** (#343941) e **Thumb em Hover** (#454b54): scrollbars finas de 10px com trilho transparente.
- **Trilho** (#3a4048): parte não percorrida da barra de progresso.
- **Hairline** (#2e3238): divisória padrão de 1px entre painéis, cabeçalhos e regiões internas.
- **Hairline Reforçada** (#383d44): borda de controles, conexões de lista e limites que precisam de um passo a mais de presença.
- **Branco Fumê** (#d6d8dc): texto principal e valores; 12,3:1 sobre o grafite do editor.
- **Cinza de Apoio** (#8a8e96): títulos de painel, rótulos e texto secundário; 5,4:1 sobre o grafite.
- **Cinza de Metadados** (#9196a0): índices, contagens, dicas e metadados; 5,9:1 sobre o grafite. Apesar do nome, é um passo mais claro que o Cinza de Apoio — a diferença é de papel, não de hierarquia; não trate os dois como uma escala rígida.

### Semantic States

Não são cores de marca: só entram em cena quando há falha ou aviso real.

- **Coral de Erro** (#e5766d): mensagem de erro, banner, linha inválida no gutter, saída de erro no console; 6,0:1 sobre o grafite.
- **Coral Velado** (rgba(229, 118, 109, 0.10)) e **Coral de Contorno** (rgba(229, 118, 109, 0.35)): fundo e borda do banner de erro e do realce da linha inválida.
- **Amarelo de Aviso** (#ecd24c): ciclo detectado na lista e aviso no console; nunca usado como acento.
- **Amarelo Velado** (rgba(236, 210, 76, 0.08)) e **Amarelo de Contorno** (rgba(236, 210, 76, 0.40)): fundo e borda do indicador de ciclo, no mesmo papel dos véus de coral.
- **Verde Reservado** (#74b98f): definido no tema, sem uso atual na interface. Permanece reservado e não deve ser promovido a sinal sem uma decisão explícita.

**A Regra do Vermelho que Não Decora.** Coral e amarelo só podem descrever um problema real. Erro não é ênfase, e aviso não é destaque de seleção.

### Syntax

O editor usa a paleta do VS Code Dark+, deliberadamente não harmonizada com o âmbar: é vocabulário de código, não de interface. O texto base é **Texto de Código** (#d4d4d4); os oito tokens abaixo o substituem quando a sintaxe reconhece um trecho.

- **Verde de Comentário** (#6a9955), **Salmão de String** (#ce9178), **Verde de Número** (#b5cea8), **Azul de Palavra-chave** (#569cd6), **Roxo de Controle** (#c586c0), **Amarelo de Função** (#dcdcaa), **Azul de Variável** (#9cdcfe) e **Turquesa de Tipo** (#4ec9b0).

**A Regra do Código Contido.** Verde, azul, roxo e turquesa existem apenas dentro do editor. Nenhum deles pode vazar para chrome, botões, abas, gráficos ou estados da interface.

## Typography

**Display Font:** nenhuma. O maior texto do chrome tem 14px; a hierarquia vem de peso, cor e espaço, não de tamanho. As superfícies de conteúdo usam a escala de leitura descrita em [Content surfaces](#content-surfaces-home-e-guia).

**Body Font:** Inter (com Segoe UI, system-ui, Helvetica Neue, Arial, sans-serif).

**Label/Mono Font:** JetBrains Mono (com Cascadia Code, Consolas, Fira Code, Courier New, monospace).

**Character:** a sans é moldura; a mono é o instrumento. Rótulos, botões e explicações falam em sans discreta, enquanto todo valor que o aluno precisa conferir — código, célula, índice, passo, variável, saída — aparece em monoespaçada. A folha não declara `@font-face`: a face efetiva depende do sistema, e no Windows o par acaba sendo Segoe UI com Cascadia Code ou Consolas.

### Hierarchy

- **Title** (600, 13,5px, 1,5): nome da marca; o único texto que se aproxima de um título.
- **Control** (500, 12px, 1,5): botões, selects e títulos de painel; a voz padrão dos controles.
- **Body** (400, 13px, 1,5): base da interface e textos corridos; explicações usam 12px, estados vazios 12,5px/1,7 e o diálogo 12,5px/1,6.
- **Label** (500, 11px, 0,4px quando em caixa alta): abas, rótulos de canto do palco, títulos de escopo e metadados.
- **Code** (400, 13px/22px): editor, com 22px de linha para alinhar gutter, realce e textarea invisível.
- **Code Small** (400, 11,5px): números de linha, barra de status, variáveis, comandos e console.
- **Value** (600, 14px): valores dentro das estruturas; 13px nos nós da árvore.

**A Regra dos 14px.** Nenhum texto de chrome ultrapassa 14px. Se algo precisa de mais destaque, ganha peso, cor ou espaço — não tamanho. A exceção é o próprio desenho, que escala junto com a estrutura e o zoom.

**A Regra do Dado Monoespaçado.** Valor, índice, passo, variável, comando e saída são sempre mono. Explicação, rótulo e botão são sempre sans. Nunca use mono em parágrafos nem sans para um valor de estrutura.

## Layout

O produto é um shell de aplicação que ocupa a viewport, sem rolagem de página no desktop. A barra superior tem 44px; a área de trabalho é uma grade de três colunas na proporção 32 / 48 / 20, com duas divisórias de 5px que desenham uma hairline de 1px e oferecem área de arrasto. O editor nunca fica abaixo de 280px; o painel lateral, abaixo de 224px. A barra de transporte tem 44px; a faixa de explicação, 32px; o status do editor, 24px.

Dentro dos painéis, o ritmo é de 4px: cabeçalhos de 36px, linhas de dado de 44px, controles de 24 a 34px, padding horizontal de 12px. A densidade é intencional — três painéis precisam caber sem rolagem — e cada painel rola por conta própria.

O palco da visualização fica um tom abaixo dos painéis e recebe um grid pontilhado de 22px que acompanha o zoom. Estruturas curtas desenham até 1,4×, em degraus (o valor exato varia por estrutura); a partir daí mantêm o tamanho-base e são navegadas por pan/zoom, em vez de comprimidas. As scrollbars são finas, de 10px, com trilho transparente e thumb arredondado.

**A Regra da Sala de Aula.** O mesmo desenho serve ao monitor a 60cm e à projeção a vários metros: contraste alto, tipos grandes dentro da estrutura, nenhuma informação transmitida só por detalhe fino. Zoom e escala existem para isso, não como enfeite.

### Responsive

- Até 1100px, a grade vira coluna única — editor (mínimo 55vh), visualização (62vh) e painel lateral (40vh) — com transporte e faixa de explicação fixos no rodapé. No mesmo ponto, os rótulos da barra superior viram ícones (alvo de 28px) e o seletor de exemplo cai para 128px.
- Até 720px, o subtítulo e o separador da marca somem, os paddings caem para 8px e o seletor de exemplo encolhe.
- O modo retrato não ganha uma navegação nova: a versão empilhada mantém a mesma ordem de leitura.

### Content surfaces (home e guia)

As páginas de conteúdo são uma extensão de leitura do mesmo sistema, não uma segunda identidade. A largura máxima é 1120px (1072px de conteúdo com o padding de 24px) e o cabeçalho público tem 56px. A escala tipográfica é de leitura, não de chrome: h1 de 34–46px, h2 de seção de 19–22px, lead de 16–17px, corpo de 16px/1,65 e metadados em mono de 11–12,5px. **A Regra dos 14px vale para o chrome do aplicativo**; nas superfícies de conteúdo, a hierarquia usa o tamanho de leitura e continua sem fonte display. O corpo de 16px é a decisão de escala de leitura do guia: vale para toda a prosa e não é um desvio acidental da regra de chrome.

- O âmbar permanece racionado: botão principal do hero, item ativo da navegação e anel de foco. O chip **comece aqui** é neutro (hairline + véu de 4%), porque recomendação não é estado de execução.
- Listas de estruturas, passos e argumentos são separadas por hairline de 1px; não há cards.
- A prova do hero é uma captura real recortada em escala 1:1 (código legível e nó com valor legível), seguida da faixa de explicação do passo. As imagens usam AVIF/WebP com `srcset` 1x/2x; abaixo de 900px — o mesmo ponto em que o hero empilha — a direção de arte troca para um recorte vertical (código sobre desenho) em vez de encolher o desktop. O link para o passo exato fica na legenda como ação secundária.

## Elevation & Depth

O sistema é plano por padrão. Profundidade vem de dois recursos: o degrau tonal entre palco, painel, moldura e superfície elevada, e a hairline de 1px que separa cada região. Nenhum painel tem sombra ambiente, e nada flutua sem ser temporário.

A única exceção é a camada que realmente paira sobre o conteúdo: a lista do select, o diálogo de ajuda e o tooltip de variável. O palco é o inverso disso — em vez de subir, desce um tom e recebe o grid pontilhado, como uma mesa rebaixada sob a luz. O diálogo escurece o resto com um véu preto a 60% (`--backdrop`), reforçando que a camada é temporária.

### Shadow Vocabulary

- **Pop** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)`, token `--shadow-pop`): lista aberta do select e diálogo de ajuda.
- **Tooltip** (`box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45)`, token `--shadow-tip`): dica de valor de variável sobre o editor.

**A Regra do Plano Único.** Painel não flutua. Sombra é sinal de camada temporária; se o elemento é permanente, ele se separa por tom e borda.

## Shapes

A forma é retilínea e contida: raios de 3px (chips e teclas), 4px (botões, células, abas, nós de lista) e 6px (play, diálogo, popovers). Nada é pill, nada é bolha. Círculos aparecem só onde a forma é o significado: nós da árvore binária, pontos de origem das conexões da lista, thumb da timeline, ponto do modo debug e o terminador ∅.

O traço de estrutura fica entre 1 e 1,4px; 1,75px marca o contorno do nó ativo da árvore, e 2px aparece apenas como limite ativo (barra da linha atual, borda interna de posição no array). Tracejado não é um estilo: é um significado — vaga futura, nó ainda não ligado, posição fora do tamanho lógico ou buraco de `delete`. A geometria segue a estrutura: pilha vertical, fila horizontal, lista em corrente com setas de 30×14px e árvore hierárquica com conexões curvas.

Células de array são adjacentes, com margem de -1px para compartilhar a borda e formar uma faixa contínua; só as pontas recebem raio.

Duas exceções estreitas e desenhadas: o marcador ▶ do gutter tem 7px e os triângulos de 4px das etiquetas HEAD/TAIL são ponteiros, não texto corrido nem borda de card.

**A Regra do Traço Fino.** Traço fino descreve a estrutura; espessura maior marca o limite ativo. Borda grossa, sombra interna decorativa ou contorno duplo não têm lugar no desenho.

## Components

### Buttons

- **Shape:** retângulo de 4px, borda de 1px, altura de 24 a 30px conforme o contexto.
- **Primary:** preenchimento âmbar com tinta escura, 12px/500, padding de 4×10px (variante small: 3×8px, 11,5px). É o botão Executar; deve ser o único âmbar cheio da barra.
- **Hover / Focus:** hover para Âmbar Aceso; foco com outline de 1px âmbar, offset -1px. Nunca remova o anel de foco.
- **Ghost:** fundo transparente com borda hairline na barra superior, ou sem borda dentro dos painéis; texto secundário que vira primário no hover, com fundo Grafite de Hover. Quando alterna um estado (Código, Painéis, Depurar), o estado ativo usa véu de 12%, borda de 38% e texto Âmbar Claro.
- **Icon buttons:** 24px no zoom, 30px no transporte; ícones de 14px com traço 1,6, sem preenchimento, exceto o glifo de play.
- **Play:** 34px, âmbar cheio, raio de 6px, ícone mascarado de 13px; vira pausa durante a reprodução e cai para Grafite de Hover quando desabilitado.

### Tabs

- **Editor:** 36px de altura, 12px, separadas por hairline vertical; a ativa sobe para Grafite Elevado e ganha uma régua âmbar de 1px no topo. O botão de fechar (16px) só aparece no hover ou na aba ativa.
- **Painel lateral:** quatro botões segmentados de 26px, 11px/500, dividindo a largura; o ativo usa véu de 12%, borda de 38% e texto Âmbar Claro.

### Inputs / Fields

- **Select:** fundo transparente, borda hairline, raio de 4px, 12px, 28px de altura, chevron de 10px. Hover clareia a borda e o texto; o foco ganha contorno âmbar de 1px. Onde `appearance: base-select` existe, a lista abre em Grafite Elevado com raio de 6px e sombra Pop.
- **Select compacto:** sem borda, texto de metadados, fundo de hover ao interagir; é o seletor de exemplo no cabeçalho do editor.
- **Editor:** o campo visível é um `<pre>` com syntax highlighting; a `<textarea>` fica transparente por cima, com caret claro e seleção âmbar a 30%. Não estilize a textarea como um input comum.
- **Teclas:** `kbd` em mono de 10,5px/600, borda de 1px com base de 2px e raio de 3px.

### Cards / Containers

Não existem cards. Os contêineres são painéis contínuos de altura total, com cabeçalho de 36px, borda inferior de 1px e padding horizontal de 12px. "Cartões" só aparecem como células e nós dentro do desenho, e ali obedecem à linguagem da estrutura, não à de um dashboard.

### Data Cell (assinatura)

A célula é a unidade de pilha, fila e array: 44px de altura, fundo Grafite Elevado, borda hairline, raio de 4px, valor em mono 14px/600. Índice e etiquetas usam mono de 12px nas extremidades. O elemento ativo troca para véu de 22% com borda âmbar e texto Âmbar Claro; o visitado usa véu de 12%. No array, células adjacentes compartilham a borda; no estado ativo, a célula sobe para `z-index: 2` para a borda âmbar não ser cortada.

### Linked-List Node (assinatura)

O nó é uma caixa dividida em regiões: `PREV | VALUE | NEXT` na lista dupla, `VALUE | NEXT` na simples. O valor tem no mínimo 46px, mono 14px/600; a referência é mono 11px/600 em cinza, com um ponto de 5px que marca a origem da conexão. As setas de 30×14px saem da região NEXT (ou entram na PREV) e nunca são desenhadas dentro dela. Nó pendente é tracejado e transparente; visitado usa véu de 12%; ativo usa véu de 22% com borda âmbar. HEAD e TAIL são etiquetas de 10,5px ligadas ao nó por uma linha-guia de 1px.

### Step Explainer (assinatura)

Uma faixa de 32px entre o palco e o transporte, em Grafite das Molduras, com borda superior de 1px. À esquerda, um chip de operação (véu de 12%, borda de 38%, texto Âmbar Claro, raio de 3px, mono 12px/600); no centro, a explicação em sans de 12px que trunca com reticências; à direita, a contagem de passos em mono de 11px com números tabulares. É o único lugar em que a interface fala em frases completas.

### Navigation

A barra superior de 44px usa Grafite das Molduras e uma hairline inferior. À esquerda, o símbolo de árvore em âmbar (18px), o nome em 13,5px/600, um separador de 1px e o subtítulo em 12px secundário. À direita, ações em sequência: Executar, Depurar, seletor de estrutura, Código, Painéis e Como usar. Em telas de até 1100px, os rótulos somem e restam os ícones com `title` e `aria-label`.

### Dialog

O diálogo de ajuda tem no máximo 620px de largura, altura máxima de `100vh - 32px` com rolagem interna, fundo Grafite do Editor, borda reforçada, raio de 6px, sombra Pop e padding de 24px. O backdrop é preto a 60%. Abre com foco no título (que nomeia o diálogo via `aria-labelledby`) e mantém o título visível no topo da rolagem. Título em 14px, seções em 12px, corpo em 12,5px/1,6. É a única superfície com parágrafos longos e a única em que o texto pode ocupar mais de 75 caracteres por linha.

## Do's and Don'ts

### Do:

- **Do** reserve o âmbar para execução e estado ativo: botão Executar, play, linha atual, elemento afetado, timeline, aba ativa e anel de foco.
- **Do** use mono em todo valor, índice, passo, variável e linha de console; sans fica para explicação e chrome.
- **Do** separe painéis com hairline de 1px e degrau tonal; sombra só em select aberto, diálogo e tooltip.
- **Do** mantenha o chrome entre 11 e 14px e crie hierarquia com peso, cor e espaço.
- **Do** use tracejado para ausência, vaga futura, nó pendente e posição fora do tamanho lógico.
- **Do** preserve o anel de foco de 1px âmbar e a regra de `prefers-reduced-motion`.
- **Do** deixe o palco respirar: o vazio é o palco do desenho, não um lugar para preencher com cards ou ilustrações.
- **Do** escale estruturas curtas (até 1,4×) antes de recorrer ao zoom; o desenho deve preencher o palco sem se comprimir.
- **Do** escreva em português didático e direto, inclusive nos erros; a voz faz parte da marca.

### Don't:

- **Don't** use âmbar como decoração, ícone genérico, borda de card ou fundo de seção.
- **Don't** introduza gradientes, glassmorphism, glow, neon, scanlines ou sombra ambiente em painéis.
- **Don't** colore estruturas ou estados com cores novas; fora do âmbar existem só erro, aviso e o verde reservado.
- **Don't** leve verde, azul, roxo ou turquesa da sintaxe para fora do editor.
- **Don't** arredonde acima de 6px nem crie pills; círculos só para nós da árvore, thumb e ponto de status.
- **Don't** transforme o painel lateral em dashboard de cards, métricas grandes ou gráficos decorativos.
- **Don't** esconda a linha atual atrás de animação; o destaque é imediato e derivado do passo real.
- **Don't** adicione rótulos permanentes de "esquerda/direita" sobre os nós da árvore; a cor carrega o ponteiro.
- **Don't** invente modo claro, tema alternativo ou uma segunda cor de acento sem uma decisão explícita de produto.
