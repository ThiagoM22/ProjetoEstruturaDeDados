# ED Viz — como tudo foi feito

**Guia de estudo do projeto, escrito para você entender cada mecanismo por dentro e
reconstruir algo igual sozinho, sem IA.**

Este documento não é o README. O README diz *o que o site faz*; aqui está *como cada
peça funciona, por que foi feita assim e em que ordem você deve reconstruí-la*.

> **Como usar este documento**
>
> 1. Leia a seção 0–2 para entender o princípio central e o contrato de dados (o
>    "esqueleto" que sustenta tudo).
> 2. Estude as seções 3–6 **sempre abrindo o arquivo correspondente** — o texto aponta
>    o arquivo e a função; siga o código junto.
> 3. A seção 10 é o roteiro de reconstrução, em fases, cada uma com um critério de
>    "pronto" verificável. **Não pule fases.**
> 4. As seções 11–13 mapeiam conceitos de ciência da computação para o código e
>    propõem exercícios. Este é o coração do estudo: fazer, errar e comparar.
>
> **Mapa de arquivos (para acompanhar)**
>
> | Arquivo | ~linhas | Papel |
> |---|---|---|
> | `index.html` | 230 | estrutura da página, ícones SVG, diálogo de ajuda, ordem dos scripts |
> | `css/styles.css` | 1 600 | tema escuro com tokens, layout em grade, linguagem visual das estruturas |
> | `js/util.js` | 180 | formatação de valores serializados, resolução de expressão sob o mouse |
> | `js/tokenizer.js` | 230 | texto → tokens com número de linha |
> | `js/parser.js` | 700 | tokens → AST com número de linha |
> | `js/interpreter.js` | 1 600 | AST → execução + **trace** (os "passos") |
> | `js/examples.js` | 1 700 | os 16 exemplos prontos (só dados) |
> | `js/anim.js` | 155 | animação FLIP para estruturas em DOM |
> | `js/rough.js` | 110 | traço "à mão" determinístico (hoje carregado mas não usado — veja §12) |
> | `js/views.js` | 3 400 | detecção de estruturas, seleção, comandos, explicações e renderizadores |
> | `js/app.js` | 1 500 | editor, playback, painéis, canvas, teclado, persistência |
> | `tests/` | 5 500 | testes de núcleo (Node), UI simulada e e2e (Playwright) |
> | `servidor.js` | 99 | servidor local estático, sem dependências |

---

## 0. O produto em uma página

O ED Viz é um editor de JavaScript em que a pessoa escreve um algoritmo de estrutura
de dados e acompanha a execução **passo a passo**: a linha que executa fica destacada,
a pilha/fila/lista/árvore/array é redesenhada a cada passo, os ponteiros aparecem sobre
os nós e uma faixa explica o que aconteceu.

**O princípio que define todo o resto:** o código do usuário **não é simulado nem
instrumentado**. Ele é *interpretado de verdade* por um interpretador próprio e, a cada
comando concluído, o interpretador **congela um passo** com todo o estado da execução
(linha, escopos, ponteiros, pilha de chamadas, eventos, saída de console). A interface
é, do começo ao fim, uma **máquina de estados que desenha o passo atual**.

As consequências desse princípio explicam quase toda a arquitetura:

| Consequência | Efeito prático |
|---|---|
| O trace é gravado uma vez, por inteiro, antes de qualquer desenho | Voltar e avançar é só trocar de índice — não existe "desfazer" |
| O desenho é função pura de `(passo, seleção, contexto)` | O mesmo passo rende o mesmo desenho; zoom, resize e re-render não corrompem nada |
| A explicação é derivada comparando passos (`anterior` / `próximo`) | Nada de texto roteirizado por exemplo; funciona em código novo |
| O interpretador controla o que existe (subset didático) | Erros com mensagem clara, limites de laço/recursão, sem `eval` |
| O site é estático (sem build, sem backend) | Publicar é copiar arquivos; o código do usuário fica no `localStorage` |

**Restrições de projeto que valem a pena copiar** (elas forçaram as boas decisões):
site estático que abre com duplo clique em `index.html`; zero dependências em runtime;
zero build/transpilação; tudo em português (incluindo mensagens de erro); o visual não
mente sobre a execução (nada é animado "de mentirinha" — toda animação é derivada de
estado real).

> **Nota de fidelidade:** o tema usa **âmbar `#e5a66a`** como cor de destaque (veja
> `--accent` em `css/styles.css`) — este guia descreve o código como ele está, não
> descrições antigas.

---

## 1. Arquitetura: o pipeline

Tudo é um pipeline de dados com uma fronteira bem definida: **o trace**.

```
  textarea (código do usuário)
        │  DSV.interpret(source)
        ▼
  ┌───────────┐   ┌────────┐   ┌──────────────────────┐
  │ tokenizer │ → │ parser │ → │ interpreter          │
  └───────────┘   └────────┘   │  (executa e grava    │
                               │   um passo por vez)  │
                               └──────────┬───────────┘
                                          ▼
                          trace = { steps[], output[], error }
                                          │
        ┌─────────────────────────────────┼──────────────────────────────┐
        │            ANÁLISE (funções puras, só leitura do trace)         │
        │  buildOpsMap(steps)              → eventos por objeto           │
        │  detectStructures(step, opsMap)  → candidatos com pontuação     │
        │  traceCandidates(steps, opsMap)  → opções do seletor            │
        │  computeVisitOrder(steps)        → visitas por "época"          │
        │  buildCommands(steps, source)    → lista de operações           │
        │  explainStep(step, sel, opts)    → operação + frase             │
        └─────────────────────────────────┬──────────────────────────────┘
                                          │  goto(i) escolhe um passo
                                          ▼
        renderStructure(container, sel, step, ctx)   +   4 painéis laterais
                                          │
                                          ▼
              animações (FLIP · tween em RAF · Web Animations API)
```

**Regra de ouro:** nada abaixo da linha do trace altera a execução. Todos os módulos de
análise e desenho são **funções puras** sobre o trace (o `app.js` guarda só a "memória"
de interface: índice atual, seleção, velocidade). Se você entendeu essa frase, entendeu
a arquitetura.

**Por que a ordem de carregamento dos scripts importa:** todos os módulos são IIFEs que
penduram tudo em um único namespace global `window.DSV`:

```js
(function (global) {
  'use strict';
  var DSV = (global.DSV = global.DSV || {});
  // ... define DSV.algumaCoisa ...
})(typeof window !== 'undefined' ? window : globalThis);
```

Isso dá três benefícios: funciona no navegador e no Node (os testes carregam os mesmos
arquivos); não precisa de módulos/build; e o namespace único torna o pipeline inteiro
inspecionável no console (`DSV.interpret(...)`, `DSV.detectStructures(...)`).

---

## 2. O contrato de dados (desenhe isto antes de codar)

A parte mais importante do projeto não é código, é o **formato do trace**. Todo o resto
depende dele. Estude estes formatos até conseguir desenhá-los no papel.

### 2.1 Um passo (`step`)

```js
{
  i: 42,                    // índice canônico no trace (reindexado no fim)
  line: 7,                  // linha do código que está "concluída" neste passo
  kind: 'stmt',
  globals: { pilha: {...}, v: {...} },   // escopo global serializado
  locals:  { x: {...}, atual: {...} },   // escopo local atual (função/bloco)
  thisVal: {...} | null,                 // this serializado (quando há)
  pointers: { '17': ['atual', 'no.proximo'] },  // id do objeto → rótulos visíveis
  stack: [ { name: 'inserir', line: 22 }, ... ], // pilha de chamadas (do fundo p/ o topo)
  events: [ { type: 'push', targetId: 6, values: [10], text: 'push(10)' } ]
}
```

E o resultado completo da execução:

```js
trace = {
  steps: Step[],                                  // ordem canônica de reprodução
  output: [ { step: 12, kind: 'log', text: '...' } ], // console.log ligado ao passo
  error: { message, line, name } | null            // erro de parse ou de execução
}
```

