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
    tabs: $('tabs'),
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
    btnZoomOut: $('btnZoomOut'),
    btnZoomIn: $('btnZoomIn'),
    btnZoomReset: $('btnZoomReset'),
    btnZoomFit: $('btnZoomFit'),
    slider: $('slider'),
    stepLabel: $('stepLabel'),
    speedSelect: $('speedSelect'),
    callstack: $('callstack'),
    vars: $('vars'),
    commands: $('commands'),
    consoleEl: $('console'),
    statusLine: $('statusLine'),
    banner: $('banner'),
    btnHelp: $('btnHelp'),
    helpDialog: $('helpDialog'),
    splitLeft: $('splitLeft'),
    splitRight: $('splitRight'),
    layout: $('layout'),
    codePanel: $('codePanel'),
    vizPanel: $('vizPanel'),
    sidePanel: $('sidePanel'),
    btnToggleCode: $('btnToggleCode'),
    btnToggleSide: $('btnToggleSide'),
    stepExplainer: $('stepExplainer'),
    stepOp: $('stepOp'),
    stepText: $('stepText'),
    stepCount: $('stepCount'),
    tabCommands: $('tabCommands'),
    tabVars: $('tabVars'),
    tabCallstack: $('tabCallstack'),
    tabConsole: $('tabConsole'),
    pageCommands: $('pageCommands'),
    pageVars: $('pageVars'),
    pageCallstack: $('pageCallstack'),
    pageConsole: $('pageConsole')
  };

  var LINE_HEIGHT = 22;
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
    errorLine: null,
    tabs: [],          /* exemplos abertos como abas */
    activeTab: null    /* aba ativa (id do exemplo) */
  };

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */

  /* Realce com as cores do VS Code Dark+ */
  var HL_RX = /(\/\/[^\n]*|\/\*.*?\*\/)|("[^"\n]*"|'[^'\n]*'|`[^`\n]*`)|(\b\d+(?:\.\d+)?\b)|(#?[A-Za-z_$][\w$]*)|([{}()\[\];,.])/g;

  var HL_CTRL = { if: 1, else: 1, while: 1, do: 1, for: 1, of: 1, return: 1, break: 1, continue: 1, instanceof: 1, typeof: 1, delete: 1 };
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
  /* Abas do editor (exemplos abertos)                                   */
  /* ------------------------------------------------------------------ */

  function exampleById(id) {
    return DSV.EXAMPLES.filter(function (e) { return e.id === id; })[0] || null;
  }

  function renderTabs() {
    var html = '';
    state.tabs.forEach(function (id) {
      var ex = exampleById(id);
      var active = id === state.activeTab;
      html += '<div class="tab' + (active ? ' active' : '') + '" data-tab="' + esc(id) + '" title="' + esc(ex ? ex.name : id) + '">' +
        '<span class="tab-name">' + esc(id + '.js') + '</span>' +
        '<button type="button" class="tab-close" data-close="' + esc(id) + '" title="Fechar aba" aria-label="Fechar ' + esc(id + '.js') + '">×</button>' +
        '</div>';
    });
    els.tabs.innerHTML = html;
    if (typeof els.tabs.querySelector === 'function') {
      var active = els.tabs.querySelector('.tab.active');
      if (active && typeof active.scrollIntoView === 'function') {
        try { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignora */ }
      }
    }
  }

  function loadExample(id) {
    var ex = exampleById(id);
    if (!ex) return;
    els.code.value = ex.code;
    els.exampleSelect.value = ex.id;
    els.exampleSelect.title = ex.name;
    try { localStorage.setItem(STORAGE_EX, ex.id); } catch (e) { /* ignora */ }
    onEdit();
    run();
  }

  function openTab(id) {
    if (!exampleById(id)) return;
    if (state.tabs.indexOf(id) < 0) {
      state.tabs.push(id);
      while (state.tabs.length > 4) state.tabs.shift();
    }
    state.activeTab = id;
    renderTabs();
    loadExample(id);
  }

  function closeTab(id) {
    var i = state.tabs.indexOf(id);
    if (i < 0 || state.tabs.length <= 1) return;
    state.tabs.splice(i, 1);
    if (state.activeTab === id) {
      openTab(state.tabs[Math.max(0, i - 1)]);
    } else {
      renderTabs();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Canvas: pan e zoom (arrastar, roda do mouse e controles)            */
  /* ------------------------------------------------------------------ */

  var ZOOM_MIN = 0.25;
  var ZOOM_MAX = 3;
  var ZOOM_FIT_MAX = 1.5;
  var canvasView = { x: 0, y: 0, zoom: 1, key: null, moved: false };
  var canvasDrag = null;
  var canvasTreeKey = null; /* tamanho da última árvore enquadrada */

  function canvasSupported() {
    return !!(els.structure &&
      typeof els.structure.getBoundingClientRect === 'function' &&
      typeof els.structure.querySelector === 'function');
  }

  function canvasParts() {
    return {
      vp: els.structure.querySelector('.canvas-viewport'),
      stage: els.structure.querySelector('.canvas-stage')
    };
  }

  function applyCanvasView() {
    var st = els.structure.style;
    if (st && typeof st.setProperty === 'function') {
      st.setProperty('--canvas-x', canvasView.x + 'px');
      st.setProperty('--canvas-y', canvasView.y + 'px');
      st.setProperty('--canvas-zoom', String(canvasView.zoom));
    }
    els.btnZoomReset.textContent = Math.round(canvasView.zoom * 100) + '%';
  }

  function canvasCenter(zoom) {
    var e = canvasParts();
    if (!e.vp || !e.stage) return false;
    var vw = e.vp.clientWidth || 0;
    var vh = e.vp.clientHeight || 0;
    var sw = e.stage.offsetWidth || 0;
    var sh = e.stage.offsetHeight || 0;
    if (!vw || !vh) return false;
    canvasView.zoom = zoom;
    canvasView.x = Math.round((vw - sw * zoom) / 2);
    canvasView.y = Math.round((vh - sh * zoom) / 2);
    applyCanvasView();
    return true;
  }

  /* enquadra sem ampliar: 100% quando cabe, reduz quando a estrutura é maior */
  function canvasHome() {
    var e = canvasParts();
    if (!e.vp || !e.stage) return false;
    var vw = e.vp.clientWidth || 0;
    var vh = e.vp.clientHeight || 0;
    var sw = e.stage.offsetWidth || 0;
    var sh = e.stage.offsetHeight || 0;
    if (!vw || !vh || !sw || !sh) return false;
    var pad = 64;
    var fit = Math.min((vw - pad) / sw, (vh - pad) / sh);
    return canvasCenter(fit < 1 ? Math.max(ZOOM_MIN, fit) : 1);
  }

  /* ajusta à tela (pode ampliar até ZOOM_FIT_MAX) */
  function canvasFit() {
    var e = canvasParts();
    if (!e.vp || !e.stage) return;
    var vw = e.vp.clientWidth || 0;
    var vh = e.vp.clientHeight || 0;
    var sw = e.stage.offsetWidth || 0;
    var sh = e.stage.offsetHeight || 0;
    if (!vw || !vh || !sw || !sh) return;
    var pad = 64;
    var fit = Math.min((vw - pad) / sw, (vh - pad) / sh);
    canvasCenter(Math.max(ZOOM_MIN, Math.min(ZOOM_FIT_MAX, fit)));
    canvasView.moved = true;
  }

  function canvasZoomAt(cx, cy, factor) {
    var z0 = canvasView.zoom;
    var z1 = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z0 * factor));
    if (z1 === z0) return;
    canvasView.x = cx - (cx - canvasView.x) * (z1 / z0);
    canvasView.y = cy - (cy - canvasView.y) * (z1 / z0);
    canvasView.zoom = z1;
    canvasView.moved = true;
    applyCanvasView();
  }

  function canvasZoomCenter(factor) {
    var e = canvasParts();
    if (!e.vp) return;
    canvasZoomAt((e.vp.clientWidth || 0) / 2, (e.vp.clientHeight || 0) / 2, factor);
  }

  /* árvore: reenquadra quando o desenho muda de tamanho (inserção/remoção),
   * sem ampliar além de 100% — mantém a árvore visível e centralizada */
  function canvasTreeFit() {
    var e = canvasParts();
    if (!e.vp || !e.stage) return;
    var vw = e.vp.clientWidth || 0;
    var vh = e.vp.clientHeight || 0;
    var sw = e.stage.offsetWidth || 0;
    var sh = e.stage.offsetHeight || 0;
    if (!vw || !vh || !sw || !sh) return;
    var sig = Math.round(sw) + 'x' + Math.round(sh);
    if (sig !== canvasTreeKey) {
      canvasTreeKey = sig;
      var pad = 64;
      var fit = Math.min((vw - pad) / sw, (vh - pad) / sh);
      canvasCenter(fit < 1 ? Math.max(ZOOM_MIN, fit) : 1);
      return;
    }
    canvasCenter(canvasView.zoom);
  }

  /* chamado a cada renderização: acompanha a estrutura até o usuário mexer */
  function canvasAfterRender(sel) {
    if (!canvasSupported()) return;
    /* a árvore mantém o enquadramento entre passos mesmo quando a raiz muda
     * (remoção); o fit inicial acontece quando a estrutura aparece ou esvazia */
    var key;
    if (!sel || sel.id == null) key = 'none';
    else if (sel.type === 'tree') key = 'tree|' + sel.label;
    else key = sel.type + '|' + sel.id;
    if (key !== canvasView.key) {
      canvasView.moved = false;
      canvasTreeKey = null;
      if (canvasHome()) canvasView.key = key;
      return;
    }
    /* a fila cresce na horizontal: recentralizar a cada passo deslocaria a
     * linha inteira de uma vez (salto). O enquadramento fica com o usuário. */
    if (sel && sel.type === 'queue') return;
    if (!canvasView.moved) {
      if (sel && sel.type === 'tree') canvasTreeFit();
      else canvasCenter(canvasView.zoom);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Divisórias redimensionáveis entre os painéis                        */
  /* ------------------------------------------------------------------ */

  var SPLIT_MIN_CODE = 280;
  var SPLIT_MIN_VIZ = 320;
  var SPLIT_MIN_SIDE = 224;
  var splitDrag = null;
  var splitState = null;                  /* larguras medidas {code, viz, side, split} */
  var collapsed = { code: false, side: false };

  function layoutEl() {
    return els.layout && typeof els.layout.getBoundingClientRect === 'function' ? els.layout : null;
  }

  function panelEls() {
    return { code: els.codePanel, viz: els.vizPanel, side: els.sidePanel };
  }

  /* mede as larguras com os três painéis expandidos (para poder restaurar
   * as proporções ao reabrir um painel recolhido) */
  function measureSplitState() {
    var layout = layoutEl();
    var p = panelEls();
    if (!layout || !p.code || !p.viz || !p.side) return null;
    var codeHidden = p.code.classList.contains('collapsed');
    var sideHidden = p.side.classList.contains('collapsed');
    if (codeHidden) p.code.classList.remove('collapsed');
    if (sideHidden) p.side.classList.remove('collapsed');
    var rect = layout.getBoundingClientRect();
    var code = p.code.getBoundingClientRect().width || 0;
    var viz = p.viz.getBoundingClientRect().width || 0;
    var side = p.side.getBoundingClientRect().width || 0;
    if (codeHidden) p.code.classList.add('collapsed');
    if (sideHidden) p.side.classList.add('collapsed');
    var total = code + viz + side;
    if (!total) return null;
    var splitW = Math.round(Math.max(1, (rect.width - total) / 2) * 100) / 100;
    return { code: code, viz: viz, side: side, split: splitW };
  }

  /* aplica as colunas da grade respeitando os painéis recolhidos: o espaço
   * liberado vai para a visualização (canvas com o máximo de área útil) */
  function applyLayout() {
    var p = panelEls();
    if (p.code) p.code.classList.toggle('collapsed', collapsed.code);
    if (p.side) p.side.classList.toggle('collapsed', collapsed.side);
    if (els.splitLeft) els.splitLeft.classList.toggle('collapsed', collapsed.code);
    if (els.splitRight) els.splitRight.classList.toggle('collapsed', collapsed.side);
    if (els.btnToggleCode) {
      els.btnToggleCode.classList.toggle('active', collapsed.code);
      els.btnToggleCode.setAttribute('aria-pressed', collapsed.code ? 'true' : 'false');
    }
    if (els.btnToggleSide) {
      els.btnToggleSide.classList.toggle('active', collapsed.side);
      els.btnToggleSide.setAttribute('aria-pressed', collapsed.side ? 'true' : 'false');
    }
    var layout = layoutEl();
    if (!layout) return;
    /* em telas estreitas os painéis empilham: a grade de colunas não se aplica */
    if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth <= 1100) {
      layout.style.gridTemplateColumns = '';
      return;
    }
    if (!splitState) splitState = measureSplitState();
    if (!splitState) return;
    var code = collapsed.code ? 0 : splitState.code;
    var side = collapsed.side ? 0 : splitState.side;
    var viz = splitState.viz +
      (collapsed.code ? splitState.code + splitState.split : 0) +
      (collapsed.side ? splitState.side + splitState.split : 0);
    var total = code + viz + side;
    if (total <= 0) return;
    var toFr = function (w) { return (Math.round(w / total * 10000) / 100) + 'fr'; };
    var cols = [
      collapsed.code ? '0px' : 'minmax(' + SPLIT_MIN_CODE + 'px,' + toFr(code) + ')',
      collapsed.code ? '0px' : (splitState.split + 'px'),
      'minmax(0,' + toFr(viz) + ')',
      collapsed.side ? '0px' : (splitState.split + 'px'),
      collapsed.side ? '0px' : 'minmax(' + SPLIT_MIN_SIDE + 'px,' + toFr(side) + ')'
    ];
    layout.style.gridTemplateColumns = cols.join(' ');
  }

  function afterLayoutChange() {
    canvasTreeKey = null;
    if (!canvasView.moved) canvasCenter(canvasView.zoom);
  }

  function togglePanel(which) {
    if (!splitState) splitState = measureSplitState();
    collapsed[which] = !collapsed[which];
    applyLayout();
    afterLayoutChange();
    /* redesenha para o canvas medir o novo tamanho e a árvore reenquadrar */
    if (steps().length) renderStructurePanel(steps()[state.index]);
  }

  /* aplica larguras medidas (px) como proporções fr — a janela segue responsiva */
  function splitApply(codeW, vizW, sideW, splitW) {
    splitState = { code: codeW, viz: vizW, side: sideW, split: splitW };
    applyLayout();
  }

  function splitDelta(which, dx) {
    var layout = layoutEl();
    if (!layout || !dx) return;
    var p = panelEls();
    if (!p.code || !p.viz || !p.side) return;
    var rect = layout.getBoundingClientRect();
    var code = p.code.getBoundingClientRect().width;
    var viz = p.viz.getBoundingClientRect().width;
    var side = p.side.getBoundingClientRect().width;
    var total = code + viz + side;
    /* largura de cada divisória (o que sobra da grade) */
    var splitW = Math.round(Math.max(1, (rect.width - total) / 2) * 100) / 100;

    if (which === 'left') {
      var maxCode = Math.max(SPLIT_MIN_CODE, total - side - SPLIT_MIN_VIZ);
      code = DSV.clamp(code + dx, SPLIT_MIN_CODE, maxCode);
      viz = Math.max(SPLIT_MIN_VIZ, total - code - side);
    } else {
      var maxViz = Math.max(SPLIT_MIN_VIZ, total - code - SPLIT_MIN_SIDE);
      viz = DSV.clamp(viz + dx, SPLIT_MIN_VIZ, maxViz);
      side = Math.max(SPLIT_MIN_SIDE, total - code - viz);
    }
    splitApply(code, viz, side, splitW);
  }

  function splitterDown(ev, which) {
    if (ev.button !== 0) return;
    var el = ev.currentTarget;
    splitDrag = { id: ev.pointerId, which: which, x: ev.clientX, el: el };
    if (el && el.classList) el.classList.add('dragging');
    if (el && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
    }
    if (ev.preventDefault) ev.preventDefault();
  }

  function splitterMove(ev) {
    if (!splitDrag || ev.pointerId !== splitDrag.id) return;
    var dx = ev.clientX - splitDrag.x;
    splitDrag.x = ev.clientX;
    splitDelta(splitDrag.which, dx);
  }

  function splitterUp(ev) {
    if (!splitDrag) return;
    var el = splitDrag.el;
    splitDrag = null;
    if (el && el.classList) el.classList.remove('dragging');
    if (el && ev && typeof el.releasePointerCapture === 'function') {
      try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
    }
    afterLayoutChange();
  }

  function splitterKeys(ev, which) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (ev.preventDefault) ev.preventDefault();
    splitDelta(which, ev.key === 'ArrowLeft' ? -16 : 16);
    afterLayoutChange();
  }

  /* duplo clique devolve as proporções padrão (32 / 48 / 20) */
  function splitterReset() {
    var layout = layoutEl();
    if (layout && layout.style) layout.style.gridTemplateColumns = '';
    splitState = null;
    applyLayout();
    afterLayoutChange();
  }

  function setupLayoutControls() {
    if (els.btnToggleCode && typeof els.btnToggleCode.addEventListener === 'function') {
      els.btnToggleCode.addEventListener('click', function () { togglePanel('code'); });
    }
    if (els.btnToggleSide && typeof els.btnToggleSide.addEventListener === 'function') {
      els.btnToggleSide.addEventListener('click', function () { togglePanel('side'); });
    }
  }

  function setupSplitters() {
    [[els.splitLeft, 'left'], [els.splitRight, 'right']].forEach(function (pair) {
      var el = pair[0];
      var which = pair[1];
      if (!el || typeof el.addEventListener !== 'function') return;
      el.addEventListener('pointerdown', function (ev) { splitterDown(ev, which); });
      el.addEventListener('pointermove', splitterMove);
      el.addEventListener('pointerup', splitterUp);
      el.addEventListener('pointercancel', splitterUp);
      el.addEventListener('dblclick', splitterReset);
      el.addEventListener('keydown', function (ev) { splitterKeys(ev, which); });
    });
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
      els.debugInfo.innerHTML = '<b>Fim do programa</b> · <kbd>Esc</kbd> sai · <kbd>←</kbd> volta uma linha';
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
    els.btnPlay.classList.toggle('playing', state.playing);
    els.btnPlay.setAttribute('aria-label', state.playing ? 'Pausar' : 'Reproduzir');
    els.btnPlay.title = state.playing ? 'Pausar (espaço)' : 'Play (espaço)';
  }

  /* preenche a trilha do slider até o passo atual */
  function updateSliderFill() {
    var max = Math.max(steps().length - 1, 0);
    var pct = max > 0 ? (state.index / max) * 100 : 0;
    if (els.slider.style && typeof els.slider.style.setProperty === 'function') {
      els.slider.style.setProperty('--fill', pct.toFixed(2) + '%');
    }
  }

  function goto(i) {
    var st = steps();
    if (!st.length) {
      els.stepLabel.textContent = 'passo 0/0';
      els.statusLine.textContent = 'linha —';
      setCurrentLine(null);
      DSV.renderStructure(els.structure, null, null, {});
      canvasAfterRender(null);
      els.callstack.innerHTML = '<div class="muted">—</div>';
      els.vars.innerHTML = '<div class="muted">—</div>';
      els.commands.innerHTML = '<div class="muted">—</div>';
      els.consoleEl.innerHTML = '';
      if (els.stepExplainer) els.stepExplainer.classList.add('hidden');
      updateButtons();
      return;
    }
    state.index = DSV.clamp(i, 0, st.length - 1);
    var step = st[state.index];

    els.slider.value = state.index;
    updateSliderFill();
    els.stepLabel.textContent = 'passo ' + (state.index + 1) + '/' + st.length;

    var srcLines = els.code.value.split('\n');
    var lineText = srcLines[step.line - 1] ? srcLines[step.line - 1].trim() : '';
    els.statusLine.textContent = 'linha ' + step.line + (lineText ? ' : ' + lineText : '');

    var isErrorStep = state.errorLine === step.line && state.index === st.length - 1 && !!state.trace.error;
    setCurrentLine(step.line, isErrorStep);
    ensureLineVisible(step.line);

    renderStructurePanel(step);
    renderCallstack(step);
    renderVars(step);
    renderConsole();
    renderCommands();
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
      nextStep: state.index < st.length - 1 ? st[state.index + 1] : null,
      /* animações mais curtas quando está tocando em velocidade alta */
      animMs: state.playing ? Math.max(90, Math.min(360, Math.round(430 / state.speed))) : 300
    });
    canvasAfterRender(sel);
    updateStepExplainer(sel, step);
    return sel;
  }

  /* faixa de explicação contextual: operação + o que aconteceu/acontecerá */
  function updateStepExplainer(sel, step) {
    if (!els.stepExplainer) return;
    var st = steps();
    if (!st.length || !step) {
      els.stepExplainer.classList.add('hidden');
      return;
    }
    var srcLines = els.code.value.split('\n');
    var lineText = srcLines[step.line - 1] ? srcLines[step.line - 1].trim() : '';
    var info = DSV.explainStep(step, sel, {
      prevStep: state.index > 0 ? st[state.index - 1] : null,
      nextStep: state.index < st.length - 1 ? st[state.index + 1] : null,
      lineText: lineText
    });
    els.stepExplainer.classList.remove('hidden');
    els.stepOp.textContent = (info && info.op) || 'Execução';
    els.stepText.textContent = (info && info.text) || '';
    els.stepCount.textContent = (state.index + 1) + '/' + st.length;
  }

  /* ------------------------------------------------------------------ */
  /* Painéis                                                             */
  /* ------------------------------------------------------------------ */

  var SIDE_TABS = [
    { name: 'commands', tab: 'tabCommands', page: 'pageCommands' },
    { name: 'vars', tab: 'tabVars', page: 'pageVars' },
    { name: 'callstack', tab: 'tabCallstack', page: 'pageCallstack' },
    { name: 'console', tab: 'tabConsole', page: 'pageConsole' }
  ];

  function setSideTab(name) {
    SIDE_TABS.forEach(function (t) {
      var active = t.name === name;
      if (els[t.tab] && els[t.tab].classList) {
        els[t.tab].classList.toggle('active', active);
        els[t.tab].setAttribute('aria-selected', active ? 'true' : 'false');
      }
      if (els[t.page] && els[t.page].classList) els[t.page].classList.toggle('active', active);
    });
    if (name === 'console' && els.consoleEl) {
      els.consoleEl.scrollTop = els.consoleEl.scrollHeight;
    }
  }

  function setupSideTabs() {
    SIDE_TABS.forEach(function (t) {
      var tab = els[t.tab];
      if (!tab || typeof tab.addEventListener !== 'function') return;
      tab.addEventListener('click', function () { setSideTab(t.name); });
    });
  }

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

  /* lista de operações de estrutura (push/pop/shift/...) da execução */
  function renderCommands() {
    if (!state.trace) { els.commands.innerHTML = ''; return; }
    var html = '';
    var count = 0;
    state.trace.steps.forEach(function (s, si) {
      (s.events || []).forEach(function (ev) {
        count++;
        var cls = 'command';
        if (si === state.index) cls += ' current';
        else if (si > state.index) cls += ' future';
        html += '<button type="button" class="' + cls + '" data-step="' + si + '" title="ir para o passo ' + (si + 1) + '">' +
          '<span class="command-num">' + count + '</span>' +
          '<span class="command-text">' + esc(ev.text) + '</span>' +
          '</button>';
      });
    });
    if (!count) {
      els.commands.innerHTML = '<div class="muted">Nenhuma operação de estrutura neste código.</div>';
      return;
    }
    els.commands.innerHTML = html;
    if (typeof els.commands.querySelector === 'function') {
      var cur = els.commands.querySelector('.command.current');
      if (cur && typeof cur.scrollIntoView === 'function') {
        try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignora */ }
      }
    }
  }

  els.commands.addEventListener('click', function (ev) {
    var btn = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.command') : null;
    if (!btn) return;
    stopPlay();
    goto(parseInt(btn.getAttribute('data-step'), 10));
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
    openTab(this.value);
  });

  els.tabs.addEventListener('click', function (ev) {
    var t = ev.target;
    var closeId = t && typeof t.getAttribute === 'function' ? t.getAttribute('data-close') : null;
    if (closeId) { closeTab(closeId); return; }
    var tab = t && typeof t.closest === 'function' ? t.closest('.tab') : null;
    if (tab) openTab(tab.getAttribute('data-tab'));
  });

  /* canvas: controles, roda do mouse e arrasto */
  els.btnZoomIn.addEventListener('click', function () { canvasZoomCenter(1.25); });
  els.btnZoomOut.addEventListener('click', function () { canvasZoomCenter(0.8); });
  els.btnZoomReset.addEventListener('click', function () { canvasCenter(1); canvasView.moved = false; });
  els.btnZoomFit.addEventListener('click', canvasFit);

  els.structure.addEventListener('wheel', function (ev) {
    if (!canvasSupported()) return;
    var t = ev.target;
    if (!t || typeof t.closest !== 'function' || !t.closest('.canvas-viewport')) return;
    var e = canvasParts();
    if (!e.vp) return;
    if (ev.preventDefault) ev.preventDefault();
    var r = typeof e.vp.getBoundingClientRect === 'function' ? e.vp.getBoundingClientRect() : { left: 0, top: 0 };
    canvasZoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(-(ev.deltaY || 0) * 0.0015));
  }, { passive: false });

  els.structure.addEventListener('pointerdown', function (ev) {
    if (!canvasSupported() || (ev.button !== 0 && ev.button !== 1)) return;
    var t = ev.target;
    if (!t || typeof t.closest !== 'function') return;
    if (t.closest('button') || !t.closest('.canvas-viewport')) return;
    canvasDrag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
    els.structure.classList.add('panning');
    if (typeof els.structure.setPointerCapture === 'function') {
      try { els.structure.setPointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
    }
    if (ev.preventDefault) ev.preventDefault();
  });

  els.structure.addEventListener('pointermove', function (ev) {
    if (!canvasDrag || ev.pointerId !== canvasDrag.id) return;
    canvasView.x += ev.clientX - canvasDrag.x;
    canvasView.y += ev.clientY - canvasDrag.y;
    canvasDrag.x = ev.clientX;
    canvasDrag.y = ev.clientY;
    canvasView.moved = true;
    applyCanvasView();
  });

  function endCanvasDrag(ev) {
    if (!canvasDrag || (ev && ev.pointerId !== canvasDrag.id)) return;
    canvasDrag = null;
    els.structure.classList.remove('panning');
    if (ev && typeof els.structure.releasePointerCapture === 'function') {
      try { els.structure.releasePointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
    }
  }
  els.structure.addEventListener('pointerup', endCanvasDrag);
  els.structure.addEventListener('pointercancel', endCanvasDrag);

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', function () {
      canvasTreeKey = null;
      /* ao cruzar o breakpoint responsivo, reaplica as colunas dos painéis
       * recolhidos para não deixar faixas vazias na grade */
      if (collapsed.code || collapsed.side) applyLayout();
      if (!canvasSupported() || canvasView.moved) return;
      canvasHome();
    });
  }

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
      example = exampleById(savedEx);
    }
    if (!example) {
      example = exampleById(DSV.DEFAULT_EXAMPLE) || DSV.EXAMPLES[0];
    }

    els.exampleSelect.value = example.id;
    els.exampleSelect.title = example.name;
    state.tabs = [example.id];
    state.activeTab = example.id;
    renderTabs();
    els.code.value = savedCode && savedCode.trim() ? savedCode : example.code;

    setupSplitters();
    setupLayoutControls();
    setupSideTabs();
    setSideTab('vars');
    onEdit();
    run();
  }

  init();
})();
