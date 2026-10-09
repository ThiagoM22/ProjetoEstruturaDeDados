/* ED Viz — testes do núcleo (tokenizer, parser, interpretador, exemplos).
 * Rode com: node tests/run-tests.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
['js/util.js', 'js/tokenizer.js', 'js/parser.js', 'js/interpreter.js', 'js/examples.js', 'js/anim.js', 'js/rough.js', 'js/views.js'].forEach((f) => {
  const full = path.join(root, f);
  vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
});

const DSV = globalThis.DSV;

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    failures.push(name + ' :: ' + e.message);
    console.log('FAIL  ' + name + '\n      ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'condição falsa');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'valores diferentes') + ' — esperado: ' + JSON.stringify(expected) + ', obtido: ' + JSON.stringify(actual));
  }
}

function run(code, opts) {
  return DSV.interpret(code, opts);
}

function outputs(trace) {
  return trace.output.map((o) => o.text);
}

function noError(trace, label) {
  if (trace.error) {
    throw new Error((label || 'erro inesperado') + ' — linha ' + trace.error.line + ': ' + trace.error.message);
  }
}

function lastStep(trace) {
  return trace.steps[trace.steps.length - 1];
}

/* Renderiza a fila de um passo num contêiner sem DOM (fallback do flipRender)
 * e devolve o HTML gerado — permite testar a visualização no núcleo. */
function renderQueueStep(trace, step) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'queue')[0];
  assert(sel, 'fila detectada para o render');
  const container = {};
  DSV.renderStructure(container, sel, step, {
    opsMap: opsMap,
    pointers: step.pointers || {},
    events: step.events || []
  });
  return container.innerHTML;
}

/* ---------------------------------------------------------------- */
console.log('\n[tokenizar/parsear/executar básico]');

test('aritmética com precedência', () => {
  const t = run("console.log(1 + 2 * 3);");
  noError(t);
  eq(outputs(t)[0], '7');
});

test('strings, concatenação e template literal', () => {
  const t = run("console.log('a' + 1, `x${2 + 3}y`);");
  noError(t);
  eq(outputs(t)[0], 'a1 x5y');
});

test('typeof e objeto silencioso (estilo probe-erro.js)', () => {
  const t = run("const l = {}; l.autor = 'Cleiton'; console.log(typeof l.autor, l.autor);");
  noError(t);
  eq(outputs(t)[0], 'string Cleiton');
});

test('ternário, && e ||', () => {
  const t = run("const a = 5; console.log(a > 3 ? 'grande' : 'pequeno', a > 10 && 'x', a < 10 || 'y');");
  noError(t);
  eq(outputs(t)[0], 'grande false true');
});

test('array methods: sort/join/map', () => {
  const t = run("[3, 1, 2].sort();\nconst a = [3, 11, 2].sort();\nconsole.log(a.join('-'));\nconsole.log(a.map(function (x) { return x * 2; }).join(','));");
  noError(t);
  eq(outputs(t)[0], '11-2-3');
  eq(outputs(t)[1], '22,4,6');
});

test('arrow functions com map/filter/reduce', () => {
  const t = run("console.log([1, 2, 3, 4].map(x => x * 2).filter(x => x > 4).reduce((a, b) => a + b, 0));");
  noError(t);
  eq(outputs(t)[0], '14');
});

test('for-of em string com toUpperCase', () => {
  const t = run("let s = '';\nfor (const c of 'abc') { s = s + c.toUpperCase(); }\nconsole.log(s);");
  noError(t);
  eq(outputs(t)[0], 'ABC');
});

test('classe, new, this e método', () => {
  const t = run([
    'class Contador {',
    '  constructor() { this.n = 0; }',
    '  incrementar() { this.n = this.n + 1; return this.n; }',
    '}',
    'const c = new Contador();',
    'c.incrementar();',
    'c.incrementar();',
    "console.log('n =', c.n);"
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], 'n = 2');
});

test('recursão: fatorial', () => {
  const t = run("function fat(n) { if (n <= 1) { return 1; } return n * fat(n - 1); }\nconsole.log(fat(5));");
  noError(t);
  eq(outputs(t)[0], '120');
});

test('içamento de função declarada depois do uso', () => {
  const t = run("console.log(dobro(21));\nfunction dobro(x) { return x * 2; }");
  noError(t);
  eq(outputs(t)[0], '42');
});

test('while com break e continue', () => {
  const t = run([
    'let i = 0;',
    'let soma = 0;',
    'while (i < 10) {',
    '  i = i + 1;',
    '  if (i === 3) { continue; }',
    '  if (i === 6) { break; }',
    '  soma = soma + i;',
    '}',
    "console.log('soma =', soma);"
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], 'soma = 12'); /* 1+2+4+5 */
});

/* ---------------------------------------------------------------- */
console.log('\n[estruturas: passos, eventos e ponteiros]');

test('pilha (array): eventos push/pop e estado final', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'pilha-array');
  const t = run(example.code);
  noError(t, 'exemplo pilha');
  const events = t.steps.flatMap((s) => s.events);
  assert(events.some((e) => e.type === 'push'), 'deve registrar push');
  assert(events.some((e) => e.type === 'pop'), 'deve registrar pop');
  const pushEvents = events.filter((e) => e.type === 'push');
  eq(pushEvents.length, 3, 'quantidade de push');
  const last = lastStep(t);
  eq(last.globals.pilha.items.length, 1, 'sobrou 1 item na pilha');
  eq(last.globals.pilha.items[0].v, 10, 'sobrou o 10');
});

test('pilha (classe): detecta itens e continua funcionando', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'pilha-classe');
  const t = run(example.code);
  noError(t, 'exemplo pilha-classe');
  const events = t.steps.flatMap((s) => s.events);
  eq(events.filter((e) => e.type === 'push').length, 3);
  eq(events.filter((e) => e.type === 'pop').length, 2);
  assert(outputs(t).some((o) => o.indexOf('Vazia? false') === 0), 'deve imprimir Vazia? false');
  const last = lastStep(t);
  assert(last.globals.pilha && last.globals.pilha.ctor === 'Pilha', 'serializa instância com ctor Pilha');
  eq(last.globals.pilha.props.itens.items.length, 1);
});

test('fila: ordem FIFO', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'fila-array');
  const t = run(example.code);
  noError(t, 'exemplo fila');
  const outs = outputs(t).filter((o) => o.indexOf('Atendendo:') === 0 || o.indexOf('Fila agora:') === 0);
  eq(outs[0], 'Atendendo: Ana', 'primeiro atendido');
  eq(outs[1], 'Atendendo: Bruno', 'segundo atendido');
  eq(outs[2], 'Fila agora: Carla');
  const events = t.steps.flatMap((s) => s.events);
  eq(events.filter((e) => e.type === 'shift').length, 2);
});

test('fila: FIFO completo (A,B,C → dequeue A → front B → enqueue D)', () => {
  const t = run([
    'const fila = [];',
    "console.log('vazia?', fila.length === 0);",
    "fila.push('A');",
    "fila.push('B');",
    "fila.push('C');",
    "console.log('ordem:', fila.join(','));",
    "console.log('saiu:', fila.shift());",
    "console.log('frente:', fila[0]);",
    "console.log('tamanho:', fila.length);",
    "fila.push('D');",
    "console.log('ordem:', fila.join(','));",
    "console.log('tamanho:', fila.length);"
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[0], 'vazia? true', 'fila vazia no começo');
  eq(outs[1], 'ordem: A,B,C', 'ordem FIFO A,B,C');
  eq(outs[2], 'saiu: A', 'dequeue devolve o primeiro');
  eq(outs[3], 'frente: B', 'B passa a ser o primeiro');
  eq(outs[4], 'tamanho: 2', 'tamanho depois do dequeue');
  eq(outs[5], 'ordem: B,C,D', 'D entra no fim da fila');
  eq(outs[6], 'tamanho: 3', 'tamanho depois do enqueue');
});

test('fila vazia: dequeue e front devolvem undefined (contrato do projeto)', () => {
  const t = run([
    'const fila = [];',
    "console.log('saiu:', fila.shift());",
    "console.log('frente:', fila[0]);",
    "console.log('tamanho:', fila.length);"
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[0], 'saiu: undefined', 'dequeue de fila vazia');
  eq(outs[1], 'frente: undefined', 'front de fila vazia');
  eq(outs[2], 'tamanho: 0', 'tamanho continua 0');
  const events = t.steps.flatMap((s) => s.events);
  eq(events.filter((e) => e.type === 'shift').length, 0, 'shift vazio não registra operação');
});

test('fila (classe): API enfileirar/desenfileirar/frente/estaVazia/tamanho', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'fila-classe');
  assert(example, 'exemplo fila-classe existe');
  const t = run(example.code);
  noError(t, 'exemplo fila-classe');
  const outs = outputs(t);
  assert(outs.some((o) => o === 'Vazia no começo? true'), 'estaVazia() com fila vazia');
  assert(outs.some((o) => o === 'Frente: A'), 'frente() devolve A');
  assert(outs.some((o) => o === 'Tamanho: 3'), 'tamanho() antes do dequeue');
  assert(outs.some((o) => o === 'Desenfileirando: A'), 'desenfileirar() devolve A');
  assert(outs.some((o) => o === 'Agora a frente é: B'), 'frente() passa a ser B');
  assert(outs.some((o) => o === 'Vazia? false'), 'estaVazia() false');
  assert(outs.some((o) => o === 'Tamanho: 2'), 'tamanho() depois do dequeue');
  const last = lastStep(t);
  eq(last.globals.fila.props.itens.items.map((i) => i.v).join(','), 'B,C', 'restam B e C na ordem FIFO');
});

test('campos privados (#): a Fila com #items/#inicio/#fim roda sem mudanças', () => {
  const t = run([
    'class Fila {',
    '  #items = [];',
    '  #inicio = 0;',
    '  #fim = 0;',
    '',
    '  enqueue(elemento) {',
    '    this.#items[this.#fim] = elemento;',
    '    this.#fim++;',
    '  }',
    '',
    '  dequeue() {',
    '    if (this.estaVazia()) { return undefined; }',
    '    const item = this.#items[this.#inicio];',
    '    delete this.#items[this.#inicio];',
    '    this.#inicio++;',
    '    if (this.#inicio === this.#fim) { this.#inicio = 0; this.#fim = 0; }',
    '    return item;',
    '  }',
    '',
    '  front() {',
    '    if (this.estaVazia()) { return undefined; }',
    '    return this.#items[this.#inicio];',
    '  }',
    '  estaVazia = () => this.#fim === this.#inicio;',
    '  tamanho = () => this.#fim - this.#inicio;',
    '',
    '  limpar() {',
    '    this.#items = [];',
    '    this.#inicio = 0;',
    '    this.#fim = 0;',
    '  }',
    '}',
    '',
    'const fila = new Fila();',
    'console.log(fila.estaVazia(), fila.tamanho());',
    "fila.enqueue('A');",
    "fila.enqueue('B');",
    "fila.enqueue('C');",
    'console.log(fila.front(), fila.tamanho());',
    'console.log(fila.dequeue());',
    'console.log(fila.front(), fila.tamanho());',
    "fila.enqueue('D');",
    'console.log(fila.dequeue(), fila.dequeue(), fila.dequeue());',
    'console.log(fila.dequeue(), fila.estaVazia());'
  ].join('\n'));
  noError(t, 'Fila com campos privados');
  const outs = outputs(t);
  eq(outs[0], 'true 0', 'começa vazia');
  eq(outs[1], 'A 3', 'frente e tamanho');
  eq(outs[2], 'A', 'dequeue devolve A');
  eq(outs[3], 'B 2', 'frente passa a ser B');
  eq(outs[4], 'B C D', 'ordem FIFO');
  eq(outs[5], 'undefined true', 'fila esvazia no fim');
  const last = lastStep(t);
  const props = last.globals.fila.props;
  assert(props['#items'] && props['#items'].t === 'a', 'serializa o campo privado #items');
  eq(props['#items'].items.length, 4, 'o array interno preserva o histórico de posições');
  eq(props['#inicio'].v, 0, '#inicio volta a zero');
  eq(props['#fim'].v, 0, '#fim volta a zero');
  const cands = DSV.detectStructures(last, DSV.buildOpsMap(t.steps));
  assert(cands.some((c) => c.type === 'queue'), 'portal continua detectando a fila com campo privado');

  /* o desenho segue a janela #inicio/#fim, não o array bruto com buracos */
  const opsMap = DSV.buildOpsMap(t.steps);
  const renders = [];
  t.steps.forEach((step) => {
    const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'queue')[0];
    if (!sel) return;
    const container = {};
    DSV.renderStructure(container, sel, step, { opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [] });
    renders.push(container.innerHTML);
  });
  assert(renders.length > 5, 'renderiza a fila ao longo do trace');
  renders.forEach((html, i) => {
    assert(html.indexOf('cell-val">undefined') < 0, 'passo ' + i + ': buraco do delete não vira célula da fila');
  });
  const todosABC = renders.filter((h) => h.indexOf('&quot;A&quot;') >= 0 && h.indexOf('&quot;B&quot;') >= 0 && h.indexOf('&quot;C&quot;') >= 0).pop();
  assert(todosABC, 'passo com A, B e C');
  assert(todosABC.split('queue-cell').length - 1 === 3, 'três elementos enfileirados');
  const unidadesABC = todosABC.split('queue-unit');
  assert(unidadesABC[1].indexOf('ptr-front') >= 0 && unidadesABC[1].indexOf('&quot;A&quot;') >= 0, 'FRONT em A (índice real 0)');
  assert(unidadesABC[3].indexOf('ptr-rear') >= 0 && unidadesABC[3].indexOf('&quot;C&quot;') >= 0, 'REAR em C (índice real 2)');
  const passoBC = renders.filter((h) => h.indexOf('&quot;B&quot;') >= 0 && h.indexOf('&quot;C&quot;') >= 0 && h.indexOf('&quot;D&quot;') < 0).pop();
  assert(passoBC, 'passo com a fila B, C');
  assert(passoBC.split('queue-cell').length - 1 === 2, 'só B e C desenhados, sem buracos');
  assert(passoBC.indexOf('índice 1') >= 0 && passoBC.indexOf('índice 2') >= 0, 'índices reais [1] e [2]');
  assert(passoBC.indexOf('índice 0') < 0, 'buraco do índice 0 fora do desenho');
  const unidadesBC = passoBC.split('queue-unit');
  assert(unidadesBC[1].indexOf('ptr-front') >= 0 && unidadesBC[1].indexOf('&quot;B&quot;') >= 0, 'FRONT em B (índice real 1)');
  assert(unidadesBC[2].indexOf('ptr-rear') >= 0 && unidadesBC[2].indexOf('&quot;C&quot;') >= 0, 'REAR em C');
  const ultimoRender = renders[renders.length - 1];
  assert(ultimoRender.indexOf('A fila está vazia neste passo.') >= 0, 'fila vazia mesmo com histórico no array');
  assert(ultimoRender.indexOf('ptr-front') < 0 && ultimoRender.indexOf('ptr-rear') < 0, 'sem indicadores no vazio');
});

test('campo privado fora da classe: erro de sintaxe', () => {
  const t = run([
    'class Caixa {',
    '  #segredo = 42;',
    '  abrir() { return this.#segredo; }',
    '}',
    'const c = new Caixa();',
    'console.log(c.#segredo);'
  ].join('\n'));
  assert(t.error, 'deve haver erro');
  eq(t.error.line, 6, 'linha do erro');
  assert(/só pode ser usado dentro da classe/.test(t.error.message), 'mensagem: ' + (t.error && t.error.message));
});

test('campo privado não declarado na classe: erro de sintaxe', () => {
  const t = run(['class A {', '  ver() { return this.#x; }', '}'].join('\n'));
  assert(t.error, 'deve haver erro');
  eq(t.error.line, 2, 'linha do erro');
  assert(/não foi declarado na classe/.test(t.error.message), 'mensagem: ' + (t.error && t.error.message));
});

test('método privado (#m) e escrita em campo privado', () => {
  const t = run([
    'class Conta {',
    '  #saldo = 0;',
    '  depositar(v) {',
    '    this.#saldo = this.#saldo + v;',
    '    return this.#saldoComJuros();',
    '  }',
    '  #saldoComJuros() { return this.#saldo * 2; }',
    '}',
    'const c = new Conta();',
    'console.log(c.depositar(30));'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '60', 'método privado chamado de dentro da classe');
});

test('delete em propriedade e em índice de array', () => {
  const t = run([
    'const o = { a: 1, b: 2 };',
    'delete o.a;',
    'console.log(o.a, o.b);',
    'const arr = [10, 20, 30];',
    'delete arr[1];',
    'console.log(arr.length, arr[1], arr[0], arr[2]);'
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[0], 'undefined 2', 'propriedade apagada');
  eq(outs[1], '3 undefined 10 30', 'delete deixa buraco e não mexe no length');
});

test('delete em campo privado: erro de sintaxe', () => {
  const t = run(['class A {', '  #x = 1;', '  apagar() { delete this.#x; }', '}'].join('\n'));
  assert(t.error, 'deve haver erro');
  eq(t.error.line, 3, 'linha do erro');
  assert(/não podem ser apagados/.test(t.error.message), 'mensagem: ' + (t.error && t.error.message));
});

test('static/get/set/async em classe: erro claro (não suportado)', () => {
  const t = run(['class A {', '  static x = 1;', '}'].join('\n'));
  assert(t.error, 'static deve dar erro');
  assert(/não são suportados/.test(t.error.message), 'mensagem: ' + (t.error && t.error.message));
  const g = run(['class A {', '  get x() { return 1; }', '}'].join('\n'));
  assert(g.error, 'getter deve dar erro');
  assert(/não são suportados/.test(g.error.message), 'mensagem: ' + (g.error && g.error.message));
});

test('detecção: push/shift vira fila; push/pop continua pilha', () => {
  const tq = run("const fila = [];\nfila.push(1);\nfila.shift();");
  noError(tq);
  const cq = DSV.detectStructures(lastStep(tq), DSV.buildOpsMap(tq.steps));
  assert(cq.some((c) => c.type === 'queue'), 'fila detectada: ' + cq.map((c) => c.type).join(', '));
  const ts = run("const pilha = [];\npilha.push(1);\npilha.pop();");
  noError(ts);
  const cs = DSV.detectStructures(lastStep(ts), DSV.buildOpsMap(ts.steps));
  assert(cs.some((c) => c.type === 'stack'), 'pilha continua pilha');
  assert(!cs.some((c) => c.type === 'queue'), 'pilha não é confundida com fila');
});

test('render da fila: FRONT no início, REAR no fim e índices visíveis', () => {
  const t = run(["const fila = [];", "fila.push('A');", "fila.push('B');", "fila.push('C');"].join('\n'));
  noError(t);
  const step = t.steps.filter((s) => s.globals.fila && s.globals.fila.items.length === 3)[0];
  assert(step, 'passo com três itens');
  const html = renderQueueStep(t, step);
  const parts = html.split('queue-unit');
  eq(parts.length, 4, 'três nós desenhados');
  assert(parts[1].indexOf('ptr-front') >= 0 && parts[1].indexOf('&quot;A&quot;') >= 0, 'FRONT aponta para A (índice 0)');
  assert(parts[3].indexOf('ptr-rear') >= 0 && parts[3].indexOf('&quot;C&quot;') >= 0, 'REAR aponta para C (último)');
  assert(parts[2].indexOf('ptr-') < 0, 'nó do meio sem indicador');
  assert(html.indexOf('[0]') >= 0 && html.indexOf('[2]') >= 0, 'índices discretos dos nós');
  assert(html.indexOf('queue-cell front') >= 0, 'nó da frente destacado');
  assert(html.indexOf('A fila está vazia') < 0, 'fila com itens não mostra mensagem de vazia');
});

test('render da fila: unshift/pop inverte as extremidades (FRONT à direita)', () => {
  const t = run(["const fila = [];", "fila.unshift('A');", "fila.unshift('B');", "fila.unshift('C');", 'fila.pop();'].join('\n'));
  noError(t);
  const step = t.steps.filter((s) => s.globals.fila && s.globals.fila.items.length === 3)[0];
  assert(step, 'passo com três itens');
  const html = renderQueueStep(t, step);
  const parts = html.split('queue-unit');
  eq(parts.length, 4, 'três nós desenhados');
  assert(parts[1].indexOf('ptr-rear') >= 0 && parts[1].indexOf('&quot;C&quot;') >= 0, 'REAR no nó C (índice 0)');
  assert(parts[3].indexOf('ptr-front') >= 0 && parts[3].indexOf('&quot;A&quot;') >= 0, 'FRONT no nó A (índice 2, próximo pop)');
});

test('render da fila vazia: mensagem discreta e nenhum indicador', () => {
  const t = run("const fila = [];\nfila.push(1);\nfila.shift();");
  noError(t);
  const html = renderQueueStep(t, t.steps[0]);
  assert(html.indexOf('A fila está vazia neste passo.') >= 0, 'mensagem de fila vazia');
  assert(html.indexOf('ptr-front') < 0 && html.indexOf('ptr-rear') < 0, 'sem indicadores para nós inexistentes');
  assert(html.indexOf('queue-cell') < 0, 'sem nós');
});

test('CSS da fila: linha única sem quebra (fila extensa é navegada pelo canvas)', () => {
  const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  const m = css.match(/\.queue-row\s*\{[^}]*\}/);
  assert(m, 'regra .queue-row existe');
  assert(/nowrap/.test(m[0]), 'fila em linha única: ' + m[0]);
  assert(!/flex-wrap:\s*wrap/.test(m[0]), 'não quebra linha');
});

test('lista encadeada: visita 10, 20, 30 e tem ponteiro atual', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'lista-encadeada');
  const t = run(example.code);
  noError(t, 'exemplo lista');
  const outs = outputs(t);
  assert(outs.some((o) => o.indexOf('Visitando o nó: 10') === 0), 'visita o 10');
  assert(outs.some((o) => o.indexOf('Visitando o nó: 20') === 0), 'visita o 20');
  assert(outs.some((o) => o.indexOf('Visitando o nó: 30') === 0), 'visita o 30');
  const hasAtual = t.steps.some((s) => {
    const locals = s.locals || {};
    return Object.keys(locals).some((k) => k === 'atual');
  });
  assert(hasAtual, 'em algum passo existe a variável "atual"');
  const last = lastStep(t);
  eq(last.globals.lista.props.inicio.props.valor.v, 10, 'início é o nó 10');
  eq(last.globals.lista.props.inicio.props.proximo.props.valor.v, 20, '10 aponta para 20');
});

