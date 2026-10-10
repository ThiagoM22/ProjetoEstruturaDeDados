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
  var LIST_PREV = ['anterior', 'prev', 'previous'];
  var NODE_VALUE = ['valor', 'value', 'dado', 'data', 'chave', 'key', 'elemento', 'item', 'nome'];
  var ITEM_KEYS = ['itens', 'items', 'elementos', 'dados', 'valores', 'array', 'lista', 'fila', 'pilha'];
  var ROOT_KEYS = ['raiz', 'root', '#root', '#raiz'];
  /* campos privados aparecem serializados com "#" na frente (#head) */
  var HEAD_KEYS = ['inicio', 'início', 'head', '#head', '#inicio', '#início', 'primeiro', 'cabeca', 'cabeça'];
  var TAIL_KEYS = ['tail', '#tail', 'cauda', '#cauda', 'ultimo', 'último', '#ultimo', '#último', 'fim', '#fim'];
  /* wrapper de array (MeuArray): array interno + tamanho lógico controlado à mão */
  var ARRAY_SIZE_KEYS = ['#tamanho', 'tamanho', '#size', 'size', '#qtd', 'qtd', 'quantidade', '#length', 'length'];

  var STACK_RX = /pilha|stack/i;
  var QUEUE_RX = /fila|queue/i;
  var LIST_RX = /lista|linked|encadeada/i;
  var DOUBLY_RX = /doubly|duplamente|dupla|bidirecional/i;
  var TREE_RX = /arvore|árvore|tree|bst/i;
  var ARRAY_RX = /array|vetor/i;
  var ROOT_RX = /^(raiz|root)$/i;
  var NODE_RX = /^(no|nó|node|atual|current)$/i;

  var TYPE_RANK = { tree: 0, list: 1, array: 1.5, stack: 2, queue: 3 };

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

  /* Fila com índices (#inicio/#fim): a janela viva é [inicio, fim); o resto
   * do array é histórico de posições (os buracos que o "delete" deixa).
   * Devolve null quando o wrapper não guarda índices (ex.: push/shift). */
  function queueWindow(sv, items) {
    if (!isObj(sv) || !isArr(items)) return null;
    var startP = propOf(sv, ['#inicio', '#início', 'inicio', 'início']);
    var endP = propOf(sv, ['#fim', 'fim']);
    if (!startP || !endP) return null;
    if (!startP.value || startP.value.t !== 'p' || typeof startP.value.v !== 'number') return null;
    if (!endP.value || endP.value.t !== 'p' || typeof endP.value.v !== 'number') return null;
    var start = startP.value.v;
    var end = endP.value.v;
    if (!isFinite(start) || !isFinite(end)) return null;
    if (start < 0 || end < start || end > items.items.length) return null;
    return { start: start, end: end };
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

  /* percorre a cadeia via next uma vez: tamanho, se algum nó tem referência
   * prev (lista dupla) e o último nó alcançado */
  function listInfo(sv) {
    var seen = {};
    var n = sv;
    var c = 0;
    var doubly = false;
    var last = null;
    while (isObj(n) && !seen[n.id] && c < 500) {
      seen[n.id] = true;
      if (propOf(n, LIST_PREV)) doubly = true;
      last = n;
      c++;
      var p = propOf(n, LIST_NEXT);
      n = p && isObj(p.value) ? p.value : null;
    }
    return { count: c, doubly: doubly, tail: last };
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
    var t = String(label).replace(/\.(raiz|root|#root|#raiz)$/i, '');
    return t || String(label);
  }

  /* chips de ponteiro: sem duplicatas, prioriza nomes significativos.
   * Retorna {key, text}: key = caminho completo (estável entre passos),
   * text = nome curto exibido. */
  var CHILD_ALIAS_RX = /^(esquerda|direita|left|right|esq|dir|proximo|próximo|next|prox|seguinte|anterior|prev|previous)$/i;
  /* variáveis de trabalho do algoritmo (cursor/índice da BFS) não viram
   * etiqueta: o nó continua marcado pelo realce roxo, sem texto */
  var HIDDEN_CHIP_RX = /^(cursor|cur)$/i;
  /* campos privados (#head, #length…) são estado interno: o HEAD tem o
   * indicador próprio e não vira etiqueta sobre o nó */
  var PRIVATE_CHIP_RX = /^#/;

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
      return !CHILD_ALIAS_RX.test(c.text) && !/^\d+$/.test(c.text) &&
        !HIDDEN_CHIP_RX.test(c.text) && !PRIVATE_CHIP_RX.test(c.text);
    }).slice(0, 2);
  }

  function chipsFor(labels) {
    return chipDefs(labels).map(function (c) { return c.text; });
  }

  /* nó em destaque principal do passo: um único nó — o cursor da operação
   * (atual/cursor…) tem prioridade sobre o nó em visita recursiva (no/node) e
   * sobre o alvo (alvo/removido). A escolha olha os rótulos dos ponteiros
   * reais, nunca os valores dos nós. */
  var CURSOR_POINTER_RX = /^(atual|current|cur|cursor|aux)$/i;
  var NODE_POINTER_RX = /^(no|nó|node)$/i;
  var TARGET_POINTER_RX = /^(alvo|target|removido)$/i;

  function activeNodeInfo(pointers) {
    var best = null;
    var bestRank = 0;
    Object.keys(pointers || {}).forEach(function (id) {
      var labels = pointers[id] || [];
      for (var i = 0; i < labels.length; i++) {
        var s = shortName(labels[i]);
        var rank = CURSOR_POINTER_RX.test(s) ? 3 : NODE_POINTER_RX.test(s) ? 2 : TARGET_POINTER_RX.test(s) ? 1 : 0;
        if (rank > bestRank) { bestRank = rank; best = { id: Number(id), label: s }; }
      }
    });
    return best;
  }

  function activeNodeId(pointers) {
    var info = activeNodeInfo(pointers);
    return info ? info.id : null;
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
        var linfo = listInfo(v);
        push({
          type: 'list',
          id: v.id,
          label: shownLabel,
          doubly: linfo.doubly,
          tailId: null,
          score: 3.5 + (ROOT_RX.test(shortName(label)) || /^(inicio|início|head|primeiro)$/.test(shortName(label)) ? 3 : 0) + Math.min(linfo.count, 10) * 0.3
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
        var tailP = propOf(v, TAIL_KEYS);
        var tailId = null;
        if (tailP) {
          if (isObj(tailP.value)) tailId = tailP.value.id;
          else if (tailP.value && tailP.value.t === 'ref') tailId = tailP.value.id;
        }
        if (headP) {
          if (isListNode(headP.value)) {
            var winfo = listInfo(headP.value);
            push({
              type: 'list',
              id: headP.value.id,
              label: shownLabel,
              doubly: winfo.doubly || DOUBLY_RX.test(nameLike) || !!tailP,
              tailId: tailId,
              score: 9 + Math.min(winfo.count, 8) * 0.1
            });
          } else if (isNullSer(headP.value)) {
            push({
              type: 'list',
              id: null,
              holderId: v.id,
              label: shownLabel,
              doubly: DOUBLY_RX.test(nameLike) || !!tailP,
              tailId: tailId,
              score: 6
            });
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
            push({ type: 'queue', id: items.value.id, label: shownLabel, score: 9 + (ops.shift ? 1 : 0), win: queueWindow(v, items.value) });
          } else if (ops.pop && !ops.shift) {
            push({ type: 'stack', id: items.value.id, label: shownLabel, score: 9 });
          } else {
            push({ type: 'queue', id: items.value.id, label: shownLabel, score: 9, win: queueWindow(v, items.value) });
          }
          return;
        }
      }

      /* wrapper de array (MeuArray): array interno + tamanho lógico numérico
       * controlado manualmente. O candidato aponta para o WRAPPER (id estável,
       * mesmo quando limpar() troca o array interno); o render lê o array
       * interno e o tamanho direto das propriedades atuais do passo. */
      var arrItems = arrayProp(v);
      var sizeP = propOf(v, ARRAY_SIZE_KEYS);
      var sizeVal = sizeP && sizeP.value && sizeP.value.t === 'p' && typeof sizeP.value.v === 'number'
        ? sizeP.value.v : null;
      var strongArray = !!(arrItems &&
        /^#?(items|itens|elementos|dados|valores)$/i.test(arrItems.name) &&
        /^#?(tamanho|size|length|qtd|quantidade)$/i.test(sizeP ? sizeP.name : ''));
      if (arrItems && sizeVal != null && (ARRAY_RX.test(nameLike) || strongArray)) {
        push({
          type: 'array',
          id: v.id,
          label: shownLabel,
          itemsProp: arrItems.name,
          sizeProp: sizeP.name,
          /* sem bônus por quantidade de itens: instâncias do mesmo tipo
           * empatam e a primeira declarada (a principal) prevalece */
          score: 9 + (ARRAY_RX.test(String(ctor || '')) ? 1.5 : 0)
        });
        return;
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
    insert: 'Inserção',
    insertNode: 'Inserção',
    remover: 'Remoção',
    remove: 'Remoção',
    removeNode: 'Remoção',
    buscar: 'Busca',
    search: 'Busca',
    searchNode: 'Busca',
    preOrdem: 'Percurso pré-ordem',
    emOrdem: 'Percurso em ordem',
    posOrdem: 'Percurso pós-ordem',
    preOrderTraverse: 'Percurso pré-ordem',
    inOrderTraverse: 'Percurso em ordem',
    postOrderTraverse: 'Percurso pós-ordem',
    limpar: 'Limpeza',
    estaVazia: 'Verificação',
    empilhar: 'Empilhamento',
    desempilhar: 'Desempilhamento',
    enfileirar: 'Enfileiramento',
    desenfileirar: 'Desenfileiramento',
    enqueue: 'Enfileiramento',
    dequeue: 'Desenfileiramento',
    front: 'Consulta à frente'
  };

  /* operações da lista simplesmente encadeada (mesmos nomes da aula):
   * alimentam o nome da operação na faixa de explicação e a segmentação
   * das visitas por operação (epochs) */
  var LIST_OP_NAMES = {
    insertAtBeginning: 'Inserção no início',
    insertAtEnd: 'Inserção no final',
    removeByValue: 'Remoção',
    find: 'Busca',
    size: 'Tamanho',
    isEmpty: 'Verificação',
    toString: 'Representação',
    percorrer: 'Percurso',
    /* lista duplamente encadeada */
    append: 'Inserção no final',
    prepend: 'Inserção no início',
    insertAt: 'Inserção em posição',
    removeLast: 'Remoção no final',
    removeFirst: 'Remoção no início',
    removeAt: 'Remoção em posição',
    indexOf: 'Busca',
    transverse: 'Percurso',
    transverseReverse: 'Percurso reverso',
    /* nomes clássicos de sala (lista com nós) */
    inserirNoInicio: 'Inserção no início',
    inserirNoFim: 'Inserção no final',
    removerNoInicio: 'Remoção no início',
    removerNoFim: 'Remoção no final'
  };
  Object.keys(LIST_OP_NAMES).forEach(function (k) { OP_NAMES[k] = LIST_OP_NAMES[k]; });

  /* operações do array com tamanho manual (MeuArray da aula): alimentam o
   * nome da operação na faixa de explicação, sempre com a nomenclatura do
   * código de referência */
  var ARRAY_OP_NAMES = {
    adicionar: 'Inserção no final',
    editar: 'Edição',
    obterElemento: 'Acesso por índice',
    obterIndice: 'Busca',
    tamanhoArray: 'Tamanho',
    limpar: 'Limpeza',
    toString: 'Representação',
    itemsDuplicados: 'Busca de ocorrências',
    inserirEm: 'Inserção em posição',
    removerPorIndice: 'Remoção em posição',
    removerPorValor: 'Remoção por valor'
  };
  Object.keys(ARRAY_OP_NAMES).forEach(function (k) { OP_NAMES[k] = ARRAY_OP_NAMES[k]; });

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
    if (/\.insert(No|Node)?\s*\(/.test(line)) return 'Inserção';
    if (/\.remover\s*\(/.test(line)) return 'Remoção';
    if (/\.remove(No|Node)?\s*\(/.test(line)) return 'Remoção';
    if (/\.buscar\s*\(/.test(line)) return 'Busca';
    if (/\.search(No|Node)?\s*\(/.test(line)) return 'Busca';
    if (/preOrdem\s*\(/.test(line)) return 'Percurso pré-ordem';
    if (/emOrdem\s*\(/.test(line)) return 'Percurso em ordem';
    if (/posOrdem\s*\(/.test(line)) return 'Percurso pós-ordem';
    if (/preOrderTraverse\s*\(/.test(line)) return 'Percurso pré-ordem';
    if (/inOrderTraverse\s*\(/.test(line)) return 'Percurso em ordem';
    if (/postOrderTraverse\s*\(/.test(line)) return 'Percurso pós-ordem';
    if (/\.limpar\s*\(/.test(line)) return 'Limpeza';
    if (/\.estaVazia\s*\(/.test(line)) return 'Verificação';
    if (/\.enqueue\s*\(/.test(line)) return 'Enfileiramento';
    if (/\.dequeue\s*\(/.test(line)) return 'Desenfileiramento';
    if (/\.front\s*\(/.test(line)) return 'Consulta à frente';
    /* lista com nós (nomes clássicos de sala) */
    if (/\.inserirNoInicio\s*\(/.test(line)) return 'Inserção no início';
    if (/\.inserirNoFim\s*\(/.test(line)) return 'Inserção no final';
    if (/\.removerNoInicio\s*\(/.test(line)) return 'Remoção no início';
    if (/\.removerNoFim\s*\(/.test(line)) return 'Remoção no final';
    if (/\.percorrer\s*\(/.test(line)) return 'Percurso';
    /* chamadas da lista simplesmente encadeada (o passo da chamada já
     * rodou a operação; a pilha não tem mais o frame do método) */
    if (/\.insertAtBeginning\s*\(/.test(line)) return 'Inserção no início';
    if (/\.insertAtEnd\s*\(/.test(line)) return 'Inserção no final';
    if (/\.removeByValue\s*\(/.test(line)) return 'Remoção';
    if (/\.find\s*\(/.test(line)) return 'Busca';
    if (/\.size\s*\(/.test(line)) return 'Tamanho';
    if (/\.isEmpty\s*\(/.test(line)) return 'Verificação';
    if (/\.toString\s*\(/.test(line)) return 'Representação';
    /* chamadas da lista duplamente encadeada */
    if (/\.prepend\s*\(/.test(line)) return 'Inserção no início';
    if (/\.append\s*\(/.test(line)) return 'Inserção no final';
    if (/\.insertAt\s*\(/.test(line)) return 'Inserção em posição';
    if (/\.removeFirst\s*\(/.test(line)) return 'Remoção no início';
    if (/\.removeLast\s*\(/.test(line)) return 'Remoção no final';
    if (/\.removeAt\s*\(/.test(line)) return 'Remoção em posição';
    if (/\.indexOf\s*\(/.test(line)) return 'Busca';
    if (/\.transverseReverse\s*\(/.test(line)) return 'Percurso reverso';
    if (/\.transverse\s*\(/.test(line)) return 'Percurso';
    /* chamadas do array (MeuArray) quando o frame já retornou */
    if (/\.adicionar\s*\(/.test(line)) return 'Inserção no final';
    if (/\.inserirEm\s*\(/.test(line)) return 'Inserção em posição';
    if (/\.editar\s*\(/.test(line)) return 'Edição';
    if (/\.obterElemento\s*\(/.test(line)) return 'Acesso por índice';
    if (/\.obterIndice\s*\(/.test(line)) return 'Busca';
    if (/\.removerPorIndice\s*\(/.test(line)) return 'Remoção em posição';
    if (/\.removerPorValor\s*\(/.test(line)) return 'Remoção por valor';
    if (/\.itemsDuplicados\s*\(/.test(line)) return 'Busca de ocorrências';
    if (/\.remover\s*\(/.test(line)) return 'Remoção';
    if (/\.tamanhoArray\s*\(/.test(line)) return 'Tamanho';
    if (/\.limpar\s*\(/.test(line)) return 'Limpeza';
    if (/\.toString\s*\(/.test(line)) return 'Representação';
    if (/console\.log/.test(line)) return 'Saída';
    return 'Execução';
  }

  /* variável que recebe a chamada na linha (ex.: "lista" em "lista.append(10)");
   * só devolve quando o método é da mesma operação reconhecida */
  function receiverOfLine(lineText, op) {
    var rx = /([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
    var m;
    while ((m = rx.exec(lineText))) {
      if (OP_NAMES[m[2]] === op) return m[1];
    }
    return null;
  }

  /**
   * Comandos (operações) da execução, na ordem real dos passos:
   *  - eventos nativos de array (push/pop/shift/...), como antes;
   *  - uma entrada por chamada de operação reconhecida (BST, listas, fila com
   *    índices, MeuArray…), com o nome da operação e o receptor quando há.
   * Métodos que já produzem eventos nativos (pilha/fila por array) não geram
   * entrada duplicada. O app filtra os eventos pela estrutura selecionada.
   * Devolve [{ step, text, kind, targetId }].
   */
  DSV.buildCommands = function (steps, source) {
    steps = steps || [];
    var src = String(source || '').split('\n');
    var out = [];
    var i, s, e;

    /* 1ª passada: execuções de métodos de operação (runs) e se elas já têm
     * eventos nativos no mesmo run (aí o evento sozinho representa o comando) */
    var runAt = Object.create(null);
    var runs = [];
    var run = null;
    for (i = 0; i < steps.length; i++) {
      s = steps[i];
      var frame = opFrameName(s.stack);
      if (!frame) { run = null; continue; }
      if (!run || run.op !== frame) {
        run = { start: i, op: frame, hasEvents: false };
        runs.push(run);
      }
      runAt[i] = run;
      if (s.events && s.events.length) run.hasEvents = true;
    }

    /* 2ª passada: monta as entradas na ordem dos passos */
    var covered = false; /* a chamada já gerou uma entrada no passo anterior */
    for (i = 0; i < steps.length; i++) {
      s = steps[i];
      var si = s.i != null ? s.i : i;
      var evs = s.events || [];
      for (e = 0; e < evs.length; e++) {
        out.push({
          step: si,
          text: evs[e].text,
          kind: 'event',
          targetId: evs[e].targetId == null ? null : evs[e].targetId
        });
      }
      var frame2 = opFrameName(s.stack);
      if (frame2) {
        var r = runAt[i];
        if (r && r.start === i) {
          if (!r.hasEvents && !covered) {
            out.push({ step: si, text: OP_NAMES[frame2], kind: 'op', targetId: null, op: OP_NAMES[frame2], frame: true });
          }
          covered = false;
        }
        continue;
      }
      var lineText = src[s.line - 1] ? src[s.line - 1].trim() : '';
      var op = opNameFrom(s, lineText);
      if (op !== 'Execução' && op !== 'Saída') {
        var receiver = receiverOfLine(lineText, op);
        out.push({
          step: si,
          text: receiver ? receiver + ' · ' + op : op,
          kind: 'op',
          targetId: null,
          op: op,
          frame: false
        });
        covered = true;
      } else {
        covered = false;
      }
    }

    /* o passo da chamada é gravado DEPOIS do corpo do método: a primeira
     * execução de um método reconhecido cria uma entrada sem receptor e a
     * chamada cria outra. As duas descrevem a mesma operação — junta na
     * entrada com receptor (a mais descritiva). */
    var merged = [];
    for (var k = 0; k < out.length; k++) {
      var cur = out[k];
      if (cur.kind === 'op' && !cur.frame) {
        for (var j = merged.length - 1; j >= 0; j--) {
          var prev = merged[j];
          if (prev.kind !== 'op') continue;
          if (prev.frame && prev.op === cur.op) merged.splice(j, 1);
          break;
        }
      }
      merged.push(cur);
    }
    return merged;
  };

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

  /* valor numérico de um nó serializado (null quando não é número) */
  function numericOf(entry) {
    if (!entry || !entry.ser) return null;
    var p = propOf(entry.ser, NODE_VALUE);
    if (p && p.value && p.value.t === 'p' && typeof p.value.v === 'number') return p.value.v;
    return null;
  }

  /* número que a operação manipula: variável local típica (value/valor/alvo)
   * ou o valor de um nó que ainda não faz parte da árvore (newNode/novo) */
  function frameNumber(step, names, cur) {
    var scopes = [step.locals, step.globals];
    var s, i, map, sv;
    for (s = 0; s < scopes.length; s++) {
      map = scopes[s] || {};
      for (i = 0; i < names.length; i++) {
        sv = map[names[i]];
        if (sv && sv.t === 'p' && typeof sv.v === 'number') return sv.v;
      }
    }
    for (s = 0; s < scopes.length; s++) {
      map = scopes[s] || {};
      var keys = Object.keys(map);
      for (i = 0; i < keys.length; i++) {
        sv = map[keys[i]];
        if (!isTreeNode(sv)) continue;
        if (cur && sv.id != null && cur[sv.id]) continue; /* já está na árvore */
        var num = numericOf({ ser: sv });
        if (num != null) return num;
      }
    }
    return null;
  }

  function stackHas(step, name) {
    var stack = (step && step.stack) || [];
    for (var i = 0; i < stack.length; i++) {
      if (String(stack[i].name || '').replace(/^#/, '') === name) return true;
    }
    return false;
  }

  /* frase para a árvore: compara o passo com o anterior e o próximo —
   * inserção, remoção, promoção, vaga da inserção, nó visitado */
  function treeExplanation(step, sel, opts, op) {
    var lineText = (opts && opts.lineText) || '';
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
      var replaced = curIds.filter(function (id) { return prev[id] && prev[id].val !== cur[id].val; });

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
      /* remoção com dois filhos: o nó permanece, mas o valor dá lugar ao
       * menor da subárvore direita (o sucessor) */
      if (replaced.length) {
        var rp = cur[replaced[0]];
        return 'O valor ' + prev[replaced[0]].val + ' foi substituído por ' + rp.val +
          ', o menor da subárvore direita; a ocorrência duplicada será removida em seguida.';
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
            var cNum = numericOf(na);
            var pInfo = cur[na.parentId];
            var pNum = pInfo ? numericOf(pInfo) : null;
            var ordered = cNum != null && pNum != null &&
              ((na.side === 'L' && cNum < pNum) || (na.side === 'R' && cNum >= pNum));
            if (ordered) {
              return 'Seguindo a ordem da BST, o valor ' + cNum + ' será inserido como filho ' +
                sideName(na.side) + ' do nó ' + cur[na.parentId].val + '.';
            }
            return 'A busca por níveis encontrou a primeira posição disponível: o filho ' + sideName(na.side) + ' do nó ' + cur[na.parentId].val + '.';
          }
          return 'A próxima alteração será no filho ' + sideName(na.side) + ' do nó ' + cur[na.parentId].val + '.';
        }
      }
    }

    /* busca que chegou a uma referência null */
    if (op === 'Busca' && /return\s+false/.test(lineText)) {
      return 'O valor não está na árvore — a busca chegou a uma referência null.';
    }
    if (op === 'Remoção' && /return\s+null/.test(lineText)) {
      return 'O valor não está na árvore; nada foi removido.';
    }

    var aid = activeNodeId(step.pointers || {});
    if (aid != null && cur[aid]) {
      var nodeNum = numericOf(cur[aid]);
      if (op === 'Busca') {
        var target = frameNumber(step, ['value', 'valor', 'alvo', 'target', 'procurado'], cur);
        if (target != null && nodeNum != null && /(?:value|valor)/.test(lineText)) {
          if (target === nodeNum) return 'Encontrei o nó ' + nodeNum + ': o valor procurado é igual ao valor do nó.';
          if (target < nodeNum) return 'No nó ' + nodeNum + ': ' + target + ' < ' + nodeNum + ' — a busca segue para a esquerda.';
          return 'No nó ' + nodeNum + ': ' + target + ' > ' + nodeNum + ' — a busca segue para a direita.';
        }
        return 'Comparando o nó ' + cur[aid].val + ' com o valor procurado.';
      }
      if (op === 'Inserção') {
        var ins = frameNumber(step, ['value', 'valor', 'novoValor', 'newValue'], cur);
        if (ins != null && nodeNum != null && /(?:value|valor)\s*(?:<|>|<=|>=)/.test(lineText)) {
          if (ins < nodeNum) return 'Comparando: ' + ins + ' < ' + nodeNum + ' — a inserção desce para o filho esquerdo.';
          return 'Comparando: ' + ins + ' >= ' + nodeNum + ' — a inserção desce para o filho direito.';
        }
        return 'Visitando o nó ' + cur[aid].val + '.';
      }
      if (op === 'Remoção' && stackHas(step, 'findMinNode')) {
        return 'Procurando o menor valor da subárvore direita (o sucessor do nó removido).';
      }
      return 'Visitando o nó ' + cur[aid].val + '.';
    }

    if (op === 'Inserção') {
      var pending = frameNumber(step, ['value', 'valor', 'novoValor', 'newValue'], cur);
      if (pending != null) return 'Inserindo o valor ' + pending + ': a árvore desce comparando os valores até achar a vaga.';
      return 'A busca por níveis procura a primeira posição livre.';
    }
    if (op === 'Remoção') return 'Procurando o nó a ser removido.';
    return 'Sem alterações na árvore neste passo.';
  }

  /* primeiro nó em escopo que ainda não faz parte da lista (inserção em
   * curso, ex.: "const newNode = new Node(...)") */
  function findPendingNode(step, chain, prevChain, inserting) {
    if (!inserting) return null;
    var pending = null;
    Object.keys(step.pointers || {}).forEach(function (idStr) {
      if (pending) return;
      var id = Number(idStr);
      if (chain.ids[id] || prevChain.ids[id]) return;
      var sv = DSV.findValueById(step, id);
      if (isObj(sv) && isListNode(sv)) pending = sv;
    });
    return pending;
  }

  /* frase para a lista: compara o passo com o anterior — criação do nó,
   * ligação das referências (next e prev), mudança de HEAD/TAIL, percurso
   * (nos dois sentidos) e remoção */
  function listExplanation(step, sel, opts, op) {
    var lineText = (opts && opts.lineText) || '';
    var inserting = op === 'Inserção no início' || op === 'Inserção no final' || op === 'Inserção em posição';
    var removing = /^Remoção/.test(op);
    var searching = op === 'Busca';
    var doubly = !!sel.doubly;
    var prevSel = opts && opts.prevStep ? DSV.findListInStep(opts.prevStep, sel) : null;
    var prevRoot = prevSel && prevSel.id != null ? DSV.findValueById(opts.prevStep, prevSel.id) : null;
    var prevChain = isObj(prevRoot) ? listChain(prevRoot, opts && opts.prevStep) : { nodes: [], ids: Object.create(null) };

    if (sel.id == null) {
      var pendEmpty = findPendingNode(step, { ids: Object.create(null) }, prevChain, inserting);
      if (pendEmpty) {
        return 'O novo nó ' + valText(pendEmpty) + ' foi criado; ' +
          (doubly ? 'as referências prev e next ainda não foram ligadas.' : 'a referência next ainda não foi ligada.');
      }
      if (prevChain.nodes.length && removing) {
        return 'O nó ' + valText(prevChain.nodes[0]) + ' foi removido e a lista ficou vazia.';
      }
      if (!prevChain.nodes.length && removing) return 'A lista está vazia; não há nada para remover.';
      if (!prevChain.nodes.length && searching) return 'A lista está vazia; não há nós para procurar.';
      if (inserting) return 'A lista ainda está vazia: HEAD não aponta para nenhum nó.';
      return 'A lista está vazia neste passo.';
    }

    var root = DSV.findValueById(step, sel.id);
    if (!isObj(root)) return null;
    var chain = listChain(root, step);
    var map = Object.create(null);
    chain.nodes.forEach(function (n) { map[n.id] = n; });

    var removed = prevChain.nodes.filter(function (n) { return !chain.ids[n.id]; });
    var changedNode = null;
    var changedPrevNode = null;
    chain.nodes.forEach(function (n) {
      var pn = null;
      for (var i = 0; i < prevChain.nodes.length; i++) {
        if (prevChain.nodes[i].id === n.id) { pn = prevChain.nodes[i]; break; }
      }
      if (!pn) return;
      if (!changedNode && nextRef(pn).id !== nextRef(n).id) changedNode = n;
      if (!changedPrevNode && prevRef(pn).id !== prevRef(n).id) changedPrevNode = n;
    });
    var headChanged = !!(prevSel && prevSel.id !== sel.id);
    var tailChanged = !!(prevSel && prevSel.tailId != null && sel.tailId != null && prevSel.tailId !== sel.tailId);
    var aid = activeNodeId(step.pointers || {});
    var pendingNode = findPendingNode(step, chain, prevChain, inserting);

    /* passo do contador interno (#length++ / #length--) */
    if ((inserting || removing) && /#?(length|tamanho)\s*(\+\+|--|\+=|-=)/.test(lineText)) {
      return 'O tamanho da lista foi atualizado.';
    }

    /* retorno explícito de busca/remoção sem resultado */
    if (/^return\s+(undefined|null|false)\b/.test(lineText)) {
      if (searching) return 'O valor não foi encontrado — a busca chegou ao fim da lista.';
      if (removing) return 'O valor não está na lista; nada foi removido.';
    }

    if (searching) {
      if (aid != null && map[aid]) return 'Comparando o nó ' + valText(map[aid]) + ' com o valor procurado.';
      return 'A busca percorre a lista do início ao fim.';
    }
    if (op === 'Verificação') return chain.nodes.length ? 'A lista não está vazia.' : 'A lista está vazia.';
    if (op === 'Tamanho') {
      return 'O contador da lista registra ' + chain.nodes.length + (chain.nodes.length === 1 ? ' nó.' : ' nós.');
    }
    if (op === 'Representação') return null;
    if (op === 'Percurso' || op === 'Percurso reverso') {
      var reverse = op === 'Percurso reverso';
      if (aid != null && map[aid]) {
        return 'Visitando o nó ' + valText(map[aid]) + (reverse ? ' (seguindo a referência prev).' : '.');
      }
      return reverse
        ? 'O percurso reverso caminha do fim ao início, seguindo as referências prev.'
        : 'O percurso caminha pelos nós do início ao fim.';
    }
    if (inserting) {
      if (pendingNode) {
        var ref = nextRef(pendingNode);
        var backref = prevRef(pendingNode);
        if (op === 'Inserção no início' && ref.id != null && chain.ids[ref.id]) {
          return 'O novo nó ' + valText(pendingNode) + ' já aponta para o antigo início da lista.';
        }
        if (op === 'Inserção em posição' && aid != null && map[aid]) {
          return 'Percorrendo a lista até a posição de inserção.';
        }
        if (op === 'Inserção no final' && ref.id != null && chain.ids[ref.id]) {
          return 'O novo nó ' + valText(pendingNode) + ' está no fim e será ligado ao último nó.';
        }
        if (doubly && backref.id != null && chain.ids[backref.id]) {
          return 'O PREV do novo nó ' + valText(pendingNode) + ' aponta para o nó anterior da lista.';
        }
        if (op === 'Inserção no final' && aid != null && map[aid]) {
          return 'Percorrendo a lista até o último nó.';
        }
        return 'O novo nó ' + valText(pendingNode) + ' foi criado; ' +
          (doubly ? 'as referências prev e next ainda não foram ligadas.' : 'a referência next ainda não foi ligada.');
      }
      if (headChanged && chain.nodes.length) {
        return 'HEAD agora aponta para o nó ' + valText(chain.nodes[0]) + '.';
      }
      if (doubly && tailChanged && sel.tailId != null && map[sel.tailId]) {
        return 'TAIL agora aponta para o nó ' + valText(map[sel.tailId]) + '.';
      }
      if (changedNode) {
        return 'A referência NEXT do nó ' + valText(changedNode) + ' passou a apontar para o novo nó.';
      }
      if (doubly && changedPrevNode) {
        return 'A referência PREV do nó ' + valText(changedPrevNode) + ' foi atualizada.';
      }
      if (aid != null && map[aid]) {
        return op === 'Inserção no final'
          ? 'Percorrendo a lista até o último nó.'
          : 'Ajustando as referências da lista.';
      }
      return 'A lista está sendo atualizada.';
    }
    if (removing) {
      /* o passo que move o TAIL ainda antes de desconectar o nó removido */
      if (tailChanged && !removed.length && sel.tailId != null && map[sel.tailId]) {
        return 'TAIL passou para o nó ' + valText(map[sel.tailId]) + '; o antigo último será desconectado.';
      }
      if (removed.length) {
        var txt = 'O nó ' + valText(removed[0]) + ' foi removido da lista.';
        if (headChanged && chain.nodes.length) txt += ' HEAD passou para ' + valText(chain.nodes[0]) + '.';
        else if (tailChanged && chain.nodes.length) txt += ' TAIL passou para ' + valText(chain.nodes[chain.nodes.length - 1]) + '.';
        else if (changedNode && nextRef(changedNode).id == null) txt += ' O novo último nó agora termina em undefined.';
        else if (changedNode) txt += ' A referência do nó anterior agora aponta para o sucessor.';
        if (doubly && changedPrevNode && !headChanged) txt += ' O PREV do nó seguinte foi atualizado.';
        return txt;
      }
      if (aid != null && map[aid]) return 'Comparando o próximo nó com o valor procurado antes de remover.';
      return 'A remoção percorre a lista à procura do valor.';
    }
    return null;
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
    } else if (sel && sel.type === 'list') {
      text = listExplanation(step, sel, opts, op);
    } else if (sel && sel.type === 'array') {
      text = arrayExplanation(step, sel, opts, op);
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

  function renderStack(container, v, sel, ctx) {
    var n = v.items.length;
    var badge = eventsBadge(sel, ctx);
    var keys = itemKeys(v.items);
    var scale = smallScale(n);
    var dur = animDur(ctx);

    DSV.flipRender(container, function () {
      var html = head('Pilha', structureSub(sel, n, 'item', 'itens'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="stack-wrap" style="--stack-scale:' + scale + '">';
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
    var items = v.items;
    var ops = (ctx.opsMap || {})[sel.id] || {};
    /* fila implementada com unshift/pop: a frente fica na outra extremidade */
    var reverse = !!(ops.unshift && ops.pop && !ops.shift);
    /* fila com índices (#inicio/#fim): a fila é só a janela viva [inicio, fim);
     * o resto do array é histórico de posições e fica fora do desenho */
    var win = sel.win || null;
    var from = win ? win.start : 0;
    var to = win ? win.end : items.length;
    /* entre o delete e o #inicio++ o buraco fica na frente: não é elemento */
    while (win && from < to && isNullSer(items[from])) from++;
    var shown = items.slice(from, to);
    var n = shown.length;
    var badge = eventsBadge(sel, ctx);
    /* fila com índices: a identidade da célula é o slot real [i] do array — de onde
     * o elemento entrou. A contagem por valor do itemKeys não serve aqui: com
     * valores duplicados, a janela avançando reindexaria as ocorrências e a
     * animação removeria a ÚLTIMA célula em vez da FRONT. */
    var keys = win
      ? shown.map(function (_, idx) { return 'slot:' + (from + idx); })
      : itemKeys(shown);
    var scale = smallScale(n);
    var dur = animDur(ctx);
    var enterDir = reverse ? 'left' : 'right';
    var exitDir = reverse ? 'right' : 'left';
    var frontIdx = win ? 0 : (reverse ? n - 1 : 0);
    var rearIdx = win ? n - 1 : (reverse ? 0 : n - 1);

    DSV.flipRender(container, function () {
      var html = head('Fila', structureSub(sel, n, 'item', 'itens'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="queue-wrap" style="--queue-scale:' + scale + '">';
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
          html += '<div class="queue-cell' + (isFront ? ' front' : '') + '" title="índice ' + (from + i) + '">' +
            '<span class="cell-val">' + esc(DSV.fmtSerializedShort(shown[i])) + '</span>' +
            '</div>';
          html += '<div class="queue-idx">[' + (from + i) + ']</div>';
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

  /* ------------------------------------------------------------------ */
  /* Lista encadeada: leitura fiel das referências                       */
  /* ------------------------------------------------------------------ */

  /* percorre a lista a partir de um nó na ordem real das referências,
   * guardando os ids (e detectando um ciclo acidental, se existir).
   * Referências serializadas como {t:'ref'} (ciclo real) são resolvidas
   * pelo passo atual para o ciclo continuar sendo detectado. */
  function listChain(root, step) {
    var nodes = [];
    var ids = Object.create(null);
    var cur = root;
    var cycleId = null;
    while (isObj(cur)) {
      if (ids[cur.id]) { cycleId = cur.id; break; }
      ids[cur.id] = true;
      nodes.push(cur);
      var p = propOf(cur, LIST_NEXT);
      var nxt = p ? p.value : null;
      if (nxt && nxt.t === 'ref' && step) nxt = DSV.findValueById(step, nxt.id);
      cur = isObj(nxt) ? nxt : null;
    }
    return { nodes: nodes, ids: ids, cycleId: cycleId };
  }

  /* destino real de uma referência (next/prev): {id, val, node} — id null
   * quando aponta para nada (undefined/null/outro primitivo) */
  function refProp(sv, names) {
    var p = propOf(sv, names);
    if (!p) return { id: null, val: '?', name: null };
    var v = p.value;
    if (isObj(v)) return { id: v.id, val: nodeValue(v), node: v, name: p.name };
    if (v && v.t === 'ref') return { id: v.id, val: '→ nó #' + v.id, name: p.name, ref: true };
    if (isNullSer(v)) return { id: null, val: v.v === undefined ? 'undefined' : 'null', name: p.name };
    return { id: null, val: DSV.fmtSerializedShort(v), name: p.name };
  }

  function nextRef(sv) { return refProp(sv, LIST_NEXT); }
  function prevRef(sv) { return refProp(sv, LIST_PREV); }

  /* operações de inserção da lista (inclui as da lista dupla) */
  function isInsertingOp(op) {
    return op === 'insertAtBeginning' || op === 'insertAtEnd' ||
      op === 'append' || op === 'prepend' || op === 'insertAt';
  }

  /* localiza a mesma lista em outro passo (para comparar as referências e o
   * início anterior quando HEAD muda); casa pelo rótulo e, se necessário,
   * pelo candidato de lista mais bem colocado */
  DSV.findListInStep = function (step, sel) {
    if (!step || !sel || sel.type !== 'list') return null;
    var cands = DSV.detectStructures(step, {}).filter(function (c) { return c.type === 'list'; });
    if (!cands.length) return null;
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].label === sel.label) return cands[i];
    }
    return cands[0];
  };

  /* comparação do passo atual com o anterior: referências alteradas,
   * HEAD alterado e nós recém-criados ainda fora da lista */
  function listStepDiff(sel, ctx, chain) {
    var prevSel = ctx && ctx.prevStep ? DSV.findListInStep(ctx.prevStep, sel) : null;
    var prevRoot = prevSel && prevSel.id != null ? DSV.findValueById(ctx.prevStep, prevSel.id) : null;
    var prevChain = isObj(prevRoot) ? listChain(prevRoot, ctx.prevStep) : { nodes: [], ids: Object.create(null) };
    var prevById = Object.create(null);
    prevChain.nodes.forEach(function (n) { prevById[n.id] = n; });

    var changed = Object.create(null);
    var changedPrev = Object.create(null);
    chain.nodes.forEach(function (n) {
      var pn = prevById[n.id];
      if (!pn) return;
      if (nextRef(pn).id !== nextRef(n).id) changed[n.id] = true;
      if (prevRef(pn).id !== prevRef(n).id) changedPrev[n.id] = true;
    });

    /* nós que existem no escopo, são nós de lista e ainda não fazem parte da
     * lista (ex.: "const newNode = new Node(...)" na inserção). Só durante
     * uma inserção e só se o nó não estava na lista do passo anterior — o
     * construtor e o resumo da chamada já expõem o objeto na serialização,
     * então o critério é a presença na cadeia, não no escopo. */
    var pending = [];
    var pendingChanged = Object.create(null);
    var pendingChangedPrev = Object.create(null);
    var opFrame = ctx && ctx.step ? opFrameName(ctx.step.stack) : null;
    if (ctx && ctx.pointers && isInsertingOp(opFrame)) {
      Object.keys(ctx.pointers).forEach(function (idStr) {
        var id = Number(idStr);
        if (chain.ids[id] || prevChain.ids[id]) return;
        var sv = DSV.findValueById(ctx.step, id);
        if (!isObj(sv) || !isListNode(sv)) return;
        pending.push(sv);
        /* o pendente também troca de referência (ex.: "newNode.next = head"
         * ou "newNode.prev = tail"): compara com o passo anterior para
         * destacar a ligação na hora */
        var prevSv = ctx.prevStep ? DSV.findValueById(ctx.prevStep, id) : null;
        if (isObj(prevSv)) {
          if (nextRef(prevSv).id !== nextRef(sv).id) pendingChanged[id] = true;
          if (prevRef(prevSv).id !== prevRef(sv).id) pendingChangedPrev[id] = true;
        }
      });
    }

    return {
      prevSel: prevSel,
      prevChain: prevChain,
      prevById: prevById,
      changed: changed,
      changedPrev: changedPrev,
      pending: pending,
      pendingChanged: pendingChanged,
      pendingChangedPrev: pendingChangedPrev,
      headChanged: !!(prevSel && prevSel.id !== sel.id),
      tailChanged: !!(prevSel && (prevSel.tailId || null) !== (sel.tailId || null) && sel.tailId != null)
    };
  }

  /* nós que o PRÓXIMO passo vai remover: sinal sutil na etapa em que a
   * comparação os identifica, antes de saírem da lista */
  function listRemovedTargets(sel, ctx, chain) {
    var out = Object.create(null);
    if (!ctx || !ctx.nextStep) return out;
    var nextSel = DSV.findListInStep(ctx.nextStep, sel);
    var nextRoot = nextSel && nextSel.id != null ? DSV.findValueById(ctx.nextStep, nextSel.id) : null;
    var nextChain = isObj(nextRoot) ? listChain(nextRoot, ctx.nextStep) : { nodes: [], ids: Object.create(null) };
    chain.nodes.forEach(function (n) {
      if (!nextChain.ids[n.id]) out[n.id] = true;
    });
    return out;
  }

  /* lado do nó pendente: inserções no início entram pela esquerda; as demais
   * aparecem à direita, depois do terminador, até estarem ligadas */
  function pendingSide(step, node, chainIds) {
    var op = opFrameName(step && step.stack);
    if (op === 'prepend' || op === 'insertAtBeginning' || /inicio|beginning/i.test(op || '')) return 'left';
    if (op === 'append' || op === 'insertAtEnd' || /fim|end/i.test(op || '')) return 'right';
    var nx = nextRef(node);
    var pv = prevRef(node);
    var nextLinked = nx.id != null && !!chainIds[nx.id];
    var prevLinked = pv.id != null && !!chainIds[pv.id];
    if (nextLinked && !prevLinked) return 'left';
    return 'right';
  }

  /* transição real do cursor na lista: o nó do passo anterior (mesma
   * operação, mesmo rótulo) aponta para o nó atual — a conexão percorrida
   * fica em destaque, como a seta contextual da árvore. O percurso reverso
   * caminha por prev. */
  var LIST_REVERSE_RX = /reverse|reverso|contrario|contrário/i;
  function listTraversalFrom(ctx, root) {
    if (!ctx || !ctx.steps || ctx.stepIndex == null || ctx.stepIndex <= 0 || !isObj(root)) return null;
    var step = ctx.steps[ctx.stepIndex];
    if (!step) return null;
    var cur = activeNodeInfo(step.pointers || {});
    if (!cur) return null;
    var op = opFrameName(step.stack);
    if (!op || !LIST_OP_NAMES[op]) return null;
    var reverse = LIST_REVERSE_RX.test(op);

    var curFrames = frameNames(step.stack);
    for (var j = ctx.stepIndex - 1; j >= 0; j--) {
      var prev = ctx.steps[j];
      if (opFrameName(prev.stack) !== op) break;
      var info = activeNodeInfo(prev.pointers || {});
      if (!info || info.label !== cur.label || info.id === cur.id) continue;
      if (!framesRelated(frameNames(prev.stack), curFrames)) continue;
      var fromNode = DSV.findValueById(prev, info.id);
      if (!isObj(fromNode) || !isListNode(fromNode)) continue;
      var link = reverse ? prevRef(fromNode).id : nextRef(fromNode).id;
      if (link !== cur.id) continue;
      return { fromId: info.id, toId: cur.id, dir: reverse ? 'prev' : 'next' };
    }
    return null;
  }

  /* seta horizontal entre a região NEXT e o próximo nó (ou o terminador);
   * dir 'back' espelha a seta (a região PREV aponta para o nó anterior).
   * Em um par da lista dupla (aligned), as duas direções usam a mesma haste
   * (x 9..21), uma acima da outra, e só o bico muda de lado — assim as setas
   * ficam alinhadas verticalmente em vez de cruzarem no vão. */
  function listArrowHtml(cls, dir, aligned) {
    var back = dir === 'back';
    var d;
    if (back) d = aligned ? 'M21 7H9M1 7l8-4v8Z' : 'M29 7H9M1 7l8-4v8Z';
    else d = aligned ? 'M9 7H21M29 7l-8-4v8Z' : 'M1 7H21M29 7l-8-4v8Z';
    return '<svg class="list-link' + (back ? ' back' : '') + (cls ? ' ' + cls : '') + '" width="30" height="14" viewBox="0 0 30 14" aria-hidden="true">' +
      '<path class="list-link-shape" d="' + d + '" />' +
      '</svg>';
  }

  /* fim da lista: undefined/null viram um indicador compacto (∅ desenhado,
   * para não depender da fonte), sem a aparência de um nó com VALUE/NEXT;
   * outros primitivos mantêm o valor real da referência */
  function listEndHtml(ref) {
    var isEnd = !ref || ref.val === 'undefined' || ref.val === 'null';
    if (!isEnd) {
      return '<div class="cell list-null" title="fim da lista: a referência next aponta para este valor">' + esc(ref.val) + '</div>';
    }
    var why = ref && ref.val === 'null' ? 'null' : 'undefined';
    return '<span class="list-end" role="img" aria-label="fim da lista (next = ' + why + ')" ' +
      'title="fim da lista: a referência next não aponta para nenhum nó (' + why + ')">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<path d="M7.4 16.6 16.6 7.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '</svg></span>';
  }

  /* unidades dos nós recém-criados que ainda não fazem parte da lista */
  function listPendingUnitsHtml(list, ctx, chain, side, changedMap, opts) {
    opts = opts || {};
    var out = '';
    list.forEach(function (node) {
      var ref = nextRef(node);
      var backRef = prevRef(node);
      var linked = ref.id != null && !!chain.ids[ref.id];
      var backLinked = backRef.id != null && !!chain.ids[backRef.id];
      out += listUnitHtml(node, {
        chips: chipsFor((ctx.pointers || {})[node.id]),
        pending: true,
        isNew: true,
        changedRef: !!(changedMap && changedMap[node.id]),
        changedPrev: !!(opts.changedPrev && opts.changedPrev[node.id]),
        doubly: !!opts.doubly,
        arrow: linked,
        arrowCls: 'new',
        backArrow: backLinked,
        backArrowCls: 'new',
        enterDir: side,
        exitDir: side
      });
    });
    return out;
  }

  /* Métricas do desenho por faixa de tamanho: listas curtas ganham nós e
   * espaçamentos maiores (para ocupar o canvas sem parecerem minúsculas);
   * listas longas mantêm o tamanho-base, que segue legível — a navegação
   * fica por conta do zoom/pan. Determinístico: só depende da contagem de nós. */
  var LIST_TIERS = [
    { max: 2, scale: 1.4 },
    { max: 4, scale: 1.22 },
    { max: 7, scale: 1.08 },
    { max: Infinity, scale: 1 }
  ];

  function listScale(nodeCount) {
    var n = Math.max(1, nodeCount || 0);
    for (var i = 0; i < LIST_TIERS.length; i++) {
      if (n <= LIST_TIERS[i].max) return LIST_TIERS[i].scale;
    }
    return 1;
  }

  /* unidade da lista: chips acima, nó dividido em PREV/VALUE/NEXT (a lista
   * dupla ganha a região PREV) e as setas que saem de cada região; todos os
   * estados são calculados do passo */
  function listUnitHtml(node, opts) {
    var nodeCls = 'list-node';
    if (opts.pending) nodeCls += ' pending';
    if (opts.isNew) nodeCls += ' new';
    if (opts.visited) nodeCls += ' visited';
    if (opts.active) nodeCls += ' active';
    if (opts.target) nodeCls += ' target';
    var title = opts.pending ? 'nó criado, ainda não ligado à lista'
      : opts.target ? 'este nó será removido no próximo passo'
        : '';

    var ptrs = '';
    if (opts.head) {
      ptrs += '<span class="list-head-tag' + (opts.headChanged ? ' changed' : '') + '" title="início da lista (head)">HEAD</span>';
    }
    if (opts.tail) {
      ptrs += '<span class="list-tail-tag' + (opts.tailChanged ? ' changed' : '') + '" title="fim da lista (tail)">TAIL</span>';
    }
    (opts.chips || []).forEach(function (c) {
      ptrs += '<span class="ptr-chip">' + esc(c) + '</span>';
    });
    if (opts.pending) ptrs += '<span class="list-pending-note" title="nó criado que ainda não faz parte da lista">fora da lista</span>';

    var arrows;
    if (opts.doubly) {
      var fwd = opts.arrow === false ? '<span class="list-lane"></span>' : listArrowHtml(opts.arrowCls, null, !!opts.arrowAligned);
      var back = opts.backArrow ? listArrowHtml(opts.backArrowCls, 'back', true) : '<span class="list-lane"></span>';
      arrows = '<div class="list-arrows">' + fwd + back + '</div>';
    } else {
      arrows = opts.arrow === false ? '' : listArrowHtml(opts.arrowCls);
    }

    /* pendente da lista simples ainda não tem setas à direita: a faixa de
     * etiquetas não leva a compensação e fica centralizada no nó criado */
    var ptrsCls = 'list-ptrs' + (!opts.doubly && opts.arrow === false ? ' no-arrows' : '');

    return '<div class="list-unit' + (opts.pending ? ' pending' : '') + '" data-k="n' + node.id + '" data-enter="' + opts.enterDir + '" data-exit="' + opts.exitDir + '">' +
      '<div class="list-node-wrap">' +
      '<div class="' + ptrsCls + '">' + ptrs + '</div>' +
      '<div class="list-box-row">' +
      '<div class="' + nodeCls + '"' + (title ? ' title="' + title + '"' : '') + '>' +
      (opts.doubly ? '<span class="list-prev' + (opts.changedPrev ? ' changed' : '') + '" title="referência para o nó anterior (node.prev)">PREV<span class="list-prev-dot"></span></span>' : '') +
      '<span class="list-value">' + esc(nodeValue(node)) + '</span>' +
      '<span class="list-next' + (opts.changedRef ? ' changed' : '') + '" title="referência para o próximo nó (node.next)">NEXT<span class="list-next-dot"></span></span>' +
      '</div>' +
      arrows +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function renderList(container, v, sel, ctx) {
    ctx = ctx || {};
    var chain = listChain(v, ctx.step);
    var nodes = chain.nodes;
    var diff = listStepDiff(sel, ctx, chain);
    var visitMap = visitedMapFor(ctx, ctx.step);
    var activeId = activeNodeId(ctx.pointers || {});
    var traversed = listTraversalFrom(ctx, v);
    var willRemove = listRemovedTargets(sel, ctx, chain);
    var badge = eventsBadge(sel, ctx);
    var dur = animDur(ctx);
    var scale = listScale(nodes.length);
    var doubly = !!sel.doubly;
    var terminador = nodes.length ? nextRef(nodes[nodes.length - 1]) : { val: 'null' };

    var pendingLeft = [];
    var pendingRight = [];
    var pendingOpts = { doubly: doubly, changedPrev: diff.pendingChangedPrev };
    diff.pending.forEach(function (sv) {
      (pendingSide(ctx.step, sv, chain.ids) === 'left' ? pendingLeft : pendingRight).push(sv);
    });

    DSV.flipRender(container, function () {
      var html = head(doubly ? 'Lista duplamente encadeada' : 'Lista encadeada',
        structureSub(sel, nodes.length, 'nó', 'nós', doubly ? 'Lista duplamente encadeada' : 'Lista encadeada'), badge);
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="list-wrap" style="--list-scale:' + scale + '">';

      html += listPendingUnitsHtml(pendingLeft, ctx, chain, 'left', diff.pendingChanged, pendingOpts);

      /* ponta inicial da lista dupla: PREV do primeiro nó aponta para ∅ */
      if (doubly && nodes.length && prevRef(nodes[0]).id == null) {
        html += '<div class="list-unit" data-k="null-start"><div class="list-node-wrap"><div class="list-ptrs"></div>' +
          '<div class="list-box-row">' + listEndHtml(prevRef(nodes[0])) + listArrowHtml('start', 'back') + '</div></div></div>';
      }

      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        var next = nodes[i + 1] || null;
        var isActive = activeId === node.id;
        var changedRef = !!diff.changed[node.id];
        var changedPrev = !!diff.changedPrev[node.id];
        var fwdDraw;
        var fwdCls = '';
        var backDraw = false;
        var backCls = '';
        if (doubly) {
          fwdDraw = next ? nextRef(node).id === next.id : nextRef(node).id == null;
          if (fwdDraw) {
            if (traversed && traversed.dir === 'next' && traversed.fromId === node.id) fwdCls = 'active';
            else if (changedRef) fwdCls = 'new';
          }
          if (next && prevRef(next).id === node.id) {
            backDraw = true;
            if (traversed && traversed.dir === 'prev' && traversed.fromId === next.id && traversed.toId === node.id) backCls = 'active';
            else if (diff.changedPrev[next.id]) backCls = 'new';
          }
        } else {
          fwdDraw = true;
          if (traversed && traversed.fromId === node.id) fwdCls = 'active';
          else if (changedRef) fwdCls = 'new';
        }
        html += listUnitHtml(node, {
          chips: chipsFor((ctx.pointers || {})[node.id]),
          isNew: !diff.prevChain.ids[node.id],
          visited: !!visitMap[node.id] && !isActive,
          active: isActive,
          target: !!willRemove[node.id],
          changedRef: changedRef,
          changedPrev: changedPrev,
          doubly: doubly,
          arrow: fwdDraw,
          arrowCls: fwdCls,
          arrowAligned: doubly && !!next && backDraw,
          backArrow: backDraw,
          backArrowCls: backCls,
          head: i === 0,
          headChanged: i === 0 && diff.headChanged,
          tail: !!(sel.tailId != null && sel.tailId === node.id),
          tailChanged: !!(sel.tailId != null && sel.tailId === node.id && diff.tailChanged),
          enterDir: i === 0 ? 'left' : 'right',
          exitDir: i === 0 ? 'left' : 'right'
        });
      }

      if (chain.cycleId != null) {
        html += '<div class="list-unit" data-k="cycle"><div class="list-node-wrap"><div class="list-ptrs"></div>' +
          '<div class="list-box-row"><div class="cell list-null cycle" title="a lista voltou para um nó já visitado">↩ nó #' + chain.cycleId + ' (ciclo)</div></div></div></div>';
      } else {
        html += '<div class="list-unit" data-k="null"><div class="list-node-wrap"><div class="list-ptrs"></div>' +
          '<div class="list-box-row">' + listEndHtml(terminador) + '</div></div></div>';
      }

      html += listPendingUnitsHtml(pendingRight, ctx, chain, 'right', diff.pendingChanged, pendingOpts);

      html += '</div>';
      html += '</div>';
      html += '</div>';
      container.innerHTML = html;
    }, dur);
  }

  /* lista vazia: HEAD não aponta para nenhum nó — diagrama mínimo com o
   * terminador, sem inventar um nó com valor; o nó recém-criado da inserção
   * em curso aparece fora da lista até ser ligado */
  function renderListEmpty(container, sel, ctx) {
    ctx = ctx || {};
    var wrapper = sel.holderId != null ? DSV.findValueById(ctx.step, sel.holderId) : null;
    var headP = wrapper ? propOf(wrapper, HEAD_KEYS) : null;
    var sentinel = 'null';
    if (headP && isNullSer(headP.value)) sentinel = headP.value.v === undefined ? 'undefined' : 'null';
    var doubly = !!sel.doubly;
    var tailSentinel = 'null';
    if (doubly) {
      var tailP = wrapper ? propOf(wrapper, TAIL_KEYS) : null;
      if (tailP && isNullSer(tailP.value)) tailSentinel = tailP.value.v === undefined ? 'undefined' : 'null';
    }

    var emptyChain = { nodes: [], ids: Object.create(null) };
    var diff = listStepDiff(sel, ctx, emptyChain);
    var pendingLeft = [];
    var pendingRight = [];
    var pendingOpts = { doubly: doubly, changedPrev: diff.pendingChangedPrev };
    diff.pending.forEach(function (sv) {
      (pendingSide(ctx.step, sv, emptyChain.ids) === 'left' ? pendingLeft : pendingRight).push(sv);
    });

    container.__treeScene = null;
    DSV.flipRender(container, function () {
      var html = head(doubly ? 'Lista duplamente encadeada' : 'Lista encadeada',
        structureSub(sel, 0, 'nó', 'nós', doubly ? 'Lista duplamente encadeada' : 'Lista encadeada'), eventsBadge(sel, ctx));
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="list-wrap" style="--list-scale:' + listScale(0) + '">';
      html += listPendingUnitsHtml(pendingLeft, ctx, emptyChain, 'left', diff.pendingChanged, pendingOpts);
      html += '<div class="list-unit" data-k="head-empty"><div class="list-node-wrap"><div class="list-ptrs"></div>' +
        '<div class="list-box-row"><span class="list-head-tag" title="início da lista (head)">HEAD</span>' +
        listArrowHtml('start') +
        listEndHtml({ val: sentinel });
      if (doubly) {
        html += listArrowHtml('start', 'back') + '<span class="list-tail-tag" title="fim da lista (tail)">TAIL</span>';
      }
      html += '</div></div></div>';
      html += listPendingUnitsHtml(pendingRight, ctx, emptyChain, 'right', diff.pendingChanged, pendingOpts);
      html += '</div>';
      html += '<div class="empty-inline list-empty-note">A lista está vazia neste passo.</div>';
      html += '</div></div>';
      container.innerHTML = html;
    }, animDur(ctx));
  }

  /* ------------------------------------------------------------------ */
  /* Array com tamanho manual (MeuArray): leitura fiel de #items/#tamanho */
  /* ------------------------------------------------------------------ */

  /* o array interno e o tamanho lógico atuais do wrapper (sel.id aponta
   * para o wrapper, cuja identidade sobrevive ao limpar()) */
  function arrayItemsOf(wrapper, sel) {
    if (!isObj(wrapper)) return null;
    var p = sel && sel.itemsProp ? propOf(wrapper, [sel.itemsProp]) : null;
    if (!p || !isArr(p.value)) p = arrayProp(wrapper);
    return p && isArr(p.value) ? p.value : null;
  }

  function arraySizeOf(wrapper, sel, items) {
    var p = sel && sel.sizeProp ? propOf(wrapper, [sel.sizeProp]) : null;
    if (!p) p = propOf(wrapper, ARRAY_SIZE_KEYS);
    if (p && p.value && p.value.t === 'p' && typeof p.value.v === 'number') return p.value.v;
    return items ? items.items.length : 0;
  }

  /* wrapper + array interno + tamanho de um passo (null quando não existe) */
  function arrayStateOf(step, sel) {
    if (!step || !sel || sel.type !== 'array' || sel.id == null) return null;
    var wrapper = DSV.findValueById(step, sel.id);
    if (!isObj(wrapper)) return null;
    var items = arrayItemsOf(wrapper, sel);
    return { wrapper: wrapper, items: items, size: arraySizeOf(wrapper, sel, items) };
  }

  /* identidade serializada de um item/posição: buraco ≠ undefined ≠ null,
   * e valores repetidos continuam iguais (só a posição muda) */
  function serKey(sv) {
    if (!sv) return 'x';
    if (sv.hole) return 'hole';
    if (sv.t === 'p') {
      if (sv.v === undefined) return 'p:u';
      if (sv.v === null) return 'p:n';
      return 'p:' + typeof sv.v + ':' + String(sv.v);
    }
    if (sv.t === 'a' || sv.t === 'o') return sv.t + ':' + sv.id;
    if (sv.t === 'fn') return 'fn:' + sv.name;
    if (sv.t === 'ref') return 'ref:' + sv.id;
    return sv.t;
  }

  function arrayItemAt(items, i) {
    if (!items || i < 0 || i >= items.items.length) return null;
    return items.items[i];
  }

  /* expressão de índice simples: i, i - 1, i + 1, this.#tamanho, 0... */
  function evalIndexExpr(expr, step) {
    var s = String(expr == null ? '' : expr).trim();
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    var m = /^([A-Za-z_$#][\w$]*(?:\.[A-Za-z_$#][\w$]*)*)\s*([+-])\s*(\d+)$/.exec(s);
    if (m) {
      var base = evalIndexExpr(m[1], step);
      if (base == null) return null;
      return m[2] === '+' ? base + parseInt(m[3], 10) : base - parseInt(m[3], 10);
    }
    if (s.indexOf('this.#') === 0) {
      if (!step.thisVal || !step.thisVal.props) return null;
      var p = step.thisVal.props[s.slice(5)];
      if (p && p.t === 'p' && typeof p.v === 'number') return p.v;
      return null;
    }
    var info = DSV.resolveVariable(step, s);
    if (info && info.sv && info.sv.t === 'p' && typeof info.sv.v === 'number') return info.sv.v;
    return null;
  }

  var KEYWORD_RX = /^(return|delete|const|let|var|typeof|new|in|of|instanceof|void|case|do|else|yield|throw)$/;

  /* o colchete é acesso a índice (algo[...]) e não um literal (a = [1, 2]) */
  function bracketIsIndex(s, pos) {
    var j = pos - 1;
    while (j >= 0 && /\s/.test(s.charAt(j))) j--;
    if (j < 0 || !/[\w$#.\]\)]/.test(s.charAt(j))) return false;
    var st = j;
    while (st >= 0 && /[\w$#.\]\)]/.test(s.charAt(st))) st--;
    var base = s.slice(st + 1, j + 1).replace(/[)\]].*$/, '');
    var last = base.split(/[.\s(]/).pop();
    return !!last && !KEYWORD_RX.test(last);
  }

  /* índices entre colchetes da linha executada: separa escritas (lado
   * esquerdo de uma atribuição ou alvo de delete) de leituras */
  function arrayLineIndices(lineText, step) {
    var out = { writes: [], reads: [] };
    var s = String(lineText || '');
    if (!s) return out;
    var isDelete = /\bdelete\s+/.test(s);
    var eq = -1;
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) !== '=') continue;
      var next = s.charAt(i + 1);
      var prev = s.charAt(i - 1);
      if (next === '=' || next === '>') continue;             /* ==, ===, => */
      if (prev === '=' || prev === '!' || prev === '<' || prev === '>' ||
          prev === '+' || prev === '-' || prev === '*' || prev === '/' || prev === '%') continue;
      eq = i;
      break;
    }
    var rx = /\[([^\[\]]*)\]/g;
    var m;
    while ((m = rx.exec(s))) {
      if (!bracketIsIndex(s, m.index)) continue;
      var val = evalIndexExpr(m[1], step);
      if (val == null || !isFinite(val)) continue;
      var isWrite = isDelete || (eq >= 0 && m.index < eq);
      (isWrite ? out.writes : out.reads).push({ expr: String(m[1]).trim(), index: val });
    }
    return out;
  }

  /* método do MeuArray que está executando agora (frame mais interno),
   * pela nomenclatura da classe de referência */
  function arrayFrameName(step) {
    var stack = (step && step.stack) || [];
    for (var i = stack.length - 1; i >= 0; i--) {
      var n = String(stack[i].name || '').replace(/^#/, '');
      if (ARRAY_OP_NAMES[n]) return n;
    }
    return null;
  }

  var ARRAY_SEARCH_FRAMES = { obterIndice: true, itemsDuplicados: true };

  function arraySearchFrame(step) {
    var stack = (step && step.stack) || [];
    for (var i = stack.length - 1; i >= 0; i--) {
      var n = String(stack[i].name || '').replace(/^#/, '');
      if (ARRAY_SEARCH_FRAMES[n]) return n;
    }
    return null;
  }

  var ARRAY_LOOP_NAMES = ['i', 'j', 'k', 'idx', 'indice', 'índice', 'pos', 'posicao', 'posição', 'index'];

  function arrayNumericLocal(step, names) {
    var scopes = [step.locals, step.globals];
    for (var s = 0; s < scopes.length; s++) {
      var map = scopes[s] || {};
      for (var i = 0; i < names.length; i++) {
        var sv = map[names[i]];
        if (sv && sv.t === 'p' && typeof sv.v === 'number' && isFinite(sv.v)) return Math.trunc(sv.v);
      }
    }
    return null;
  }

  /* valor procurado pelos métodos de busca (elemento/valor/procurado) */
  function arrayTargetValue(step) {
    var names = ['elemento', 'valor', 'alvo', 'target', 'procurado'];
    var scopes = [step.locals, step.globals];
    for (var s = 0; s < scopes.length; s++) {
      var map = scopes[s] || {};
      for (var i = 0; i < names.length; i++) {
        var sv = map[names[i]];
        if (sv && sv.t !== 'fn' && sv.t !== 'c') return sv;
      }
    }
    return null;
  }

  /* foco do passo: posições citadas na linha executada (leitura/escrita),
   * deslocamento de cópia e o índice corrente do laço como reserva */
  function arrayFocus(step, sel, ctx) {
    var focus = {
      here: false,
      writes: [],
      reads: [],
      shift: null,
      line: (ctx && ctx.lineText) || '',
      method: null
    };
    if (!step || !sel) return focus;
    focus.method = arrayFrameName(step);
    focus.here = !!(step.thisVal && step.thisVal.id === sel.id);
    if (!focus.here) return focus;
    if (focus.line) {
      var idx = arrayLineIndices(focus.line, step);
      focus.writes = idx.writes;
      focus.reads = idx.reads;
    }
    /* deslocamento manual: a linha copia de um vizinho (i - 1 ou i + 1)
     * para a posição i — direção definida pelo algoritmo real */
    if ((focus.method === 'inserirEm' || focus.method === 'removerPorIndice') &&
        focus.writes.length && focus.reads.length) {
      var dest = focus.writes[0].index;
      var src = focus.reads[0].index;
      var sameDir = focus.method === 'inserirEm' ? src === dest - 1 : src === dest + 1;
      if (sameDir && dest >= 0 && src >= 0) {
        focus.shift = { dest: dest, src: src, dir: focus.method === 'inserirEm' ? 'right' : 'left' };
      }
    }
    return focus;
  }

  function arrayActiveIndex(step, sel, focus, state) {
    if (!focus.here) return null;
    var idx = focus.writes.length ? focus.writes[0].index
      : focus.reads.length ? focus.reads[0].index : null;
    if (idx == null) {
      var loop = arrayNumericLocal(step, ARRAY_LOOP_NAMES);
      if (loop != null) idx = loop;
    }
    if (idx == null || idx < 0 || !state.items || idx >= state.items.items.length) return null;
    return idx;
  }

  /* índices já examinados pela busca em andamento: percorre o trace para
   * trás dentro do mesmo frame e coleta o `i` real de cada passo (nada é
   * inferido além do que o algoritmo já examinou) */
  function arraySearchVisited(ctx, step, sel, size) {
    var out = Object.create(null);
    var frame = arraySearchFrame(step);
    if (!frame || !ctx || !ctx.steps || ctx.stepIndex == null) return out;
    if (!(step.thisVal && step.thisVal.id === sel.id)) return out;
    /* começa no passo anterior: o índice do passo atual é o "ativo", não
     * uma visita concluída */
    for (var j = ctx.stepIndex - 1; j >= 0; j--) {
      var s = ctx.steps[j];
      if (!s) break;
      var has = false;
      var stack = s.stack || [];
      for (var k = stack.length - 1; k >= 0; k--) {
        if (String(stack[k].name || '').replace(/^#/, '') === frame) { has = true; break; }
      }
      if (!has) break;
      var iv = s.locals && s.locals.i;
      if (iv && iv.t === 'p' && typeof iv.v === 'number' && iv.v >= 0 && iv.v < size) out[iv.v] = true;
    }
    return out;
  }

  /* tudo que o render e a explicação precisam do passo: estados, foco,
   * posições alteradas, visitadas e ocorrências do valor procurado */
  function arrayStepInfo(step, sel, ctx) {
    var state = arrayStateOf(step, sel);
    if (!state) return null;
    var prevState = ctx && ctx.prevStep ? arrayStateOf(ctx.prevStep, sel) : null;
    var focus = arrayFocus(step, sel, ctx);
    var active = arrayActiveIndex(step, sel, focus, state);

    var changed = [];
    if (prevState && prevState.items && state.items) {
      var cur = state.items.items;
      var old = prevState.items.items;
      var max = Math.max(cur.length, old.length);
      for (var i = 0; i < max; i++) {
        var ck = i < cur.length ? serKey(cur[i]) : null;
        var ok = i < old.length ? serKey(old[i]) : null;
        if (ck !== ok) changed.push(i);
      }
    }

    var searchFrame = arraySearchFrame(step);
    var visited = searchFrame ? arraySearchVisited(ctx, step, sel, state.size) : Object.create(null);
    if (active != null) delete visited[active];
    var matches = Object.create(null);
    /* as ocorrências só valem quando a busca roda na instância visualizada:
     * chamadas internas em outra instância (ex.: posicoesDuplicados.adicionar)
     * não têm o mesmo `elemento` do método externo */
    if (searchFrame && focus.here) {
      var target = arrayTargetValue(step);
      var targetKey = target ? serKey(target) : null;
      if (targetKey != null) {
        Object.keys(visited).forEach(function (k) {
          var it = arrayItemAt(state.items, Number(k));
          if (it && serKey(it) === targetKey) matches[k] = true;
        });
        if (active != null) {
          var act = arrayItemAt(state.items, active);
          if (act && serKey(act) === targetKey) matches[active] = true;
        }
      }
    }

    return {
      state: state,
      prevState: prevState,
      focus: focus,
      active: active,
      changed: changed,
      visited: visited,
      matches: matches,
      searchFrame: searchFrame,
      sizeDelta: prevState ? state.size - prevState.size : 0
    };
  }

  /* frase para o array: acompanha o algoritmo real (escrita, deslocamento,
   * busca e remoção) comparando o passo com o anterior */
  function arrayExplanation(step, sel, opts, op) {
    var lineText = (opts && opts.lineText) || '';
    var info = arrayStepInfo(step, sel, opts);
    if (!info) return 'A estrutura ainda não existe neste passo.';
    var st = info.state;
    var prev = info.prevState;
    var size = st.size;
    var method = info.focus.method;
    var target = arrayTargetValue(step);
    var targetTxt = target ? DSV.fmtSerializedShort(target) : null;
    var itemTxt = function (i) {
      var it = arrayItemAt(st.items, i);
      return it ? DSV.fmtSerializedShort(it) : '?';
    };

    /* validação do índice no início dos métodos */
    if (method && /^if\s*\(/.test(lineText) && /indice/.test(lineText) &&
        !/this\.#items/.test(lineText)) {
      var indice = arrayNumericLocal(step, ['indice', 'índice', 'idx', 'index']);
      if (indice != null) {
        var valid = method === 'inserirEm'
          ? (indice >= 0 && indice <= size)
          : (indice >= 0 && indice < size);
        return valid
          ? 'O índice ' + indice + ' é válido — a operação pode continuar.'
          : 'O índice ' + indice + ' está fora dos limites — a operação devolve undefined sem alterar a estrutura.';
      }
    }

    /* guarda de obterElemento/remover quando a estrutura está vazia */
    if (method && /tamanho\s*===\s*0|#tamanho\s*===\s*0/.test(lineText)) {
      if (method === 'remover') return 'A estrutura está vazia: não há elemento para remover (devolve undefined).';
      return 'A estrutura está vazia (tamanho = 0).';
    }

    /* deslocamento manual de cópia */
    if (info.focus.shift) {
      var sh = info.focus.shift;
      if (sh.dir === 'right') {
        return 'Deslocamento para a direita: a posição ' + sh.dest + ' recebeu o valor da posição ' + sh.src + ', abrindo espaço para a inserção.';
      }
      return 'Deslocamento para a esquerda: a posição ' + sh.dest + ' recebeu o valor da posição ' + sh.src + ', cobrindo a posição removida.';
    }

    /* posição alterada (edição, escrita da inserção, buraco do delete) */
    if (info.changed.length) {
      var ci = info.changed[0];
      var curIt = arrayItemAt(st.items, ci);
      var oldIt = prev ? arrayItemAt(prev.items, ci) : null;
      if (curIt && curIt.hole) {
        return 'A posição ' + ci + ' ficou vazia: o valor ' + (oldIt ? DSV.fmtSerializedShort(oldIt) : '?') +
          ' foi apagado do array interno (o tamanho ainda é ' + size + ').';
      }
      if (curIt) {
        var suffix = ci >= size ? ' (ainda fora do tamanho — o tamanho será ajustado em seguida)' : '';
        return 'A posição ' + ci + ' passou a armazenar ' + DSV.fmtSerializedShort(curIt) + suffix + '.';
      }
    }

    /* tamanho lógico */
    if (info.sizeDelta > 0) {
      return 'O tamanho passou de ' + (size - info.sizeDelta) + ' para ' + size +
        ' — a posição ' + (size - 1) + ' agora faz parte da estrutura.';
    }
    if (info.sizeDelta < 0) {
      if (size === 0 && (!st.items || !st.items.items.length)) {
        return 'A estrutura foi esvaziada: tamanho = 0 e o array interno voltou a ficar vazio.';
      }
      return 'O tamanho passou de ' + (size - info.sizeDelta) + ' para ' + size + '.';
    }

    /* busca: comparação, achado e não achado */
    if (info.searchFrame) {
      if (/indice_encontrado\s*=\s*i/.test(lineText)) {
        return 'O valor ' + targetTxt + ' foi encontrado na posição ' + info.active + '.';
      }
      if (/return\s+indice_encontrado/.test(lineText)) {
        var found = arrayNumericLocal(step, ['indice_encontrado']);
        return found != null && found >= 0
          ? 'Fim da busca: o valor ' + targetTxt + ' está na posição ' + found + '.'
          : 'Fim da busca: o valor ' + targetTxt + ' não está no array (-1).';
      }
      if (/return\s+-1/.test(lineText)) {
        return 'O valor ' + targetTxt + ' não está no array — a busca terminou com -1.';
      }
      if (/\.adicionar\s*\(/.test(lineText) && op === 'Busca de ocorrências') {
        var posAdded = arrayNumericLocal(step, ['elemento', 'i']);
        return 'A posição ' + posAdded + ' do array corresponde ao valor procurado e foi anotada no MeuArray de posições.';
      }
      if (info.active != null) {
        var equal = targetTxt != null && serKey(arrayItemAt(st.items, info.active)) === serKey(target);
        if (/===|==/.test(lineText)) {
          return 'Comparando a posição ' + info.active + ' (valor ' + itemTxt(info.active) + ') com o valor procurado ' +
            targetTxt + (equal ? ' — iguais.' : ' — diferentes.');
        }
        return 'Percorrendo o array em busca de ' + targetTxt + ': posição ' + info.active + '.';
      }
      return 'A busca percorre o array do índice 0 ao tamanho - 1.';
    }

    /* acesso por índice */
    if (method === 'obterElemento') {
      if (info.active != null) {
        var it = arrayItemAt(st.items, info.active);
        if (it && !it.hole) return 'A posição ' + info.active + ' armazena ' + DSV.fmtSerializedShort(it) + '.';
        return 'A posição ' + info.active + ' está vazia (buraco do delete).';
      }
      return 'O acesso consulta a posição indicada.';
    }

    /* operações de resultado simples */
    if (method === 'tamanhoArray' || op === 'Tamanho') {
      return 'O tamanho lógico é ' + size + '.';
    }
    if (method === 'toString' || op === 'Representação') {
      return 'A representação imprime o array interno na saída.';
    }
    if (/return\s+undefined/.test(lineText)) {
      if (op === 'Remoção por valor' || /removerPorValor/.test(lineText)) {
        return 'O valor ' + targetTxt + ' não está no array; nada foi removido.';
      }
      return 'A operação termina sem alterar a estrutura.';
    }
    if (method === 'limpar' || op === 'Limpeza') {
      if (size === 0 && (!st.items || !st.items.items.length)) {
        return 'A estrutura está vazia: tamanho = 0 e o array interno sem posições.';
      }
      return 'Limpando: o array interno é substituído por um novo e o tamanho volta a 0.';
    }
    return null;
  }

  /* escala do desenho por faixa de tamanho: arrays curtos ganham células
   * maiores; longos mantêm o tamanho-base, navegados por zoom/pan */
  var ARRAY_TIERS = [
    { max: 3, scale: 1.35 },
    { max: 5, scale: 1.2 },
    { max: 8, scale: 1.08 },
    { max: Infinity, scale: 1 }
  ];

  function arrayScale(cellCount) {
    var n = Math.max(1, cellCount || 0);
    for (var i = 0; i < ARRAY_TIERS.length; i++) {
      if (n <= ARRAY_TIERS[i].max) return ARRAY_TIERS[i].scale;
    }
    return 1;
  }

  /* pilha e fila curtas ganham a mesma escala das listas/arrays (para não
   * ficarem "perdidas" no canvas); longas mantêm o tamanho-base por zoom/pan */
  var SMALL_TIERS = [
    { max: 3, scale: 1.35 },
    { max: 5, scale: 1.2 },
    { max: 8, scale: 1.08 },
    { max: Infinity, scale: 1 }
  ];

  function smallScale(count) {
    var n = Math.max(1, count || 0);
    for (var i = 0; i < SMALL_TIERS.length; i++) {
      if (n <= SMALL_TIERS[i].max) return SMALL_TIERS[i].scale;
    }
    return 1;
  }

  function renderArray(container, v, sel, ctx) {
    ctx = ctx || {};
    var state = arrayStateOf(ctx.step, sel);
    if (!state) {
      var fallbackItems = arrayItemsOf(v, sel);
      state = { wrapper: v, items: fallbackItems, size: arraySizeOf(v, sel, fallbackItems) };
    }
    var items = state.items;
    var size = state.size;
    var total = items ? items.items.length : 0;
    var info = arrayStepInfo(ctx.step, sel, ctx);
    var dur = animDur(ctx);
    var scale = arrayScale(total);
    var valKeys = items ? itemKeys(items.items) : [];

    container.__treeScene = null;
    DSV.flipRender(container, function () {
      var html = head('Array (tamanho manual)',
        structureSub(sel, size, 'item', 'itens', 'Tamanho manual'), eventsBadge(sel, ctx));
      html += '<div class="canvas-viewport"><div class="canvas-stage">';
      html += '<div class="array-wrap" style="--array-scale:' + scale + '">';
      if (!total) {
        html += '<div class="empty-inline">A estrutura está vazia (tamanho = 0).</div>';
      } else {
        html += '<div class="array-board">';
        var i, j;
        html += '<div class="array-idx-row">';
        for (i = 0; i < total; i++) {
          var idxCls = 'array-idx' + (i >= size ? ' beyond' : '') + (i === size && size < total ? ' at-boundary' : '');
          html += '<div class="' + idxCls + '" data-k="aix-' + i + '">' + i + '</div>';
        }
        html += '</div>';
        html += '<div class="array-cells-row">';
        for (j = 0; j < total; j++) {
          var item = items.items[j];
          var cls = 'array-cell';
          if (j >= size) cls += ' beyond';
          if (j === size && size < total) cls += ' at-boundary';
          if (!item || item.hole) cls += ' hole';
          if (info) {
            if (j === info.active) cls += ' active';
            if (info.matches[j]) cls += ' match';
            else if (info.visited[j]) cls += ' visited';
            if (info.changed.indexOf(j) >= 0) cls += ' changed';
            if (info.focus.shift && info.focus.shift.src === j) cls += ' shift-src';
            if (info.focus.shift && info.focus.shift.dest === j) cls += ' shift-dst';
          }
          var title = 'índice ' + j;
          if (j >= size) title += ' — fora do tamanho lógico (' + size + ')';
          if (!item || item.hole) title += ' — posição vazia: o delete apagou o índice';
          html += '<div class="' + cls + '" data-k="acell-' + j + '" data-enter="right" data-exit="right" title="' + esc(title) + '">';
          if (info && info.focus.shift && info.focus.shift.dest === j) {
            var sh = info.focus.shift;
            var flag = sh.dir === 'right'
              ? '← valor de [' + sh.src + ']'
              : 'valor de [' + sh.src + '] →';
            var flagTitle = sh.dir === 'right'
              ? 'deslocamento para a direita: copiado de [' + sh.src + ']'
              : 'deslocamento para a esquerda: copiado de [' + sh.src + ']';
            html += '<span class="array-shift-flag" title="' + esc(flagTitle) + '">' + esc(flag) + '</span>';
          }
          if (item && !item.hole) {
            html += '<span class="array-val" data-k="' + esc('aval-' + valKeys[j]) + '">' +
              esc(DSV.fmtSerializedShort(item)) + '</span>';
          }
          html += '</div>';
        }
        html += '</div>';
        html += '<div class="array-size-row">';
        html += '<span class="array-size-tag" title="quantidade lógica de elementos (this.#tamanho)">tamanho = ' + size + '</span>';
        if (total !== size) {
          html += '<span class="array-internal" title="o array interno (#items) tem ' + total + ' posições; as que estão fora do tamanho lógico aparecem tracejadas">' +
            '#items.length = ' + total + '</span>';
        }
        html += '</div>';
        html += '</div>';
      }
      html += '</div></div></div>';
      container.innerHTML = html;
    }, dur);
  }

  /* ------------------------------------------------------------------ */
  /* Árvore: geometria compartilhada (em-ordem × profundidade)           */
  /* ------------------------------------------------------------------ */

  /* Métricas do desenho por faixa de tamanho: árvores pequenas ganham nós
   * e espaçamentos maiores (para ocupar o canvas sem parecerem minúsculas);
   * árvores grandes mantêm o tamanho-base, que segue legível — a navegação
   * fica por conta do zoom/pan. Determinístico: só depende da contagem de nós. */
  var TREE_TIERS = [
    { max: 2, r: 29, hgap: 108, vgap: 100 },
    { max: 7, r: 27, hgap: 96, vgap: 96 },
    { max: 15, r: 25, hgap: 88, vgap: 92 },
    { max: 31, r: 23, hgap: 80, vgap: 88 },
    { max: Infinity, r: 23, hgap: 76, vgap: 84 }
  ];

  function treeMetrics(nodeCount) {
    var n = Math.max(1, nodeCount || 1);
    for (var i = 0; i < TREE_TIERS.length; i++) {
      if (n <= TREE_TIERS[i].max) {
        var t = TREE_TIERS[i];
        return { r: t.r, hgap: t.hgap, vgap: t.vgap };
      }
    }
    return { r: 23, hgap: 76, vgap: 84 };
  }

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

  /* posições centralizadas: a caixa real da árvore (nós + margem) fica no
   * meio do palco, com a mesma folga nas quatro bordas — a folga acompanha
   * o raio do nó, então nada encosta na borda em nenhuma faixa de tamanho */
  function treePositions(layout) {
    var m = treeMetrics(layout.nodes.length);
    var pad = Math.max(48, m.r + 24);
    var count = layout.nodes.length;
    var width = 2 * pad + 2 * m.r + Math.max(0, count - 1) * m.hgap;
    var height = 2 * pad + 2 * m.r + layout.maxDepth * m.vgap;
    var pos = Object.create(null);
    layout.nodes.forEach(function (n) {
      pos[n.ser.id] = {
        x: pad + m.r + n.x * m.hgap,
        y: pad + m.r + n.depth * m.vgap
      };
    });
    return { pos: pos, width: width, height: height, r: m.r, hgap: m.hgap, vgap: m.vgap };
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

  /* conexões que mudaram em relação a outro passo: filho cujo pai é
   * diferente (novo ou promovido). Serve só para o destaque da aresta —
   * como é recalculado a cada render, o realce dura exatamente a etapa e
   * sobrevive a zoom, pan e re-renderizações; ao retroceder, some sozinho. */
  DSV.treeChangedEdges = function (prevRoot, root) {
    var changed = Object.create(null);
    if (!isObj(root)) return changed;
    var prevParent = null;
    if (isObj(prevRoot)) {
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
    (function walk(n) {
      if (!isObj(n)) return;
      var L = nodeChild(n, 'L');
      var R = nodeChild(n, 'R');
      if (L) { changed[L.id] = prevParent ? prevParent[L.id] !== n.id : true; walk(L); }
      if (R) { changed[R.id] = prevParent ? prevParent[R.id] !== n.id : true; walk(R); }
    })(root);
    return changed;
  };

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
  function valText(node) {
    var s = nodeValue(node);
    if (s.length > 1 && s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') return s.slice(1, -1);
    return s;
  }

  /* mapa id -> {valor, pai, lado} da árvore serializada */
  function treeInfo(root) {
    var info = Object.create(null);
    (function walk(n, parentId, side) {
      if (!isObj(n) || info[n.id]) return;
      info[n.id] = { id: n.id, val: valText(n), parentId: parentId, side: side, ser: n };
      walk(nodeChild(n, 'L'), n.id, 'L');
      walk(nodeChild(n, 'R'), n.id, 'R');
    })(root, null, null);
    return info;
  }

  /* nós que acabaram de entrar na árvore (primeira aparição), para o
   * destaque discreto do novo nó na inserção; recalculado por passo, sem
   * temporizador nem estado paralelo */
  DSV.treeAddedNodes = function (prevRoot, root) {
    var added = Object.create(null);
    if (!isObj(root)) return added;
    var prevIds = isObj(prevRoot) ? treeIds(prevRoot) : null;
    var ids = treeIds(root);
    Object.keys(ids).forEach(function (id) {
      if (!prevIds || !prevIds[id]) added[id] = true;
    });
    return added;
  };

  /* conexões do estado ATUAL que a próxima etapa vai refazer: o filho some
   * da árvore (remoção) ou troca de pai (promoção). Alimenta só o aviso
   * visual "esta relação vai mudar" — a alteração em si continua sendo
   * derivada do passo real (treeChangedEdges), sem estado paralelo. */
  DSV.treePendingEdges = function (root, nextRoot) {
    var pending = Object.create(null);
    if (!isObj(root) || !isObj(nextRoot)) return pending;
    var cur = treeInfo(root);
    var next = treeInfo(nextRoot);
    Object.keys(cur).forEach(function (id) {
      var n = cur[id];
      if (n.parentId == null) return;
      if (!next[id] || next[id].parentId !== n.parentId) pending[id] = true;
    });
    return pending;
  };

  /* ------------------------------------------------------------------ */
  /* Seta contextual: transição real do ponteiro ativo entre etapas      */
  /* ------------------------------------------------------------------ */

  /* operações cujo ponteiro ativo descreve um caminho real do algoritmo */
  var TRANSITION_OPS = {
    inserir: 1, inserirNo: 1, remover: 1, buscar: 1,
    preOrdem: 1, emOrdem: 1, posOrdem: 1,
    insert: 1, insertNode: 1, search: 1, searchNode: 1, remove: 1, removeNode: 1,
    inOrderTraverse: 1, preOrderTraverse: 1, postOrderTraverse: 1
  };
  var TRAVERSAL_OPS = {
    preOrdem: 1, emOrdem: 1, posOrdem: 1,
    inOrderTraverse: 1, preOrderTraverse: 1, postOrderTraverse: 1
  };

  function frameNames(stack) {
    var list = stack || [];
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(String(list[i].name || ''));
    return out.join('>');
  }

  /* mesma chamada, chamada direta (um frame a mais) ou retorno direto: uma
   * nova varredura que recomeça do zero não se conecta à anterior */
  function oneFrameApart(shorter, longer) {
    if (!shorter) return !!longer;
    if (longer.indexOf(shorter + '>') !== 0) return false;
    return longer.indexOf('>', shorter.length + 1) < 0;
  }

  function framesRelated(a, b) {
    if (a === b) return true;
    var longer = a.length >= b.length ? a : b;
    var shorter = a.length >= b.length ? b : a;
    return oneFrameApart(shorter, longer);
  }

  /**
   * Transição do ponteiro ativo que o passo representa: procura o último
   * passo da MESMA operação com o MESMO rótulo de cursor (atual/cursor/no…)
   * em frames contínuos (mesma chamada, chamada ou retorno) e devolve
   * {fromId, toId, op, label} quando o cursor realmente mudou de nó.
   * Nos percursos, só aceita transições por uma conexão real pai-filho,
   * para não sugerir uma ordem diferente da visita.
   */
  DSV.treeTransition = function (steps, index, root) {
    if (!steps || index == null || index <= 0 || !isObj(root)) return null;
    var step = steps[index];
    if (!step) return null;
    var cur = activeNodeInfo(step.pointers || {});
    if (!cur) return null;
    var op = opFrameName(step.stack);
    if (!op || !TRANSITION_OPS[op]) return null;

    var curFrames = frameNames(step.stack);
    var from = null;
    for (var j = index - 1; j >= 0; j--) {
      var prev = steps[j];
      if (opFrameName(prev.stack) !== op) break;
      var info = activeNodeInfo(prev.pointers || {});
      if (!info || info.label !== cur.label) continue;
      if (!framesRelated(frameNames(prev.stack), curFrames)) continue;
      from = { id: info.id, index: j };
      break;
    }
    if (!from || from.id === cur.id) return null;

    var ids = treeIds(root);
    if (!ids[from.id] || !ids[cur.id]) return null;

    if (TRAVERSAL_OPS[op]) {
      var info2 = treeInfo(root);
      var parentOfCur = info2[cur.id] ? info2[cur.id].parentId : null;
      var parentOfFrom = info2[from.id] ? info2[from.id].parentId : null;
      if (parentOfCur !== from.id && parentOfFrom !== cur.id) return null;
    }
    return { op: op, label: cur.label, fromId: from.id, toId: cur.id, fromIndex: from.index };
  };

  /* seta reta entre dois nós: encurtada pelo raio de cada um (nunca
   * atravessa os círculos) e com ponta na direção do destino. Usada quando
   * a transição do ponteiro não anda sobre uma conexão (a varredura da BFS,
   * por exemplo, salta entre irmãos); conexões usam a curva de treeEdge. */
  var ARROW_GAP = 3;         /* folga entre a ponta e a borda dos nós */
  var ARROW_HEAD = 9;        /* comprimento da ponta */
  var ARROW_HEAD_HALF = 3.4; /* meia-largura da ponta */

  DSV.treeArrowGeometry = function (from, to, rFrom, rTo) {
    if (!from || !to) return null;
    var dx = to.x - from.x;
    var dy = to.y - from.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var rf = rFrom || 0;
    var rt = rTo || 0;
    if (!(dist > rf + rt + ARROW_GAP * 2 + ARROW_HEAD)) return null;
    var ux = dx / dist;
    var uy = dy / dist;
    var sx = from.x + ux * (rf + ARROW_GAP);
    var sy = from.y + uy * (rf + ARROW_GAP);
    var ex = to.x - ux * (rt + ARROW_GAP);
    var ey = to.y - uy * (rt + ARROW_GAP);
    var bx = ex - ux * ARROW_HEAD;
    var by = ey - uy * ARROW_HEAD;
    var px = -uy * ARROW_HEAD_HALF;
    var py = ux * ARROW_HEAD_HALF;
    var d = 'M' + round2(sx) + ' ' + round2(sy) + 'L' + round2(bx) + ' ' + round2(by) +
      'M' + round2(ex) + ' ' + round2(ey) +
      'L' + round2(bx + px) + ' ' + round2(by + py) +
      'L' + round2(bx - px) + ' ' + round2(by - py) + 'Z';
    return { sx: sx, sy: sy, ex: ex, ey: ey, d: d };
  };

  /* ---- conexão pai → filho: geometria única do estático e da cena ---- */

  /* medidas centralizadas: o render estático e a cena animada usam as
   * mesmas folgas e proporções em todas as conexões */
  var EDGE_START_GAP = 2;    /* folga entre o início do traçado e o nó pai */
  var EDGE_TIP_GAP = 3;      /* folga entre a ponta e o nó filho */
  var EDGE_HEAD = 9;         /* comprimento da ponta triangular */
  var EDGE_HEAD_HALF = 3.4;  /* meia-largura da ponta triangular */
  var INDICATOR_LEN = 18;    /* comprimento do indicador que percorre a conexão */
  var EDGE_CONTROL = 0.5;    /* fração vertical dos pontos de controle (S suave) */
  var EDGE_LEAN = 0.1;       /* fração do deslocamento horizontal que inclina as
                              * tangentes na direção do filho: sem platô e sem
                              * gancho quando o filho está muito ao lado */

  /**
   * Traçado da conexão pai → filho: Bézier cúbica que sai da região inferior
   * do nó pai e chega à região superior do filho, mantendo folga das bordas.
   * Os pontos de controle ficam no meio vertical e avançam uma fração discreta
   * do deslocamento horizontal na direção do filho: a curva fica próxima de
   * uma diagonal suave (sem o platô horizontal e o gancho vertical que
   * apareciam em árvores muito abertas), e a tangente final aponta na direção
   * real do traçado — que é a direção da ponta do marcador. Em pai e filho
   * alinhados a conexão vira uma reta vertical limpa. Devolve o caminho da
   * curva; retorna null quando não há vão vertical para a curva e a ponta.
   */
  DSV.treeEdgeGeometry = function (from, to, rFrom, rTo) {
    if (!from || !to) return null;
    var rf = rFrom || 0;
    var rt = rTo || 0;
    var sx = from.x;
    var sy = from.y + rf + EDGE_START_GAP;
    var ex = to.x;
    var ey = to.y - rt - EDGE_TIP_GAP;
    var vh = ey - sy;
    if (!(vh > EDGE_HEAD + 2)) return null;
    var dx = ex - sx;
    var c1x = sx + dx * EDGE_LEAN;
    var c1y = sy + vh * EDGE_CONTROL;
    var c2x = ex - dx * EDGE_LEAN;
    var c2y = ey - vh * EDGE_CONTROL;
    var curve = 'M' + round2(sx) + ' ' + round2(sy) +
      'C' + round2(c1x) + ' ' + round2(c1y) +
      ' ' + round2(c2x) + ' ' + round2(c2y) +
      ' ' + round2(ex) + ' ' + round2(ey);
    return {
      sx: sx, sy: sy, ex: ex, ey: ey,
      c1x: c1x, c1y: c1y, c2x: c2x, c2y: c2y,
      curve: curve
    };
  };

  /* trecho inicial (0..t) da curva, calculado por De Casteljau: é o que
   * desenha a conexão "crescendo" do pai até o filho na revelação de uma
   * conexão nova, com a ponta do marcador acompanhando a frente que avança */
  function treeEdgeSegment(geo, t) {
    if (!geo) return '';
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var ax = geo.sx + (geo.c1x - geo.sx) * t;
    var ay = geo.sy + (geo.c1y - geo.sy) * t;
    var bx = geo.c1x + (geo.c2x - geo.c1x) * t;
    var by = geo.c1y + (geo.c2y - geo.c1y) * t;
    var cx = geo.c2x + (geo.ex - geo.c2x) * t;
    var cy = geo.c2y + (geo.ey - geo.c2y) * t;
    var dx = ax + (bx - ax) * t;
    var dy = ay + (by - ay) * t;
    var ex = bx + (cx - bx) * t;
    var ey = by + (cy - by) * t;
    var fx = dx + (ex - dx) * t;
    var fy = dy + (ey - dy) * t;
    return 'M' + round2(geo.sx) + ' ' + round2(geo.sy) +
      'C' + round2(ax) + ' ' + round2(ay) +
      ' ' + round2(dx) + ' ' + round2(dy) +
      ' ' + round2(fx) + ' ' + round2(fy);
  }

  /* ponto e direção (tangente unitária) do traçado em t: 0 = pai, 1 = filho */
  DSV.treeEdgePointAt = function (geo, t) {
    if (!geo) return null;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var u = 1 - t;
    var a = u * u * u;
    var b = 3 * u * u * t;
    var c = 3 * u * t * t;
    var d = t * t * t;
    var dx = 3 * u * u * (geo.c1x - geo.sx) + 6 * u * t * (geo.c2x - geo.c1x) + 3 * t * t * (geo.ex - geo.c2x);
    var dy = 3 * u * u * (geo.c1y - geo.sy) + 6 * u * t * (geo.c2y - geo.c1y) + 3 * t * t * (geo.ey - geo.c2y);
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: a * geo.sx + b * geo.c1x + c * geo.c2x + d * geo.ex,
      y: a * geo.sy + b * geo.c1y + c * geo.c2y + d * geo.ey,
      ux: dx / len,
      uy: dy / len
    };
  };

  /* pequeno indicador com a ponta em (x,y) apontando na direção (ux,uy):
   * haste reta + ponta fechada (mesma linguagem da seta contextual) */
  function treeIndicatorPath(x, y, ux, uy) {
    var tx = x - ux * INDICATOR_LEN;
    var ty = y - uy * INDICATOR_LEN;
    var bx = x - ux * EDGE_HEAD;
    var by = y - uy * EDGE_HEAD;
    var px = -uy * EDGE_HEAD_HALF;
    var py = ux * EDGE_HEAD_HALF;
    return 'M' + round2(tx) + ' ' + round2(ty) +
      'L' + round2(bx) + ' ' + round2(by) +
      'M' + round2(x) + ' ' + round2(y) +
      'L' + round2(bx + px) + ' ' + round2(by + py) +
      'L' + round2(bx - px) + ' ' + round2(by - py) + 'Z';
  }

  /* filho cuja conexão a transição percorre; null quando o salto não é uma
   * aresta real (ex.: a varredura da BFS anda entre irmãos) */
  function edgeChildOf(transition, parentOf) {
    if (!transition) return null;
    if (parentOf[transition.fromId] === transition.toId) return transition.fromId;
    if (parentOf[transition.toId] === transition.fromId) return transition.toId;
    return null;
  }

  /* marcadores reutilizáveis da ponta (um por estado visual); a orientação é
   * automática, pela tangente final de cada conexão — a mesma ponta vale para
   * todas as conexões e continua proporcional ao desenho no zoom. A conexão
   * ativa não tem marcador próprio: a ponta dela é o indicador que percorre a
   * curva, para não haver duas direções na mesma etapa. */
  var TREE_TIP_MARKERS = [
    ['tree-marker', 'tree-tip-base'],
    ['tree-marker-new', 'tree-tip-new']
  ];

  function treeTipMarkersHtml() {
    var out = '<defs>';
    TREE_TIP_MARKERS.forEach(function (m) {
      out += '<marker id="' + m[0] + '" viewBox="0 0 12 10" refX="11" refY="5" markerWidth="12" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">' +
        '<path class="' + m[1] + '" d="M2 1.6L11 5L2 8.4Z" />' +
        '</marker>';
    });
    return out + '</defs>';
  }

  function createTreeTipMarkers() {
    var defs = document.createElementNS(SVGNS, 'defs');
    TREE_TIP_MARKERS.forEach(function (m) {
      var marker = document.createElementNS(SVGNS, 'marker');
      marker.setAttribute('id', m[0]);
      marker.setAttribute('viewBox', '0 0 12 10');
      marker.setAttribute('refX', '11');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '12');
      marker.setAttribute('markerHeight', '10');
      marker.setAttribute('markerUnits', 'userSpaceOnUse');
      marker.setAttribute('orient', 'auto');
      var shape = document.createElementNS(SVGNS, 'path');
      shape.setAttribute('class', m[1]);
      shape.setAttribute('d', 'M2 1.6L11 5L2 8.4Z');
      marker.appendChild(shape);
      defs.appendChild(marker);
    });
    return defs;
  }

  /* indicador do render estático (sem rAF): parado no destino da transição,
   * sobre a conexão e apontando na direção real do movimento; sem aresta
   * (salto entre irmãos), mantém a seta reta completa entre os nós */
  function staticTreeArrow(arrow, activeChild, parentOf, pos, R) {
    if (activeChild != null) {
      var pid = parentOf[activeChild];
      var pg = DSV.treeEdgeGeometry(pos[pid], pos[activeChild], R, R);
      if (pg) {
        var down = arrow.fromId === pid;
        var pt = DSV.treeEdgePointAt(pg, down ? 1 : 0);
        if (pt) {
          var dir = down ? 1 : -1;
          return '<path class="tree-arrow" d="' + treeIndicatorPath(pt.x, pt.y, pt.ux * dir, pt.uy * dir) + '" />';
        }
      }
      return '';
    }
    var straight = DSV.treeArrowGeometry(pos[arrow.fromId], pos[arrow.toId], R, R);
    return straight ? '<path class="tree-arrow" d="' + straight.d + '" />' : '';
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
      /* a caixa do próximo layout acompanha a prévia: o palco já assume o
       * tamanho que a árvore terá quando o nó aparecer */
      return {
        parentId: n.parentId,
        side: n.side,
        pos: geo.pos[n.ser.id],
        r: geo.r,
        box: { width: geo.width, height: geo.height }
      };
    }
    return null;
  }

  /* caixa do desenho: a vaga pontilhada pode apontar para um nível/coluna
   * que a árvore atual ainda não ocupa; o palco usa a maior caixa (atual ×
   * próxima) para a prévia nunca ser cortada — e o tamanho se mantém quando
   * o nó aparece, evitando um segundo reenquadramento */
  function treeBox(geo, preview) {
    var w = geo.width;
    var h = geo.height;
    if (preview && preview.box) {
      w = Math.max(w, preview.box.width);
      h = Math.max(h, preview.box.height);
    }
    return { width: round2(w), height: round2(h) };
  }

  /* Renderização estática (fallback para ambientes sem DOM real, ex.: testes) */
  function renderTreeStatic(container, v, sel, ctx) {
    var layout = treeLayout(v);
    var geo = treePositions(layout);
    var nodes = layout.nodes;
    var pos = geo.pos;
    var R = geo.r;

    /* conexões criadas/alteradas nesta etapa: destaque sutil, recalculado a
     * cada render para não depender de temporizador nem de animação */
    var changedMap = null;
    var addedMap = null;
    if (ctx && ctx.prevStep) {
      var prevRoot = DSV.findTreeInStep(ctx.prevStep, sel, v);
      changedMap = DSV.treeChangedEdges(prevRoot, v);
      addedMap = DSV.treeAddedNodes(prevRoot, v);
    }
    /* conexões que a próxima etapa vai refazer (remoção/promoção): aviso
     * tracejado discreto, também derivado do histórico real */
    var pendingMap = null;
    if (ctx && ctx.nextStep) {
      pendingMap = DSV.treePendingEdges(v, DSV.findTreeInStep(ctx.nextStep, sel, v));
    }

    var lines = '';
    var circles = '';

    /* vaga que o próximo passo vai preencher (temporária, só na inserção) e
     * caixa do palco já com o tamanho do próximo layout */
    var preview = insertionPreview(sel, ctx, v);
    var box = treeBox(geo, preview);

    /* mapa filho → pai: as conexões saem sempre do pai e apontam para o filho */
    var parentOf = Object.create(null);
    nodes.forEach(function (n) {
      if (isObj(n.left) && pos[n.left.id]) parentOf[n.left.id] = n.ser.id;
      if (isObj(n.right) && pos[n.right.id]) parentOf[n.right.id] = n.ser.id;
    });

    /* seta contextual da etapa: transição real do ponteiro ativo, calculada
     * do trace a cada render (some sozinha ao avançar/retroceder) e a conexão
     * percorrida por ela, quando a transição anda sobre uma aresta */
    var arrow = ctx && ctx.steps ? DSV.treeTransition(ctx.steps, ctx.stepIndex, v) : null;
    var activeChild = edgeChildOf(arrow, parentOf);

    nodes.forEach(function (n) {
      var p = pos[n.ser.id];
      [n.left, n.right].forEach(function (child) {
        if (!isObj(child) || !pos[child.id]) return;
        var eg = DSV.treeEdgeGeometry(p, pos[child.id], R, R);
        if (!eg) return;
        var cls = 'tree-edge';
        if (child.id === activeChild) cls += ' active';
        else if (changedMap && changedMap[child.id]) cls += ' new';
        else if (pendingMap && pendingMap[child.id]) cls += ' changing';
        lines += '<path d="' + eg.curve + '" class="' + cls + '" vector-effect="non-scaling-stroke" />';
      });
    });

    if (arrow && pos[arrow.fromId] && pos[arrow.toId]) {
      lines += staticTreeArrow(arrow, activeChild, parentOf, pos, R);
    }

    if (preview && pos[preview.parentId] && preview.pos) {
      var pg = DSV.treeEdgeGeometry(pos[preview.parentId], preview.pos, R, preview.r || R);
      if (pg) {
        lines += '<path d="' + pg.curve + '" class="tree-preview-edge" vector-effect="non-scaling-stroke" />';
      }
      lines += '<circle cx="' + preview.pos.x + '" cy="' + preview.pos.y + '" r="' + (preview.r || R) + '" class="tree-preview-slot" />';
    }

    var visitMap = visitedMapFor(ctx, ctx.step);
    var activeId = activeNodeId(ctx.pointers || {});

    nodes.forEach(function (n) {
      var p = pos[n.ser.id];
      var visited = !!visitMap[n.ser.id];
      var active = activeId === n.ser.id;

      var cls = 'tree-node';
      if (addedMap && addedMap[n.ser.id]) cls += ' new';
      if (visited) cls += ' visited';
      if (active) cls += ' active';

      circles += '<g class="tree-group">';
      circles += '<circle cx="' + p.x + '" cy="' + p.y + '" r="' + R + '" class="' + cls + '" />';
      circles += '<text x="' + p.x + '" y="' + (p.y + 5) + '" class="tree-val">' + esc(nodeValue(n.ser)) + '</text>';
      circles += '</g>';
    });

    var svg = '<svg class="tree-svg" width="' + box.width + '" height="' + box.height + '" viewBox="0 0 ' + box.width + ' ' + box.height + '">' +
      treeTipMarkersHtml() + lines + circles + '</svg>';

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
    var gArrows = document.createElementNS(SVGNS, 'g');
    var gPreview = document.createElementNS(SVGNS, 'g');
    var gNodes = document.createElementNS(SVGNS, 'g');
    svg.appendChild(createTreeTipMarkers());
    svg.appendChild(gEdges);
    svg.appendChild(gArrows);
    svg.appendChild(gPreview);
    svg.appendChild(gNodes);
    wrap.appendChild(svg);

    scene.head = headEl;
    scene.wrap = wrap;
    scene.svg = svg;
    scene.gEdges = gEdges;
    scene.gArrows = gArrows;
    scene.gPreview = gPreview;
    scene.gNodes = gNodes;
    scene.previewEls = null;
    scene.preview = null;
    scene.arrowEl = null;
    scene.arrow = null;
    return scene;
  }

  function updateTreeScene(scene, container, v, sel, ctx) {
    var dur = animDur(ctx);
    var layout = treeLayout(v);
    var geo = treePositions(layout);
    var nodes = layout.nodes;

    /* prévia da vaga + caixa do palco (inclui o próximo layout quando há
     * vaga): a prévia pontilhada nunca é cortada e, quando o nó aparece, o
     * tamanho não muda */
    var preview = insertionPreview(sel, ctx, v);
    var box = treeBox(geo, preview);

    scene.svg.setAttribute('width', box.width);
    scene.svg.setAttribute('height', box.height);
    scene.svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
    scene.wrap.style.minWidth = box.width + 'px';
    scene.wrap.style.height = box.height + 'px';
    scene.r = geo.r;

    var targets = Object.create(null);
    nodes.forEach(function (n) {
      var p = geo.pos[n.ser.id];
      targets[n.ser.id] = {
        x: p.x,
        y: p.y,
        r: geo.r,
        ser: n.ser,
        left: n.left,
        right: n.right
      };
    });

    scene.head.innerHTML = head('Árvore binária', structureSub(sel, nodes.length, 'nó', 'nós', 'Árvore binária'), eventsBadge(sel, ctx));

    var activeId = activeNodeId(ctx.pointers || {});
    var addedMap = null;
    if (ctx.prevStep) addedMap = DSV.treeAddedNodes(DSV.findTreeInStep(ctx.prevStep, sel, v), v);
    syncTreeNodes(scene, targets, dur, ctx, activeId, addedMap);

    /* mapa filho → pai do passo e transição real do ponteiro: a conexão
     * percorrida fica ativa (roxa) e o indicador percorre a curva na direção
     * do movimento — tudo derivado do estado do passo, sem estado paralelo */
    var parentOf = Object.create(null);
    nodes.forEach(function (n) {
      if (isObj(n.left) && targets[n.left.id]) parentOf[n.left.id] = n.ser.id;
      if (isObj(n.right) && targets[n.right.id]) parentOf[n.right.id] = n.ser.id;
    });
    var transition = ctx.steps ? DSV.treeTransition(ctx.steps, ctx.stepIndex, v) : null;
    var activeChild = edgeChildOf(transition, parentOf);

    syncTreeEdges(scene, ctx, sel, v, parentOf, activeChild);
    syncTreeArrow(scene, transition, ctx, parentOf, activeChild, dur);
    syncTreePreview(scene, preview);
    startTreeFrame(scene);
  }

  function syncTreeNodes(scene, targets, dur, ctx, activeId, addedMap) {
    var visitMap = visitedMapFor(ctx, ctx.step);
    var t0 = DSV.anim.now();

    Object.keys(targets).forEach(function (id) {
      var t = targets[id];
      var n = scene.nodes[id];
      if (!n) {
        n = createNodeEls(id, t.r);
        n.x = t.x;
        n.y = t.y - 26;
        n.sc = 0.55;
        n.op = 0;
        n.r = t.r;
        scene.nodes[id] = n;
        n.g.setAttribute('transform', 'translate(' + round2(t.x) + ',' + round2(t.y - 26) + ') scale(0.55)');
        scene.gNodes.appendChild(n.g);
      }
      n.exiting = false;
      n.anim = {
        x0: n.x, y0: n.y, r0: n.r, s0: n.sc, o0: n.op,
        x1: t.x, y1: t.y, r1: t.r, s1: 1, o1: 1,
        start: t0, dur: dur > 0 ? Math.max(60, dur) : 0
      };
      updateNodeContent(n, t, visitMap, activeId, addedMap);
    });

    Object.keys(scene.nodes).forEach(function (id) {
      if (targets[id]) return;
      var n = scene.nodes[id];
      if (n.exiting) return;
      n.exiting = true;
      n.anim = {
        x0: n.x, y0: n.y, r0: n.r, s0: n.sc, o0: n.op,
        x1: n.x, y1: n.y, r1: n.r, s1: 0.7, o1: 0,
        start: t0, dur: dur > 0 ? Math.max(60, dur) : 0
      };
    });
  }

  function createNodeEls(id, r) {
    var radius = r || 23;
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'tree-group');

    var circle = document.createElementNS(SVGNS, 'circle');
    circle.setAttribute('class', 'tree-node');
    circle.setAttribute('r', String(radius));
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
      x: 0, y: 0, r: radius, sc: 1, op: 1, anim: null, exiting: false
    };
  }

  function updateNodeContent(n, t, visitMap, activeId, addedMap) {
    n.val.textContent = nodeValue(t.ser);

    var visited = !!visitMap[t.ser.id];
    var active = activeId === t.ser.id;
    var isNew = !!(addedMap && addedMap[t.ser.id]);

    var cls = 'tree-node';
    if (isNew) cls += ' new';
    if (visited) cls += ' visited';
    if (active) cls += ' active';
    if (n.circle.getAttribute('class') !== cls) n.circle.setAttribute('class', cls);
  }

  /* indicador contextual: um único path. Sobre uma conexão, ele percorre a
   * curva na direção real do movimento (ida e volta) e repousa no destino;
   * sem conexão (salto entre irmãos), mantém a seta reta entre os nós.
   * A chave (passo + par) evita reiniciar o percurso quando o mesmo passo é
   * re-renderizado; navegar para o passo de novo refaz o percurso. */
  function syncTreeArrow(scene, transition, ctx, parentOf, activeChild, dur) {
    if (!transition) {
      if (scene.arrowEl) { scene.arrowEl.remove(); scene.arrowEl = null; }
      scene.arrow = null;
      return;
    }
    if (!scene.arrowEl) {
      var el = document.createElementNS(SVGNS, 'path');
      el.setAttribute('class', 'tree-arrow');
      el.setAttribute('vector-effect', 'non-scaling-stroke');
      scene.gArrows.appendChild(el);
      scene.arrowEl = el;
    }
    var stepKey = ctx && ctx.stepIndex != null ? ctx.stepIndex : -1;
    var key = stepKey + '|' + transition.fromId + '>' + transition.toId;
    if (!scene.arrow || scene.arrow.key !== key) {
      scene.arrow = {
        key: key,
        fromId: transition.fromId,
        toId: transition.toId,
        childId: activeChild,
        parentId: activeChild != null ? parentOf[activeChild] : null,
        down: activeChild != null ? transition.fromId === parentOf[activeChild] : false,
        start: DSV.anim.now(),
        /* com movimento reduzido o indicador já nasce no destino */
        dur: DSV.anim.reducedMotion ? 0 : Math.max(0, dur || 0)
      };
    }
    positionTreeArrow(scene);
  }

  /* geometria calculada das posições atuais dos nós (raio incluso); se os
   * nós ainda não existem na cena, o indicador fica invisível */
  function positionTreeArrow(scene) {
    if (!scene.arrow || !scene.arrowEl) return;
    var arrow = scene.arrow;
    var a = scene.nodes[arrow.fromId];
    var b = scene.nodes[arrow.toId];
    if (!a || !b) {
      scene.arrowEl.setAttribute('opacity', '0');
      return;
    }
    if (arrow.childId != null) {
      /* transição sobre uma conexão real: segue a curva até o destino */
      var p = scene.nodes[arrow.parentId];
      var c = scene.nodes[arrow.childId];
      if (!p || !c) {
        scene.arrowEl.setAttribute('opacity', '0');
        return;
      }
      var eg = DSV.treeEdgeGeometry({ x: p.x, y: p.y }, { x: c.x, y: c.y }, p.r, c.r);
      if (!eg) {
        scene.arrowEl.setAttribute('opacity', '0');
        return;
      }
      var t = arrow.dur > 0 ? (DSV.anim.now() - arrow.start) / arrow.dur : 1;
      var u = arrow.down ? DSV.anim.ease(t) : 1 - DSV.anim.ease(t);
      var pt = DSV.treeEdgePointAt(eg, u);
      if (!pt) {
        scene.arrowEl.setAttribute('opacity', '0');
        return;
      }
      var dir = arrow.down ? 1 : -1;
      scene.arrowEl.setAttribute('d', treeIndicatorPath(pt.x, pt.y, pt.ux * dir, pt.uy * dir));
    } else {
      var straight = DSV.treeArrowGeometry({ x: a.x, y: a.y }, { x: b.x, y: b.y }, a.r, b.r);
      if (!straight) {
        scene.arrowEl.setAttribute('opacity', '0');
        return;
      }
      scene.arrowEl.setAttribute('d', straight.d);
    }
    scene.arrowEl.setAttribute('opacity', round3(Math.min(a.op, b.op)));
  }

  /* prévia da vaga de inserção: curva tracejada do pai até o lugar exato
   * onde o nó vai aparecer (some assim que ele aparece), no mesmo traçado
   * que a conexão real terá */
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
      var line = document.createElementNS(SVGNS, 'path');
      line.setAttribute('class', 'tree-preview-edge');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      var circle = document.createElementNS(SVGNS, 'circle');
      circle.setAttribute('class', 'tree-preview-slot');
      circle.setAttribute('r', String(preview.r || scene.r || 23));
      scene.gPreview.appendChild(line);
      scene.gPreview.appendChild(circle);
      scene.previewEls = { line: line, circle: circle };
    }
    scene.previewEls.circle.setAttribute('r', String(preview.r || scene.r || 23));
    scene.previewEls.circle.setAttribute('cx', round2(preview.pos.x));
    scene.previewEls.circle.setAttribute('cy', round2(preview.pos.y));
    scene.preview = { parentId: preview.parentId, pos: preview.pos, r: preview.r || scene.r || 23 };
  }

  function syncTreeEdges(scene, ctx, sel, currentRoot, parentOf, activeChild) {
    /* conexão criada/alterada nesta etapa: o realce vale enquanto o passo
     * estiver na tela (sem temporizador) e é recalculado ao navegar */
    var changedMap = DSV.treeChangedEdges(
      ctx && ctx.prevStep ? DSV.findTreeInStep(ctx.prevStep, sel, currentRoot) : null,
      currentRoot
    );
    /* conexões que a próxima etapa vai refazer: aviso tracejado antes da
     * alteração (a mudança em si continua vindo do passo real) */
    var pendingMap = null;
    if (ctx && ctx.nextStep) {
      pendingMap = DSV.treePendingEdges(currentRoot, DSV.findTreeInStep(ctx.nextStep, sel, currentRoot));
    }
    /* as chaves de parentOf são strings; normaliza o id para comparar */
    var activeKey = activeChild == null ? null : String(activeChild);
    /* chave do passo para a revelação da conexão nova: re-render do mesmo
     * passo (zoom, resize) não reinicia; navegar para o passo de novo refaz */
    var stepKey = ctx && ctx.stepIndex != null ? ctx.stepIndex : -1;
    var revealDur = animDur(ctx);

    Object.keys(parentOf).forEach(function (cid) {
      var pid = parentOf[cid];
      var e = scene.edges[cid];
      if (!e) {
        var path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('class', 'tree-edge');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        e = scene.edges[cid] = {
          line: path,
          parentId: null,
          reveal: 1,
          revealKey: null,
          revealStart: 0,
          revealDur: 0
        };
        scene.gEdges.appendChild(path);
      }
      e.parentId = pid;
      var cls = 'tree-edge';
      var isNew = false;
      if (cid === activeKey) cls += ' active';
      else if (changedMap[cid]) { cls += ' new'; isNew = true; }
      else if (pendingMap && pendingMap[cid]) cls += ' changing';
      if (e.line.getAttribute('class') !== cls) e.line.setAttribute('class', cls);
      if (isNew) {
        /* a conexão nasce "crescendo" do pai até o filho; com movimento
         * reduzido já nasce inteira */
        var key = stepKey + '|' + cid;
        if (e.revealKey !== key) {
          e.revealKey = key;
          e.revealStart = DSV.anim.now();
          e.revealDur = DSV.anim.reducedMotion ? 0 : Math.max(0, revealDur);
          e.reveal = e.revealDur > 0 ? 0 : 1;
        }
      } else {
        e.revealKey = null;
        e.reveal = 1;
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
        n.r = DSV.anim.lerp(a.r0, a.r1, e);
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
      n.circle.setAttribute('r', round2(n.r));
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
      var eg = DSV.treeEdgeGeometry({ x: p.x, y: p.y }, { x: c.x, y: c.y }, p.r, c.r);
      if (eg) {
        var d = eg.curve;
        if (e.reveal < 1) {
          /* revelação progressiva: desenha o trecho inicial da curva e deixa
           * a ponta do marcador avançar com a frente até o filho */
          var rt = e.revealDur > 0 ? (t0 - e.revealStart) / e.revealDur : 1;
          var rv = DSV.anim.ease(rt);
          if (rv >= 1) {
            e.reveal = 1;
          } else {
            e.reveal = rv;
            /* no início a frente ainda é um ponto: não desenha para a ponta
             * não aparecer girada no pai */
            d = rv > 0.02 ? treeEdgeSegment(eg, rv) : null;
            active = true;
          }
        }
        if (d) e.line.setAttribute('d', d);
      }
      var o = Math.min(p.op, c.op);
      e.line.setAttribute('opacity', round3(o));
      if (o < 0.99) active = true;
    });

    /* prévia da vaga de inserção: acompanha o pai enquanto ele se move */
    if (scene.preview && scene.previewEls) {
      var pn = scene.nodes[scene.preview.parentId];
      if (pn) {
        var pg = DSV.treeEdgeGeometry({ x: pn.x, y: pn.y }, scene.preview.pos, pn.r, scene.preview.r);
        if (pg) scene.previewEls.line.setAttribute('d', pg.curve);
        scene.previewEls.line.setAttribute('opacity', round3(pn.op));
        scene.previewEls.circle.setAttribute('opacity', round3(Math.min(1, pn.op + 0.2)));
        if (pn.op < 0.99) active = true;
      }
    }

    /* indicador contextual: acompanha os nós na interpolação e percorre a
     * conexão até o destino; o estado final não depende do fim da animação */
    if (scene.arrow && scene.arrowEl) {
      positionTreeArrow(scene);
      if (scene.arrow.childId != null && scene.arrow.dur > 0 &&
        t0 - scene.arrow.start < scene.arrow.dur) active = true;
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

  /* Contrato: `msg` entra como HTML na página — os chamadores devem escapar
   * qualquer dado vindo do código do usuário (ver `esc` nos usos abaixo). */
  function renderMessage(container, msg, kind) {
    /* a mensagem substitui a cena da árvore: descarta a referência para
     * que o próximo passo recrie a cena em vez de atualizar um DOM antigo */
    container.__treeScene = null;
    container.innerHTML = '<div class="canvas-viewport"><div class="canvas-stage"><div class="empty ' + (kind || '') + '">' + msg + '</div></div></div>';
  }

  /**
   * Renderiza a estrutura selecionada.
   * sel: {type, id, label} — id null = estrutura vazia (raiz/início nulos)
   * ctx: {opsMap, pointers, events, visit, prevStep, steps, stepIndex}
   *   steps/stepIndex (trace completo + passo atual) habilitam a seta
   *   contextual da árvore, sempre calculada dos ponteiros reais do passo.
   */
  DSV.renderStructure = function (container, sel, step, ctx) {
    if (!step) { renderMessage(container, 'Execute o código para começar.'); return; }
    if (!sel || sel.type === 'none') {
      renderMessage(container, 'Nenhuma estrutura detectada ainda. Use uma pilha ou fila (array com <code>push/pop</code> ou <code>push/shift</code>), nós com <code>proximo</code> (lista) ou nós com <code>esquerda/direita</code> (árvore).');
      return;
    }
    ctx = ctx || {};
    /* carimba o passo atual: renderizadores dependem dele para visitas,
     * prévia de inserção e destaque de arestas */
    ctx.step = step;

    if (sel.id == null) {
      if (sel.type === 'list') renderListEmpty(container, sel, ctx);
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
      else if (sel.type === 'list' && isObj(v)) renderList(container, v, sel, ctx);
      else if (sel.type === 'array' && isObj(v)) renderArray(container, v, sel, ctx);
      else if (sel.type === 'tree' && isObj(v)) { usedTree = true; renderTree(container, v, sel, ctx); }
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
  /* exposto para os testes conferirem foco/posições sem depender do HTML */
  DSV.arrayStepInfo = arrayStepInfo;
  DSV.treeMetrics = treeMetrics;
  DSV.treeEdgeSegment = treeEdgeSegment;
})(typeof window !== 'undefined' ? window : globalThis);
