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

test('bubble sort: ordena e registra trocas', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'bubble-sort');
  const t = run(example.code);
  noError(t, 'exemplo bubble');
  const last = lastStep(t);
  const vals = last.globals.valores.items.map((i) => i.v);
  eq(vals.join(','), '1,2,3,5,8,9', 'vetor ordenado');
  const outs = outputs(t);
  eq(outs[outs.length - 1], 'Ordenado: 1, 2, 3, 5, 8, 9');
});

test('busca binária: encontra 23 no índice 5', () => {
  const example = DSV.EXAMPLES.find((e) => e.id === 'busca-binaria');
  const t = run(example.code);
  noError(t, 'exemplo busca binária');
  const outs = outputs(t);
  assert(outs.some((o) => o === 'Encontrei o valor 23 no índice 5'), 'acha o alvo');
  assert(outs.length < 12, 'poucos passos de console (busca binária)');
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