/* ---------------------------------------------------------------- */
console.log('\n[lista simplesmente encadeada: operações, integridade e render]');

const listaSimplesExample = () => DSV.EXAMPLES.find((e) => e.id === 'lista-simples');

/* executa o corpo de teste com as classes Node/LinkedList do exemplo real,
 * sem repetir a definição em cada caso */
function runLista(corpo) {
  const ex = listaSimplesExample();
  assert(ex, 'exemplo lista-simples existe');
  const classes = ex.code.split('\nconst lista = new LinkedList();')[0];
  return run(classes + '\nconst lista = new LinkedList();\n' + corpo);
}

function listaWrapper(step, name) {
  const holder = (step.globals && step.globals[name]) || (step.locals && step.locals[name]);
  return holder && holder.t === 'o' ? holder : null;
}

function listaHead(wrapper) {
  if (!wrapper) return null;
  const p = prop(wrapper, '#head') || prop(wrapper, 'head');
  return p && p.t === 'o' ? p : null;
}

/* valores na ordem real das referências; para em ciclo acidental */
function listaValues(wrapper) {
  const out = [];
  const seen = {};
  let n = listaHead(wrapper);
  while (n && !seen[n.id]) {
    seen[n.id] = true;
    const v = prop(n, 'value') || prop(n, 'valor');
    out.push(v && v.t === 'p' ? v.v : '?');
    const nx = prop(n, 'next') || prop(n, 'proximo');
    n = nx && nx.t === 'o' ? nx : null;
  }
  return out;
}

function listaLength(wrapper) {
  if (!wrapper) return null;
  const p = prop(wrapper, '#length') || prop(wrapper, 'length') || prop(wrapper, 'tamanho');
  return p && p.t === 'p' ? p.v : null;
}

/* último nó e a referência que o encerra (para conferir o terminador) */
function listaTail(wrapper) {
  let n = listaHead(wrapper);
  const seen = {};
  while (n && !seen[n.id]) {
    seen[n.id] = true;
    const nx = prop(n, 'next') || prop(n, 'proximo');
    if (!(nx && nx.t === 'o')) return { node: n, ref: nx };
    n = nx;
  }
  return { node: null, ref: null };
}

/* um ciclo acidental faria a caminhada rever um id já visto */
function listaHasCycle(wrapper) {
  const seen = {};
  let n = listaHead(wrapper);
  while (n) {
    if (seen[n.id]) return true;
    seen[n.id] = true;
    const nx = prop(n, 'next') || prop(n, 'proximo');
    n = nx && nx.t === 'o' ? nx : null;
  }
  return false;
}

function finalLista(trace) {
  return listaWrapper(lastStep(trace), 'lista');
}

function assertLista(trace, esperado, tamanho, rotulo) {
  const w = finalLista(trace);
  assert(!listaHasCycle(w), (rotulo || 'lista') + ': sem ciclo acidental');
  eq(listaValues(w).join(','), esperado, (rotulo || 'valores') + ' na ordem dos nós');
  eq(listaLength(w), tamanho, (rotulo || 'lista') + ': tamanho');
  const tail = listaTail(w);
  if (esperado) {
    assert(tail.node, (rotulo || 'lista') + ': último nó existe');
    assert(tail.ref && tail.ref.t === 'p' && (tail.ref.v === undefined || tail.ref.v === null),
      (rotulo || 'lista') + ': último nó termina em undefined/null');
  } else {
    assert(!listaHead(w), (rotulo || 'lista') + ': lista vazia não tem head');
  }
  return w;
}

function renderListaStep(trace, step, extra) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'list')[0];
  assert(sel, 'lista detectada para o render');
  const container = {};
  DSV.renderStructure(container, sel, step, Object.assign({
    opsMap: opsMap,
    pointers: step.pointers || {},
    events: step.events || [],
    visit: DSV.computeVisitOrder(trace.steps)
  }, extra || {}));
  return { html: container.innerHTML, sel: sel };
}

test('lista simples: detecção usa o wrapper e o head privado (#head)', () => {
  const t = runLista('lista.insertAtBeginning(10);');
  noError(t);
  const cands = DSV.detectStructures(lastStep(t), DSV.buildOpsMap(t.steps));
  eq(cands[0].type, 'list', 'melhor candidato é a lista');
  eq(cands[0].label, 'lista', 'rótulo é o nome da variável');
  assert(cands[0].id != null, 'identifica o nó do início');
  assertLista(t, '10', 1, 'após inserir');
});

test('lista simples: insertAtBeginning no início e no fim da lista', () => {
  let t = runLista('lista.insertAtBeginning(10);');
  noError(t);
  assertLista(t, '10', 1, 'lista vazia + começo');

  t = runLista('lista.insertAtBeginning(10);\nlista.insertAtBeginning(20);');
  noError(t);
  const w = assertLista(t, '20,10', 2, 'lista preenchida + começo');
  eq(prop(listaHead(w), 'value').v, 20, 'head atualizado para o novo nó');
});

test('lista simples: insertAtEnd no início e no fim da lista', () => {
  let t = runLista('lista.insertAtEnd(10);');
  noError(t);
  assertLista(t, '10', 1, 'lista vazia + fim');

  t = runLista('lista.insertAtEnd(10);\nlista.insertAtEnd(20);\nlista.insertAtEnd(30);');
  noError(t);
  assertLista(t, '10,20,30', 3, 'lista preenchida + fim');
});

test('lista simples: valores duplicados são permitidos e preservam a ordem', () => {
  const t = runLista([
    'lista.insertAtBeginning(10);',
    'lista.insertAtBeginning(10);',
    'lista.insertAtEnd(10);'
  ].join('\n'));
  noError(t);
  assertLista(t, '10,10,10', 3, 'duplicados');
});

test('lista simples: find encontra primeiro, intermediário e último; ausente é undefined', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'console.log(lista.find(10).value);',
    'console.log(lista.find(20).value);',
    'console.log(lista.find(30).value);',
    'console.log(lista.find(99) === undefined);'
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[0], '10', 'primeiro elemento');
  eq(outs[1], '20', 'elemento intermediário');
  eq(outs[2], '30', 'último elemento');
  eq(outs[3], 'true', 'valor inexistente retorna undefined');
  assertLista(t, '10,20,30', 3, 'busca não altera a lista');
});

test('lista simples: find em lista vazia devolve undefined sem erro', () => {
  const t = runLista('console.log(lista.find(1) === undefined, lista.isEmpty());');
  noError(t);
  eq(outputs(t)[0], 'true true');
});

test('lista simples: removeByValue remove o primeiro, o intermediário e o último', () => {
  let t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'lista.removeByValue(10);'
  ].join('\n'));
  noError(t);
  const w1 = assertLista(t, '20,30', 2, 'remover o primeiro');
  eq(prop(listaHead(w1), 'value').v, 20, 'head passa para o sucessor');

  t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'lista.removeByValue(20);'
  ].join('\n'));
  noError(t);
  assertLista(t, '10,30', 2, 'remover o intermediário');

  t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'lista.removeByValue(30);'
  ].join('\n'));
  noError(t);
  assertLista(t, '10,20', 2, 'remover o último');
});

test('lista simples: remover valor inexistente ou de lista vazia preserva a estrutura', () => {
  let t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'console.log(lista.removeByValue(99));'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], 'false', 'inexistente devolve false');
  assertLista(t, '10,20', 2, 'nada foi removido');

  t = runLista('console.log(lista.removeByValue(1), lista.size(), lista.isEmpty());');
  noError(t);
  eq(outputs(t)[0], 'false 0 true', 'lista vazia devolve false e continua vazia');
  assertLista(t, '', 0, 'lista vazia');
});

test('lista simples: removeByValue remove só a primeira ocorrência duplicada', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(30);',
    'lista.removeByValue(10);'
  ].join('\n'));
  noError(t);
  assertLista(t, '20,10,30', 3, 'a segunda ocorrência do 10 permanece');
});

test('lista simples: remover todos os elementos consecutivamente deixa a lista vazia', () => {
  const t = runLista([
    'lista.insertAtEnd(1);',
    'lista.insertAtEnd(2);',
    'lista.insertAtEnd(3);',
    'lista.removeByValue(1);',
    'lista.removeByValue(2);',
    'lista.removeByValue(3);',
    'console.log(lista.isEmpty(), lista.size(), lista.toString(), lista.find(1) === undefined);'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], 'true 0 {  } true');
  assertLista(t, '', 0, 'lista esvaziada');
});

test('lista simples: #length confere com a cadeia real depois de cada operação', () => {
  const ex = listaSimplesExample();
  const t = run(ex.code);
  noError(t, 'exemplo lista simples');
  const src = ex.code.split('\n');
  let conferidas = 0;
  t.steps.forEach((s) => {
    const lineText = src[s.line - 1] || '';
    if (!/\.(insertAtBeginning|insertAtEnd|removeByValue)\s*\(/.test(lineText)) return;
    if ((s.stack || []).length) return; /* dentro do método ainda não terminou */
    const w = s.globals.lista;
    if (!w || w.t !== 'o') return;
    conferidas++;
    assert(!listaHasCycle(w), 'sem ciclo acidental na linha ' + s.line);
    const vals = listaValues(w);
    eq(vals.length, listaLength(w), 'tamanho confere na linha ' + s.line);
    const h = listaHead(w);
    if (vals.length) {
      eq(prop(h, 'value').v, vals[0], 'head é o primeiro nó na linha ' + s.line);
      const tail = listaTail(w);
      assert(tail.node && tail.ref && tail.ref.t === 'p' && tail.ref.v === undefined,
        'último nó termina em undefined na linha ' + s.line);
    } else {
      assert(!h, 'sem head depois de esvaziar na linha ' + s.line);
    }
  });
  assert(conferidas >= 8, 'confere tamanho em várias operações: ' + conferidas);
});

test('lista simples: operações consecutivas mantêm ordem, tamanho e terminador', () => {
  const t = runLista([
    'lista.insertAtBeginning(1);',
    'lista.insertAtEnd(2);',
    'lista.insertAtEnd(3);',
    'lista.insertAtBeginning(0);',
    'lista.removeByValue(0);',
    'lista.removeByValue(2);',
    'lista.insertAtEnd(4);',
    'lista.removeByValue(4);',
    'console.log(lista.toString(), lista.size(), lista.isEmpty());'
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[outs.length - 1], '{ 1 -> 3 } 2 false', 'estado final coerente');
  assertLista(t, '1,3', 2, 'depois das operações mistas');
});

test('lista simples: toString na ordem dos nós, inclusive vazia', () => {
  let t = runLista('console.log(lista.toString());');
  noError(t);
  eq(outputs(t)[0], '{  }', 'lista vazia');

  t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'console.log(lista.toString());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '{ 10 -> 20 }', 'ordem das referências');
});

test('lista simples: size e isEmpty refletem o estado real', () => {
  let t = runLista('console.log(lista.size(), lista.isEmpty());');
  noError(t);
  eq(outputs(t)[0], '0 true', 'lista vazia');

  t = runLista('lista.insertAtBeginning(5);\nconsole.log(lista.size(), lista.isEmpty());');
  noError(t);
  eq(outputs(t)[0], '1 false', 'com um nó');
});

test('lista simples: valores de comprimentos diferentes mantêm a ordem', () => {
  const t = runLista([
    "lista.insertAtEnd('Ana');",
    "lista.insertAtEnd('Guilherme');",
    "lista.insertAtEnd('Bia');",
    'console.log(lista.toString());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '{ Ana -> Guilherme -> Bia }');
  assertLista(t, 'Ana,Guilherme,Bia', 3, 'strings de tamanhos diferentes');
});

test('lista simples: visitas seguem o ponteiro current por operação', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.find(20);'
  ].join('\n'));
  noError(t);
  const visit = DSV.computeVisitOrder(t.steps);
  assert(visit.hasCurrentLike, 'reconhece o cursor current');
  assert(visit.order.length >= 2, 'nós visitados na operação: ' + visit.order.length);
});

test('render da lista: VALUE e NEXT separados, HEAD no primeiro nó e terminador fiel', () => {
  const t = run(listaSimplesExample().code);
  noError(t);
  const last = lastStep(t);
  const r = renderListaStep(t, last);
  assert(r.html.indexOf('list-value">') >= 0, 'região VALUE desenhada');
  assert(r.html.indexOf('list-next"') >= 0 || r.html.indexOf('list-next ') >= 0, 'região NEXT desenhada');
  assert(r.html.indexOf('list-head-tag') >= 0, 'indicador HEAD');
  eq(r.html.split('list-head-tag').length - 1, 1, 'um único HEAD (primeiro nó)');
  assert(r.html.indexOf('list-link') >= 0, 'conexão a partir da região NEXT');
  assert(r.html.indexOf('list-next') < r.html.indexOf('list-link'), 'a conexão vem depois da região NEXT');
  assert(r.html.indexOf('class="list-end"') >= 0, 'terminador compacto desenhado');
  assert(r.html.indexOf('>undefined</div>') < 0 && r.html.indexOf('>null</div>') < 0,
    'terminador não é desenhado como um nó com valor');
  assert(r.html.indexOf('next = undefined') >= 0, 'a referência real (undefined) fica no título do indicador');
});

test('render da lista: terminador compacto também quando o exemplo usa null', () => {
  const ex = DSV.EXAMPLES.find((e) => e.id === 'lista-encadeada');
  const t = run(ex.code);
  noError(t, 'exemplo lista-encadeada');
  const opsMap = DSV.buildOpsMap(t.steps);
  let viuEnd = false;
  t.steps.forEach((s) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    if (!sel || sel.id == null) return;
    const r = renderListaStep(t, s);
    if (r.html.indexOf('class="list-end"') >= 0) {
      viuEnd = true;
      assert(r.html.indexOf('>null</div>') < 0, 'null não vira caixa de nó');
      assert(r.html.indexOf('next = null') >= 0, 'referência null fica no título');
    }
  });
  assert(viuEnd, 'terminador compacto aparece com null');
});

test('render da lista: sem chip decorativo de visita (✓true)', () => {
  const t = run(listaSimplesExample().code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const visit = DSV.computeVisitOrder(t.steps);
  let comVisita = 0;
  t.steps.forEach((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    if (!sel || sel.id == null) return;
    const r = renderListaStep(t, s, { visit: visit, prevStep: i > 0 ? t.steps[i - 1] : null });
    assert(r.html.indexOf('visit-chip') < 0 && r.html.indexOf('✓true') < 0,
      'passo ' + i + ': nenhum chip de visita');
    if (/list-node visited/.test(r.html)) comVisita++;
  });
  assert(comVisita >= 1, 'o destaque de visitado continua no nó (roxo suave)');
});

test('render da lista: listas curtas desenham maiores (--list-scale por faixa)', () => {
  const curta = runLista('lista.insertAtEnd(10);');
  noError(curta);
  const r1 = renderListaStep(curta, lastStep(curta));
  assert(r1.html.indexOf('--list-scale:1.4') >= 0, 'um nó usa a escala maior');

  const media = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);'
  ].join('\n'));
  noError(media);
  const r3 = renderListaStep(media, lastStep(media));
  assert(r3.html.indexOf('--list-scale:1.22') >= 0, 'três nós usam a escala intermediária');

  const longa = runLista([
    'for (let i = 1; i <= 9; i++) { lista.insertAtEnd(i); }'
  ].join('\n'));
  noError(longa);
  const r9 = renderListaStep(longa, lastStep(longa));
  assert(r9.html.indexOf('--list-scale:1"') >= 0, 'lista longa usa o tamanho-base');
});

test('render da lista: NEXT do nó pendente destaca a ligação ao antigo HEAD', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtBeginning(5);'
  ].join('\n'));
  noError(t);
  const src = listaSimplesExample().code.split('\n');
  const opsMap = DSV.buildOpsMap(t.steps);
  let viuPendingChanged = false;
  let viuPendingEstavel = false;
  t.steps.forEach((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    if (!sel) return;
    const r = renderListaStep(t, s, { prevStep: i > 0 ? t.steps[i - 1] : null });
    const linha = (src[s.line - 1] || '').trim();
    const pending = r.html.match(/<div class="list-unit pending"[\s\S]*?<\/div><\/div><\/div>/);
    if (!pending) return;
    const temChanged = pending[0].indexOf('list-next changed') >= 0;
    if (linha === 'newNode.next = this.#head;') {
      assert(temChanged, 'a atribuição de next no pendente fica destacada');
      viuPendingChanged = true;
    }
    if (linha === 'const newNode = new Node(value);') {
      assert(!temChanged, 'o nó recém-criado não nasce com destaque de referência');
      viuPendingEstavel = true;
    }
  });
  assert(viuPendingChanged, 'passo da ligação do pendente reconhecido');
  assert(viuPendingEstavel, 'passo de criação do pendente reconhecido');
});

