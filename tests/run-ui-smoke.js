/* ED Viz — teste de integração da interface com um DOM simulado.
 * Carrega o app de verdade (editor, playback, painéis) e percorre
 * todos os passos de todos os exemplos, exercitando cada renderizador.
 * Rode com: node tests/run-ui-smoke.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* ------------------------------------------------------------------ */
/* DOM simulado                                                        */
/* ------------------------------------------------------------------ */

const elements = Object.create(null);
const handlers = Object.create(null);

function makeEl(id) {
  const el = {
    id: id,
    tagName: id === 'code' ? 'TEXTAREA' : 'DIV',
    children: [],
    style: {},
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    max: '0',
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 400,
    scrollHeight: 800,
    classList: {
      _set: {},
      add(c) { this._set[c] = true; },
      remove(c) { delete this._set[c]; },
      toggle(c, v) { if (v === undefined) { this._set[c] = !this._set[c]; } else { this._set[c] = !!v; } },
      contains(c) { return !!this._set[c]; }
    },
    addEventListener(type, fn) {
      if (!handlers[id]) handlers[id] = {};
      handlers[id][type] = fn;
    },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); },
    setAttribute() {},
    getAttribute() { return null; },
    showModal() {},
    close() {}
  };
  return el;
}

globalThis.document = {
  getElementById(id) {
    if (!elements[id]) elements[id] = makeEl(id);
    return elements[id];
  },
  addEventListener(type, fn) {
    if (!handlers.__doc) handlers.__doc = {};
    handlers.__doc[type] = fn;
  },
  createElement(tag) { return makeEl('__' + tag); }
};

globalThis.window = globalThis;

const storage = {};
globalThis.localStorage = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
  setItem(k, v) { storage[k] = String(v); },
  removeItem(k) { delete storage[k]; }
};

let pendingTimers = [];
globalThis.setTimeout = function (fn, ms) { pendingTimers.push(fn); return pendingTimers.length; };
globalThis.clearTimeout = function () { pendingTimers = []; };

/* ------------------------------------------------------------------ */
/* Carrega os scripts do app (o app.js roda o init ao carregar)        */
/* ------------------------------------------------------------------ */

['js/util.js', 'js/tokenizer.js', 'js/parser.js', 'js/interpreter.js', 'js/examples.js', 'js/anim.js', 'js/rough.js', 'js/views.js', 'js/app.js'].forEach((f) => {
  vm.runInThisContext(read(f), { filename: f });
});

const DSV = globalThis.DSV;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'condição falsa'); }

function fire(id, type, ev) {
  const h = handlers[id] && handlers[id][type];
  assert(typeof h === 'function', 'handler ' + type + ' de #' + id + ' não registrado');
  return h.call(elements[id], ev || { target: elements[id], preventDefault() {}, key: '' });
}

function fireDoc(type, ev) {
  const h = handlers.__doc && handlers.__doc[type];
  assert(typeof h === 'function', 'handler de documento ' + type + ' não registrado');
  return h(ev || {});
}

function key(k, extra) {
  return fireDoc('keydown', Object.assign({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: { tagName: 'BODY' },
    preventDefault() {}
  }, extra || {}));
}

const $ = (id) => elements[id];

/* ------------------------------------------------------------------ */
console.log('\n[integração da interface]');

test('init executou: exemplo padrão renderiza a pilha', () => {
  const html = $('structure').innerHTML;
  assert(html.indexOf('Pilha') >= 0, 'título Pilha presente: ' + html.slice(0, 120));
  assert(html.indexOf('stack-cell') >= 0 || html.indexOf('empty') >= 0, 'células da pilha');
  assert($('exampleSelect').value === DSV.DEFAULT_EXAMPLE, 'exemplo padrão selecionado');
  assert($('code').value.length > 0, 'código carregado no editor');
});

test('markCurrentLineInGutter é seguro', () => {
    var local = $('gutterInner');
    assert(local && local.innerHTML.indexOf('gline') >= 0, 'gutter numerado');
});

function percorrerExemplo(exId) {
  $('exampleSelect').value = exId;
  fire('exampleSelect', 'change');
  const total = parseInt($('slider').max, 10);
  assert(total > 0, 'exemplo ' + exId + ' gerou passos');
  let all = $('structure').innerHTML;
  for (let i = 0; i < total; i++) {
    fire('btnNext', 'click');
    all += '\n' + $('structure').innerHTML;
  }
  assert(parseInt($('slider').value, 10) === total, 'navegou até o último passo');
  assert($('btnNext').disabled === true, 'botão próximo desabilitado no fim');
  assert($('vars').innerHTML.length > 10, 'painel de variáveis preenchido');
  assert($('callstack').innerHTML.length > 5, 'painel de chamadas preenchido');
  return all;
}

