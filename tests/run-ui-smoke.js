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
    style: {
      setProperty(k, v) { this[k] = v; },
      getPropertyValue(k) { return this[k] || ''; }
    },
    value: '',
    innerHTML: '',
    textContent: '',
    disabled: false,
    max: '0',
    scrollTop: 0,
    scrollLeft: 0,
    clientWidth: 0,
    clientHeight: 400,
    offsetWidth: 0,
    offsetHeight: 0,
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
    getBoundingClientRect() {
      return { left: 0, top: 0, width: this.clientWidth || 0, height: this.clientHeight || 0 };
    },
    /* devolve um filho simulado por seletor — o suficiente para o canvas
     * (viewport/stage) e para os guards de scrollIntoView do app */
    querySelector(sel) {
      if (!this._q) this._q = Object.create(null);
      if (!this._q[sel]) {
        const child = makeEl('__q' + sel);
        if (sel.indexOf('viewport') >= 0) { child.clientWidth = 800; child.clientHeight = 420; }
        if (sel.indexOf('stage') >= 0) { child.offsetWidth = 600; child.offsetHeight = 300; }
        this._q[sel] = child;
      }
      return this._q[sel];
    },
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

function snapshotExample(exId) {
  $('exampleSelect').value = exId;
  fire('exampleSelect', 'change');
  const total = parseInt($('slider').max, 10);
  assert(total > 0, 'exemplo ' + exId + ' gerou passos');
  const snaps = [];
  for (let i = 0; i <= total; i++) {
    if (i > 0) fire('btnNext', 'click');
    snaps.push($('structure').innerHTML);
  }
  assert(parseInt($('slider').value, 10) === total, 'navegou até o último passo');
  assert($('btnNext').disabled === true, 'botão próximo desabilitado no fim');
  assert($('vars').innerHTML.length > 10, 'painel de variáveis preenchido');
  assert($('callstack').innerHTML.length > 5, 'painel de chamadas preenchido');
  return snaps;
}