test('render da lista vazia: HEAD aponta para o terminador, sem nó inventado', () => {
  const t = run(listaSimplesExample().code);
  noError(t);
  const idx = t.steps.findIndex((s) => s.globals.lista && s.globals.lista.t === 'o' && !s.globals.lista.props['#head'].v
    && s.globals.lista.props['#head'].t === 'p');
  assert(idx >= 0, 'existe passo com a lista vazia');
  const r = renderListaStep(t, t.steps[idx]);
  eq(r.sel.id, null, 'seleção sem nó de início');
  assert(r.html.indexOf('list-head-tag') >= 0, 'HEAD desenhado');
  assert(r.html.indexOf('list-link') >= 0, 'conexão até o terminador');
  assert(r.html.indexOf('class="list-end"') >= 0, 'terminador compacto desenhado');
  assert(r.html.indexOf('list-value') < 0, 'nenhum nó com valor');
  assert(r.html.indexOf('A lista está vazia neste passo.') >= 0, 'nota discreta de vazio');
});

test('render da lista: nó atual em roxo, visitados e referência alterada destacados', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'lista.find(30);'
  ].join('\n'));
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const visit = DSV.computeVisitOrder(t.steps);
  let ativos = 0;
  let visitados = 0;
  t.steps.forEach((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    if (!sel || sel.id == null) return;
    const r = renderListaStep(t, s, { visit: visit, prevStep: i > 0 ? t.steps[i - 1] : null, steps: t.steps, stepIndex: i });
    if (/list-node active/.test(r.html)) ativos++;
    if (/list-node visited/.test(r.html)) visitados++;
  });
  assert(ativos >= 3, 'nós examinados com realce principal: ' + ativos);
  assert(visitados >= 1, 'visitados em roxo suave: ' + visitados);
});

test('render da lista: nó criado aparece fora da lista, ligação e HEAD em destaque', () => {
  const t = runLista([
    'lista.insertAtBeginning(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtBeginning(5);'
  ].join('\n'));
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const visit = DSV.computeVisitOrder(t.steps);
  let pendente = false;
  let nextChanged = false;
  let headChanged = false;
  t.steps.forEach((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    if (!sel) return;
    const r = renderListaStep(t, s, {
      visit: visit,
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: i < t.steps.length - 1 ? t.steps[i + 1] : null,
      steps: t.steps,
      stepIndex: i
    });
    if (/list-unit pending/.test(r.html)) pendente = true;
    if (/list-next changed/.test(r.html)) nextChanged = true;
    if (/list-head-tag changed/.test(r.html)) headChanged = true;
  });
  assert(pendente, 'nó recém-criado aparece fora da lista até ser ligado');
  assert(nextChanged, 'referência NEXT alterada destacada (inserção no final)');
  assert(headChanged, 'HEAD destacado quando passa para outro nó');
});

test('render da lista: nó removido não continua no desenho', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'lista.removeByValue(20);'
  ].join('\n'));
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const visit = DSV.computeVisitOrder(t.steps);
  let nextChanged = false;
  t.steps.forEach((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    if (!sel || sel.id == null) return;
    const r = renderListaStep(t, s, { visit: visit, prevStep: i > 0 ? t.steps[i - 1] : null, steps: t.steps, stepIndex: i });
    if (/list-next changed/.test(r.html)) nextChanged = true;
    if (i === t.steps.length - 1) {
      const vals = (r.html.match(/list-value">([^<]*)</g) || []).map((x) => x.replace('list-value">', '').replace('<', ''));
      eq(vals.join(','), '10,30', 'o nó removido não aparece');
    }
  });
  assert(nextChanged, 'referência do predecessor destacada na remoção');
});

test('render da lista: nó que será removido no próximo passo fica sinalizado', () => {
  const t = runLista([
    'lista.insertAtEnd(10);',
    'lista.insertAtEnd(20);',
    'lista.insertAtEnd(30);',
    'lista.removeByValue(20);'
  ].join('\n'));
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const visit = DSV.computeVisitOrder(t.steps);
  let alvo = null;
  for (let i = 0; i < t.steps.length - 1 && alvo == null; i++) {
    const sel = DSV.detectStructures(t.steps[i], opsMap).filter((c) => c.type === 'list')[0];
    if (!sel || sel.id == null) continue;
    const r = renderListaStep(t, t.steps[i], {
      visit: visit,
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: t.steps[i + 1],
      steps: t.steps,
      stepIndex: i
    });
    const m = r.html.match(/list-node[^"]*target[^"]*"[^>]*>[\s\S]*?list-value">([^<]*)</);
    if (m) alvo = m[1];
  }
  eq(alvo, '20', 'o nó sinalizado é o que a comparação identificou');
});

test('explicação da lista: criação, ligação, HEAD, remoção e não encontrado', () => {
  const ex = listaSimplesExample();
  const t = run(ex.code);
  noError(t);
  const src = ex.code.split('\n');
  const opsMap = DSV.buildOpsMap(t.steps);
  const infos = t.steps.map((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    return DSV.explainStep(s, sel, {
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: i < t.steps.length - 1 ? t.steps[i + 1] : null,
      lineText: (src[s.line - 1] || '').trim()
    });
  });
  assert(infos.some((x) => x.op === 'Inserção no início' && /novo nó 10 já aponta para o antigo início/.test(x.text || '')), 'ligação no início');
  assert(infos.some((x) => x.op === 'Inserção no final' && /passou a apontar para o novo nó/.test(x.text || '')), 'ligação no final');
  assert(infos.some((x) => x.op === 'Inserção no final' && /Percorrendo a lista até o último nó/.test(x.text || '')), 'percurso até o último nó');
  assert(infos.some((x) => x.op === 'Inserção no início' && /HEAD agora aponta/.test(x.text || '')), 'mudança de HEAD');
  assert(infos.some((x) => x.op === 'Busca' && /não foi encontrado/.test(x.text || '')), 'busca sem resultado');
  assert(infos.some((x) => x.op === 'Remoção' && /nada foi removido/.test(x.text || '')), 'remoção sem resultado');
  assert(infos.some((x) => x.op === 'Remoção' && /foi removido da lista/.test(x.text || '')), 'remoção efetiva');
  assert(infos.some((x) => x.op === 'Tamanho' && /contador da lista registra/.test(x.text || '')), 'consulta de tamanho');
});

test('CSS da lista: linha única, nó em duas regiões e valor sem compressão', () => {
  const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  const wrap = css.match(/\.list-wrap\s*\{[^}]*\}/);
  assert(wrap && /nowrap/.test(wrap[0]), 'linha única navegada por zoom/pan');
  const node = css.match(/\.list-node\s*\{[^}]*\}/);
  assert(node && /display:\s*flex/.test(node[0]), 'nó com regiões lado a lado');
  const value = css.match(/\.list-value\s*\{[^}]*\}/);
  assert(value && /min-width/.test(value[0]), 'VALUE com largura mínima (não comprime)');
  const next = css.match(/\.list-next\s*\{[^}]*\}/);
  assert(next && /border-left/.test(next[0]), 'divisória entre VALUE e NEXT');
});

/* ---------------------------------------------------------------- */
console.log('\n[lista duplamente encadeada: operações, invariantes e render]');

const listaDuplaExample = () => DSV.EXAMPLES.find((e) => e.id === 'lista-dupla');

/* executa o corpo de teste com as classes Node/DoublyLinkedList do exemplo
 * real, sem repetir a definição em cada caso */
function runDupla(corpo) {
  const ex = listaDuplaExample();
  assert(ex, 'exemplo lista-dupla existe');
  const classes = ex.code.split('\nconst lista = new DoublyLinkedList();')[0];
  return run(classes + '\nconst lista = new DoublyLinkedList();\n' + corpo);
}

/* id apontado por uma referência serializada (objeto ou {t:'ref'}) */
function refIdOf(sv, name) {
  const p = prop(sv, name);
  if (!p) return null;
  if (p.t === 'o' || p.t === 'ref') return p.id;
  return null;
}

function duplaHead(wrapper) {
  const p = prop(wrapper, '#head') || prop(wrapper, 'head');
  return p && p.t === 'o' ? p : null;
}

function duplaTail(wrapper) {
  const p = prop(wrapper, '#tail') || prop(wrapper, 'tail');
  return p && p.t === 'o' ? p : null;
}

function duplaLength(wrapper) {
  const p = prop(wrapper, '#length') || prop(wrapper, 'length');
  return p && p.t === 'p' ? p.v : null;
}

/* valores seguindo next (desde #head) ou prev (desde #tail); o prev dos nós
 * do meio chega serializado como {t:'ref'} (ciclo real da lista dupla) e é
 * resolvido pelo mapa id->nó montado a partir da cadeia next */
function duplaSeq(wrapper, dir) {
  const out = [];
  const seen = {};
  let n = dir === 'prev' ? duplaTail(wrapper) : duplaHead(wrapper);
  let map = null;
  if (dir === 'prev') {
    map = {};
    const guard = {};
    let m = duplaHead(wrapper);
    while (m && !guard[m.id]) {
      guard[m.id] = true;
      map[m.id] = m;
      const nx = prop(m, 'next') || prop(m, 'proximo');
      m = nx && nx.t === 'o' ? nx : null;
    }
  }
  while (n && !seen[n.id]) {
    seen[n.id] = true;
    const v = prop(n, 'value') || prop(n, 'valor');
    out.push(v && v.t === 'p' ? v.v : '?');
    const nx = dir === 'prev'
      ? (prop(n, 'prev') || prop(n, 'anterior'))
      : (prop(n, 'next') || prop(n, 'proximo'));
    if (nx && nx.t === 'o') n = nx;
    else if (nx && nx.t === 'ref' && map && map[nx.id]) n = map[nx.id];
    else n = null;
  }
  return out;
}

/* invariantes do plano: head/tail/prev/next/length coerentes, sem ciclo,
 * sem truncamento e com a cadeia real chegando ao fim */
function assertDupla(trace, esperado, tamanho, rotulo) {
  const label = rotulo || 'lista dupla';
  const step = lastStep(trace);
  const w = listaWrapper(step, 'lista');
  assert(w, label + ': wrapper da lista existe');
  assert(prop(w, '#head') != null, label + ': #head serializado (sem truncamento)');
  assert(prop(w, '#tail') != null, label + ': #tail serializado (sem truncamento)');
  eq(duplaLength(w), tamanho, label + ': tamanho (#length)');

  const head = duplaHead(w);
  const tail = duplaTail(w);
  const fwd = duplaSeq(w, 'next');
  const bwd = duplaSeq(w, 'prev');
  eq(fwd.join(','), esperado, label + ': valores via next');
  eq(bwd.join(','), esperado ? esperado.split(',').reverse().join(',') : '', label + ': valores via prev (de TAIL para HEAD)');
  eq(fwd.length, tamanho, label + ': quantidade real de nós');

  if (!esperado) {
    assert(!head && !tail, label + ': lista vazia sem HEAD/TAIL');
    return w;
  }
  assert(head && tail, label + ': HEAD e TAIL apontam para nós');
  const headPrev = prop(head, 'prev');
  assert(headPrev && headPrev.t === 'p' && (headPrev.v === undefined || headPrev.v === null),
    label + ': primeiro nó com prev vazio');
  const tailNext = prop(tail, 'next');
  assert(tailNext && tailNext.t === 'p' && (tailNext.v === undefined || tailNext.v === null),
    label + ': último nó com next vazio');
  eq(prop(w, '#head').id, head.id, label + ': #head aponta para o primeiro nó');
  eq(prop(w, '#tail').id, tail.id, label + ': #tail aponta para o último nó');

  let n = head;
  while (n) {
    const nx = prop(n, 'next');
    if (nx && nx.t === 'o') {
      eq(refIdOf(nx, 'prev'), n.id, label + ': prev do sucessor aponta de volta');
      eq(refIdOf(n, 'next'), nx.id, label + ': next aponta para o sucessor');
    }
    n = nx && nx.t === 'o' ? nx : null;
  }
  return w;
}

test('lista dupla: cenário A — vazia; B — append 10, 20, 30', () => {
  let t = runDupla('console.log(lista.size(), lista.isEmpty(), lista.toString());');
  noError(t);
  eq(outputs(t)[0], '0 true { }', 'lista vazia: size/isEmpty/toString');
  assertDupla(t, '', 0, 'vazia');

  t = runDupla('lista.append(10);\nlista.append(20);\nlista.append(30);');
  noError(t);
  const w = assertDupla(t, '10,20,30', 3, 'após appends');
  eq(prop(duplaHead(w), 'value').v, 10, 'HEAD = 10');
  eq(prop(duplaTail(w), 'value').v, 30, 'TAIL = 30');
});

test('lista dupla: cenário C — prepend no vazio e no início', () => {
  let t = runDupla('lista.prepend(10);');
  noError(t);
  assertDupla(t, '10', 1, 'prepend no vazio');

  t = runDupla('lista.append(10);\nlista.append(20);\nlista.prepend(5);');
  noError(t);
  const w = assertDupla(t, '5,10,20', 3, 'prepend com lista preenchida');
  eq(prop(duplaHead(w), 'value').v, 5, 'HEAD passou para o novo nó');
});

test('lista dupla: cenário D — insertAt no meio, no início e no fim', () => {
  let t = runDupla([
    'lista.append(5);',
    'lista.append(10);',
    'lista.append(20);',
    'lista.append(30);',
    'lista.insertAt(15, 2);'
  ].join('\n'));
  noError(t);
  assertDupla(t, '5,10,15,20,30', 5, 'insertAt no meio');

  t = runDupla('lista.append(10);\nlista.insertAt(5, 0);');
  noError(t);
  assertDupla(t, '5,10', 2, 'insertAt no início delega ao prepend');

  t = runDupla('lista.append(10);\nlista.insertAt(20, 1);');
  noError(t);
  assertDupla(t, '10,20', 2, 'insertAt no fim delega ao append');
});

test('lista dupla: cenário E — removeFirst, removeLast e removeAt', () => {
  let t = runDupla('lista.append(10);\nlista.append(20);\nlista.append(30);\nconsole.log(lista.removeFirst());');
  noError(t);
  eq(outputs(t)[0], '10', 'removeFirst devolve o valor');
  const w1 = assertDupla(t, '20,30', 2, 'após removeFirst');
  eq(prop(duplaHead(w1), 'value').v, 20, 'HEAD passou para o sucessor');

  t = runDupla('lista.append(10);\nlista.append(20);\nlista.append(30);\nconsole.log(lista.removeLast());');
  noError(t);
  eq(outputs(t)[0], '30', 'removeLast devolve o valor');
  const w2 = assertDupla(t, '10,20', 2, 'após removeLast');
  eq(prop(duplaTail(w2), 'value').v, 20, 'TAIL passou para o antecessor');

  t = runDupla('lista.append(10);\nlista.append(20);\nlista.append(30);\nconsole.log(lista.removeAt(1));');
  noError(t);
  eq(outputs(t)[0], '20', 'removeAt devolve o valor');
  assertDupla(t, '10,30', 2, 'após removeAt no meio');
});