### 2.2 Um valor serializado (`sv`)

O passo **não guarda objetos vivos** — guarda uma cópia serializada. Isso é o que
permite "voltar no tempo" sem esforço e o que impede que a UI mexa na execução.

```js
{ t: 'p', v: 10 }                    // primitivo (number/string/boolean/null/undefined)
{ t: 'a', id: 6, items: [ ... ] }    // array (posição apagada: { t:'p', hole:true })
{ t: 'o', id: 17, ctor: 'No', props: { valor: {...}, proximo: {...}, '#head': {...} } }
{ t: 'fn', name: 'inserir' }         // função
{ t: 'c', name: 'Lista' }            // classe
{ t: 'ref', id: 17 }                 // referência de volta (ciclo ou repetição)
{ t: 'trunc', n: 200 }               // orçamento de serialização estourou
```

Dois detalhes que parecem pequenos e são decisivos:

- **`id`**: todo array/objeto criado pelo interpretador ganha um `__id` numérico
  não-enumerável (`defineId`). É a identidade do objeto — usada por `pointers`, pela
  detecção de estruturas, pelas chaves de animação e pela função que reencontra "a mesma"
  árvore entre passos.
- **Campos privados viram `#nome`** nos `props` (lidos do mapa interno `__priv`). O
  visualizador mostra `#items`, `#tamanho`, `#root` como qualquer campo.

### 2.3 Ponteiros, eventos e saída

- **`pointers`** é o mapa *objeto → nomes das variáveis que apontam para ele*. É o que
  desenha `atual`, `no`, `raiz` sobre os nós. A coleta percorre os valores serializados
  do passo (profundidade ≤ 4, até 30 filhos por objeto, no máximo 8 rótulos por id) e
  registra o caminho (`lista.proximo`, `no[0]`...).
- **`events`** são fatos de operação emitidos na hora em que acontecem:
  `push/pop/shift/unshift/splice` (arrays, com `targetId` e texto formatado) e as
  entradas de `console`. Eles alimentam os comandos da estrutura e o badge no topo do
  desenho.
- **`output`** é a saída do console, cada linha com **o índice do passo em que foi
  impressa** — por isso o painel "Saída" consegue esconder o que ainda não aconteceu e
  clicar em `#passo` para pular até lá.

### 2.4 Candidato e seleção (`sel` e `ctx`)

A detecção devolve candidatos; a seleção devolve o escolhido:

```js
candidato = { type: 'list'|'tree'|'stack'|'queue'|'array', id, holderId?, label,
              score, plain?, doubly?, tailId?, win?, itemsProp?, sizeProp? }

sel       = { type, id, label, ... }   // + os campos do candidato que o render usa

ctx       = {          // o pacote que o app entrega ao renderizador
  opsMap, pointers, events, visit,      // fatos do trace
  prevStep, nextStep,                   // vizinhos (para diff/ânimo)
  lineText,                             // a linha que executa, já sem espaços
  steps, stepIndex,                     // trace completo + posição (seta da árvore)
  animMs                                // duração-alvo das animações (velocidade)
}
```

---

## 3. A camada de linguagem (tokenizer → parser → interpreter)

### 3.1 `js/tokenizer.js` — texto para tokens

Um laço por caractere (`while (i < len)`) produz uma lista de tokens
`{ type, value, line }` com tipos: `num`, `str`, `tpl`, `ident`, `kw`, `priv`, `punct`,
`eof`.

Decisões que valem o estudo:

- **Número de linha em todo token**: é o que permite destacar a linha correta e dar
  "Erro na linha 7: ...". O tokenizer conta `\n` inclusive dentro de comentários de
  bloco.
- **Strings não atravessam linha** (erro didático: *"String sem fechamento (aberta na
  linha X)"*), com escapes `\n \t \r \\ \' \" \0 \uXXXX`.
- **Template literal (`...`) é tokenizado como token `tpl` com partes**: os trechos de
  texto vão como estão e cada `${...}` guarda o **código-fonte bruto** (`src`) para o
  parser reparsear depois. Um laço controla o balanceamento de `{}` e ignora chaves
  dentro de strings — é um mini-parser de interpolação.
- **`#nome` é token próprio (`priv`)**. Isso deixa o parser tratar campos privados como
  cidadãos de primeira classe (e as mensagens de erro ficam específicas).
- **Erros de operadores fora do subset acontecem aqui**, com mensagem própria:
  `**`, `??`, `?.`, `...`, `& | ^ ~`, `<<`, `>>`. É a diferença entre "não é suportado"
  e "variável não definida" — o usuário aprende o limite da ferramenta.
- **BOM** de arquivo do Windows é pulado.

**Exercício de mesa:** pegue `const a = [1, "x", `t${2+3}`];` e escreva a lista de
tokens à mão. Depois rode `node -e` carregando só o tokenizer (`DSV.tokenize`) e
compare.

### 3.2 `js/parser.js` — tokens para AST

Descida recursiva clássica: cada nível de precedência é uma função, e a "escada" é
exatamente a do JavaScript:

```
parseAssign → parseConditional → parseLogicalOr → parseLogicalAnd → parseEquality
→ parseRelational → parseAdditive → parseMultiplicative → parseUnary → parsePostfix
→ parseCallMember → parsePrimary
```

Detalhes que fazem o parser ser "de verdade":

- **Toda** função da escada devolve nós com `line`, e o laço `while` implementa
  associatividade à esquerda (`1 - 2 - 3` = `(1-2)-3`); a recursão em `parseAssign`
  implementa associatividade à direita (`a = b = 1`).
- `arrowParamsAhead()` **olha adiante** na lista de tokens para decidir se `(a, b)` é
  cabeçalho de arrow function ou parêntese comum. Sem lookahead, `(a, b) => ...` seria
  ambíguo.
- `parsePrimary` aceita `function` como expressão, `new` com nome/membro (sem expressão
  arbitrária), array e objeto literais, `this`, literais e templates.
- **Classe**: laço de membros que aceita `nome(...)` ou `nome = expr;`; detecta
  `constructor`; marca `isPrivate`; `static/get/set/async` e `extends` falham com
  mensagem clara.
- **Validação de campos privados**: cada uso de `#nome` é anotado com a pilha de
  classes abertas naquele ponto (`privUsages`); no fim do parse, cada uso precisa estar
  envolvido por alguma classe que declare aquele `#nome`. É uma checagem léxica — mais
  simples que a do JS, suficiente para o didático.
- `parseTemplate` reparseia cada `${...}` com `parse('(' + src + ')')` e ajusta as
  linhas da sub-árvore (`setLines`).
- **Erros úteis**: `desc(token)` descreve o que foi encontrado ("encontrei \"}\"",
  "encontrei o número 3") e as mensagens terminam o raciocínio: *"Esperado \")\" para
  fechar a condição do if, mas encontrei fim do código"*.
- Erros antecipados por lookahead: `for...in`, desestruturação em `let/const` e em
  parâmetros, `try/catch` etc.

### 3.3 `js/interpreter.js` — executar e gravar os passos

É o maior e mais importante arquivo. Os blocos que você precisa entender:

**(a) Ambiente (`Env`)** — o escopo léxico:

```js
function Env(parent, opts) {
  this.vars = Object.create(null);       // nome → valor
  this.consts = Object.create(null);     // nomes declarados const
  this.parent = parent;                  // encadeamento (a "cadeia de escopos")
  this.isFunctionScope = ...;            // fronteira de var
  this.thisVal = ...;                    // this da invocação (herdado p/ arrow)
}
Env.prototype.find = ... // sobe a cadeia até achar o nome
```

Blocos criam `Env` novo. `var` sobe até `isFunctionScope`; `let/const` ficam no bloco.
`const` reatribuído → erro com linha. É uma simplificação em relação ao JS real (não há
TDZ), mas replica o essencial para o didático.

