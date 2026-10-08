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

  /* chips de ponteiro: sem duplicatas, prioriza nomes significativos.
   * Retorna {key, text}: key = caminho completo (estável entre passos),
   * text = nome curto exibido. */
  var CHILD_ALIAS_RX = /^(esquerda|direita|left|right|esq|dir|proximo|próximo|next|prox|seguinte)$/i;

  function chipDefs(labels) {
    var seen = Object.create(null);
    var uniq = [];
    (labels || []).forEach(function (label) {
      var s = shortName(label);
      if (seen[s]) return;
      seen[s] = true;
      uniq.push({ key: String(label), text: s });
    });
    var meaningful = uniq.filter(function (c) { return !CHILD_ALIAS_RX.test(c.text); });
    return (meaningful.length ? meaningful : uniq).slice(0, 3);
  }

  function chipsFor(labels) {
    return chipDefs(labels).map(function (c) { return c.text; });
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
          label: shownLabel,
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
    steps.forEach(function (s) {
      Object.keys(s.pointers || {}).forEach(function (id) {
        if (map[id] != null) return;
        var labels = s.pointers[id];
        var relevant = hasCurrentLike
          ? labels.filter(function (l) { return currentRx.test(shortName(l)); })
          : labels;
        if (!relevant.length) return;
        var num = order.length + 1;
        order.push({ id: Number(id), num: num, step: s.i });
        map[id] = num;
      });
    });
    return { order: order, map: map, hasCurrentLike: hasCurrentLike };
  };

  /* ------------------------------------------------------------------ */
  /* Renderização                                                        */
  /* ------------------------------------------------------------------ */

  function head(title, sub, badge) {
    return '<div class="viz-head">' +
      '<span class="viz-title">' + esc(title) + '</span>' +
      (sub ? '<span class="viz-sub">' + esc(sub) + '</span>' : '') +
      (badge ? '<span class="op-badge">' + esc(badge) + '</span>' : '') +
      '</div>';
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
      var html = head('Pilha', sel.label + ' · ' + n + (n === 1 ? ' item' : ' itens'), badge);
      html += '<div class="stack-wrap">';
      if (n === 0) {
        html += '<div class="empty-inline">pilha vazia</div>';
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
      }
      html += '<div class="stack-base">base</div>';
      html += '</div>';
      container.innerHTML = html;
    }, dur);
  }

  function renderQueue(container, v, sel, ctx) {
    var n = v.items.length;
    var ops = (ctx.opsMap || {})[sel.id] || {};
    var reverse = !!(ops.unshift && ops.pop && !ops.shift);
    var badge = eventsBadge(sel, ctx);
    var keys = itemKeys(v.items);
    var dur = animDur(ctx);
    var enterDir = reverse ? 'left' : 'right';
    var exitDir = reverse ? 'right' : 'left';

    DSV.flipRender(container, function () {
      var html = head('Fila', sel.label + ' · ' + n + (n === 1 ? ' item' : ' itens'), badge);
      html += '<div class="queue-wrap">';
      if (n === 0) {
        html += '<div class="empty-inline">fila vazia</div>';
      } else {
        var leftLabel = reverse ? 'fim (traseira) →' : 'frente (início) →';
        var rightLabel = reverse ? '← frente (início)' : '← fim (traseira)';
        html += '<div class="queue-side">' + esc(leftLabel) + '</div>';
        html += '<div class="queue-row">';
        for (var i = 0; i < n; i++) {
          var isFront = reverse ? i === n - 1 : i === 0;
          html += '<div class="queue-cell' + (isFront ? ' front' : '') + '" data-k="' + esc(keys[i]) + '" data-enter="' + enterDir + '" data-exit="' + exitDir + '">' +
            '<span class="cell-val">' + esc(DSV.fmtSerializedShort(v.items[i])) + '</span>' +
            (isFront ? '<span class="cell-flag">próximo a sair</span>' : '') +
            '</div>';
          if (i < n - 1) html += '<div class="arrow">' + (reverse ? '←' : '→') + '</div>';
        }
        html += '</div>';
        html += '<div class="queue-side">' + esc(rightLabel) + '</div>';
      }
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
      var html = head('Array', sel.label + ' · ' + n + (n === 1 ? ' item' : ' itens'), badge);
      html += '<div class="array-wrap">';
      if (n === 0) {
        html += '<div class="empty-inline">array vazio</div>';
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
      var html = head('Lista encadeada', sel.label + ' · ' + nodes.length + (nodes.length === 1 ? ' nó' : ' nós'), badge);
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
      container.innerHTML = html;
    }, dur);
  }

  /* Renderização estática (fallback para ambientes sem DOM real, ex.: testes) */
  function renderTreeStatic(container, v, sel, ctx) {
    var nodes = [];
    var seen = {};
    var maxDepth = 0;

    function walk(node, depth) {
      if (!isObj(node) || seen[node.id]) return;
      seen[node.id] = true;
      var L = nodeChild(node, 'L');
      var R = nodeChild(node, 'R');
      walk(L, depth + 1);
      nodes.push({ ser: node, x: nodes.length, depth: depth, left: L, right: R });
      if (depth > maxDepth) maxDepth = depth;
      walk(R, depth + 1);
    }
    walk(v, 0);

    var HGAP = 68;
    var VGAP = 78;
    var R = 20;
    var PADX = 40;
    var PADY = 46;
    var width = Math.max(nodes.length * HGAP + PADX * 2, 340);
    var height = (maxDepth + 1) * VGAP + PADY + 40;

    var pos = {};
    nodes.forEach(function (n) {
      pos[n.ser.id] = {
        cx: PADX + n.x * HGAP + HGAP / 2,
        cy: PADY + n.depth * VGAP
      };
    });

    var lines = '';
    var circles = '';

    nodes.forEach(function (n) {
      var p = pos[n.ser.id];
      [n.left, n.right].forEach(function (child) {
        if (!isObj(child) || !pos[child.id]) return;
        var cp = pos[child.id];
        lines += '<line x1="' + p.cx + '" y1="' + (p.cy + R) + '" x2="' + cp.cx + '" y2="' + (cp.cy - R) + '" class="tree-edge" />';
      });
    });

    var visitMap = (ctx.visit && ctx.visit.map) || {};

    nodes.forEach(function (n) {
      var p = pos[n.ser.id];
      var chips = chipsFor((ctx.pointers || {})[n.ser.id]);
      var tagged = chips.length > 0;
      var visitedNum = visitMap[n.ser.id];

      var cls = 'tree-node';
      if (visitedNum) cls += ' visited';
      if (tagged) cls += ' tagged';

      circles += '<g class="tree-group">';
      circles += '<circle cx="' + p.cx + '" cy="' + p.cy + '" r="' + R + '" class="' + cls + '" />';
      if (visitedNum) {
        circles += '<text x="' + (p.cx + R - 4) + '" y="' + (p.cy - R + 12) + '" class="tree-visit-num">' + visitedNum + '</text>';
      }
      circles += '<text x="' + p.cx + '" y="' + (p.cy + 5) + '" class="tree-val">' + esc(nodeValue(n.ser)) + '</text>';

      /* stubs de filhos nulos para nós com ponteiro */
      if (tagged) {
        if (!n.left) {
          circles += '<circle cx="' + (p.cx - R - 18) + '" cy="' + p.cy + '" r="9" class="tree-null-stub" />' +
            '<text x="' + (p.cx - R - 18) + '" y="' + (p.cy + 4) + '" class="tree-null-text">∅</text>';
        }
        if (!n.right) {
          circles += '<circle cx="' + (p.cx + R + 18) + '" cy="' + p.cy + '" r="9" class="tree-null-stub" />' +
            '<text x="' + (p.cx + R + 18) + '" y="' + (p.cy + 4) + '" class="tree-null-text">∅</text>';
        }
      }

      /* chips de ponteiros */
      chips.forEach(function (chip, i) {
        var w = chip.length * 7 + 12;
        var x = p.cx - w / 2;
        var y = p.cy - R - 10 - i * 17;
        circles += '<rect x="' + x + '" y="' + (y - 12) + '" width="' + w + '" height="16" rx="8" class="ptr-chip-bg" />' +
          '<text x="' + p.cx + '" y="' + (y) + '" class="ptr-chip-text">' + esc(chip) + '</text>';
      });

      circles += '</g>';
    });

    var svg = '<svg class="tree-svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
      lines + circles + '</svg>';

    var badge = eventsBadge(sel, ctx);
    container.innerHTML = head('Árvore binária', sel.label + ' · ' + nodes.length + (nodes.length === 1 ? ' nó' : ' nós'), badge) +
      '<div class="tree-wrap">' + svg + '</div>';
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
      chips: Object.create(null),
      raf: null,
      lastFrame: 0
    };

    container.innerHTML = '';
    var headEl = document.createElement('div');
    container.appendChild(headEl);
    var wrap = document.createElement('div');
    wrap.className = 'tree-wrap';
    container.appendChild(wrap);

    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'tree-svg');
    var gEdges = document.createElementNS(SVGNS, 'g');
    var gNodes = document.createElementNS(SVGNS, 'g');
    svg.appendChild(gEdges);
    svg.appendChild(gNodes);
    wrap.appendChild(svg);

    scene.head = headEl;
    scene.wrap = wrap;
    scene.svg = svg;
    scene.gEdges = gEdges;
    scene.gNodes = gNodes;
    return scene;
  }

  function treeLayout(v) {
    var nodes = [];
    var seen = Object.create(null);
    var maxDepth = 0;
    (function walk(node, depth) {
      if (!isObj(node) || seen[node.id]) return;
      seen[node.id] = true;
      var L = nodeChild(node, 'L');
      var R = nodeChild(node, 'R');
      walk(L, depth + 1);
      nodes.push({ ser: node, x: nodes.length, depth: depth, left: L, right: R });
      if (depth > maxDepth) maxDepth = depth;
      walk(R, depth + 1);
    })(v, 0);
    return { nodes: nodes, maxDepth: maxDepth };
  }

  function updateTreeScene(scene, container, v, sel, ctx) {
    var dur = animDur(ctx);
    var layout = treeLayout(v);
    var nodes = layout.nodes;

    var HGAP = 68;
    var VGAP = 78;
    var PADX = 40;
    var PADY = 46;
    var width = Math.max(nodes.length * HGAP + PADX * 2, 340);
    var height = (layout.maxDepth + 1) * VGAP + PADY + 40;

    scene.svg.setAttribute('width', width);
    scene.svg.setAttribute('height', height);
    scene.svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    scene.wrap.style.minWidth = width + 'px';
    scene.wrap.style.height = height + 'px';

    var targets = Object.create(null);
    nodes.forEach(function (n) {
      targets[n.ser.id] = {
        x: PADX + n.x * HGAP + HGAP / 2,
        y: PADY + n.depth * VGAP,
        ser: n.ser,
        left: n.left,
        right: n.right
      };
    });

    scene.head.innerHTML = head('Árvore binária', sel.label + ' · ' + nodes.length + (nodes.length === 1 ? ' nó' : ' nós'), eventsBadge(sel, ctx));

    syncTreeNodes(scene, targets, dur, ctx);
    syncTreeEdges(scene, targets);
    syncTreeChips(scene, targets, ctx.pointers || {});
    startTreeFrame(scene);
  }

  function syncTreeNodes(scene, targets, dur, ctx) {
    var visitMap = (ctx.visit && ctx.visit.map) || {};
    var t0 = DSV.anim.now();

    Object.keys(targets).forEach(function (id) {
      var t = targets[id];
      var n = scene.nodes[id];
      if (!n) {
        n = createNodeEls(id);
        n.x = t.x;
        n.y = t.y - 22;
        n.sc = 0.55;
        n.op = 0;
        scene.nodes[id] = n;
        scene.gNodes.appendChild(n.g);
      }
      n.exiting = false;
      n.anim = {
        x0: n.x, y0: n.y, s0: n.sc, o0: n.op,
        x1: t.x, y1: t.y, s1: 1, o1: 1,
        start: t0, dur: Math.max(60, dur)
      };
      updateNodeContent(n, t, visitMap, ctx);
    });

    Object.keys(scene.nodes).forEach(function (id) {
      if (targets[id]) return;
      var n = scene.nodes[id];
      if (n.exiting) return;
      n.exiting = true;
      if (n.stubL) { n.stubL.remove(); n.stubL = null; }
      if (n.stubR) { n.stubR.remove(); n.stubR = null; }
      n.anim = {
        x0: n.x, y0: n.y, s0: n.sc, o0: n.op,
        x1: n.x, y1: n.y, s1: 0.7, o1: 0,
        start: t0, dur: Math.max(60, dur)
      };
    });
  }

  function createNodeEls(id) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'tree-group');

    var circle = document.createElementNS(SVGNS, 'path');
    circle.setAttribute('class', 'tree-node');
    circle.setAttribute('d', DSV.rough.ellipse(21, 18, DSV.rough.seedOf(id, 1), 1.7));
    circle.setAttribute('vector-effect', 'non-scaling-stroke');

    var val = document.createElementNS(SVGNS, 'text');
    val.setAttribute('class', 'tree-val');
    val.setAttribute('dy', '5');

    g.appendChild(circle);
    g.appendChild(val);
    return {
      g: g, circle: circle, val: val, visit: null, stubL: null, stubR: null,
      x: 0, y: 0, sc: 1, op: 1, anim: null, exiting: false
    };
  }

  function createStub(g, dx) {
    var sg = document.createElementNS(SVGNS, 'g');
    sg.setAttribute('transform', 'translate(' + dx + ',0)');
    var c = document.createElementNS(SVGNS, 'path');
    c.setAttribute('class', 'tree-null-stub');
    c.setAttribute('d', DSV.rough.ellipse(9, 8, DSV.rough.seedOf(Math.abs(dx) + 17, 3), 1.2));
    c.setAttribute('vector-effect', 'non-scaling-stroke');
    var tx = document.createElementNS(SVGNS, 'text');
    tx.setAttribute('x', 0);
    tx.setAttribute('y', 4);
    tx.setAttribute('class', 'tree-null-text');
    tx.textContent = '∅';
    sg.appendChild(c);
    sg.appendChild(tx);
    g.appendChild(sg);
    return sg;
  }

  function updateNodeContent(n, t, visitMap, ctx) {
    n.val.textContent = nodeValue(t.ser);

    var chips = chipsFor((ctx.pointers || {})[t.ser.id]);
    var tagged = chips.length > 0;
    var visitedNum = visitMap[t.ser.id];

    var cls = 'tree-node';
    if (visitedNum) cls += ' visited';
    if (tagged) cls += ' tagged';
    if (n.circle.getAttribute('class') !== cls) n.circle.setAttribute('class', cls);

    if (visitedNum) {
      if (!n.visit) {
        n.visit = document.createElementNS(SVGNS, 'text');
        n.visit.setAttribute('class', 'tree-visit-num');
        n.visit.setAttribute('x', 12);
        n.visit.setAttribute('y', -12);
        n.g.appendChild(n.visit);
      }
      n.visit.textContent = visitedNum;
    } else if (n.visit) {
      n.visit.remove();
      n.visit = null;
    }

    if (tagged && !t.left && !n.stubL) n.stubL = createStub(n.g, -38);
    else if ((!tagged || t.left) && n.stubL) { n.stubL.remove(); n.stubL = null; }
    if (tagged && !t.right && !n.stubR) n.stubR = createStub(n.g, 38);
    else if ((!tagged || t.right) && n.stubR) { n.stubR.remove(); n.stubR = null; }
  }

  function syncTreeEdges(scene, targets) {
    var parentOf = Object.create(null);
    Object.keys(targets).forEach(function (id) {
      var t = targets[id];
      if (t.left && targets[t.left.id]) parentOf[t.left.id] = id;
      if (t.right && targets[t.right.id]) parentOf[t.right.id] = id;
    });

    Object.keys(parentOf).forEach(function (cid) {
      var e = scene.edges[cid];
      if (!e) {
        var path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('class', 'tree-edge');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        e = scene.edges[cid] = {
          line: path,
          parentId: null,
          seed: DSV.rough.seedOf(Number(cid), 7)
        };
        scene.gEdges.appendChild(path);
      }
      e.parentId = parentOf[cid];
    });

    Object.keys(scene.edges).forEach(function (cid) {
      if (!parentOf[cid] || !targets[cid]) {
        scene.edges[cid].line.remove();
        delete scene.edges[cid];
      }
    });
  }

  function syncTreeChips(scene, targets, pointers) {
    var desired = Object.create(null);
    Object.keys(targets).forEach(function (id) {
      chipDefs(pointers[id]).forEach(function (c) {
        desired[c.key] = { id: id, text: c.text };
      });
    });

    Object.keys(desired).forEach(function (key) {
      var d = desired[key];
      var chip = scene.chips[key];
      if (!chip) {
        var el = document.createElement('div');
        el.className = 'ptr-chip tree-chip';
        scene.wrap.appendChild(el);
        var t = targets[d.id];
        chip = scene.chips[key] = {
          el: el, x: t.x, y: t.y - 36, op: 0, opTo: 1, nodeId: d.id, idx: 0
        };
      }
      chip.nodeId = d.id;
      chip.opTo = 1;
      if (chip.el.textContent !== d.text) chip.el.textContent = d.text;
    });

    /* empilha os chips de cada nó */
    var perNode = Object.create(null);
    Object.keys(desired).forEach(function (key) {
      var id = desired[key].id;
      if (!perNode[id]) perNode[id] = [];
      perNode[id].push(key);
    });
    Object.keys(perNode).forEach(function (id) {
      perNode[id].sort();
      perNode[id].forEach(function (key, i) { scene.chips[key].idx = i; });
    });

    Object.keys(scene.chips).forEach(function (key) {
      if (!desired[key]) scene.chips[key].opTo = 0;
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
    if (!scene.lastFrame) scene.lastFrame = t0;
    var dt = Math.min(t0 - scene.lastFrame, 64);
    scene.lastFrame = t0;
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
      e.line.setAttribute('d', DSV.rough.line(p.x, p.y + 18, c.x, c.y - 18, e.seed, 1.3));
      var o = Math.min(p.op, c.op);
      e.line.setAttribute('opacity', round3(o));
      if (o < 0.99) active = true;
    });

    /* chips (overlay HTML) acompanham os nós com suavização */
    var k = 1 - Math.pow(0.0015, dt / 240);
    Object.keys(scene.chips).forEach(function (key) {
      var chip = scene.chips[key];
      var n = scene.nodes[chip.nodeId];
      var tx = n ? n.x : chip.x;
      var ty = n ? n.y - 30 - chip.idx * 17 : chip.y;
      chip.x = DSV.anim.lerp(chip.x, tx, k);
      chip.y = DSV.anim.lerp(chip.y, ty, k);
      chip.op = DSV.anim.lerp(chip.op, chip.opTo, k);
      chip.el.style.left = round2(chip.x) + 'px';
      chip.el.style.top = round2(chip.y) + 'px';
      chip.el.style.opacity = round3(chip.op);
      if (chip.opTo === 0 && chip.op < 0.03) {
        chip.el.remove();
        delete scene.chips[key];
        return;
      }
      if (Math.abs(chip.x - tx) > 0.4 || Math.abs(chip.y - ty) > 0.4 || Math.abs(chip.op - chip.opTo) > 0.01) {
        active = true;
      }
    });

    return active;
  }

  function renderTree(container, v, sel, ctx) {
    if (!supportsTreeScene()) {
      renderTreeStatic(container, v, sel, ctx);
      return;
    }
    var key = 'tree|' + sel.label + '|' + sel.id;
    var scene = container.__treeScene;
    if (!scene || scene.key !== key) {
      scene = container.__treeScene = createTreeScene(container, key);
    }
    updateTreeScene(scene, container, v, sel, ctx);
  }

  function renderMessage(container, msg, kind) {
    container.innerHTML = '<div class="empty ' + (kind || '') + '">' + msg + '</div>';
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

    if (sel.id == null) {
      if (sel.type === 'list') renderMessage(container, 'Lista vazia — <code>' + esc(sel.label) + '</code> ainda não tem nós.');
      else if (sel.type === 'tree') renderMessage(container, 'Árvore vazia — <code>' + esc(sel.label) + '</code> ainda não tem nós.');
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