test('lista dupla: cenário F — um único nó volta ao estado vazio', () => {
  const t = runDupla([
    'lista.append(7);',
    'console.log(lista.removeLast());',
    'console.log(lista.size(), lista.isEmpty(), lista.toString());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '7', 'removeu o único nó');
  eq(outputs(t)[1], '0 true { }', 'voltou ao estado vazio');
  assertDupla(t, '', 0, 'após esvaziar');
});

test('lista dupla: cenário G — transverseReverse percorre com prev (20, 15, 10, 5)', () => {
  const t = runDupla([
    'lista.append(5);',
    'lista.append(10);',
    'lista.append(15);',
    'lista.append(20);',
    'lista.transverseReverse();'
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs.slice(-4).join(','), '20,15,10,5', 'ordem do fim ao início');
});

test('lista dupla: cenário I — índices inválidos não corrompem a lista', () => {
  const t = runDupla([
    'lista.append(10);',
    'lista.append(20);',
    'console.log(lista.insertAt(99, -1), lista.insertAt(99, 5));',
    'console.log(lista.removeAt(-1), lista.removeAt(2));',
    'console.log(lista.toString());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], 'undefined undefined', 'insertAt recusa índices fora de [0, tamanho]');
  eq(outputs(t)[1], 'undefined undefined', 'removeAt recusa índices fora de [0, tamanho)');
  eq(outputs(t)[2], '{ 10 <-> 20 }', 'lista intacta');
  assertDupla(t, '10,20', 2, 'após operações inválidas');

  // limites válidos: insertAt no índice == tamanho e removeAt no último índice
  const t2 = runDupla([
    'lista.append(10);',
    'lista.insertAt(20, 1);',
    'console.log(lista.removeAt(1));',
    'console.log(lista.toString());'
  ].join('\n'));
  noError(t2);
  eq(outputs(t2)[0], '20', 'removeAt no último índice');
  eq(outputs(t2)[1], '{ 10 }', 'lista restante');
});

test('lista dupla: indexOf, size, isEmpty e toString', () => {
  const t = runDupla([
    'lista.append(10);',
    'lista.append(20);',
    'lista.append(10);',
    'console.log(lista.indexOf(10), lista.indexOf(20), lista.indexOf(99));',
    'console.log(lista.size(), lista.isEmpty(), lista.toString());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '0 1 -1', 'indexOf da primeira ocorrência e -1');
  eq(outputs(t)[1], '3 false { 10 <-> 20 <-> 10 }', 'size/isEmpty/toString');
});

test('lista dupla: prev do segundo nó aponta de volta sem truncar a serialização', () => {
  const t = runDupla('lista.append(10);\nlista.append(20);\nlista.append(30);');
  noError(t);
  const w = assertDupla(t, '10,20,30', 3, 'três nós');
  const head = duplaHead(w);
  assert(head, 'head serializado');
  const second = prop(head, 'next');
  assert(second && second.t === 'o', 'segundo nó serializado');
  const p = prop(second, 'prev');
  assert(p && (p.t === 'o' || p.t === 'ref'), 'prev serializado como objeto ou ref');
  eq(p.id, head.id, 'prev do segundo aponta para o primeiro');
});

test('lista dupla: detecção marca a lista como dupla e expõe o tail', () => {
  const t = runDupla('lista.append(10);');
  noError(t);
  const step = lastStep(t);
  const cands = DSV.detectStructures(step, DSV.buildOpsMap(t.steps));
  const sel = cands.filter((c) => c.type === 'list')[0];
  assert(sel, 'lista detectada');
  eq(sel.label, 'lista', 'rótulo é o nome da variável');
  assert(sel.doubly, 'flag doubly');
  assert(sel.tailId != null, 'tailId do wrapper');
});

function renderListaDupla(trace, step, extra) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'list')[0];
  assert(sel, 'lista dupla detectada para o render');
  const container = {};
  DSV.renderStructure(container, sel, step, Object.assign({
    opsMap: opsMap,
    pointers: step.pointers || {},
    events: step.events || [],
    visit: DSV.computeVisitOrder(trace.steps)
  }, extra || {}));
  return { html: container.innerHTML, sel: sel };
}

test('render da lista dupla: PREV, setas nos dois sentidos, HEAD/TAIL e ∅', () => {
  const ex = listaDuplaExample();
  const t = run(ex.code);
  noError(t);
  const seen = { prev: false, back: false, fwd: false, tail: false, head: false, end: false, nullStart: false, title: false };
  for (let i = 0; i < t.steps.length; i++) {
    const step = t.steps[i];
    const sel = DSV.detectStructures(step, DSV.buildOpsMap(t.steps)).filter((c) => c.type === 'list')[0];
    if (!sel) continue;
    if (sel.doubly) seen.title = true;
    const r = renderListaDupla(t, step, {
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: i < t.steps.length - 1 ? t.steps[i + 1] : null,
      steps: t.steps,
      stepIndex: i
    });
    const h = r.html;
    if (h.indexOf('list-prev') >= 0) seen.prev = true;
    if (h.indexOf('list-link back') >= 0) seen.back = true;
    if (h.indexOf('Lista duplamente encadeada') >= 0) seen.title = true;
    if (h.indexOf('list-tail-tag') >= 0) seen.tail = true;
    if (h.indexOf('list-head-tag') >= 0) seen.head = true;
    if (h.indexOf('list-end') >= 0) seen.end = true;
    if (h.indexOf('data-k="null-start"') >= 0) seen.nullStart = true;
    if (/class="list-link(?: [^"]*)?"/.test(h) && !/class="list-link back/.test(h)) seen.fwd = true;
  }
  assert(seen.title, 'título da lista dupla');
  assert(seen.prev, 'região PREV desenhada');
  assert(seen.back, 'seta de volta (prev) desenhada');
  assert(seen.fwd, 'seta de ida (next) desenhada');
  assert(seen.head, 'indicador HEAD');
  assert(seen.tail, 'indicador TAIL');
  assert(seen.end, 'terminador ∅ no fim');
  assert(seen.nullStart, 'terminador ∅ no início (prev do primeiro nó)');
});

test('render da lista dupla: referência alterada e percurso reverso em destaque', () => {
  const ex = listaDuplaExample();
  const t = run(ex.code);
  noError(t);
  let sawChangedNext = false;
  let sawChangedPrev = false;
  let sawBackActive = false;
  let sawHeadChanged = false;
  let sawTailChanged = false;
  for (let i = 0; i < t.steps.length; i++) {
    const step = t.steps[i];
    const sel = DSV.detectStructures(step, DSV.buildOpsMap(t.steps)).filter((c) => c.type === 'list')[0];
    if (!sel) continue;
    const r = renderListaDupla(t, step, {
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: i < t.steps.length - 1 ? t.steps[i + 1] : null,
      steps: t.steps,
      stepIndex: i
    });
    const h = r.html;
    if (h.indexOf('list-next changed') >= 0) sawChangedNext = true;
    if (h.indexOf('list-prev changed') >= 0) sawChangedPrev = true;
    if (h.indexOf('list-link back active') >= 0) sawBackActive = true;
    if (h.indexOf('list-head-tag changed') >= 0) sawHeadChanged = true;
    if (h.indexOf('list-tail-tag changed') >= 0) sawTailChanged = true;
  }
  assert(sawChangedNext, 'next alterado destacado');
  assert(sawChangedPrev, 'prev alterado destacado');
  assert(sawHeadChanged, 'HEAD que mudou de nó destacado');
  assert(sawTailChanged, 'TAIL que mudou de nó destacado');
  assert(sawBackActive, 'conexão percorrida no sentido reverso destacada');
});

test('render da lista simples não ganha PREV (regressão)', () => {
  const t = runLista('lista.insertAtEnd(10);\nlista.insertAtEnd(20);');
  noError(t);
  const r = renderListaStep(t, lastStep(t), {
    prevStep: null,
    nextStep: null,
    steps: t.steps,
    stepIndex: t.steps.length - 1
  });
  assert(r.html.indexOf('list-prev') < 0, 'lista simples continua VALUE/NEXT');
  assert(r.html.indexOf('list-tail-tag') < 0, 'lista simples não ganha TAIL');
});

test('explicação da lista dupla: prev, tail e percurso reverso', () => {
  const ex = listaDuplaExample();
  const t = run(ex.code);
  noError(t);
  const src = ex.code.split('\n');
  const opsMap = DSV.buildOpsMap(t.steps);
  const infos = t.steps.map((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'list')[0];
    return DSV.explainStep(s, sel, {
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: i < t.steps.length - 1 ? t.steps[i + 1] : null,
      lineText: (src[s.line - 1] || '').trim()
    });
  });
  assert(infos.some((x) => (x.op === 'Inserção no final' || x.op === 'Inserção no início') && /referências prev e next ainda não foram ligadas/.test(x.text || '')), 'criação mostra prev e next desconectados');
  assert(infos.some((x) => /A referência NEXT do nó .* passou a apontar/.test(x.text || '')), 'ligação do next');
  assert(infos.some((x) => /A referência PREV do nó .* foi atualizada/.test(x.text || '')), 'ligação do prev');
  assert(infos.some((x) => /HEAD agora aponta/.test(x.text || '')), 'mudança de HEAD');
  assert(infos.some((x) => /TAIL agora aponta/.test(x.text || '')), 'mudança de TAIL');
  assert(infos.some((x) => x.op === 'Remoção no final' && /TAIL passou/.test(x.text || '')), 'remoção no final move o TAIL');
  assert(infos.some((x) => x.op === 'Percurso reverso' && /referência prev|referências prev/.test(x.text || '')), 'percurso reverso explica o prev');
  assert(infos.some((x) => x.op === 'Inserção em posição' && /posição de inserção/.test(x.text || '')), 'insertAt explica a posição');
  assert(infos.some((x) => x.op === 'Busca' && /Comparando o nó/.test(x.text || '')), 'indexOf compara nós');
});

test('árvore em-ordem: saída crescente e ponteiro "no"', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'arvore-em-ordem');
  const t = run(example.code);
  noError(t, 'exemplo árvore em-ordem');
  const outs = outputs(t);
  const idx = outs.indexOf('Percurso em-ordem:');
  assert(idx >= 0, 'imprime cabeçalho');
  const visitados = outs.slice(idx + 1).map(Number);
  eq(visitados.join(','), '20,30,40,50,60,70,80', 'percurso em-ordem');
  const hasNo = t.steps.some((s) => s.locals && Object.keys(s.locals).indexOf('no') >= 0);
  assert(hasNo, 'parâmetro "no" visível em algum passo');
  const last = lastStep(t);
  eq(last.globals.arvore.props.raiz.props.valor.v, 50, 'raiz = 50');
});

test('busca em árvore: encontra 40 e usa ponteiro atual', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'arvore-busca');
  const t = run(example.code);
  noError(t, 'exemplo busca');
  const outs = outputs(t);
  assert(outs.some((o) => o === 'Visitando 50'), 'visita 50');
  assert(outs.some((o) => o === 'Visitando 30'), 'visita 30');
  assert(outs.some((o) => o === 'Visitando 40'), 'visita 40');
  assert(outs.some((o) => o === 'Encontrado: 40'), 'encontra 40');
  const temAtual = t.steps.some((s) => s.locals && s.locals.atual);
  assert(temAtual, 'ponteiro atual presente');
});

/* ---------------------------------------------------------------- */
console.log('\n[árvore binária simples: BFS de inserção, busca, remoção e percursos]');

function treeExample(id) {
  const ex = DSV.EXAMPLES.find((e) => e.id === id);
  assert(ex, 'exemplo ' + id + ' existe');
  return ex;
}

function prop(sv, name) {
  return sv && sv.props ? sv.props[name] : null;
}

function childOf(sv, name) {
  const p = prop(sv, name);
  return p && p.t === 'o' ? p : null;
}

/* forma textual da árvore serializada: valor(esquerda,direita), '.' = vazio */
function shapeOf(sv) {
  if (!sv) return '.';
  const val = prop(sv, 'valor');
  return String(val ? val.v : '?') + '(' + shapeOf(childOf(sv, 'esquerda')) + ',' + shapeOf(childOf(sv, 'direita')) + ')';
}

/* raiz serializada guardada na variável "arvore" do passo (null = vazia) */
function treeRootOf(step, name) {
  const holder = (step.globals && step.globals[name]) || (step.locals && step.locals[name]);
  if (!holder || holder.t !== 'o') return undefined;
  const root = prop(holder, 'raiz');
  if (!root) return undefined;
  return root.t === 'o' ? root : null;
}

function shapeStepAfter(trace, shape, from) {
  for (let i = from || 0; i < trace.steps.length; i++) {
    if (shapeOf(treeRootOf(trace.steps[i], 'arvore')) === shape) return i;
  }
  return -1;
}

/* exige que as formas apareçam na ordem cronológica das operações */
function assertShapesInOrder(trace, shapes, rotulo) {
  let cursor = 0;
  shapes.forEach((sh, i) => {
    const idx = shapeStepAfter(trace, sh, cursor);
    assert(idx >= 0, (rotulo || 'forma') + ' após a etapa ' + (i + 1) + ' esperada: ' + sh);
    cursor = idx + 1;
  });
}

function renderTreeStep(trace, step) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
  assert(sel, 'árvore detectada para o render');
  const container = {};
  DSV.renderStructure(container, sel, step, {
    opsMap: opsMap,
    pointers: step.pointers || {},
    events: step.events || [],
    visit: DSV.computeVisitOrder(trace.steps)
  });
  return { html: container.innerHTML, sel: sel };
}

/* extrai os nós (valor, cx, cy, classe) do SVG estático renderizado */
function treeNodesOf(html) {
  const out = [];
  const rx = /<g class="tree-group">([\s\S]*?)<\/g>/g;
  let m;
  while ((m = rx.exec(html))) {
    const block = m[1];
    const c = block.match(/<circle cx="([\d.\-]+)" cy="([\d.\-]+)" r="([\d.]+)" class="(tree-node[^"]*)"/);
    const t = block.match(/<text x="[\d.\-]+" y="[\d.\-]+" class="tree-val">([^<]*)<\/text>/);
    if (c && t) {
      let val = t[1].replace(/&quot;/g, '"');
      if (val.length > 1 && val[0] === '"' && val[val.length - 1] === '"') val = val.slice(1, -1);
      out.push({ val: val, cx: parseFloat(c[1]), cy: parseFloat(c[2]), r: parseFloat(c[3]), cls: c[4] });
    }
  }
  return out;
}

test('árvore simples: inserção por nível preenche A, B, C, D, E e F na forma certa', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t, 'exemplo arvore-simples');
  assertShapesInOrder(t, [
    'A(.,.)',
    'A(B(.,.),.)',
    'A(B(.,.),C(.,.))',
    'A(B(D(.,.),.),C(.,.))',
    'A(B(D(.,.),E(.,.)),C(.,.))',
    'A(B(D(.,.),E(.,.)),C(F(.,.),.))'
  ], 'inserção');
  const last = lastStep(t);
  const finalShape = shapeOf(treeRootOf(last, 'arvore'));
  eq(finalShape, 'A(B(D(.,.),E(.,.)),C(F(.,.),.))', 'forma final');
  /* 'D' > 'B' e ainda assim D é filho ESQUERDO de B: não há ordenação por valor */
  assert(finalShape.indexOf('B(D') >= 0, 'filho à esquerda não segue ordem de valor (não é BST)');
});

test('árvore simples: percursos pré-ordem, em ordem e pós-ordem exatos', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const outs = outputs(t);
  const pre = outs.indexOf('Pré-ordem (raiz, esquerda, direita):');
  const em = outs.indexOf('Em ordem (esquerda, raiz, direita):');
  const pos = outs.indexOf('Pós-ordem (esquerda, direita, raiz):');
  assert(pre >= 0 && em > pre && pos > em, 'cabeçalhos dos três percursos em ordem');
  eq(outs.slice(pre + 1, em).join(','), 'A,B,D,E,C,F', 'pré-ordem');
  eq(outs.slice(em + 1, pos).join(','), 'D,B,E,A,F,C', 'em ordem');
  eq(outs.slice(pos + 1, pos + 7).join(','), 'D,E,B,F,C,A', 'pós-ordem');
});

test('árvore simples: busca encontra, informa ausência e não altera a árvore', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const outs = outputs(t);
  assert(outs.indexOf('Busca por E: E') >= 0, 'busca encontra E');
  assert(outs.indexOf('Busca por Z: não encontrei') >= 0, 'busca informa que Z não está');
  eq(shapeOf(treeRootOf(lastStep(t), 'arvore')), 'A(B(D(.,.),E(.,.)),C(F(.,.),.))', 'árvore intacta após as buscas');
});

test('árvore simples: remoção cobre folha, um filho, dois filhos, raiz e nó único', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t, 'exemplo arvore-simples-remocao');
  assertShapesInOrder(t, [
    'A(B(D(H(.,.),.),E(.,.)),C(F(.,.),G(.,.)))', /* inicial: A..H                    */
    'A(B(D(H(.,.),.),E(.,.)),C(.,G(.,.)))',     /* F (folha)                        */
    'A(B(D(H(.,.),.),E(.,.)),G(.,.))',          /* C (só filho direito G)           */
    'A(D(H(.,.),E(.,.)),G(.,.))',               /* B (dois filhos: D sobe, E anexa) */
    'A(D(H(.,.),.),G(.,.))',                    /* E (folha)                        */
    'A(H(.,.),G(.,.))',                         /* D (só filho esquerdo H)          */
    'H(G(.,.),.)',                              /* A (raiz, dois filhos)            */
    'G(.,.)',                                   /* H (só filho esquerdo G)          */
    '.',                                        /* G (único nó)                     */
    'A(X(.,.),X(.,.))',                         /* duplicados                       */
    'A(.,X(.,.))'                               /* primeiro X em nível removido     */
  ], 'remoção');
  const last = lastStep(t);
  eq(shapeOf(treeRootOf(last, 'arvore')), '.', 'termina vazia depois de limpar');
});

test('árvore simples: remoção de valor inexistente não modifica e em-ordem confere', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t);
  const outs = outputs(t);
  const marcador = outs.indexOf('--- remover Z (não existe) ---');
  assert(marcador >= 0, 'passo da remoção inexistente');
  assert(outs.indexOf('Não encontrei Z na árvore.') === marcador + 1, 'mensagem de não encontrado');
  eq(outs.slice(marcador + 2, marcador + 4).join(','), 'G,H', 'descendentes continuam após tentativa inválida');
  assert(outs.indexOf('Removi X') >= 0, 'removeu o primeiro X duplicado');
  const idxXF = outs.indexOf('O X da direita continua na árvore.');
  eq(outs.slice(idxXF + 1, idxXF + 3).join(','), 'A,X', 'sobrou A e o X da direita');
});

test('árvore simples: passos históricos preservam o estado (snapshots imutáveis)', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t);
  const inicial = 'A(B(D(H(.,.),.),E(.,.)),C(F(.,.),G(.,.)))';
  const imutavel = 'A(B(D(H(.,.),.),E(.,.)),G(.,.))';
  const iInicial = shapeStepAfter(t, inicial, 0);
  const iImutavel = shapeStepAfter(t, imutavel, iInicial + 1);
  assert(iInicial >= 0 && iImutavel > iInicial, 'passos intermediários existem em ordem');
  /* se os snapshots compartilhassem referência, o passo antigo mostraria o estado final */
  eq(shapeOf(treeRootOf(t.steps[iInicial], 'arvore')), inicial, 'estado do passo inicial intacto no fim da execução');
  eq(shapeOf(treeRootOf(t.steps[iImutavel], 'arvore')), imutavel, 'estado parcial intacto no fim da execução');
  assert(shapeOf(treeRootOf(lastStep(t), 'arvore')) === '.', 'estado final diferente do histórico');
});

test('render da árvore: layout correto após remoção com promoção', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t);
  const alvo = 'A(D(H(.,.),E(.,.)),G(.,.))'; /* após remover B: D sobe com H e E */
  const step = t.steps.filter((s) => shapeOf(treeRootOf(s, 'arvore')) === alvo)[0];
  assert(step, 'passo após a remoção de B');
  const html = renderTreeStep(t, step).html;
  const nodes = treeNodesOf(html);
  eq(nodes.length, 5, 'cinco nós');
  const byVal = {};
  nodes.forEach((n) => { byVal[n.val] = n; });
  assert(byVal.D.cx < byVal.A.cx && byVal.A.cx < byVal.G.cx, 'D assume a esquerda de A; G segue à direita');
  assert(byVal.H.cx < byVal.D.cx && byVal.E.cx > byVal.D.cx, 'H e E em torno de D');
  assert(byVal.H.cy > byVal.D.cy && byVal.E.cy > byVal.D.cy, 'H e E um nível abaixo de D');
  eq((html.match(/class="tree-edge"/g) || []).length, 4, 'quatro conexões');
});

test('render da árvore: nós circulares, arestas atrás e layout por nível', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const alvo = 'A(B(D(.,.),E(.,.)),C(F(.,.),.))';
  const step = t.steps.filter((s) => shapeOf(treeRootOf(s, 'arvore')) === alvo)[0];
  assert(step, 'passo com a árvore A..F');
  const html = renderTreeStep(t, step).html;
  const nodes = treeNodesOf(html);
  eq(nodes.length, 6, 'seis nós desenhados');
  const byVal = {};
  nodes.forEach((n) => { byVal[n.val] = n; });
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach((v) => assert(byVal[v], 'nó ' + v + ' presente'));
  assert(byVal.A.cy < byVal.B.cy, 'raiz acima dos filhos');
  assert(byVal.B.cy === byVal.C.cy, 'B e C no mesmo nível');
  assert(byVal.D.cy === byVal.E.cy && byVal.E.cy === byVal.F.cy, 'D, E e F no mesmo nível');
  assert(byVal.B.cx < byVal.A.cx && byVal.C.cx > byVal.A.cx, 'esquerda/direita em relação à raiz');
  assert(byVal.D.cx < byVal.B.cx && byVal.E.cx > byVal.B.cx, 'D e E em torno de B');
  assert(byVal.F.cx < byVal.C.cx, 'F à esquerda de C');
  eq((html.match(/class="tree-edge"/g) || []).length, 5, 'cinco arestas');
  assert(html.indexOf('tree-edge') < html.indexOf('tree-node'), 'arestas desenhadas atrás dos nós');
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].cx - nodes[j].cx, nodes[i].cy - nodes[j].cy);
      assert(d >= nodes[i].r + nodes[j].r + 2,
        'sem sobreposição entre ' + nodes[i].val + ' e ' + nodes[j].val + ' (d=' + d.toFixed(1) + ', r=' + nodes[i].r + ')');
    }
  }
});

test('render da árvore: árvore assimétrica com lacunas não sobrepõe nem inventa arestas', () => {
  const t = run([
    'class No {',
    '  constructor(valor) {',
    '    this.valor = valor;',
    '    this.esquerda = null;',
    '    this.direita = null;',
    '  }',
    '}',
    "const raiz = new No('A');",
    "raiz.direita = new No('B');",
    "raiz.direita.esquerda = new No('C');",
    "raiz.direita.esquerda.direita = new No('D');",
    "console.log('fim');"
  ].join('\n'));
  noError(t, 'árvore em zigue-zague');
  const html = renderTreeStep(t, lastStep(t)).html;
  const nodes = treeNodesOf(html);
  eq(nodes.length, 4, 'quatro nós');
  const byVal = {};
  nodes.forEach((n) => { byVal[n.val] = n; });
  assert(byVal.A.cx < byVal.B.cx, 'B (único filho, à direita) fica à direita de A');
  assert(byVal.C.cx < byVal.B.cx, 'C (esquerda de B) fica à esquerda de B');
  assert(byVal.D.cx > byVal.C.cx, 'D (direita de C) fica à direita de C');
  assert(byVal.A.cy < byVal.B.cy && byVal.B.cy < byVal.C.cy && byVal.C.cy < byVal.D.cy, 'profundidades crescentes');
  eq((html.match(/class="tree-edge"/g) || []).length, 3, 'apenas as três conexões reais — nenhuma aresta para referência inexistente');
  assert(html.indexOf('tree-edge') < html.indexOf('tree-node'), 'arestas atrás dos nós');
  assert((html.match(/tree-null-stub/g) || []).length === 0, 'sem indicadores pontilhados de filhos vazios');
  assert(html.indexOf('ptr-chip') < 0, 'sem etiquetas de texto nos nós da árvore');
});

test('render da árvore vazia: mensagem discreta e nenhum nó', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t);
  const vazio = t.steps.filter((s) => treeRootOf(s, 'arvore') === null)[0];
  assert(vazio, 'existe passo com árvore vazia');
  const html = renderTreeStep(t, vazio).html;
  assert(html.indexOf('A árvore está vazia neste passo.') >= 0, 'mensagem de árvore vazia');
  assert(html.indexOf('tree-node') < 0, 'nenhum nó desenhado');
});