**(b) Hoisting** — só declarações `function` são pré-registradas no início de cada
bloco (`hoist`), o que faz recursão mútua funcionar. Function expressions/arrows não
têm hoisting (como no JS real).

**(c) Controle de fluxo por sinal** — o truque mais elegante do arquivo: `return`,
`break` e `continue` são implementados lançando
`throw { __signal: 'return', value }` e capturados por quem sabe tratá-los (o laço ou
`callFunction`). É a versão em miniatura dos *Completion Records* da especificação
ECMAScript. Se um sinal escapar sem captura, o tratador final converte em mensagem
amigável (`"return" só pode ser usado dentro de uma função.`).

**(d) `for (let ...)` com variável por iteração** — copiar o *binding* a cada iteração
é o que faz closures capturarem o valor daquela volta:

```
loopEnv (iteração N) --copia head i--> nextEnv --update vai no nextEnv--> loopEnv
```

**(e) Classes** — a representação é um objeto de classe e uma instância:

```
classe = { __class:true, name, methods:{}, privMethods:{}, privFields:{}, fields:[], ctor, env }
instância = { __class: <classe>, __priv: { #x: ... }, campos públicos... }
```

`__class` e `__priv` são **não-enumeráveis** para não aparecerem na serialização de
`props` (os privados aparecem via `__priv` como `#x`). Campos de instância rodam
**antes** do construtor, com `this` já apontando para o objeto novo — igual ao JS.
`getPrivateMember`/`setPrivateMember` validam a declaração e produzem erros específicos
(inclusive "método privado não pode ser reatribuído").

**(f) Identidade (`__id`)** — todo array/objeto criado pelo interpretador recebe
`__id` na primeira oportunidade (`defineId`). É o que permite falar de "o mesmo nó" entre
duas variáveis, entre o passo e a detecção e entre passos diferentes.

**(g) A "foto" do passo (`beginStep` + `fill`)** — o padrão é sempre o mesmo:

```js
Runtime.prototype.execVarDecl = function (stmt, env) {
  var step = this.beginStep(stmt, env);      // 1. carimba (linha, índice, contexto)
  ...executa...                              // 2. muta o mundo real
  this.fill(step);                           // 3. congela o estado → serializa
};
```

`fill` grava: `globals`, `locals` (menos o global), `pointers`, `stack`, `thisVal` e a
"ordem de conclusão" (`__seq`). `beginStep` também checa o limite de passos.

**(h) Ordenação por conclusão** — no fim, os passos são ordenados por `__seq` e
reindexados (e os índices em `output` são corrigidos). O motivo: um comando que chama
uma função só está *concluído* quando a função retorna. Verificado no próprio
interpretador, este código:

```js
function f(x){ return x+1; }
const a = f(1);
console.log(a);
```

produz, nesta ordem: linha 1 (declaração), linha 1–interna (return, **com o frame `f` na
pilha**), linha 2 (a chamada concluída), linha 3. Ou seja: a linha da chamada aparece
depois do corpo — e é isso que o playback mostra, sem "pulos para trás".

**(i) Serialização com orçamento** — `serialize` percorre o valor com três proteções:
orçamento total (6000/2000 nós por escopo/passo), profundidade máxima 25, listas
limitadas (200 itens, 100 props) e **deduplicação + referência de volta**:

- objeto já serializado neste passo → reaproveita a mesma estrutura (`done[__id]`);
- objeto *em serialização* (ciclo) → `{ t:'ref', id }`. Sem isso, uma lista duplamente
  encadeada (onde `next.prev.next.prev...`) consome o orçamento inteiro e a cadeia sai
  truncada — o comentário no código explica exatamente esse caso;
- índice apagado com `delete` → `{ t:'p', v:undefined, hole:true }`, distinguindo
  "buraco" de "undefined armazenado".

**(j) Eventos e saída** — a biblioteca nativa emite os eventos na hora (`emitEvent`
anexa ao passo corrente) e o `console` grava `{ step, kind, text }`. Como os métodos de
array (`map/filter/reduce`...) são implementados chamando `callFunction` **do próprio
interpretador**, os callbacks aparecem na pilha de chamadas e viram passos — ensinar
`array.map` no visualizador é mostrar o callback executando.

