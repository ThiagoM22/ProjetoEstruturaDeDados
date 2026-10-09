/* ED Viz — parser de um subconjunto de JavaScript (gera AST com linha). */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});

  function parse(source) {
    var tokens = DSV.tokenize(source);
    var pos = 0;
    var classStack = [];   /* classes abertas durante o parse (campos privados) */
    var privUsages = [];   /* usos de #nome, validados quando o parse termina */

    function cur() { return tokens[Math.min(pos, tokens.length - 1)]; }
    function ahead(n) { return tokens[Math.min(pos + (n || 1), tokens.length - 1)]; }
    function next() { var t = cur(); if (t.type !== 'eof') pos++; return t; }

    function desc(t) {
      if (!t) return 'nada';
      if (t.type === 'eof') return 'fim do código';
      if (t.type === 'str') return 'uma string';
      if (t.type === 'num') return 'o número ' + t.value;
      if (t.type === 'tpl') return 'um template';
      return '"' + t.value + '"';
    }

    function fail(msg, line) {
      var e = new Error(msg);
      e.name = 'ParseError';
      e.line = line || cur().line;
      throw e;
    }

    function isPunct(v) { var t = cur(); return t.type === 'punct' && t.value === v; }
    function isKw(v) { var t = cur(); return t.type === 'kw' && t.value === v; }
    function isIdent() { return cur().type === 'ident'; }
    function eatPunct(v) { if (isPunct(v)) { next(); return true; } return false; }
    function eatKw(v) { if (isKw(v)) { next(); return true; } return false; }
    function expectPunct(v, where) {
      if (isPunct(v)) return next();
      fail('Esperado "' + v + '"' + (where ? ' ' + where : '') + ', mas encontrei ' + desc(cur()));
    }
    function expectIdent(what) {
      var t = cur();
      if (t.type === 'ident') { next(); return t; }
      fail('Esperado ' + (what || 'um nome') + ', mas encontrei ' + desc(t));
    }
    function semicolon() { if (isPunct(';')) next(); }

    /* ------------------------------------------------------------------ */
    /* Statements                                                          */
    /* ------------------------------------------------------------------ */

    function parseProgram() {
      var body = [];
      while (cur().type !== 'eof') {
        body.push(parseStatement());
      }
      return { type: 'Program', body: body, line: 1 };
    }

    function parseStatement() {
      var t = cur();

      if (isPunct('{')) return parseBlock();
      if (isPunct(';')) { next(); return { type: 'Empty', line: t.line }; }

      if (t.type === 'kw') {
        switch (t.value) {
          case 'let': case 'const': case 'var':
            return parseVarDecl();
          case 'function':
            return parseFunctionDecl();
          case 'class':
            return parseClassDecl();
          case 'if':
            return parseIf();
          case 'while':
            return parseWhile();
          case 'do':
            return parseDoWhile();
          case 'for':
            return parseFor();
          case 'return':
            return parseReturn();
          case 'break':
            next(); semicolon();
            return { type: 'Break', line: t.line };
          case 'continue':
            next(); semicolon();
            return { type: 'Continue', line: t.line };
        }
      }

      var expr = parseExpression();
      semicolon();
      return { type: 'ExprStmt', expr: expr, line: t.line };
    }

    function parseBlock() {
      var open = expectPunct('{');
      var body = [];
      while (!isPunct('}')) {
        if (cur().type === 'eof') fail('Bloco "{" sem fechamento (aberto na linha ' + open.line + ')');
        body.push(parseStatement());
      }
      expectPunct('}');
      return { type: 'Block', body: body, line: open.line };
    }

    function parseVarDecl() {
      var kw = next(); /* let | const | var */
      var declarations = [];
      do {
        var idTok = expectIdent('um nome de variável depois de "' + kw.value + '"');
        var init = null;
        if (eatPunct('=')) init = parseExpression();
        declarations.push({ type: 'Declarator', name: idTok.value, init: init, line: idTok.line });
      } while (eatPunct(','));
      semicolon();
      return { type: 'VarDecl', kind: kw.value, declarations: declarations, line: kw.line };
    }

    function parseParams() {
      expectPunct('(', 'nos parâmetros');
      var params = [];
      if (!isPunct(')')) {
        do {
          var p = expectIdent('um nome de parâmetro');
          params.push({ name: p.value, line: p.line });
        } while (eatPunct(','));
      }
      expectPunct(')', 'para fechar os parâmetros');
      return params;
    }

    function parseFunctionDecl() {
      var kw = next(); /* function */
      var id = expectIdent('o nome da função');
      var params = parseParams();
      var body = parseBlock();
      return { type: 'FunctionDecl', id: { name: id.value }, params: params, body: body, line: kw.line };
    }

    function parseClassDecl() {
      var kw = next(); /* class */
      var id = expectIdent('o nome da classe');
      expectPunct('{', 'para abrir o corpo da classe');
      var ctx = { name: id.value, declared: Object.create(null) };
      classStack.push(ctx);
      var methods = [];
      var fields = [];
      while (!isPunct('}')) {
        if (cur().type === 'eof') fail('Classe "' + id.value + '" sem fechamento');
        if (eatPunct(';')) continue;
        var mLine = cur().line;
        var nameTok = cur();
        if (nameTok.type !== 'ident' && nameTok.type !== 'priv') {
          fail('Esperado o nome de um método ou campo da classe, mas encontrei ' + desc(nameTok));
        }
        next();
        var isPrivate = nameTok.type === 'priv';
        var memberName = nameTok.value;
        if (isPrivate) ctx.declared[memberName] = true;
        if ((memberName === 'static' || memberName === 'get' || memberName === 'set' || memberName === 'async') &&
            (cur().type === 'ident' || cur().type === 'priv')) {
          fail('"static", "get", "set" e "async" em classe não são suportados', mLine);
        }
        if (isPunct('(')) {
          var params = parseParams();
          var body = parseBlock();
          methods.push({
            type: 'Method',
            name: memberName,
            params: params,
            body: body,
            isConstructor: !isPrivate && memberName === 'constructor',
            isPrivate: isPrivate,
            line: mLine
          });
        } else {
          /* campo de classe: nome = valor;  (ou só "nome;") */
          var init = null;
          if (eatPunct('=')) init = parseExpression();
          semicolon();
          fields.push({ type: 'Field', name: memberName, isPrivate: isPrivate, init: init, line: mLine });
        }
      }
      expectPunct('}');
      classStack.pop();
      return { type: 'ClassDecl', name: id.value, methods: methods, fields: fields, line: kw.line };
    }

    function parseIf() {
      var kw = next();
      expectPunct('(', 'depois de "if"');
      var test = parseExpression();
      expectPunct(')', 'para fechar a condição do if');
      var consequent = parseStatement();
      var alternate = null;
      if (eatKw('else')) alternate = parseStatement();
      return { type: 'If', test: test, consequent: consequent, alternate: alternate, line: kw.line };
    }

    function parseWhile() {
      var kw = next();
      expectPunct('(', 'depois de "while"');
      var test = parseExpression();
      expectPunct(')', 'para fechar a condição do while');
      var body = parseStatement();
      return { type: 'While', test: test, body: body, line: kw.line };
    }

    function parseDoWhile() {
      var kw = next();
      var body = parseStatement();
      if (!eatKw('while')) fail('Esperado "while" depois do bloco do "do"');
      expectPunct('(', 'depois de "while"');
      var test = parseExpression();
      expectPunct(')', 'para fechar a condição');
      semicolon();
      return { type: 'DoWhile', test: test, body: body, line: kw.line };
    }

    function parseFor() {
      var kw = next();
      expectPunct('(', 'depois de "for"');

      /* for (let x of arr) */
      if ((isKw('let') || isKw('const') || isKw('var')) && ahead(1).type === 'ident' && ahead(2).type === 'kw' && ahead(2).value === 'of') {
        var kind = next().value;
        var nameTok = next(); /* ident */
        next(); /* of */
        var right = parseExpression();
        expectPunct(')', 'para fechar o for-of');
        var bodyOf = parseStatement();
        return { type: 'ForOf', kind: kind, name: nameTok.value, right: right, body: bodyOf, line: kw.line };
      }

      var init = null;
      if (!isPunct(';')) {
        if (isKw('let') || isKw('const') || isKw('var')) {
          var kwDecl = next();
          var decls = [];
          do {
            var idTok = expectIdent('um nome de variável');
            var initExpr = null;
            if (eatPunct('=')) initExpr = parseExpression();
            decls.push({ type: 'Declarator', name: idTok.value, init: initExpr, line: idTok.line });
          } while (eatPunct(','));
          init = { type: 'VarDecl', kind: kwDecl.value, declarations: decls, line: kwDecl.line, inFor: true };
        } else {
          init = parseExpression();
        }
      }
      expectPunct(';', 'no cabeçalho do for');
      var test = isPunct(';') ? null : parseExpression();
      expectPunct(';', 'no cabeçalho do for');
      var update = isPunct(')') ? null : parseExpression();
      expectPunct(')', 'para fechar o for');
      var body = parseStatement();
      return { type: 'For', init: init, test: test, update: update, body: body, line: kw.line };
    }

    function parseReturn() {
      var kw = next();
      var arg = null;
      if (!isPunct(';') && !isPunct('}') && cur().type !== 'eof') {
        arg = parseExpression();
      }
      semicolon();
      return { type: 'Return', arg: arg, line: kw.line };
    }

    /* ------------------------------------------------------------------ */
    /* Expressões (precedência)                                            */
    /* ------------------------------------------------------------------ */

    function parseExpression() { return parseAssign(); }

    function parseAssign() {
      var left = parseConditional();
      var t = cur();
      if (t.type === 'punct' && ['=', '+=', '-=', '*=', '/=', '%='].indexOf(t.value) >= 0) {
        next();
        if (left.type !== 'Ident' && left.type !== 'Member' && left.type !== 'Index') {
          fail('Não posso atribuir a este alvo', t.line);
        }
        var right = parseAssign();
        return { type: 'Assign', op: t.value, target: left, value: right, line: t.line };
      }
      return left;
    }

    function parseConditional() {
      var test = parseLogicalOr();
      if (isPunct('?')) {
        var qt = next();
        var consequent = parseAssign();
        expectPunct(':', 'no operador ternário');
        var alternate = parseAssign();
        return { type: 'Conditional', test: test, consequent: consequent, alternate: alternate, line: qt.line };
      }
      return test;
    }

    function parseLogicalOr() {
      var left = parseLogicalAnd();
      while (isPunct('||')) {
        var t = next();
        var right = parseLogicalAnd();
        left = { type: 'Logical', op: '||', left: left, right: right, line: t.line };
      }
      return left;
    }

    function parseLogicalAnd() {
      var left = parseEquality();
      while (isPunct('&&')) {
        var t = next();
        var right = parseEquality();
        left = { type: 'Logical', op: '&&', left: left, right: right, line: t.line };
      }
      return left;
    }

    function parseEquality() {
      var left = parseRelational();
      while (isPunct('==') || isPunct('!=') || isPunct('===') || isPunct('!==')) {
        var t = next();
        var right = parseRelational();
        left = { type: 'Binary', op: t.value, left: left, right: right, line: t.line };
      }
      return left;
    }

    function parseRelational() {
      var left = parseAdditive();
      while (isPunct('<') || isPunct('<=') || isPunct('>') || isPunct('>=') || isKw('instanceof')) {
        var t = next();
        var right = parseAdditive();
        left = { type: 'Binary', op: t.value, left: left, right: right, line: t.line };
      }
      return left;
    }

    function parseAdditive() {
      var left = parseMultiplicative();
      while (isPunct('+') || isPunct('-')) {
        var t = next();
        var right = parseMultiplicative();
        left = { type: 'Binary', op: t.value, left: left, right: right, line: t.line };
      }
      return left;
    }

    function parseMultiplicative() {
      var left = parseUnary();
      while (isPunct('*') || isPunct('/') || isPunct('%')) {
        var t = next();
        var right = parseUnary();
        left = { type: 'Binary', op: t.value, left: left, right: right, line: t.line };
      }
      return left;
    }

    function parseUnary() {
      var t = cur();
      if (isPunct('!') || isPunct('-') || isPunct('+') || isPunct('++') || isPunct('--') || isKw('typeof') || isKw('delete')) {
        next();
        var arg = parseUnary();
        if (t.value === 'delete') {
          if (arg.type !== 'Member' && arg.type !== 'Index') {
            fail('"delete" só funciona em propriedades (obj.campo ou obj[índice])', t.line);
          }
          if (arg.type === 'Member' && arg.priv) {
            fail('Campos privados não podem ser apagados com "delete"', t.line);
          }
          return { type: 'Delete', arg: arg, line: t.line };
        }
        if (t.value === '++' || t.value === '--') {
          if (arg.type !== 'Ident' && arg.type !== 'Member' && arg.type !== 'Index') {
            fail('" ' + t.value + '" precisa de uma variável ou propriedade', t.line);
          }
        }
        return { type: 'Unary', op: t.value, arg: arg, prefix: true, line: t.line };
      }
      return parsePostfix();
    }

    function parsePostfix() {
      var expr = parseCallMember();
      var t = cur();
      if ((isPunct('++') || isPunct('--')) &&
          (expr.type === 'Ident' || expr.type === 'Member' || expr.type === 'Index')) {
        next();
        return { type: 'Unary', op: t.value, arg: expr, prefix: false, line: t.line };
      }
      return expr;
    }

    function parseCallMember() {
      var expr = parsePrimary();
      while (true) {
        if (isPunct('.')) {
          var dot = next();
          var nameTok = cur();
          if (nameTok.type !== 'ident' && nameTok.type !== 'kw' && nameTok.type !== 'priv') {
            fail('Esperado um nome de propriedade depois de "."', dot.line);
          }
          if (nameTok.type === 'kw' && ['let', 'const', 'var', 'function', 'class', 'if', 'else', 'while', 'return'].indexOf(nameTok.value) >= 0) {
            fail('"' + nameTok.value + '" é uma palavra reservada e não pode ser usada como propriedade', nameTok.line);
          }
          if (nameTok.type === 'priv') {
            if (!classStack.length) {
              fail('O campo privado "' + nameTok.value + '" só pode ser usado dentro da classe que o declara', nameTok.line);
            }
            privUsages.push({ name: nameTok.value, line: nameTok.line, chain: classStack.slice() });
          }
          next();
          expr = { type: 'Member', obj: expr, prop: nameTok.value, priv: nameTok.type === 'priv', line: dot.line };
          continue;
        }
        if (isPunct('[')) {
          var br = next();
          var index = parseExpression();
          expectPunct(']', 'para fechar o índice');
          expr = { type: 'Index', obj: expr, prop: index, line: br.line };
          continue;
        }
        if (isPunct('(')) {
          var callLine = cur().line;
          next();
          var args = [];
          if (!isPunct(')')) {
            do { args.push(parseExpression()); } while (eatPunct(','));
          }
          expectPunct(')', 'para fechar a chamada');
          expr = { type: 'Call', callee: expr, args: args, line: callLine };
          continue;
        }
        break;
      }
      return expr;
    }

    function parsePrimary() {
      var t = cur();

      if (t.type === 'num' || t.type === 'str') {
        next();
        return { type: 'Literal', value: t.value, line: t.line };
      }
      if (t.type === 'tpl') {
        next();
        return parseTemplate(t);
      }
      if (t.type === 'kw') {
        switch (t.value) {
          case 'true': next(); return { type: 'Literal', value: true, line: t.line };
          case 'false': next(); return { type: 'Literal', value: false, line: t.line };
          case 'null': next(); return { type: 'Literal', value: null, line: t.line };
          case 'undefined': next(); return { type: 'Literal', value: undefined, line: t.line };
          case 'this': next(); return { type: 'This', line: t.line };
          case 'new': return parseNew();
          case 'function': return parseFunctionExpr();
        }
      }
      if (t.type === 'ident') {
        /* x => ... */
        if (ahead(1).type === 'punct' && ahead(1).value === '=>') {
          var p = next();
          next(); /* => */
          return parseArrow([p.value], t.line);
        }
        next();
        return { type: 'Ident', name: t.value, line: t.line };
      }
      if (isPunct('(')) {
        if (arrowParamsAhead()) {
          var line = t.line;
          expectPunct('(');
          var names = [];
          if (!isPunct(')')) {
            do { names.push(expectIdent('um nome de parâmetro da arrow function').value); } while (eatPunct(','));
          }
          expectPunct(')');
          expectPunct('=>');
          return parseArrow(names, line);
        }
        next();
        var inner = parseExpression();
        expectPunct(')', 'para fechar o parêntese');
        return inner;
      }
      if (isPunct('[')) {
        next();
        var elements = [];
        while (!isPunct(']')) {
          if (cur().type === 'eof') fail('Array "[" sem fechamento (aberto na linha ' + t.line + ')');
          elements.push(parseExpression());
          if (!eatPunct(',')) break;
        }
        expectPunct(']', 'para fechar o array');
        return { type: 'ArrayLit', elements: elements, line: t.line };
      }
      if (isPunct('{')) {
        next();
        var props = [];
        while (!isPunct('}')) {
          if (cur().type === 'eof') fail('Objeto "{" sem fechamento (aberto na linha ' + t.line + ')');
          var keyTok = cur();
          var key;
          if (keyTok.type === 'ident' || keyTok.type === 'kw' || keyTok.type === 'str' || keyTok.type === 'num') {
            key = String(keyTok.value);
            next();
          } else {
            fail('Esperado o nome de uma propriedade, mas encontrei ' + desc(keyTok));
          }
          var value;
          if (eatPunct(':')) {
            value = parseExpression();
          } else {
            /* atalho { x } */
            var vt = cur();
            if (keyTok.type !== 'ident' && keyTok.type !== 'kw') {
              fail('Propriedade "' + key + '" do objeto precisa de um valor (use ' + key + ': valor)', vt.line);
            }
            value = { type: 'Ident', name: key, line: keyTok.line };
          }
          props.push({ key: key, keyLine: keyTok.line, value: value });
          if (!eatPunct(',')) break;
        }
        expectPunct('}', 'para fechar o objeto');
        return { type: 'ObjectLit', props: props, line: t.line };
      }

      fail('Encontrei ' + desc(t) + ' onde esperava uma expressão');
    }

    function parseNew() {
      var kw = next(); /* new */
      var nameTok = expectIdent('o nome da classe depois de "new"');
      var callee = { type: 'Ident', name: nameTok.value, line: nameTok.line };
      while (isPunct('.')) {
        next();
        var propTok = expectIdent('o nome de um membro');
        callee = { type: 'Member', obj: callee, prop: propTok.value, line: propTok.line };
      }
      var args = [];
      if (isPunct('(')) {
        next();
        if (!isPunct(')')) {
          do { args.push(parseExpression()); } while (eatPunct(','));
        }
        expectPunct(')', 'para fechar os argumentos do new');
      }
      return { type: 'New', callee: callee, args: args, line: kw.line };
    }

    function parseFunctionExpr() {
      var kw = next(); /* function */
      var name = '';
      if (isIdent()) name = next().value;
      var params = parseParams();
      var body = parseBlock();
      return { type: 'FunctionExpr', name: name, params: params, body: body, line: kw.line };
    }

    function parseArrow(names, line) {
      var params = names.map(function (n) { return { name: n, line: line }; });
      if (isPunct('{')) {
        var body = parseBlock();
        return { type: 'Arrow', params: params, body: body, exprBody: false, line: line };
      }
      var expr = parseAssign();
      return { type: 'Arrow', params: params, body: expr, exprBody: true, line: line };
    }

    function arrowParamsAhead() {
      /* chamado quando o token atual é '(' — verifica se é "(a, b) =>" */
      var j = pos;
      if (!(tokens[j] && tokens[j].type === 'punct' && tokens[j].value === '(')) return false;
      j++;
      var expectParam = true;
      while (true) {
        var t = tokens[j];
        if (!t) return false;
        if (t.type === 'punct' && t.value === ')') { j++; break; }
        if (expectParam) {
          if (t.type !== 'ident') return false;
          expectParam = false;
          j++;
        } else {
          if (t.type === 'punct' && t.value === ',') { expectParam = true; j++; continue; }
          return false;
        }
      }
      var nx = tokens[j];
      return !!(nx && nx.type === 'punct' && nx.value === '=>');
    }

    function parseTemplate(tok) {
      var parts = [];
      for (var i = 0; i < tok.parts.length; i++) {
        var p = tok.parts[i];
        if (p.type === 'str') {
          parts.push({ kind: 'str', value: p.value });
        } else {
          var sub;
          try {
            sub = parse('(' + p.src + ')');
          } catch (e) {
            fail('Erro dentro da interpolação ${...}: ' + e.message, p.line || tok.line);
          }
          var expr = sub.body.length ? sub.body[0].expr : { type: 'Literal', value: undefined, line: tok.line };
          setLines(expr, p.line || tok.line);
          parts.push({ kind: 'expr', value: expr });
        }
      }
      return { type: 'Template', parts: parts, line: tok.line };
    }

    /* ajusta a linha de todos os nós de uma sub-árvore recém-parseada */
    function setLines(node, line) {
      if (!node || typeof node !== 'object') return;
      node.line = line;
      for (var k in node) {
        if (k === 'line') continue;
        var v = node[k];
        if (Array.isArray(v)) {
          v.forEach(function (child) { setLines(child, line); });
        } else if (v && typeof v === 'object') {
          setLines(v, line);
        }
      }
    }

    var ast = parseProgram();
    if (cur().type !== 'eof') fail('Sobrou código não interpretado: ' + desc(cur()));

    /* todo #nome usado precisa ter sido declarado em alguma classe que o envolve */
    for (var vu = 0; vu < privUsages.length; vu++) {
      var usage = privUsages[vu];
      var declared = false;
      for (var cu = 0; cu < usage.chain.length; cu++) {
        if (usage.chain[cu].declared[usage.name]) { declared = true; break; }
      }
      if (!declared) fail('O campo privado "' + usage.name + '" não foi declarado na classe', usage.line);
    }

    return ast;
  }

  DSV.parse = parse;
})(typeof window !== 'undefined' ? window : globalThis);
