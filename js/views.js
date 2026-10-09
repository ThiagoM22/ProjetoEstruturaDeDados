/* ED Viz — detecção de estruturas e renderização gráfica. */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});
  var esc = DSV.escapeHtml;

  /* ------------------------------------------------------------------ */
  /* Nomes aceitos (português e inglês)                                  */
  /* ------------------------------------------------------------------ */

  var TREE_LEFT = ['esquerda', 'left', 'esq'];
  var TREE_RIGHT = ['direita', 'right', 'dir'];
  var LIST_NEXT = ['proximo', 'próximo', 'next', 'prox', 'seguinte'];
  var NODE_VALUE = ['valor', 'value', 'dado', 'data', 'chave', 'key', 'elemento', 'item', 'nome'];
  var ITEM_KEYS = ['itens', 'items', 'elementos', 'dados', 'valores', 'array', 'lista', 'fila', 'pilha'];
  var ROOT_KEYS = ['raiz', 'root'];
  var HEAD_KEYS = ['inicio', 'início', 'head', 'primeiro', 'cabeca', 'cabeça'];

  var STACK_RX = /pilha|stack/i;
  var QUEUE_RX = /fila|queue/i;
  var LIST_RX = /lista|linked|encadeada/i;
  var TREE_RX = /arvore|árvore|tree|bst/i;
  var ROOT_RX = /^(raiz|root)$/i;
  var NODE_RX = /^(no|nó|node|atual|current)$/i;

  var TYPE_RANK = { tree: 0, list: 1, stack: 2, queue: 3, array: 4 };

  /* ------------------------------------------------------------------ */
  /* Utilidades sobre valores serializados                               */
  /* ------------------------------------------------------------------ */

  function isObj(sv) { return sv && sv.t === 'o'; }
  function isArr(sv) { return sv && sv.t === 'a'; }
  function isNullSer(sv) { return sv && sv.t === 'p' && (sv.v === null || sv.v === undefined); }  function propOf(sv, names) {
    if (!isObj(sv) || !sv.props) return null;
    for (var i = 0; i < names.length; i++) {
      if (Object.prototype.hasOwnProperty.call(sv.props, names[i])) {
        return { name: names[i], value: sv.props[names[i]] };
      }
    }
    return null;
  }

  function isTreeNode(sv) {
    return isObj(sv) && (propOf(sv, TREE_LEFT) || propOf(sv, TREE_RIGHT));
  }

  function isListNode(sv) {
    return isObj(sv) && propOf(sv, LIST_NEXT);
  }

  function nodeChild(sv, side) {
    var p = propOf(sv, side === 'L' ? TREE_LEFT : TREE_RIGHT);
    if (!p) return null;
    return isObj(p.value) ? p.value : null;
  }

  function nodeValue(sv) {
    var p = propOf(sv, NODE_VALUE);
    if (p) return DSV.fmtSerializedShort(p.value);
    if (!isObj(sv)) return DSV.fmtSerializedShort(sv);
    var keys = Object.keys(sv.props || {});
    for (var i = 0; i < keys.length; i++) {
      if (sv.props[keys[i]].t === 'p') return DSV.fmtSerializedShort(sv.props[keys[i]]);
    }
    return '?';
  }

  function arrayProp(sv) {
    if (!isObj(sv) || !sv.props) return null;
    var keys = Object.keys(sv.props);
    for (var i = 0; i < ITEM_KEYS.length; i++) {
      var k = ITEM_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(sv.props, k) && isArr(sv.props[k])) {
        return { name: k, value: sv.props[k] };
      }
    }
    for (var j = 0; j < keys.length; j++) {
      if (isArr(sv.props[keys[j]])) return { name: keys[j], value: sv.props[keys[j]] };
    }
    return null;
  }

  function childNodeProp(sv, keys) {
    for (var i = 0; i < keys.length; i++) {
      var p = propOf(sv, [keys[i]]);
      if (p && (isTreeNode(p.value) || isListNode(p.value))) {
        return { name: p.name, value: p.value };
      }
      if (p && isObj(p.value) && Object.keys(p.value.props || {}).length === 0) {
        return { name: p.name, value: null };
      }
    }
    return null;
  }

  function countTree(sv) {
    var seen = {};
    function walk(n) {
      if (!isObj(n) || seen[n.id]) return 0;
      seen[n.id] = true;
      return 1 + walk(nodeChild(n, 'L')) + walk(nodeChild(n, 'R'));
    }
    return walk(sv);
  }

  function countList(sv) {
    var seen = {};
    var n = sv;
    var c = 0;
    while (isObj(n) && !seen[n.id] && c < 500) {
      seen[n.id] = true;
      c++;
      var p = propOf(n, LIST_NEXT);
      n = p && isObj(p.value) ? p.value : null;
    }
    return c;
  }

  function shortName(label) {
    var s = String(label);
    var idx = Math.max(s.lastIndexOf('.'), s.replace(/[^.\[]/g, '').length ? s.lastIndexOf('[') : -1);
    if (idx >= 0) s = s.slice(idx + 1);
    return s.replace(/[\[\]]/g, '');
  }

  /* O nó-raiz dentro de um wrapper ("arvore.raiz") representa a mesma árvore
   * do wrapper: normaliza o rótulo para o nome do wrapper, para a identidade
   * (cena, câmera e seletor) ficar estável entre passos e operações. */
  function treeOwnerLabel(label) {
    var t = String(label).replace(/\.(raiz|root)$/i, '');
    return t || String(label);
  }

  /* chips de ponteiro: sem duplicatas, prioriza nomes significativos.
   * Retorna {key, text}: key = caminho completo (estável entre passos),
   * text = nome curto exibido. */
  var CHILD_ALIAS_RX = /^(esquerda|direita|left|right|esq|dir|proximo|próximo|next|prox|seguinte)$/i;
  /* variáveis de trabalho do algoritmo (cursor/índice da BFS) não viram
   * etiqueta: o nó continua marcado pelo realce roxo, sem texto */
  var HIDDEN_CHIP_RX = /^(cursor|cur)$/i;

  function chipDefs(labels) {
    var seen = Object.create(null);
    var uniq = [];
    (labels || []).forEach(function (label) {
      var s = shortName(label);
      if (seen[s]) return;
      seen[s] = true;
      uniq.push({ key: String(label), text: s });
    });
    /* "esquerda"/"direita"/"proximo" são caminhos de navegação, não estado:
     * nunca viram etiqueta permanente no canvas; índices de fila ("0") também não */
    return uniq.filter(function (c) {
      return !CHILD_ALIAS_RX.test(c.text) && !/^\d+$/.test(c.text) && !HIDDEN_CHIP_RX.test(c.text);
    }).slice(0, 2);
  }

  function chipsFor(labels) {
    return chipDefs(labels).map(function (c) { return c.text; });
  }

  /* nó em destaque principal do passo: um único nó — o ponteiro da operação
   * (atual/no/cursor…) tem prioridade sobre o alvo (alvo/removido) */
  var ACTIVE_POINTER_RX = /^(atual|current|no|nó|node|cur|aux|cursor)$/i;
  var TARGET_POINTER_RX = /^(alvo|target|removido)$/i;

  function activeNodeId(pointers) {
    var best = null;
    var bestRank = 0;
    Object.keys(pointers || {}).forEach(function (id) {
      var labels = pointers[id] || [];
      for (var i = 0; i < labels.length; i++) {
        var s = shortName(labels[i]);
        var rank = ACTIVE_POINTER_RX.test(s) ? 2 : TARGET_POINTER_RX.test(s) ? 1 : 0;
        if (rank > bestRank) { bestRank = rank; best = Number(id); }
      }
    });
    return bestRank > 0 ? best : null;
  }

  /* marcas de visita visíveis no passo (época atual) */
  function visitedMapFor(ctx, step) {
    if (ctx && ctx.visit && ctx.visit.epochOf && step) return DSV.visitAt(ctx.visit, step);
    return (ctx && ctx.visit && ctx.visit.map) || {};
  }

  /* Identidade visual dos itens para animar (valores deslizam entre posições). */
  function itemKeys(items) {
    var counts = Object.create(null);
    return (items || []).map(function (sv) {
      var base;
      if (sv && sv.t === 'p') base = typeof sv.v + ':' + String(sv.v);
      else if (sv && (sv.t === 'a' || sv.t === 'o')) base = sv.t + ':' + sv.id;
      else if (sv && sv.t === 'fn') base = 'fn:' + sv.name;
      else base = 'x';
      counts[base] = (counts[base] || 0) + 1;
      return base + '#' + counts[base];
    });
  }

  function animDur(ctx) {
    if (DSV.anim && DSV.anim.reducedMotion) return 0;
    if (ctx && ctx.animMs) return ctx.animMs;
    return (DSV.anim && DSV.anim.defaultDur) || 280;
  }

  /* ------------------------------------------------------------------ */
  /* Mapa de operações (push/pop/...) por id                             */
  /* ------------------------------------------------------------------ */

  DSV.buildOpsMap = function (steps) {
    var map = {};
    steps.forEach(function (s) {
      (s.events || []).forEach(function (e) {
        if (e.targetId == null) return;
        if (!map[e.targetId]) map[e.targetId] = { push: 0, pop: 0, shift: 0, unshift: 0, splice: 0 };
        var o = map[e.targetId];
        if (o[e.type] !== undefined) o[e.type]++;
      });
    });
    return map;
  };

  /* ------------------------------------------------------------------ */
  /* Detecção de candidatos a estrutura                                  */
  /* ------------------------------------------------------------------ */

  DSV.detectStructures = function (step, opsMap) {
    var found = Object.create(null);

    function push(cand) {
      if (cand.id == null && cand.type !== 'list' && cand.type !== 'tree') return;
      var key = cand.type + '|' + cand.id;
      var prev = found[key];
      if (!prev || cand.score > prev.score) found[key] = cand;
    }

    function considerArray(v, label) {
      var ops = opsMap[v.id] || {};
      var stackScore = 0;
      var queueScore = 0;
      if (STACK_RX.test(label)) stackScore += 6;
      if (QUEUE_RX.test(label)) queueScore += 6;
      if (ops.pop) stackScore += 3;
      if (ops.shift) queueScore += 3;
      if (ops.unshift) queueScore += 1.5;
      if (ops.push) { stackScore += 0.5; queueScore += 0.5; }

      if (stackScore > 2 && stackScore >= queueScore) {
        push({ type: 'stack', id: v.id, label: label, score: stackScore + 2 });
      } else if (queueScore > 2 && queueScore > stackScore) {
        push({ type: 'queue', id: v.id, label: label, score: queueScore + 2 });
      } else {
        push({ type: 'array', id: v.id, label: label, score: 2 + Math.min((ops.push || 0) + (ops.pop || 0) + (ops.shift || 0) + (ops.unshift || 0), 3) * 0.5 });
      }
    }

    function considerObject(v, label) {
      var ctor = v.ctor || '';
      var nameLike = label + ' ' + ctor;
      var isStack = STACK_RX.test(nameLike);
      var isQueue = QUEUE_RX.test(nameLike);
      var isList = LIST_RX.test(nameLike);
      var isTree = TREE_RX.test(nameLike);
      var shownLabel = (label === 'this' && ctor && ctor !== 'Object') ? ctor : label;

      /* nós de árvore/lista primeiro (o objeto É a estrutura) */
      if (isTreeNode(v)) {
        var size = countTree(v);
        push({
          type: 'tree',
          id: v.id,
          label: treeOwnerLabel(shownLabel),
          score: 4 + (ROOT_RX.test(shortName(label)) ? 4 : NODE_RX.test(shortName(label)) ? 1 : 0) + Math.min(size, 12) * 0.35
        });
        return;
      }

      if (isListNode(v)) {
        var lsize = countList(v);
        push({
          type: 'list',
          id: v.id,
          label: shownLabel,
          score: 3.5 + (ROOT_RX.test(shortName(label)) || /^(inicio|início|head|primeiro)$/.test(shortName(label)) ? 3 : 0) + Math.min(lsize, 10) * 0.3
        });
        return;
      }

      /* wrappers: ArvoreBinaria { raiz }, ListaEncadeada { inicio }, Pilha/Fila { itens } */
      if (isTree) {
        var rootP = propOf(v, ROOT_KEYS);
        if (rootP) {
          if (isTreeNode(rootP.value)) {
            push({ type: 'tree', id: rootP.value.id, label: shownLabel, score: 9 + Math.min(countTree(rootP.value), 12) * 0.15 });
          } else if (isNullSer(rootP.value)) {
            push({ type: 'tree', id: null, holderId: v.id, label: shownLabel, score: 6 });
          }
        }
        return;
      }

      if (isList) {
        var headP = propOf(v, HEAD_KEYS);
        if (headP) {
          if (isListNode(headP.value)) {
            push({ type: 'list', id: headP.value.id, label: shownLabel, score: 9 + Math.min(countList(headP.value), 8) * 0.1 });
          } else if (isNullSer(headP.value)) {
            push({ type: 'list', id: null, holderId: v.id, label: shownLabel, score: 6 });
          }
        }
        return;
      }

      if (isStack || isQueue) {
        var items = arrayProp(v);
        if (items) {
          var ops = opsMap[items.value.id] || {};
          if (isStack && !isQueue) {
            push({ type: 'stack', id: items.value.id, label: shownLabel, score: 9 + (ops.pop ? 1 : 0) });
          } else if (isQueue && !isStack) {
            push({ type: 'queue', id: items.value.id, label: shownLabel, score: 9 + (ops.shift ? 1 : 0) });
          } else if (ops.pop && !ops.shift) {
            push({ type: 'stack', id: items.value.id, label: shownLabel, score: 9 });
          } else {
            push({ type: 'queue', id: items.value.id, label: shownLabel, score: 9 });
          }
          return;
        }
      }

      /* objeto genérico: arrays e nós em propriedades viram candidatos */
      var ap = arrayProp(v);
      if (ap) considerArray(ap.value, shownLabel + '.' + ap.name);
    }

    function walk(v, label, depth) {
      if (!v || typeof v !== 'object' || depth > 3) return;
      if (isArr(v)) {
        considerArray(v, label);
        return;
      }
      if (v.t === 'fn' || v.t === 'c') return;
      if (isObj(v)) {
        considerObject(v, label);
        if (isTreeNode(v) || isListNode(v)) return; /* não desce nos filhos da estrutura */
        var keys = Object.keys(v.props || {});
        for (var i = 0; i < Math.min(keys.length, 20); i++) {
          walk(v.props[keys[i]], label + '.' + keys[i], depth + 1);
        }
      }
    }

    ['globals', 'locals'].forEach(function (scope) {
      var map = step[scope] || {};
      Object.keys(map).forEach(function (name) { walk(map[name], name, 0); });
    });
    if (step.thisVal) walk(step.thisVal, 'this', 0);

    var list = Object.keys(found).map(function (k) { return found[k]; });
    list.sort(function (a, b) {
      return (b.score - a.score) || (TYPE_RANK[a.type] - TYPE_RANK[b.type]);
    });
    return list;
  };

  /* procura um valor serializado pelo id em qualquer escopo do passo */
  DSV.findValueById = function (step, id) {
    var found = null;
    var budget = 30000;

    function visit(sv) {
      if (found || budget <= 0 || !sv || typeof sv !== 'object') return;
      budget--;
      if ((sv.t === 'a' || sv.t === 'o') && sv.id === id) { found = sv; return; }
      if (sv.t === 'a') {
        for (var i = 0; i < sv.items.length && !found; i++) visit(sv.items[i]);
      } else if (sv.t === 'o') {
        var keys = Object.keys(sv.props || {});
        for (var j = 0; j < keys.length && !found; j++) visit(sv.props[keys[j]]);
      }
    }

    ['globals', 'locals'].forEach(function (scope) {
      var map = step[scope] || {};
      Object.keys(map).forEach(function (name) { visit(map[name]); });
    });
    if (step.thisVal) visit(step.thisVal);
    return found;
  };

  /* ordem de visita dos nós (primeira vez que um ponteiro "atual/no/..." aponta para o nó) */
  DSV.computeVisitOrder = function (steps) {
    var currentRx = /^(atual|current|no|nó|node|cur|aux)$/i;
    var hasCurrentLike = false;

    steps.forEach(function (s) {
      Object.keys(s.pointers || {}).forEach(function (id) {
        s.pointers[id].forEach(function (lbl) {
          if (currentRx.test(shortName(lbl))) hasCurrentLike = true;
        });
      });
    });

    var order = [];
    var map = {};
    var epochOf = {};
    var seenInEpoch = Object.create(null);
    var epoch = 0;
    var lastOp = null;
    var inOp = false;

    steps.forEach(function (s) {
      /* cada execução de uma operação (percurso/busca/inserção/remoção) é uma
       * "época": as marcas de visita recomeçam nela e não iluminam a árvore
       * inteira em passos sem relação */
      var op = opFrameName(s.stack);
      if (op) {
        if (!inOp || op !== lastOp) epoch++;
        lastOp = op;
        inOp = true;
      } else {
        inOp = false;
        lastOp = null;
      }
      epochOf[s.i] = epoch;

      Object.keys(s.pointers || {}).forEach(function (id) {
        var labels = s.pointers[id];
        var relevant = hasCurrentLike
          ? labels.filter(function (l) { return currentRx.test(shortName(l)); })
          : labels;
        if (!relevant.length) return;
        var epochKey = epoch + ':' + id;
        if (seenInEpoch[epochKey]) return;
        seenInEpoch[epochKey] = true;
        if (map[id] == null) map[id] = order.length + 1;
        order.push({ id: Number(id), num: map[id], step: s.i, epoch: epoch });
      });
    });
    return { order: order, map: map, epochOf: epochOf, hasCurrentLike: hasCurrentLike };
  };

  /* marcas de visita visíveis no passo: apenas as da mesma operação (época)
   * e que já aconteceram */
  DSV.visitAt = function (visit, step) {
    var out = Object.create(null);
    if (!visit || !visit.order || !step) return out;
    var epoch = visit.epochOf ? visit.epochOf[step.i] : null;
    if (epoch == null) return out;
    for (var i = 0; i < visit.order.length; i++) {
      var o = visit.order[i];
      if (o.epoch === epoch && o.step <= step.i) out[o.id] = true;
    }
    return out;
  };

  /* nome do método de operação mais externo na pilha de chamadas */
  function opFrameName(stack) {
    var list = stack || [];
    for (var i = 0; i < list.length; i++) {
      var n = String(list[i].name || '');
      if (OP_NAMES[n]) return n;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Explicação contextual do passo                                      */
  /* ------------------------------------------------------------------ */

  var OP_NAMES = {
    inserir: 'Inserção',
    inserirNo: 'Inserção',
    remover: 'Remoção',
    buscar: 'Busca',
    preOrdem: 'Percurso pré-ordem',
    emOrdem: 'Percurso em ordem',
    posOrdem: 'Percurso pós-ordem',
    limpar: 'Limpeza',
    estaVazia: 'Verificação',
    empilhar: 'Empilhamento',
    desempilhar: 'Desempilhamento',
    enfileirar: 'Enfileiramento',
    desenfileirar: 'Desenfileiramento'
  };

  /* nome da operação: pela chamada em execução (pilha de chamadas, do
   * escopo mais externo para o mais interno) e, sem chamada, pela linha */
  function opNameFrom(step, lineText) {
    var stack = (step && step.stack) || [];
    for (var i = 0; i < stack.length; i++) {
      var n = String(stack[i].name || '');
      if (OP_NAMES[n]) return OP_NAMES[n];
    }
    var line = lineText || '';
    if (/\.inserir(No)?\s*\(/.test(line)) return 'Inserção';
    if (/\.remover\s*\(/.test(line)) return 'Remoção';
    if (/\.buscar\s*\(/.test(line)) return 'Busca';
    if (/preOrdem\s*\(/.test(line)) return 'Percurso pré-ordem';
    if (/emOrdem\s*\(/.test(line)) return 'Percurso em ordem';
    if (/posOrdem\s*\(/.test(line)) return 'Percurso pós-ordem';
    if (/\.limpar\s*\(/.test(line)) return 'Limpeza';
    if (/\.estaVazia\s*\(/.test(line)) return 'Verificação';
    if (/console\.log/.test(line)) return 'Saída';
    return 'Execução';
  }

  function sideName(side) {
    return side === 'L' ? 'esquerdo' : 'direito';
  }

  function fmtEventValue(v) {
    return typeof v === 'string' ? v : DSV.fmtPrimitive(v);
  }

  /* frase curta para estruturas não-árvore: reage à operação do passo */
  function genericExplanation(step) {
    var ev = (step.events || [])[0];
    if (!ev) return null;
    if (ev.type === 'push') return (ev.values || []).map(fmtEventValue).join(', ') + ' entrou.';
    if (ev.type === 'pop') return fmtEventValue(ev.value) + ' saiu.';
    if (ev.type === 'shift') return fmtEventValue(ev.value) + ' saiu da frente.';
    if (ev.type === 'unshift') return (ev.values || []).map(fmtEventValue).join(', ') + ' entrou na frente.';
    if (ev.type === 'splice') return 'Um trecho da estrutura foi alterado.';
    return null;
  }

  /* frase para a árvore: compara o passo com o anterior e o próximo —
   * inserção, remoção, promoção, vaga da inserção, nó visitado */
  function treeExplanation(step, sel, opts, op) {
    var root = sel.id != null ? DSV.findValueById(step, sel.id) : null;
    if (root === null) return 'A árvore está vazia neste passo.';
    if (!isObj(root)) return null;

    var cur = treeInfo(root);
    var curIds = Object.keys(cur);
    var prevRoot = opts.prevStep ? DSV.findTreeInStep(opts.prevStep, sel, root) : null;
    var prev = prevRoot ? treeInfo(prevRoot) : null;

    if (prev) {
      var added = curIds.filter(function (id) { return !prev[id]; });
      var removed = Object.keys(prev).filter(function (id) { return !cur[id]; });
      var moved = curIds.filter(function (id) { return prev[id] && prev[id].parentId !== cur[id].parentId; });

      if (added.length) {
        var a = cur[added[0]];
        if (a.parentId != null && cur[a.parentId]) {
          return 'O nó ' + a.val + ' foi inserido como filho ' + sideName(a.side) + ' do nó ' + cur[a.parentId].val + '.';
        }
        return 'O nó ' + a.val + ' é a raiz da árvore.';
      }
      if (removed.length) {
        var r = prev[removed[0]];
        var txt = 'O nó ' + r.val + ' foi removido da árvore.';
        if (moved.length) {
          var m = cur[moved[0]];
          txt += m.parentId != null ? ' O nó ' + m.val + ' subiu para o lugar.' : ' O nó ' + m.val + ' virou a raiz.';
        }
        return txt;
      }
      if (moved.length) {
        var m2 = cur[moved[0]];
        if (m2.parentId != null && cur[m2.parentId]) {
          return 'O nó ' + m2.val + ' foi promovido para filho ' + sideName(m2.side) + ' do nó ' + cur[m2.parentId].val + '.';
        }
        return 'O nó ' + m2.val + ' virou a raiz da árvore.';
      }
    }

    /* vaga que o próximo passo vai preencher */
    if (opts.nextStep) {
      var nextRoot = DSV.findTreeInStep(opts.nextStep, sel, root);
      var next = nextRoot ? treeInfo(nextRoot) : null;
      if (next) {
        var nextIds = Object.keys(next);
        for (var i = 0; i < nextIds.length; i++) {
          var na = next[nextIds[i]];
          if (cur[na.id] || na.parentId == null || !cur[na.parentId]) continue;
          var occupied = false;
          for (var j = 0; j < curIds.length; j++) {
            var ci = cur[curIds[j]];
            if (ci.parentId === na.parentId && ci.side === na.side) { occupied = true; break; }
          }
          if (occupied) continue;
          if (op === 'Inserção') {
            return 'A busca por níveis encontrou a primeira posição disponível: o filho ' + sideName(na.side) + ' do nó ' + cur[na.parentId].val + '.';
          }
          return 'A próxima alteração será no filho ' + sideName(na.side) + ' do nó ' + cur[na.parentId].val + '.';
        }
      }
    }

    var aid = activeNodeId(step.pointers || {});
    if (aid != null && cur[aid]) {
      if (op === 'Busca') return 'Comparando o nó ' + cur[aid].val + ' com o valor procurado.';
      return 'Visitando o nó ' + cur[aid].val + '.';
    }

    if (op === 'Inserção') return 'A busca por níveis procura a primeira posição livre.';
    if (op === 'Remoção') return 'Procurando o nó a ser removido.';
    return 'Sem alterações na árvore neste passo.';
  }

  /**
   * Explicação curta e fiel ao estado do passo.
   * Retorna {op, text} — text pode ser null (nada relevante a dizer).
   */
  DSV.explainStep = function (step, sel, opts) {
    opts = opts || {};
    if (!step) return { op: 'Execução', text: null };
    var op = opNameFrom(step, opts.lineText);
    var text = null;
    if (sel && sel.type === 'tree' && sel.id != null) {
      text = treeExplanation(step, sel, opts, op);
    } else if (sel && sel.type === 'tree') {
      text = 'A árvore está vazia neste passo.';
    } else {
      text = genericExplanation(step);
    }
    return { op: op, text: text };
  };

  /* ------------------------------------------------------------------ */
  /* Renderização                                                        */
  /* ------------------------------------------------------------------ */

  function head(title, sub, badge) {
    return '<div class="canvas-toolbar">' +
      '<span class="canvas-title">' + esc(title) + '</span>' +
      (sub ? '<span class="canvas-sub">' + esc(sub) + '</span>' : '') +
      (badge ? '<span class="canvas-badge">' + esc(badge) + '</span>' : '') +
      '</div>';
  }

  /* comparação tolerante a acentos e maiúsculas (arvore x Árvore binária) */
  function normLabel(s) {
    var t = String(s).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.trim();
  }

  /* subtítulo do canvas: "label · N unidade", sem repetir o título */
  function structureSub(sel, n, one, many, title) {
    var count = n + ' ' + (n === 1 ? one : many);
    var label = normLabel(sel.label || '');
    var t = normLabel(title || DSV.typeLabel(sel.type));
    if (label && label !== t && t.indexOf(label) !== 0) return sel.label + ' · ' + count;
    return count;
  }

  function eventsBadge(sel, ctx) {
    var evs = (ctx.events || []).filter(function (e) { return e.targetId === sel.id; });
    return evs.map(function (e) { return e.text; }).join(' · ');
  }

  function cell(label, cls, title) {
    return '<div class="cell ' + (cls || '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' +
      esc(label) + '</div>';
  }

  function renderStack(container, v, sel, ctx) {
    var n = v.items.length;
    var badge = eventsBadge(sel, ctx);
    var keys = itemKeys(v.items);
    var dur = animDur(ctx);

    DSV.flipRender(container, function () {
      var html = head('Pilha', structureSub(sel, n, 'item', 'itens'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="stack-wrap">';
      if (n === 0) {
        html += '<div class="empty-inline">A pilha está vazia neste passo.</div>';
      } else {
        html += '<div class="stack-col">';
        for (var i = n - 1; i >= 0; i--) {
          var cls = 'stack-cell' + (i === n - 1 ? ' top' : '');
          html += '<div class="' + cls + '" data-k="' + esc(keys[i]) + '" data-enter="up" data-exit="up" title="índice ' + i + '">' +
            '<span class="cell-idx">[' + i + ']</span>' +
            '<span class="cell-val">' + esc(DSV.fmtSerializedShort(v.items[i])) + '</span>' +
            (i === n - 1 ? '<span class="cell-flag">← topo</span>' : '') +
            '</div>';
        }
        html += '</div>';
        html += '<div class="stack-side">base</div>';
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    }, dur);
  }

  function renderQueue(container, v, sel, ctx) {
    var n = v.items.length;
    var ops = (ctx.opsMap || {})[sel.id] || {};
    /* fila implementada com unshift/pop: a frente fica na outra extremidade */
    var reverse = !!(ops.unshift && ops.pop && !ops.shift);
    var badge = eventsBadge(sel, ctx);
    var keys = itemKeys(v.items);
    var dur = animDur(ctx);
    var enterDir = reverse ? 'left' : 'right';
    var exitDir = reverse ? 'right' : 'left';
    var frontIdx = reverse ? n - 1 : 0;
    var rearIdx = reverse ? 0 : n - 1;

    DSV.flipRender(container, function () {
      var html = head('Fila', structureSub(sel, n, 'item', 'itens'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="queue-wrap">';
      if (n === 0) {
        html += '<div class="empty-inline">A fila está vazia neste passo.</div>';
      } else {
        html += '<div class="queue-row">';
        for (var i = 0; i < n; i++) {
          var isFront = i === frontIdx;
          var isRear = i === rearIdx;
          html += '<div class="queue-unit" data-k="' + esc(keys[i]) + '"' +
            ' data-enter="' + enterDir + '" data-exit="' + exitDir + '">';
          html += '<div class="queue-ptrs">' +
            (isFront ? '<span class="queue-ptr ptr-front" title="primeiro a sair">FRONT</span>' : '') +
            (isRear ? '<span class="queue-ptr ptr-rear" title="último a entrar">REAR</span>' : '') +
            '</div>';
          html += '<div class="queue-cell' + (isFront ? ' front' : '') + '" title="índice ' + i + '">' +
            '<span class="cell-val">' + esc(DSV.fmtSerializedShort(v.items[i])) + '</span>' +
            '</div>';
          html += '<div class="queue-idx">[' + i + ']</div>';
          html += '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    }, dur);
  }

  function shallowEq(a, b) {
    if (!a || !b) return false;
    if (a.t !== b.t) return false;
    if (a.t === 'p') return a.v === b.v;
    if (a.t === 'a' || a.t === 'o') return a.id != null && a.id === b.id;
    return false;
  }

  function renderArray(container, v, sel, ctx) {
    var n = v.items.length;
    var badge = eventsBadge(sel, ctx);
    var dur = animDur(ctx);
    var keys = itemKeys(v.items);

    var prev = null;
    if (ctx.prevStep) prev = DSV.findValueById(ctx.prevStep, sel.id);
    if (prev && prev.t !== 'a') prev = null;

    DSV.flipRender(container, function () {
      var html = head('Array', structureSub(sel, n, 'item', 'itens'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="array-wrap">';
      if (n === 0) {
        html += '<div class="empty-inline">O array está vazio neste passo.</div>';
      } else {
        html += '<div class="array-grid">';
        for (var i = 0; i < n; i++) {
          var changed = prev ? !shallowEq(prev.items[i], v.items[i]) : false;
          html += '<div class="array-cell-wrap">' +
            '<div class="array-idx">' + i + '</div>' +
            '<div class="cell array-cell' + (changed ? ' changed' : '') + '" data-k="' + esc(keys[i]) + '" data-enter="pop" data-exit="pop">' +
            esc(DSV.fmtSerializedShort(v.items[i])) +
            '</div></div>';
        }
        html += '</div>';
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    }, dur);
  }

  function renderList(container, v, sel, ctx) {
    var nodes = [];
    var seen = {};
    var cur = v;
    var cycleId = null;
    while (isObj(cur)) {
      if (seen[cur.id]) { cycleId = cur.id; break; }
      seen[cur.id] = true;
      nodes.push(cur);
      var p = propOf(cur, LIST_NEXT);
      cur = p ? p.value : null;
    }

    var badge = eventsBadge(sel, ctx);
    var dur = animDur(ctx);

    DSV.flipRender(container, function () {
      var html = head('Lista encadeada', structureSub(sel, nodes.length, 'nó', 'nós', 'Lista encadeada'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="list-wrap">';

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var chips = chipsFor((ctx.pointers || {})[node.id]);
        var visitNum = (ctx.visit && ctx.visit.map) ? ctx.visit.map[node.id] : null;
        html += '<div class="list-unit" data-k="n' + node.id + '" data-enter="pop" data-exit="pop">';
        html += '<div class="list-node-wrap">';
        if (chips.length || visitNum) {
          html += '<div class="ptr-chips">' + chips.map(function (c) {
            return '<span class="ptr-chip">' + esc(c) + '</span>';
          }).join('') + (visitNum ? '<span class="visit-chip" title="ordem de visita">✓' + visitNum + '</span>' : '') + '</div>';
        }
        html += '<div class="cell list-node' + (chips.length ? ' tagged' : '') + '">' +
          esc(nodeValue(node)) + '</div>';
        html += '</div>';
        html += '<div class="arrow">→</div>';
        html += '</div>';
      }

      if (cycleId != null) {
        html += '<div class="list-unit" data-k="cycle"><div class="cell list-null cycle">↩ volta para o nó #' + cycleId + ' (ciclo)</div></div>';
      } else {
        html += '<div class="list-unit" data-k="null"><div class="cell list-null">null</div></div>';
      }
      html += '</div>';
      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    }, dur);
  }

  /* ------------------------------------------------------------------ */
  /* Árvore: geometria compartilhada (em-ordem × profundidade)           */
  /* ------------------------------------------------------------------ */

  var TREE_HGAP = 72;
  var TREE_VGAP = 84;
  var TREE_R = 23;
  var TREE_PADX = 48;
  var TREE_PADY = 48;

  /* percorre em-ordem: x = ordem horizontal (subárvores não se sobrepõem),
   * y = profundidade; guarda também pai e lado de cada nó */
  function treeLayout(v) {
    var nodes = [];
    var seen = Object.create(null);
    var maxDepth = 0;
    (function walk(node, depth, parentId, side) {
      if (!isObj(node) || seen[node.id]) return;
      seen[node.id] = true;
      var L = nodeChild(node, 'L');
      var R = nodeChild(node, 'R');
      walk(L, depth + 1, node.id, 'L');
      nodes.push({ ser: node, x: nodes.length, depth: depth, left: L, right: R, parentId: parentId, side: side });
      if (depth > maxDepth) maxDepth = depth;
      walk(R, depth + 1, node.id, 'R');
    })(v, 0, null, null);
    return { nodes: nodes, maxDepth: maxDepth };
  }

  function treePositions(layout) {
    var pos = Object.create(null);
    var width = Math.max(layout.nodes.length * TREE_HGAP + TREE_PADX * 2, 360);
    var height = (layout.maxDepth + 1) * TREE_VGAP + TREE_PADY + 40;
    layout.nodes.forEach(function (n) {
      pos[n.ser.id] = {
        x: TREE_PADX + n.x * TREE_HGAP + TREE_HGAP / 2,
        y: TREE_PADY + n.depth * TREE_VGAP
      };
    });
    return { pos: pos, width: width, height: height };
  }

  function treeIds(root) {
    var ids = Object.create(null);
    (function walk(n) {
      if (!isObj(n) || ids[n.id]) return;
      ids[n.id] = true;
      walk(nodeChild(n, 'L'));
      walk(nodeChild(n, 'R'));
    })(root);
    return ids;
  }

  /* localiza a mesma árvore em outro passo (inclusive quando a raiz mudou de
   * identidade, por promoção) pelos ids dos nós — nunca pela posição visual */
  DSV.findTreeInStep = function (step, sel, currentRoot) {
    if (!step || !isObj(currentRoot)) return null;
    var curIds = treeIds(currentRoot);
    var size = Object.keys(curIds).length;
    var best = null;
    var bestOv = 0;
    function consider(sv) {
      if (!isTreeNode(sv)) return;
      var ids = treeIds(sv);
      var candSize = Object.keys(ids).length;
      var ov = 0;
      Object.keys(ids).forEach(function (id) { if (curIds[id]) ov++; });
      /* a mesma árvore pode ter um nó a mais ou a menos entre os passos:
       * exige que todos os nós da menor delas estejam presentes */
      if (ov >= Math.min(size, candSize) && ov > bestOv) { bestOv = ov; best = sv; }
    }
    function walkVal(sv, depth) {
      if (!sv || typeof sv !== 'object' || depth > 5) return;
      if (sv.t === 'fn' || sv.t === 'c') return;
      if (isTreeNode(sv)) { consider(sv); return; }
      if (sv.t === 'a') {
        for (var i = 0; i < sv.items.length; i++) walkVal(sv.items[i], depth + 1);
      } else if (sv.t === 'o') {
        var keys = Object.keys(sv.props || {});
        for (var j = 0; j < keys.length; j++) walkVal(sv.props[keys[j]], depth + 1);
      }
    }
    ['globals', 'locals'].forEach(function (scope) {
      var map = step[scope] || {};
      Object.keys(map).forEach(function (name) { walkVal(map[name], 0); });
    });
    if (step.thisVal) walkVal(step.thisVal, 0);
    return best;
  };

  /* valor do nó em linguagem natural (sem as aspas dos literais string) */
  function treeValText(node) {
    var s = nodeValue(node);
    if (s.length > 1 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') return s.slice(1, -1);
    return s;
  }

  /* mapa id -> {valor, pai, lado} da árvore serializada */
  function treeInfo(root) {
    var info = Object.create(null);
    (function walk(n, parentId, side) {
      if (!isObj(n) || info[n.id]) return;
      info[n.id] = { id: n.id, val: treeValText(n), parentId: parentId, side: side };
      walk(nodeChild(n, 'L'), n.id, 'L');
      walk(nodeChild(n, 'R'), n.id, 'R');
    })(root, null, null);
    return info;
  }

  /* vaga que o PRÓXIMO passo vai preencher (inserção): aparece um instante
   * antes do nó, sem indicadores permanentes de filhos vazios */
  function insertionPreview(sel, ctx, currentRoot) {
    if (!ctx || !ctx.nextStep || !sel || sel.type !== 'tree' || !isObj(currentRoot)) return null;
    var nextRoot = DSV.findTreeInStep(ctx.nextStep, sel, currentRoot);
    if (!nextRoot) return null;
    var curIds = treeIds(currentRoot);
    var curInfo = treeInfo(currentRoot);
    var nextLayout = treeLayout(nextRoot);
    var geo = treePositions(nextLayout);
    var curList = Object.keys(curIds);
    for (var i = 0; i < nextLayout.nodes.length; i++) {
      var n = nextLayout.nodes[i];
      if (n.parentId == null || curIds[n.ser.id] || !curIds[n.parentId]) continue;
      var occupied = false;
      for (var j = 0; j < curList.length; j++) {
        var ci = curInfo[curList[j]];
        if (ci && ci.parentId === n.parentId && ci.side === n.side) { occupied = true; break; }
      }
      if (occupied) continue;
      return { parentId: n.parentId, side: n.side, pos: geo.pos[n.ser.id] };
    }
    return null;
  }

  /* Renderização estática (fallback para ambientes sem DOM real, ex.: testes) */
  function renderTreeStatic(container, v, sel, ctx) {
    var layout = treeLayout(v);
    var geo = treePositions(layout);
    var nodes = layout.nodes;
    var pos = geo.pos;
    var R = TREE_R;

    var lines = '';
    var circles = '';

    nodes.forEach(function (n) {
      var p = pos[n.ser.id];
      [n.left, n.right].forEach(function (child) {
        if (!isObj(child) || !pos[child.id]) return;
        var cp = pos[child.id];
        lines += '<line x1="' + p.x + '" y1="' + (p.y + R) + '" x2="' + cp.x + '" y2="' + (cp.y - R) + '" class="tree-edge" />';
      });
    });

    /* vaga que o próximo passo vai preencher (temporária, só na inserção) */
    var preview = insertionPreview(sel, ctx, v);
    if (preview && pos[preview.parentId] && preview.pos) {
      var pp = pos[preview.parentId];
      lines += '<line x1="' + pp.x + '" y1="' + pp.y + '" x2="' + preview.pos.x + '" y2="' + preview.pos.y + '" class="tree-preview-edge" />' +
        '<circle cx="' + preview.pos.x + '" cy="' + preview.pos.y + '" r="' + R + '" class="tree-preview-slot" />';
    }

    var visitMap = visitedMapFor(ctx, ctx.step);
    var activeId = activeNodeId(ctx.pointers || {});

    nodes.forEach(function (n) {
      var p = pos[n.ser.id];
      var visited = !!visitMap[n.ser.id];
      var active = activeId === n.ser.id;

      var cls = 'tree-node';
      if (visited) cls += ' visited';
      if (active) cls += ' active';

      circles += '<g class="tree-group">';
      circles += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + R + '" class="' + cls + '" />';
      circles += '<text x="' + p.x + '" y="' + (p.y + 5) + '" class="tree-val">' + esc(nodeValue(n.ser)) + '</text>';
      circles += '</g>';
    });

    var svg = '<svg class="tree-svg" width="' + geo.width + '" height="' + geo.height + '" viewBox="0 0 ' + geo.width + ' ' + geo.height + '">' +
      lines + circles + '</svg>';

    var badge = eventsBadge(sel, ctx);
    container.innerHTML = head('Árvore binária', structureSub(sel, nodes.length, 'nó', 'nós', 'Árvore binária'), badge) +
      '<div class="canvas-viewport"><div class="canvas-stage"><div class="tree-wrap">' + svg + '</div></div></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Árvore: cena animada (nós e arestas interpolados a cada frame)      */
  /* ------------------------------------------------------------------ */

  var SVGNS = 'http://www.w3.org/2000/svg';

  function supportsTreeScene() {
    return typeof document !== 'undefined' &&
      typeof document.createElementNS === 'function' &&
      typeof requestAnimationFrame === 'function';
  }

  function round2(v) { return Math.round(v * 100) / 100; }
  function round3(v) { return Math.round(v * 1000) / 1000; }

  function createTreeScene(container, key) {
    var scene = {
      key: key,
      nodes: Object.create(null),
      edges: Object.create(null),
      raf: null
    };

    container.innerHTML = '';
    var headEl = document.createElement('div');
    container.appendChild(headEl);
    var viewport = document.createElement('div');
    viewport.className = 'canvas-viewport';
    container.appendChild(viewport);
    var body = document.createElement('div');
    body.className = 'canvas-stage';
    viewport.appendChild(body);
    var wrap = document.createElement('div');
    wrap.className = 'tree-wrap';
    body.appendChild(wrap);

    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'tree-svg');
    var gEdges = document.createElementNS(SVGNS, 'g');
    var gPreview = document.createElementNS(SVGNS, 'g');
    var gNodes = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gEdges);
    svg.appendChild(gPreview);
    svg.appendChild(gNodes);
    wrap.appendChild(svg);

    scene.head = headEl;
    scene.wrap = wrap;
    scene.svg = svg;
    scene.gEdges = gEdges;
    scene.gPreview = gPreview;
    scene.gNodes = gNodes;
    scene.previewEls = null;
    scene.preview = null;
    return scene;
  }

  function updateTreeScene(scene, container, v, sel, ctx) {
    var dur = animDur(ctx);
    var layout = treeLayout(v);
    var geo = treePositions(layout);
    var nodes = layout.nodes;

    scene.svg.setAttribute('width', geo.width);
    scene.svg.setAttribute('height', geo.height);
    scene.svg.setAttribute('viewBox', '0 0 ' + geo.width + ' ' + geo.height);
    scene.wrap.style.minWidth = geo.width + 'px';
    scene.wrap.style.height = geo.height + 'px';

    var targets = Object.create(null);
    nodes.forEach(function (n) {
      var p = geo.pos[n.ser.id];
      targets[n.ser.id] = {
        x: p.x,
        y: p.y,
        ser: n.ser,
        left: n.left,
        right: n.right
      };
    });

    scene.head.innerHTML = head('Árvore binária', structureSub(sel, nodes.length, 'nó', 'nós', 'Árvore binária'), eventsBadge(sel, ctx));

    var activeId = activeNodeId(ctx.pointers || {});
    syncTreeNodes(scene, targets, dur, ctx, activeId);
    syncTreeEdges(scene, targets, ctx, sel, v);
    syncTreePreview(scene, insertionPreview(sel, ctx, v));
    startTreeFrame(scene);
  }

  function syncTreeNodes(scene, targets, dur, ctx, activeId) {
    var visitMap = visitedMapFor(ctx, ctx.step);
    var t0 = DSV.anim.now();

    Object.keys(targets).forEach(function (id) {
      var t = targets[id];
      var n = scene.nodes[id];
      if (!n) {
        n = createNodeEls(id);
        n.x = t.x;
        n.y = t.y - 26;
        n.sc = 0.55;
        n.op = 0;
        scene.nodes[id] = n;
        n.g.setAttribute('transform', 'translate(' + round2(t.x) + ',' + round2(t.y - 26) + ') scale(0.55)');
        scene.gNodes.appendChild(n.g);
      }
      n.exiting = false;
      n.anim = {
        x0: n.x, y0: n.y, s0: n.sc, o0: n.op,
        x1: t.x, y1: t.y, s1: 1, o1: 1,
        start: t0, dur: dur > 0 ? Math.max(60, dur) : 0
      };
      updateNodeContent(n, t, visitMap, activeId);
    });

    Object.keys(scene.nodes).forEach(function (id) {
      if (targets[id]) return;
      var n = scene.nodes[id];
      if (n.exiting) return;
      n.exiting = true;
      n.anim = {
        x0: n.x, y0: n.y, s0: n.sc, o0: n.op,
        x1: n.x, y1: n.y, s1: 0.7, o1: 0,
        start: t0, dur: dur > 0 ? Math.max(60, dur) : 0
      };
    });
  }

  function createNodeEls(id) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'tree-group');

    var circle = document.createElementNS(SVGNS, 'circle');
    circle.setAttribute('class', 'tree-node');
    circle.setAttribute('r', '23');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('vector-effect', 'non-scaling-stroke');

    var val = document.createElementNS(SVGNS, 'text');
    val.setAttribute('class', 'tree-val');
    val.setAttribute('dy', '4.5');

    g.appendChild(circle);
    g.appendChild(val);
    return {
      g: g, circle: circle, val: val,
      x: 0, y: 0, sc: 1, op: 1, anim: null, exiting: false
    };
  }

  function updateNodeContent(n, t, visitMap, activeId) {
    n.val.textContent = nodeValue(t.ser);

    var visited = !!visitMap[t.ser.id];
    var active = activeId === t.ser.id;

    var cls = 'tree-node';
    if (visited) cls += ' visited';
    if (active) cls += ' active';
    if (n.circle.getAttribute('class') !== cls) n.circle.setAttribute('class', cls);
  }

  /* prévia da vaga de inserção: linha tracejada do pai até o lugar exato
   * onde o nó vai aparecer (some assim que ele aparece) */
  function syncTreePreview(scene, preview) {
    if (!preview || !preview.pos) {
      if (scene.previewEls) {
        scene.previewEls.line.remove();
        scene.previewEls.circle.remove();
        scene.previewEls = null;
      }
      scene.preview = null;
      return;
    }
    if (!scene.previewEls) {
      var line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('class', 'tree-preview-edge');
      var circle = document.createElementNS(SVGNS, 'circle');
      circle.setAttribute('class', 'tree-preview-slot');
      circle.setAttribute('r', String(TREE_R));
      scene.gPreview.appendChild(line);
      scene.gPreview.appendChild(circle);
      scene.previewEls = { line: line, circle: circle };
    }
    scene.previewEls.circle.setAttribute('cx', round2(preview.pos.x));
    scene.previewEls.circle.setAttribute('cy', round2(preview.pos.y));
    scene.preview = { parentId: preview.parentId, pos: preview.pos };
  }

  function syncTreeEdges(scene, targets, ctx, sel, currentRoot) {
    var parentOf = Object.create(null);
    Object.keys(targets).forEach(function (id) {
      var t = targets[id];
      if (t.left && targets[t.left.id]) parentOf[t.left.id] = id;
      if (t.right && targets[t.right.id]) parentOf[t.right.id] = id;
    });

    /* para destacar conexão criada ou alterada, compara com o passo anterior */
    var prevParent = null;
    if (ctx && ctx.prevStep) {
      var prevRoot = DSV.findTreeInStep(ctx.prevStep, sel, currentRoot);
      if (prevRoot) {
        prevParent = Object.create(null);
        (function walk(n) {
          if (!isObj(n)) return;
          var L = nodeChild(n, 'L');
          var R = nodeChild(n, 'R');
          if (L) prevParent[L.id] = n.id;
          if (R) prevParent[R.id] = n.id;
          walk(L);
          walk(R);
        })(prevRoot);
      }
    }

    var now = DSV.anim.now();
    Object.keys(parentOf).forEach(function (cid) {
      var pid = parentOf[cid];
      var changed = prevParent ? prevParent[cid] !== pid : false;
      var e = scene.edges[cid];
      if (!e) {
        var path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('class', 'tree-edge');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        e = scene.edges[cid] = {
          line: path,
          parentId: null,
          hlUntil: 0
        };
        scene.gEdges.appendChild(path);
        changed = true;
      }
      e.parentId = pid;
      if (changed) {
        e.line.setAttribute('class', 'tree-edge new');
        e.hlUntil = now + Math.max(240, animDur(ctx));
      } else if (e.hlUntil && now >= e.hlUntil) {
        e.line.setAttribute('class', 'tree-edge');
        e.hlUntil = 0;
      }
    });

    Object.keys(scene.edges).forEach(function (cid) {
      var e = scene.edges[cid];
      if (!parentOf[cid]) {
        /* o nó ainda pode estar saindo: a aresta some junto com ele */
        var n = scene.nodes[cid];
        if (n && n.exiting) return;
        e.line.remove();
        delete scene.edges[cid];
      }
    });
  }

  function startTreeFrame(scene) {
    if (scene.raf || typeof requestAnimationFrame !== 'function') return;
    var tick = function () {
      scene.raf = null;
      if (scene.svg && scene.svg.isConnected === false) return;
      var active = treeFrame(scene);
      if (active) scene.raf = requestAnimationFrame(tick);
    };
    scene.raf = requestAnimationFrame(tick);
  }

  function treeFrame(scene) {
    var t0 = DSV.anim.now();
    var active = false;

    Object.keys(scene.nodes).forEach(function (id) {
      var n = scene.nodes[id];
      if (n.anim) {
        var a = n.anim;
        var t = a.dur > 0 ? (t0 - a.start) / a.dur : 1;
        if (t < 1) active = true;
        var e = DSV.anim.ease(t);
        n.x = DSV.anim.lerp(a.x0, a.x1, e);
        n.y = DSV.anim.lerp(a.y0, a.y1, e);
        n.sc = DSV.anim.lerp(a.s0, a.s1, e);
        n.op = DSV.anim.lerp(a.o0, a.o1, e);
        if (t >= 1) {
          n.anim = null;
          if (n.exiting) {
            n.g.remove();
            delete scene.nodes[id];
            return;
          }
        }
      }
      n.g.setAttribute('transform', 'translate(' + round2(n.x) + ',' + round2(n.y) + ') scale(' + round3(n.sc) + ')');
      n.g.setAttribute('opacity', round3(n.op));
    });

    Object.keys(scene.edges).forEach(function (cid) {
      var e = scene.edges[cid];
      var p = scene.nodes[e.parentId];
      var c = scene.nodes[cid];
      if (!p || !c) {
        e.line.remove();
        delete scene.edges[cid];
        return;
      }
      e.line.setAttribute('d', 'M' + round2(p.x) + ' ' + round2(p.y + 23) + ' L' + round2(c.x) + ' ' + round2(c.y - 23));
      var o = Math.min(p.op, c.op);
      e.line.setAttribute('opacity', round3(o));
      if (o < 0.99) active = true;
      if (e.hlUntil && t0 >= e.hlUntil) {
        e.line.setAttribute('class', 'tree-edge');
        e.hlUntil = 0;
      }
    });

    /* prévia da vaga de inserção: acompanha o pai enquanto ele se move */
    if (scene.preview && scene.previewEls) {
      var pn = scene.nodes[scene.preview.parentId];
      if (pn) {
        scene.previewEls.line.setAttribute('x1', round2(pn.x));
        scene.previewEls.line.setAttribute('y1', round2(pn.y));
        scene.previewEls.line.setAttribute('x2', round2(scene.preview.pos.x));
        scene.previewEls.line.setAttribute('y2', round2(scene.preview.pos.y));
        scene.previewEls.line.setAttribute('opacity', round3(pn.op));
        scene.previewEls.circle.setAttribute('opacity', round3(Math.min(1, pn.op + 0.2)));
        if (pn.op < 0.99) active = true;
      }
    }

    return active;
  }

  function renderTree(container, v, sel, ctx) {
    if (!supportsTreeScene()) {
      renderTreeStatic(container, v, sel, ctx);
      return;
    }
    /* a chave usa o rótulo (e não o id da raiz) para a cena sobreviver a
     * remoções que trocam a raiz: os nós persistentes são interpolados e
     * só o nó removido sai — sem reiniciar a animação da árvore inteira */
    var key = 'tree|' + sel.label;
    var scene = container.__treeScene;
    if (!scene || scene.key !== key) {
      scene = container.__treeScene = createTreeScene(container, key);
    }
    updateTreeScene(scene, container, v, sel, ctx);
  }

  function renderMessage(container, msg, kind) {
    /* a mensagem substitui a cena da árvore: descarta a referência para
     * que o próximo passo recrie a cena em vez de atualizar um DOM antigo */
    container.__treeScene = null;
    container.innerHTML = '<div class="canvas-viewport"><div class="canvas-stage"><div class="empty ' + (kind || '') + '">' + msg + '</div></div></div>';
  }

  /**
   * Renderiza a estrutura selecionada.
   * sel: {type, id, label} — id null = estrutura vazia (raiz/início nulos)
   * ctx: {opsMap, pointers, events, visit, prevStep}
   */
  DSV.renderStructure = function (container, sel, step, ctx) {
    if (!step) { renderMessage(container, 'Execute o código para começar.'); return; }
    if (!sel || sel.type === 'none') {
      renderMessage(container, 'Nenhuma estrutura detectada ainda. Use um array (pilha/fila), nós com <code>proximo</code> (lista) ou nós com <code>esquerda/direita</code> (árvore).');
      return;
    }
    ctx = ctx || {};
    /* carimba o passo atual: renderizadores dependem dele para visitas,
     * prévia de inserção e destaque de arestas */
    ctx.step = step;

    if (sel.id == null) {
      if (sel.type === 'list') renderMessage(container, 'Lista vazia — <code>' + esc(sel.label) + '</code> ainda não tem nós.');
      else if (sel.type === 'tree') renderMessage(container, 'A árvore está vazia neste passo.');
      else renderMessage(container, 'Estrutura vazia.');
      return;
    }

    var v = DSV.findValueById(step, sel.id);
    if (!v) {
      renderMessage(container, 'A estrutura <code>' + esc(sel.label) + '</code> ainda não existe neste passo.');
      return;
    }

    var usedTree = false;
    try {
      if (sel.type === 'stack' && isArr(v)) renderStack(container, v, sel, ctx);
      else if (sel.type === 'queue' && isArr(v)) renderQueue(container, v, sel, ctx);
      else if (sel.type === 'array' && isArr(v)) renderArray(container, v, sel, ctx);
      else if (sel.type === 'list' && isObj(v)) renderList(container, v, sel, ctx);
      else if (sel.type === 'tree' && isObj(v)) { usedTree = true; renderTree(container, v, sel, ctx); }
      else if (isArr(v)) renderArray(container, v, sel, ctx);
      else if (isObj(v)) { usedTree = true; renderTree(container, v, sel, ctx); }
      else renderMessage(container, 'Tipo de estrutura não suportado para este valor.');
    } catch (e) {
      usedTree = false;
      renderMessage(container, 'Não foi possível desenhar a estrutura: ' + esc(e.message), 'error');
    }
    if (!usedTree) container.__treeScene = null;
  };

  DSV.itemKeys = itemKeys;
  DSV.typeLabel = function (t) {
    return { stack: 'Pilha', queue: 'Fila', list: 'Lista', tree: 'Árvore', array: 'Array' }[t] || t;
  };

  DSV.shortName = shortName;
})(typeof window !== 'undefined' ? window : globalThis);
