# ED Viz — Visualizador de Estruturas de Dados

Portal para **aprender estrutura de dados vendo o código executar**: você escreve (ou escolhe) um
código JavaScript e o portal mostra, passo a passo:

- **a estrutura gráfica** — pilha, fila, lista encadeada, árvore binária ou array;
- **a linha do código que está sendo executada** (destacada no editor);
- os **ponteiros** (`atual`, `no`, `raiz`, `inicio`…) etiquetados sobre os nós das estruturas (na
  árvore, o ponteiro é indicado pela **cor do nó**, sem texto);
- a **pilha de chamadas** (ótimo para enxergar a recursão da árvore);
- a **saída do `console.log`** ligada ao passo em que foi impressa.

Não precisa instalar nada: é uma aplicação estática (HTML/CSS/JS puro).

## Visual

- Tema escuro neutro com **tokens centralizados** em `css/styles.css` (`--bg-primary`, `--bg-surface`,
  `--border`, `--text-primary`, `--text-secondary`, `--accent`…); as três regiões são planas e separadas
  por divisórias de 1px, e o roxo (`#8957e5`) é a cor de **destaque**, usada só no botão de execução, na
  linha em execução, no elemento afetado pela operação e na timeline.
- O editor tem **abas de arquivo** (os exemplos abertos ficam em abas, com a ativa destacada), mantendo o
  **syntax highlighting do VS Code Dark+** (palavras-chave `#569cd6`, controle `#c586c0`,
  strings `#ce9178`, funções `#dcdcaa`, números `#b5cea8`, comentários `#6a9955`, tipos `#4ec9b0`), com
  números de linha, `▶` na margem e a linha em execução destacada de forma discreta.
- A área de visualização é uma **área de trabalho quase preta** com grid pontilhado sutil, muito espaço
  negativo e a estrutura centralizada. A estrutura pode ser **arrastada** (pan) e **ampliada com a roda
  do mouse** (zoom) — os controles no topo do painel mostram o zoom atual, permitem aumentar/diminuir,
  redefinir para 100% e ajustar à tela. O grid acompanha o pan/zoom.
- Pilha, fila, array, lista e árvore compartilham a mesma linguagem
  visual: superfícies escuras, borda de 1px, tipografia monoespaçada e destaque roxo no elemento ativo
  (topo da pilha, frente da fila, célula alterada, nó visitado/atual).
- A **fila** é desenhada na horizontal, com os nós lado a lado e índices discretos; os indicadores
  **FRONT** (primeiro a sair) e **REAR** (último a entrar) acompanham as posições reais a cada passo.
  Com um único elemento, os dois apontam para o mesmo nó; com a fila vazia, nenhum indicador aparece.
  `enqueue` entra pela extremidade REAR e `dequeue` sai pela FRONT (na variante `unshift/pop`, as
  extremidades se invertem).
- **Árvore binária limpa e contextual**: nós circulares, conexões finas e hierarquia raiz→filhos, sem
  rótulos permanentes de "esquerda/direita", sem indicadores fixos de filhos vazios e **sem etiquetas de
  texto sobre os nós**. O tamanho dos nós e o espaçamento entre níveis **se adaptam ao tamanho da
  árvore** — pequenas ganham nós e espaçamentos maiores, com layout centralizado e margens simétricas;
  grandes mantêm o tamanho legível e são navegadas por zoom/pan. O **nó da operação atual** recebe o
  realce principal (roxo forte), os **já visitados na mesma operação** ficam em roxo suave e os demais
  permanecem neutros; a **vaga da próxima inserção** aparece pontilhada por um instante e a conexão
  criada/alterada é destacada durante a etapa correspondente. As conexões são **curvas suaves com
  pontas pequenas** apontando do pai para o filho, e a **conexão percorrida no passo** fica roxa
  enquanto um indicador discreto percorre a curva na direção real do movimento. Durante as operações,
  uma **seta contextual** mostra a transição real do ponteiro ativo entre as etapas (a varredura da
  BFS, a descida da busca, a recursão dos percursos), o nó recém-inserido ganha um destaque sutil e
  nada é desenhado no estado neutro. O enquadramento se ajusta sozinho para manter a árvore visível e
  centralizada quando a estrutura muda de tamanho. (Na lista encadeada, os ponteiros continuam
  aparecendo como etiquetas.)
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

1. Escolha um exemplo no seletor (cada exemplo vira uma aba; clique na aba para trocar e no `×` para
   fechar) ou escreva seu próprio código no editor.
2. Clique em **Executar ▶** (ou `Ctrl+Enter`).
3. Navegue com **▶/❚❚**, os botões de passo, a **barra de progresso** ou o teclado:
   - `←` / `→` — passo anterior / próximo
   - `Espaço` — play/pause
   - `Home` / `End` — primeiro / último passo
   - `F10` — **modo debug** (passo a passo por tecla)
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

