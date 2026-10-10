/* ED Viz — interpretador passo a passo de um subconjunto de JavaScript.
 *
 * Executa o código do usuário e grava, a cada comando, um "passo" com:
 *   - linha executada
 *   - pilha de chamadas
 *   - variáveis globais e locais (serializadas)
 *   - ponteiros (quais variáveis apontam para quais objetos)
 *   - eventos (push, pop, shift, unshift, splice, saída de console)
 */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});
  var hasOwn = Object.prototype.hasOwnProperty;

  var DEFAULT_MAX_STEPS = 20000;
  var DEFAULT_MAX_DEPTH = 500;

  /* globais comuns do JS que este visualizador não implementa: mensagem clara
   * em vez de "não foi definido" */
  var UNSUPPORTED_GLOBALS = Object.create(null);
  ['Set', 'Map', 'WeakSet', 'WeakMap', 'Symbol', 'Promise', 'RegExp', 'Date']
    .forEach(function (n) { UNSUPPORTED_GLOBALS[n] = true; });

  /* ------------------------------------------------------------------ */
  /* Ambiente de variáveis                                               */
  /* ------------------------------------------------------------------ */

  function Env(parent, opts) {
    this.vars = Object.create(null);
    this.consts = Object.create(null);
    this.parent = parent || null;
    this.isFunctionScope = !!(opts && opts.isFunctionScope);
    if (opts && 'thisVal' in opts) this.thisVal = opts.thisVal;
    else this.thisVal = parent ? parent.thisVal : undefined;
  }

  Env.prototype.find = function (name) {
    var e = this;
    while (e) {
      if (hasOwn.call(e.vars, name)) return e;
      e = e.parent;
    }
    return null;
  };

  /* ------------------------------------------------------------------ */
  /* Runtime                                                             */
  /* ------------------------------------------------------------------ */

  function Runtime(source, options) {
    options = options || {};
    this.source = source;
    this.maxSteps = options.maxSteps || DEFAULT_MAX_STEPS;
    this.maxDepth = options.maxDepth || DEFAULT_MAX_DEPTH;
    this.steps = [];
    this.output = [];
    this.nextId = 1;
    this.depth = 0;
    this.callStack = [];
    this.lastStep = null;
    this.currentLine = 1;
    this.globalEnv = null;
    this.error = null;
    this.seq = 0; /* ordem real de conclusão dos passos (para o playback) */
  }

  Runtime.prototype.run = function () {
    try {
      var ast = DSV.parse(this.source);
      var genv = this.makeGlobalEnv();
      this.hoist(ast.body, genv);
      for (var i = 0; i < ast.body.length; i++) {
        this.execStmt(ast.body[i], genv);
      }
    } catch (err) {
      if (err && err.__signal) {
        /* return/break/continue fora de contexto: mensagem clara em vez de "[object Object]" */
        this.error = {
          message: err.__signal === 'return'
            ? '"return" só pode ser usado dentro de uma função.'
            : '"' + err.__signal + '" só pode ser usado dentro de um laço.',
          line: this.currentLine || null,
          name: 'RuntimeError'
        };
      } else {
        this.error = {
          message: err && err.message ? err.message : String(err),
          line: err && err.line ? err.line : null,
          name: err && err.name ? err.name : 'Error'
        };
      }
      /* preenche o estado dos passos gravados antes do erro */
      for (var f = 0; f < this.steps.length; f++) {
        if (!this.steps[f].__filled) {
          try { this.fill(this.steps[f]); } catch (e2) { /* ignora */ }
        }
      }
    }
    /* Reordena os passos pela conclusão real: um comando que chama uma função
     * só é "concluído" depois dos passos internos dela, então ele passa a vir
     * depois deles no trace — o playback acompanha a ordem verdadeira. */
    var ordered = this.steps.slice().sort(function (a, b) {
      return (a.__seq || 0) - (b.__seq || 0);
    });
    var remap = {};
    var q;
    for (q = 0; q < ordered.length; q++) remap[ordered[q].i] = q;
    for (q = 0; q < ordered.length; q++) {
      var stp = ordered[q];
      stp.i = q;
      delete stp.__seq;
    }
    this.steps = ordered;
    for (q = 0; q < this.output.length; q++) {
      var oldIdx = this.output[q].step;
      if (remap[oldIdx] != null) this.output[q].step = remap[oldIdx];
    }
    for (var s = 0; s < this.steps.length; s++) {
      delete this.steps[s].__env;
    }
    return { steps: this.steps, output: this.output, error: this.error };
  };

  Runtime.prototype.rtError = function (msg, line) {
    var e = new Error(msg);
    e.name = 'RuntimeError';
    e.line = line || this.currentLine;
    throw e;
  };

  Runtime.prototype.defineId = function (obj) {
    if (!obj.__id) {
      Object.defineProperty(obj, '__id', { value: this.nextId++, enumerable: false, configurable: false });
    }
    return obj;
  };

  /* ------------------------------------------------------------------ */
  /* Passos e eventos                                                    */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.beginStep = function (stmt, env) {
    var step = {
      i: this.steps.length,
      line: stmt.line,
      kind: 'stmt',
      globals: null,
      locals: null,
      pointers: {},
      stack: [],
      thisVal: null,
      events: [],
      __env: env,
      __filled: false
    };
    this.steps.push(step);
    if (this.steps.length > this.maxSteps) {
      this.rtError('Limite de ' + this.maxSteps + ' passos atingido — possível laço infinito. Revise as condições de parada do seu código.', stmt.line);
    }
    this.lastStep = step;
    this.currentLine = stmt.line;
    return step;
  };

  Runtime.prototype.fill = function (step, envOverride) {
    if (step.__filled) return;
    step.__filled = true;
    step.__seq = this.seq++;
    var env = envOverride || step.__env;
    var g = this.serializeScope(this.globalEnv, true);
    var l = env && env !== this.globalEnv ? this.serializeScope(env, false) : {};
    step.globals = g;
    step.locals = l;
    step.pointers = this.collectPointers([g, l]);
    step.stack = this.callStack.map(function (f) { return { name: f.name, line: f.line }; });
    step.thisVal = null;
    if (env && env !== this.globalEnv && env.thisVal !== undefined) {
      step.thisVal = this.serialize(env.thisVal, { budget: 2000 }, 0);
    }
    delete step.__env;
  };

  Runtime.prototype.emitEvent = function (ev) {
    if (this.lastStep) this.lastStep.events.push(ev);
  };

  /* ------------------------------------------------------------------ */
  /* Serialização do estado                                              */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.serialize = function (value, ctx, depth) {
    ctx = ctx || { budget: 6000 };
    depth = depth || 0;
    if (ctx.budget <= 0) return { t: 'trunc', n: 0 };
    ctx.budget--;

    if (value === undefined || value === null) return { t: 'p', v: value };
    var tp = typeof value;
    if (tp === 'number' || tp === 'string' || tp === 'boolean') return { t: 'p', v: value };
    if (tp !== 'object') return { t: 'p', v: String(value) };
    if (depth > 25) return { t: 'trunc', n: 0 };

    if (value.__fn) return { t: 'fn', name: value.name || '' };
    if (value.__class === true) return { t: 'c', name: value.name };

    /* Referências de volta (ex.: "nodeA.next = nodeB; nodeB.prev = nodeA")
     * viram uma referência curta em vez de reabrir o objeto ainda em
     * serialização. Sem isso, uma lista duplamente encadeada consome todo o
     * orçamento no vai-e-vem prev/next e a cadeia (e #tail/#length) sai
     * truncada. A referência aponta para o id do nó, que continua
     * serializado por inteiro na primeira ocorrência. */
    var stack = ctx.stack || (ctx.stack = []);
    if (stack.indexOf(value) >= 0) {
      return value.__id != null ? { t: 'ref', id: value.__id } : { t: 'trunc', n: 0 };
    }
    /* objetos já serializados neste passo são reaproveitados: o mesmo nó
     * alcançado por duas variáveis não é copiado duas vezes */
    var done = ctx.done || (ctx.done = Object.create(null));
    if (value.__id != null && done[value.__id]) return done[value.__id];

    stack.push(value);
    var result;
    if (Array.isArray(value)) {
      var items = [];
      var max = Math.min(value.length, 200);
      for (var i = 0; i < max; i++) {
        /* posição apagada com "delete" fica como buraco (como no JS real:
         * length não diminui e o índice nem existe) — marcado para o
         * visualizador não confundir "vazio" com um undefined armazenado */
        if (!(i in value)) items.push({ t: 'p', v: undefined, hole: true });
        else items.push(this.serialize(value[i], ctx, depth + 1));
      }
      if (value.length > max) items.push({ t: 'trunc', n: value.length - max });
      result = { t: 'a', id: value.__id, items: items };
    } else {
      var props = {};
      var keys = Object.keys(value);
      var limit = Math.min(keys.length, 100);
      var count = 0;
      for (var k = 0; k < limit; k++) {
        props[keys[k]] = this.serialize(value[keys[k]], ctx, depth + 1);
        count++;
      }
      /* campos privados entram nos painéis como "#nome" (o valor real fica
       * no mapa interno __priv da instância) */
      if (value.__priv) {
        var pkeys = Object.keys(value.__priv);
        for (var pk = 0; pk < pkeys.length && count < 100; pk++) {
          props[pkeys[pk]] = this.serialize(value.__priv[pkeys[pk]], ctx, depth + 1);
          count++;
        }
      }
      result = { t: 'o', id: value.__id, ctor: value.__class ? value.__class.name : null, props: props };
    }
    stack.pop();
    if (value.__id != null) done[value.__id] = result;
    return result;
  };

  /* Variáveis visíveis: sobe a cadeia de escopos até o escopo global.
   * Assim, dentro de um bloco, ainda vemos as variáveis da função;
   * é o que permite desenhar os "ponteiros" (atual, no, ...) na estrutura. */
  Runtime.prototype.serializeScope = function (env, includeGlobal) {
    var out = {};
    if (!env) return out;
    var ctx = { budget: 8000 };
    var seen = {};
    var e = env;
    while (e && e !== this.builtinsEnv) {
      if (!includeGlobal && e === this.globalEnv) break;
      var keys = Object.keys(e.vars);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.indexOf('__') === 0 || seen[k]) continue;
        seen[k] = 1;
        out[k] = this.serialize(e.vars[k], ctx, 0);
      }
      e = e.parent;
    }
    return out;
  };

  Runtime.prototype.collectPointers = function (maps) {
    var pointers = {};

    function walk(sv, label, depth) {
      if (!sv || typeof sv !== 'object') return;
      if (sv.t !== 'a' && sv.t !== 'o') return;
      if (sv.id != null) {
        if (!pointers[sv.id]) pointers[sv.id] = [];
        var list = pointers[sv.id];
        if (list.length < 8 && list.indexOf(label) < 0) list.push(label);
      }
      if (depth >= 4) return;
      if (sv.t === 'a') {
        var n = Math.min(sv.items.length, 30);
        for (var i = 0; i < n; i++) walk(sv.items[i], label + '[' + i + ']', depth + 1);
      } else {
        var keys = Object.keys(sv.props || {});
        var m = Math.min(keys.length, 30);
        for (var j = 0; j < m; j++) walk(sv.props[keys[j]], label + '.' + keys[j], depth + 1);
      }
    }

    maps.forEach(function (map) {
      Object.keys(map).forEach(function (name) { walk(map[name], name, 0); });
    });
    return pointers;
  };

  /* ------------------------------------------------------------------ */
  /* Statements                                                          */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.execStmt = function (stmt, env) {
    this.currentLine = stmt.line;
    switch (stmt.type) {
      case 'Empty': return;
      case 'Block': return this.execBlock(stmt, env, false);
      case 'VarDecl': return this.execVarDecl(stmt, env);
      case 'ExprStmt': return this.execExprStmt(stmt, env);
      case 'If': return this.execIf(stmt, env);
      case 'While': return this.execWhile(stmt, env);
      case 'DoWhile': return this.execDoWhile(stmt, env);
      case 'For': return this.execFor(stmt, env);
      case 'ForOf': return this.execForOf(stmt, env);
      case 'Return': return this.execReturn(stmt, env);
      case 'Break': return this.execBreak(stmt, env);
      case 'Continue': return this.execContinue(stmt, env);
      case 'FunctionDecl': return this.execFunctionDecl(stmt, env);
      case 'ClassDecl': return this.execClassDecl(stmt, env);
      default: this.rtError('Comando não suportado: ' + stmt.type, stmt.line);
    }
  };

  Runtime.prototype.execBlock = function (block, env, reuseEnv) {
    var target = reuseEnv ? env : new Env(env);
    this.hoist(block.body, target);
    for (var i = 0; i < block.body.length; i++) {
      this.execStmt(block.body[i], target);
    }
  };

  Runtime.prototype.hoist = function (body, env) {
    for (var i = 0; i < body.length; i++) {
      var s = body[i];
      if (s.type === 'FunctionDecl') {
        env.vars[s.id.name] = this.makeFunction(s, env);
      }
    }
  };

  Runtime.prototype.scopeForDeclare = function (env, kind) {
    if (kind !== 'var') return env;
    var e = env;
    while (e && !e.isFunctionScope) e = e.parent;
    return e || env;
  };

  Runtime.prototype.declare = function (env, kind, name, value) {
    var target = this.scopeForDeclare(env, kind);
    target.vars[name] = value;
    if (kind === 'const') target.consts[name] = true;
    else delete target.consts[name];
  };

  Runtime.prototype.execVarDecl = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    for (var i = 0; i < stmt.declarations.length; i++) {
      var d = stmt.declarations[i];
      var value = d.init ? this.evalExpr(d.init, env) : undefined;
      this.declare(env, stmt.kind, d.name, value);
    }
    this.fill(step);
  };

  Runtime.prototype.execExprStmt = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    this.evalExpr(stmt.expr, env);
    this.fill(step);
  };

  Runtime.prototype.execIf = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    var ok = this.truthy(this.evalExpr(stmt.test, env));
    this.fill(step);
    if (ok) this.execStmt(stmt.consequent, env);
    else if (stmt.alternate) this.execStmt(stmt.alternate, env);
  };

  Runtime.prototype.execWhile = function (stmt, env) {
    while (true) {
      var step = this.beginStep(stmt, env);
      var ok = this.truthy(this.evalExpr(stmt.test, env));
      this.fill(step);
      if (!ok) break;
      try {
        this.execStmt(stmt.body, env);
      } catch (sig) {
        if (sig && sig.__signal === 'break') break;
        if (sig && sig.__signal === 'continue') continue;
        throw sig;
      }
    }
  };

  Runtime.prototype.execDoWhile = function (stmt, env) {
    while (true) {
      try {
        this.execStmt(stmt.body, env);
      } catch (sig) {
        if (sig && sig.__signal === 'break') break;
        if (sig && sig.__signal === 'continue') { /* segue para o teste */ }
        else throw sig;
      }
      var step = this.beginStep(stmt, env);
      var ok = this.truthy(this.evalExpr(stmt.test, env));
      this.fill(step);
      if (!ok) break;
    }
  };

  Runtime.prototype.execFor = function (stmt, env) {
    var loopEnv = env;
    var headNames = null;
    if (stmt.init && stmt.init.type === 'VarDecl' && stmt.init.kind !== 'var') {
      loopEnv = new Env(env);
      headNames = stmt.init.declarations.map(function (d) { return d.name; });
    }
    var first = true;
    while (true) {
      var step = this.beginStep(stmt, loopEnv);
      if (first) {
        if (stmt.init) {
          if (stmt.init.type === 'VarDecl') {
            for (var i = 0; i < stmt.init.declarations.length; i++) {
              var d = stmt.init.declarations[i];
              var v = d.init ? this.evalExpr(d.init, loopEnv) : undefined;
              this.declare(loopEnv, stmt.init.kind, d.name, v);
            }
          } else {
            this.evalExpr(stmt.init, loopEnv);
          }
        }
        first = false;
      }
      var ok = stmt.test ? this.truthy(this.evalExpr(stmt.test, loopEnv)) : true;
      this.fill(step);
      if (!ok) break;
      try {
        this.execStmt(stmt.body, loopEnv);
      } catch (sig) {
        if (sig && sig.__signal === 'break') break;
        if (sig && sig.__signal === 'continue') { /* roda o update abaixo */ }
        else throw sig;
      }
      /* como no JS real: cada iteração do for com let/const tem a sua própria
       * variável, então closures capturam o valor daquela iteração; a cópia
       * acontece antes do update (o update roda já no novo ambiente). */
      if (headNames) {
        var nextEnv = new Env(env);
        for (var h = 0; h < headNames.length; h++) {
          nextEnv.vars[headNames[h]] = loopEnv.vars[headNames[h]];
          if (loopEnv.consts[headNames[h]]) nextEnv.consts[headNames[h]] = true;
        }
        loopEnv = nextEnv;
      }
      if (stmt.update) this.evalExpr(stmt.update, loopEnv);
    }
  };

  Runtime.prototype.execForOf = function (stmt, env) {
    var iterable = this.evalExpr(stmt.right, env);
    var items;
    if (Array.isArray(iterable)) items = iterable.slice();
    else if (typeof iterable === 'string') items = iterable.split('');
    else this.rtError('O for-of funciona com arrays e strings (recebi ' + this.typeName(iterable) + ')', stmt.line);

    for (var i = 0; i < items.length; i++) {
      var step = this.beginStep(stmt, env);
      var iterEnv = new Env(env);
      this.declare(iterEnv, stmt.kind, stmt.name, items[i]);
      this.fill(step, iterEnv);
      try {
        this.execStmt(stmt.body, iterEnv);
      } catch (sig) {
        if (sig && sig.__signal === 'break') break;
        if (sig && sig.__signal === 'continue') continue;
        throw sig;
      }
    }
  };

  Runtime.prototype.execReturn = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    var value = stmt.arg ? this.evalExpr(stmt.arg, env) : undefined;
    this.fill(step);
    throw { __signal: 'return', value: value };
  };

  Runtime.prototype.execBreak = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    this.fill(step);
    throw { __signal: 'break' };
  };

  Runtime.prototype.execContinue = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    this.fill(step);
    throw { __signal: 'continue' };
  };

  Runtime.prototype.execFunctionDecl = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    env.vars[stmt.id.name] = this.makeFunction(stmt, env);
    this.fill(step);
  };

  Runtime.prototype.execClassDecl = function (stmt, env) {
    var step = this.beginStep(stmt, env);
    var cls = {
      __class: true,
      name: stmt.name,
      methods: {},
      privMethods: Object.create(null),
      privFields: Object.create(null),
      fields: [],
      ctor: null,
      env: env
    };
    var i;
    for (i = 0; i < stmt.methods.length; i++) {
      var m = stmt.methods[i];
      var synth = {
        type: 'Method',
        id: { name: m.isConstructor ? stmt.name : m.name },
        params: m.params,
        body: m.body,
        line: m.line
      };
      var fn = this.makeFunction(synth, env);
      if (m.isConstructor) cls.ctor = fn;
      else if (m.isPrivate) cls.privMethods[m.name] = fn;
      else cls.methods[m.name] = fn;
    }
    var fields = stmt.fields || [];
    for (i = 0; i < fields.length; i++) {
      var f = fields[i];
      cls.fields.push({ name: f.name, isPrivate: f.isPrivate, init: f.init, line: f.line });
      if (f.isPrivate) cls.privFields[f.name] = true;
    }
    env.vars[stmt.name] = cls;
    this.fill(step);
  };

  /* Campos de instância (#privados e públicos) rodam antes do constructor,
   * como no JavaScript de verdade. */
  Runtime.prototype.initFields = function (obj, cls) {
    if (!cls.fields || !cls.fields.length) return;
    var hasPrivate = false;
    for (var i = 0; i < cls.fields.length; i++) {
      if (cls.fields[i].isPrivate) { hasPrivate = true; break; }
    }
    if (hasPrivate) {
      Object.defineProperty(obj, '__priv', { value: Object.create(null), enumerable: false, configurable: false, writable: false });
    }
    var fieldEnv = new Env(cls.env, { isFunctionScope: true, thisVal: obj });
    for (var j = 0; j < cls.fields.length; j++) {
      var f = cls.fields[j];
      var fstep = this.beginStep(f, fieldEnv);
      var value = f.init ? this.evalExpr(f.init, fieldEnv) : undefined;
      if (f.isPrivate) obj.__priv[f.name] = value;
      else obj[f.name] = value;
      this.fill(fstep);
    }
  };

  Runtime.prototype.getPrivateMember = function (obj, name, line) {
    if (obj === null || obj === undefined) {
      this.rtError('Não é possível ler "' + name + '" de ' + (obj === null ? 'null' : 'undefined') + '.', line);
    }
    var cls = obj.__class;
    if (cls && cls.privMethods && hasOwn.call(cls.privMethods, name)) return cls.privMethods[name];
    if (obj.__priv && hasOwn.call(obj.__priv, name)) return obj.__priv[name];
    this.rtError('O campo privado "' + name + '" não existe' + (cls ? ' na classe "' + cls.name + '"' : '') + '. Ele só pode ser usado dentro da classe que o declara.', line);
  };

  Runtime.prototype.setPrivateMember = function (obj, name, value, line) {
    if (obj === null || obj === undefined) {
      this.rtError('Não é possível definir "' + name + '" em ' + (obj === null ? 'null' : 'undefined') + '.', line);
    }
    var cls = obj.__class;
    if (cls && cls.privFields && hasOwn.call(cls.privFields, name)) {
      obj.__priv[name] = value;
      return;
    }
    if (cls && cls.privMethods && hasOwn.call(cls.privMethods, name)) {
      this.rtError('"' + name + '" é um método privado e não pode ser reatribuído.', line);
    }
    this.rtError('O campo privado "' + name + '" não foi declarado' + (cls ? ' na classe "' + cls.name + '"' : '') + '.', line);
  };

  /* ------------------------------------------------------------------ */
  /* Funções                                                             */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.makeFunction = function (node, env) {
    var isArrow = node.type === 'Arrow';
    return {
      __fn: true,
      native: false,
      name: isArrow ? '' : (node.id ? node.id.name : (node.name || '')),
      params: (node.params || []).map(function (p) { return p.name; }),
      body: node.body,
      exprBody: !!node.exprBody,
      env: env,
      lexicalThis: env.thisVal,
      isArrow: isArrow,
      line: node.line
    };
  };

  Runtime.prototype.callFunction = function (fn, thisVal, args, callLine, callName) {
    if (fn.native) return fn.impl(this, thisVal, args, callLine);

    if (this.depth >= this.maxDepth) {
      this.rtError('Profundidade de chamadas excedida (' + this.maxDepth + '). Se a recursão é finita, reduza a profundidade ou transforme-a em iterativa; se não há caso-base, é recursão infinita.', callLine);
    }
    this.depth++;

    var thisForCall = fn.isArrow ? fn.lexicalThis : thisVal;
    var fnEnv = new Env(fn.env, { isFunctionScope: true, thisVal: thisForCall });
    for (var i = 0; i < fn.params.length; i++) {
      fnEnv.vars[fn.params[i]] = i < args.length ? args[i] : undefined;
    }

    var fname = fn.name || callName || '(anônima)';
    this.callStack.push({ name: fname, line: callLine });

    var result;
    try {
      if (fn.exprBody) {
        result = this.evalExpr(fn.body, fnEnv);
      } else {
        this.execBlock(fn.body, fnEnv, true);
        result = undefined;
      }
    } catch (sig) {
      if (sig && sig.__signal === 'return') {
        result = sig.value;
      } else if (sig && (sig.__signal === 'break' || sig.__signal === 'continue')) {
        this.callStack.pop();
        this.depth--;
        this.rtError('"' + sig.__signal + '" usado fora de um laço', callLine);
      } else {
        this.callStack.pop();
        this.depth--;
        throw sig;
      }
    }

    this.callStack.pop();
    this.depth--;
    return result;
  };

  /* ------------------------------------------------------------------ */
  /* Expressões                                                          */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.evalExpr = function (node, env) {
    if (node.line) this.currentLine = node.line;
    switch (node.type) {
      case 'Literal': return node.value;
      case 'Template': {
        var out = '';
        for (var i = 0; i < node.parts.length; i++) {
          var p = node.parts[i];
          out += p.kind === 'str' ? p.value : this.toStr(this.evalExpr(p.value, env));
        }
        return out;
      }
      case 'Ident': {
        var owner = env.find(node.name);
        if (!owner) {
          if (UNSUPPORTED_GLOBALS[node.name]) {
            var dica = (node.name === 'Set' || node.name === 'Map') ? ' (não há Map/Set)' : '';
            this.rtError('"' + node.name + '" não é suportado neste visualizador' + dica + '.', node.line);
          }
          this.rtError('"' + node.name + '" não foi definido', node.line);
        }
        return owner.vars[node.name];
      }
      case 'This': return env.thisVal;
      case 'ArrayLit': {
        var arr = [];
        this.defineId(arr);
        for (var a = 0; a < node.elements.length; a++) {
          arr.push(this.evalExpr(node.elements[a], env));
        }
        return arr;
      }
      case 'ObjectLit': {
        var obj = {};
        this.defineId(obj);
        for (var o = 0; o < node.props.length; o++) {
          var pr = node.props[o];
          obj[pr.key] = this.evalExpr(pr.value, env);
        }
        return obj;
      }
      case 'Member': {
        var base = this.evalExpr(node.obj, env);
        if (node.priv) return this.getPrivateMember(base, node.prop, node.line);
        return this.getMember(base, node.prop, node.line);
      }
      case 'Index': {
        var baseI = this.evalExpr(node.obj, env);
        var key = this.evalExpr(node.prop, env);
        if (Array.isArray(baseI) || typeof baseI === 'string') {
          var n = typeof key === 'number' ? key : this.toNum(key);
          if (!isNaN(n)) return this.getMember(baseI, String(n), node.line);
        }
        return this.getMember(baseI, this.toStr(key), node.line);
      }
      case 'Call': return this.evalCall(node, env);
      case 'New': return this.evalNew(node, env);
      case 'Binary': {
        var left = this.evalExpr(node.left, env);
        var right = this.evalExpr(node.right, env);
        return this.binaryOp(node.op, left, right, node.line);
      }
      case 'Logical': {
        var lv = this.evalExpr(node.left, env);
        if (node.op === '&&') return this.truthy(lv) ? this.evalExpr(node.right, env) : lv;
        return this.truthy(lv) ? lv : this.evalExpr(node.right, env);
      }
      case 'Unary': return this.evalUnary(node, env);
      case 'Delete': return this.evalDelete(node, env);
      case 'Assign': return this.evalAssign(node, env);
      case 'Conditional': {
        return this.truthy(this.evalExpr(node.test, env))
          ? this.evalExpr(node.consequent, env)
          : this.evalExpr(node.alternate, env);
      }
      case 'FunctionExpr':
      case 'Arrow':
        return this.makeFunction(node, env);
      default:
        this.rtError('Expressão não suportada: ' + node.type, node.line);
    }
  };

  Runtime.prototype.evalUnary = function (node, env) {
    var op = node.op;
    if (op === 'typeof') {
      if (node.arg.type === 'Ident') {
        var owner = env.find(node.arg.name);
        if (!owner) return 'undefined';
        return this.typeofOf(owner.vars[node.arg.name]);
      }
      return this.typeofOf(this.evalExpr(node.arg, env));
    }
    if (op === '!') return !this.truthy(this.evalExpr(node.arg, env));
    if (op === '-') return -this.toNum(this.evalExpr(node.arg, env));
    if (op === '+') return this.toNum(this.evalExpr(node.arg, env));
    if (op === '++' || op === '--') {
      /* a referência do alvo é resolvida UMA vez (como no JS real): efeitos
       * colaterais na base/índice não podem acontecer duas vezes */
      var ref = this.evalTargetRef(node.arg, env);
      var old = ref.get();
      var nv = this.binaryOp(op === '++' ? '+' : '-', old, 1, node.line);
      ref.set(nv);
      return node.prefix ? nv : old;
    }
    this.rtError('Operador não suportado: ' + op, node.line);
  };

  Runtime.prototype.evalDelete = function (node, env) {
    var target = node.arg;
    if (target.type === 'Member') {
      var base = this.evalExpr(target.obj, env);
      if (target.priv) this.rtError('Campos privados não podem ser apagados com "delete"', node.line);
      if (base === null || base === undefined) {
        this.rtError('Não é possível apagar "' + target.prop + '" de ' + (base === null ? 'null' : 'undefined') + '.', node.line);
      }
      if (typeof base === 'string') {
        this.rtError('Strings são imutáveis: não é possível apagar "' + target.prop + '"', node.line);
      }
      if (base.__class === true) {
        this.rtError('Não é possível alterar a classe "' + base.name + '" diretamente', node.line);
      }
      delete base[target.prop];
      return true;
    }
    if (target.type === 'Index') {
      var baseI = this.evalExpr(target.obj, env);
      var key = this.evalExpr(target.prop, env);
      if (baseI === null || baseI === undefined) {
        this.rtError('Não é possível apagar um índice de ' + (baseI === null ? 'null' : 'undefined') + '.', node.line);
      }
      if (typeof baseI === 'string') {
        this.rtError('Strings são imutáveis: não é possível apagar um índice', node.line);
      }
      if (baseI.__class === true) {
        this.rtError('Não é possível alterar a classe "' + baseI.name + '" diretamente', node.line);
      }
      delete baseI[this.toStr(key)];
      return true;
    }
    this.rtError('"delete" só funciona em propriedades (obj.campo ou obj[índice])', node.line);
  };

  Runtime.prototype.evalAssign = function (node, env) {
    /* a referência do alvo é resolvida uma única vez (base e índice/propriedade
     * são avaliados aqui), como no JS real; assim atribuições compostas e ++/--
     * não reavaliam efeitos colaterais */
    var ref = this.evalTargetRef(node.target, env);
    var value;
    if (node.op === '=') {
      value = this.evalExpr(node.value, env);
    } else {
      var old = ref.get();
      var rhs = this.evalExpr(node.value, env);
      value = this.binaryOp(node.op.charAt(0), old, rhs, node.line);
    }
    ref.set(value);
    return value;
  };

  /* Resolve o alvo de atribuição (Ident, Member ou Index) avaliando base e
   * índice/propriedade UMA única vez e devolve get/set sobre a referência. */
  Runtime.prototype.evalTargetRef = function (target, env) {
    var self = this;
    if (target.type === 'Ident') {
      var owner = env.find(target.name);
      if (!owner) this.rtError('"' + target.name + '" não foi definido. Crie a variável com let/const antes de usá-la.', target.line);
      var isConst = !!owner.consts[target.name];
      return {
        get: function () { return owner.vars[target.name]; },
        set: function (v) {
          if (isConst) self.rtError('"' + target.name + '" é uma constante e não pode ser reatribuída.', target.line);
          owner.vars[target.name] = v;
        }
      };
    }
    if (target.type === 'Member') {
      var base = this.evalExpr(target.obj, env);
      if (target.priv) {
        return {
          get: function () { return self.getPrivateMember(base, target.prop, target.line); },
          set: function (v) { self.setPrivateMember(base, target.prop, v, target.line); }
        };
      }
      return {
        get: function () { return self.getMember(base, target.prop, target.line); },
        set: function (v) { self.setMember(base, target.prop, v, target.line); }
      };
    }
    if (target.type === 'Index') {
      var baseI = this.evalExpr(target.obj, env);
      var key = this.evalExpr(target.prop, env);
      var name;
      if (Array.isArray(baseI) || typeof baseI === 'string') {
        var n = typeof key === 'number' ? key : this.toNum(key);
        if (!isNaN(n)) name = String(n);
      }
      if (name === undefined) name = this.toStr(key);
      return {
        get: function () { return self.getMember(baseI, name, target.line); },
        set: function (v) { self.setMember(baseI, name, v, target.line); }
      };
    }
    this.rtError('Alvo de atribuição inválido', target.line);
  };

  Runtime.prototype.evalNew = function (node, env) {
    var cls = this.evalExpr(node.callee, env);
    if (!cls || cls.__class !== true) {
      var name = node.callee.type === 'Ident' ? node.callee.name : 'valor';
      if (cls && cls.__builtinCtor) {
        this.rtError('"new ' + cls.__builtinCtor + '(...)" não é suportado neste visualizador. Crie o valor com um literal (ex.: [] ou {}) e use os métodos disponíveis.', node.line);
      }
      this.rtError('"' + name + '" não é uma classe. Declare com "class ' + (node.callee.type === 'Ident' ? name : 'Nome') + ' { ... }"', node.line);
    }
    /* como no JS real: os argumentos são avaliados ANTES de criar o objeto e
     * rodar os inicializadores de campo */
    var args = [];
    for (var i = 0; i < node.args.length; i++) args.push(this.evalExpr(node.args[i], env));
    var obj = {};
    this.defineId(obj);
    Object.defineProperty(obj, '__class', { value: cls, enumerable: false, configurable: false });
    this.initFields(obj, cls);
    if (cls.ctor) this.callFunction(cls.ctor, obj, args, node.line, 'new ' + cls.name);
    return obj;
  };

  Runtime.prototype.evalCall = function (node, env) {
    var callee = node.callee;
    var fn = null;
    var thisVal;
    var errName = '';
    var args;

    if (callee.type === 'Member' || callee.type === 'Index') {
      var obj = this.evalExpr(callee.obj, env);
      var prop = callee.type === 'Member' ? callee.prop : this.toStr(this.evalExpr(callee.prop, env));
      var isPriv = callee.type === 'Member' && !!callee.priv;
      thisVal = obj;
      errName = prop;

      if (obj === null || obj === undefined) {
        this.rtError('Não é possível chamar "' + prop + '" de ' + (obj === null ? 'null' : 'undefined') + '. Verifique se o objeto já foi criado.', node.line);
      }
      if (isPriv) {
        fn = this.getPrivateMember(obj, prop, node.line);
        args = this.evalArgs(node, env);
      } else {
        if (typeof obj === 'string' && !hasOwn.call(obj, prop)) {
          args = this.evalArgs(node, env);
          return this.callStringMethod(obj, prop, args, node.line);
        }
        if (Array.isArray(obj) && !(hasOwn.call(obj, prop) && obj[prop] && obj[prop].__fn)) {
          args = this.evalArgs(node, env);
          return this.callArrayMethod(obj, prop, args, node.line);
        }
        fn = this.getMember(obj, prop, node.line);
        args = this.evalArgs(node, env);
      }
    } else {
      fn = this.evalExpr(callee, env);
      if (callee.type === 'Ident') errName = callee.name;
      args = this.evalArgs(node, env);
    }

    if (!fn || fn.__fn !== true) {
      this.rtError('"' + (errName || 'valor') + '" não é uma função', node.line);
    }
    return this.callFunction(fn, thisVal, args, node.line, errName || fn.name);
  };

  Runtime.prototype.evalArgs = function (node, env) {
    var args = [];
    for (var i = 0; i < node.args.length; i++) args.push(this.evalExpr(node.args[i], env));
    return args;
  };

  Runtime.prototype.getMember = function (obj, name, line) {
    if (obj === null || obj === undefined) {
      this.rtError('Não é possível ler a propriedade "' + name + '" de ' + (obj === null ? 'null' : 'undefined') + '. Verifique se o valor já foi criado.', line);
    }
    if (typeof obj === 'string') {
      if (name === 'length') return obj.length;
      if (/^[0-9]+$/.test(name)) {
        var si = Number(name);
        return si < obj.length ? obj[si] : undefined;
      }
      if (STRING_METHODS[name]) return this.nativeMethod(obj, name);
      return undefined;
    }
    if (Array.isArray(obj)) {
      if (name === 'length') return obj.length;
      if (/^[0-9]+$/.test(name)) {
        var ix = Number(name);
        return ix < obj.length ? obj[ix] : undefined;
      }
      if (hasOwn.call(obj, name)) return obj[name];
      if (ARRAY_METHODS[name]) return this.nativeMethod(obj, name);
      return undefined;
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      if (name === 'toString') return this.nativeMethod(obj, 'toString');
      return undefined;
    }
    if (obj.__fn) {
      if (name === 'name') return obj.name;
      if (obj.statics && hasOwn.call(obj.statics, name)) return obj.statics[name];
      return undefined;
    }
    if (obj.__class === true) {
      if (name === 'name') return obj.name;
      return undefined;
    }
    if (hasOwn.call(obj, name)) return obj[name];
    if (obj.__class && obj.__class.methods && obj.__class.methods[name]) {
      return obj.__class.methods[name];
    }
    return undefined;
  };

  Runtime.prototype.nativeMethod = function (target, name) {
    var rt = this;
    return {
      __fn: true,
      native: true,
      name: name,
      boundThis: target,
      impl: function (runtime, thisVal, args) {
        var recv = thisVal !== undefined ? thisVal : target;
        if (Array.isArray(recv)) return rt.callArrayMethod(recv, name, args, rt.currentLine);
        if (typeof recv === 'string') return rt.callStringMethod(recv, name, args, rt.currentLine);
        if (typeof recv === 'number') return String(recv);
        return undefined;
      }
    };
  };

  Runtime.prototype.setMember = function (obj, name, value, line) {
    if (obj === null || obj === undefined) {
      this.rtError('Não é possível definir "' + name + '" em ' + (obj === null ? 'null' : 'undefined') + '.', line);
    }
    if (typeof obj === 'string') {
      this.rtError('Strings são imutáveis: não é possível alterar "' + name + '"', line);
    }
    if (Array.isArray(obj)) {
      if (name === 'length') {
        /* como no JS real: precisa ser inteiro entre 0 e 2^32-1; crescer o
         * length deixa buracos (não valores undefined) nas posições novas */
        var n = this.toNum(value);
        if (typeof n !== 'number' || Number.isNaN(n) || n < 0 || n > 4294967295 || Math.trunc(n) !== n) {
          this.rtError('Tamanho de array inválido: ' + this.toStr(value), line);
        }
        obj.length = n;
        return;
      }
      if (/^[0-9]+$/.test(name)) {
        /* escrita por índice: o array real cresce sozinho e deixa buracos nas
         * posições puladas — buraco ≠ um undefined armazenado */
        obj[Number(name)] = value;
        return;
      }
      obj[name] = value;
      return;
    }
    if (obj.__class === true) {
      this.rtError('Não é possível alterar a classe "' + obj.name + '" diretamente', line);
    }
    obj[name] = value;
  };

  /* ------------------------------------------------------------------ */
  /* Operadores                                                          */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.truthy = function (v) {
    if (v === false || v === 0 || v === '' || v === null || v === undefined) return false;
    if (typeof v === 'number' && Number.isNaN(v)) return false;
    return true;
  };

  Runtime.prototype.typeofOf = function (v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'object';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'boolean') return 'boolean';
    if (v && (v.__fn || v.__class === true)) return 'function';
    return 'object';
  };

  Runtime.prototype.typeName = function (v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (Array.isArray(v)) return 'array';
    if (v && v.__fn) return 'função';
    if (v && v.__class === true) return 'classe';
    if (v && v.__class) return 'objeto ' + v.__class.name;
    return typeof v;
  };

  Runtime.prototype.toNum = function (v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null) return 0;
    if (v === undefined) return NaN;
    if (typeof v === 'string') {
      var s = v.trim();
      if (s === '') return 0;
      return Number(s);
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return 0;
      if (v.length === 1) return this.toNum(v[0]);
      return NaN;
    }
    return NaN;
  };

  Runtime.prototype.toStr = function (v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'number') return DSV.fmtNumber(v);
    if (typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      var self = this;
      return v.map(function (x) {
        return (x === null || x === undefined) ? '' : self.toStr(x);
      }).join(',');
    }
    if (v && v.__fn) return 'function ' + (v.name || '(anônima)') + '() { … }';
    if (v && v.__class === true) return 'class ' + v.name + ' { … }';
    return '[object Object]';
  };

  Runtime.prototype.strictEq = function (a, b) {
    if (typeof a !== typeof b) return false;
    if (typeof a === 'number') return !Number.isNaN(a) && !Number.isNaN(b) && a === b;
    if (typeof a === 'string' || typeof a === 'boolean') return a === b;
    if (a === null || b === null) return a === b;
    if (a === undefined || b === undefined) return a === b;
    return a === b; /* objetos/arrays: mesma referência */
  };

  Runtime.prototype.looseEq = function (a, b) {
    if (this.strictEq(a, b)) return true;
    if ((a === null && b === undefined) || (a === undefined && b === null)) return true;
    /* dois objetos/arrays: no JS real a igualdade frouxa entre eles é a
     * própria identidade (já testada acima) — não converter para string */
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) return false;
    var ta = typeof a, tb = typeof b;
    if ((ta === 'number' || ta === 'boolean') && (tb === 'number' || tb === 'string' || tb === 'boolean')) {
      return this.toNum(a) === this.toNum(b);
    }
    if ((tb === 'number' || tb === 'boolean') && ta === 'string') {
      return this.toNum(a) === this.toNum(b);
    }
    if ((ta === 'object' && a !== null && !Array.isArray(a) && !a.__fn && !a.__class) || Array.isArray(a)) {
      return this.looseEq(this.toStr(a), b);
    }
    if ((tb === 'object' && b !== null && !Array.isArray(b) && !b.__fn && !b.__class) || Array.isArray(b)) {
      return this.looseEq(a, this.toStr(b));
    }
    return false;
  };

  Runtime.prototype.binaryOp = function (op, a, b, line) {
    var self = this;
    switch (op) {
      case '+': {
        if (typeof a === 'string' || typeof b === 'string') return this.toStr(a) + this.toStr(b);
        if (a === undefined || b === undefined) return NaN;
        if (typeof a === 'object' && a !== null || typeof b === 'object' && b !== null) {
          return this.toStr(a) + this.toStr(b);
        }
        return this.toNum(a) + this.toNum(b);
      }
      case '-': return this.toNum(a) - this.toNum(b);
      case '*': return this.toNum(a) * this.toNum(b);
      case '/': return this.toNum(a) / this.toNum(b);
      case '%': return this.toNum(a) % this.toNum(b);
      case '<': case '>': case '<=': case '>=': {
        if (typeof a === 'string' && typeof b === 'string') {
          if (op === '<') return a < b;
          if (op === '>') return a > b;
          if (op === '<=') return a <= b;
          return a >= b;
        }
        var x = this.toNum(a), y = this.toNum(b);
        if (Number.isNaN(x) || Number.isNaN(y)) return false;
        if (op === '<') return x < y;
        if (op === '>') return x > y;
        if (op === '<=') return x <= y;
        return x >= y;
      }
      case '==': return this.looseEq(a, b);
      case '!=': return !this.looseEq(a, b);
      case '===': return this.strictEq(a, b);
      case '!==': return !this.strictEq(a, b);
      case 'instanceof': {
        if (b && b.__class === true) {
          var c = a && a.__class;
          return c === b;
        }
        if (b && b.__builtinCtor) {
          switch (b.__builtinCtor) {
            case 'Array': return Array.isArray(a);
            case 'String': return typeof a === 'string';
            case 'Number': return typeof a === 'number';
            case 'Boolean': return typeof a === 'boolean';
            case 'Object': return a !== null && typeof a === 'object' && !Array.isArray(a) && !a.__fn && a.__class !== true;
          }
        }
        return false;
      }
    }
    this.rtError('Operador não suportado: ' + op, line);
  };

  /* ------------------------------------------------------------------ */
  /* Métodos nativos de arrays e strings                                 */
  /* ------------------------------------------------------------------ */

  var ARRAY_METHODS = Object.create(null);
  ['push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat',
    'join', 'indexOf', 'lastIndexOf', 'includes', 'reverse', 'sort',
    'forEach', 'map', 'filter', 'find', 'findIndex', 'reduce',
    'some', 'every', 'toString', 'fill'].forEach(function (m) { ARRAY_METHODS[m] = 1; });

  var STRING_METHODS = Object.create(null);
  ['charAt', 'charCodeAt', 'indexOf', 'lastIndexOf', 'includes',
    'startsWith', 'endsWith', 'slice', 'substring', 'substr',
    'toUpperCase', 'toLowerCase', 'trim', 'split', 'repeat',
    'padStart', 'padEnd', 'concat', 'replace', 'toString', 'valueOf'].forEach(function (m) { STRING_METHODS[m] = 1; });

  Runtime.prototype.newArray = function (items) {
    var arr = [];
    this.defineId(arr);
    if (items) for (var i = 0; i < items.length; i++) arr.push(items[i]);
    return arr;
  };

  Runtime.prototype.callArrayMethod = function (arr, name, args, line) {
    var self = this;
    switch (name) {
      case 'push': {
        for (var i = 0; i < args.length; i++) arr.push(args[i]);
        this.emitEvent({ type: 'push', targetId: arr.__id, values: args.slice(), text: 'push(' + args.map(function (v) { return self.inspect(v, 1); }).join(', ') + ')' });
        return arr.length;
      }
      case 'pop': {
        if (arr.length === 0) return undefined;
        var v = arr.pop();
        this.emitEvent({ type: 'pop', targetId: arr.__id, value: v, text: 'pop() → ' + this.inspect(v, 1) });
        return v;
      }
      case 'shift': {
        if (arr.length === 0) return undefined;
        var s = arr.shift();
        this.emitEvent({ type: 'shift', targetId: arr.__id, value: s, text: 'shift() → ' + this.inspect(s, 1) });
        return s;
      }
      case 'unshift': {
        for (var u = args.length - 1; u >= 0; u--) arr.unshift(args[u]);
        this.emitEvent({ type: 'unshift', targetId: arr.__id, values: args.slice(), text: 'unshift(' + args.map(function (v) { return self.inspect(v, 1); }).join(', ') + ')' });
        return arr.length;
      }
      case 'splice': {
        var start = args.length > 0 ? this.toNum(args[0]) | 0 : 0;
        if (start < 0) start = Math.max(arr.length + start, 0);
        else start = Math.min(start, arr.length);
        var delCount = args.length > 1 ? Math.max(this.toNum(args[1]) | 0, 0) : arr.length - start;
        delCount = Math.min(delCount, arr.length - start);
        var removed = arr.splice.apply(arr, [start, delCount].concat(args.slice(2)));
        this.emitEvent({ type: 'splice', targetId: arr.__id, text: 'splice(' + start + ', ' + delCount + (args.length > 2 ? ', …' : '') + ')' });
        return this.newArray(removed);
      }
      case 'slice': {
        var a2 = args.length > 0 ? this.toNum(args[0]) | 0 : 0;
        var b2 = args.length > 1 && args[1] !== undefined ? this.toNum(args[1]) | 0 : arr.length;
        return this.newArray(arr.slice(a2, b2));
      }
      case 'concat': {
        var out = arr.slice();
        for (var c = 0; c < args.length; c++) {
          if (Array.isArray(args[c])) out = out.concat(args[c]);
          else out.push(args[c]);
        }
        return this.newArray(out);
      }
      case 'join': {
        var sep = args.length > 0 && args[0] !== undefined ? this.toStr(args[0]) : ',';
        return arr.map(function (x) {
          return (x === null || x === undefined) ? '' : self.toStr(x);
        }).join(sep);
      }
      case 'indexOf': {
        for (var ii = 0; ii < arr.length; ii++) if (this.strictEq(arr[ii], args[0])) return ii;
        return -1;
      }
      case 'lastIndexOf': {
        for (var li = arr.length - 1; li >= 0; li--) if (this.strictEq(arr[li], args[0])) return li;
        return -1;
      }
      case 'includes': {
        for (var inc = 0; inc < arr.length; inc++) {
          var x = arr[inc];
          if (this.strictEq(x, args[0]) || (typeof x === 'number' && typeof args[0] === 'number' && Number.isNaN(x) && Number.isNaN(args[0]))) return true;
        }
        return false;
      }
      case 'reverse': {
        arr.reverse();
        return arr;
      }
      case 'sort': {
        var cmp = args[0];
        if (cmp && cmp.__fn) {
          arr.sort(function (x, y) {
            var r = self.callFunction(cmp, undefined, [x, y], line);
            var n = self.toNum(r);
            return Number.isNaN(n) ? 0 : n;
          });
        } else {
          arr.sort(function (x, y) {
            var sx = self.toStr(x), sy = self.toStr(y);
            if (sx < sy) return -1;
            if (sx > sy) return 1;
            return 0;
          });
        }
        return arr;
      }
      case 'fill': {
        /* como o JS real: start/end opcionais, negativos contam do fim,
         * NaN vira 0 e os limites são truncados ao tamanho do array */
        var fv = args[0];
        var flen = arr.length;
        var toIdx = function (x) {
          var n = self.toNum(x);
          if (Number.isNaN(n)) return 0;
          if (n === Infinity) return flen;
          if (n === -Infinity) return 0;
          n = Math.trunc(n);
          if (n < 0) return Math.max(flen + n, 0);
          return Math.min(n, flen);
        };
        var fs = args.length > 1 && args[1] !== undefined ? toIdx(args[1]) : 0;
        var fe = args.length > 2 && args[2] !== undefined ? toIdx(args[2]) : flen;
        for (var fi = fs; fi < fe; fi++) arr[fi] = fv;
        return arr;
      }
      case 'forEach': {
        this.requireFn(args[0], 'forEach', line);
        for (var fe = 0; fe < arr.length; fe++) {
          this.callFunction(args[0], undefined, [arr[fe], fe, arr], line, 'forEach');
        }
        return undefined;
      }
      case 'map': {
        this.requireFn(args[0], 'map', line);
        var mapped = [];
        for (var mi = 0; mi < arr.length; mi++) {
          mapped.push(this.callFunction(args[0], undefined, [arr[mi], mi, arr], line, 'map'));
        }
        return this.newArray(mapped);
      }
      case 'filter': {
        this.requireFn(args[0], 'filter', line);
        var kept = [];
        for (var fi2 = 0; fi2 < arr.length; fi2++) {
          if (this.truthy(this.callFunction(args[0], undefined, [arr[fi2], fi2, arr], line, 'filter'))) kept.push(arr[fi2]);
        }
        return this.newArray(kept);
      }
      case 'find': {
        this.requireFn(args[0], 'find', line);
        for (var fni = 0; fni < arr.length; fni++) {
          if (this.truthy(this.callFunction(args[0], undefined, [arr[fni], fni, arr], line, 'find'))) return arr[fni];
        }
        return undefined;
      }
      case 'findIndex': {
        this.requireFn(args[0], 'findIndex', line);
        for (var fii = 0; fii < arr.length; fii++) {
          if (this.truthy(this.callFunction(args[0], undefined, [arr[fii], fii, arr], line, 'findIndex'))) return fii;
        }
        return -1;
      }
      case 'reduce': {
        this.requireFn(args[0], 'reduce', line);
        var acc, startIdx;
        if (args.length > 1) { acc = args[1]; startIdx = 0; }
        else {
          if (arr.length === 0) this.rtError('reduce() de um array vazio sem valor inicial', line);
          acc = arr[0];
          startIdx = 1;
        }
        for (var ri = startIdx; ri < arr.length; ri++) {
          acc = this.callFunction(args[0], undefined, [acc, arr[ri], ri, arr], line, 'reduce');
        }
        return acc;
      }
      case 'some': {
        this.requireFn(args[0], 'some', line);
        for (var si2 = 0; si2 < arr.length; si2++) {
          if (this.truthy(this.callFunction(args[0], undefined, [arr[si2], si2, arr], line, 'some'))) return true;
        }
        return false;
      }
      case 'every': {
        this.requireFn(args[0], 'every', line);
        for (var ei = 0; ei < arr.length; ei++) {
          if (!this.truthy(this.callFunction(args[0], undefined, [arr[ei], ei, arr], line, 'every'))) return false;
        }
        return true;
      }
      case 'toString': return this.callArrayMethod(arr, 'join', [','], line);
    }
    this.rtError('"' + name + '" não é um método de array suportado. Suportados: ' + Object.keys(ARRAY_METHODS).sort().join(', '), line);
  };

  Runtime.prototype.requireFn = function (v, method, line) {
    if (!v || v.__fn !== true) {
      this.rtError('O método ' + method + '() espera uma função como argumento', line);
    }
  };

  Runtime.prototype.callStringMethod = function (str, name, args, line) {
    var self = this;
    switch (name) {
      case 'charAt': {
        var i = this.toNum(args[0]) | 0;
        return i >= 0 && i < str.length ? str[i] : '';
      }
      case 'charCodeAt': {
        var ci = this.toNum(args[0]) | 0;
        return ci >= 0 && ci < str.length ? str.charCodeAt(ci) : NaN;
      }
      case 'indexOf': return str.indexOf(this.toStr(args[0]));
      case 'lastIndexOf': return str.lastIndexOf(this.toStr(args[0]));
      case 'includes': return str.indexOf(this.toStr(args[0])) >= 0;
      case 'startsWith': return str.indexOf(this.toStr(args[0])) === 0;
      case 'endsWith': {
        var sub = this.toStr(args[0]);
        return str.slice(str.length - sub.length) === sub;
      }
      case 'slice': {
        var a = args.length > 0 ? this.toNum(args[0]) | 0 : 0;
        var b = args.length > 1 && args[1] !== undefined ? this.toNum(args[1]) | 0 : str.length;
        return str.slice(a, b);
      }
      case 'substring': {
        var sa = args.length > 0 ? Math.max(this.toNum(args[0]) | 0, 0) : 0;
        var sb = args.length > 1 && args[1] !== undefined ? Math.max(this.toNum(args[1]) | 0, 0) : str.length;
        return str.substring(sa, sb);
      }
      case 'substr': {
        var st = args.length > 0 ? this.toNum(args[0]) | 0 : 0;
        var len = args.length > 1 ? this.toNum(args[1]) | 0 : undefined;
        return len === undefined ? str.substr(st) : str.substr(st, len);
      }
      case 'toUpperCase': return str.toUpperCase();
      case 'toLowerCase': return str.toLowerCase();
      case 'trim': return str.trim();
      case 'split': {
        if (args.length === 0 || args[0] === undefined) return this.newArray([str]);
        var sep = this.toStr(args[0]);
        if (sep === '') return this.newArray(str.split(''));
        return this.newArray(str.split(sep));
      }
      case 'repeat': {
        var n = Math.max(this.toNum(args[0]) | 0, 0);
        return str.repeat(n);
      }
      case 'padStart': {
        var lenP = this.toNum(args[0]) | 0;
        var pad = args.length > 1 ? this.toStr(args[1]) : ' ';
        var outP = str;
        while (outP.length < lenP) outP = pad.slice(0, Math.max(lenP - outP.length, 0)) + outP;
        return outP;
      }
      case 'padEnd': {
        var lenE = this.toNum(args[0]) | 0;
        var padE = args.length > 1 ? this.toStr(args[1]) : ' ';
        var outE = str;
        while (outE.length < lenE) outE = outE + padE.slice(0, Math.max(lenE - outE.length, 0));
        return outE;
      }
      case 'concat': return str + args.map(function (x) { return self.toStr(x); }).join('');
      case 'replace': {
        var search = this.toStr(args[0]);
        var repl = args[1] && args[1].__fn
          ? this.toStr(this.callFunction(args[1], undefined, [search], line, 'replace'))
          : this.toStr(args[1]);
        var idx = str.indexOf(search);
        if (idx < 0) return str;
        return str.slice(0, idx) + repl + str.slice(idx + search.length);
      }
      case 'toString': case 'valueOf': return str;
    }
    this.rtError('"' + name + '" não é um método de string suportado. Suportados: ' + Object.keys(STRING_METHODS).sort().join(', '), line);
  };

  /* ------------------------------------------------------------------ */
  /* Builtins globais                                                    */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.native = function (name, impl) {
    return { __fn: true, native: true, name: name, impl: impl };
  };

  Runtime.prototype.makeGlobalEnv = function () {
    var self = this;
    var builtins = new Env(null, { isFunctionScope: true });

    var consoleObj = { __ns: 'console' };
    this.defineId(consoleObj);
    function logImpl(kind) {
      return self.native('console.' + kind, function (rt, thisVal, args) {
        rt.output.push({
          step: rt.steps.length - 1,
          kind: kind,
          text: args.map(function (a) { return rt.inspect(a, 0); }).join(' ')
        });
        return undefined;
      });
    }
    consoleObj.log = logImpl('log');
    consoleObj.info = logImpl('info');
    consoleObj.warn = logImpl('warn');
    consoleObj.error = logImpl('error');

    var mathObj = { __ns: 'Math' };
    this.defineId(mathObj);
    var mathFns = {
      floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs,
      sqrt: Math.sqrt, trunc: Math.trunc, sign: Math.sign, random: Math.random
    };
    Object.keys(mathFns).forEach(function (k) {
      mathObj[k] = self.native('Math.' + k, function (rt, thisVal, args) {
        return mathFns[k].apply(null, [rt.toNum(args[0])]);
      });
    });
    ['max', 'min'].forEach(function (k) {
      mathObj[k] = self.native('Math.' + k, function (rt, thisVal, args) {
        if (args.length === 0) return k === 'max' ? -Infinity : Infinity;
        var nums = args.map(function (a) { return rt.toNum(a); });
        return Math[k].apply(null, nums);
      });
    });
    mathObj.pow = this.native('Math.pow', function (rt, thisVal, args) {
      return Math.pow(rt.toNum(args[0]), rt.toNum(args[1]));
    });

    var jsonObj = { __ns: 'JSON' };
    this.defineId(jsonObj);
    jsonObj.stringify = this.native('JSON.stringify', function (rt, thisVal, args) {
      var seen = [];
      function conv(v) {
        if (v === undefined) return undefined;
        if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
        if (v.__fn || v.__class === true) return undefined;
        if (seen.indexOf(v) >= 0) return null;
        seen.push(v);
        if (Array.isArray(v)) return v.map(function (x) { var c = conv(x); return c === undefined ? null : c; });
        var o = {};
        Object.keys(v).forEach(function (k) { var c = conv(v[k]); if (c !== undefined) o[k] = c; });
        return o;
      }
      var raw = conv(args[0]);
      return JSON.stringify(raw);
    });
    jsonObj.parse = this.native('JSON.parse', function (rt, thisVal, args) {
      var data = JSON.parse(rt.toStr(args[0]));
      function wrap(v) {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) {
          var arr = [];
          rt.defineId(arr);
          v.forEach(function (x) { arr.push(wrap(x)); });
          return arr;
        }
        var o = {};
        rt.defineId(o);
        Object.keys(v).forEach(function (k) { o[k] = wrap(v[k]); });
        return o;
      }
      return wrap(data);
    });

    var arrayObj = { __ns: 'Array', __builtinCtor: 'Array' };
    this.defineId(arrayObj);
    arrayObj.isArray = this.native('Array.isArray', function (rt, thisVal, args) {
      return Array.isArray(args[0]);
    });
    arrayObj.from = this.native('Array.from', function (rt, thisVal, args) {
      var it = args[0];
      if (Array.isArray(it)) return rt.newArray(it.slice());
      if (typeof it === 'string') return rt.newArray(it.split(''));
      return rt.newArray([]);
    });

    var objectObj = { __ns: 'Object', __builtinCtor: 'Object' };
    this.defineId(objectObj);
    objectObj.keys = this.native('Object.keys', function (rt, thisVal, args) {
      var v = args[0] || {};
      return rt.newArray(Object.keys(v));
    });
    objectObj.values = this.native('Object.values', function (rt, thisVal, args) {
      var v = args[0] || {};
      return rt.newArray(Object.keys(v).map(function (k) { return v[k]; }));
    });
    objectObj.entries = this.native('Object.entries', function (rt, thisVal, args) {
      var v = args[0] || {};
      return rt.newArray(Object.keys(v).map(function (k) {
        return rt.newArray([k, v[k]]);
      }));
    });

    builtins.vars.console = consoleObj;
    builtins.vars.Math = mathObj;
    builtins.vars.JSON = jsonObj;
    builtins.vars.Array = arrayObj;
    builtins.vars.Object = objectObj;
    var numberFn = this.native('Number', function (rt, thisVal, args) {
      return rt.toNum(args[0]);
    });
    numberFn.statics = {
      isNaN: this.native('Number.isNaN', function (rt, thisVal, args) {
        return typeof args[0] === 'number' && Number.isNaN(args[0]);
      }),
      isInteger: this.native('Number.isInteger', function (rt, thisVal, args) {
        return typeof args[0] === 'number' && Number.isInteger(args[0]);
      }),
      isFinite: this.native('Number.isFinite', function (rt, thisVal, args) {
        return typeof args[0] === 'number' && Number.isFinite(args[0]);
      }),
      isSafeInteger: this.native('Number.isSafeInteger', function (rt, thisVal, args) {
        return typeof args[0] === 'number' && Number.isSafeInteger(args[0]);
      }),
      parseFloat: this.native('Number.parseFloat', function (rt, thisVal, args) {
        return parseFloat(rt.toStr(args[0]));
      }),
      parseInt: this.native('Number.parseInt', function (rt, thisVal, args) {
        /* sem radix (undefined/NaN/0) o JS detecta 0x/0X como base 16 */
        var radix = args.length > 1 && args[1] !== undefined ? rt.toNum(args[1]) : undefined;
        return parseInt(rt.toStr(args[0]), radix);
      }),
      MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
      MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER
    };
    builtins.vars.Number = numberFn;
    builtins.vars.String = this.native('String', function (rt, thisVal, args) {
      if (args.length === 0) return '';
      return rt.toStr(args[0]);
    });
    builtins.vars.Boolean = this.native('Boolean', function (rt, thisVal, args) {
      return rt.truthy(args[0]);
    });
    builtins.vars.parseInt = this.native('parseInt', function (rt, thisVal, args) {
      /* sem radix (undefined/NaN/0) o JS detecta 0x/0X como base 16 */
      var radix = args.length > 1 && args[1] !== undefined ? rt.toNum(args[1]) : undefined;
      return parseInt(rt.toStr(args[0]), radix);
    });
    builtins.vars.parseFloat = this.native('parseFloat', function (rt, thisVal, args) {
      return parseFloat(rt.toStr(args[0]));
    });
    builtins.vars.isNaN = this.native('isNaN', function (rt, thisVal, args) {
      return Number.isNaN(rt.toNum(args[0]));
    });
    builtins.vars.isFinite = this.native('isFinite', function (rt, thisVal, args) {
      return Number.isFinite(rt.toNum(args[0]));
    });
    builtins.vars.Infinity = Infinity;
    builtins.vars.NaN = NaN;

    var genv = new Env(builtins, { isFunctionScope: true });
    this.globalEnv = genv;
    this.builtinsEnv = builtins;
    return genv;
  };

  /* ------------------------------------------------------------------ */
  /* Formatação para console                                             */
  /* ------------------------------------------------------------------ */

  Runtime.prototype.inspect = function (v, depth) {
    depth = depth || 0;
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'number') return DSV.fmtNumber(v);
    if (typeof v === 'string') return depth === 0 ? v : JSON.stringify(v);
    if (typeof v === 'boolean') return String(v);
    if (v && v.__fn) return '[Function: ' + (v.name || 'anônima') + ']';
    if (v && v.__class === true) return '[class ' + v.name + ']';
    var self = this;
    if (Array.isArray(v)) {
      if (depth >= 3) return '[Array]';
      var items = v.slice(0, 20).map(function (x) { return self.inspect(x, depth + 1); });
      if (v.length > 20) items.push('… +' + (v.length - 20));
      return '[' + items.join(', ') + ']';
    }
    if (depth >= 3) return '{…}';
    var keys = Object.keys(v);
    var privKeys = v.__priv ? Object.keys(v.__priv) : [];
    var shown = keys.concat(privKeys).slice(0, 12);
    var parts = shown.map(function (k) {
      var val = hasOwn.call(v, k) ? v[k] : v.__priv[k];
      return k + ': ' + self.inspect(val, depth + 1);
    });
    if (keys.length + privKeys.length > 12) parts.push('…');
    var prefix = (v.__class && v.__class.name) ? v.__class.name + ' ' : '';
    return prefix + '{' + parts.join(', ') + '}';
  };

  /* ------------------------------------------------------------------ */

  DSV.Runtime = Runtime;
  DSV.interpret = function (source, options) {
    return new Runtime(source, options).run();
  };
})(typeof window !== 'undefined' ? window : globalThis);