function percorrerExemplo(exId) {
  return snapshotExample(exId).join('\n');
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

test('fila: FRONT/REAR e shift', () => {
  const all = percorrerExemplo('fila-array');
  assert(all.indexOf('ptr-front') >= 0, 'indicador FRONT');
  assert(all.indexOf('ptr-rear') >= 0, 'indicador REAR');
  assert(all.indexOf('shift() → ') >= 0, 'badge shift');
  assert(all.indexOf('queue-cell') >= 0, 'células da fila');
});

test('fila: FRONT no primeiro nó e REAR no último (A, B e C)', () => {
  const snaps = snapshotExample('fila-array');
  const h = snaps.find((s) => s.indexOf('&quot;Ana&quot;') >= 0 && s.indexOf('&quot;Bruno&quot;') >= 0 && s.indexOf('&quot;Carla&quot;') >= 0);
  assert(h, 'passo com Ana, Bruno e Carla');
  const parts = h.split('queue-unit');
  assert(parts.length === 4, 'três nós na fila');
  assert(parts[1].indexOf('ptr-front') >= 0 && parts[1].indexOf('&quot;Ana&quot;') >= 0, 'FRONT aponta para Ana');
  assert(parts[3].indexOf('ptr-rear') >= 0 && parts[3].indexOf('&quot;Carla&quot;') >= 0, 'REAR aponta para Carla');
  assert(parts[2].indexOf('ptr-') < 0, 'Bruno (meio) sem indicador');
  assert(h.indexOf('[0]') >= 0 && h.indexOf('[2]') >= 0, 'índices discretos');
});

test('fila: um único elemento mostra FRONT e REAR no mesmo nó', () => {
  const snaps = snapshotExample('fila-array');
  const um = snaps.filter((s) => s.split('queue-cell').length - 1 === 1);
  assert(um.length >= 1, 'existe passo com um item');
  const parts = um[0].split('queue-unit');
  assert(parts.length === 2, 'um nó desenhado');
  assert(parts[1].indexOf('ptr-front') >= 0 && parts[1].indexOf('ptr-rear') >= 0, 'FRONT e REAR no mesmo nó');
});

test('fila vazia: mensagem discreta sem indicadores', () => {
  const snaps = snapshotExample('fila-array');
  const vazio = snaps[0];
  assert(vazio.indexOf('A fila está vazia neste passo.') >= 0, 'mensagem de fila vazia');
  assert(vazio.indexOf('ptr-front') < 0 && vazio.indexOf('ptr-rear') < 0, 'sem FRONT/REAR');
  assert(vazio.indexOf('queue-cell') < 0, 'sem nós');
});

test('fila: retroceder restaura exatamente o desenho do passo', () => {
  const snaps = snapshotExample('fila-array');
  const idx = snaps.findIndex((s) => s.indexOf('&quot;Ana&quot;') >= 0 && s.indexOf('&quot;Carla&quot;') >= 0);
  assert(idx > 0, 'passo com A, B e C existe');
  fire('btnLast', 'click');
  while (parseInt($('slider').value, 10) > idx) fire('btnPrev', 'click');
  assert($('structure').innerHTML === snaps[idx], 'mesmo desenho ao retroceder');
  assert($('stepLabel').textContent.indexOf('passo ' + (idx + 1) + '/') === 0, 'rótulo do passo coerente');
});

test('fila: comandos, variáveis e console acompanham o mesmo passo', () => {
  $('exampleSelect').value = 'fila-array';
  fire('exampleSelect', 'change');
  const total = parseInt($('slider').max, 10);
  let encontrado = false;
  for (let i = 0; i < total && !encontrado; i++) {
    fire('btnNext', 'click');
    if ($('structure').innerHTML.indexOf('shift() → ') < 0) continue;
    encontrado = true;
    const cur = $('commands').innerHTML;
    assert(cur.indexOf('command current') >= 0, 'comando do passo marcado como atual');
    assert(cur.indexOf('shift() → ') >= 0, 'comando atual é o shift');
    assert($('vars').innerHTML.indexOf('fila') >= 0, 'variáveis mostram a fila');
    const passo = parseInt($('slider').value, 10);
    assert($('stepLabel').textContent === 'passo ' + (passo + 1) + '/' + (total + 1), 'rótulo do passo');
    assert($('console').innerHTML.indexOf('Atendendo:') >= 0, 'console já mostra o atendimento do passo');
    const html = $('structure').innerHTML;
    assert(html.indexOf('cell-val">&quot;Ana&quot;') < 0, 'Ana já saiu das células do passo');
    const parts = html.split('queue-unit');
    assert(parts[1].indexOf('ptr-front') >= 0 && parts[1].indexOf('cell-val">&quot;Bruno&quot;') >= 0, 'FRONT passou para Bruno no mesmo passo');
  }
  assert(encontrado, 'encontrou um passo de shift');
});

test('fila com classe: detecta this.itens e mantém FRONT/REAR', () => {
  const all = percorrerExemplo('fila-classe');
  assert(all.indexOf('Fila') >= 0, 'título Fila');
  assert(all.indexOf('ptr-front') >= 0 && all.indexOf('ptr-rear') >= 0, 'indicadores FRONT/REAR');
  assert(all.indexOf('itens') >= 0, 'mostra os itens');
  assert(all.indexOf('push(') >= 0 && all.indexOf('shift() → ') >= 0, 'operações de enqueue/dequeue');
});

test('fila: zoom (botões e roda) e pan funcionam durante a visualização', () => {
  $('exampleSelect').value = 'fila-array';
  fire('exampleSelect', 'change');
  fire('btnNext', 'click');
  fire('btnNext', 'click');

  const zoom0 = $('btnZoomReset').textContent;
  fire('btnZoomIn', 'click');
  assert($('btnZoomReset').textContent !== zoom0, 'botão + altera o zoom');

  const vp = { closest: (s) => (s === '.canvas-viewport' ? vp : null) };
  const zoom1 = $('btnZoomReset').textContent;
  fire('structure', 'wheel', { deltaY: -120, clientX: 200, clientY: 150, target: vp, preventDefault() {} });
  assert($('btnZoomReset').textContent !== zoom1, 'roda do mouse altera o zoom');

  const x0 = $('structure').style['--canvas-x'];
  fire('structure', 'pointerdown', { button: 0, pointerId: 7, clientX: 100, clientY: 100, target: vp, preventDefault() {} });
  fire('structure', 'pointermove', { pointerId: 7, clientX: 140, clientY: 120 });
  fire('structure', 'pointerup', { pointerId: 7 });
  assert($('structure').style['--canvas-x'] !== x0, 'arrasto move o canvas sem tocar na fila');
});

test('fila extensa: linha única, navegável e com ajuste à tela', () => {
  $('code').value = 'const fila = [];\nfor (let i = 1; i <= 30; i++) {\n  fila.push(i);\n}';
  fire('btnRun', 'click');
  fire('btnLast', 'click');
  const html = $('structure').innerHTML;
  const celulas = html.split('queue-cell').length - 1;
  assert(celulas === 30, '30 nós na fila (obtido: ' + celulas + ')');
  assert(html.split('queue-row').length - 1 === 1, 'um único contêiner de linha');
  const stage = $('structure').querySelector('.canvas-stage');
  stage.offsetWidth = 30 * 88;
  stage.offsetHeight = 120;
  fire('btnZoomFit', 'click');
  const zoom = parseFloat($('structure').style['--canvas-zoom']);
  assert(zoom < 1 && zoom >= 0.25, 'ajuste reduz o zoom para caber (zoom: ' + zoom + ')');
});

test('lista encadeada: nós, chips e null', () => {
  const all = percorrerExemplo('lista-encadeada');
  assert(all.indexOf('Lista encadeada') >= 0, 'título');
  assert(all.indexOf('ptr-chip') >= 0, 'chip de ponteiro');
  assert(all.indexOf('list-null') >= 0, 'terminador null');
  assert(all.indexOf('Visitando o nó') < 0, 'saída de console não vaza para a estrutura');
});

test('árvore em-ordem: svg, destaque roxo e sem etiquetas', () => {
  const all = percorrerExemplo('arvore-em-ordem');
  assert(all.indexOf('tree-svg') >= 0, 'svg da árvore');
  assert(all.indexOf('tree-node') >= 0, 'nós desenhados');
  assert(/tree-node[^"]*visited/.test(all), 'nó visitado destacado em roxo');
  assert(all.indexOf('ptr-chip') < 0, 'sem etiquetas de texto nos nós da árvore');
  assert(all.indexOf('tree-visit-num') < 0, 'sem números decorativos');
  assert(all.indexOf('tree-null-stub') < 0, 'sem indicadores de filhos vazios');
});

test('busca em árvore: nó atual com realce principal e sem stubs', () => {
  const all = percorrerExemplo('arvore-busca');
  assert(/tree-node[^"]*active/.test(all), 'nó atual destacado');
  assert(all.indexOf('tree-null-stub') < 0, 'sem filhos vazios pontilhados');
  assert(all.indexOf('Encontrado: 40') >= 0 || all.indexOf('tree-svg') >= 0, 'renderizou');
});

test('árvore simples: svg, nós e destaques limpos', () => {
  const all = percorrerExemplo('arvore-simples');
  assert(all.indexOf('tree-svg') >= 0, 'svg da árvore');
  assert(all.indexOf('tree-node') >= 0, 'nós desenhados');
  assert(/tree-node[^"]*visited/.test(all), 'nó visitado destacado em roxo');
  assert(/tree-node[^"]*active/.test(all), 'nó da operação com realce principal');
  assert(all.indexOf('A árvore está vazia neste passo.') >= 0, 'mensagem discreta no começo');
  assert(all.indexOf('tree-visit-num') < 0, 'sem números decorativos');
  assert(all.indexOf('tree-null-stub') < 0, 'sem indicadores de filhos vazios');
  assert(all.indexOf('ptr-chip') < 0, 'sem etiquetas de texto (cursor/novo/raiz/…)');
  assert(all.indexOf('>esquerda<') < 0 && all.indexOf('>direita<') < 0, 'sem rótulos de direção');
});

test('árvore simples: remoção com promoção, descendentes e estado vazio no fim', () => {
  const all = percorrerExemplo('arvore-simples-remocao');
  assert(all.indexOf('tree-svg') >= 0, 'árvore desenhada em algum passo');
  assert(all.indexOf('A árvore está vazia neste passo.') >= 0, 'mensagem de vazio');
  assert(all.indexOf('tree-edge') >= 0, 'arestas entre pais e filhos');
});

test('árvore simples: retroceder restaura exatamente o desenho do passo', () => {
  const snaps = snapshotExample('arvore-simples-remocao');
  const idx = snaps.findIndex((s) => s.indexOf('tree-node') >= 0 && s.indexOf('&quot;A&quot;') >= 0 && s.indexOf('&quot;H&quot;') >= 0);
  assert(idx > 0, 'passo com A e H existe');
  fire('btnLast', 'click');
  while (parseInt($('slider').value, 10) > idx) fire('btnPrev', 'click');
  assert($('structure').innerHTML === snaps[idx], 'mesmo desenho ao retroceder');
  assert($('stepLabel').textContent.indexOf('passo ' + (idx + 1) + '/') === 0, 'rótulo do passo coerente');
  /* avança de novo: mesma sequência; volta outra vez: mesmo estado */
  fire('btnNext', 'click');
  assert($('structure').innerHTML === snaps[idx + 1], 'avançar reproduz o próximo estado idêntico');
  fire('btnPrev', 'click');
  assert($('structure').innerHTML === snaps[idx], 'voltar de novo restaura o mesmo estado');
});

test('árvore simples: variáveis e console acompanham a remoção', () => {
  $('exampleSelect').value = 'arvore-simples-remocao';
  fire('exampleSelect', 'change');
  const total = parseInt($('slider').max, 10);
  let encontrado = false;
  for (let i = 0; i < total && !encontrado; i++) {
    fire('btnNext', 'click');
    if ($('console').innerHTML.indexOf('Removi F') < 0) continue;
    encontrado = true;
    assert($('vars').innerHTML.indexOf('arvore') >= 0, 'painel de variáveis mostra a árvore');
    assert($('structure').innerHTML.indexOf('tree-node') >= 0, 'árvore desenhada no passo da remoção');
    assert($('stepLabel').textContent.indexOf('passo ') === 0, 'rótulo do passo');
  }
  assert(encontrado, 'encontrou o passo da remoção de F');
});

test('árvore simples: seletor lista a estrutura e mantém o enquadramento', () => {
  $('exampleSelect').value = 'arvore-simples';
  fire('exampleSelect', 'change');
  const options = $('structureSelect').innerHTML;
  assert(options.indexOf('Árvore') >= 0, 'drop-down lista a árvore');
  fire('btnNext', 'click');
  const zoom = $('structure').style['--canvas-zoom'];
  assert(zoom !== undefined, 'zoom aplicado pela câmera compartilhada');
  const x = $('structure').style['--canvas-x'];
  fire('btnNext', 'click');
  assert($('structure').style['--canvas-x'] !== undefined, 'câmera continua no lugar (x definido): ' + x);
  fire('btnZoomFit', 'click');
  const fit = parseFloat($('structure').style['--canvas-zoom']);
  assert(fit >= 0.25 && fit <= 1.5, 'ajuste à tela mantém o zoom no intervalo: ' + fit);
  const panned = $('structure').style['--canvas-x'];
  const vp = { closest: (s) => (s === '.canvas-viewport' ? vp : null) };
  fire('structure', 'pointerdown', { button: 0, pointerId: 9, clientX: 100, clientY: 100, target: vp, preventDefault() {} });
  fire('structure', 'pointermove', { pointerId: 9, clientX: 130, clientY: 110 });
  fire('structure', 'pointerup', { pointerId: 9 });
  assert($('structure').style['--canvas-x'] !== panned, 'arrasto movimenta o canvas da árvore');
});

test('árvore: enquadramento automático mantém a árvore visível', () => {
  $('exampleSelect').value = 'arvore-simples';
  fire('exampleSelect', 'change');
  const total = parseInt($('slider').max, 10);
  let achou = false;
  for (let i = 0; i < total && !achou; i++) {
    fire('btnNext', 'click');
    if ($('structure').innerHTML.indexOf('tree-node') >= 0) achou = true;
  }
  assert(achou, 'chegou a um passo com árvore');
  const stage = $('structure').querySelector('.canvas-stage');
  stage.offsetWidth = 1400;
  stage.offsetHeight = 700;
  fire('btnNext', 'click');
  const zoom = parseFloat($('structure').style['--canvas-zoom']);
  assert(zoom < 1, 'zoom reduziu para manter a árvore visível (zoom: ' + zoom + ')');
  const x = parseFloat($('structure').style['--canvas-x']);
  assert(!isNaN(x), 'árvore centralizada (x definido)');
});

test('regressão: pilha e fila seguem funcionando depois dos exemplos de árvore', () => {
  percorrerExemplo('arvore-simples');
  const pilha = percorrerExemplo('pilha-array');
  assert(pilha.indexOf('stack-cell') >= 0 || pilha.indexOf('A pilha está vazia neste passo.') >= 0, 'pilha desenha');
  const fila = percorrerExemplo('fila-array');
  assert(fila.indexOf('ptr-front') >= 0 && fila.indexOf('ptr-rear') >= 0, 'fila com FRONT e REAR');
  assert(fila.indexOf('shift() → ') >= 0, 'eventos da fila continuam');
});

test('explicação do passo: operação e frase acompanham a execução da árvore', () => {
  $('exampleSelect').value = 'arvore-simples';
  fire('exampleSelect', 'change');
  assert(!$('stepExplainer').classList.contains('hidden'), 'faixa visível com execução');
  const total = parseInt($('slider').max, 10);
  let viuInsercao = false;
  let viuPercurso = false;
  let viuBusca = false;
  for (let i = 0; i <= total; i++) {
    if (i > 0) fire('btnNext', 'click');
    const op = $('stepOp').textContent;
    const txt = $('stepText').textContent;
    if (op === 'Inserção' && txt.indexOf('primeira posição disponível') >= 0) viuInsercao = true;
    if (op === 'Percurso em ordem' && txt.indexOf('Visitando o nó') >= 0) viuPercurso = true;
    if (op === 'Busca' && txt.indexOf('Comparando o nó') >= 0) viuBusca = true;
  }
  assert(viuInsercao, 'frase da vaga de inserção');
  assert(viuPercurso, 'frase de visita no percurso');
  assert(viuBusca, 'frase de comparação na busca');
  assert($('stepCount').textContent === (total + 1) + '/' + (total + 1), 'contador de passos na faixa');
});

test('explicação do passo: remoção com promoção', () => {
  $('exampleSelect').value = 'arvore-simples-remocao';
  fire('exampleSelect', 'change');
  const total = parseInt($('slider').max, 10);
  let texto = '';
  let op = '';
  for (let i = 0; i <= total && !texto; i++) {
    if (i > 0) fire('btnNext', 'click');
    if ($('stepText').textContent.indexOf('removido da árvore') >= 0) {
      texto = $('stepText').textContent;
      op = $('stepOp').textContent;
    }
  }
  assert(texto, 'frase de remoção encontrada');
  assert(op === 'Remoção', 'operação é Remoção: ' + op);
});

test('painéis: abas alternam comandos, variáveis, chamadas e saída', () => {
  fire('tabConsole', 'click');
  assert($('pageConsole').classList.contains('active'), 'saída ativa');
  assert(!$('pageVars').classList.contains('active'), 'variáveis inativa');
  assert($('console').innerHTML.length > 0, 'conteúdo do console mantido');
  fire('tabCallstack', 'click');
  assert($('pageCallstack').classList.contains('active'), 'chamadas ativa');
  assert(!$('pageConsole').classList.contains('active'), 'saída inativa');
  fire('tabVars', 'click');
  assert($('pageVars').classList.contains('active'), 'variáveis ativa');
});

test('painéis: recolher e expandir editor e painel lateral', () => {
  $('layout').clientWidth = 1400;
  $('codePanel').clientWidth = 420;
  $('vizPanel').clientWidth = 700;
  $('sidePanel').clientWidth = 274;
  fire('btnToggleCode', 'click');
  assert($('codePanel').classList.contains('collapsed'), 'editor recolhido');
  assert($('btnToggleCode').classList.contains('active'), 'botão Código marcado');
  assert($('layout').style.gridTemplateColumns.indexOf('0px 0px') === 0, 'colunas do editor zeradas: ' + $('layout').style.gridTemplateColumns);
  fire('btnToggleSide', 'click');
  assert($('sidePanel').classList.contains('collapsed'), 'painel lateral recolhido');
  assert($('structure').innerHTML.length > 0, 'canvas continua renderizando');
  const cols = $('layout').style.gridTemplateColumns;
  assert(cols === '0px 0px minmax(0,1fr) 0px 0px' || cols.indexOf('0px 0px minmax(0,') === 0, 'visualização ocupa todo o espaço: ' + cols);
  fire('btnToggleCode', 'click');
  assert(!$('codePanel').classList.contains('collapsed'), 'editor reexpandido');
  assert(!$('btnToggleCode').classList.contains('active'), 'botão Código desmarcado');
  assert($('layout').style.gridTemplateColumns.indexOf('minmax(280px,') === 0, 'coluna do editor restaurada: ' + $('layout').style.gridTemplateColumns);
  fire('btnToggleSide', 'click');
  assert(!$('sidePanel').classList.contains('collapsed'), 'painel lateral reexpandido');
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
