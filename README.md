# ED Viz — Visualizador de Estruturas de Dados

Portal para **aprender estrutura de dados vendo o código executar**: você escreve (ou escolhe) um
código JavaScript e o portal mostra, passo a passo:

- **a estrutura gráfica** — pilha, fila, lista encadeada, árvore binária ou array;
- **a linha do código que está sendo executada** (destacada no editor);
- os **ponteiros** (`atual`, `no`, `raiz`, `inicio`…) etiquetados sobre os nós;
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
- O painel direito mostra **Comandos** (as operações `push/pop/shift…` da execução, clicáveis para pular
  ao passo), **Variáveis**, **Chamadas** e **Saída** — no estilo de painéis de debug.

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
   controles no topo do painel: `−`, `100%`, `+` e ajustar à tela).
5. No painel **Comandos**, clique em uma operação para pular ao passo em que ela aconteceu; no painel
   **Saída**, clique no `#passo` de uma linha para pular até ele.

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
  as arestas acompanham os nós, os **chips de ponteiro** (`atual`, `no`, `raiz`) deslizam de um nó para
  o outro conforme a recursão avança;
- A **duração das animações se adapta à velocidade** do play (mais curtas em 4×, mais longas em 0,5×).

## Exemplos incluídos

| Exemplo | O que demonstra |
|---|---|
| Pilha com array (push/pop) | LIFO, topo, eventos de push/pop |
| Pilha com classe | encapsulamento em `this.itens` |
| Fila com array (push/shift) | FIFO, frente/traseira |
| Lista encadeada | nós com `proximo`, ponteiro `atual` percorrendo |
| Árvore binária — percurso em-ordem | recursão + pilha de chamadas + ordem de visita |
| Árvore binária — busca iterativa | ponteiro `atual` descendo pela árvore |
| Array — Bubble Sort | índices e células alteradas a cada troca |
| Array — Busca binária | descarte de metade do vetor a cada passo |

## O que é detectado automaticamente

| Estrutura | Como é reconhecida |
|---|---|
| **Pilha** | variável/classe com nome `pilha`/`stack`, ou array com `push/pop` |
| **Fila** | nome `fila`/`queue`, ou array com `push/shift` (ou `unshift/pop`) |
| **Lista encadeada** | nós com `proximo`/`next`; início em `inicio`/`head` (ou classe `Lista*`) |
| **Árvore binária** | nós com `esquerda`/`direita` (ou `left/right`); raiz em `raiz`/`root` (ou classe `Arvore*`/`Tree*`) |
| **Array** | qualquer vetor comum |

Nós visitados por um ponteiro `atual`/`no`/`current` ganham número de **ordem de visita**.
Se a detecção automática não for ideal, use o seletor **Visualização** no painel da estrutura.

## Subconjunto de JavaScript suportado

É um interpretador **didático** (não é o motor do navegador). Suporta o que aparece em código de
estrutura de dados na faculdade:

- `let/const/var`, operadores, `if/else`, `while`, `do/while`, `for` clássico e `for...of`;
- `function`, recursão, `arrow functions`, `return`, `break`, `continue`;
- `class` com `constructor`, métodos e `this`, `new`;
- arrays, objetos, `Map`? (não) — arrays e objetos bastam;
- métodos de array: `push, pop, shift, unshift, splice, slice, concat, join, indexOf, lastIndexOf,
  includes, reverse, sort, forEach, map, filter, find, findIndex, reduce, some, every, fill`;
- métodos de string: `charAt, indexOf, includes, startsWith, endsWith, slice, substring, split,
  toUpperCase, toLowerCase, trim, repeat, padStart, padEnd, replace`…;
- `console.log/warn/error/info`, `Math.*`, `JSON.stringify/parse`, `Object.keys/values/entries`,
  `Array.isArray/from`, `Number`, `String`, `Boolean`, `parseInt`, `parseFloat`, `isNaN`, `typeof`.

**Não suportado:** herança de classes (`extends`), `try/catch`, `async/await`, regex, generators,
`switch`, `Map`/`Set`, módulos.

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

Os testes cobrem: precedência de operadores, classes/recursão, erros com linha correta, limites de
laço/recursão, identidade visual dos itens animados (chaves estáveis), os 8 exemplos e a renderização
de todos os passos na interface.

## Ideias de evolução

- Novos visualizadores: grafo, tabela hash, `Map`/`Set`.
- Exportar o trace (JSON) e compartilhar um link com exemplo + passo.
- Modo "exercício": portal propõe um objetivo e verifica a estrutura final.

## Recado

O portal existe para **entender**, não para substituir a implementação. Escreva o código, errôneo
mesmo, rode, veja o passo a passo — e depois reimplemente do zero sem ele.