test('render da árvore: realce principal no nó ativo e visita em roxo, sem números', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const temPonteiro = (nome) => t.steps.filter((s) => {
    const pointers = s.pointers || {};
    for (const id of Object.keys(pointers)) {
      if (pointers[id].some((l) => DSV.shortName(l) === nome)) return true;
    }
    return false;
  })[0];
  const passoPercurso = temPonteiro('no');
  assert(passoPercurso, 'passo de percurso com ponteiro "no"');
  const htmlPercurso = renderTreeStep(t, passoPercurso).html;
  assert(/tree-node[^"]*visited/.test(htmlPercurso), 'nó visitado destacado em roxo');
  assert(/tree-node[^"]*active/.test(htmlPercurso), 'nó em visita com realce principal');
  assert(htmlPercurso.indexOf('tree-visit-num') < 0, 'sem números de ordem de visita');
  assert(htmlPercurso.indexOf('ptr-chip') < 0, 'sem etiquetas de texto nos nós da árvore');
  const passoBusca = temPonteiro('atual');
  assert(passoBusca, 'passo de busca com ponteiro "atual"');
  const htmlBusca = renderTreeStep(t, passoBusca).html;
  assert(/tree-node[^"]*active/.test(htmlBusca), 'nó examinado em destaque principal na busca');
  eq((htmlBusca.match(/tree-node[^"]*active/g) || []).length, 1, 'um único nó em destaque por passo');
});

test('render da árvore: nenhuma etiqueta de texto — só o realce roxo', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const visit = DSV.computeVisitOrder(t.steps);
  let comEtiqueta = 0;
  let comAtivo = 0;
  t.steps.forEach((s) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'tree')[0];
    if (!sel || sel.id == null) return;
    const container = {};
    DSV.renderStructure(container, sel, s, {
      opsMap: opsMap,
      pointers: s.pointers || {},
      events: s.events || [],
      visit: visit
    });
    if (container.innerHTML.indexOf('ptr-chip') >= 0) comEtiqueta++;
    if (/tree-node[^"]*active/.test(container.innerHTML)) comAtivo++;
  });
  eq(comEtiqueta, 0, 'nenhuma etiqueta (cursor/novo/raiz/…) no canvas da árvore');
  assert(comAtivo > 0, 'o realce roxo continua aparecendo na operação');
});

test('render da árvore: vaga da inserção aparece antes do nó e some depois', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  let alvo = -1;
  for (let i = 0; i < t.steps.length - 1; i++) {
    const s = t.steps[i];
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'tree')[0];
    if (!sel || sel.id == null) continue;
    const info = DSV.explainStep(s, sel, { nextStep: t.steps[i + 1] });
    if (info.text && info.text.indexOf('primeira posição disponível') >= 0) { alvo = i; break; }
  }
  assert(alvo >= 0, 'passo imediatamente antes de uma inserção');
  const step = t.steps[alvo];
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
  const container = {};
  DSV.renderStructure(container, sel, step, {
    opsMap: opsMap,
    pointers: step.pointers || {},
    events: step.events || [],
    visit: DSV.computeVisitOrder(t.steps),
    nextStep: t.steps[alvo + 1]
  });
  const html = container.innerHTML;
  assert(html.indexOf('tree-preview-slot') >= 0, 'vaga pontilhada marcada');
  assert(html.indexOf('tree-preview-edge') >= 0, 'conexão futura pontilhada');
  const html2 = renderTreeStep(t, t.steps[alvo + 1]).html;
  assert(html2.indexOf('tree-preview-slot') < 0, 'prévia some quando o nó aparece');
});

test('layout da árvore: métricas adaptativas mantêm a legibilidade', () => {
  const tiny = DSV.treeMetrics(1);
  const small = DSV.treeMetrics(6);
  const big = DSV.treeMetrics(40);
  assert(tiny.r > small.r && small.r >= big.r,
    'raio encolhe conforme a árvore cresce: ' + tiny.r + ' > ' + small.r + ' >= ' + big.r);
  assert(big.r >= 23, 'raio nunca abaixo do mínimo legível: ' + big.r);
  assert(tiny.hgap > big.hgap && tiny.vgap > big.vgap, 'espaçamentos maiores nas árvores pequenas');
  assert(big.hgap >= 72 && big.vgap >= 84,
    'árvore grande não comprime abaixo do tamanho-base: ' + big.hgap + 'x' + big.vgap);
});

test('layout da árvore: nó único centralizado com margens simétricas', () => {
  const t = run([
    'class No {',
    '  constructor(valor) {',
    '    this.valor = valor;',
    '    this.esquerda = null;',
    '    this.direita = null;',
    '  }',
    '}',
    "const raiz = new No('A');"
  ].join('\n'));
  noError(t, 'árvore de um nó');
  const html = renderTreeStep(t, lastStep(t)).html;
  const svg = html.match(/<svg class="tree-svg" width="([\d.]+)" height="([\d.]+)"/);
  assert(svg, 'svg com dimensões');
  const w = parseFloat(svg[1]);
  const h = parseFloat(svg[2]);
  const nodes = treeNodesOf(html);
  eq(nodes.length, 1, 'um nó desenhado');
  assert(Math.abs(nodes[0].cx - w / 2) <= 0.5, 'nó centralizado na horizontal (cx=' + nodes[0].cx + ', w=' + w + ')');
  assert(Math.abs(nodes[0].cy - h / 2) <= 0.5, 'nó centralizado na vertical (cy=' + nodes[0].cy + ', h=' + h + ')');
  const leftMargin = nodes[0].cx - nodes[0].r;
  const rightMargin = w - (nodes[0].cx + nodes[0].r);
  assert(Math.abs(leftMargin - rightMargin) <= 1, 'margens horizontais simétricas');
  assert(leftMargin >= 48, 'margem preserva o nó (sem corte na borda): ' + leftMargin);
});

test('layout da árvore: árvore assimétrica também fica centrada no palco', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const alvo = 'A(B(D(.,.),E(.,.)),C(F(.,.),.))';
  const step = t.steps.filter((s) => shapeOf(treeRootOf(s, 'arvore')) === alvo)[0];
  assert(step, 'passo com a árvore A..F');
  const html = renderTreeStep(t, step).html;
  const svg = html.match(/<svg class="tree-svg" width="([\d.]+)"/);
  assert(svg, 'svg com dimensão');
  const w = parseFloat(svg[1]);
  const nodes = treeNodesOf(html);
  const minLeft = Math.min.apply(null, nodes.map((n) => n.cx - n.r));
  const maxRight = Math.max.apply(null, nodes.map((n) => n.cx + n.r));
  assert(Math.abs(minLeft - (w - maxRight)) <= 1,
    'folga igual dos dois lados (esquerda: ' + minLeft + ', direita: ' + (w - maxRight) + ')');
});

test('conexão alterada: destaque acompanha a etapa e some ao retroceder', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);

  /* passo em que B entra como filho esquerdo de A: só essa conexão é nova */
  let idx = -1;
  for (let i = 1; i < t.steps.length; i++) {
    const cur = treeRootOf(t.steps[i], 'arvore');
    const prev = treeRootOf(t.steps[i - 1], 'arvore');
    if (!cur || !prev || shapeOf(cur).indexOf('A(B(') !== 0) continue;
    const changed = DSV.treeChangedEdges(prev, cur);
    const ativos = Object.keys(changed).filter((k) => changed[k]);
    if (ativos.length === 1) { idx = i; break; }
  }
  assert(idx >= 0, 'passo de inserção de B');
  const step = t.steps[idx];
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];

  const comPrev = {};
  DSV.renderStructure(comPrev, sel, step, {
    opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [],
    prevStep: t.steps[idx - 1]
  });
  eq((comPrev.innerHTML.match(/tree-edge new/g) || []).length, 1, 'a conexão nova é a única destacada');

  const semPrev = {};
  DSV.renderStructure(semPrev, sel, step, { opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [] });
  eq((semPrev.innerHTML.match(/tree-edge new/g) || []).length, 0, 'sem passo anterior nenhum destaque é inventado');

  const prevStep = t.steps[idx - 1];
  const selPrev = DSV.detectStructures(prevStep, opsMap).filter((c) => c.type === 'tree')[0];
  const voltar = {};
  DSV.renderStructure(voltar, selPrev, prevStep, {
    opsMap: opsMap, pointers: prevStep.pointers || {}, events: prevStep.events || [],
    prevStep: idx > 1 ? t.steps[idx - 2] : null
  });
  eq((voltar.innerHTML.match(/tree-edge new/g) || []).length, 0, 'ao retroceder, o destaque antigo some');

  /* promoção (remoção de B): a conexão de D com o novo pai é destacada */
  const t2 = run(treeExample('arvore-simples-remocao').code);
  noError(t2);
  const promo = 'A(D(H(.,.),E(.,.)),G(.,.))';
  let idx2 = -1;
  for (let i = 1; i < t2.steps.length; i++) {
    if (shapeOf(treeRootOf(t2.steps[i], 'arvore')) !== promo) continue;
    const changed = DSV.treeChangedEdges(treeRootOf(t2.steps[i - 1], 'arvore'), treeRootOf(t2.steps[i], 'arvore'));
    if (Object.keys(changed).filter((k) => changed[k]).length) { idx2 = i; break; }
  }
  assert(idx2 >= 0, 'passo da promoção de D após remover B');
});

test('explicação: nome da operação vem da chamada em execução', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const ops = {};
  t.steps.forEach((s) => {
    const sel = DSV.detectStructures(s, DSV.buildOpsMap(t.steps)).filter((c) => c.type === 'tree')[0] || null;
    const info = DSV.explainStep(s, sel, {});
    ops[info.op] = (ops[info.op] || 0) + 1;
  });
  assert(ops['Inserção'] > 0, 'passos de Inserção');
  assert(ops['Percurso pré-ordem'] > 0, 'passos de percurso pré-ordem');
  assert(ops['Percurso em ordem'] > 0, 'passos de percurso em ordem');
  assert(ops['Percurso pós-ordem'] > 0, 'passos de percurso pós-ordem');
  assert(ops['Busca'] > 0, 'passos de Busca');
});

test('explicação: inserção, remoção e promoção descrevem nó e relação', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  const textos = t.steps.map((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'tree')[0] || null;
    return DSV.explainStep(s, sel, {
      prevStep: i > 0 ? t.steps[i - 1] : null,
      nextStep: i < t.steps.length - 1 ? t.steps[i + 1] : null
    }).text || '';
  });
  assert(textos.some((x) => x.indexOf('foi inserido como filho esquerdo do nó') >= 0), 'frase de inserção com lado');
  assert(textos.some((x) => x.indexOf('primeira posição disponível') >= 0), 'frase da vaga encontrada');
  assert(textos.some((x) => x.indexOf('Visitando o nó') >= 0), 'frase de visita');

  const t2 = run(treeExample('arvore-simples-remocao').code);
  noError(t2);
  const opsMap2 = DSV.buildOpsMap(t2.steps);
  const textos2 = t2.steps.map((s, i) => {
    const sel = DSV.detectStructures(s, opsMap2).filter((c) => c.type === 'tree')[0] || null;
    return DSV.explainStep(s, sel, {
      prevStep: i > 0 ? t2.steps[i - 1] : null,
      nextStep: i < t2.steps.length - 1 ? t2.steps[i + 1] : null
    }).text || '';
  });
  assert(textos2.some((x) => x.indexOf('foi removido da árvore') >= 0), 'frase de remoção');
  assert(textos2.some((x) => x.indexOf('subiu para o lugar') >= 0 || x.indexOf('foi promovido') >= 0), 'frase de promoção');
});

test('passos em ordem cronológica: a inserção não pisca para trás', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const shapes = [];
  t.steps.forEach((s) => {
    const sh = shapeOf(treeRootOf(s, 'arvore'));
    if (sh === undefined) return;
    if (!shapes.length || shapes[shapes.length - 1] !== sh) shapes.push(sh);
  });
  const insercoes = [
    'A(.,.)',
    'A(B(.,.),.)',
    'A(B(.,.),C(.,.))',
    'A(B(D(.,.),.),C(.,.))',
    'A(B(D(.,.),E(.,.)),C(.,.))',
    'A(B(D(.,.),E(.,.)),C(F(.,.),.))'
  ];
  const vistos = shapes.filter((sh) => insercoes.indexOf(sh) >= 0);
  eq(vistos.join('|'), insercoes.join('|'), 'sequência monotônica de inserção (sem estados repetidos fora de ordem)');
});

test('detecção: a árvore tem prioridade sobre arrays internos da BFS dos exemplos', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const cands = DSV.detectStructures(lastStep(t), DSV.buildOpsMap(t.steps));
  eq(cands[0].type, 'tree', 'melhor candidato é a árvore');
});

/* ---------------------------------------------------------------- */
console.log('\n[setas contextuais da árvore]');

/* árvore serializada do passo (detecção real, sem depender do nome da variável) */
function treeRootAt(trace, i) {
  const step = trace.steps[i];
  const opsMap = DSV.buildOpsMap(trace.steps);
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
  if (!sel || sel.id == null) return null;
  return DSV.findValueById(step, sel.id);
}

/* todas as setas que o render desenharia ao longo do trace */
function transitionsOf(trace) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const out = [];
  for (let i = 1; i < trace.steps.length; i++) {
    const step = trace.steps[i];
    const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
    if (!sel || sel.id == null) continue;
    const root = DSV.findValueById(step, sel.id);
    if (!root) continue;
    const tr = DSV.treeTransition(trace.steps, i, root);
    if (tr) out.push(Object.assign({ i: i }, tr));
  }
  return out;
}

function treeValueById(root) {
  const map = {};
  (function walk(n) {
    if (!n) return;
    const v = prop(n, 'valor');
    map[n.id] = String(v ? v.v : '?');
    walk(childOf(n, 'esquerda'));
    walk(childOf(n, 'direita'));
  })(root);
  return map;
}

function treeIdsOf(root) {
  const ids = {};
  (function walk(n) {
    if (!n || ids[n.id]) return;
    ids[n.id] = true;
    walk(childOf(n, 'esquerda'));
    walk(childOf(n, 'direita'));
  })(root);
  return ids;
}

function treeParentById(root) {
  const map = {};
  (function walk(n) {
    if (!n) return;
    const L = childOf(n, 'esquerda');
    const R = childOf(n, 'direita');
    if (L) map[L.id] = n.id;
    if (R) map[R.id] = n.id;
    walk(L);
    walk(R);
  })(root);
  return map;
}

/* render de um passo, com ou sem o histórico (steps/stepIndex) */
function renderTreeStepAt(trace, i, withHistory) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const step = trace.steps[i];
  const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
  assert(sel, 'árvore detectada no passo ' + i);
  const container = {};
  const ctx = {
    opsMap: opsMap,
    pointers: step.pointers || {},
    events: step.events || [],
    visit: DSV.computeVisitOrder(trace.steps),
    prevStep: i > 0 ? trace.steps[i - 1] : null,
    nextStep: i < trace.steps.length - 1 ? trace.steps[i + 1] : null
  };
  if (withHistory !== false) {
    ctx.steps = trace.steps;
    ctx.stepIndex = i;
  }
  DSV.renderStructure(container, sel, step, ctx);
  return container.innerHTML;
}

test('setas: busca desce pela árvore seguindo o ponteiro "atual"', () => {
  const t = run(treeExample('arvore-busca').code);
  noError(t);
  const trs = transitionsOf(t);
  eq(trs.length, 2, 'duas transições de descida na busca por 40');
  const vals = treeValueById(treeRootAt(t, t.steps.length - 1));
  const pairs = trs.map((tr) => vals[tr.fromId] + '→' + vals[tr.toId]);
  assert(pairs.indexOf('50→30') >= 0, 'desce para 30: ' + pairs.join(', '));
  assert(pairs.indexOf('30→40') >= 0, 'desce para 40: ' + pairs.join(', '));
  trs.forEach((tr) => {
    eq(tr.label, 'atual', 'cursor é o ponteiro atual');
    assert(tr.op === 'buscar', 'operação de busca');
  });
  const linhas = trs.map((tr) => t.steps[tr.i].line).sort();
  eq(linhas.join(','), '29,31', 'setas exatamente nas atribuições de descida');
});

test('setas: inserção por nível mostra a varredura real do cursor', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const trs = transitionsOf(t).filter((tr) => tr.op === 'inserir');
  eq(trs.length, 4, 'quatro varreduras do cursor na inserção (A→B e B→C)');
  trs.forEach((tr) => eq(tr.label, 'cursor', 'cursor da BFS de inserção'));
  const vals = treeValueById(treeRootAt(t, t.steps.length - 1));
  const pairs = trs.map((tr) => vals[tr.fromId] + '→' + vals[tr.toId]);
  assert(pairs.indexOf('A→B') >= 0, 'varredura A→B: ' + pairs.join(', '));
  assert(pairs.indexOf('B→C') >= 0, 'varredura B→C: ' + pairs.join(', '));
});

test('setas: percursos só conectam nós adjacentes (pai e filho)', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const trs = transitionsOf(t).filter((tr) => /^(pre|em|pos)Ordem$/.test(tr.op));
  assert(trs.length >= 10, 'transições nos percursos: ' + trs.length);
  for (const tr of trs) {
    const root = treeRootAt(t, tr.i);
    const parents = treeParentById(root);
    const adjacente = parents[tr.fromId] === tr.toId || parents[tr.toId] === tr.fromId;
    assert(adjacente, 'transição ' + tr.fromId + '→' + tr.toId + ' segue uma conexão real');
  }
  /* ids de nós são estáveis no trace: a sequência de visita é a real */
  const vals = treeValueById(treeRootAt(t, t.steps.length - 1));
  const pares = trs.map((tr) => vals[tr.fromId] + '→' + vals[tr.toId]);
  assert(pares.indexOf('A→B') >= 0 && pares.indexOf('B→D') >= 0, 'descidas do percurso presentes: ' + pares.slice(0, 6).join(', '));
});

test('setas: regra ignora transição fora da operação, frame ou conexão', () => {
  const node = (id, val, L, R) => ({
    t: 'o', id: id, props: {
      valor: { t: 'p', v: val },
      esquerda: L || { t: 'p', v: null },
      direita: R || { t: 'p', v: null }
    }
  });
  const root = node(1, 'A', node(2, 'B'), node(3, 'C'));
  const st = (name, id) => ({ stack: [{ name: name, line: 1 }], pointers: id == null ? {} : { [id]: ['no'] } });

  /* mesmo frame, percurso: B→C são irmãos, não uma conexão real — sem seta */
  assert(DSV.treeTransition([st('emOrdem', 2), st('emOrdem', 3)], 1, root) === null, 'percurso não inventa salto entre irmãos B→C');
  /* A→B é conexão real: seta */
  const ok = DSV.treeTransition([st('emOrdem', 1), st('emOrdem', 2)], 1, root);
  assert(ok && ok.fromId === 1 && ok.toId === 2, 'percurso desenha A→B');
  /* C→A é o retorno pela mesma conexão: seta no sentido inverso */
  const volta = DSV.treeTransition([st('emOrdem', 3), st('emOrdem', 1)], 1, root);
  assert(volta && volta.fromId === 3 && volta.toId === 1, 'percurso desenha o retorno C→A');

  /* frames não relacionados (novo laço BFS na mesma operação): sem seta */
  const busca = { stack: [{ name: 'remover' }, { name: 'buscar' }], pointers: { 1: ['atual'] } };
  const paiDe = { stack: [{ name: 'remover' }, { name: 'paiDe' }], pointers: { 3: ['atual'] } };
  assert(DSV.treeTransition([busca, paiDe], 1, root) === null, 'novo laço não conecta ao anterior');

  /* operação diferente no meio: sem seta */
  const fora = { stack: [], pointers: { 1: ['atual'] } };
  const busca2 = { stack: [{ name: 'buscar' }], pointers: { 2: ['atual'] } };
  assert(DSV.treeTransition([fora, busca2], 1, root) === null, 'sem operação em execução não há seta');

  /* ponteiro ativo não mudou de nó: sem seta */
  assert(DSV.treeTransition([st('buscar', 2), st('buscar', 2)], 1, root) === null, 'mesmo nó não gera seta');
  /* primeiro passo do trace: sem seta */
  assert(DSV.treeTransition([st('buscar', 2)], 0, root) === null, 'sem histórico não há seta');
});

