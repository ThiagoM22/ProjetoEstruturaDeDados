/* ED Viz — utilitários compartilhados (navegador + Node). */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});

  DSV.escapeHtml = function (s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  DSV.clamp = function (v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  DSV.fmtNumber = function (n) {
    if (typeof n !== 'number') return String(n);
    if (Number.isNaN(n)) return 'NaN';
    if (n === Infinity) return 'Infinity';
    if (n === -Infinity) return '-Infinity';
    if (Number.isInteger(n)) return String(n);
    var s = String(n);
    if (s.length > 18) s = s.slice(0, 18) + '…';
    return s;
  };

  DSV.fmtPrimitive = function (v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'number') return DSV.fmtNumber(v);
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'boolean') return String(v);
    return String(v);
  };

  /* Formata um valor já serializado (formato do interpretador) para painéis. */
  DSV.fmtSerialized = function (sv, depth) {
    depth = depth || 0;
    if (!sv || typeof sv !== 'object') return String(sv);
    if (sv.t === 'p') return DSV.fmtPrimitive(sv.v);
    if (sv.t === 'fn') return 'ƒ ' + (sv.name || '(anônimo)');
    if (sv.t === 'c') return 'classe ' + sv.name;
    if (sv.t === 'trunc') return '… (+' + sv.n + ')';
    if (sv.t === 'ref') return '→ objeto #' + sv.id;
    if (sv.t === 'a') {
      if (depth >= 2) return '[…]';
      var items = sv.items.slice(0, 8).map(function (it) {
        return DSV.fmtSerializedShort(it);
      });
      if (sv.items.length > 8) items.push('…');
      return '[' + items.join(', ') + ']';
    }
    if (sv.t === 'o') {
      if (depth >= 2) return '{…}';
      var keys = Object.keys(sv.props || {});
      var shown = keys.slice(0, 5).map(function (k) {
        return k + ': ' + DSV.fmtSerializedShort(sv.props[k]);
      });
      if (keys.length > 5) shown.push('…');
      var head = sv.ctor && sv.ctor !== 'Object' ? sv.ctor + ' ' : '';
      return head + '{' + shown.join(', ') + '}';
    }
    return String(sv);
  };

  DSV.fmtSerializedShort = function (sv) {
    if (!sv || typeof sv !== 'object') return String(sv);
    if (sv.t === 'p') return DSV.fmtPrimitive(sv.v);
    if (sv.t === 'fn') return 'ƒ ' + (sv.name || '');
    if (sv.t === 'c') return 'classe ' + sv.name;
    if (sv.t === 'trunc') return '…';
    if (sv.t === 'ref') return '→ #' + sv.id;
    if (sv.t === 'a') return '[' + (sv.items.length ? sv.items.length + ' itens' : '') + ']';
    if (sv.t === 'o') {
      var keys = Object.keys(sv.props || {});
      return (sv.ctor && sv.ctor !== 'Object' ? sv.ctor : '{…}') + (keys.length ? ' (' + keys.length + ' campos)' : '');
    }
    return String(sv);
  };

  /* Palavra (identificador) que contém a coluna `col` da linha `line` do
   * texto — usada pela dica de variável do editor. Devolve null quando a
   * posição não está sobre um identificador (espaço, pontuação, número...). */
  DSV.identifierAt = function (text, line, col) {
    var lines = String(text == null ? '' : text).split('\n');
    if (line < 0 || line >= lines.length) return null;
    var s = lines[line];
    if (col < 0 || col >= s.length) return null;
    if (!/[A-Za-z0-9_$]/.test(s.charAt(col))) return null;
    var start = col;
    while (start > 0 && /[A-Za-z0-9_$]/.test(s.charAt(start - 1))) start--;
    var end = col + 1;
    while (end < s.length && /[A-Za-z0-9_$]/.test(s.charAt(end))) end++;
    var word = s.slice(start, end);
    return /^[A-Za-z_$]/.test(word) ? word : null;
  };

  /* Variável visível no passo, na mesma ordem do painel Variáveis:
   * this → locais da função atual → globais. Devolve {name, sv, scope}
   * ou null quando o nome não é uma variável do passo. */
  DSV.resolveVariable = function (step, name) {
    if (!step || !name) return null;
    if (name === 'this') {
      if (!step.thisVal) return null;
      return { name: 'this', scope: 'função atual', sv: step.thisVal };
    }
    var locals = step.locals || {};
    if (Object.prototype.hasOwnProperty.call(locals, name)) {
      return { name: name, scope: 'função atual', sv: locals[name] };
    }
    var globals = step.globals || {};
    if (Object.prototype.hasOwnProperty.call(globals, name)) {
      return { name: name, scope: 'global', sv: globals[name] };
    }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
