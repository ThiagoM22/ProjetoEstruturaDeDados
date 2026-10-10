# ED Viz — Visualizador de Estruturas de Dados

Portal para **aprender estrutura de dados vendo o código executar**: você escreve (ou escolhe) um
código JavaScript e o portal mostra, passo a passo:

- **a estrutura gráfica** — pilha, fila, lista encadeada, árvore binária ou array com tamanho manual;
- **a linha do código que está sendo executada** (destacada no editor);
- os **ponteiros** (`atual`, `no`, `raiz`, `inicio`…) etiquetados sobre os nós das estruturas (na
  árvore, o ponteiro é indicado pela **cor do nó**, sem texto);
- a **pilha de chamadas** (ótimo para enxergar a recursão da árvore);
- o **valor de uma variável sob o mouse** — segure o mouse sobre o nome no editor e um balão mostra o valor dela no passo atual (da função, `this` ou global); vale também para **campos de objetos e nós** (`node.value`, `node.left.value`, `this.#root`), resolvidos no objeto real daquele passo;
- a **saída do `console.log`** ligada ao passo em que foi impressa.

Não precisa instalar nada: é uma aplicação estática (HTML/CSS/JS puro).

## Visual

- Tema escuro neutro com **tokens centralizados** em `css/styles.css` (`--bg-primary`, `--bg-surface`,
  `--border`, `--text-primary`, `--text-secondary`, `--accent`…); as três regiões são planas e separadas
  por divisórias de 1px, e o roxo (`#8957e5`) é a cor de **destaque**, usada só no botão de execução, na
  linha em execução, no elemento afetado pela operação e na timeline.
- Os **seletores** (estrutura, exemplo e velocidade) abrem a lista no mesmo padrão do tema — superfície
  elevada, borda de 1px, raio de 6px, sombra, itens com hover discreto e o item atual em roxo suave;
  em navegadores que ainda não suportam a lista customizável do `<select>`, a lista nativa continua
  funcionando como antes.
- O editor tem **abas de arquivo** (os exemplos abertos ficam em abas, com a ativa destacada; feche pelo
  `×` ou com o **clique do meio do mouse**), mantendo o
  **syntax highlighting do VS Code Dark+** (palavras-chave `#569cd6`, controle `#c586c0`,
  strings `#ce9178`, funções `#dcdcaa`, números `#b5cea8`, comentários `#6a9955`, tipos `#4ec9b0`), com
  números de linha, `▶` na margem e a linha em execução destacada de forma discreta.
- A área de visualização é uma **área de trabalho quase preta** com grid pontilhado sutil, muito espaço
  negativo e a estrutura centralizada. A estrutura pode ser **arrastada** (pan) e **ampliada com a roda
  do mouse** (zoom) — os controles no topo do painel mostram o zoom atual, permitem aumentar/diminuir,
  redefinir para 100% e ajustar à tela. O grid acompanha o pan/zoom.
- Pilha, fila, lista, array e árvore compartilham a mesma linguagem
  visual: superfícies escuras, borda de 1px, tipografia monoespaçada e destaque roxo no elemento ativo
  (topo da pilha, frente da fila, célula alterada, nó visitado/atual).
- A **fila** é desenhada na horizontal, com os nós lado a lado e índices discretos; os indicadores
  **FRONT** (primeiro a sair) e **REAR** (último a entrar) acompanham as posições reais a cada passo.
  Com um único elemento, os dois apontam para o mesmo nó; com a fila vazia, nenhum indicador aparece.
  `enqueue` entra pela extremidade REAR e `dequeue` sai pela FRONT (na variante `unshift/pop`, as
  extremidades se invertem). Numa fila com índices (`#inicio`/`#fim`), o desenho mostra **só a janela
  viva**: FRONT é o `#inicio`, REAR é `#fim - 1`, os `[i]` são as posições reais no array e os buracos
  deixados pelo `delete` ficam fora do desenho.
