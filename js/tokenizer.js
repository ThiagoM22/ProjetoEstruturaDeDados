/* ED Viz — tokenizador de um subconjunto de JavaScript. */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});

  var KEYWORDS = [
    'let', 'const', 'var', 'function', 'class', 'new', 'this',
    'if', 'else', 'while', 'do', 'for', 'of',
    'return', 'break', 'continue',
    'true', 'false', 'null', 'undefined',
    'typeof', 'instanceof', 'delete'
  ];
  var KW = Object.create(null);
  KEYWORDS.forEach(function (k) { KW[k] = true; });

  var PUNCT3 = ['===', '!=='];
  var PUNCT2 = ['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '=>'];
  var PUNCT1 = '+-*/%=<>!(){}[];,.?:';

  function tokenize(code) {
    var tokens = [];
    var i = 0;
    var line = 1;
    var len = code.length;

    /* BOM (cola de arquivo do Windows) */
    if (len && code.charCodeAt(0) === 0xFEFF) i = 1;

    function fail(msg, ln) {
      var e = new Error(msg);
      e.name = 'ParseError';
      e.line = ln || line;
      throw e;
    }

    function push(type, value, ln, extra) {
      var t = { type: type, value: value, line: ln };
      if (extra) {
        for (var k in extra) t[k] = extra[k];
      }
      tokens.push(t);
    }

    while (i < len) {
      var ch = code[i];

      /* espaços e quebras de linha */
      if (ch === '\n') { line++; i++; continue; }
      if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }

      /* comentários */
      if (ch === '/' && code[i + 1] === '/') {
        while (i < len && code[i] !== '\n') i++;
        continue;
      }
      if (ch === '/' && code[i + 1] === '*') {
        var lnC = line;
        i += 2;
        var closedC = false;
        while (i < len) {
          if (code[i] === '\n') line++;
          if (code[i] === '*' && code[i + 1] === '/') { i += 2; closedC = true; break; }
          i++;
        }
        if (!closedC) fail('Comentário /* sem fechamento', lnC);
        continue;
      }

      /* números */
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(code[i + 1] || ''))) {
        var start = i;
        while (i < len && /[0-9]/.test(code[i])) i++;
        if (code[i] === '.') {
          i++;
          while (i < len && /[0-9]/.test(code[i])) i++;
        }
        if (code[i] === 'e' || code[i] === 'E') {
          var j = i + 1;
          if (code[j] === '+' || code[j] === '-') j++;
          if (/[0-9]/.test(code[j] || '')) {
            i = j;
            while (i < len && /[0-9]/.test(code[i])) i++;
          }
        }
        push('num', parseFloat(code.slice(start, i)), line);
        continue;
      }

      /* strings "..." e '...' */
      if (ch === '"' || ch === "'") {
        var q = ch;
        var lnS = line;
        var out = '';
        i++;
        var closedS = false;
        while (i < len) {
          if (code[i] === q) { closedS = true; i++; break; }
          if (code[i] === '\n') fail('String sem fechamento (aberta na linha ' + lnS + ')');
          if (code[i] === '\\') {
            var esc = code[i + 1];
            if (esc === 'n') out += '\n';
            else if (esc === 't') out += '\t';
            else if (esc === 'r') out += '\r';
            else if (esc === '\\') out += '\\';
            else if (esc === q) out += q;
            else if (esc === '0') out += '\0';
            else if (esc === 'u') {
              out += String.fromCharCode(parseInt(code.substr(i + 2, 4), 16) || 63);
              i += 4;
            }
            else out += esc;
            i += 2;
            continue;
          }
          out += code[i];
          i++;
        }
        if (!closedS) fail('String sem fechamento (aberta na linha ' + lnS + ')');
        push('str', out, lnS);
        continue;
      }

      /* template literal `...${expr}...` */
      if (ch === '`') {
        var lnT = line;
        i++;
        var parts = [];
        var buf = '';
        var closedT = false;
        while (i < len) {
          var c = code[i];
          if (c === '\\') {
            var e2 = code[i + 1];
            if (e2 === 'n') buf += '\n';
            else if (e2 === 't') buf += '\t';
            else if (e2 === '`') buf += '`';
            else if (e2 === '$') buf += '$';
            else if (e2 === '\\') buf += '\\';
            else buf += e2;
            i += 2;
            continue;
          }
          if (c === '`') { closedT = true; i++; break; }
          if (c === '$' && code[i + 1] === '{') {
            parts.push({ type: 'str', value: buf });
            buf = '';
            i += 2;
            var exprLine = line;
            var d = 1;
            var startE = i;
            while (i < len && d > 0) {
              var cc = code[i];
              if (cc === '\n') line++;
              else if (cc === '"' || cc === "'") {
                var q2 = cc;
                i++;
                while (i < len && code[i] !== q2) {
                  if (code[i] === '\\') i++;
                  if (code[i] === '\n') line++;
                  i++;
                }
              }
              else if (cc === '{') d++;
              else if (cc === '}') { d--; if (d === 0) break; }
              i++;
            }
            if (d !== 0) fail('Interpolação ${...} sem fechamento', lnT);
            parts.push({ type: 'expr', src: code.slice(startE, i), line: exprLine });
            i++;
            continue;
          }
          if (c === '\n') line++;
          buf += c;
          i++;
        }
        if (!closedT) fail('Template (`) sem fechamento', lnT);
        parts.push({ type: 'str', value: buf });
        push('tpl', null, lnT, { parts: parts });
        continue;
      }

      /* nomes privados de classe (#items, #inicio...) */
      if (ch === '#') {
        var s3 = i + 1;
        if (s3 >= len || !/[A-Za-z_$\u00C0-\u024F]/.test(code[s3])) {
          fail('Esperado um nome depois de "#" (ex.: #items)');
        }
        i = s3;
        while (i < len && /[A-Za-z0-9_$\u00C0-\u024F]/.test(code[i])) i++;
        push('priv', '#' + code.slice(s3, i), line);
        continue;
      }

      /* identificadores (aceita acentos: nó, árvore, início...) */
      if (/[A-Za-z_$\u00C0-\u024F]/.test(ch)) {
        var s2 = i;
        while (i < len && /[A-Za-z0-9_$\u00C0-\u024F]/.test(code[i])) i++;
        var word = code.slice(s2, i);
        push(KW[word] ? 'kw' : 'ident', word, line);
        continue;
      }

      /* pontuação / operadores */
      var three = code.substr(i, 3);
      if (PUNCT3.indexOf(three) >= 0) { push('punct', three, line); i += 3; continue; }
      var two = code.substr(i, 2);
      if (PUNCT2.indexOf(two) >= 0) { push('punct', two, line); i += 2; continue; }

      /* operadores de JS fora do subconjunto: mensagem clara em vez de erro genérico */
      if (ch === '*' && code[i + 1] === '*') fail('O operador "**" (exponenciação) não é suportado neste visualizador.', line);
      if (ch === '?' && code[i + 1] === '?') fail('O operador "??" (nullish) não é suportado neste visualizador.', line);
      if (ch === '?' && code[i + 1] === '.') fail('O encadeamento opcional "?." não é suportado neste visualizador.', line);
      if (ch === '.' && code[i + 1] === '.' && code[i + 2] === '.') fail('Spread/rest ("...") não é suportado neste visualizador.', line);
      if ('&|^~'.indexOf(ch) >= 0) fail('O operador "' + ch + '" não é suportado neste visualizador.', line);
      if ((ch === '<' || ch === '>') && code[i + 1] === ch) fail('Operadores de deslocamento ("<<"/">>") não são suportados neste visualizador.', line);

      if (PUNCT1.indexOf(ch) >= 0) { push('punct', ch, line); i++; continue; }

      fail('Caractere inesperado: "' + ch + '"');
    }

    push('eof', null, line);
    return tokens;
  }

  DSV.tokenize = tokenize;
})(typeof window !== 'undefined' ? window : globalThis);
