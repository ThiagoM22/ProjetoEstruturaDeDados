/* ED Viz — interface: editor, playback e painéis. */
(function () {
  'use strict';

  var DSV = window.DSV;
  var esc = DSV.escapeHtml;
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    code: $('code'),
    highlight: $('highlight'),
    gutter: $('gutterInner'),
    lineHilite: $('lineHilite'),
    exampleSelect: $('exampleSelect'),
    btnRun: $('btnRun'),
    btnDebug: $('btnDebug'),
    debugBar: $('debugBar'),
    debugInfo: $('debugInfo'),
    btnExitDebug: $('btnExitDebug'),
    structure: $('structure'),
    structureSelect: $('structureSelect'),
    btnFirst: $('btnFirst'),
    btnPrev: $('btnPrev'),
    btnPlay: $('btnPlay'),
    btnNext: $('btnNext'),
    btnLast: $('btnLast'),
    slider: $('slider'),
    stepLabel: $('stepLabel'),
    speedSelect: $('speedSelect'),
    callstack: $('callstack'),
    vars: $('vars'),
    consoleEl: $('console'),
    statusLine: $('statusLine'),
    banner: $('banner'),
    btnHelp: $('btnHelp'),
    helpDialog: $('helpDialog')
  };

  var LINE_HEIGHT = 20;
  var PAD_TOP = 10;
  var STORAGE_CODE = 'edviz.code';
  var STORAGE_EX = 'edviz.example';

  var state = {
    trace: null,
    index: 0,
    playing: false,
    timer: null,
    speed: 1,
    debug: false,      /* modo debug: cada tecla executa a próxima linha */
    forced: null,      /* estrutura escolhida manualmente {type,id,label} */
    sticky: null,      /* última seleção automática */
    candidates: [],
    opsMap: {},
    visit: { order: [], map: {} },
    errorLine: null
  };

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */

  /* Realce com as cores do VS Code Dark+ */
  var HL_RX = /(\/\/[^\n]*|\/\*.*?\*\/)|("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*\b)|([{}()\[\];,.])/g;

  var HL_CTRL = { if: 1, else: 1, while: 1, do: 1, for: 1, of: 1, return: 1, break: 1, continue: 1, instanceof: 1, typeof: 1 };
  var HL_KW = {
    let: 1, const: 1, var: 1, function: 1, class: 1, new: 1, this: 1,
    true: 1, false: 1, null: 1, undefined: 1
  };

  function highlightLine(line) {
    var out = '';
    var last = 0;
    var lastWord = '';
    var m;
    HL_RX.lastIndex = 0;
    while ((m = HL_RX.exec(line))) {
      out += esc(line.slice(last, m.index));
      var cls = null;
      if (m[1]) {
        cls = 'tok-comment';
      } else if (m[2]) {
        cls = 'tok-string';
      } else if (m[3]) {
        cls = 'tok-num';
      } else if (m[5]) {
        /* pontuação: sem cor própria */
      } else {
        var w = m[0];
        if (HL_CTRL[w]) cls = 'tok-ctrl';
        else if (HL_KW[w]) cls = 'tok-kw';
        else if (lastWord === 'class' || lastWord === 'new') cls = 'tok-type';
        else if (/^\s*\(/.test(line.slice(m.index + w.length))) cls = 'tok-fn';
        else cls = 'tok-var';
        lastWord = w;
      }
      out += cls ? '<span class="' + cls + '">' + esc(m[0]) + '</span>' : esc(m[0]);
      last = m.index + m[0].length;
    }
    out += esc(line.slice(last));
    return out;
  }

  function renderHighlight() {
    els.highlight.innerHTML = els.code.value.split('\n').map(highlightLine).join('\n') + '\n';
  }

  function renderGutter() {
    var lines = els.code.value.split('\n').length;
    var html = '';
    for (var i = 1; i <= lines; i++) {
      var cls = 'gline';
      if (state.errorLine === i) cls += ' err';
      html += '<div class="' + cls + '" data-line="' + i + '">' + i + '</div>';
    }
    els.gutter.innerHTML = html;
  }

  function markCurrentLineInGutter(line) {
    var nodes = els.gutter.children;
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.remove('cur');
    }
    if (line >= 1 && line <= nodes.length) nodes[line - 1].classList.add('cur');
  }

  function syncScroll() {
    var st = els.code.scrollTop;
    var sl = els.code.scrollLeft;
    els.highlight.style.transform = 'translate(' + (-sl) + 'px,' + (-st) + 'px)';
    els.gutter.style.transform = 'translateY(' + (-st) + 'px)';
    els.lineHilite.style.transform = 'translateY(' + (-st) + 'px)';
  }

  function setCurrentLine(line, isError) {
    if (!line) {
      els.lineHilite.style.display = 'none';
      return;
    }
    els.lineHilite.style.display = 'block';
    els.lineHilite.style.top = (PAD_TOP + (line - 1) * LINE_HEIGHT) + 'px';
    els.lineHilite.classList.toggle('err', !!isError);
    markCurrentLineInGutter(line);
  }

  function ensureLineVisible(line) {
    var top = (line - 1) * LINE_HEIGHT;
    var vh = els.code.clientHeight;
    if (top < els.code.scrollTop) {
      els.code.scrollTop = Math.max(0, top - LINE_HEIGHT * 3);
    } else if (top + LINE_HEIGHT > els.code.scrollTop + vh - 8) {
      els.code.scrollTop = top - vh + LINE_HEIGHT * 4;
    }
    syncScroll();
  }

  function onEdit() {
    renderHighlight();
    renderGutter();
    syncScroll();
    try { localStorage.setItem(STORAGE_CODE, els.code.value); } catch (e) { /* ignora */ }
  }

  els.code.addEventListener('input', onEdit);
  els.code.addEventListener('scroll', syncScroll);

  els.code.addEventListener('keydown', function (ev) {
    if (ev.key === 'Tab') {
      ev.preventDefault();
      var s = this.selectionStart;
      var e = this.selectionEnd;
      this.value = this.value.slice(0, s) + '  ' + this.value.slice(e);
      this.selectionStart = this.selectionEnd = s + 2;
      onEdit();
      return;
    }
    if (ev.key === 'Enter') {
      var pos = this.selectionStart;
      var before = this.value.slice(0, pos);
      var lineStart = before.lastIndexOf('\n') + 1;
      var matchIndent = before.slice(lineStart).match(/^[ \t]*/);
      var indent = matchIndent ? matchIndent[0] : '';
      var extra = /\{\s*$/.test(before.slice(lineStart)) ? '  ' : '';
      if (indent || extra) {
        ev.preventDefault();
        var ins = '\n' + indent + extra;
        this.value = this.value.slice(0, pos) + ins + this.value.slice(this.selectionEnd);
        this.selectionStart = this.selectionEnd = pos + ins.length;
        onEdit();
      }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Execução                                                            */
  /* ------------------------------------------------------------------ */

  function run() {
    stopPlay();
    state.trace = DSV.interpret(els.code.value);
    state.opsMap = DSV.buildOpsMap(state.trace.steps);
    state.visit = DSV.computeVisitOrder(state.trace.steps);
    state.forced = null;
    state.sticky = null;
    state.errorLine = state.trace.error && state.trace.error.line ? state.trace.error.line : null;

    var last = state.trace.steps[state.trace.steps.length - 1];
    state.candidates = last ? DSV.detectStructures(last, state.opsMap) : [];
    buildStructureOptions();

    if (state.trace.error) {
      showBanner('Erro na linha ' + state.trace.error.line + ': ' + state.trace.error.message);
    } else {
      hideBanner();
    }

    renderGutter();
    els.slider.max = Math.max(state.trace.steps.length - 1, 0);
    /* em caso de erro, posiciona no passo em que ele ocorreu */
    goto(state.trace.error && state.trace.steps.length ? state.trace.steps.length - 1 : 0);

    try { localStorage.setItem(STORAGE_CODE, els.code.value); } catch (e) { /* ignora */ }
  }

  function showBanner(msg) {
    els.banner.innerHTML = esc(msg);
    els.banner.classList.remove('hidden');
  }

  function hideBanner() {
    els.banner.classList.add('hidden');
  }

  function buildStructureOptions() {
    var html = '<option value="auto">Automático</option>';
    state.candidates.forEach(function (c) {
      html += '<option value="' + esc(c.type + '|' + c.id) + '">' +
        esc(DSV.typeLabel(c.type) + ' — ' + c.label) + '</option>';
    });
    els.structureSelect.innerHTML = html;
    els.structureSelect.value = 'auto';
  }

  /* ------------------------------------------------------------------ */
  /* Modo debug (passo a passo com tecla)                                */
  /* ------------------------------------------------------------------ */

  function startDebug() {
    /* limpa estado de debug anterior e executa o código */
    state.debug = false;
    els.debugBar.classList.add('hidden');
    els.btnDebug.classList.remove('active');
    els.code.readOnly = false;
    els.code.classList.remove('readonly');

    run();

    if (!steps().length) {
      /* erro de sintaxe: o banner já explica; não entra em debug */
      return;
    }

    state.debug = true;
    els.code.readOnly = true;
    els.code.classList.add('readonly');
    els.btnDebug.classList.add('active');
    stopPlay();
    goto(0);
    if (els.code.blur) els.code.blur();
  }

  function exitDebug() {
    if (!state.debug) return;
    state.debug = false;
    els.code.readOnly = false;
    els.code.classList.remove('readonly');
    els.btnDebug.classList.remove('active');
    els.debugBar.classList.add('hidden');
    updateButtons();
    if (typeof els.code.focus === 'function') els.code.focus();
  }

  function updateDebugBar(step) {
    if (!state.debug) {
      els.debugBar.classList.add('hidden');
      return;
    }
    els.debugBar.classList.remove('hidden');
    if (!step) return;

    var st = steps();
    var atEnd = state.index >= st.length - 1;
    var err = state.trace && state.trace.error;
    els.debugBar.classList.toggle('waiting', !atEnd);

    if (atEnd && err) {
      els.debugInfo.innerHTML = 'A execução parou por <b>erro na linha ' + err.line + '</b> — veja a mensagem acima · <kbd>Esc</kbd> sai';
    } else if (atEnd) {
      els.debugInfo.innerHTML = '<b>Fim do programa</b> 🎉 · <kbd>Esc</kbd> sai · <kbd>←</kbd> volta uma linha';
    } else {
      var next = st[state.index + 1];
      els.debugInfo.innerHTML = 'Linha <b>' + step.line + '</b> · pressione <kbd>qualquer tecla</kbd> para executar a próxima' +
        (next && next.line !== step.line ? ' <span class="debug-next">(próxima: linha ' + next.line + ')</span>' : '') +
        ' · <kbd>←</kbd> volta · <kbd>Esc</kbd> sai';
    }
  }

  /* ------------------------------------------------------------------ */
  /* Navegação                                                           */
  /* ------------------------------------------------------------------ */

  function steps() { return state.trace ? state.trace.steps : []; }

  function stopPlay() {
    state.playing = false;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    updatePlayButton();
  }

  function scheduleNext() {
    state.timer = setTimeout(function () {
      if (!state.playing) return;
      var n = steps().length;
      if (state.index >= n - 1) { stopPlay(); return; }
      goto(state.index + 1);
      scheduleNext();
    }, Math.max(120, 520 / state.speed));
  }

  function play() {
    if (state.debug) return;
    if (state.playing) { stopPlay(); return; }
    var n = steps().length;
    if (!n) return;
    if (state.index >= n - 1) goto(0);
    state.playing = true;
    updatePlayButton();
    scheduleNext();
  }

  function updatePlayButton() {
    els.btnPlay.textContent = state.playing ? '❚❚' : '▶';
  }

  function goto(i) {
    var st = steps();
    if (!st.length) {
      els.stepLabel.textContent = 'passo 0/0';
      els.statusLine.textContent = 'linha —';
      setCurrentLine(null);
      DSV.renderStructure(els.structure, null, null, {});
      els.callstack.innerHTML = '<div class="muted">—</div>';
      els.vars.innerHTML = '<div class="muted">—</div>';
      els.consoleEl.innerHTML = '';
      updateButtons();
      return;
    }
    state.index = DSV.clamp(i, 0, st.length - 1);
    var step = st[state.index];

    els.slider.value = state.index;
    els.stepLabel.textContent = 'passo ' + (state.index + 1) + '/' + st.length;
    els.statusLine.textContent = 'linha ' + step.line + ' · passo ' + (state.index + 1) + ' de ' + st.length;

    var isErrorStep = state.errorLine === step.line && state.index === st.length - 1 && !!state.trace.error;
    setCurrentLine(step.line, isErrorStep);
    ensureLineVisible(step.line);

    renderStructurePanel(step);
    renderCallstack(step);
    renderVars(step);
    renderConsole();
    updateButtons();
    updateDebugBar(step);
  }

  function updateButtons() {
    var n = steps().length;
    var atStart = state.index <= 0;
    var atEnd = state.index >= n - 1;
    els.btnFirst.disabled = atStart;
    els.btnPrev.disabled = atStart;
    els.btnNext.disabled = atEnd;
    els.btnLast.disabled = atEnd;
    els.btnPlay.disabled = state.debug || n === 0;
    updatePlayButton();
  }

  /* ------------------------------------------------------------------ */
  /* Seleção da estrutura exibida                                        */
  /* ------------------------------------------------------------------ */

  function chooseSelection(step) {
    if (state.forced) return state.forced;

    var candidates = DSV.detectStructures(step, state.opsMap);
    if (state.sticky) {
      var found = null;
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].type === state.sticky.type && candidates[i].id === state.sticky.id) {
          found = candidates[i];
          break;
        }
      }
      if (found) {
        state.sticky = found;
        return found;
      }
    }
    var best = candidates.length ? candidates[0] : null;
    if (best) state.sticky = best;
    return state.sticky;
  }

  function renderStructurePanel(step) {
    var sel = chooseSelection(step);
    var st = steps();
    DSV.renderStructure(els.structure, sel, step, {
      opsMap: state.opsMap,
      pointers: step.pointers || {},
      events: step.events || [],
      visit: state.visit,
      prevStep: state.index > 0 ? st[state.index - 1] : null,
      /* animações mais curtas quando está tocando em velocidade alta */
      animMs: state.playing ? Math.max(90, Math.min(360, Math.round(430 / state.speed))) : 300
    });
  }

  /* ------------------------------------------------------------------ */
  /* Painéis                                                             */
  /* ------------------------------------------------------------------ */

  function renderCallstack(step) {
    var frames = step.stack || [];
    if (!frames.length) {
      els.callstack.innerHTML = '<div class="muted">fora de função (escopo global)</div>';
      return;
    }
    var html = '';
    for (var i = frames.length - 1; i >= 0; i--) {
      var f = frames[i];
      html += '<div class="frame' + (i === frames.length - 1 ? ' active' : '') + '">' +
        '<span class="frame-name">' + esc(f.name) + '</span>' +
        '<span class="frame-line">linha ' + f.line + '</span></div>';
    }
    els.callstack.innerHTML = html;
  }

  function varLine(name, sv) {
    return '<div class="var-line"><span class="var-name">' + esc(name) + '</span>' +
      '<span class="var-val">' + esc(DSV.fmtSerialized(sv)) + '</span></div>';
  }

  function renderVars(step) {
    var html = '';
    var locals = step.locals || {};
    var globals = step.globals || {};

    var localKeys = Object.keys(locals);
    if (step.thisVal) localKeys.unshift('this');
    if (localKeys.length) {
      html += '<div class="scope-title">função atual</div>';
      localKeys.forEach(function (k) {
        html += varLine(k, k === 'this' ? step.thisVal : locals[k]);
      });
    }

    var globalKeys = Object.keys(globals);
    html += '<div class="scope-title">global</div>';
    if (!globalKeys.length) {
      html += '<div class="muted">(vazio)</div>';
    } else {
      globalKeys.forEach(function (k) { html += varLine(k, globals[k]); });
    }
    els.vars.innerHTML = html;
  }

  function renderConsole() {
    if (!state.trace) { els.consoleEl.innerHTML = ''; return; }
    var outs = state.trace.output.filter(function (o) { return o.step <= state.index; });
    if (!outs.length) {
      els.consoleEl.innerHTML = '<div class="muted">(nada impresso até este passo)</div>';
      return;
    }
    var html = '';
    outs.forEach(function (o) {
      html += '<div class="console-line ' + (o.kind === 'warn' ? 'warn' : o.kind === 'error' ? 'error' : '') + '">' +
        '<span class="console-step" data-step="' + o.step + '" title="ir para o passo">#' + (o.step + 1) + '</span>' +
        '<span>' + esc(o.text) + '</span></div>';
    });
    els.consoleEl.innerHTML = html;
    els.consoleEl.scrollTop = els.consoleEl.scrollHeight;
  }

  els.consoleEl.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.classList && t.classList.contains('console-step')) {
      stopPlay();
      goto(parseInt(t.getAttribute('data-step'), 10));
    }
  });

  /* ------------------------------------------------------------------ */
  /* Eventos de UI                                                       */
  /* ------------------------------------------------------------------ */

  els.btnRun.addEventListener('click', function () { exitDebug(); run(); });
  els.btnDebug.addEventListener('click', startDebug);
  els.btnExitDebug.addEventListener('click', exitDebug);
  els.btnPlay.addEventListener('click', play);
  els.btnFirst.addEventListener('click', function () { stopPlay(); goto(0); });
  els.btnPrev.addEventListener('click', function () { stopPlay(); goto(state.index - 1); });
  els.btnNext.addEventListener('click', function () { stopPlay(); goto(state.index + 1); });
  els.btnLast.addEventListener('click', function () { stopPlay(); goto(steps().length - 1); });

  els.slider.addEventListener('input', function () {
    stopPlay();
    goto(parseInt(this.value, 10));
  });

  els.speedSelect.addEventListener('change', function () {
    state.speed = parseFloat(this.value) || 1;
    if (state.playing) {
      if (state.timer) clearTimeout(state.timer);
      scheduleNext();
    }
  });

  els.structureSelect.addEventListener('change', function () {
    if (this.value === 'auto') {
      state.forced = null;
    } else {
      var cand = null;
      for (var i = 0; i < state.candidates.length; i++) {
        if ((state.candidates[i].type + '|' + state.candidates[i].id) === this.value) {
          cand = state.candidates[i];
          break;
        }
      }
      state.forced = cand;
    }
    if (steps().length) renderStructurePanel(steps()[state.index]);
  });

  els.exampleSelect.addEventListener('change', function () {
    var ex = DSV.EXAMPLES.filter(function (e) { return e.id === this.value; }.bind(this))[0];
    if (!ex) return;
    els.code.value = ex.code;
    try { localStorage.setItem(STORAGE_EX, ex.id); } catch (e2) { /* ignora */ }
    onEdit();
    run();
  });

  els.btnHelp.addEventListener('click', function () {
    if (els.helpDialog.showModal) els.helpDialog.showModal();
  });

  document.addEventListener('keydown', function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      ev.preventDefault();
      exitDebug();
      run();
      return;
    }
    if (ev.key === 'F10') {
      ev.preventDefault();
      startDebug();
      return;
    }

    if (state.debug) {
      /* teclas de sistema/atalhos do navegador passam direto */
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^F[0-9]+$/.test(ev.key)) return;
      ev.preventDefault();
      if (ev.key === 'Escape') { exitDebug(); return; }
      if (ev.key === 'ArrowLeft') { goto(state.index - 1); return; }
      if (ev.key === 'Home') { goto(0); return; }
      if (ev.key === 'End') { goto(steps().length - 1); return; }
      /* qualquer outra tecla executa a próxima linha */
      goto(state.index + 1);
      return;
    }

    var tag = ev.target && ev.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;

    if (ev.key === 'ArrowRight') { ev.preventDefault(); stopPlay(); goto(state.index + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stopPlay(); goto(state.index - 1); }
    else if (ev.key === ' ') { ev.preventDefault(); play(); }
    else if (ev.key === 'Home') { ev.preventDefault(); stopPlay(); goto(0); }
    else if (ev.key === 'End') { ev.preventDefault(); stopPlay(); goto(steps().length - 1); }
  });

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */

  function init() {
    var options = '';
    DSV.EXAMPLES.forEach(function (ex) {
      options += '<option value="' + esc(ex.id) + '">' + esc(ex.name) + '</option>';
    });
    els.exampleSelect.innerHTML = options;

    var savedEx = null;
    var savedCode = null;
    try {
      savedEx = localStorage.getItem(STORAGE_EX);
      savedCode = localStorage.getItem(STORAGE_CODE);
    } catch (e) { /* ignora */ }

    var example = null;
    if (savedEx) {
      example = DSV.EXAMPLES.filter(function (ex) { return ex.id === savedEx; })[0] || null;
    }
    if (!example) {
      example = DSV.EXAMPLES.filter(function (ex) { return ex.id === DSV.DEFAULT_EXAMPLE; })[0] || DSV.EXAMPLES[0];
    }

    els.exampleSelect.value = example.id;
    els.code.value = savedCode && savedCode.trim() ? savedCode : example.code;

    onEdit();
    run();
  }

  init();
})();