- **Árvore binária limpa e contextual**: nós circulares, conexões finas e hierarquia raiz→filhos, sem
  rótulos permanentes de "esquerda/direita", sem indicadores fixos de filhos vazios e **sem etiquetas de
  texto sobre os nós**. O tamanho dos nós e o espaçamento entre níveis **se adaptam ao tamanho da
  árvore** — pequenas ganham nós e espaçamentos maiores, com layout centralizado e margens simétricas;
  grandes mantêm o tamanho legível e são navegadas por zoom/pan. O **nó da operação atual** recebe o
  realce principal (roxo forte), os **já visitados na mesma operação** ficam em roxo suave e os demais
  permanecem neutros; a **vaga da próxima inserção** aparece pontilhada por um instante e a conexão
  criada/alterada é destacada durante a etapa correspondente. As conexões são **curvas S discretas com
  pontas pequenas** apontando do pai para o filho — a curva se inclina na direção do filho, sem o platô
  horizontal nem o gancho vertical que apareciam quando o filho estava muito ao lado — a **conexão
  criada/alterada é revelada progressivamente** do pai ao filho e a **conexão percorrida no passo** fica
  roxa enquanto um indicador discreto percorre a curva na direção real do movimento (uma única ponta
  visível por etapa). Durante as operações,
  uma **seta contextual** mostra a transição real do ponteiro ativo entre as etapas (a varredura da
  BFS, a descida da busca, a recursão dos percursos), o nó recém-inserido ganha um destaque sutil e
  nada é desenhado no estado neutro. O enquadramento se ajusta sozinho para manter a árvore visível e
  centralizada quando a estrutura muda de tamanho.
- **Lista simplesmente encadeada**: cada nó é uma caixa dividida em **VALUE** (o valor, com mais
  destaque) e **NEXT** (a referência); a conexão parte da região NEXT e aponta para o próximo nó —
  a seta nunca é desenhada dentro da região. **HEAD** é uma etiqueta discreta sobre o primeiro nó —
  ligada à borda superior dele por uma linha-guia fina, com um leve toque roxo — e
  o fim da corrente é marcado por um indicador compacto **∅** (sem virar um nó, sem contar no
  tamanho e preservando a referência real — `undefined`/`null` — no título); na lista vazia, o
  diagrama mostra `HEAD → ∅`. O nó em exame fica em **roxo forte**, os já visitados na
  operação em **roxo suave**, e a **referência alterada** e o **HEAD que mudou de nó** ficam em
  destaque naquela etapa. Um nó recém-criado que ainda não foi ligado aparece **tracejado, "fora da
  lista"**, até a ligação acontecer (o NEXT dele também acende na atribuição); a conexão que o
  cursor `current` percorre fica ativa, como a seta contextual da árvore. As etiquetas de ponteiro
  continuam aparecendo sobre os nós, e o tamanho dos nós e o espaçamento **se adaptam à quantidade
  de nós**: listas curtas desenham maiores e listas longas mantêm o tamanho-base, navegadas por
  zoom/pan (sem comprimir os nós).
- **Lista duplamente encadeada**: cada nó é uma caixa com três regiões — **PREV | VALUE | NEXT** —
  e entre cada par de nós há **duas pistas de setas**: a de cima é a ida (`next` de A para B) e a
  de baixo é a volta (`prev` de B para A), em duas linhas paralelas com as hastes alinhadas no
  mesmo eixo (sem setas cruzadas nem sobrepostas). **HEAD** e **TAIL** marcam as
  extremidades — cada etiqueta ligada ao seu nó por uma linha-guia fina, com um
  leve toque roxo — e as pontas nulas viram o indicador compacto **∅** (no início, para `head.prev`, e
  no fim, para `tail.next`); na lista vazia, o diagrama mostra `HEAD → ∅ ← TAIL`. O nó em exame
  fica em **roxo forte**, os já visitados em **roxo suave**, e a **referência alterada** (prev ou
  next) e o **HEAD/TAIL que mudou de nó** ficam em destaque naquela etapa; o percurso reverso
  acende a seta de volta conforme o cursor `current` desce pelo `prev`. Continua valendo tudo da
  lista simples: nó recém-criado tracejado fora da lista, tamanho/espaçamento adaptativos e
  navegação por zoom/pan.
