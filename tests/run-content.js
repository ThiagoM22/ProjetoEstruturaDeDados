/* ED Viz — testes de conteúdo e navegação (sem navegador).
 *
 * Verifica o que o HTML sozinho não garante:
 * - todo exemplo tem uma estrutura e toda estrutura tem página e exemplos;
 * - todo link interno aponta para um arquivo que existe (também no preview e no deploy);
 * - todo `?exemplo=` existe e todo `?passo=` cabe no trace real do exemplo;
 * - as páginas do guia seguem o template e não têm texto corrompido.
 *
 * Rode com: node tests/run-content.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
['js/util.js', 'js/tokenizer.js', 'js/parser.js', 'js/interpreter.js', 'js/examples.js'].forEach((f) => {
  const full = path.join(root, f);
  vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
});
const DSV = globalThis.DSV;

const PAGINAS = {
  array: 'guia/array.html',
  pilha: 'guia/pilha.html',
  fila: 'guia/fila.html',
  lista: 'guia/lista-encadeada.html',
  arvore: 'guia/arvore-binaria.html'
};

const SECOES = ['o-que-e', 'como-funciona', 'custo', 'quando-usar', 'erros-comuns', 'veja-em-acao', 'referencias'];

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'condição falsa');
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function paginas() {
  const guia = fs.readdirSync(path.join(root, 'guia'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => 'guia/' + f);
  return ['index.html', 'visualizador.html'].concat(guia);
}

const traces = Object.create(null);
function traceDoExemplo(ex) {
  if (!traces[ex.id]) traces[ex.id] = DSV.interpret(ex.code);
  return traces[ex.id];
}

console.log('\n[exemplos x guia]');

test('todo exemplo declara uma estrutura conhecida', () => {
  assert(DSV.EXAMPLES.length === 16, 'esperava 16 exemplos, achei ' + DSV.EXAMPLES.length);
  DSV.EXAMPLES.forEach((ex) => {
    assert(ex.estrutura, 'exemplo sem estrutura: ' + ex.id);
    assert(PAGINAS[ex.estrutura], 'estrutura sem página: ' + ex.estrutura + ' (' + ex.id + ')');
  });
});

test('toda estrutura tem página e pelo menos um exemplo', () => {
  Object.keys(PAGINAS).forEach((id) => {
    assert(fs.existsSync(path.join(root, PAGINAS[id])), 'página ausente: ' + PAGINAS[id]);
    const exemplos = DSV.EXAMPLES.filter((ex) => ex.estrutura === id);
    assert(exemplos.length > 0, 'estrutura sem exemplo: ' + id);
  });
});

test('todo exemplo executa sem erro (os links do guia dependem disso)', () => {
  DSV.EXAMPLES.forEach((ex) => {
    const trace = traceDoExemplo(ex);
    assert(!trace.error, ex.id + ': linha ' + (trace.error && trace.error.line) + ' — ' + (trace.error && trace.error.message));
    assert(trace.steps.length > 0, ex.id + ': trace vazio');
  });
});

console.log('\n[html: cabeçalho, links e template]');

const arquivos = paginas();

test('todas as páginas têm cabeçalho e metadados', () => {
  arquivos.forEach((rel) => {
    const html = read(rel);
    assert(/<html[^>]*\blang="pt-BR"/.test(html), rel + ': lang pt-BR');
    assert(/<title>[^<]+<\/title>/.test(html), rel + ': title');
    assert(/<meta[^>]+name="description"[^>]+content="[^"]+"/.test(html), rel + ': meta description');
    assert(/<meta[^>]+charset="UTF-8"/i.test(html), rel + ': charset');
    assert(/<meta[^>]+name="viewport"/.test(html), rel + ': viewport');
    assert(html.indexOf('\uFFFD') < 0, rel + ': contém caractere de substituição (U+FFFD)');
    assert((html.match(/<h1[\s>]/g) || []).length === 1, rel + ': deve ter exatamente um h1');
  });
});

test('todo link interno aponta para um arquivo existente', () => {
  const problemas = [];
  arquivos.forEach((rel) => {
    const html = read(rel);
    const base = path.dirname(path.join(root, rel));
    const rx = /<(?:a|link)\b[^>]*\bhref="([^"]+)"/gi;
    let m;
    while ((m = rx.exec(html))) {
      const href = m[1].replace(/&amp;/g, '&');
      if (/^(https?:|mailto:|data:|#)/i.test(href)) continue;
      const alvo = href.split('#')[0].split('?')[0];
      if (!alvo) continue;
      if (alvo.charAt(0) === '/') {
        problemas.push(rel + ' -> ' + href + ' (caminho absoluto quebra em subpasta/estático)');
        continue;
      }
      const full = path.resolve(base, alvo);
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        problemas.push(rel + ' -> ' + href + ' (não existe)');
      }
    }
  });
  assert(problemas.length === 0, problemas.join('; '));
});

test('toda imagem e script interno existe', () => {
  const problemas = [];
  arquivos.forEach((rel) => {
    const html = read(rel);
    const base = path.dirname(path.join(root, rel));
    const rx = /<(?:img|script)\b[^>]*\bsrc="([^"]+)"/gi;
    let m;
    while ((m = rx.exec(html))) {
      const src = m[1];
      if (/^(https?:|data:)/i.test(src)) continue;
      const full = path.resolve(base, src);
      if (!fs.existsSync(full)) problemas.push(rel + ' -> ' + src + ' (não existe)');
    }
  });
  assert(problemas.length === 0, problemas.join('; '));
});

test('todo link ?exemplo= existe e todo ?passo= cabe no trace', () => {
  const problemas = [];
  arquivos.forEach((rel) => {
    const html = read(rel);
    const base = 'http://local/' + rel.replace(/\\/g, '/');
    const rx = /<(?:a|link)\b[^>]*\bhref="([^"]+)"/gi;
    let m;
    while ((m = rx.exec(html))) {
      const href = m[1].replace(/&amp;/g, '&');
      if (href.indexOf('visualizador.html') < 0 || href.indexOf('?') < 0) continue;
      const url = new URL(href, base);
      const id = url.searchParams.get('exemplo');
      if (!id) continue;
      const ex = DSV.EXAMPLES.filter((e) => e.id === id)[0];
      if (!ex) {
        problemas.push(rel + ' -> exemplo inexistente: ' + id);
        continue;
      }
      const passo = parseInt(url.searchParams.get('passo'), 10);
      if (!url.searchParams.get('passo')) continue;
      const trace = traceDoExemplo(ex);
      if (!isFinite(passo) || passo < 1 || passo > trace.steps.length) {
        problemas.push(rel + ' -> ' + id + ': passo ' + passo + ' fora de 1..' + trace.steps.length);
      }
    }
  });
  assert(problemas.length === 0, problemas.join('; '));
});

test('as páginas do guia seguem o template', () => {
  Object.keys(PAGINAS).forEach((id) => {
    const html = read(PAGINAS[id]);
    SECOES.forEach((sec) => {
      assert(html.indexOf('id="' + sec + '"') >= 0, PAGINAS[id] + ': falta a seção ' + sec);
    });
    assert(html.indexOf('class="pager"') >= 0, PAGINAS[id] + ': falta a navegação anterior/próxima');
    assert(html.indexOf('class="guide-aside"') >= 0, PAGINAS[id] + ': falta o índice da página');
  });
});

test('todo snippet marcado como executável roda no interpretador', () => {
  const problemas = [];
  arquivos.forEach((rel) => {
    const html = read(rel);
    const rx = /<pre[^>]*><code[^>]*data-executavel[^>]*>([\s\S]*?)<\/code><\/pre>/gi;
    let m;
    while ((m = rx.exec(html))) {
      const code = m[1]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
      const trace = DSV.interpret(code);
      if (trace.error) {
        problemas.push(rel + ': linha ' + trace.error.line + ' — ' + trace.error.message);
      }
    }
  });
  assert(problemas.length === 0, problemas.join('; '));
});

console.log('\n========================================');
console.log('Testes de conteúdo: ' + passed + ' passaram, ' + failed + ' falharam.');
process.exit(failed ? 1 : 0);