test('setas: geometria termina antes das bordas dos nós', () => {
  const g = DSV.treeArrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, 20);
  assert(g, 'geometria calculada');
  assert(Math.abs(g.sx - 23) < 0.01, 'origem depois do raio + folga: ' + g.sx);
  assert(Math.abs(g.ex - 77) < 0.01, 'ponta antes do raio do destino: ' + g.ex);
  assert(Math.abs(g.sy) < 0.01 && Math.abs(g.ey) < 0.01, 'seta alinhada ao eixo');
  assert(g.d.indexOf('M') === 0 && /Z$/.test(g.d), 'path com haste e ponta fechada');
  assert(DSV.treeArrowGeometry({ x: 0, y: 0 }, { x: 30, y: 0 }, 20, 20) === null, 'sem espaço entre os nós, nada é desenhado');
  assert(DSV.treeArrowGeometry({ x: 0, y: 0 }, { x: 0, y: 90 }, 20, 20).ey > 60, 'direção vertical correta');
});

test('conexões: curva sai do fundo do pai e termina antes do filho', () => {
  const g = DSV.treeEdgeGeometry({ x: 0, y: 0 }, { x: 120, y: 100 }, 20, 20);
  assert(g, 'geometria calculada');
  assert(Math.abs(g.sy - 22) < 0.01, 'sai após o raio do pai + folga: ' + g.sy);
  assert(Math.abs(g.ey - 77) < 0.01, 'termina antes do raio do filho + folga: ' + g.ey);
  assert(g.curve.indexOf('M') === 0 && g.curve.indexOf('C') > 0, 'traçado em Bézier cúbica');
  assert(g.c1x > g.sx && g.c2x < g.ex, 'pontos de controle inclinam na direção do filho');
  assert(Math.abs((g.c1x - g.sx) - (g.ex - g.c2x)) < 0.01, 'inclinação simétrica nas duas pontas');
  assert(Math.abs(g.c1x - (g.sx + (g.ex - g.sx) / 10)) < 0.01, 'inclinação discreta (sem virar reta)');
  const reta = DSV.treeEdgeGeometry({ x: 0, y: 0 }, { x: 0, y: 100 }, 20, 20);
  eq(reta.curve, 'M0 22C0 49.5 0 49.5 0 77', 'pai e filho alinhados geram reta vertical limpa');
  assert(DSV.treeEdgeGeometry({ x: 0, y: 0 }, { x: 0, y: 30 }, 20, 20) === null, 'sem vão vertical não inventa traçado');
});

test('conexões: trecho inicial da revelação preserva o pai e avança com t', () => {
  const g = DSV.treeEdgeGeometry({ x: 0, y: 0 }, { x: 120, y: 100 }, 20, 20);
  const metade = DSV.treeEdgeSegment(g, 0.5);
  assert(metade.indexOf('M0 22C') === 0, 'trecho começa na saída do pai: ' + metade.slice(0, 16));
  assert(metade.indexOf('77') < 0, 'trecho ainda não chegou ao filho');
  eq(DSV.treeEdgeSegment(g, 1), g.curve, 't = 1 devolve a curva inteira');
  eq(DSV.treeEdgeSegment(null, 0.5), '', 'sem geometria não há trecho');
  /* o ponto final do trecho é o próprio ponto da curva em t */
  const fim = DSV.treeEdgeSegment(g, 0.5).match(/C[\d.\-]+ [\d.\-]+ [\d.\-]+ [\d.\-]+ ([\d.\-]+) ([\d.\-]+)/);
  const pt = DSV.treeEdgePointAt(g, 0.5);
  assert(fim && Math.abs(parseFloat(fim[1]) - pt.x) < 0.01 && Math.abs(parseFloat(fim[2]) - pt.y) < 0.01,
    'frente da revelação anda sobre a curva');
});

test('conexões: ponto e tangente percorrem a curva do pai ao filho', () => {
  const g = DSV.treeEdgeGeometry({ x: 0, y: 0 }, { x: 120, y: 100 }, 20, 20);
  const p0 = DSV.treeEdgePointAt(g, 0);
  const p1 = DSV.treeEdgePointAt(g, 1);
  const pm = DSV.treeEdgePointAt(g, 0.5);
  assert(Math.abs(p0.x - g.sx) < 0.01 && Math.abs(p0.y - g.sy) < 0.01, 't=0 é a saída do pai');
  assert(Math.abs(p1.x - g.ex) < 0.01 && Math.abs(p1.y - g.ey) < 0.01, 't=1 é a chegada no filho');
  assert(p0.uy > 0 && p1.uy > 0, 'a tangente desce do pai para o filho nas duas pontas');
  assert(p0.ux > 0 && p1.ux > 0, 'a tangente aponta na direção do filho');
  const vertical = DSV.treeEdgeGeometry({ x: 0, y: 0 }, { x: 0, y: 100 }, 20, 20);
  const v0 = DSV.treeEdgePointAt(vertical, 0);
  assert(Math.abs(v0.ux) < 0.01 && v0.uy > 0.99, 'conexão alinhada tem tangente vertical');
  assert(pm.x > p0.x && pm.x < p1.x && pm.y > p0.y && pm.y < p1.y, 'meio do caminho fica entre os dois nós');
  assert(DSV.treeEdgePointAt(null, 0.5) === null, 'sem geometria não há ponto');
});

test('conexões: render usa curvas Bézier com marcador de ponta reutilizável', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const alvo = 'A(B(D(.,.),E(.,.)),C(F(.,.),.))';
  const step = t.steps.filter((s) => shapeOf(treeRootOf(s, 'arvore')) === alvo)[0];
  const html = renderTreeStep(t, step).html;
  assert(html.indexOf('<marker id="tree-marker"') >= 0, 'marcador base definido uma vez');
  assert(html.indexOf('<marker id="tree-marker-active"') < 0, 'conexão ativa usa o indicador como ponta, sem marcador duplicado');
  assert(html.indexOf('<marker id="tree-marker-new"') >= 0, 'marcador da conexão nova definido');
  const paths = html.match(/<path d="M[^"]*" class="tree-edge"[^>]*>/g) || [];
  eq(paths.length, 5, 'cinco conexões');
  paths.forEach((p) => assert(p.indexOf('C') > 0, 'conexão é curva Bézier: ' + p.slice(0, 44)));
});

test('conexões: só a conexão percorrida no passo fica ativa', () => {
  ['arvore-busca', 'arvore-em-ordem'].forEach((exId) => {
    const t = run(treeExample(exId).code);
    noError(t, exId);
    let viram = 0;
    let reveses = 0;
    for (let i = 0; i < t.steps.length; i++) {
      const root = treeRootAt(t, i);
      if (!root) continue;
      const tr = DSV.treeTransition(t.steps, i, root);
      const parents = treeParentById(root);
      const temAresta = !!(tr && (parents[tr.fromId] === tr.toId || parents[tr.toId] === tr.fromId));
      if (tr && parents[tr.fromId] === tr.toId) reveses++; /* retorno filho → pai */
      const html = renderTreeStepAt(t, i, true);
      const ativos = (html.match(/class="tree-edge active"/g) || []).length;
      eq(ativos, temAresta ? 1 : 0, exId + ' passo ' + i + ': conexão ativa coerente com a transição');
      if (temAresta) viram++;
    }
    assert(viram > 0, exId + ': houve passo com conexão ativa (' + viram + ')');
    if (exId === 'arvore-em-ordem') assert(reveses > 0, 'percursos têm retornos (filho → pai) exercitados');
  });
});

test('conexões: prévia da vaga é uma curva tracejada da borda do pai à vaga', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  let alvo = -1;
  for (let i = 0; i < t.steps.length - 1; i++) {
    const s = t.steps[i];
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'tree')[0];
    if (!sel || sel.id == null) continue;
    const info = DSV.explainStep(s, sel, { nextStep: t.steps[i + 1] });
    if (info.text && info.text.indexOf('primeira posição disponível') >= 0) { alvo = i; break; }
  }
  assert(alvo >= 0, 'passo imediatamente antes de uma inserção');
  const html = renderTreeStepAt(t, alvo, true);
  const pre = html.match(/<path d="(M[^"]*)" class="tree-preview-edge"/);
  assert(pre, 'prévia desenhada como path');
  assert(pre[1].indexOf('C') > 0, 'prévia usa o mesmo traçado curvo das conexões');
});

test('conexões: aviso tracejado marca as conexões que a remoção vai refazer', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  /* passo imediatamente antes de uma promoção: as conexões antigas do nó
   * estão prestes a mudar e a nova relação chega destacada na etapa seguinte */
  let idx = -1;
  for (let i = 1; i + 1 < t.steps.length; i++) {
    const cur = treeRootAt(t, i);
    if (!cur) continue;
    const sel = DSV.detectStructures(t.steps[i], opsMap).filter((c) => c.type === 'tree')[0];
    const next = DSV.findTreeInStep(t.steps[i + 1], sel, cur);
    if (!next || !Object.keys(DSV.treePendingEdges(cur, next)).length) continue;
    if (renderTreeStepAt(t, i + 1, true).indexOf('tree-edge new') >= 0) { idx = i; break; }
  }
  assert(idx > 0, 'existe passo com conexão prestes a mudar');
  const html = renderTreeStepAt(t, idx, true);
  assert(html.indexOf('class="tree-edge changing"') >= 0, 'aviso tracejado desenhado antes da mudança');
  const depois = renderTreeStepAt(t, idx + 1, true);
  assert(depois.indexOf('tree-edge new') >= 0, 'a nova relação chega destacada');
  const fim = renderTreeStepAt(t, idx + 2, true);
  assert(fim.indexOf('tree-edge changing') < 0, 'o aviso some depois da mudança');
});

test('setas: render desenha a seta só quando o passo tem transição', () => {
  const t = run(treeExample('arvore-busca').code);
  noError(t);
  const trs = transitionsOf(t);
  assert(trs.length > 0, 'existe transição na busca');
  const idx = trs[0].i;

  const com = renderTreeStepAt(t, idx, true);
  assert(com.indexOf('tree-arrow') >= 0, 'seta desenhada no passo da transição');
  const semHistorico = renderTreeStepAt(t, idx, false);
  assert(semHistorico.indexOf('tree-arrow') < 0, 'sem histórico a seta não é inventada');

  /* passo neutro (sem transição e com a árvore visível) não ganha seta */
  let neutro = -1;
  for (let i = 1; i < t.steps.length; i++) {
    const root = treeRootAt(t, i);
    if (!root) continue;
    if (DSV.treeTransition(t.steps, i, root) == null && treeRootAt(t, i - 1)) { neutro = i; break; }
  }
  assert(neutro > 0, 'existe passo neutro');
  assert(renderTreeStepAt(t, neutro, true).indexOf('tree-arrow') < 0, 'estado neutro permanece limpo');

  /* a ponta não invade os círculos: coordenadas do path coerentes com o raio */
  const html = com;
  const from = treeValueById(treeRootAt(t, idx));
  assert(from[trs[0].fromId] && from[trs[0].toId], 'nós da seta existem na árvore');
});

test('setas: nó recém-inserido recebe destaque discreto na etapa e some depois', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  let idx = -1;
  for (let i = 1; i < t.steps.length; i++) {
    const cur = treeRootOf(t.steps[i], 'arvore');
    const prev = treeRootOf(t.steps[i - 1], 'arvore');
    if (cur && prev && shapeOf(prev) === 'A(.,.)' && shapeOf(cur).indexOf('A(B') === 0) { idx = i; break; }
  }
  assert(idx > 0, 'passo da inserção de B');
  assert(/class="tree-node new"/.test(renderTreeStepAt(t, idx, true)), 'nó novo destacado discretamente');
  assert(!/class="tree-node new"/.test(renderTreeStepAt(t, idx + 1, true)), 'destaque some na etapa seguinte');
});

test('setas: remoção mantém setas apenas entre nós presentes na árvore', () => {
  const t = run(treeExample('arvore-simples-remocao').code);
  noError(t);
  const trs = transitionsOf(t);
  assert(trs.length >= 20, 'transições durante as remoções: ' + trs.length);
  trs.forEach((tr) => {
    const ids = treeIdsOf(treeRootAt(t, tr.i));
    assert(ids[tr.fromId] && ids[tr.toId], 'passo ' + tr.i + ': seta presa a nós presentes (nunca ao removido)');
  });
  /* a promoção de D após remover B é uma remontagem da conexão: nenhuma
   * seta inventada ligando o nó removido ao novo pai */
  const promo = 'A(D(H(.,.),E(.,.)),G(.,.))';
  const passo = t.steps.findIndex((s) => shapeOf(treeRootOf(s, 'arvore')) === promo);
  assert(passo > 0, 'passo após a promoção');
  for (let i = passo; i <= passo + 1 && i < t.steps.length; i++) {
    const root = treeRootAt(t, i);
    if (!root) continue;
    const tr = DSV.treeTransition(t.steps, i, root);
    const ids = treeIdsOf(root);
    if (tr) assert(ids[tr.fromId] && ids[tr.toId], 'sem seta órfã após a promoção');
  }
});

/* DOM mínimo para exercitar o caminho animado (o app real usa SVG + rAF) */
function withFakeDom(fn) {
  const savedDoc = globalThis.document;
  const savedRaf = globalThis.requestAnimationFrame;
  const savedNow = DSV.anim.now;
  let rafCb = null;
  function mkEl(tag) {
    return {
      tag: tag, children: [], attrs: {}, style: {}, innerHTML: '', textContent: '',
      className: '', parentNode: null,
      appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } },
      animate() { return null; }
    };
  }
  globalThis.document = {
    createElement(tag) { return mkEl(tag); },
    createElementNS(ns, tag) { return mkEl(tag); },
    body: mkEl('body')
  };
  globalThis.requestAnimationFrame = function (cb) { rafCb = cb; return 1; };
  const dom = {
    mkEl: mkEl,
    /* executa o próximo quadro com um instante controlado */
    runFrame(when) {
      const cb = rafCb;
      rafCb = null;
      if (when != null) DSV.anim.now = () => when;
      if (cb) { cb(); return true; }
      return false;
    }
  };
  try {
    return fn(dom);
  } finally {
    globalThis.document = savedDoc;
    globalThis.requestAnimationFrame = savedRaf;
    DSV.anim.now = savedNow;
  }
}

test('setas: cena animada desenha e reposiciona a seta a cada quadro', () => {
  const t = run(treeExample('arvore-busca').code);
  noError(t);
  const trs = transitionsOf(t);
  assert(trs.length > 0, 'passo com transição');
  const idx = trs[0].i;

  withFakeDom((dom) => {
    const step = t.steps[idx];
    const opsMap = DSV.buildOpsMap(t.steps);
    const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
    const container = dom.mkEl('div');
    const now0 = DSV.anim.now();
    DSV.renderStructure(container, sel, step, {
      opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [],
      steps: t.steps, stepIndex: idx,
      prevStep: t.steps[idx - 1], nextStep: t.steps[idx + 1]
    });
    const scene = container.__treeScene;
    assert(scene && scene.arrowEl, 'cena animada com o path da seta');
    eq(scene.arrowEl.getAttribute('class'), 'tree-arrow', 'classe da seta');

    const lerD = () => scene.arrowEl.getAttribute('d');
    const dInicial = lerD();
    assert(dInicial && dInicial.indexOf('M') === 0, 'seta posicionada já no render');
    let dDepois = dInicial;
    for (let k = 1; k <= 20; k++) {
      if (!dom.runFrame(now0 + k * 40)) break;
      dDepois = lerD();
    }
    assert(dDepois !== dInicial, 'a seta acompanha os nós durante a interpolação');
    eq(scene.arrowEl.getAttribute('opacity'), '1', 'seta visível ao fim da animação');

    /* geometria: a ponta repousa na borda do destino (raio + folga) e o
     * indicador conserva haste + ponta na direção do movimento */
    const m = dDepois.match(/^M([\d.\-]+) ([\d.\-]+)L[\d.\-]+ [\d.\-]+M([\d.\-]+) ([\d.\-]+)L/);
    assert(m, 'path no formato haste + ponta: ' + dDepois);
    const from = scene.nodes[trs[0].fromId];
    const to = scene.nodes[trs[0].toId];
    const dHaste = Math.hypot(parseFloat(m[3]) - parseFloat(m[1]), parseFloat(m[4]) - parseFloat(m[2]));
    const dTip = Math.hypot(parseFloat(m[3]) - to.x, parseFloat(m[4]) - to.y);
    assert(Math.abs(dTip - (to.r + 3)) < 0.01, 'ponta repousa antes do destino (' + dTip.toFixed(2) + ' ~ ' + (to.r + 3).toFixed(2) + ')');
    assert(Math.abs(dHaste - 18) < 0.01, 'indicador tem comprimento fixo e legível (' + dHaste.toFixed(2) + ')');
    const dTail = Math.hypot(parseFloat(m[1]) - from.x, parseFloat(m[2]) - from.y);
    assert(dTail > dTip, 'indicador termina mais perto do destino do que da origem');

    /* passo sem transição: a cena remove a seta */
    let neutro = -1;
    for (let i = 1; i < t.steps.length; i++) {
      const root = treeRootAt(t, i);
      if (root && DSV.treeTransition(t.steps, i, root) == null) { neutro = i; break; }
    }
    assert(neutro > 0, 'passo neutro');
    const stepN = t.steps[neutro];
    const selN = DSV.detectStructures(stepN, DSV.buildOpsMap(t.steps)).filter((c) => c.type === 'tree')[0];
    DSV.renderStructure(container, selN, stepN, {
      opsMap: DSV.buildOpsMap(t.steps), pointers: stepN.pointers || {}, events: stepN.events || [],
      steps: t.steps, stepIndex: neutro, prevStep: t.steps[neutro - 1]
    });
    const cenaN = container.__treeScene;
    assert(cenaN && cenaN.arrowEl == null, 'seta removida quando a etapa não tem transição');
  });
});

test('conexões: cena animada marca a conexão percorrida como ativa', () => {
  const t = run(treeExample('arvore-busca').code);
  noError(t);
  const trs = transitionsOf(t);
  assert(trs.length > 0, 'passo com transição');
  const idx = trs[0].i;

  withFakeDom((dom) => {
    const container = dom.mkEl('div');
    const render = (i) => {
      const step = t.steps[i];
      const sel = DSV.detectStructures(step, DSV.buildOpsMap(t.steps)).filter((c) => c.type === 'tree')[0];
      DSV.renderStructure(container, sel, step, {
        opsMap: DSV.buildOpsMap(t.steps), pointers: step.pointers || {}, events: step.events || [],
        steps: t.steps, stepIndex: i,
        prevStep: i > 0 ? t.steps[i - 1] : null,
        nextStep: i + 1 < t.steps.length ? t.steps[i + 1] : null
      });
      return container.__treeScene;
    };
    const ativosDa = (scene) => Object.keys(scene.edges).filter((cid) => {
      const cls = scene.edges[cid].line.getAttribute('class') || '';
      return cls.indexOf('active') >= 0;
    });

    const scene = render(idx);
    const ativos = ativosDa(scene);
    eq(ativos.length, 1, 'uma única conexão ativa no passo da transição');
    const parents = treeParentById(treeRootAt(t, idx));
    const childId = Number(ativos[0]);
    eq(parents[childId], trs[0].fromId, 'a conexão ativa liga a origem ao destino da transição');
    eq(childId, trs[0].toId, 'o filho da conexão ativa é o nó de destino');

    /* passo neutro: nenhuma conexão ativa, e ao voltar o destaque some */
    let neutro = -1;
    for (let i = 1; i < t.steps.length; i++) {
      const root = treeRootAt(t, i);
      if (root && DSV.treeTransition(t.steps, i, root) == null) { neutro = i; break; }
    }
    assert(neutro > 0, 'passo neutro');
    eq(ativosDa(render(neutro)).length, 0, 'sem transição nenhuma conexão fica ativa');
    eq(ativosDa(render(idx)).length, 1, 'ao voltar, a conexão percorrida volta a ficar ativa');
  });
});