`←` volta uma linha · `Home`/`End` vão ao início/fim · `Esc` sai e libera o editor para edição.
Durante o debug o editor fica somente leitura, e a barra no topo da visualização mostra a dica e a
próxima linha. Se o programa terminar (ou parar em um erro), a barra avisa.

## Animações

A representação gráfica é animada para que a execução seja fácil de acompanhar:

- **Elementos deslizam** de uma posição para outra (técnica FLIP) — numa pilha, as caixas sobem/descem;
  numa fila, deslizam para a frente; numa troca do bubble sort, os valores passam um pelo outro;
- **O que entra aparece suavemente** (fade + deslocamento na direção certa) e **o que sai se despede**
  com um clone que desvanece — dá para ver exatamente *o que* saiu, de onde e para onde;
- **Na árvore**, os nós são interpolados quadro a quadro: a árvore "cresce" e se reorganiza sem saltos,
  as arestas são **curvas com ponta** que acompanham os nós, a conexão percorrida fica roxa com um
  indicador percorrendo a direção do movimento e a **vaga da inserção** aparece pontilhada por um
  instante; o nó da operação fica em **roxo forte** e os visitados na mesma operação em **roxo suave**,
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
| Lista encadeada | nós com `proximo`, ponteiro `atual` percorrendo |
| Árvore binária — percurso em-ordem | recursão + pilha de chamadas + ordem de visita |
| Árvore binária — busca iterativa | ponteiro `atual` descendo pela árvore |
| Árvore binária simples — inserção por nível | BFS preenchendo da esquerda para a direita + percursos pré/em/pós |
| Árvore binária simples — remoção com promoção | folha, um filho, dois filhos e raiz; descendentes preservados |
| Array — Bubble Sort | índices e células alteradas a cada troca |
| Array — Busca binária | descarte de metade do vetor a cada passo |

> **Árvore binária simples × de busca:** os dois exemplos "simples" não ordenam por valor — a
> inserção procura a primeira vaga livre em ordem de nível e a remoção promove os filhos segundo a
> regra determinística do código (nada de "menor à esquerda"). Os exemplos de percurso em-ordem e
> busca iterativa continuam sendo de uma árvore binária de busca, para comparar as duas.

## O que é detectado automaticamente

| Estrutura | Como é reconhecida |
|---|---|
| **Pilha** | variável/classe com nome `pilha`/`stack`, ou array com `push/pop` |
| **Fila** | nome `fila`/`queue`, ou array com `push/shift` (ou `unshift/pop`) |
| **Lista encadeada** | nós com `proximo`/`next`; início em `inicio`/`head` (ou classe `Lista*`) |
| **Árvore binária** | nós com `esquerda`/`direita` (ou `left/right`); raiz em `raiz`/`root` (ou classe `Arvore*`/`Tree*`) |
| **Array** | qualquer vetor comum |

Nós visitados por um ponteiro `atual`/`no`/`current` ficam destacados em **roxo** (o nó em foco usa o
realce principal; as visitas somem ao trocar de operação). O trace é gravado na ordem real de conclusão
dos comandos, então o passo a passo acompanha a execução sem "pulos" para trás.
Se a detecção automática não for ideal, use o seletor **Visualização** no painel da estrutura.

## Subconjunto de JavaScript suportado

É um interpretador **didático** (não é o motor do navegador). Suporta o que aparece em código de
estrutura de dados na faculdade:

- `let/const/var`, operadores, `if/else`, `while`, `do/while`, `for` clássico e `for...of`;
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
  `Array.isArray/from`, `Number`, `String`, `Boolean`, `parseInt`, `parseFloat`, `isNaN`, `typeof`.

**Não suportado:** herança de classes (`extends`), membros `static`/`get`/`set`/`async`,
`try/catch`, `async/await`, regex, generators, `switch`, `Map`/`Set`, módulos.

**Proteções:** limite de 20.000 passos e 150 chamadas aninhadas — se estourar, a mensagem avisa
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
binária simples (inserção por nível, busca, remoção com promoção, percursos, snapshots e explicação
contextual), recolhimento de painéis, os 12 exemplos e a renderização de todos os passos na interface.

## Ideias de evolução

- Novos visualizadores: grafo, tabela hash, `Map`/`Set`.
- Exportar o trace (JSON) e compartilhar um link com exemplo + passo.
- Modo "exercício": portal propõe um objetivo e verifica a estrutura final.

## Recado

O portal existe para **entender**, não para substituir a implementação. Escreva o código, errôneo
mesmo, rode, veja o passo a passo — e depois reimplemente do zero sem ele.