**(k) Limites e erros** — 20 000 passos e 500 frames (`maxSteps`/`maxDepth`) com
mensagens que sugerem a causa ("possível laço infinito — revise as condições de
parada"). Se um erro interrompe a execução, os passos já abertos e não preenchidos são
preenchidos no `catch` para a tela não ficar inconsistente.

**(l) Formatação** — `inspect` (para console/comandos) e o formato serializado (para a
UI) são coisas separadas de propósito: a UI formata em `js/util.js`
(`fmtSerialized`/`fmtSerializedShort`). Não misture "como eu imprimo para o usuário" com
"como eu guardo o estado".

---

## 4. Do trace ao desenho (a camada de análise)

Tudo nesta seção é **função pura sobre passos** — nada toca o DOM. Isso permite testar
no Node sem navegador (é o que `tests/run-tests.js` faz).

### 4.1 `buildOpsMap(steps)`

Percorre os eventos e conta operações por objeto: para cada `targetId`,
`{ push, pop, shift, unshift, splice }`. Serve de "evidência de uso" para a detecção
(um array que sofreu `shift` provavelmente é fila).

### 4.2 `detectStructures(step, opsMap)` — heurística com pontuação

Não existe marcação no código do usuário. A detecção combina **forma + nomes +
evidência de uso**, e cada candidato recebe um `score`:

| Pista | Exemplo | Pontos |
|---|---|---|
| Array com nome de pilha | `pilha`, `stack` | +6 |
| Array com nome de fila | `fila`, `queue` | +6 |
| Evento `pop` no array | `pilha.pop()` | +3 (pilha) |
| Evento `shift` no array | `fila.shift()` | +3 (fila) |
| Nó com `esquerda/direita` | árvore | base 4 + bônus por raiz/nó + tamanho |
| Nó com `proximo/next` | lista | base 3,5 + bônus + tamanho |
| Wrapper com `raiz/root` (inclusive `#root`) apontando para nó | `class Arvore { #root }` | 9 |
| Wrapper com `inicio/head` (`#head`, `primeiro`...) | lista encapsulada | 9 |
| Wrapper com `itens` + nome de pilha/fila | `class Fila { itens }` | 9 |
| Wrapper com array interno + tamanho numérico | `MeuArray` (`#items`/`#tamanho`) | 9 |
| Array global "comum" | `const v = [1,2,3]` | 5,5 (nunca rouba de estrutura reconhecida) |

Regras de robustez que você deve repetir:

- **Sinônimos pt/en**: `esquerda|left|esq`, `proximo|próximo|next|prox`,
  `valor|value|dado|...`, `#head|inicio|primeiro|cabeca`, `#tail|ultimo|cauda|fim`...
- **Dupla × simples**: lista é dupla se algum nó tem `prev/anterior` **ou** o wrapper
  tem `#tail`.
- **Fila com índices** (`#inicio`/`#fim`): `queueWindow()` valida a janela viva
  `[inicio, fim)` — o resto do array é histórico de posições e não entra no desenho.
- **Wrapper de array (MeuArray)**: o candidato aponta para o **wrapper**, não para o
  array interno — a identidade sobrevive a `limpar()` (que troca o array interno).
- **`treeOwnerLabel`**: `arvore.raiz` e `arvore` são a *mesma* estrutura; normaliza o
  rótulo para a câmera e o seletor não "piscarem".
- **Percursos com guarda de ciclo** (`seen[id]`, limite de 500 nós) — os dados vêm do
  usuário e podem ter ciclos de verdade.
- Ordem de varredura: `globals` → `locals` → `this`; desce no máximo 3 níveis, e **não
  desce** nos filhos de nós de árvore/lista (senão cada nó viraria candidato).

### 4.3 `chooseStructure(step, opts)` — a seleção "gruda"

Exibir uma estrutura que muda de candidato a cada passo produz piscadas. A solução:

- `forced` (escolha manual do usuário no seletor) manda sempre; se a raiz/cabeça mudou
  de identidade, procura pelo `holderId` (o mesmo wrapper) antes de desistir;
- `sticky` (a última escolha automática) é mantida **enquanto o candidato existir**;
- se o sticky ficou sem conteúdo (ex.: árvore esvaziou) e o melhor candidato do passo
  tem conteúdo, cede para ele;
- quem mantém o `sticky` é o `app.js` — a função é pura e devolve o novo valor (por
  isso é testável no Node).

`traceCandidates(steps, opsMap)` **simula** essa escolha ao longo de todo o trace e
junta o que apareceu, para o seletor "Visualização" oferecer todas as estruturas que
existem em algum momento (ex.: a árvore duplicada), agrupando wrapper e nó pelo
`holderId`.

### 4.4 `computeVisitOrder(steps)` — visitas com "época"

O que pinta os nós já visitados em tom suave. Duas ideias:

1. **Visita** = a primeira vez que um ponteiro com nome de cursor (`atual`, `current`,
   `no`, `node`, `cur`, `aux`) aponta para o nó. Se o código não usa ponteiros com esses
   nomes, qualquer ponteiro vale.
2. **Época** = cada execução de uma operação (o nome do método mais externo na pilha de
   chamadas, via `opFrameName`). As marcas de visita **recomeçam a cada época** — um
   percurso novo não herda as marcas suaves do anterior, e `visitAt(visit, step)` só
   devolve o que já aconteceu *naquela* época. Sem isso, a árvore ficaria iluminada pelo
   trace inteiro.

### 4.5 `buildCommands(steps, source)` — a lista de Comandos

Duas fontes de entrada:

- **eventos nativos** (`push(10)`, `pop() → 20`) — vindos do trace;
- **operações reconhecidas** — uma entrada por *run* de método reconhecido na pilha
  (`inserirNoInicio`, `append`, `emOrdem`, `dequeue`...), com o nome da operação e o
  receptor da linha quando há (`lista · Inserção no início`).

A parte sutil: o passo do comando que chama o método é gravado **depois** do corpo
(§3.3h), então o método aparece duas vezes — a "run" na pilha e a chamada concluída. A
função **funde** as duas na entrada com receptor (a mais descritiva). Evidência de que
você entendeu: explicar por que `push` da pilha gera evento mas `insertAtBeginning`
gera entrada de operação, e por que os dois não se duplicam.

### 4.6 `explainStep(step, sel, opts)` — a frase da faixa

`opNameFrom` decide a operação: primeiro pela pilha de chamadas (do frame mais externo
para o mais interno), senão por regex da linha que executa (`\.prepend\(`, `] +=`,
`console.log`...). Depois:

- **Árvore** (`treeExplanation`): compara o estado com o **passo anterior** (nós
  adicionados, removidos, promovidos, valor substituído) e com o **próximo** (a vaga que
  será preenchida — inclusive dizendo se segue a regra da BST, comparando os valores
  numéricos); sem diff, descreve a comparação do nó ativo (`12 > 7 — a busca segue para
  a direita`).
- **Lista** (`listExplanation`): diff da cadeia `next`/`prev` — nó recém-criado ainda
  "pendente" (fora da lista), referência que passou a apontar para o novo nó, HEAD/TAIL
  que mudaram, remoção com reconexão.
- **Array** (`arrayExplanation`): lê a linha que executa para achar o índice citado,
  o alvo/valor da busca, os examinados.
- **Demais** (`genericExplanation`): reage ao evento do passo (`"10 saiu."`).

Nenhuma frase é armazenada no trace: todas são **derivadas**. É isso que faz o recurso
funcionar em código que o autor do site nunca viu.

---

## 5. Renderização e animação

### 5.1 A linguagem visual comum

Todo renderizador devolve a mesma anatomia:

```html
<div class="canvas-toolbar">título · subtítulo · badge de evento</div>
<div class="canvas-viewport">        <!-- recorte, grid pontilhado, pan/zoom -->
  <div class="canvas-stage">         <!-- transformado por CSS vars        -->
     ...conteúdo da estrutura...
  </div>
</div>
```

O `canvas-viewport` tem `overflow: hidden` e o `canvas-stage` é transformado por três
custom properties (`--canvas-x`, `--canvas-y`, `--canvas-zoom`) aplicadas no elemento
`#structure` — o grid de fundo acompanha posição e escala
(`background-position: var(--canvas-x)`, `background-size: 22px * zoom`). É uma técnica
de câmera simples e barata: **um `transform` no palco, nada de posicionar item por
item**.

### 5.2 Pilha e fila (DOM + FLIP)

- **Pilha**: coluna, topo é o **último índice** (desenha de trás para frente), badge com
  o último evento, escala por faixas (`smallScale`) para estruturas curtas ficarem
  maiores.
- **Fila**: linha horizontal com FRONT/REAR apontando para as posições reais; com
  `unshift/pop` a frente está do outro lado (`reverse`); com janela `[#inicio,#fim)`,
  desenha só a janela viva com os `[i]` reais do array.
- **Identidade visual dos itens** (`itemKeys`): cada item recebe uma chave estável
  (`p:10#1`, `o:17#1`...). Os elementos carregam `data-k="<chave>"`,
  `data-enter="up|down|left|right"` e `data-exit="..."`. É o contrato com o FLIP.

### 5.3 FLIP (`js/anim.js`) — a animação que faz tudo deslizar

FLIP = **F**irst, **L**ast, **I**nvert, **P**lay. A receita em `flipRender`:

1. antes de reconstruir, mede o retângulo de cada elemento `[data-k]` (`First`);
2. reconstrói o HTML (`Last`);
3. para cada elemento que "continuou" (mesma `data-k`), calcula
   `dx = antigo.left - novo.left` e anima de `translate(dx,dy)` até `translate(0,0)`
   com `element.animate(...)` (`Invert` + `Play`);
4. elemento **novo** entra com fade + deslocamento na direção de `data-enter`;
5. elemento **removido** não pode mais ser animado (já saiu do DOM): clona o nó com
   `position: fixed` na posição antiga e desvanece o clone.

Detalhes de gente grande: o delta é dividido pelo zoom do canvas (as medidas estão em
pixels de tela, o palco é escalado); o clone é removido no `anim.finished` **e** num
`setTimeout` de segurança; com `prefers-reduced-motion: reduce` ou ambiente sem
`Element.animate`, o FLIP é ignorado e o HTML é reconstruído direto (é isso que permite
testar a renderização no Node).

### 5.4 Lista encadeada

- A cadeia é lida **seguindo `proximo` de verdade**, com guarda de ciclo
  (`listChain`, limite de 500). O desenho reflete as referências reais, inclusive
  listas malformadas.
- Cada nó é uma caixa **VALUE** (maior) e **NEXT** (região da referência); a seta sai
  da região NEXT.
- **HEAD/TAIL** são etiquetas ligadas ao nó por uma linha-guia; referência nula vira o
  indicador compacto **∅** (nunca um nó).
- O que veio de diff: nó **recém-criado e ainda não ligado** aparece tracejado "fora da
  lista" (`pendingSide`/`findPendingNode`), a referência alterada é destacada
  (`listStepDiff`), e o cursor `current` acende a seta que percorre.
- Lista dupla: entre cada par, **duas pistas de setas** (next em cima, prev embaixo).

### 5.5 Array (dois modos)

- **Array puro por índice** (`const v = [1,2,3]`): células com faixa de índice, e a
  linha em execução é lida para destacar exatamente a posição citada:
  `bracketIsIndex` distingue `algo[...]` de literal `[1,2]` (olhando o que vem antes do
  colchete), `arrayLineIndices` separa **escritas** (lado esquerdo de uma atribuição ou
  alvo de `delete`) de **leituras**, e `evalIndexExpr` resolve expressões simples de
  índice (`v[i]`, `v[v.length - 1]`) no estado do passo.
- **MeuArray**: desenha o **wrapper** — `tamanho = N` na legenda e `#items.length = M`
  quando o array interno é maior; posições fora do tamanho em células tracejadas; buraco
  do `delete` é célula vazia, distinta de `undefined`; nos deslocamentos de
  `inserirEm`/`removerPorIndice` o valor "desliza" de célula para célula (FLIP) com uma
  etiqueta `← valor de [i]`.
- Estados de busca: posições examinadas em tom suave, a encontrada em tom forte
  (`arraySearchVisited`).

### 5.6 Árvore

**Layout** — `treeLayout` faz percurso **em-ordem** e usa a posição na ordem como
coordenada x; y é a profundidade, e cada nó guarda pai e lado. Por que em-ordem: em uma
árvore binária de busca, a ordem de visita é a ordem dos valores, e subárvores ficam
naturalmente separadas sem medir larguras. `treePositions` centraliza a caixa com
margem que acompanha o raio, e `TREE_TIERS` escolhe raio/espaçamentos por faixa de
quantidade de nós (árvores pequenas desenham maiores).

**Duas implementações** — a cena animada (padrão) e a estática (`renderTreeStatic`,
fallback para ambientes sem DOM real, usada nos testes). A cena mantém **elementos
persistentes** por nó/aresta e um laço `requestAnimationFrame` que interpola:

```js
// ao mudar o passo, cada nó ganha uma animação de {x0,y0,r0,s0,o0} → {x1,y1,r1,s1,o1}
// o frame faz lerp com easeOutCubic e escreve transform/opacity/raio no SVG
```

O laço só continua rodando enquanto há animação ativa — e para sozinho (`active` falso).
É uma implementação manual da mesma ideia do Web Animations API, necessária porque a
árvore precisa que **arestas e nós se movam em conjunto** (a aresta é recalculada a cada
frame a partir das posições atuais).

**Arestas** — geometria única (`treeEdgeGeometry`) em curva S com suavização, ponta
triangular por `marker` SVG e folgas para não encostar nos nós; a mesma geometria é
amostrada por caminho para achar um ponto e a tangente (`treeEdgePointAt`), o que
permite:

- **revelação progressiva** da conexão nova: desenha só o trecho inicial da curva
  (`treeEdgeSegment`) e a frente avança pai → filho;
- **indicador contextual**: um path que percorre a curva na direção real do movimento
  (descida da busca, subida do retorno), derivado da transição do ponteiro ativo
  (`treeTransition` compara os ponteiros do passo com a pilha de chamadas, e detecta se
  a transição é pai→filho ou filho→pai).

**Destaques derivados de diff** — aresta "nova" (pai mudou em relação ao passo
anterior, `treeChangedEdges`), aresta "que vai mudar" (tracejada, do passo seguinte,
`treePendingEdges`), vaga pontilhada da próxima inserção (`insertionPreview` calcula o
layout do **próximo** passo e mostra onde o nó vai nascer; a caixa do palco usa
`max(atual, próximo)` para a prévia nunca ser cortada e o enquadramento não pular duas
vezes). Tudo recalculado a cada render: navegar para trás faz o destaque sumir sozinho,
sem nenhum estado escondido.

### 5.7 `js/rough.js`

Implementa traço "à mão" (estilo Excalidraw) com um PRNG determinístico (`mulberry32`):
mesma seed → mesmo desenho. Está carregado e testado, mas **não é usado pela interface
hoje** — ficou de uma fase de design. É um bom candidato a exercício (§12): ou usar de
verdade num "modo lousa", ou remover.

---

## 6. A aplicação e a interface (`js/app.js` + `index.html` + CSS)

### 6.1 O estado da UI

`state` guarda apenas **memória de interface**: `trace`, `index`, `playing`, `speed`,
`debug`, `stale` (código editado depois da execução), `forced`/`sticky` (seleção),
`candidates`, `opsMap`, `commands`, `visit`, `tabs`, `buffers`. Note que **nenhum
estado de execução vive aqui** — isso é todo do trace.

O fluxo de `run()` é o mapa da seção 1: interpreta → constrói as análises → preenche o
seletor de estruturas → zera seleções → trata erro (banner + passo do erro) → `goto(0)`.
`goto(i)` centraliza o desenho: escreve status/slider, chama o render da estrutura, os
4 painéis, o canvas e a faixa de explicação. **Um único caminho de atualização** —
facilita achar bugs de consistência.

### 6.2 O editor (textarea "disfarçado")

Não há biblioteca de editor. A técnica:

- um `<textarea>` de verdade (texto/foco/IME nativos) com **fundo transparente**;
- atrás dele, um `<pre id="highlight">` com o mesmo texto e o mesmo layout, colorido
  por um realce por regex linha a linha (`highlightLine` usa um `HL_RX` global e decide
  as classes: comentário, string, número, controle, palavra-chave, tipo, função,
  variável);
- um gutter com números de linha e um `div#lineHilite` posicionado por
  `top = PAD_TOP + (linha-1) * LINE_HEIGHT` (constantes que espelham o CSS);
- `syncScroll()` traduz o scroll do textarea para `transform` no realce, no gutter e no
  destaque — os três rolam juntos;
- indentação automática no Enter e Tab com 2 espaços;
- **medir a largura do caractere** (`measureCharWidth`, um `<span>` invisível com
  `0000000000`) é o que permite transformar `(clientX, clientY)` em `(linha, coluna)` e
  daí na expressão sob o mouse (`codeWordAt` → `DSV.expressionAt`).

A **dica de variável** (segurar o mouse) resolve a expressão no passo atual:
`DSV.resolveVariable` procura `this` → locais → globais (a mesma ordem do painel), e
`DSV.resolveExpression` sobe a cadeia `node.left.value` no **valor serializado**, com
uma regra explícita: campo de objeto **ganha** de variável de mesmo nome ("o balão
mostra o campo `value` do nó, não o parâmetro `value`"). O balão só funciona quando o
texto exibido é exatamente o código do trace (`els.code.value === state.traceCode`) e
não está tocando.

### 6.3 Abas, buffers e persistência

Cada exemplo aberto é uma aba (máximo 4) com o **próprio rascunho** em
`state.buffers[id]`, persistido em `localStorage` (`edviz.buffers`). Abrir um exemplo
restaura as edições daquela aba. Há migração do formato antigo (`edviz.code` →
buffer da aba ativa). Fechar pelo `×`, pela roda do mouse (`auxclick`) e navegação por
setas com foco são detalhes de usabilidade que valem copiar.

### 6.4 Playback, debug e teclado

- Playback: `setTimeout` reagendado a cada passo com `Math.max(120, 520 / speed)`;
  velocidade 0,5–4×; **qualquer interação para o play** (`stopPlay`); animações mais
  curtas em velocidade alta (`animMs` no ctx).
- Debug (`F10`): o trace é executado por inteiro primeiro; o "debug" é apenas tocar os
  passos **um por tecla**, com o editor em `readOnly`. Truque honesto: um debugger de
  verdade executaria sob demanda; aqui a execução já terminou e o usuário percorre o
  trace — para o didático, o efeito é o mesmo e a implementação é muito mais simples.
- Teclado global: `Ctrl+Enter` executar, `Espaço` play/pause, setas/Home/End navegar,
  `Esc` sair do debug; durante o debug, qualquer tecla avança (exceto atalhos do
  navegador).

### 6.5 Canvas (pan/zoom) e enquadramento automático

- Zoom na roda com fator **exponencial** (`Math.exp(-deltaY * 0.0015)`) para ser suave
  em qualquer dispositivo, e **mantendo fixo o ponto sob o cursor**:
  `x' = cx - (cx - x) * (z'/z)`.
- Reenquadramento automático com políticas por situação:
  `pendingCanvasFit` (execução: enquadra o desenho real, pode ampliar estruturas
  pequenas), `canvasKeepFitted` (acompanha passos, nunca amplia), `canvasAutoFit`
  (árvore/lista: reenquadra quando o **tamanho** muda de forma estável),
  `canvasEnsureVisible` (fila: só recentraliza se escapou — crescer na horizontal não
  pode dar salto a cada item), e `canvasStructureOutOfView` (no resize, se menos de 50%
  do desenho está visível, reenquadra mesmo depois do usuário ter mexido).
- A "assinatura" do desenho (`canvasFitKey` = largura x altura do palco) evita
  reenquadrar a cada passo quando nada mudou de tamanho.

### 6.6 Layout, painéis e acessibilidade

- Grade de 5 colunas: `32fr | 5px | 48fr | 5px | 20fr` (editor, divisória, canvas,
  divisória, painel) com mínimos (`280px`, `224px`); painéis recolhíveis redistribuem o
  espaço para o canvas; divisórias arrastáveis por **Pointer Events** com
  `setPointerCapture` (funciona com mouse, toque e caneta), ajuste por teclado
  (setas) e duplo clique restaura o padrão. Ao recolher/reabrir, as proporções são
  medidas com os três painéis expandidos (`measureSplitState`) — por isso reabrir não
  "esmaga" um painel.
- Abaixo de 1100px a grade empilha (CSS `grid-template-columns: 1fr`) e o
  enquadramento é refeito.
- Acessibilidade: `aria-label` em todo botão de ícone, `aria-live="polite"` na faixa de
  explicação, `role="separator"` com `aria-valuenow` nas divisórias, `role="tablist"`
  nos painéis, `<dialog>` nativo no "Como usar", foco visível e **reduced motion**
  respeitado em todas as animações (o `anim.js` desliga o FLIP; a cena da árvore nasce
  no destino). Há testes automatizados de acessibilidade com axe (§8).

---

## 7. Infraestrutura e publicação

- **`servidor.js`**: `http` + `fs` + `path`, sem dependências. MIME map, `Cache-Control:
  no-store`, e uma defesa importante: `path.relative(RAIZ, arquivo)` + rejeição de
  qualquer caminho que comece com `..` ou seja absoluto (**path traversal**). Escuta em
  `127.0.0.1` de propósito. `EADDRINUSE` dá mensagem com a sugestão da porta seguinte.
- **`iniciar.cmd`**: atalho Windows que sobe o servidor minimizado e abre o navegador.
- **Vercel**: o site é 100% estático (`index.html`, `css/`, `js/`, favicons). O
  `vercel.json` define os cabeçalhos: **CSP** (`default-src 'self'; script-src 'self'`;
  `unsafe-inline` só para style, necessário pelos `style` inline dos renderizadores),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` e cache de 1h com
  revalidação para `js/` e `css/`. O `.vercelignore` exclui `tests/`, `servidor.js`,
  `package*.json` e `iniciar.cmd` do deploy.
- **Persistência**: só `localStorage` (rascunhos por aba). Nenhum dado sai do
  navegador — o que também significa que "rollback" de publicação é republicar um commit
  anterior.

---

## 8. Testes: a pirâmide que tornou o projeto possível

Três camadas, todas sem framework (exceto Playwright):

### 8.1 Núcleo — `tests/run-tests.js` (~3 800 linhas)

Carrega os arquivos reais do navegador no Node com `vm.runInThisContext` (a IIFE detecta
`globalThis` e funciona). Um harness de 30 linhas (`test`, `assert`, `eq`) prova que
**você não precisa de Jest para testar bem**. O que é coberto:

- tokenizer/parser/interpretador: precedência, strings/templates, classes e privados,
  recursão, `delete`, for-of, limites de laço/profundidade, erros com linha correta;
- exemplos: todos os 16 são executados sem erro e cada operação confere tamanho,
  invariantes de `head/tail/length`, terminador, duplicados, etc.;
- **renderização**: como `renderStructure` cai no fallback estático sem DOM, os testes
  chamam o renderizador de verdade e inspecionam o HTML gerado (é o caso do teste
  `renderQueueStep` que você viu no topo do arquivo);
- animação: chaves estáveis (`itemKeys`) e `rough` determinístico.

### 8.2 UI simulada — `tests/run-ui-smoke.js` (~1 300 linhas)

Um **DOM falso** de ~80 linhas (`document.getElementById` cria elementos na hora,
`classList`, `addEventListener`, `querySelector` tolerante, `localStorage`,
`setTimeout` controlado). Carrega `app.js` de verdade e:

- percorre **todos os passos de todos os exemplos**, exercitando cada renderizador e
  cada painel;
- simula eventos de UI (cliques, teclado, resize, hover) disparando os handlers
  registrados;
- verifica regressões de fluxo (stale, debug, recolhimento de painéis, escala).

O segredo para isso funcionar é a disciplina do código de produção: **todo acesso a DOM
é guardado** (`typeof el.getBoundingClientRect === 'function'`), `flipRender` tem
fallback, `supportsTreeScene()` decide entre cena e estático. Você programa *para ser
testável* ou acaba sem testes.

### 8.3 Navegador real — `tests/e2e/` (Playwright)

Só o que as camadas anteriores não alcançam: layout real e foco, histórico
(avançar/voltar restaura o mesmo HTML), edição após execução, debug com editor travado,
persistência entre reloads, `file://`, janela estreita, `reduced motion`, **memória** de
um trace longo, acessibilidade com `@axe-core/playwright`. A configuração sobe o
servidor de verdade (`webServer: node servidor.js 8788`) e roda em **Chromium e
Firefox** — os falsos positivos de um navegador aparecem no outro.

---

## 9. Decisões de engenharia e trade-offs

| Decisão | Por quê | Custo / alternativa |
|---|---|---|
| Interpretador próprio (não `eval` da página) | Controla o subset, mensagens didáticas, passos granulares, limites; determinismo | Mais código (parser/executor); alternativa: instrumentar com Babel seria dependência e não daria erros em pt-BR |
| Trace completo antes de desenhar | Voltar/avançar trivial, animação dirigida por dados, testes puros | Memória cresce (mitigado por orçamentos de serialização); execução longa congela no início |
| Estado do passo **serializado** (não referências vivas) | Cada passo é imutável; rewind sem efeitos colaterais | Custo de cópia por passo (orçamentos limitam); exige `ref`/`hole` |
| Detecção por heurística de nomes/forma | O usuário escreve código normal de faculdade, sem anotações | Nomes fora do comum precisam do seletor manual |
| Seleção "sticky" + seletor de candidatos do trace | Evita piscar e dá controle ao usuário | Um pouco de estado de UI a mais |
| Passos ordenados por conclusão | O playback acompanha a ordem em que as coisas terminam, sem "pulos" | A linha da chamada aparece após o corpo (é preciso entender para não achar que é bug) |
| FLIP para estruturas em DOM | Poucas linhas, funciona com qualquer HTML, anima reordenação de verdade | Exige `data-k` estável; clones de saída precisam de limpeza |
| Cena SVG + RAF manual na árvore | Nós **e** arestas se movem juntos, com revelação e indicador sobre a curva | Mais código que `animate()`; a alternativa não compartilha o mesmo relógio |
| ES5 + IIFE + `window.DSV` | Zero build, roda no Node e no navegador, fácil de inspecionar | Sem `import`/`export`; ordem de scripts importa |
| Sem backend (localStorage) | Site estático puro; nada para operar | Sem compartilhamento entre dispositivos (a evolução "compartilhar link" exigiria outra decisão) |
| Linguagem de sinais (`throw __signal`) | Implementa `return/break/continue` sem `goto` | Performance/simplicidade trade-off aceitável no didático |
| Testes sem framework (núcleo/UI) | Zero dependência, roda com `node arquivo.js` | Harness próprio; Playwright só onde é insubstituível |

---

## 10. Roteiro de reconstrução do zero, em fases

Cada fase tem um entregável **visível ou testável**. Faça commits pequenos. As fases 1–4
são um "mini-debugger" genérico; a partir da 5, cada estrutura é um recorte do produto.

### Fase 0 — Decisões e esqueleto
- **Entregável:** `index.html` com a grade de três painéis (editor, canvas, painel),
  `styles.css` com tokens de cor, `js/` vazio.
- **Decisões para escrever antes de codar:** site estático? subset de JS? dados
  serializados? Como o usuário reexecuta? (Escreva o "contrato de dados" da §2 mesmo que
  incompleto.)
- **Pronto quando:** o layout abre no navegador e um botão "Executar" imprime algo no
  console do navegador.

### Fase 1 — Tokenizer
- **Entregável:** `DSV.tokenize(code)` devolvendo `{type, value, line}` com: números
  (inclusive `1e3`), strings com escapes, comentários, identificadores com acentos,
  pontuação multi-caractere (`===`, `!==`, `<=`, `=>`...), `#priv`, e mensagens de erro
  com linha (string aberta, operador não suportado).
- **Validar:** teste de mesa + `node` imprimindo tokens de alguns programas.
- **Armadilhas:** ordem dos operadores de 3/2/1 caracteres; contar `\n` dentro de
  comentário de bloco; não confundir `?` do ternário com `??`.

### Fase 2 — Parser
- **Entregável:** AST navegável com `line` em todo nó, para statements (`let/const/var`,
  `if`, `while`, `for`, `for...of`, `function`, `return`, `break/continue`, blocos,
  expressões) e expressões na escada de precedência.
- **Validar:** para `1 + 2 * 3` a raiz é `+(1, *(2,3))` — escreva o desenho da árvore à
  mão e compare com um `JSON.stringify` do AST.
- **Armadilhas:** associatividade; `arrow` com e sem parênteses; `new`; classe com
  métodos e campos; mensagens "esperado X, encontrei Y".

### Fase 3 — Executar e gravar passos (sem UI)
- **Entregável:** `DSV.interpret(code)` devolvendo `{steps, output, error}`; cada passo
  com linha, escopos **serializados**, pilha de chamadas e `pointers`.
- **Validar:** o exemplo da §3.3h (função chamada) tem de produzir a ordem linha 1 →
  linha 1 interna (stack `f`) → linha 2 → linha 3.
- **Armadilhas:** `return/break/continue` (use sinais); `this` de arrow; `const`;
  `for-let` por iteração; ordenação por conclusão; orçamento de serialização.

### Fase 4 — Playback mínimo
- **Entregável:** slider + play/pause + passo anterior/próximo + linha destacada no
  editor + painel com variáveis e pilha de chamadas. Desenhar o array "cru" já dá
  satisfação e valida tudo.
- **Validar:** avançar até o fim e voltar ao início reproduz o mesmo estado (teste e2e
  "histórico" da §8.3).
- **Armadilhas:** o destaque da linha precisa acompanhar o scroll; editar o código
  depois de executar deve marcar "stale".

### Fase 5 — Pilha e fila
- **Entregável:** detecção de candidatos (`detectStructures`) + seleção com sticky +
  renderizadores de pilha/fila com FLIP e FRONT/REAR.
- **Validar:** `pilha.push/pop` vira pilha; `fila.push/shift` vira fila; nomes em inglês
  também; array sem cara de nada vira "array por índice".
- **Armadilhas:** chaves de identidade para o FLIP; `unshift/pop` inverte a frente;
  fila com `#inicio/#fim` desenha só a janela viva.

### Fase 6 — Listas (simples e dupla)
- **Entregável:** leitura da cadeia por `next` com guarda de ciclo; VALUE/NEXT; HEAD;
  terminador ∅; nó pendente tracejado; HEAD/TAIL na dupla e duas pistas de setas.
- **Validar:** em `insertAtBeginning`, ver o nó nascer "fora da lista" e só então ser
  ligado; em `removeByValue`, ver a reconexão.
- **Armadilhas:** célula de ciclo; referência nula não é nó; distinguir lista dupla de
  simples (prev nos nós **ou** `#tail` no wrapper).

### Fase 7 — Arrays
- **Entregável:** array puro por índice (células + índice citado na linha em execução) e
  MeuArray (wrapper, `tamanho` × `#items.length`, buracos do `delete`, deslocamentos com
  FLIP e etiqueta).
- **Validar:** `delete v[1]` mostra buraco (não `undefined`); `inserirEm` mostra o valor
  deslizando.
- **Armadilhas:** não confundir array auxiliar (retorno de `slice`) com a estrutura;
  wrapper sobrevive a `limpar()`.

### Fase 8 — Árvore
- **Entregável:** layout em-ordem; métricas por faixas; cena com interpolação de nós;
  arestas curvas com ponta; destaque do nó ativo/visitados; vaga de inserção; indicador
  de transição; explicação por diff.
- **Validar:** inserção em BST: o nó desce comparando (indicador percorre a aresta), a
  vaga aparece pontilhada e o nó nasce no lugar; remoção com dois filhos mostra o valor
  substituído pelo sucessor.
- **Armadilhas:** x por em-ordem precisa de contador **global** do percurso, não da
  subárvore; nós/arestas em elementos persistentes (nunca `innerHTML` a cada frame);
  transição de ponteiro detectada por comparação entre passos.

### Fase 9 — Experiência
- **Entregável:** faixa de explicação, painel de comandos clicáveis, console ligado aos
  passos, hover de variável, abas + buffers, debug por tecla, zoom/pan com
  enquadramento automático, painéis recolhíveis.
- **Validar:** reproduza a lista de "Como usar" do README.
- **Armadilhas:** um único caminho de atualização (`goto`); parar o play em qualquer
  interação; medição de caractere para o hover; zoom no ponto do cursor.

### Fase 10 — Testes, acessibilidade e deploy
- **Entregável:** harness de núcleo; DOM falso para smoke; e2e no que sobrar; axe;
  cabeçalhos no deploy; `.vercelignore`.
- **Validar:** `npm test` e `npm run test:e2e` verdes em Chromium e Firefox;
  `file://` funciona.
- **Armadilhas:** não testar com framework caro; testar renderização pelo fallback
  estático; `prefers-reduced-motion` nos testes e2e para determinismo.

**Ordem de leitura do código (para estudar o projeto pronto):** `util.js` → `anim.js` →
`tokenizer.js` → `parser.js` → `interpreter.js` (aos poucos, por bloco) →
`views.js`: primeiro a seção de detecção/seleção (~700 linhas), depois os renderizadores →
`app.js` → `tests/run-tests.js` (lendo os testes você entende os casos-limite).

---

## 11. Mapa conceito → onde está → exercício

| Conceito de CS | Onde vive | Exercício para provar que entendeu |
|---|---|---|
| Tokenização / autômato | `tokenizer.js` | Escreva o tokenizador de `// comentário` e `1e-3` sem olhar |
| Descida recursiva e precedência | `parser.js` (escada) | Explique por que `parseAssign` chama `parseConditional` e não o contrário |
| AST e atributos sintetizados | `line` em todo nó; `setLines` | Adicione a coluna inicial a cada nó |
| Escopo léxico / cadeia de envs | `Env`, `scopeForDeclare` | Desenhe os escopos de um `for` com `let` dentro de bloco |
| Closure e binding por iteração | `execFor` (cópia do head) | Faça o teste do contador com `let` vs `var` |
| Hoisting | `hoist` | Provoque recursão mútua com function decls |
| Exceção como controle de fluxo | `__signal` | Implemente `labeled break`? (desafio) |
| Recursão e pilha de chamadas | `callStack`, `maxDepth` | Faça um exemplo que estoura o limite e leia a mensagem |
| Classes e encapsulamento | `__priv`, `privMethods` | Escreva um teste que tenta acessar `#x` fora da classe |
| Identidade de referência | `__id`, `{t:'ref'}` | Crie um ciclo `a.next=b; b.prev=a` e veja o `ref` no trace |
| Serialização com orçamento/grafo | `serialize`, `collectPointers` | Reduza o orçamento e observe `trunc` |
| Árvore/lista como grafo | `listChain`, `treeIds`, `walk` | Escreva a detecção de ciclo sem olhar o código |
| Heurística e pontuação | `detectStructures` | Adicione o sinônimo `"queue2"` e escreva o teste |
| Estabilidade de UI (sticky) | `chooseStructure` | Force a escolha manual e mude a raiz |
| Agrupamento por época | `computeVisitOrder` | Rode dois percursos seguidos: as visitas não podem vazar |
| Diff entre estados | `treeExplanation`, `listExplanation` | Explique inserção/remoção só com prev/next do passo |
| Layout de árvore | `treeLayout` (em-ordem) | Desenhe a árvore de `[50,30,70,20,40]` e confira os x |
| Geometria de curva e amostragem | `treeEdgeGeometry`, `treeEdgePointAt` | Ache o ponto médio da curva e anime um círculo por ela |
| Interpolação e easing | `treeFrame`, `DSV.anim.ease` | Troque por ease-in-out e sinta a diferença |
| FLIP | `anim.js` | Reimplemente o FLIP em 20 linhas para um `<ul>` |
| Transform de viewport | zoom no cursor, CSS vars | Derive a fórmula do zoom no ponto no papel |
| Ciclo de vida de RAF | `startTreeFrame` (para quando `active` é falso) | Meça que não há RAF rodando em repouso |
| Máquina de estados | `state`, `goto` | Desenhe o diagrama de estados de `playing/debug/stale` |
| Persistência local | `buffers`, migração | Apague a chave e veja a migração do formato antigo |
| Headers/CSP | `vercel.json` | Explique por que `style-src` inclui `unsafe-inline` |
| Testes sem framework | `run-tests.js` | Escreva o harness `test/assert/eq` de memória |
| DOM simulado | `run-ui-smoke.js` | Adicione um handler de evento novo ao simulador |

---

## 12. Exercícios de evolução (com critério de aceite)

1. **`switch/case`** — implementar no tokenizer (`case`, `default`, `:`), no parser
   (statement com casos e `break`) e no interpretador. **Aceite:** `switch` com
   `break`/`default` funciona e um teste no harness cobre.
2. **`Map`/`Set` didáticos** — criar na biblioteca nativa (sem `try/catch`), com
   `get/set/has/delete` ou `add/has/delete`, e um visualizador simples de "tabela
   hash" (lista de baldes). **Aceite:** exemplo novo aparece no seletor e nos testes.
3. **Exportar/importar trace (JSON)** — botão que baixa `steps`/`output` e outro que
   recarrega sem re-executar. **Aceite:** duas sessões abrem o mesmo trace.
4. **Breakpoints** — clicar no gutter marca a linha; ao chegar nela, pausa. **Aceite:**
   com 2 breakpoints, o play para nos dois e "continuar" retoma.
5. **Modo exercício** — o portal propõe um objetivo ("deixe a árvore com estes nós") e
   compara a estrutura final. **Aceite:** dois exercícios (pilha e BST) com validação.
6. **Usar o `rough.js` de verdade** — um "modo lousa" que desenha arestas/nós com o
   traço à mão determinístico. **Aceite:** o modo liga/desliga e o desenho é o mesmo ao
   voltar num passo.
7. **Visualizador de grafo** — lista de adjacência como objeto/array, reusando a cena
   SVG. **Aceite:** BFS/DFS marca visitados por época como a árvore.
8. **Rodar o interpretador no Node como CLI** — `node cli.js arquivo.js --passo 10`
   imprime o estado do passo. **Aceite:** mesmo trace do navegador.
9. **Caça a bug com teste primeiro** — pegue qualquer divergência real que encontrar
   (ex.: um método nativo faltando, uma animação travada), escreva um teste que falha,
   conserte, veja passar. **Aceite:** `npm test` verde e o teste novo documenta o caso.

---

## 13. Checklist final: "consigo fazer isso sozinho?"

- [ ] Explico, sem olhar, o pipeline tokenizer → parser → interpreter → trace → análise → render.
- [ ] Desenho o formato de um `step` e de um valor serializado (`p/a/o/fn/c/ref/trunc`).
- [ ] Implemento um tokenizador com números de linha e mensagens de erro.
- [ ] Implemento um parser de descida recursiva com a escada de precedência.
- [ ] Implemento escopos com cadeia de envs, `const`, hoisting e `for-let` por iteração.
- [ ] Implemento `return/break/continue` por sinais e explico por quê.
- [ ] Congelo o estado a cada comando e monto um playback com slider.
- [ ] Detecção de estrutura por forma + nomes + evidência, com pontuação.
- [ ] Seletor com escolha manual e seleção estável entre passos.
- [ ] Visitas por época e explicações por diff dos passos vizinhos.
- [ ] Desenho pilha, fila, lista, dupla, array e árvore com uma linguagem visual única.
- [ ] Explico e implemento FLIP; sei quando cair para "reconstruir sem animação".
- [ ] Implemento uma cena SVG com RAF, interpolação e curvas com ponta.
- [ ] Implemento pan/zoom com transform e enquadramento automático por política.
- [ ] Faço um editor com textarea + realce espelhado e medição de caractere.
- [ ] Testo núcleo sem framework, simulo DOM e escrevo e2e só do que sobra.
- [ ] Publico um site estático com CSP/cache e explico o que cada header faz.

---

## Apêndice A — exemplo de dados reais (para conferir com o seu)

Depois de rodar `const pilha=[]; pilha.push(1);` (valores reais, copiados da execução):

```js
step = {
  i: 1,
  line: 2,
  kind: 'stmt',
  globals: {
    pilha: { t: 'a', id: 6, items: [ { t: 'p', v: 1 } ] }
  },
  locals: {},
  thisVal: null,
  pointers: { '6': ['pilha'] },
  stack: [],
  events: [ { type: 'push', targetId: 6, values: [1], text: 'push(1)' } ]
}
// __filled: true é contabilidade interna do interpretador
```

Repare que o id é **6**, não 1: os objetos de `console`, `Math`, `JSON`, `Array` e
`Object` são criados antes do código do usuário e já consomem os primeiros ids — é por
isso que a identidade (`__id`) sempre "existe" para o interpretador e nunca é presumida
pelo renderizador (ele só compara ids iguais).

E `DSV.buildOpsMap` devolve `{ 6: { push: 1, pop: 0, shift: 0, unshift: 0, splice: 0 } }`
— a evidência que faz a detecção reconhecer a pilha (nome + evento), com `score: 8.5`
(6 pelo nome + 0,5 pelo `push` + 2 de bônus da regra).

Verifique você mesmo:

```bash
node -e "
const fs=require('fs'),vm=require('vm');
['js/util.js','js/tokenizer.js','js/parser.js','js/interpreter.js','js/views.js']
  .forEach(f=>vm.runInThisContext(fs.readFileSync(f,'utf8'),{filename:f}));
const t=DSV.interpret('const pilha=[]\npilha.push(1);');
console.log(JSON.stringify(DSV.buildOpsMap(t.steps)));
console.log(JSON.stringify(t.steps[t.steps.length-1].pointers));
"
```

## Apêndice B — glossário curto

- **passo (step)**: estado congelado de um comando concluído.
- **trace**: a lista de passos + saída + erro.
- **serializado (sv)**: cópia do valor no formato `{ t, ... }`.
- **ponteiro**: nome de variável que aponta para um objeto do passo.
- **candidato**: estrutura detectada num passo, com pontuação.
- **seleção (sel)**: o candidato que está sendo desenhado.
- **ctx**: pacote de fatos e vizinhos que o renderizador recebe.
- **época**: execução de uma operação (método mais externo na pilha), que delimita o
  reinício das marcas de visita.
- **FLIP**: técnica de animação medir → reconstruir → inverter → reproduzir.
- **stale**: o texto do editor já não corresponde ao trace executado.