test('percorre TODOS os passos do exemplo padrão (pilha)', () => {
  const all = percorrerExemplo('pilha-array');
  assert(all.indexOf('← topo') >= 0, 'marcação de topo');
  assert(all.indexOf('push(') >= 0, 'badge de operação push');
  assert(all.indexOf('pop() → ') >= 0, 'badge de operação pop');
});

test('pilha com classe: detecta this.itens', () => {
  const all = percorrerExemplo('pilha-classe');
  assert(all.indexOf('itens') >= 0, 'mostra os itens');
  assert(all.indexOf('Pilha') >= 0, 'título Pilha');
});

test('fila: frente/traseira e shift', () => {
  const all = percorrerExemplo('fila-array');
  assert(all.indexOf('frente (início)') >= 0, 'rótulo frente');
  assert(all.indexOf('fim (traseira)') >= 0, 'rótulo fim');
  assert(all.indexOf('shift() → ') >= 0, 'badge shift');
});

test('lista encadeada: nós, chips e null', () => {
  const all = percorrerExemplo('lista-encadeada');
  assert(all.indexOf('Lista encadeada') >= 0, 'título');
  assert(all.indexOf('ptr-chip') >= 0, 'chip de ponteiro');
  assert(all.indexOf('list-null') >= 0, 'terminador null');
  assert(all.indexOf('Visitando o nó') < 0, 'saída de console não vaza para a estrutura');
});

test('árvore em-ordem: svg, chips, visita numerada', () => {
  const all = percorrerExemplo('arvore-em-ordem');
  assert(all.indexOf('tree-svg') >= 0, 'svg da árvore');
  assert(all.indexOf('ptr-chip') >= 0, 'chip de ponteiro (no/raiz)');
  assert(all.indexOf('tree-node') >= 0, 'nós desenhados');
  assert(all.indexOf('tree-visit-num') >= 0, 'numeração de visita');
});

test('busca em árvore: nó atual destacado (tagged) e stubs nulos', () => {
  const all = percorrerExemplo('arvore-busca');
  assert(all.indexOf('tagged') >= 0, 'nó destacado');
  assert(all.indexOf('∅') >= 0, 'filhos nulos para o nó atual');
  assert(all.indexOf('Encontrado: 40') >= 0 || all.indexOf('tree-svg') >= 0, 'renderizou');
});

test('bubble sort: células do array e destaque de troca', () => {
  const all = percorrerExemplo('bubble-sort');
  assert(all.indexOf('array-cell') >= 0, 'células do array');
  assert(all.indexOf('changed') >= 0, 'célula alterada destacada');
});

test('busca binária: índices visíveis', () => {
  const all = percorrerExemplo('busca-binaria');
  assert(all.indexOf('array-idx') >= 0, 'índices do array');
});

test('erro de código mostra banner com a linha', () => {
  $('code').value = 'const a = 1;\nnull.x;';
  fire('btnRun', 'click');
  const banner = $('banner').innerHTML;
  assert(banner.indexOf('Erro na linha 2') >= 0, 'banner com linha: ' + banner);
  assert(!$('banner').classList.contains('hidden'), 'banner visível');
});

test('código com erro de sintaxe também é tratado', () => {
  $('code').value = 'const = ;';
  fire('btnRun', 'click');
  assert($('banner').innerHTML.indexOf('Erro na linha') >= 0, 'banner de sintaxe');
  assert($('structure').innerHTML.length > 0, 'estrutura mostrou mensagem amigável');
});

test('seleção manual de estrutura não quebra', () => {
  $('exampleSelect').value = 'arvore-em-ordem';
  fire('exampleSelect', 'change');
  const options = $('structureSelect').innerHTML;
  assert(options.indexOf('Árvore') >= 0, 'drop-down lista a árvore');
  const valores = options.match(/value="([^"]+)"/g).map((s) => s.slice(7, -1));
  for (const v of valores) {
    if (v === 'auto') continue;
    $('structureSelect').value = v;
    fire('structureSelect', 'change');
    assert($('structure').innerHTML.length > 0, 'renderizou a seleção ' + v);
  }
});

test('play/pause alterna o botão', () => {
  const before = $('btnPlay').textContent;
  fire('btnPlay', 'click');
  const during = $('btnPlay').textContent;
  assert(before !== during, 'ícone mudou no play');
  fire('btnPlay', 'click');
  assert($('btnPlay').textContent === before, 'ícone voltou no pause');
});