test('conexões: com movimento reduzido o indicador já nasce no destino', () => {
  const t = run(treeExample('arvore-busca').code);
  noError(t);
  const trs = transitionsOf(t);
  assert(trs.length > 0, 'passo com transição');
  const idx = trs[0].i;
  const opsMap = DSV.buildOpsMap(t.steps);
  const saved = DSV.anim.reducedMotion;
  DSV.anim.reducedMotion = true;
  try {
    withFakeDom((dom) => {
      const step = t.steps[idx];
      const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
      const container = dom.mkEl('div');
      DSV.renderStructure(container, sel, step, {
        opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [],
        steps: t.steps, stepIndex: idx,
        prevStep: t.steps[idx - 1], nextStep: t.steps[idx + 1]
      });
      const scene = container.__treeScene;
      assert(scene && scene.arrow && scene.arrowEl, 'indicador criado');
      eq(scene.arrow.dur, 0, 'sem percurso quando o movimento é reduzido');
      const m = scene.arrowEl.getAttribute('d').match(/^M[\d.\-]+ [\d.\-]+L[\d.\-]+ [\d.\-]+M([\d.\-]+) ([\d.\-]+)L/);
      assert(m, 'path do indicador no formato esperado');
      const to = scene.nodes[trs[0].toId];
      const dTip = Math.hypot(parseFloat(m[1]) - to.x, parseFloat(m[2]) - to.y);
      assert(Math.abs(dTip - (to.r + 3)) < 0.01, 'já posicionado no destino (' + dTip.toFixed(2) + ')');
    });
  } finally {
    DSV.anim.reducedMotion = saved;
  }
});

test('conexões: revelação da conexão nova é progressiva e conclui sozinha', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  /* primeiro passo em que um filho troca de pai/aparece: a conexão é nova */
  let idx = -1;
  let cid = -1;
  for (let i = 1; i < t.steps.length; i++) {
    const cur = treeRootAt(t, i);
    const prev = treeRootAt(t, i - 1);
    if (!cur || !prev) continue;
    const changed = DSV.treeChangedEdges(prev, cur);
    const novas = Object.keys(changed).filter((k) => changed[k]);
    if (novas.length) { idx = i; cid = Number(novas[0]); break; }
  }
  assert(idx > 0 && cid > 0, 'passo com conexão nova');

  const opsMap = DSV.buildOpsMap(t.steps);
  const render = (dom) => {
    const step = t.steps[idx];
    const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
    const container = dom.mkEl('div');
    DSV.renderStructure(container, sel, step, {
      opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [],
      steps: t.steps, stepIndex: idx,
      prevStep: t.steps[idx - 1], nextStep: t.steps[idx + 1],
      animMs: 300
    });
    return container.__treeScene;
  };

  withFakeDom((dom) => {
    const now0 = DSV.anim.now();
    const scene = render(dom);
    const edge = scene.edges[cid];
    assert(edge, 'aresta da conexão nova na cena');
    assert(edge.reveal < 1, 'nasce incompleta, em revelação');
    assert((edge.line.getAttribute('class') || '').indexOf('new') >= 0, 'classe de conexão nova');
    dom.runFrame(now0 + 40);
    const parcial = edge.line.getAttribute('d');
    const p = scene.nodes[edge.parentId];
    const c = scene.nodes[cid];
    const cheia = DSV.treeEdgeGeometry({ x: p.x, y: p.y }, { x: c.x, y: c.y }, p.r, c.r).curve;
    assert(parcial && parcial.indexOf('C') > 0, 'trecho parcial desenhado no primeiro quadro');
    assert(parcial !== cheia, 'a frente ainda não chegou ao filho');
    for (let k = 2; k <= 30 && edge.reveal < 1; k++) dom.runFrame(now0 + k * 40);
    assert(edge.reveal === 1, 'a revelação conclui sozinha');
    const fim = scene.nodes[edge.parentId];
    const cFim = scene.nodes[cid];
    eq(edge.line.getAttribute('d'),
      DSV.treeEdgeGeometry({ x: fim.x, y: fim.y }, { x: cFim.x, y: cFim.y }, fim.r, cFim.r).curve,
      'estado final é a conexão inteira');
  });

  /* com movimento reduzido a conexão já nasce inteira (sem revelação) */
  const saved = DSV.anim.reducedMotion;
  DSV.anim.reducedMotion = true;
  try {
    withFakeDom((dom) => {
      const scene = render(dom);
      assert(scene.edges[cid].reveal === 1, 'sem revelação quando o movimento é reduzido');
    });
  } finally {
    DSV.anim.reducedMotion = saved;
  }
});

test('vaga da inserção: palco reserva a prévia e não salta duas vezes', () => {
  const t = run(treeExample('arvore-simples').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);

  /* caminho estático (DOM simulado/testes): a vaga nunca sai do palco */
  let vistos = 0;
  for (let i = 0; i + 1 < t.steps.length; i++) {
    if (!treeRootAt(t, i)) continue;
    const html = renderTreeStepAt(t, i, true);
    const slot = html.match(/<circle cx="([\d.\-]+)" cy="([\d.\-]+)" r="([\d.]+)" class="tree-preview-slot"/);
    if (!slot) continue;
    vistos++;
    const dim = html.match(/<svg class="tree-svg" width="([\d.]+)" height="([\d.]+)"/);
    assert(dim, 'svg com dimensões no passo ' + i);
    const W = parseFloat(dim[1]);
    const H = parseFloat(dim[2]);
    const cx = parseFloat(slot[1]);
    const cy = parseFloat(slot[2]);
    const r = parseFloat(slot[3]);
    assert(cx - r >= 0 && cy - r >= 0 && cx + r <= W && cy + r <= H,
      'vaga inteira dentro do palco no passo ' + i + ' (vaga até ' + (cy + r).toFixed(1) + ', palco ' + W + 'x' + H + ')');
  }
  assert(vistos >= 5, 'passos com prévia de inserção: ' + vistos);

  /* caminho animado: o svg/palco assume o tamanho do próximo layout e mantém
   * o enquadramento quando o nó aparece */
  let idxPrev = -1;
  for (let i = 0; i + 1 < t.steps.length; i++) {
    if (!treeRootAt(t, i)) continue;
    if (renderTreeStepAt(t, i, true).indexOf('tree-preview-slot') >= 0) { idxPrev = i; break; }
  }
  assert(idxPrev > 0, 'passo com vaga');

  withFakeDom((dom) => {
    const container = dom.mkEl('div');
    const render = (i) => {
      const step = t.steps[i];
      const sel = DSV.detectStructures(step, opsMap).filter((c) => c.type === 'tree')[0];
      DSV.renderStructure(container, sel, step, {
        opsMap: opsMap, pointers: step.pointers || {}, events: step.events || [],
        steps: t.steps, stepIndex: i,
        prevStep: i > 0 ? t.steps[i - 1] : null,
        nextStep: i + 1 < t.steps.length ? t.steps[i + 1] : null
      });
      return container.__treeScene;
    };
    const scene = render(idxPrev);
    const W = parseFloat(scene.svg.getAttribute('width'));
    const H = parseFloat(scene.svg.getAttribute('height'));
    const slotEl = scene.previewEls && scene.previewEls.circle;
    assert(slotEl, 'cena animada com a vaga pontilhada');
    const cx = parseFloat(slotEl.getAttribute('cx'));
    const cy = parseFloat(slotEl.getAttribute('cy'));
    const r = parseFloat(slotEl.getAttribute('r'));
    assert(cx - r >= 0 && cy - r >= 0 && cx + r <= W && cy + r <= H,
      'cena reserva o palco da vaga (vaga até ' + (cy + r).toFixed(1) + ', palco ' + W + 'x' + H + ')');

    const scene2 = render(idxPrev + 1);
    assert(scene2 === scene, 'mesma cena ao inserir');
    eq(parseFloat(scene2.svg.getAttribute('width')) + 'x' + parseFloat(scene2.svg.getAttribute('height')),
      W + 'x' + H, 'palco mantém o tamanho quando o nó aparece (sem segundo reenquadramento)');
  });
});

/* ---------------------------------------------------------------- */
console.log('\n[erros e limites]');

test('erro de sintaxe indica a linha', () => {
  const t = run('const a = 1;\nconst b = ;\n');
  assert(t.error, 'deve haver erro');
  eq(t.error.line, 2, 'linha do erro');
});

test('erro em tempo de execução indica a linha', () => {
  const t = run('const a = null;\na.propriedade;');
  assert(t.error, 'deve haver erro');
  eq(t.error.line, 2, 'linha do erro');
  assert(/null/.test(t.error.message), 'mensagem fala de null');
});

test('variável não definida', () => {
  const t = run('console.log(x);');
  assert(t.error, 'deve haver erro');
  assert(/"x" não foi definido/.test(t.error.message), 'mensagem de variável indefinida: ' + (t.error && t.error.message));
});

test('laço infinito para no limite de passos', () => {
  const t = run('while (true) { }', { maxSteps: 300 });
  assert(t.error, 'deve haver erro');
  assert(/Limite de 300 passos/.test(t.error.message), 'mensagem de limite');
});

test('recursão infinita para no limite de profundidade', () => {
  const t = run('function f() { return f(); }\nf();', { maxDepth: 50 });
  assert(t.error, 'deve haver erro');
  assert(/Profundidade/.test(t.error.message), 'mensagem de profundidade: ' + (t.error && t.error.message));
});

test('passos gravados antes do erro ficam preenchidos', () => {
  const t = run("console.log('antes');\nnull.x;");
  assert(t.error, 'deve haver erro');
  const last = lastStep(t);
  assert(last.globals !== null, 'último passo preenchido');
});

/* ---------------------------------------------------------------- */
console.log('\n[animações e identidade visual dos itens]');

test('ease/lerp/clamp: bordas e monotonicidade', () => {
  const A = DSV.anim;
  eq(A.ease(0), 0, 'ease(0)');
  eq(A.ease(1), 1, 'ease(1)');
  let prev = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = A.ease(t);
    assert(v >= prev - 1e-9, 'ease deve ser monotônica');
    prev = v;
  }
  eq(A.lerp(10, 20, 0.5), 15, 'lerp no meio');
  eq(A.clamp01(2), 1, 'clamp acima');
  eq(A.clamp01(-1), 0, 'clamp abaixo');
});

test('itemKeys: valores mantêm a chave ao trocar de posição', () => {
  const cinco = { t: 'p', v: 5 };
  const tres = { t: 'p', v: 3 };
  const antes = DSV.itemKeys([cinco, tres]);
  const depois = DSV.itemKeys([tres, cinco]);
  eq(antes[1], depois[0], 'chave do 3 estável');
  eq(antes[0], depois[1], 'chave do 5 estável');
  assert(antes[0] !== antes[1], 'chaves únicas');
});

test('itemKeys: duplicatas recebem chaves distintas', () => {
  const x = { t: 'p', v: 'a' };
  const keys = DSV.itemKeys([x, x, x]);
  assert(keys[0] !== keys[1] && keys[1] !== keys[2] && keys[0] !== keys[2], 'três chaves distintas');
});

test('itemKeys: objetos usam o id (identidade real)', () => {
  const n1 = { t: 'o', id: 7, props: {} };
  const n2 = { t: 'o', id: 9, props: {} };
  const k = DSV.itemKeys([n1, n2]);
  assert(k[0].indexOf('7') >= 0 && k[1].indexOf('9') >= 0, 'ids presentes');
});

test('flipRender sem DOM real apenas reconstrói (fallback seguro)', () => {
  const fake = {};
  let chamado = false;
  DSV.flipRender(fake, () => { chamado = true; }, 200);
  assert(chamado, 'build executado no fallback');
});

test('rough: elipse determinística em formato de path SVG', () => {
  const a = DSV.rough.ellipse(20, 18, 42, 1.5);
  const b = DSV.rough.ellipse(20, 18, 42, 1.5);
  eq(a, b, 'mesma seed gera o mesmo desenho');
  assert(a.indexOf('M') === 0, 'começa com M');
  assert(/^[MQLZ0-9 .\-]+$/.test(a), 'apenas comandos válidos: ' + a.slice(0, 60));
  assert(a.split('M').length >= 3, 'duas passadas (dois subpaths)');
  const c = DSV.rough.ellipse(20, 18, 43, 1.5);
  assert(a !== c, 'seeds diferentes geram desenhos diferentes');
});

test('rough: linha à mão segue os extremos e é determinística', () => {
  const d1 = DSV.rough.line(0, 0, 100, 0, 7, 1.2);
  const d2 = DSV.rough.line(0, 0, 100, 0, 7, 1.2);
  eq(d1, d2, 'determinística');
  assert(/^[MQLZ0-9 .\-]+$/.test(d1), 'comandos válidos');
  const d3 = DSV.rough.line(0, 0, 200, 100, 7, 1.2);
  assert(d1 !== d3, 'muda com os extremos');
});

test('rough: seedOf é estável e espalha ids', () => {
  eq(DSV.rough.seedOf(5, 1), DSV.rough.seedOf(5, 1), 'estável');
  assert(DSV.rough.seedOf(5, 1) !== DSV.rough.seedOf(6, 1), 'ids diferentes => seeds diferentes');
  assert(DSV.rough.seedOf(5, 1) !== DSV.rough.seedOf(5, 2), 'salt diferente => seed diferente');
});

/* ---------------------------------------------------------------- */
console.log('\n[BST da referência: #root, inserção, busca, remoção e percursos]');

/* raiz serializada do wrapper, lida do campo privado #root */
function bstRootOf(step, name) {
  const holder = (step.globals && step.globals[name]) || (step.locals && step.locals[name]);
  if (!holder || holder.t !== 'o') return undefined;
  const root = prop(holder, '#root');
  if (!root) return undefined;
  return root.t === 'o' ? root : null;
}

/* forma textual com os nomes da referência: value(left,right) */
function shapeEn(sv) {
  if (!sv) return '.';
  const val = prop(sv, 'value');
  return String(val ? val.v : '?') + '(' + shapeEn(childOf(sv, 'left')) + ',' + shapeEn(childOf(sv, 'right')) + ')';
}

/* confere que as formas aparecem na ordem cronológica das operações */
function assertShapesEn(trace, name, shapes, rotulo) {
  let cursor = 0;
  shapes.forEach((sh, i) => {
    let idx = -1;
    for (let j = cursor; j < trace.steps.length; j++) {
      if (shapeEn(bstRootOf(trace.steps[j], name)) === sh) { idx = j; break; }
    }
    assert(idx >= 0, (rotulo || 'forma') + ' #' + (i + 1) + ' na ordem esperada: ' + sh);
    cursor = idx + 1;
  });
}

/* frases da faixa de explicação ao longo de um trace (com a linha real) */
function bstTexts(trace, code) {
  const opsMap = DSV.buildOpsMap(trace.steps);
  const lines = code.split('\n');
  return trace.steps.map((s, i) => {
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'tree')[0] || null;
    return DSV.explainStep(s, sel, {
      prevStep: i > 0 ? trace.steps[i - 1] : null,
      nextStep: i < trace.steps.length - 1 ? trace.steps[i + 1] : null,
      lineText: lines[s.line - 1] ? lines[s.line - 1].trim() : ''
    }).text || '';
  });
}

test('BST: exemplo arvore-bst executa e guarda a raiz em #root', () => {
  const ex = treeExample('arvore-bst');
  const t = run(ex.code);
  noError(t, 'exemplo arvore-bst');
  const last = lastStep(t);
  assert(prop(last.globals.arvore, '#root'), 'wrapper com o campo privado #root');
  eq(shapeEn(bstRootOf(last, 'arvore')),
    '50(30(20(.,.),40(.,40(.,.))),70(60(.,.),80(.,.)))',
    'forma final (o 40 duplicado desce pela direita)');
});

test('BST: inserção posiciona menores à esquerda e maiores/iguais à direita', () => {
  const t = run(treeExample('arvore-bst').code);
  noError(t);
  assertShapesEn(t, 'arvore', [
    '50(.,.)',
    '50(30(.,.),.)',
    '50(30(.,.),70(.,.))',
    '50(30(20(.,.),.),70(.,.))',
    '50(30(20(.,.),40(.,.)),70(.,.))',
    '50(30(20(.,.),40(.,.)),70(60(.,.),.))',
    '50(30(20(.,.),40(.,.)),70(60(.,.),80(.,.)))'
  ], 'inserção');
});

test('BST: busca cobre raiz, subárvores, inexistente e árvore vazia', () => {
  const t = run(treeExample('arvore-bst').code);
  noError(t);
  const outs = outputs(t);
  assert(outs.indexOf('Buscar 10 na árvore vazia: false') >= 0, 'busca na árvore vazia');
  assert(outs.indexOf('Buscar 40 (subárvore esquerda): true') >= 0, 'busca na subárvore esquerda');
  assert(outs.indexOf('Buscar 80 (subárvore direita): true') >= 0, 'busca na subárvore direita');
  assert(outs.indexOf('Buscar 99 (não existe): false') >= 0, 'busca sem resultado');
});

test('BST: percursos em-ordem, pré-ordem e pós-ordem com os resultados esperados', () => {
  const t = run(treeExample('arvore-bst').code);
  noError(t);
  const outs = outputs(t);
  const iEm = outs.indexOf('Em-ordem (crescente):');
  const iPre = outs.indexOf('Pré-ordem:');
  const iPos = outs.indexOf('Pós-ordem:');
  assert(iEm >= 0 && iPre > iEm && iPos > iPre, 'cabeçalhos na ordem da execução');
  eq(outs.slice(iEm + 1, iEm + 8).join(','), '20,30,40,50,60,70,80', 'em-ordem');
  eq(outs.slice(iPre + 1, iPre + 8).join(','), '50,30,20,40,70,60,80', 'pré-ordem');
  eq(outs.slice(iPos + 1, iPos + 8).join(','), '20,40,30,60,80,70,50', 'pós-ordem');
});

test('BST: remoção cobre folha, um filho, dois filhos, raiz, inexistente e único nó', () => {
  const t = run(treeExample('arvore-bst-remocao').code);
  noError(t, 'exemplo arvore-bst-remocao');
  assertShapesEn(t, 'arvore', [
    '50(30(20(.,.),40(.,.)),70(60(.,.),80(.,.)))', /* construção */
    '50(30(.,40(.,.)),70(60(.,.),80(.,.)))',       /* 20 — folha */
    '50(30(.,40(.,.)),70(60(.,.),.))',             /* 80 — folha */
    '50(40(.,.),70(60(.,.),.))',                   /* 30 — só filho direito */
    '50(40(.,.),60(.,.))',                         /* 70 — só filho esquerdo */
    '50(40(.,45(.,.)),60(55(.,.),65(.,.)))',       /* preparação dos dois filhos */
    '55(40(.,45(.,.)),60(.,65(.,.)))',             /* 50 — dois filhos */
    '55(40(.,.),60(.,65(.,.)))',                   /* 45 — folha */
    '55(40(.,.),60(.,.))',                         /* 65 — folha */
    '60(40(.,.),.)',                               /* 55 — dois filhos */
    '40(.,.)',                                     /* 60 — raiz com um filho */
    '.'                                            /* 40 — único nó */
  ], 'remoção');
});