- **Array com tamanho manual (MeuArray)**: cada posição é uma célula retangular
  adjacente com o **índice** numa faixa própria acima (o índice nunca desliza) e o **valor** dentro
  da célula; o array interno (`#items`) e o tamanho lógico (`#tamanho`) são desenhados como coisas
  distintas — a legenda mostra `tamanho = N` e, quando o array interno ainda guarda posições
  apagadas, `#items.length = M` com as posições fora do tamanho em células tracejadas. O `delete`
  vira uma célula vazia (buraco), nunca confundida com um `undefined` armazenado. Na busca, as
  posições já examinadas ficam em **roxo suave** e a encontrada em **roxo forte**; nos deslocamentos
  do `inserirEm`/`removerPorIndice`, o valor **desliza** de uma célula para a vizinha (FLIP) com uma
  etiqueta discreta `← valor de [i]` (ou `valor de [i] →`) na célula que recebe, e as operações de
  escrita/leitura destacam exatamente a posição citada na linha que está executando.
- Uma **faixa de explicação** logo acima dos controles de execução mostra a operação atual
  (**Inserção**, **Busca**, **Percurso em ordem**…), uma frase curta sobre o que aconteceu ou vai
  acontecer (ex.: *"A busca por níveis encontrou a primeira posição disponível: o filho direito do nó
  A."*) e o passo atual — sempre a partir do estado real da execução.
- O painel direito organiza **Comandos**, **Variáveis**, **Chamadas** e **Saída** em **abas** (sem
  competir com o canvas); na barra superior, **Código** e **Painéis** recolhem o editor e o painel
  lateral para dar à visualização o máximo de espaço útil.

## Como abrir

- **Opção 1 (mais simples):** dê um duplo clique em `index.html` — funciona direto, sem servidor.
- **Opção 2 (servidor local na porta 8787):** dê um duplo clique em `iniciar.cmd` (sobe o servidor e
  abre o navegador), ou pelo terminal:

  ```bash
  npm start                # http://localhost:8787
  node servidor.js         # idem
  node servidor.js 9000    # trocar a porta (padrão: 8787, fora da 3000 de propósito)
  ```

  e abra `http://localhost:8787/`.

## Como usar

1. Escolha um exemplo no seletor (cada exemplo vira uma aba; clique na aba para trocar, no `×` ou com o
   **clique do meio do mouse** — a roda — para fechar) ou escreva seu próprio código no editor.
2. Clique em **Executar ▶** (ou `Ctrl+Enter`) — a execução roda e **começa a tocar** do primeiro
   passo; pause com `Espaço` ou no **▶/❚❚** quando quiser examinar um passo com calma.
3. Navegue com **▶/❚❚**, os botões de passo, a **barra de progresso** ou o teclado:
   - `←` / `→` — passo anterior / próximo
   - `Espaço` — play/pause
   - `Home` / `End` — primeiro / último passo
   - `F10` — **modo debug** (passo a passo por tecla)

   Durante a execução, **segure o mouse sobre uma variável** no editor: um balão mostra nome, escopo e o valor dela naquele passo (o mesmo que o painel Variáveis exibe). Segure sobre um campo de objeto (ex.: `node.value`) e o balão mostra o valor **do campo no objeto apontado pela variável** naquele passo — mesmo que exista uma variável de mesmo nome em escopo.
4. Na visualização, **arraste** para mover o desenho e use a **roda do mouse** para dar zoom (ou os
   controles no topo do painel: `−`, `100%`, `+` e ajustar à tela). A faixa acima dos controles explica
   a operação do passo atual (nome da operação + o que aconteceu/acontecerá).
5. No painel **Comandos**, clique em uma operação para pular ao passo em que ela aconteceu; no painel
   **Saída**, clique no `#passo` de uma linha para pular até ele.
6. Precisando de mais espaço, use **Código** e **Painéis** na barra superior para recolher o editor e o
   painel lateral; as abas **Comandos / Variáveis / Chamadas / Saída** mostram cada bloco de depuração
   quando você precisar.

## Modo debug (passo a passo com tecla)

Clique em **🐞 Depurar** (ou `F10`): o código executa até a primeira linha e **espera você pressionar
qualquer tecla** para executar a próxima — como um debugger. A cada tecla:

- a linha atual é destacada no código (com um `▶` na margem);
- a pilha/fila/lista/árvore é atualizada na hora, com as animações;
- os painéis de variáveis, chamadas e saída acompanham em tempo real.

Segurar o mouse sobre uma variável (ou sobre um campo, como `node.value` ou `this.#root`) mostra o valor no passo em que a execução está — útil para
acompanhar parâmetros e variáveis locais junto com a pilha de chamadas.

`←` volta uma linha · `Home`/`End` vão ao início/fim · `Esc` sai e libera o editor para edição.
Durante o debug o editor fica somente leitura, e a barra no topo da visualização mostra a dica e a
próxima linha. Se o programa terminar (ou parar em um erro), a barra avisa.

## Animações

A representação gráfica é animada para que a execução seja fácil de acompanhar:

- **Elementos deslizam** de uma posição para outra (técnica FLIP) — numa pilha, as caixas sobem/descem;
  numa fila, deslizam para a frente; numa lista, acompanham a troca de HEAD quando um nó entra no início;
  numa troca do bubble sort, os valores passam um pelo outro;
- **O que entra aparece suavemente** (fade + deslocamento na direção certa) e **o que sai se despede**
  com um clone que desvanece — dá para ver exatamente *o que* saiu, de onde e para onde;
- **Na árvore**, os nós são interpolados quadro a quadro: a árvore "cresce" e se reorganiza sem saltos,
  as arestas são **curvas S com ponta** que acompanham os nós e se inclinam na direção do filho, a
  conexão criada/alterada é **revelada progressivamente** (a ponta avança com o traçado), a conexão
  percorrida fica roxa com um indicador percorrendo a direção do movimento e a **vaga da inserção**
  aparece pontilhada por um instante; as conexões que a remoção vai refazer ficam **tracejadas** por
  um passo; o nó da operação fica em **roxo forte** e os visitados na mesma operação em **roxo suave**,
  sem etiquetas de texto sobre os nós (os ponteiros continuam visíveis como etiquetas na lista
  encadeada);
- A **duração das animações se adapta à velocidade** do play (mais curtas em 4×, mais longas em 0,5×).

## Exemplos incluídos

| Exemplo | O que demonstra |
|---|---|
| Pilha com array (push/pop) | LIFO, topo, eventos de push/pop |
| Pilha com classe | encapsulamento em `this.itens` |
| Fila com array (push/shift) | FIFO, indicadores FRONT/REAR |
| Fila com classe | API `enfileirar`/`desenfileirar`/`frente`/`estaVazia`/`tamanho` |
| Fila com campos privados (#) | `#itens` encapsulado de verdade + campo arrow |
| Fila com índices (#inicio/#fim) | fila sem `shift`: FRONT/REAR seguem a janela viva `[#inicio, #fim)` e os buracos do `delete` ficam fora do desenho |
| Lista encadeada | nós com `proximo`, ponteiro `atual` percorrendo |
| Lista simplesmente encadeada (classe) | `insertAtBeginning`/`insertAtEnd`/`removeByValue`/`find`/`size`/`isEmpty`/`toString`; nó VALUE/NEXT, HEAD e terminador |
| Lista duplamente encadeada (classe) | `append`/`prepend`/`removeFirst`/`removeLast`/`insertAt`/`removeAt`/`indexOf`/`transverse`/`transverseReverse`/`size`/`isEmpty`/`toString`; nó PREV/VALUE/NEXT, HEAD/TAIL e setas nos dois sentidos |
| Array com tamanho manual (MeuArray) | `adicionar`/`editar`/`remover`/`obterElemento`/`obterIndice`/`tamanhoArray`/`limpar`/`toString`/`itemsDuplicados`/`inserirEm`/`removerPorIndice`/`removerPorValor`; `#items`/`#tamanho`, deslocamentos manuais de trás para frente, buracos do `delete` e posições fora do tamanho |
| Árvore binária — percurso em-ordem | recursão + pilha de chamadas + ordem de visita |
| Árvore binária — busca iterativa | ponteiro `atual` descendo pela árvore |
| Árvore binária de busca (BST) — inserção, busca e percursos | regra menor→esquerda / maior-ou-igual→direita, busca `true/false`, raiz privada `#root` e percursos em/pré/pós |
| Árvore binária de busca (BST) — remoção | folha, um filho, dois filhos (sucessor = menor da direita), raiz, duplicados e árvore vazia |
| Árvore binária simples — inserção por nível | BFS preenchendo da esquerda para a direita + percursos pré/em/pós |
| Árvore binária simples — remoção com promoção | folha, um filho, dois filhos e raiz; descendentes preservados |

> **Árvore binária simples × de busca:** os dois exemplos "simples" não ordenam por valor — a
> inserção procura a primeira vaga livre em ordem de nível e a remoção promove os filhos segundo a
> regra determinística do código (nada de "menor à esquerda"). Os exemplos de percurso em-ordem,
> busca iterativa e os dois `arvore-bst` são árvores binárias de busca (raiz privada `#root`),
> para comparar as duas.

## O que é detectado automaticamente

| Estrutura | Como é reconhecida |
|---|---|
| **Pilha** | variável/classe com nome `pilha`/`stack`, ou array com `push/pop` |
| **Fila** | nome `fila`/`queue`, array com `push/shift` (ou `unshift/pop`) ou classe com array interno e índices `#inicio`/`#fim` |
| **Lista encadeada** | nós com `proximo`/`next`; início em `inicio`/`head` (inclusive `#head`, ou classe `Lista*`/`LinkedList`). Com campo `prev`/`anterior` nos nós (ou `#tail` no wrapper), a lista é desenhada como dupla |
| **Árvore binária** | nós com `esquerda`/`direita` (ou `left/right`); raiz em `raiz`/`root` (inclusive `#root`/`#raiz`, ou classe `Arvore*`/`Tree*`) |
| **Array com tamanho manual** | objeto com array interno (`#items`, `items`, `itens`…) e tamanho numérico (`#tamanho`, `tamanho`, `size`, `length`), como a classe `MeuArray`; o wrapper é a identidade da estrutura (sobrevive ao `limpar()`, que troca o array interno) |

Nós visitados por um ponteiro `atual`/`no`/`current` ficam destacados em **roxo** (o nó em foco usa o
realce principal; as visitas somem ao trocar de operação). O trace é gravado na ordem real de conclusão
dos comandos, então o passo a passo acompanha a execução sem "pulos" para trás.
Se a detecção automática não for ideal, use o seletor **Visualização** no painel da estrutura.

## Subconjunto de JavaScript suportado

É um interpretador **didático** (não é o motor do navegador). Suporta o que aparece em código de
estrutura de dados na faculdade:

- `let/const/var`, operadores, `if/else`, `while`, `do/while`, `for` clássico e `for...of` —
  o `const` não pode ser reatribuído e cada iteração do `for` com `let/const` tem a sua própria
  variável (closures capturam o valor da iteração), como no JS real;
- `function`, recursão, `arrow functions`, `return`, `break`, `continue`;
- `class` com `constructor`, métodos, campos de instância (inclusive `#privados`, acessíveis só
  dentro da classe que os declara) e `this`, `new`;
- operador `delete` (apaga propriedades e índices de array, deixando buraco — como no JS real);
- arrays, objetos, `Map`? (não) — arrays e objetos bastam;
- métodos de array: `push, pop, shift, unshift, splice, slice, concat, join, indexOf, lastIndexOf,
  includes, reverse, sort, forEach, map, filter, find, findIndex, reduce, some, every, fill`;
- métodos de string: `charAt, indexOf, includes, startsWith, endsWith, slice, substring, split,
  toUpperCase, toLowerCase, trim, repeat, padStart, padEnd, replace`…;
- `console.log/warn/error/info`, `Math.*`, `JSON.stringify/parse`, `Object.keys/values/entries`,
  `Array.isArray/from`, `Number` (inclusive `Number.isNaN/isInteger/isFinite/parseInt/parseFloat`),
  `String`, `Boolean`, `parseInt`, `parseFloat`, `isNaN`, `typeof`.

**Não suportado:** herança de classes (`extends`), membros `static`/`get`/`set`/`async`,
parâmetros com valor padrão (`function f(x = 1)`), `try/catch`, `async/await`, regex, generators,
`switch`, `for...in`, desestruturação, `**`, `??`, `?.`, spread/rest (`...`), `Map`/`Set`, módulos.
Esses casos (e `new Array(...)`) falham com uma mensagem explícita de "não é suportado" — o
visualizador avisa o que não faz em vez de acusar uma variável inexistente.

**Proteções:** limite de 20.000 passos e 500 chamadas aninhadas — se estourar, a mensagem avisa
(provavelmente há laço ou recursão sem fim).

## Estrutura do projeto

```
index.html            página do portal
iniciar.cmd           atalho Windows: sobe o servidor (8787) e abre o navegador
servidor.js           servidor local sem dependências (porta padrão 8787)
css/styles.css        tema escuro
js/util.js            utilitários e formatação de valores
js/tokenizer.js       tokenizador do subconjunto de JS
js/parser.js          parser (AST com número de linha em cada nó)
js/interpreter.js     interpretador + trace (passos, eventos, ponteiros)
js/examples.js        exemplos prontos
js/anim.js            animação FLIP (movimentos, entradas e saídas)
js/views.js           detecção de estruturas + renderização (SVG/HTML animado)
js/app.js             editor, playback e painéis
tests/run-tests.js    testes do núcleo (parser/interpretador/exemplos/animação)
tests/run-ui-smoke.js testes de integração da interface (DOM simulado)
```

## Testes

```bash
npm test
# ou
node tests/run-tests.js
node tests/run-ui-smoke.js
```

Os testes cobrem: precedência de operadores, classes/campos privados/recursão, erros com linha
correta, limites de laço/recursão, identidade visual dos itens animados (chaves estáveis), a árvore
binária de busca (inserção/busca/percursos, remoção nos três casos, duplicados, raiz privada `#root`
e explicações), a árvore binária simples (inserção por nível, busca, remoção com promoção,
percursos, snapshots e explicação contextual), a lista simplesmente encadeada (operações, tamanho
após cada operação, terminador, remoção de duplicados, render VALUE/NEXT/HEAD, destaques e
explicação), a lista duplamente encadeada (operações com prev/next, invariantes de `head`/`tail`/
`length`, setas nos dois sentidos, TAIL, percurso reverso e serialização sem truncamento), o array
com tamanho manual (detecção do wrapper, `#items` × `#tamanho`, escrita fora do tamanho,
deslocamentos do `inserirEm`/`removerPorIndice`, busca com posições examinadas, buracos do `delete`
distintos de `undefined`, `itemsDuplicados`, `limpar` sobrevivendo à troca do array interno e
histórico estável),
recolhimento de painéis, a dica de variável do editor (hover, inclusive de campos como `node.value`,
cadeias e `this.#campo`), os 16 exemplos e a renderização de todos os passos na interface.

## Ideias de evolução

- Novos visualizadores: grafo, tabela hash, `Map`/`Set`.
- Exportar o trace (JSON) e compartilhar um link com exemplo + passo.
- Modo "exercício": portal propõe um objetivo e verifica a estrutura final.

## Recado

O portal existe para **entender**, não para substituir a implementação. Escreva o código, errôneo
mesmo, rode, veja o passo a passo — e depois reimplemente do zero sem ele.