test('slider navega para um passo do meio', () => {
  $('slider').value = '2';
  fire('slider', 'input');
  assert($('stepLabel').textContent.indexOf('passo 3/') === 0, 'rótulo do passo: ' + $('stepLabel').textContent);
});

/* ------------------------------------------------------------------ */
console.log('\n[modo debug: passo a passo por tecla]');

test('modo debug: ativa no primeiro passo e trava o editor', () => {
  $('exampleSelect').value = 'pilha-array';
  fire('exampleSelect', 'change');
  fire('btnDebug', 'click');
  assert($('code').readOnly === true, 'editor travado (readonly)');
  assert(!$('debugBar').classList.contains('hidden'), 'barra de debug visível');
  assert(parseInt($('slider').value, 10) === 0, 'posicionado no primeiro passo');
  assert($('debugInfo').innerHTML.indexOf('qualquer tecla') >= 0, 'dica "qualquer tecla" presente: ' + $('debugInfo').innerHTML);
});

test('modo debug: qualquer tecla executa a próxima linha', () => {
  const antes = parseInt($('slider').value, 10);
  key('x');
  assert(parseInt($('slider').value, 10) === antes + 1, 'avançou com a tecla "x"');
  key('Enter');
  assert(parseInt($('slider').value, 10) === antes + 2, 'avançou com Enter');
  key(' ');
  assert(parseInt($('slider').value, 10) === antes + 3, 'avançou com espaço');
  key('ArrowLeft');
  assert(parseInt($('slider').value, 10) === antes + 2, 'voltou com seta esquerda');
});

test('modo debug: esquema gráfico é atualizado a cada tecla', () => {
  const antes = $('structure').innerHTML + $('vars').innerHTML;
  let mudou = false;
  for (let i = 0; i < 4 && !mudou; i++) {
    key('a');
    if (($('structure').innerHTML + $('vars').innerHTML) !== antes) mudou = true;
  }
  assert(mudou, 'estrutura/variáveis mudaram ao avançar');
});

test('modo debug: no fim mostra "Fim do programa"', () => {
  key('End');
  assert($('debugInfo').innerHTML.indexOf('Fim do programa') >= 0, 'aviso de fim: ' + $('debugInfo').innerHTML);
  assert(parseInt($('slider').value, 10) === parseInt($('slider').max, 10), 'posicionado no último passo');
});

test('modo debug: Esc sai e libera o editor', () => {
  key('Escape');
  assert($('code').readOnly === false, 'editor liberado');
  assert($('debugBar').classList.contains('hidden'), 'barra escondida');
  assert($('btnDebug').classList.contains('active') === false, 'botão debug desativado');
});

test('modo debug: F10 também entra (e Esc sai)', () => {
  key('F10');
  assert($('code').readOnly === true, 'F10 ativou o modo debug');
  assert(!$('debugBar').classList.contains('hidden'), 'barra visível via F10');
  key('Escape');
  assert($('code').readOnly === false, 'Esc saiu do modo debug');
});

test('modo debug: erro de sintaxe não entra em debug', () => {
  $('code').value = 'const = ;';
  fire('btnDebug', 'click');
  assert($('code').readOnly === false, 'editor continua liberado');
  assert($('debugBar').classList.contains('hidden'), 'barra não aparece');
  assert($('banner').innerHTML.indexOf('Erro na linha') >= 0, 'banner de sintaxe');
});

/* ------------------------------------------------------------------ */
console.log('\n[consistência index.html x app.js]');

test('todos os ids usados no app existem no HTML', () => {
  const html = read('index.html');
  const app = read('js/app.js');
  const ids = [];
  const rx = /\$\('([^']+)'\)/g;
  let m;
  while ((m = rx.exec(app))) ids.push(m[1]);
  const missing = ids.filter((id) => html.indexOf('id="' + id + '"') < 0);
  assert(missing.length === 0, 'ids ausentes no HTML: ' + missing.join(', '));
});

test('ordem dos scripts no HTML está correta', () => {
  const html = read('index.html');
  const order = ['js/util.js', 'js/tokenizer.js', 'js/parser.js', 'js/interpreter.js', 'js/examples.js', 'js/anim.js', 'js/rough.js', 'js/views.js', 'js/app.js'];
  let last = -1;
  for (const s of order) {
    const idx = html.indexOf('src="' + s + '"');
    assert(idx >= 0, 'script ausente: ' + s);
    assert(idx > last, 'script fora de ordem: ' + s);
    last = idx;
  }
});

/* ------------------------------------------------------------------ */
console.log('\n========================================');
console.log('Testes de UI: ' + passed + ' passaram, ' + failed + ' falharam.');
process.exit(failed ? 1 : 0);