test('BST: duplicado à direita e remoção da primeira ocorrência do caminho', () => {
  const t = run(treeExample('arvore-bst-remocao').code);
  noError(t);
  assertShapesEn(t, 'duplicada', [
    '50(30(.,.),50(.,.))', /* o segundo 50 desce pela direita */
    '50(30(.,.),.)',       /* remove a primeira ocorrência; o duplicado assume o valor */
    '50(.,.)',             /* remove 30 */
    '.'                    /* remove o único nó */
  ], 'duplicada');
  const outs = outputs(t);
  const i1 = outs.indexOf('Com o 50 duplicado, em-ordem:');
  eq(outs.slice(i1 + 1, i1 + 4).join(','), '30,50,50', 'em-ordem com o duplicado');
  const i2 = outs.indexOf('Remover 50 (primeira ocorrência; o duplicado assume o valor):');
  eq(outs.slice(i2 + 1, i2 + 3).join(','), '30,50', 'em-ordem após remover a primeira ocorrência');
  const i3 = outs.indexOf('Remover 30:');
  eq(outs.slice(i3 + 1, i3 + 2).join(','), '50', 'em-ordem após remover 30');
});

test('BST: detecção usa o wrapper e não vaza o campo privado', () => {
  const t = run(treeExample('arvore-bst').code);
  noError(t);
  const last = lastStep(t);
  const cands = DSV.detectStructures(last, DSV.buildOpsMap(t.steps));
  eq(cands[0].type, 'tree', 'melhor candidato é a árvore');
  eq(cands[0].label, 'arvore', 'rótulo é o nome do wrapper (sem #root)');
  assert(cands.every((c) => String(c.label).indexOf('#root') < 0), 'nenhum candidato expõe #root');
});

test('BST: explicações mostram comparação, direção, null, sucessor e substituição', () => {
  const ex1 = treeExample('arvore-bst');
  const t1 = run(ex1.code);
  noError(t1);
  const txt1 = bstTexts(t1, ex1.code);
  assert(txt1.some((x) => x.indexOf('Comparando: 30 < 50') >= 0), 'comparação numérica na inserção');
  assert(txt1.some((x) => x.indexOf('a inserção desce para o filho esquerdo') >= 0), 'direção esquerda na inserção');
  assert(txt1.some((x) => x.indexOf('a inserção desce para o filho direito') >= 0), 'direção direita na inserção');
  assert(txt1.some((x) => x.indexOf('Seguindo a ordem da BST') >= 0), 'prévia da vaga pela ordem da BST');
  assert(txt1.some((x) => x.indexOf('a busca segue para a esquerda') >= 0), 'direção da busca');
  assert(txt1.some((x) => x.indexOf('Encontrei o nó 40') >= 0), 'busca que encontra o valor');
  assert(txt1.some((x) => x.indexOf('referência null') >= 0), 'busca que chega a null');
  assert(txt1.some((x) => x.indexOf('Visitando o nó') >= 0), 'percursos visitando nós');

  const ex2 = treeExample('arvore-bst-remocao');
  const t2 = run(ex2.code);
  noError(t2);
  const txt2 = bstTexts(t2, ex2.code);
  assert(txt2.some((x) => x.indexOf('menor valor da subárvore direita') >= 0), 'varredura do sucessor');
  assert(txt2.some((x) => x.indexOf('foi substituído por 55') >= 0), 'troca de valor do nó removido');
  assert(txt2.some((x) => x.indexOf('não está na árvore; nada foi removido') >= 0), 'remoção inexistente');
  assert(txt2.some((x) => x.indexOf('subiu para o lugar') >= 0), 'um filho assume o lugar');
});

test('BST: visitas reiniciam por operação e a seta reconhece as operações', () => {
  const t = run(treeExample('arvore-bst').code);
  noError(t);
  const visit = DSV.computeVisitOrder(t.steps);
  const epochs = {};
  Object.keys(visit.epochOf).forEach((k) => { epochs[visit.epochOf[k]] = true; });
  assert(Object.keys(epochs).length >= 5, 'épocas distintas por operação: ' + Object.keys(epochs).length);
  const trs = transitionsOf(t);
  assert(trs.some((tr) => tr.op === 'search'), 'seta contextual na busca');
  assert(trs.some((tr) => tr.op === 'insert'), 'seta contextual na inserção');
  assert(trs.some((tr) => tr.op === 'inOrderTraverse'), 'seta contextual no percurso em-ordem');
});

test('BST: render da busca destaca um único nó e não vaza o campo privado', () => {
  const t = run(treeExample('arvore-bst').code);
  noError(t);
  const opsMap = DSV.buildOpsMap(t.steps);
  let alvo = -1;
  for (let i = 0; i < t.steps.length && alvo < 0; i++) {
    const s = t.steps[i];
    if (!s.locals || !s.locals.value || s.locals.value.t !== 'p' || s.locals.value.v !== 40) continue;
    const sel = DSV.detectStructures(s, opsMap).filter((c) => c.type === 'tree')[0];
    if (!sel) continue;
    const html = renderTreeStep(t, s).html;
    if (/tree-node[^"]*active/.test(html)) alvo = i;
  }
  assert(alvo >= 0, 'passo de busca com nó ativo');
  const html = renderTreeStep(t, t.steps[alvo]).html;
  eq((html.match(/tree-node[^"]*active/g) || []).length, 1, 'um único nó em destaque por passo');
  assert(html.indexOf('tree-null-stub') < 0, 'sem stubs de filhos vazios');
  assert(html.indexOf('#root') < 0, 'campo privado não vaza para o canvas');
});

/* ---------------------------------------------------------------- */
console.log('\n[hover: identificador sob o mouse e variável do passo]');

test('identifierAt: palavra completa na coluna e null fora de identificador', () => {
  const code = 'let contador = 10;\ncontador = contador + 5;';
  eq(DSV.identifierAt(code, 0, 4), 'contador', 'início da palavra');
  eq(DSV.identifierAt(code, 0, 9), 'contador', 'meio da palavra');
  eq(DSV.identifierAt(code, 0, 11), 'contador', 'fim da palavra');
  eq(DSV.identifierAt(code, 1, 0), 'contador', 'linha 2');
  eq(DSV.identifierAt(code, 0, 3), null, 'espaço não é identificador');
  eq(DSV.identifierAt(code, 0, 13), null, 'operador =');
  eq(DSV.identifierAt(code, 0, 16), null, 'número não é identificador');
  eq(DSV.identifierAt(code, 5, 0), null, 'linha fora do texto');
  eq(DSV.identifierAt(code, 0, 99), null, 'coluna fora da linha');
});

test('identifierAt: nomes com _ e $ e dígitos internos', () => {
  const code = 'var _tmp$1 = outro_nome;';
  eq(DSV.identifierAt(code, 0, 5), '_tmp$1');
  eq(DSV.identifierAt(code, 0, 14), 'outro_nome');
});

test('resolveVariable: local, global, this e desconhecida', () => {
  const t = run([
    'let x = 1;',
    'function f(y) {',
    '  let z = x + y;',
    '  return z;',
    '}',
    'f(2);'
  ].join('\n'));
  noError(t);
  const dentro = t.steps.filter((s) => s.locals && s.locals.y).pop();
  assert(dentro, 'existe passo dentro de f');
  const ry = DSV.resolveVariable(dentro, 'y');
  eq(ry.scope, 'função atual', 'y é local');
  eq(ry.sv.v, 2, 'valor do parâmetro');
  const rz = DSV.resolveVariable(dentro, 'z');
  eq(rz.scope, 'função atual', 'z é local');
  const rx = DSV.resolveVariable(dentro, 'x');
  eq(rx.scope, 'global', 'x é global mesmo dentro da função');
  eq(rx.sv.v, 1, 'valor de x');
  eq(DSV.resolveVariable(dentro, 'naoExiste'), null, 'nome desconhecido');
  eq(DSV.resolveVariable(null, 'x'), null, 'sem passo');
});

test('resolveVariable: this nas classes', () => {
  const t = run([
    'class Pilha {',
    '  constructor() { this.itens = []; }',
    '}',
    'const p = new Pilha();'
  ].join('\n'));
  noError(t);
  const comThis = t.steps.filter((s) => s.thisVal).pop();
  assert(comThis, 'existe passo com this');
  const info = DSV.resolveVariable(comThis, 'this');
  assert(info, 'this resolvido');
  eq(info.scope, 'função atual', 'this é da função atual');
  assert(info.sv && info.sv.t === 'o', 'this serializado como objeto');
  assert(info.sv.props && info.sv.props.itens, 'campo itens no this');
  eq(DSV.resolveVariable(comThis, 'naoExiste'), null, 'nome desconhecido');
});

test('expressionAt: identificador simples, membro, privado e cadeia', () => {
  const code = 'if (value < node.value) {}';
  eq(DSV.expressionAt(code, 0, 5).name, 'value', 'identificador simples');
  eq(DSV.expressionAt(code, 0, 1).name, 'if', 'palavra-chave também é localizada');
  eq(DSV.expressionAt(code, 0, 12).name, 'node', 'cursor sobre a base');
  eq(DSV.expressionAt(code, 0, 17).name, 'node.value', 'acesso a membro');
  eq(DSV.expressionAt(code, 0, 17).parts.join('|'), 'node|value', 'base + campo');
  eq(DSV.expressionAt(code, 0, 16), null, 'ponto não é identificador');

  eq(DSV.expressionAt('this.#root = null;', 0, 7).name, 'this.#root', 'campo privado com #');
  eq(DSV.expressionAt('this.#root = null;', 0, 7).parts.join('|'), 'this|#root', 'base + campo privado');

  const chain = DSV.expressionAt('return this.#root.left.value;', 0, 24);
  eq(chain.name, 'this.#root.left.value', 'cadeia completa');
  eq(chain.parts.join('|'), 'this|#root|left|value', 'partes da cadeia');

  eq(DSV.expressionAt('node . value', 0, 9).name, 'node.value', 'espaços em volta do ponto');

  eq(DSV.expressionAt('arr[0].value', 0, 8), null, 'base computada (arr[0]) não é resolvida');
  eq(DSV.expressionAt(code, 0, 99), null, 'coluna fora da linha');
  eq(DSV.expressionAt(code, 5, 0), null, 'linha fora do texto');
});

test('resolveExpression: campo do objeto vence a variável homônima', () => {
  const t = run([
    'class No {',
    '  constructor(v) {',
    '    this.v = v;',
    '    this.left = null;',
    '    this.right = null;',
    '  }',
    '}',
    'const no = new No(80);',
    'let value = 99;',
    'const leitura = no.v;'
  ].join('\n'));
  noError(t);
  const last = lastStep(t);
  const campo = DSV.resolveExpression(last, { name: 'no.v', parts: ['no', 'v'] });
  assert(campo, 'no.v resolvido');
  eq(campo.name, 'no.v', 'nome da expressão');
  eq(campo.scope, 'global', 'escopo vem da base');
  eq(campo.sv.v, 80, 'valor do campo, não da variável homônima');
  const local = DSV.resolveExpression(last, { name: 'value', parts: ['value'] });
  eq(local.sv.v, 99, 'variável simples mantém o valor dela');
  eq(DSV.resolveExpression(last, { name: 'no.ausente', parts: ['no', 'ausente'] }), null, 'campo inexistente');
  eq(DSV.resolveExpression(last, { name: 'naoExiste.v', parts: ['naoExiste', 'v'] }), null, 'base desconhecida');
  eq(DSV.resolveExpression(null, { name: 'no.v', parts: ['no', 'v'] }), null, 'sem passo');
});

test('resolveExpression: campo privado via this', () => {
  const t = run([
    'class Caixa {',
    '  #valor = 7;',
    '  abrir() { return this.#valor; }',
    '}',
    'const c = new Caixa();',
    'c.abrir();'
  ].join('\n'));
  noError(t);
  const dentro = t.steps.filter((s) => s.thisVal).pop();
  assert(dentro, 'existe passo com this');
  const info = DSV.resolveExpression(dentro, { name: 'this.#valor', parts: ['this', '#valor'] });
  assert(info, 'this.#valor resolvido');
  eq(info.name, 'this.#valor', 'nome com #');
  eq(info.scope, 'função atual', 'escopo da função atual');
  eq(info.sv.v, 7, 'valor do campo privado');
});

/* ---------------------------------------------------------------- */
console.log('\n[lote 1: semântica e mensagens]');

test('const: reatribuição (simples, composta e ++) dá erro com linha', () => {
  const t = run('const c = 5;\nc = 6;\nconsole.log(c);');
  assert(t.error, 'deve dar erro');
  eq(t.error.line, 2, 'linha da reatribuição');
  assert(/constante/.test(t.error.message), 'mensagem: ' + (t.error && t.error.message));
  const soma = run('const c = 5;\nc += 1;');
  assert(soma.error, '+= deve dar erro');
  assert(/constante/.test(soma.error.message), 'mensagem do +=: ' + (soma.error && soma.error.message));
  const inc = run('const c = 5;\nc++;');
  assert(inc.error, '++ deve dar erro');
  assert(/constante/.test(inc.error.message), 'mensagem do ++: ' + (inc.error && inc.error.message));
});

test('const: mutação de objeto/array continua permitida', () => {
  const t = run([
    'const pilha = [];',
    'pilha.push(1);',
    'const o = { a: 1 };',
    'o.a = 2;',
    "console.log(pilha.length, o.a);"
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '1 2', 'conteúdo mutável');
});

test('const no for-of: reatribuir no corpo dá erro', () => {
  const t = run('for (const x of [1, 2]) { x = x + 1; }');
  assert(t.error, 'deve dar erro');
  assert(/constante/.test(t.error.message), 'mensagem: ' + (t.error && t.error.message));
});

test('closure no for clássico com let: cada iteração tem a sua variável', () => {
  const t = run([
    'const f = [];',
    'for (let i = 0; i < 3; i++) { f.push(() => i); }',
    'console.log(f[0](), f[1](), f[2]());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '0 1 2', 'como no JS real');
});

test('closure no for: mutação no corpo é vista pela própria iteração', () => {
  const t = run([
    'const f = [];',
    'for (let i = 0; i < 4; i++) { f.push(() => i); if (i % 2 === 0) { i = i + 1; } }',
    'console.log(f[0](), f[1]());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '1 3', 'valor final da iteração, sem o update');
});

test('closure no for com var continua compartilhado (como no JS)', () => {
  const t = run([
    'const f = [];',
    'for (var i = 0; i < 3; i++) { f.push(() => i); }',
    'console.log(f[0](), f[1](), f[2]());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '3 3 3', 'var é uma única variável');
});

test('closure no for-of continua por iteração', () => {
  const t = run([
    'const f = [];',
    'for (const x of [0, 1, 2]) { f.push(() => x); }',
    'console.log(f[0](), f[1](), f[2]());'
  ].join('\n'));
  noError(t);
  eq(outputs(t)[0], '0 1 2');
});

test('variável do cabeçalho do for não vaza para fora', () => {
  const t = run('for (let i = 0; i < 1; i++) {}\nconsole.log(typeof i);');
  noError(t);
  eq(outputs(t)[0], 'undefined');
});

test('Number: isNaN/isInteger/isFinite/parseInt/parseFloat', () => {
  const t = run([
    "console.log(Number.isNaN(NaN), Number.isNaN('x'));",
    'console.log(Number.isInteger(5), Number.isInteger(5.5));',
    'console.log(Number.isFinite(Infinity), Number.isFinite(3));',
    "console.log(Number.parseInt('42') + 1, Number.parseFloat('2.5') + 0.5);"
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[0], 'true false', 'isNaN');
  eq(outs[1], 'true false', 'isInteger');
  eq(outs[2], 'false true', 'isFinite');
  eq(outs[3], '43 3', 'parse');
});

test('Number: internos não vazam (só estáticos públicos)', () => {
  const t = run('console.log(typeof Number.impl, typeof Number.native, typeof Number.statics);');
  noError(t);
  eq(outputs(t)[0], 'undefined undefined undefined');
});

test('recursos não suportados: mensagem clara de "não é suportado"', () => {
  const casos = [
    ['try/catch', "try { console.log('x'); } catch (e) { console.log(e); }", /não é suportad/],
    ['throw', "throw new Error('x');", /não é suportad/],
    ['switch', 'switch (1) { case 1: break; default: break; }', /não é suportad/],
    ['extends', 'class A {}\nclass B extends A {}', /extends/],
    ['for...in', 'const o = { a: 1 };\nfor (const k in o) { console.log(k); }', /for\.\.\.in/],
    ['destructuring de objeto', 'const o = { a: 1 };\nconst { a } = o;', /Desestruturação/],
    ['destructuring de array', 'const [x, y] = [1, 2];', /Desestruturação/],
    ['destructuring de parâmetro', 'function f({ a }) { return a; }', /Desestruturação/],
    ['new Array', 'const a = new Array(3).fill(0);', /new Array.*não é suportad/],
    ['**', 'const x = 2 ** 3;', /"\*\*"/],
    ['??', 'const x = null ?? 1;', /"\?\?"/],
    ['?.', 'const x = null?.a;', /"\?\."/],
    ['spread', 'const a = [1];\nconst b = [...a];', /Spread/],
    ['rest', 'function f(...xs) { return xs.length; }', /Spread|rest/]
  ];
  casos.forEach(([nome, code, rx]) => {
    const t = run(code);
    assert(t.error, nome + ' deve dar erro');
    assert(rx.test(t.error.message), nome + ': ' + (t.error && t.error.message));
  });
});

test('Set/Map: mensagem específica (não "não foi definido")', () => {
  const s = run('const s = new Set();');
  assert(s.error, 'Set deve dar erro');
  assert(/não é suportado/.test(s.error.message), 'Set: ' + (s.error && s.error.message));
  assert(/Map\/Set/.test(s.error.message), 'dica: ' + (s.error && s.error.message));
  const m = run('const m = new Map();');
  assert(m.error, 'Map deve dar erro');
  assert(/não é suportado/.test(m.error.message), 'Map: ' + (m.error && m.error.message));
});

test('checagens de sintaxe não afetam código suportado', () => {
  const t = run([
    'const o = { default: 1, in: 2 };',
    'console.log(o.default, o.in);',
    'const r = 1 ? .5 : 2;',
    'console.log(r);'
  ].join('\n'));
  noError(t);
  const outs = outputs(t);
  eq(outs[0], '1 2', 'chaves default/in em objeto');
  eq(outs[1], '0.5', 'ternário com .5');
});

test('recursão finita profunda (400 chamadas) funciona no limite padrão', () => {
  const t = run('function f(n) { if (n === 0) return 0; return 1 + f(n - 1); }\nconsole.log(f(400));');
  noError(t);
  eq(outputs(t)[0], '400');
});

test('recursão infinita: mensagem explica a proteção', () => {
  const t = run('function f() { return f(); }\nf();');
  assert(t.error, 'deve dar erro');
  assert(/Profundidade de chamadas excedida \(500\)/.test(t.error.message), 'limite padrão 500: ' + (t.error && t.error.message));
  assert(/recursão infinita/.test(t.error.message), 'explica o caso');
});

/* ---------------------------------------------------------------- */
console.log('\n[todos os exemplos executam sem erro]');
DSV.EXAMPLES.forEach((ex) => {
  test('exemplo: ' + ex.name, () => {
    const t = run(ex.code);
    noError(t, 'exemplo ' + ex.id);
    assert(t.steps.length > 0, 'gera passos');
    assert(t.steps[0].globals !== null, 'primeiro passo preenchido');
    t.steps.forEach((s, i) => {
      assert(s.globals !== null, 'passo ' + i + ' com globals');
      assert(Array.isArray(s.events), 'passo ' + i + ' com events');
    });
  });
});

/* ---------------------------------------------------------------- */
console.log('\n========================================');
console.log('Testes: ' + passed + ' passaram, ' + failed + ' falharam.');
if (failures.length) {
  console.log('\nFalhas:');
  failures.forEach((f) => console.log(' - ' + f));
}
process.exit(failed ? 1 : 0);
