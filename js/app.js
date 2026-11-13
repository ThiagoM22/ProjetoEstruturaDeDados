/* ED Viz — interface: editor, playback e painéis. */
(function () {
  'use strict';

  var DSV = window.DSV;
  var esc = DSV.escapeHtml;
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    code: $('code'),
    codeViewport: $('codeViewport'),
    varTip: $('varTip'),
    highlight: $('highlight'),
    gutter: $('gutterInner'),
    lineHilite: $('lineHilite'),
    tabs: $('tabs'),
    exampleSelect: $('exampleSelect'),
    btnRun: $('btnRun'),
    btnDebug: $('btnDebug'),
    roteiroRunSlot: $('roteiroRunSlot'),
    topbarRunSlot: $('topbarRunSlot'),
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
    statusHint: $('statusHint'),
    statusOverflow: $('statusOverflow'),
    banner: $('banner'),
    btnHelp: $('btnHelp'),
    btnHelpClose: $('btnHelpClose'),
    sideHint: $('sideHint'),
    btnSideHintClose: $('btnSideHintClose'),
    linkGuia: $('linkGuia'),
    helpDialog: $('helpDialog'),
    splitLeft: $('splitLeft'),
    layout: $('layout'),
    codePanel: $('codePanel'),
    vizPanel: $('vizPanel'),
    sidePanel: $('sidePanel'),
    btnToggleCode: $('btnToggleCode'),
    btnToggleSide: $('btnToggleSide'),
    btnExpandCode: $('btnExpandCode'),
    btnCollapseCode: $('btnCollapseCode'),
    btnCollapseSide: $('btnCollapseSide'),
    railCode: $('railCode'),
    railInspector: $('railInspector'),
    btnGrid: $('btnGrid'),
    btnCanvasCenter: $('btnCanvasCenter'),
    canvasTitle: $('canvasTitle'),
    canvasSub: $('canvasSub'),
    canvasBadge: $('canvasBadge'),
    structureInfo: $('structureInfo'),
    stateInfo: $('stateInfo'),
    varsCount: $('varsCount'),
    callsCount: $('callsCount'),
    inspTabStructure: $('inspTabStructure'),
    inspTabVars: $('inspTabVars'),
    inspTabCalls: $('inspTabCalls'),
    inspTabState: $('inspTabState'),
    pageStructure: $('pageStructure'),
    pageVars: $('pageVars'),
    pageCallstack: $('pageCallstack'),
    pageState: $('pageState'),
    dockHistory: $('dockHistory'),
    dock: $('dock'),
    dockTabs: $('dockTabs'),
    btnDockToggle: $('btnDockToggle'),
    btnDockClose: $('btnDockClose'),
    tabCommands: $('tabCommands'),
    tabEvents: $('tabEvents'),
    tabConsole: $('tabConsole'),
    tabVars: null,
    tabCallstack: null,
    pageCommands: $('pageCommands'),
    pageEvents: $('pageEvents'),
    pageConsole: $('pageConsole'),
    events: $('events'),
    stepExplainer: $('stepExplainer'),
    stepOp: $('stepOp'),
    stepText: $('stepText'),
    stepCount: $('stepCount'),
    vizRunState: $('vizRunState'),
    vizRunStateText: $('vizRunStateText')
  };

  /* Contrato de DOM da Etapa 4B: o shell pode mudar de posição, mas os IDs
   * que o controlador consulta precisam existir. Falhas aparecem no console
   * antes de virarem um erro difícil de rastrear em um caminho de execução. */
  function checkDomContract() {
    var optional = { tabVars: true, tabCallstack: true };
    var missing = [];
    Object.keys(els).forEach(function (key) {
      if (!optional[key] && !els[key]) missing.push(key);
    });
    if (missing.length) {
      window.__edvizMissingIds = missing;
      if (window.console && typeof window.console.error === 'function') {
        window.console.error('[ED Viz] IDs ausentes no shell: ' + missing.join(', '));
      }
    } else {
      window.__edvizMissingIds = [];
    }
    return missing;
  }

  checkDomContract();

  var LINE_HEIGHT = 22;
  var PAD_TOP = 14;
  var CODE_PAD_LEFT = 16;   /* padding esquerdo do editor (.code-input) */
  var HOVER_DELAY = 350;    /* tempo com o mouse parado sobre a variável */
  var STORAGE_CODE = 'edviz.code';        /* legado: migrado para STORAGE_BUFFERS */
  var STORAGE_EX = 'edviz.example';
  var STORAGE_BUFFERS = 'edviz.buffers';  /* código guardado por aba (id do exemplo) */
  var STORAGE_WORKSPACE = 'edviz.workspace';
  var STORAGE_SIDE_HINT = 'edviz.sideHintSeen'; /* dica de primeiro uso da Margem */

  /* Preferências do workspace: Roteiro, Margem, grade e histórico.
   * O estado visual é sempre reconstruído a partir daqui; nenhum renderizador
   * depende dele. Na versão 3 o Roteiro é uma coluna permanente no desktop e
   * a Margem continua sendo a gaveta contextual das etapas anteriores. */
  var WORKSPACE_VERSION = 3;
  var DEFAULT_CODE_RATIO = 0.4;
  var viewportWidth = function () {
    return typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : 1440;
  };
  var workspace = {
    version: WORKSPACE_VERSION,
    codeRatio: DEFAULT_CODE_RATIO,
    codeUserResized: false,
    codeExpanded: false,
    codeRatioBeforeExpand: null,
    collapsed: { code: viewportWidth() < 1024, side: true },
    dockOpen: false,
    dockTab: 'commands',
    grid: true,
    inspectorTab: 'vars'
  };

  /* Cada estrutura tem uma página no guia; o link da barra superior aponta
   * para a página da estrutura do exemplo ativo. */
  var GUIA = {
    array:  { pagina: 'guia/array.html',           nome: 'Array' },
    pilha:  { pagina: 'guia/pilha.html',           nome: 'Pilha' },
    fila:   { pagina: 'guia/fila.html',            nome: 'Fila' },
    lista:  { pagina: 'guia/lista-encadeada.html', nome: 'Lista encadeada' },
    arvore: { pagina: 'guia/arvore-binaria.html',  nome: 'Árvore binária' }
  };

  var state = {
    trace: null,
    traceCode: null,   /* código que gerou o trace (o hover só vale para ele) */
    index: 0,
    playing: false,
    timer: null,
    speed: 1,
    debug: false,      /* modo debug: cada tecla executa a próxima linha */
    stale: false,      /* o código foi editado depois da execução */
    preview: false,    /* primeiro contato: passo de prévia, ainda sem ação do aluno */
    forced: null,      /* estrutura escolhida manualmente {type,id,label} */
    sticky: null,      /* última seleção automática */
    candidates: [],
    opsMap: {},
    commands: [],      /* operações da execução (eventos + chamadas reconhecidas) */
    visit: { order: [], map: {} },
    errorLine: null,
    tabs: [],          /* exemplos abertos como abas */
    activeTab: null,   /* aba ativa (id do exemplo) */
    buffers: {},       /* código guardado de cada aba, por id do exemplo */
    events: []         /* log de eventos da execução (pré-computado, como commands) */
  };

  /* ------------------------------------------------------------------ */
  /* Preferências do workspace                                          */
  /* ------------------------------------------------------------------ */

  function clamp01(v, fallback) {
    v = parseFloat(v);
    return isFinite(v) && v > 0 && v < 1 ? v : fallback;
  }

  function loadWorkspace() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_WORKSPACE); } catch (e) { /* ignora */ }
    if (!raw) return;
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { return; }
    if (!saved || typeof saved !== 'object') return;

    /* v3: o Roteiro passou a ser uma coluna permanente no desktop. A largura
     * antiga é preservada quando existir, mas o estado de recolhimento das
     * gavetas não é herdado: o Roteiro abre em telas >= 1024 e permanece
     * recolhido nas telas menores, como antes. */
    if (saved.version !== WORKSPACE_VERSION) {
      workspace.codeRatio = clamp01(saved.codeRatio, DEFAULT_CODE_RATIO);
      /* A largura salva pela gaveta antiga é preservada como preferência
       * explícita; quem nunca mexeu nela continua dentro do novo intervalo. */
      workspace.codeUserResized = typeof saved.codeRatio === 'number' && isFinite(saved.codeRatio);
      workspace.codeExpanded = false;
      workspace.codeRatioBeforeExpand = null;
      workspace.collapsed.code = viewportWidth() < 1024;
      workspace.grid = saved.grid !== false;
      if (saved.dockTab === 'commands' || saved.dockTab === 'events' || saved.dockTab === 'output') {
        workspace.dockTab = saved.dockTab;
      }
      if (saved.inspectorTab) workspace.inspectorTab = saved.inspectorTab;
      saveWorkspace();
      return;
    }

    workspace.codeRatio = clamp01(saved.codeRatio, DEFAULT_CODE_RATIO);
    workspace.codeUserResized = saved.codeUserResized === true;
    workspace.codeExpanded = saved.codeExpanded === true;
    var beforeExpand = parseFloat(saved.codeRatioBeforeExpand);
    workspace.codeRatioBeforeExpand = isFinite(beforeExpand) && beforeExpand > 0 && beforeExpand < 1
      ? beforeExpand
      : null;
    if (saved.collapsed && typeof saved.collapsed === 'object') {
      workspace.collapsed.code = saved.collapsed.code !== false;
      workspace.collapsed.side = saved.collapsed.side !== false;
    }
    workspace.dockOpen = !!saved.dockOpen;
    if (saved.dockTab === 'commands' || saved.dockTab === 'events' || saved.dockTab === 'output') {
      workspace.dockTab = saved.dockTab;
    }
    workspace.grid = saved.grid !== false;
    if (saved.inspectorTab === 'structure' || saved.inspectorTab === 'vars' ||
        saved.inspectorTab === 'calls' || saved.inspectorTab === 'state') {
      workspace.inspectorTab = saved.inspectorTab;
    }
  }

  function saveWorkspace() {
    try { localStorage.setItem(STORAGE_WORKSPACE, JSON.stringify(workspace)); } catch (e) { /* ignora */ }
  }

  var sideHintSeen = false;
  try { sideHintSeen = localStorage.getItem(STORAGE_SIDE_HINT) === '1'; } catch (e) { /* ignora */ }

  function showSideHint() {
    if (!els.sideHint || sideHintSeen) return;
    els.sideHint.hidden = false;
  }

  function dismissSideHint() {
    sideHintSeen = true;
    if (els.sideHint) els.sideHint.hidden = true;
    try { localStorage.setItem(STORAGE_SIDE_HINT, '1'); } catch (e) { /* ignora */ }
  }

  function setCanvasMeta(meta) {
    meta = meta || {};
    var title = meta.title || 'automático';
    var sub = meta.sub || '';
    var badge = meta.badge || '';
    state.canvasMeta = { title: title, sub: sub, badge: badge };
    if (els.canvasTitle) els.canvasTitle.textContent = title;
    if (els.canvasSub) {
      els.canvasSub.textContent = sub;
      els.canvasSub.className = 'canvas-sub' + (sub ? '' : ' is-empty');
    }
    if (els.canvasBadge) {
      els.canvasBadge.textContent = badge;
      els.canvasBadge.className = 'canvas-badge' + (badge ? '' : ' is-empty');
    }
  }

  function applyGrid() {
    if (els.structure) els.structure.classList.toggle('no-grid', !workspace.grid);
    if (els.btnGrid) {
      els.btnGrid.setAttribute('aria-pressed', workspace.grid ? 'true' : 'false');
      els.btnGrid.title = workspace.grid ? 'Ocultar grade' : 'Mostrar grade';
      els.btnGrid.classList.toggle('is-off', !workspace.grid);
    }
  }

  /* Variáveis: estado de expansão e valores do render atual. A chave é
   * scope + nome + caminho de propriedades, então a expansão sobrevive à
   * troca de passo e ao redesenho do painel — sem tocar no trace. */
  var varExpanded = Object.create(null);
  var varValueMap = Object.create(null);
  var VAR_CHILD_LIMIT = 40;
  var VAR_DEPTH_LIMIT = 9;
  var VAR_CHEVRON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3.4 1.9 6.5 5l-3.1 3.1"/></svg>';

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

  /* No Firefox, rolar o textarea por código é transitório: ele volta ao
   * caret. O controle de overflow mantém o deslocamento visual (realce,
   * gutter e linha) em codeScrollX até o aluno interagir com o editor. */
  var codeScrollX = 0;
  var codeScrollHold = false;

  function updateCodeOverflow() {
    if (!els.code || !els.codeViewport) return;
    var max = els.code.scrollWidth - els.code.clientWidth;
    if (codeScrollHold && codeScrollX > max) codeScrollX = Math.max(0, max);
    var current = codeScrollHold ? codeScrollX : els.code.scrollLeft;
    var has = max > 1;
    var more = has && (max - current > 1);
    els.codeViewport.classList.toggle('is-overflowing', more);
    if (!els.statusOverflow) return;
    els.statusOverflow.hidden = !has;
    if (!has) return;
    /* no fim da rolagem o controle vira o caminho de volta */
    els.statusOverflow.textContent = more ? 'ver o resto →' : '← início';
    els.statusOverflow.setAttribute('aria-label', more
      ? 'Rolar o código para a direita e ver o resto da linha'
      : 'Voltar ao início do código');
  }

  function syncScroll() {
    hideVarTip();
    var st = els.code.scrollTop;
    var sl = els.code.scrollLeft;
    if (codeScrollHold) sl = codeScrollX;
    else codeScrollX = sl;
    els.highlight.style.transform = 'translate(' + (-sl) + 'px,' + (-st) + 'px)';
    els.gutter.style.transform = 'translateY(' + (-st) + 'px)';
    els.lineHilite.style.transform = 'translateY(' + (-st) + 'px)';
    updateCodeOverflow();
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

  /* Grava o código de todas as abas (por exemplo) no localStorage. */
  function saveBuffers() {
    try { localStorage.setItem(STORAGE_BUFFERS, JSON.stringify(state.buffers)); } catch (e) { /* ignora */ }
  }

  /* O código foi editado depois da execução: nada na tela pode continuar
   * apontando para o trace antigo sem avisar. */
  function updateStaleUI() {
    if (!state.stale || !state.trace) return;
    setCurrentLine(null);
    els.statusLine.textContent = 'código editado — execute novamente';
    if (els.stepExplainer) {
      els.stepExplainer.classList.remove('hidden');
      els.stepOp.textContent = 'Código editado';
      els.stepText.textContent = 'Execute novamente para atualizar a visualização.';
      els.stepCount.textContent = (state.index + 1) + '/' + steps().length;
    }
  }

  function onEdit() {
    hideVarTip();
    renderHighlight();
    renderGutter();
    syncScroll();
    if (state.activeTab) state.buffers[state.activeTab] = els.code.value;
    saveBuffers();
    state.stale = !!(state.trace && els.code.value !== state.traceCode);
    if (state.stale) updateStaleUI();
    updateVizChrome();
  }

  els.code.addEventListener('input', onEdit);
  els.code.addEventListener('scroll', syncScroll);

  /* o controle de overflow rola o editor até a cauda da linha; quando já
   * está no fim, volta ao início sem depender da scrollbar overlay */
  if (els.statusOverflow && typeof els.statusOverflow.addEventListener === 'function') {
    els.statusOverflow.addEventListener('click', function () {
      var max = els.code.scrollWidth - els.code.clientWidth;
      if (max <= 1) return;
      var current = codeScrollHold ? codeScrollX : els.code.scrollLeft;
      var atEnd = max - current <= 1;
      var target = atEnd
        ? 0
        : Math.min(max, current + Math.max(120, Math.round(els.code.clientWidth * 0.8)));
      codeScrollX = target;
      codeScrollHold = true;
      els.code.scrollLeft = target;
      syncScroll();
    });
  }

  /* qualquer gesto no editor devolve o controle à scrollbar real */
  function releaseCodeScrollHold() {
    if (!codeScrollHold) return;
    codeScrollHold = false;
    syncScroll();
  }
  els.code.addEventListener('pointerdown', releaseCodeScrollHold);
  els.code.addEventListener('wheel', releaseCodeScrollHold);
  els.code.addEventListener('keydown', releaseCodeScrollHold);

  /* editor: Tab insere espaços (como em um editor de código), mas precisa ter
   * saída. Esc devolve o foco ao resto da interface e Ctrl+M alterna para o
   * modo em que Tab move o foco — sem prender quem navega só pelo teclado. */
  var tabMovesFocus = false;
  var HINT_IDLE = 'Ctrl+Enter executa';
  var HINT_EDIT = 'Tab insere espaços · Esc sai';
  var HINT_TAB = 'Tab move o foco · Ctrl+M alterna';

  function setStatusHint(text) {
    if (els.statusHint) els.statusHint.textContent = text;
  }

  /* O painel do Roteiro muda de tom quando o cursor entra no editor: o
   * atalho contextual aparece no rodapé só nesse momento. */
  function setEditing(on) {
    if (!els.codePanel) return;
    els.codePanel.classList.toggle('is-editing', !!on);
  }

  els.code.addEventListener('focus', function () {
    setEditing(true);
    setStatusHint(tabMovesFocus ? HINT_TAB : HINT_EDIT);
  });

  els.code.addEventListener('blur', function () {
    setEditing(false);
    setStatusHint(HINT_IDLE);
  });

  els.code.addEventListener('keydown', function (ev) {
    if (state.debug) return; /* em debug o editor está travado: nenhuma tecla edita */
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.blur();
      return;
    }
    if (ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === 'm' || ev.key === 'M')) {
      ev.preventDefault();
      tabMovesFocus = !tabMovesFocus;
      setStatusHint(tabMovesFocus ? HINT_TAB : HINT_EDIT);
      return;
    }
    if (ev.key === 'Tab') {
      if (tabMovesFocus) return; /* deixa o navegador mover o foco */
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
  /* Dica de variável (segurar o mouse sobre um identificador)           */
  /* ------------------------------------------------------------------ */

  /* Durante a reprodução do trace, o valor das variáveis do passo atual já
   * está gravado no próprio passo (locals/this/globals) — o balão é só uma
   * outra forma de ler o mesmo que o painel Variáveis mostra. */

  var varTip = { key: null, timer: null, visible: false, mx: 0, my: 0 };
  var codeCharW = 0;
  var codeMeasure = null;

  function hoverEnabled() {
    return !!state.trace && steps().length > 0 && !state.playing &&
      els.code.value === state.traceCode;
  }

  function hideVarTip() {
    if (varTip.timer) { clearTimeout(varTip.timer); varTip.timer = null; }
    varTip.key = null;
    if (varTip.visible) {
      varTip.visible = false;
      els.varTip.classList.add('hidden');
      els.varTip.innerHTML = '';
    }
  }

  /* largura de um caractere na fonte monoespaçada do editor (medida uma vez) */
  function measureCharWidth() {
    if (codeCharW > 0) return codeCharW;
    /* o realce é redesenhado a cada edição e leva o medidor junto */
    if (codeMeasure && codeMeasure.parentNode !== els.highlight) codeMeasure = null;
    if (!codeMeasure) {
      codeMeasure = document.createElement('span');
      codeMeasure.className = 'code-measure';
      codeMeasure.textContent = '0000000000';
      if (els.highlight && typeof els.highlight.appendChild === 'function') {
        els.highlight.appendChild(codeMeasure);
      }
    }
    var w = 0;
    if (codeMeasure) {
      if (typeof codeMeasure.getBoundingClientRect === 'function') {
        w = codeMeasure.getBoundingClientRect().width || 0;
      }
      if (!w) w = codeMeasure.offsetWidth || 0;
    }
    codeCharW = w > 0 ? w / 10 : 0;
    return codeCharW;
  }

  /* converte a posição do mouse na expressão sob o cursor (ou null) */
  function codeWordAt(clientX, clientY) {
    if (typeof els.code.getBoundingClientRect !== 'function') return null;
    var cw = measureCharWidth();
    if (cw <= 0) return null;
    var r = els.code.getBoundingClientRect();
    var scrollLeft = codeScrollHold ? codeScrollX : (els.code.scrollLeft || 0);
    var x = clientX - r.left + scrollLeft - CODE_PAD_LEFT;
    var y = clientY - r.top + (els.code.scrollTop || 0) - PAD_TOP;
    if (x < 0 || y < 0) return null;
    var line = Math.floor(y / LINE_HEIGHT);
    var col = Math.floor(x / cw);
    var expr = DSV.expressionAt(els.code.value, line, col);
    if (!expr) return null;
    return { key: line + ':' + expr.name, name: expr.name, parts: expr.parts };
  }

  function positionVarTip(clientX, clientY) {
    /* o balão é filho do viewport do editor — ancora pelo retângulo dele */
    var r = typeof els.codeViewport.getBoundingClientRect === 'function'
      ? els.codeViewport.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };
    var left = clientX - r.left + 14;
    var top = clientY - r.top + 18;
    var w = els.varTip.offsetWidth || 0;
    var h = els.varTip.offsetHeight || 0;
    var maxW = r.width || els.code.clientWidth || 0;
    var maxH = r.height || els.code.clientHeight || 0;
    if (w && maxW && left + w > maxW - 8) left = Math.max(4, maxW - w - 8);
    if (h && maxH && top + h > maxH - 8) top = Math.max(4, clientY - r.top - h - 10);
    els.varTip.style.left = left + 'px';
    els.varTip.style.top = top + 'px';
  }

  function showVarTip(word, clientX, clientY) {
    var info = DSV.resolveExpression(steps()[state.index], word);
    if (!info) return; /* não é variável/expressão visível neste passo */
    els.varTip.innerHTML =
      '<div class="var-tip-head"><span class="var-tip-name">' + esc(info.name) + '</span>' +
      '<span class="var-tip-scope">' + esc(info.scope) + '</span></div>' +
      '<div class="var-tip-val">' + esc(DSV.fmtSerialized(info.sv)) + '</div>';
    els.varTip.classList.remove('hidden');
    varTip.visible = true;
    positionVarTip(clientX, clientY);
  }

  function onCodeHover(ev) {
    if (!hoverEnabled() || (typeof ev.buttons === 'number' && ev.buttons !== 0)) {
      hideVarTip();
      return;
    }
    var word = codeWordAt(ev.clientX, ev.clientY);
    if (!word) { hideVarTip(); return; }
    varTip.mx = ev.clientX;
    varTip.my = ev.clientY;
    if (varTip.visible && varTip.key === word.key) {
      positionVarTip(varTip.mx, varTip.my); /* acompanha o mouse no mesmo nome */
      return;
    }
    if (varTip.key === word.key && varTip.timer) return; /* já esperando o tempo */
    hideVarTip();
    varTip.key = word.key;
    varTip.timer = setTimeout(function () {
      varTip.timer = null;
      if (!hoverEnabled() || varTip.key !== word.key) return;
      showVarTip(word, varTip.mx, varTip.my);
    }, HOVER_DELAY);
  }

  els.code.addEventListener('mousemove', onCodeHover);
  els.code.addEventListener('mouseleave', hideVarTip);
  els.code.addEventListener('mousedown', hideVarTip);

  /* ------------------------------------------------------------------ */
  /* Execução                                                            */
  /* ------------------------------------------------------------------ */

  function run() {
    stopPlay();
    state.trace = DSV.interpret(els.code.value);
    state.traceCode = els.code.value;
    state.stale = false;
    state.opsMap = DSV.buildOpsMap(state.trace.steps);
    state.commands = DSV.buildCommands(state.trace.steps, state.traceCode);
    state.events = buildEventLog(state.trace.steps);
    state.visit = DSV.computeVisitOrder(state.trace.steps);
    state.forced = null;
    state.sticky = null;
    state.errorLine = state.trace.error && state.trace.error.line ? state.trace.error.line : null;

    state.candidates = DSV.traceCandidates(state.trace.steps, state.opsMap);
    buildStructureOptions();

    if (state.trace.error) {
      showBanner('Erro na linha ' + state.trace.error.line + ': ' + state.trace.error.message);
    } else {
      hideBanner();
    }

    renderGutter();
    els.slider.max = Math.max(state.trace.steps.length - 1, 0);
    /* executar reenquadra o canvas, mesmo depois de pan/zoom do usuário
     * (o enquadramento é aplicado no primeiro render da execução) */
    pendingCanvasFit = true;
    canvasView.moved = false;
    canvasFitKey = null;
    /* em caso de erro, posiciona no passo em que ele ocorreu */
    goto(state.trace.error && state.trace.steps.length ? state.trace.steps.length - 1 : 0);
  }

  /* Executar também dispara a reprodução: o trace já está todo calculado,
   * então o clique mostra a execução avançando em vez de parar no passo 1.
   * Em caso de erro não toca — o banner e o passo do erro já explicam. */
  function runAndPlay() {
    run();
    if (!state.trace.error && steps().length > 1) play();
    revealVizOnNarrow();
  }

  /* Primeiro contato: o portal abre com a estrutura já visível em vez de um
   * palco vazio. O passo escolhido é o primeiro em que o exemplo atual tem
   * conteúdo; Executar continua começando do primeiro passo, e um link com
   * ?passo=N manda mais que esta prévia. */
  function previewFirstStructure() {
    var st = steps();
    if (!st.length || state.trace && state.trace.error) return false;
    var sticky = null;
    var withContent = [];
    for (var i = 0; i < st.length && withContent.length < 3; i++) {
      var res = DSV.chooseStructure(st[i], { opsMap: state.opsMap, sticky: sticky });
      sticky = res.sticky;
      if (res.selection && DSV.candidateHasContent(st[i], res.selection)) withContent.push(i);
    }
    if (!withContent.length) return false;
    /* o terceiro passo com conteúdo costuma mostrar a estrutura já formada
     * (três pushes, três nós, três células) sem pular para o fim do trace */
    goto(withContent[Math.min(2, withContent.length - 1)]);
    /* o passo é uma prévia até o aluno agir: não é uma reprodução pausada */
    state.preview = true;
    updateVizChrome();
    updateStateInfo();
    return true;
  }

  /* No layout empilhado, executar rola até o desenho: o aluno acabou de pedir
   * para ver o código rodar, e as barras fixas do rodapé cobrem a parte de
   * baixo do painel se ele ficar na posição anterior. */
  function revealVizOnNarrow() {
    if (typeof window === 'undefined' || !els.vizPanel || window.innerWidth > 999) return;
    var r = els.vizPanel.getBoundingClientRect();
    var dock = 0;
    try {
      dock = parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue('--dock-h')) || 0;
    } catch (e) { /* ignora */ }
    var visibleBottom = window.innerHeight - dock;
    if (r.top >= -2 && r.bottom <= visibleBottom + 2) return; /* já cabe inteiro acima das barras */
    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignora */ }
    try {
      els.vizPanel.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    } catch (e) {
      try { els.vizPanel.scrollIntoView(true); } catch (e2) { /* ignora */ }
    }
  }

  function showBanner(msg) {
    els.banner.innerHTML = esc(msg);
    els.banner.classList.remove('hidden');
    /* o erro pertence ao editor: leitores de tela precisam ouvir que o
     * campo está inválido e qual foi a mensagem, não só o banner isolado */
    if (els.code && els.code.setAttribute) {
      els.code.setAttribute('aria-invalid', 'true');
      els.code.setAttribute('aria-describedby', 'banner statusHint');
    }
  }

  function hideBanner() {
    els.banner.classList.add('hidden');
    if (els.code && els.code.removeAttribute) {
      els.code.removeAttribute('aria-invalid');
      els.code.setAttribute('aria-describedby', 'statusHint');
    }
  }

  /* ordem fixa do seletor — a progressão da disciplina: array, pilha, fila,
   * lista encadeada, lista duplamente encadeada e árvore binária */
  function structureOptionRank(c) {
    if (c.type === 'array') return 0;
    if (c.type === 'stack') return 1;
    if (c.type === 'queue') return 2;
    if (c.type === 'list') return c.doubly ? 4 : 3;
    if (c.type === 'tree') return 5;
    return 6;
  }

  /* rótulo específico do candidato: "Lista" era ambíguo entre a encadeada e a
   * duplamente encadeada, e a árvore do visualizador é sempre binária */
  function structureOptionLabel(c) {
    if (c.type === 'list') return c.doubly ? 'Lista duplamente encadeada' : 'Lista encadeada';
    if (c.type === 'tree') return 'Árvore binária';
    return DSV.typeLabel(c.type);
  }

  function buildStructureOptions() {
    var html = '<button><selectedcontent></selectedcontent></button>' +
      '<option value="auto">Automático</option>';
    /* ordena uma cópia: a lista original continua com o maior score primeiro,
     * que é quem a seleção automática exibe */
    var ordered = state.candidates.slice().sort(function (a, b) {
      return (structureOptionRank(a) - structureOptionRank(b)) || (b.score - a.score);
    });
    ordered.forEach(function (c) {
      html += '<option value="' + esc(DSV.candidateKey(c)) + '">' +
        esc(structureOptionLabel(c) + ' — ' + c.label) + '</option>';
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

  /* O link "Guia" acompanha o exemplo ativo: abre a página da estrutura que
   * está sendo visualizada, não o índice genérico. */
  function updateGuiaLink() {
    if (!els.linkGuia) return;
    var ex = state.activeTab ? exampleById(state.activeTab) : null;
    var est = ex && ex.estrutura ? GUIA[ex.estrutura] : null;
    els.linkGuia.href = est ? est.pagina : 'guia/index.html';
    els.linkGuia.title = est ? 'Ler sobre ' + est.nome : 'Guia de estruturas de dados';
    els.linkGuia.setAttribute('aria-label', est ? 'Guia: ' + est.nome : 'Guia de estruturas de dados');
  }

  function renderTabs() {
    if (els.codePanel && els.codePanel.classList) {
      els.codePanel.classList.toggle('has-multiple-tabs', state.tabs.length > 1);
    }
    if (els.tabs) els.tabs.hidden = state.tabs.length < 2;
    var html = '';
    state.tabs.forEach(function (id) {
      var ex = exampleById(id);
      var active = id === state.activeTab;
      html += '<div class="tab' + (active ? ' active' : '') + '" data-tab="' + esc(id) + '" title="' + esc(ex ? ex.name : id) + '">' +
        '<button type="button" class="tab-name"' + (active ? ' aria-current="true"' : '') + '>' + esc(id + '.js') + '</button>' +
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
    /* cada aba mantém o próprio código: reabrir um exemplo restaura as edições */
    var buffered = state.buffers[id];
    els.code.value = buffered != null ? buffered : ex.code;
    codeScrollHold = false;
    codeScrollX = 0;
    els.exampleSelect.value = ex.id;
    els.exampleSelect.title = ex.name;
    try { localStorage.setItem(STORAGE_EX, ex.id); } catch (e) { /* ignora */ }
    updateGuiaLink();
    onEdit();
    fitCodeColumn();
    run();
    /* escolher um exemplo é o mesmo primeiro contato: abre na prévia com a
     * estrutura formada, em vez de um passo 1 vazio com estado "pausado" */
    previewFirstStructure();
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

  /* Link direto para um exemplo e um passo: `?exemplo=pilha-array&passo=4`.
   * O passo é 1-based, igual ao rótulo da interface. Quando há passo, o link
   * mostra o código original do exemplo (não o buffer editado pelo usuário),
   * porque o número do passo só faz sentido sobre o código que o gerou; o
   * buffer original continua salvo no localStorage. */
  function applyDeepLink() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return false; }
    var ex = exampleById(params.get('exemplo'));
    if (!ex) return false;

    var passo = parseInt(params.get('passo'), 10);
    var comPasso = isFinite(passo) && passo > 0;
    var tinhaBuffer = Object.prototype.hasOwnProperty.call(state.buffers, ex.id);
    var bufferAnterior = state.buffers[ex.id];

    if (comPasso) state.buffers[ex.id] = ex.code;
    openTab(ex.id);
    if (!comPasso) return false;

    if (tinhaBuffer) state.buffers[ex.id] = bufferAnterior;
    else delete state.buffers[ex.id];
    saveBuffers();
    stopPlay();
    goto(passo - 1);
    revealVizOnNarrow();
    return true;
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
  var ZOOM_FIT_MAX = 1.8;
  var canvasView = { x: 0, y: 0, zoom: 1, key: null, moved: false };
  var canvasInsetShift = 0; /* centro visível quando uma gaveta cobre o palco */
  var canvasInsetLeft = 0;
  var canvasInsetRight = 0;
  var canvasInsetBottom = 0; /* histórico aberto: a câmera enquadra acima dele */
  var canvasOverlayZoom = null; /* zoom de antes da gaveta, para devolvê-lo ao fechar */
  var canvasDrag = null;
  var canvasFitKey = null; /* tamanho do último desenho enquadrado (árvore/lista) */
  var canvasSelType = null; /* tipo da estrutura exibida (piso de zoom da árvore) */
  var canvasDoubly = false; /* lista dupla: PREV/NEXT têm piso de leitura */
  var canvasFocusKey = null; /* nó seguido pela câmera quando o piso não cabe */
  var pendingCanvasFit = false; /* reenquadra no próximo render (execução/breakpoint) */
  var canvasNarrow = typeof window !== 'undefined' && typeof window.innerWidth === 'number'
    ? window.innerWidth <= 1100 : false;

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

  /* Caixa do conteúdo dentro do palco. A árvore marca aqui o retângulo real
   * dos nós (sem a margem interna do SVG); as demais estruturas usam o
   * próprio palco. Assim o enquadramento aproveita o espaço pelos nós — e
   * não pelo padding invisível do desenho. */
  function canvasStageBox(e) {
    if (!e || !e.stage) return null;
    var sw = e.stage.offsetWidth || 0;
    var sh = e.stage.offsetHeight || 0;
    if (!sw || !sh) return null;
    var box = { w: sw, h: sh, cx: sw / 2, cy: sh / 2 };
    var raw = typeof e.stage.getAttribute === 'function' ? e.stage.getAttribute('data-content') : null;
    if (raw) {
      var p = raw.split(' ');
      var x = parseFloat(p[0]);
      var y = parseFloat(p[1]);
      var w = parseFloat(p[2]);
      var h = parseFloat(p[3]);
      if (isFinite(x) && isFinite(y) && w > 0 && h > 0) {
        box.w = w;
        box.h = h;
        box.cx = x + w / 2;
        box.cy = y + h / 2;
      }
    }
    return box;
  }

  function applyCanvasView() {
    var st = els.structure.style;
    if (st && typeof st.setProperty === 'function') {
      st.setProperty('--canvas-x', canvasView.x + 'px');
      st.setProperty('--canvas-y', canvasView.y + 'px');
      st.setProperty('--canvas-zoom', String(canvasView.zoom));
    }
    var zoomPct = Math.round(canvasView.zoom * 100);
    els.btnZoomReset.textContent = zoomPct + '%';
    els.btnZoomReset.setAttribute('aria-label', 'Zoom ' + zoomPct + '%, redefinir para 100%');
    var zoomEl = document.getElementById('stateZoom');
    if (zoomEl) zoomEl.textContent = zoomPct + '%';
  }

  function canvasCenter(zoom, offsetX) {
    var e = canvasParts();
    var box = canvasStageBox(e);
    if (!box || !e.vp) return false;
    var vw = e.vp.clientWidth || 0;
    var vh = Math.max(0, (e.vp.clientHeight || 0) - canvasInsetBottom);
    if (!vw || !vh) return false;
    var shift = offsetX == null ? canvasInsetShift : offsetX;
    canvasView.zoom = zoom;
    canvasView.x = Math.round(vw / 2 + shift - box.cx * zoom);
    canvasView.y = Math.round(vh / 2 - box.cy * zoom);
    applyCanvasView();
    return true;
  }

  /* Unidade visual do nó em foco: o list-unit carrega etiquetas e setas.
   * Centralizar só o nó cortava HEAD/TAIL e o vizinho imediato. */
  function canvasFocusUnitEl(el) {
    return el && typeof el.closest === 'function' ? el.closest('.list-unit') : null;
  }

  /* Nó em foco + vizinhos reais mais próximos. Terminadores (∅, ciclo)
   * não contam como contexto: mostrar o nó anterior é o que explica a
   * inserção; o terminador sozinho não. */
  function canvasFocusGroupEls(focus) {
    var unit = canvasFocusUnitEl(focus);
    if (!unit || !els.structure || typeof els.structure.querySelectorAll !== 'function') {
      return focus ? [focus] : [];
    }
    var units = els.structure.querySelectorAll('.list-unit');
    var idx = -1;
    for (var i = 0; i < units.length; i++) {
      if (units[i] === unit) { idx = i; break; }
    }
    if (idx < 0) return [focus];
    var sentinel = function (u) {
      var k = u.getAttribute('data-k') || '';
      return k === 'null' || k === 'null-start' || k === 'cycle';
    };
    var out = [unit];
    for (var p = idx - 1; p >= 0; p--) {
      if (!sentinel(units[p])) { out.push(units[p]); break; }
    }
    for (var n = idx + 1; n < units.length; n++) {
      if (!sentinel(units[n])) { out.push(units[n]); break; }
    }
    return out;
  }

  /* Retângulo que contém os elementos, em coordenadas do palco. */
  function canvasUnionRect(list) {
    var e = canvasParts();
    if (!e.stage || !list || !list.length) return null;
    var stRect = e.stage.getBoundingClientRect();
    var oldZoom = canvasView.zoom || 1;
    var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!el || typeof el.getBoundingClientRect !== 'function') continue;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      left = Math.min(left, (r.left - stRect.left) / oldZoom);
      top = Math.min(top, (r.top - stRect.top) / oldZoom);
      right = Math.max(right, (r.right - stRect.left) / oldZoom);
      bottom = Math.max(bottom, (r.bottom - stRect.top) / oldZoom);
    }
    if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) return null;
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }

  /* Centra o conjunto em coordenadas do palco, já considerando a área
   * coberta por gavetas (canvasInsetShift). Quando o conjunto é maior que a
   * área visível, o nó em foco manda: ele fica inteiro e o vizinho perde a
   * borda, em vez de o foco sair da tela junto com o contexto. */
  function canvasCenterOnRect(rect, zoom, focusEl) {
    var e = canvasParts();
    if (!rect || !e.vp) return false;
    var vw = e.vp.clientWidth || 0;
    var vh = Math.max(0, (e.vp.clientHeight || 0) - canvasInsetBottom);
    if (!vw || !vh) return false;
    var pad = 12;
    var visibleLeft = canvasInsetLeft;
    var visibleRight = vw - canvasInsetRight;
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var x = vw / 2 + canvasInsetShift - cx * zoom;

    var focusRect = focusEl ? canvasUnionRect([focusEl]) : null;
    if (focusRect && visibleRight - visibleLeft > pad * 2) {
      var fw = focusRect.width * zoom;
      var fl = focusRect.left * zoom + x;
      var fr = focusRect.right * zoom + x;
      if (fw <= visibleRight - visibleLeft - pad * 2) {
        if (fl < visibleLeft + pad) x += visibleLeft + pad - fl;
        if (fr > visibleRight - pad) x -= fr - (visibleRight - pad);
      } else {
        /* o próprio foco não cabe: ancora a borda esquerda, que é a
         * extremidade lida primeiro */
        x += visibleLeft + pad - fl;
      }
    }

    canvasView.zoom = zoom;
    canvasView.x = Math.round(x);
    canvasView.y = Math.round(vh / 2 - cy * zoom);
    applyCanvasView();
    return true;
  }

  /* Quando o piso de zoom mantém o desenho maior que a área visível, centra
   * o nó em foco com o máximo de vizinhança que ainda cabe. */
  function canvasCenterOnFocus(zoom) {
    var focus = canvasFocusNodeEl();
    if (!focus) return false;
    var group = canvasFocusGroupEls(focus);
    if (!group.length) return false;
    var rect = canvasUnionRect(group);
    if (!rect) return false;
    return canvasCenterOnRect(rect, zoom, focus);
  }

  /* nó que o passo está destacando (pendente, alvo, ativo ou recém-criado) */
  function canvasFocusNodeEl() {
    if (!els.structure || canvasSelType !== 'list') return null;
    var sels = ['.list-node.pending', '.list-node.target', '.list-node.active', '.list-node.new'];
    for (var i = 0; i < sels.length; i++) {
      var el = els.structure.querySelector(sels[i]);
      if (el) return el;
    }
    return null;
  }

  function canvasFocusKeyOf(el) {
    if (!el || typeof el.closest !== 'function') return '';
    var unit = el.closest('.list-unit');
    return unit ? (unit.getAttribute('data-k') || '') : '';
  }

  /* razão de enquadramento do desenho atual (null quando ainda não há medidas) */
  function canvasFitRatio() {
    var e = canvasParts();
    var box = canvasStageBox(e);
    if (!box || !e.vp) return null;
    var vw = (e.vp.clientWidth || 0) - canvasInsetLeft - canvasInsetRight;
    var vh = Math.max(0, (e.vp.clientHeight || 0) - canvasInsetBottom);
    if (vw <= 0 || !vh) return null;
    /* a folga do enquadramento acompanha o palco: 64px em telas largas,
     * 32px nos recortes estreitos — o desenho não perde espaço útil por
     * causa de uma margem fixa pensada para outra resolução. */
    var pad = Math.max(32, Math.min(64, Math.round(Math.min(vw, vh) * 0.08)));
    return Math.min((vw - pad) / box.w, (vh - pad) / box.h);
  }

  /* zoom de enquadramento: amplia estruturas pequenas até o teto da câmera
   * e respeita os pisos de legibilidade (árvore em tela estreita; lista
   * dupla no recorte de projeção) */
  function canvasFitZoom(fit) {
    var floor = Math.max(canvasTreeFitFloor(), canvasListFitFloor());
    if (floor && fit < floor) fit = floor;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_FIT_MAX, fit));
  }

  /* Em telas estreitas, uma árvore grande enquadrada inteira fica com
   * valores pequenos demais para ler. O piso de zoom mantém o desenho
   * legível e deixa o restante ao pan; o botão "ajustar à tela" continua
   * mostrando a árvore inteira quando o aluno quiser a visão geral. */
  function canvasTreeFitFloor() {
    if (canvasSelType !== 'tree') return 0;
    var w = typeof window.innerWidth === 'number' ? window.innerWidth : 0;
    return w > 0 && w <= 560 ? 0.62 : 0;
  }

  /* Em listas duplas, PREV/NEXT são o que distingue a estrutura da lista
   * simples. No recorte de projeção (palco até ~1100px), o enquadramento
   * automático encolhia esses rótulos para ~9px. A lista passa a manter o
   * tamanho-base e o excedente fica no pan; "ajustar à tela" continua
   * mostrando a lista inteira quando o aluno quiser a visão geral. */
  function canvasListFitFloor() {
    if (canvasSelType !== 'list' || !canvasDoubly) return 0;
    var e = canvasParts();
    var vw = e.vp ? (e.vp.clientWidth || 0) : 0;
    return vw > 0 && vw <= 1100 ? 1 : 0;
  }

  /* enquadra sem ampliar: 100% quando cabe, reduz quando a estrutura é maior */
  function canvasHome() {
    var fit = canvasFitRatio();
    if (fit == null) return false;
    return canvasCenter(fit < 1 ? Math.max(ZOOM_MIN, fit) : 1);
  }

  /* ajusta à tela pelo botão: marca a câmera como "do usuário" (o auto-fit para) */
  function canvasFit() {
    var fit = canvasFitRatio();
    if (fit == null) return;
    canvasCenter(Math.max(ZOOM_MIN, Math.min(ZOOM_FIT_MAX, fit)));
    canvasView.moved = true;
  }

  /* enquadramento da execução (primeiro render depois de executar): pode
   * ampliar estruturas pequenas até ZOOM_FIT_MAX e NÃO marca moved — assim a
   * estrutura continua acompanhada nos passos seguintes */
  function canvasFitNow(allowEnlarge) {
    var fit = canvasFitRatio();
    if (fit == null) return false;
    var zoom = canvasFitZoom(fit);
    if (!allowEnlarge && zoom > 1) zoom = 1;
    if (zoom > fit + 0.001) {
      var focus = canvasFocusNodeEl();
      canvasFocusKey = canvasFocusKeyOf(focus);
      if (focus && canvasCenterOnFocus(zoom)) return true;
    }
    return canvasCenter(zoom);
  }

  /* acompanha o desenho: reduz o zoom quando não couber mais; recentraliza
   * quando pedido (a fila evita o salto de recentralizar a cada item novo) */
  function canvasKeepFitted(recenter) {
    var fit = canvasFitRatio();
    if (fit == null) return false;
    var z = Math.max(ZOOM_MIN, Math.min(canvasView.zoom, canvasFitZoom(fit)));
    if (z < canvasView.zoom || recenter) {
      canvasCenter(z);
      return true;
    }
    return false;
  }

  /* fila: cresce para a direita; se escapou da área visível, recentraliza no
   * zoom atual (sem reenquadrar a cada passo, o que daria saltos) */
  function canvasEnsureVisible() {
    var fit = canvasFitRatio();
    if (fit == null) return false;
    if (fit < canvasView.zoom) return canvasCenter(Math.max(ZOOM_MIN, fit));
    var e = canvasParts();
    var vw = e.vp.clientWidth || 0;
    var vh = Math.max(0, (e.vp.clientHeight || 0) - canvasInsetBottom);
    var sw = e.stage.offsetWidth * canvasView.zoom;
    var sh = e.stage.offsetHeight * canvasView.zoom;
    var pad = 16;
    var escaped = canvasView.x + sw > vw + pad || canvasView.x < -pad ||
      canvasView.y + sh > vh + pad || canvasView.y < -pad;
    if (escaped) return canvasCenter(canvasView.zoom);
    return false;
  }

  /* o desenho atual ficou (quase) fora da área visível? */
  function canvasStructureOutOfView() {
    var e = canvasParts();
    if (!e.vp || !e.stage) return false;
    if (typeof e.vp.getBoundingClientRect !== 'function' ||
        typeof e.stage.getBoundingClientRect !== 'function') return false;
    var vp = e.vp.getBoundingClientRect();
    var st = e.stage.getBoundingClientRect();
    if (!st.width || !st.height) return false;
    var ix = Math.min(vp.right, st.right) - Math.max(vp.left, st.left);
    var iy = Math.min(vp.bottom, st.bottom) - Math.max(vp.top, st.top);
    var visible = (Math.max(0, ix) * Math.max(0, iy)) / (st.width * st.height);
    return visible < 0.5;
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

  /* árvore e lista: reenquadra quando o desenho muda de tamanho (inserção/
   * remoção), mantendo a câmera acompanhando o conteúdo. Estruturas pequenas
   * continuam ampliadas (até o teto da câmera) em vez de caírem para 100% a
   * cada passo; a partir do momento em que o aluno mexe no zoom, a câmera
   * para de se mover sozinha até a próxima execução. */
  function canvasAutoFit() {
    var e = canvasParts();
    if (!e.vp || !e.stage) return;
    var fit = canvasFitRatio();
    if (fit == null) return;
    var sig = Math.round(e.stage.offsetWidth) + 'x' + Math.round(e.stage.offsetHeight);
    var zoom = canvasFitZoom(fit);
    var follow = zoom > fit + 0.001;
    var focus = follow ? canvasFocusNodeEl() : null;
    var focusKey = canvasFocusKeyOf(focus);
    if (sig !== canvasFitKey || (follow && focusKey !== canvasFocusKey)) {
      canvasFitKey = sig;
      canvasFocusKey = follow ? focusKey : null;
      if (follow && focus && canvasCenterOnFocus(zoom)) return;
      canvasCenter(zoom);
      return;
    }
    canvasCenter(canvasView.zoom);
  }

  /* chamado a cada renderização: acompanha a estrutura até o usuário mexer */
  function canvasAfterRender(sel) {
    if (!canvasSupported()) return;
    canvasSelType = sel ? sel.type : null;
    canvasDoubly = !!(sel && sel.type === 'list' && sel.doubly);
    /* árvore e lista mantêm o enquadramento entre passos mesmo quando a
     * identidade do desenho muda (raiz ou head trocam de nó); o fit inicial
     * acontece quando a estrutura aparece ou esvazia */
    var key;
    if (!sel || sel.id == null) key = 'none';
    else if (sel.type === 'tree' || sel.type === 'list') key = sel.type + '|' + sel.label;
    else key = sel.type + '|' + sel.id;
    if (key !== canvasView.key) {
      canvasView.moved = false;
      canvasFitKey = null;
      /* ainda sem estrutura real: só centraliza e mantém o fit pendente */
      if (pendingCanvasFit && sel && sel.id != null) {
        /* execução: enquadra o desenho real, podendo ampliar estruturas
         * pequenas (a câmera continua acompanhando os próximos passos) */
        pendingCanvasFit = false;
        if (canvasFitNow(true)) canvasView.key = key;
        return;
      }
      /* a estrutura exibida mudou: enquadra o conteúdo real, inclusive
       * ampliando estruturas pequenas — a câmera não fica presa em 100% */
      if (sel && sel.id != null && canvasFitNow(true)) { canvasView.key = key; return; }
      /* ainda sem estrutura real: só centraliza */
      if (canvasHome()) canvasView.key = key;
      return;
    }
    if (pendingCanvasFit && sel && sel.id != null) {
      pendingCanvasFit = false;
      canvasFitNow(true);
      return;
    }
    if (canvasView.moved) return;
    /* a fila cresce na horizontal: recentralizar a cada passo deslocaria a
     * linha inteira de uma vez (salto); só reenquadra se escapou da área */
    if (sel && sel.type === 'queue') {
      canvasEnsureVisible();
      return;
    }
    if (sel && (sel.type === 'tree' || sel.type === 'list')) canvasAutoFit();
    else canvasKeepFitted(true);
  }

  /* ------------------------------------------------------------------ */
  /* Workspace — Caderno de Execução                                     */
  /* O Roteiro é uma coluna permanente em >=1024px; abaixo disso ele      */
  /* continua sendo a gaveta contextual das etapas anteriores. A Margem  */
  /* mantém o comportamento anterior (coluna >=1200, sobreposição antes). */
  /* ------------------------------------------------------------------ */

  var SPLIT_MIN_CODE = 340;       /* piso da gaveta de código em <1024 */
  /* A gaveta estreita ainda usa o auto-ajuste antigo; o Roteiro em coluna
   * tem largura própria e estável. O teto de 620px não vale para a coluna. */
  var SPLIT_MAX_CODE_PX = 620;
  var SPLIT_MAX_CODE_RATIO = 0.44;
  var SPLIT_FIT_MAX = 600;
  var CODE_MIN_WIDE = 420;
  var CODE_MAX_WIDE = 900;        /* teto do gesto de ampliar; a Prancha fica com >=480 */
  var CODE_MIN_COMPACT = 340;
  var CODE_MAX_COMPACT = 560;
  var CODE_DEFAULT_COMPACT = 360;
  var PRANCHA_MIN = 480;
  var splitDrag = null;
  var codeFit = 0;                /* largura medida da linha mais longa, transitória */
  var codeUserResized = false;    /* o usuário arrastou: o ajuste automático para */
  var runPlacement = null;        /* 'code' | 'top' — onde Executar/Depurar vivem */
  var reguaObserver = null;       /* altura real da Régua para a Margem em folha */
  var vizObserver = null;         /* largura real do palco durante as transições */
  var codeObserver = null;        /* largura real do editor após o reflow */
  var collapsed = { code: true, side: true };
  var lastVizWidth = 0;           /* o canvas só reenquadra quando a área muda */
  var lastOverlayShift = 0;       /* deslocamento para manter o desenho visível sob a gaveta */
  var sheetMotionTimer = null;    /* janela em que Código/Margem têm movimento */
  var lastSheetState = { code: null, side: null };

  function layoutEl() {
    return els.layout && typeof els.layout.getBoundingClientRect === 'function' ? els.layout : null;
  }

  function panelEls() {
    return { code: els.codePanel, viz: els.vizPanel, side: els.sidePanel };
  }

  function codeColumnMode() {
    return viewportWidth() >= 1024;
  }

  function codeCompactMode() {
    return viewportWidth() < 1280;
  }

  /* Largura que o editor precisa para a linha mais longa caber sem rolagem
   * horizontal. O <pre> do realce tem min-width:100%, então scrollWidth
   * devolve a largura do painel quando o código é curto — o Range mede só o
   * texto. Isso permite a gaveta estreita abrir já no tamanho útil do exemplo. */
  function codeColumnNeed() {
    if (!els.highlight) return 0;
    var content = 0;
    if (typeof document !== 'undefined' && document.createRange) {
      try {
        var range = document.createRange();
        range.selectNodeContents(els.highlight);
        var rect = range.getBoundingClientRect();
        content = rect && rect.width ? rect.width : 0;
        if (typeof range.detach === 'function') range.detach();
      } catch (e) { content = 0; }
    }
    if (!content) content = els.highlight.scrollWidth || 0;
    if (!content) return 0;
    var gutter = 44;
    var pad = 28;
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      var cs = window.getComputedStyle(els.highlight);
      if (els.gutter) gutter = els.gutter.getBoundingClientRect().width || gutter;
      pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    }
    return Math.ceil(gutter + pad + content + 2);
  }

  /* Largura da coluna da Margem. A medição direta falha no instante em que
   * a Margem está sendo aberta (o painel ainda está oculto); nesse caso a
   * fórmula do CSS resolve o mesmo clamp(300px, 34vw, 372px). */
  function sideColumnWidth(total) {
    var measured = panelWidth(els.sidePanel);
    if (measured > 0 && !collapsed.side) return measured;
    var width = total > 0 ? total * 0.34 : 372;
    return Math.round(Math.min(372, Math.max(300, width)));
  }

  /* Limites da coluna. O padrão fica entre 420 e 620px; o gesto de ampliar
   * chega a 900px, mas nunca come a área mínima da Prancha (480px). Com a
   * Margem aberta, o desenho continua sendo a maior superfície. */
  function codeBounds(total) {
    var compact = codeCompactMode();
    var min = compact ? CODE_MIN_COMPACT : CODE_MIN_WIDE;
    var max = compact ? CODE_MAX_COMPACT : CODE_MAX_WIDE;
    if (total > 0) max = Math.min(max, total - 4 - PRANCHA_MIN);
    if (!collapsed.side && viewportWidth() >= 1200 && total > 0) {
      var sideW = sideColumnWidth(total);
      var free = total - sideW - 4;
      max = Math.min(max, free - PRANCHA_MIN);
      max = Math.min(max, Math.floor(free / 2) - 8);
      /* Com a Margem aberta, o Roteiro recua para 430px: a Prancha continua
       * sendo a maior superfície mesmo quando as duas gavetas dividem a tela. */
      max = Math.min(max, 430);
    }
    if (max < min) max = min;
    return { min: min, max: max };
  }

  /* Largura inicial: ~40% da tela, com teto de 620px. Depois de um arrasto
   * ou de uma ampliação, vale a proporção salva. */
  function defaultCodeWidth(total) {
    if (!codeColumnMode()) return 448;
    if (codeCompactMode()) return CODE_DEFAULT_COMPACT;
    var width = total > 0 ? total * DEFAULT_CODE_RATIO : 576;
    return Math.round(DSV.clamp(width, CODE_MIN_WIDE, 620));
  }

  function targetCodeWidth() {
    var layout = layoutEl();
    var total = layout ? (layout.getBoundingClientRect().width || 0) : 0;

    /* Abaixo de 1024 o Roteiro ainda é uma gaveta: mantém o auto-ajuste
     * antigo para abrir na largura útil da linha mais longa. */
    if (!codeColumnMode()) {
      if (!total) return 448;
      var overlayMax = Math.min(SPLIT_MAX_CODE_PX, total * SPLIT_MAX_CODE_RATIO);
      var overlayMin = Math.min(SPLIT_MIN_CODE, overlayMax);
      var overlayWidth = workspace.codeRatio * total;
      if (codeFit && !codeUserResized) overlayWidth = Math.max(overlayWidth, codeFit);
      return Math.round(DSV.clamp(overlayWidth, overlayMin, overlayMax));
    }

    var bounds = codeBounds(total);
    if (workspace.codeExpanded) return bounds.max;
    var width = codeUserResized
      ? workspace.codeRatio * total
      : defaultCodeWidth(total);
    return Math.round(DSV.clamp(width, bounds.min, bounds.max));
  }

  /* Executar/Depurar pertencem ao Roteiro quando ele está em coluna. Se a
   * coluna for recolhida — ou abaixo de 1024 — os mesmos nós voltam para a
   * topbar: um único par de botões, sem duplicação e sem perder listeners. */
  function syncRunPlacement() {
    var useCode = codeColumnMode() && !collapsed.code;
    var slot = useCode ? els.roteiroRunSlot : els.topbarRunSlot;
    var where = useCode ? 'code' : 'top';
    if (!slot || !els.btnRun || !els.btnDebug || runPlacement === where) return;
    slot.appendChild(els.btnRun);
    slot.appendChild(els.btnDebug);
    runPlacement = where;
  }

  /* A Margem em folha (1024–1199) termina no topo da Régua. A altura é
   * medida da Régua real porque a legenda pode ocupar uma ou duas linhas;
   * o observador mantém a folha alinhada quando a largura muda. */
  function syncReguaHeight() {
    if (!els.layout || !els.dock || !els.layout.style) return;
    var h = typeof els.dock.getBoundingClientRect === 'function'
      ? (els.dock.getBoundingClientRect().height || 0)
      : 0;
    els.layout.style.setProperty('--regua-h', Math.ceil(h) + 'px');
  }

  function setupReguaHeight() {
    syncReguaHeight();
    if (typeof ResizeObserver !== 'function' || !els.dock) return;
    reguaObserver = new ResizeObserver(function () { syncReguaHeight(); });
    reguaObserver.observe(els.dock);
  }

  /* As gavetas têm transição de largura: medir o palco no clique pega o
   * meio do movimento e a câmera fica no lugar errado. O observador avisa
   * quando a largura real chega ao destino e reenquadra na área final. */
  function setupVizResize() {
    if (typeof ResizeObserver !== 'function' || !els.vizPanel) return;
    vizObserver = new ResizeObserver(function () {
      var w = els.vizPanel.getBoundingClientRect().width || 0;
      if (!w || Math.abs(w - lastVizWidth) <= 1) return;
      afterLayoutChange();
    });
    vizObserver.observe(els.vizPanel);
  }

  /* O textarea só expõe o novo scrollWidth depois de o painel reflowar.
   * O observador reavalia o overflow quando a largura real do editor muda
   * (abrir/fechar Margem, arrastar a divisória, ampliar o Roteiro). */
  function setupCodeOverflow() {
    if (typeof ResizeObserver !== 'function' || !els.code) return;
    codeObserver = new ResizeObserver(function () { updateCodeOverflow(); });
    codeObserver.observe(els.code);
  }

  /* Abrir/recolher é uma ação do Caderno, não um estado permanente: a janela
   * de movimento existe só enquanto a folha entra ou sai. Arrastar a
   * divisória, redimensionar a janela e o ajuste de fonte continuam diretos. */
  function markSheetMotion(opening) {
    var layout = layoutEl();
    if (!layout || !layout.classList) return;
    layout.classList.add('is-sheet-moving');
    layout.classList.toggle('is-sheet-closing', !opening);
    if (sheetMotionTimer) clearTimeout(sheetMotionTimer);
    /* Folga sobre a transição mais longa (240ms) para uma troca de aba não
     * cortar o movimento no meio; a janela não segura nada depois disso. */
    sheetMotionTimer = setTimeout(function () {
      sheetMotionTimer = null;
      layout.classList.remove('is-sheet-moving');
      layout.classList.remove('is-sheet-closing');
    }, 400);
  }

  /* aplica as classes e a largura; a grade do CSS cuida do resto */
  function applyLayout() {
    var p = panelEls();

    /* A direção do movimento é a do gesto: se alguma folha abriu, entra;
     * se as duas fecharam (Esc, histórico no celular), sai mais curto. */
    var codeChanged = lastSheetState.code !== null && lastSheetState.code !== collapsed.code;
    var sideChanged = lastSheetState.side !== null && lastSheetState.side !== collapsed.side;
    if (codeChanged || sideChanged) {
      markSheetMotion((codeChanged && !collapsed.code) || (sideChanged && !collapsed.side));
    }
    lastSheetState.code = collapsed.code;
    lastSheetState.side = collapsed.side;

    /* A grade é atualizada antes de os painéis serem ocultados: assim uma
     * leitura de layout entre a classe do painel e a coluna não vê a grade
     * antiga por um instante (o Chromium expõe essa transição ao Playwright). */
    var layout = layoutEl();
    var codeWidth = targetCodeWidth();
    if (layout) {
      layout.classList.toggle('code-collapsed', collapsed.code);
      layout.classList.toggle('side-collapsed', collapsed.side);
      if (layout.style && typeof layout.style.setProperty === 'function') {
        layout.style.setProperty('--code-w', codeWidth + 'px');
      }
      /* Força o recálculo da grade antes de esconder um painel; sem isso o
       * Chromium pode expor, por um frame, a coluna antiga com o painel já
       * recolhido (visível para o Playwright e para leituras de layout). */
      if (typeof layout.offsetWidth === 'number') void layout.offsetWidth;
    }

    if (p.code) p.code.classList.toggle('collapsed', collapsed.code);
    if (p.side) p.side.classList.toggle('collapsed', collapsed.side);

    if (els.splitLeft) {
      els.splitLeft.classList.toggle('collapsed', collapsed.code);
      els.splitLeft.setAttribute('aria-valuenow', String(Math.round(workspace.codeRatio * 100)));
      els.splitLeft.setAttribute('aria-valuetext', codeWidth + ' px');
    }

    if (els.btnExpandCode) {
      var expandOn = !!workspace.codeExpanded && !collapsed.code && codeColumnMode();
      var totalWidth = layout && typeof layout.getBoundingClientRect === 'function'
        ? (layout.getBoundingClientRect().width || 0)
        : 0;
      var atMax = !expandOn && totalWidth > 0 && codeWidth >= codeBounds(totalWidth).max - 1;
      els.btnExpandCode.disabled = atMax;
      els.btnExpandCode.classList.toggle('active', expandOn);
      els.btnExpandCode.setAttribute('aria-pressed', expandOn ? 'true' : 'false');
      els.btnExpandCode.title = expandOn
        ? 'Restaurar largura do editor'
        : (atMax ? 'O editor já está na largura máxima' : 'Ampliar editor');
      els.btnExpandCode.setAttribute('aria-label', expandOn
        ? 'Restaurar largura do editor'
        : (atMax ? 'Editor na largura máxima' : 'Ampliar editor'));
    }

    var codeOpen = !collapsed.code;
    var sideOpen = !collapsed.side;

    if (els.btnToggleCode) {
      els.btnToggleCode.classList.toggle('active', codeOpen);
      els.btnToggleCode.setAttribute('aria-pressed', codeOpen ? 'true' : 'false');
      els.btnToggleCode.title = codeOpen ? 'Recolher o editor de código' : 'Abrir o editor de código';
      els.btnToggleCode.setAttribute('aria-label', codeOpen ? 'Recolher o editor de código' : 'Abrir o editor de código');
    }
    if (els.btnToggleSide) {
      els.btnToggleSide.classList.toggle('active', sideOpen);
      els.btnToggleSide.setAttribute('aria-pressed', sideOpen ? 'true' : 'false');
      els.btnToggleSide.title = sideOpen
        ? 'Recolher a margem: variáveis, chamadas e estado'
        : 'Abrir a margem: variáveis, chamadas e estado';
      els.btnToggleSide.setAttribute('aria-label', els.btnToggleSide.title);
    }
    if (els.railCode) els.railCode.setAttribute('aria-expanded', codeOpen ? 'true' : 'false');
    if (els.railInspector) els.railInspector.setAttribute('aria-expanded', sideOpen ? 'true' : 'false');
    if (els.sidePanel) els.sidePanel.setAttribute('aria-hidden', sideOpen ? 'false' : 'true');
    syncRunPlacement();
    /* A largura da coluna pode mudar sem que o textarea role: o controle
     * "ver o resto" e a classe de overflow pertencem ao novo recorte. */
    updateCodeOverflow();
  }

  /* altura do histórico aberto: a câmera enquadra o desenho na área acima
   * dele em vez de deixar a base escondida atrás da gaveta */
  function dockHistoryHeight() {
    if (!workspace.dockOpen || !els.dockHistory || els.dockHistory.hidden) return 0;
    if (typeof els.dockHistory.getBoundingClientRect !== 'function') return 0;
    var r = els.dockHistory.getBoundingClientRect();
    return r ? Math.max(0, Math.round(r.height)) : 0;
  }

  /* A câmera só se mexe quando a área útil do palco realmente muda; abrir uma
   * gaveta sobre o desenho em tela estreita desloca o conteúdo para a área
   * livre em vez de deixá-lo atrás da folha. Zoom/pan manuais nunca são
   * sobrescritos. */
  function afterLayoutChange() {
    canvasFitKey = null;
    var prevBottom = canvasInsetBottom;
    canvasInsetBottom = dockHistoryHeight();
    var dockChanged = prevBottom !== canvasInsetBottom;
    var vizW = els.vizPanel && typeof els.vizPanel.getBoundingClientRect === 'function'
      ? (els.vizPanel.getBoundingClientRect().width || 0)
      : 0;
    var changed = !vizW || Math.abs(vizW - lastVizWidth) > 1;
    lastVizWidth = vizW;

    var overlayMode = !codeColumnMode();
    var sideOverlay = viewportWidth() < 1200;
    var leftInset = overlayMode && !collapsed.code ? panelWidth(els.codePanel) : 0;
    var rightInset = sideOverlay && !collapsed.side ? panelWidth(els.sidePanel) : 0;
    /* Gaveta quase de tela cheia: não vale reenquadrar o desenho para uma
     * fatia invisível. O palco por trás permanece como estava. */
    if (vizW && vizW - leftInset - rightInset < 260) {
      leftInset = 0;
      rightInset = 0;
    }
    var shift = Math.round((leftInset - rightInset) / 2);
    canvasInsetLeft = leftInset;
    canvasInsetRight = rightInset;
    canvasInsetShift = shift;

    var hasInset = (overlayMode && leftInset > 0) || (sideOverlay && rightInset > 0);
    if (hasInset && canvasOverlayZoom == null && !canvasView.moved) {
      canvasOverlayZoom = canvasView.zoom;
    } else if (!hasInset && canvasOverlayZoom != null) {
      var restoreZoom = canvasOverlayZoom;
      canvasOverlayZoom = null;
      if (!canvasView.moved) {
        var fullFit = canvasFitRatio();
        if (fullFit != null) restoreZoom = Math.min(restoreZoom, canvasFitZoom(fullFit));
        canvasCenter(restoreZoom);
        lastOverlayShift = 0;
        lastVizWidth = vizW;
        return;
      }
    }

    if (dockChanged && !canvasView.moved) {
      canvasFitNow(true);
      lastOverlayShift = shift;
      lastVizWidth = vizW;
      return;
    }

    if (changed) {
      lastOverlayShift = shift;
      if (!canvasView.moved) canvasKeepFitted(true);
      return;
    }
    if (shift !== lastOverlayShift) {
      lastOverlayShift = shift;
      if (!canvasView.moved) canvasCenter(canvasView.zoom);
    }
  }

  function panelWidth(panel) {
    if (!panel || typeof panel.getBoundingClientRect !== 'function') return 0;
    return panel.getBoundingClientRect().width || 0;
  }

  function focusOutsidePanel(panel, fallback) {
    if (!panel || !fallback || typeof document === 'undefined') return;
    var active = document.activeElement;
    if (!active || active === document.body) return;
    if (typeof panel.contains === 'function' && panel.contains(active) && typeof fallback.focus === 'function') {
      fallback.focus();
    }
  }

  function togglePanel(which, opts) {
    var opening = collapsed[which];
    /* Abaixo de 1200 a Margem ainda é folha sobre o palco (o Roteiro já é
     * coluna a partir de 1024): abrir uma fecha a outra, para o desenho não
     * ficar imprensado entre duas superfícies. Acima disso as duas são
     * colunas e podem coexistir. */
    if (opening && viewportWidth() < 1200) {
      var other = which === 'code' ? 'side' : 'code';
      if (!collapsed[other]) collapsed[other] = true;
    }
    collapsed[which] = !collapsed[which];
    workspace.collapsed.code = collapsed.code;
    workspace.collapsed.side = collapsed.side;
    applyLayout();
    if (which === 'side' && !collapsed.side) showSideHint();
    if (which === 'code' && !collapsed.code) {
      fitCodeColumn();
      /* abre no ponto que está sendo estudado, não no topo do arquivo */
      var step = steps()[state.index];
      var line = state.errorLine || (step && step.line);
      if (line) ensureLineVisible(line);
    }
    afterLayoutChange();
    /* A aba lateral que abriu a gaveta some; o foco vai para o fechar da
     * própria gaveta, não fica em um elemento invisível. */
    if (opening && opts && opts.fromRail) {
      var entry = which === 'code' ? els.btnCollapseCode : els.btnCollapseSide;
      if (entry && typeof entry.focus === 'function') entry.focus();
    }
    if (collapsed[which]) {
      focusOutsidePanel(which === 'code' ? els.codePanel : els.sidePanel,
        which === 'code' ? (els.btnToggleCode || els.railCode) : (els.btnToggleSide || els.railInspector));
    }
    saveWorkspace();
  }

  /* reajusta a gaveta de código quando o exemplo aberto tem linhas longas;
   * a coluna permanente tem largura própria e estável, então o auto-ajuste
   * fica restrito ao recorte <1024. Depois de um arrasto, ele para. */
  function fitCodeColumn() {
    if (collapsed.code || codeUserResized || codeColumnMode()) return;
    var need = codeColumnNeed();
    if (!need) return;
    need = Math.min(need, SPLIT_FIT_MAX);
    if (Math.abs(need - codeFit) < 2) return;
    codeFit = need;
    applyLayout();
  }

  function splitDelta(dx) {
    var layout = layoutEl();
    if (!layout || !dx) return;
    var total = layout.getBoundingClientRect().width || 0;
    if (!total) return;
    var bounds = codeBounds(total);
    var next = DSV.clamp(targetCodeWidth() + dx, bounds.min, bounds.max);
    workspace.codeRatio = next / total;
    workspace.codeUserResized = true;
    workspace.codeExpanded = false;
    workspace.codeRatioBeforeExpand = null;
    codeFit = 0;
    codeUserResized = true;
    applyLayout();
  }

  /* Ampliar é um gesto explícito, não um acidente de arrasto: a folha vai ao
   * teto que ainda deixa a Prancha respirar e volta à largura anterior. */
  function toggleCodeExpand() {
    if (collapsed.code || !codeColumnMode()) return;
    var layout = layoutEl();
    var total = layout ? (layout.getBoundingClientRect().width || 0) : 0;
    if (!total) return;

    if (workspace.codeExpanded) {
      var restore = workspace.codeRatioBeforeExpand;
      workspace.codeExpanded = false;
      workspace.codeRatioBeforeExpand = null;
      workspace.codeRatio = restore != null ? restore : defaultCodeWidth(total) / total;
      workspace.codeUserResized = true;
      codeUserResized = true;
    } else {
      var bounds = codeBounds(total);
      workspace.codeRatioBeforeExpand = codeUserResized
        ? workspace.codeRatio
        : defaultCodeWidth(total) / total;
      workspace.codeExpanded = true;
      workspace.codeRatio = bounds.max / total;
      workspace.codeUserResized = true;
      codeUserResized = true;
    }
    codeFit = 0;
    applyLayout();
    syncScroll();
    afterLayoutChange();
    saveWorkspace();
  }

  function splitterDown(ev) {
    if (ev.button !== 0) return;
    var el = ev.currentTarget;
    splitDrag = { id: ev.pointerId, x: ev.clientX, el: el };
    if (el && el.classList) el.classList.add('dragging');
    var layout = layoutEl();
    if (layout && layout.classList) layout.classList.add('is-resizing');
    if (el && typeof el.setPointerCapture === 'function') {
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
    }
    if (ev.preventDefault) ev.preventDefault();
  }

  function splitterMove(ev) {
    if (!splitDrag || ev.pointerId !== splitDrag.id) return;
    var dx = ev.clientX - splitDrag.x;
    splitDrag.x = ev.clientX;
    splitDelta(dx);
  }

  function splitterUp(ev) {
    if (!splitDrag) return;
    var el = splitDrag.el;
    splitDrag = null;
    if (el && el.classList) el.classList.remove('dragging');
    var layout = layoutEl();
    if (layout && layout.classList) layout.classList.remove('is-resizing');
    if (el && ev && typeof el.releasePointerCapture === 'function') {
      try { el.releasePointerCapture(ev.pointerId); } catch (e) { /* ignora */ }
    }
    afterLayoutChange();
    saveWorkspace();
  }

  function splitterKeys(ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    splitDelta(ev.key === 'ArrowLeft' ? -16 : 16);
    afterLayoutChange();
    saveWorkspace();
  }

  function splitterReset() {
    codeUserResized = false;
    codeFit = 0;
    workspace.codeUserResized = false;
    workspace.codeExpanded = false;
    workspace.codeRatioBeforeExpand = null;
    workspace.codeRatio = DEFAULT_CODE_RATIO;
    applyLayout();
    afterLayoutChange();
    saveWorkspace();
  }

  function setupLayoutControls() {
    var binds = [
      [els.btnToggleCode, function () { togglePanel('code'); }],
      [els.btnToggleSide, function () { togglePanel('side'); }],
      [els.btnExpandCode, function () { toggleCodeExpand(); }],
      [els.btnCollapseCode, function () { if (!collapsed.code) togglePanel('code'); }],
      [els.btnCollapseSide, function () { if (!collapsed.side) togglePanel('side'); }],
      [els.railCode, function () { if (collapsed.code) togglePanel('code', { fromRail: true }); }],
      [els.railInspector, function () { if (collapsed.side) togglePanel('side', { fromRail: true }); }],
      [els.btnGrid, function () {
        workspace.grid = !workspace.grid;
        applyGrid();
        saveWorkspace();
      }],
      [els.btnCanvasCenter, function () {
        canvasCenter(canvasView.zoom);
        canvasView.moved = true;
      }]
    ];
    binds.forEach(function (pair) {
      if (pair[0] && typeof pair[0].addEventListener === 'function') {
        pair[0].addEventListener('click', pair[1]);
      }
    });
  }

  function setupSplitters() {
    var el = els.splitLeft;
    if (!el || typeof el.addEventListener !== 'function') return;
    el.addEventListener('pointerdown', splitterDown);
    el.addEventListener('pointermove', splitterMove);
    el.addEventListener('pointerup', splitterUp);
    el.addEventListener('pointercancel', splitterUp);
    el.addEventListener('dblclick', splitterReset);
    el.addEventListener('keydown', splitterKeys);
  }

  /* O menu "Mais" é um disclosure nativo. Só faltam as convenções de um
   * menu: fechar ao clicar fora, ao escolher uma ação e com Esc. */
  function setupTopMenu() {
    var menu = document.getElementById('topMenu');
    if (!menu || typeof menu.addEventListener !== 'function') return;
    var summary = typeof menu.querySelector === 'function' ? menu.querySelector('summary') : null;

    function close(refocus) {
      if (!menu.open) return;
      menu.open = false;
      if (refocus && summary && typeof summary.focus === 'function') summary.focus();
    }

    document.addEventListener('pointerdown', function (ev) {
      if (!menu.open) return;
      var inside = typeof menu.contains === 'function' && menu.contains(ev.target);
      if (!inside) close(false);
    });

    /* Esc fecha só quando o foco está dentro do disclosure. O handler fica
     * no próprio menu para não competir com os atalhos globais do editor. */
    menu.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !menu.open) return;
      if (ev.preventDefault) ev.preventDefault();
      close(true);
    });

    menu.addEventListener('focusout', function (ev) {
      if (!menu.open) return;
      var next = ev.relatedTarget;
      if (next && typeof menu.contains === 'function' && menu.contains(next)) return;
      close(false);
    });

    menu.addEventListener('click', function (ev) {
      var target = ev.target;
      var item = target && typeof target.closest === 'function' ? target.closest('a, button') : null;
      if (item) close(false);
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
    hideVarTip();
    state.debug = false;
    els.code.readOnly = false;
    els.code.classList.remove('readonly');
    els.btnDebug.classList.remove('active');
    els.debugBar.classList.add('hidden');
    updateButtons();
    if (typeof els.code.focus === 'function') {
      /* O textarea pode ter o cursor no fim do buffer (o valor foi definido
       * por script). Focar sem preservar o scroll faria o editor saltar para
       * a última linha/coluna, justamente ao sair do debug. */
      var sx = els.code.scrollLeft;
      var sy = els.code.scrollTop;
      try {
        els.code.focus({ preventScroll: true });
      } catch (e) {
        els.code.focus();
      }
      els.code.scrollLeft = sx;
      els.code.scrollTop = sy;
      syncScroll();
    }
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
    /* trace que terminou em erro não é reproduzível: o banner e o passo final
     * já explicam a falha; Executar é o caminho para tentar de novo */
    if (state.trace && state.trace.error) return;
    if (state.playing) { stopPlay(); return; }
    state.preview = false;
    var n = steps().length;
    if (!n) return;
    if (state.index >= n - 1) goto(0);
    state.playing = true;
    updatePlayButton();
    scheduleNext();
  }

  /* Reflete o estado real da execução no chrome do visualizador. É apenas
   * leitura de estado: não interfere no motor, nos passos nem no playback. */
  function updateVizChrome() {
    if (els.vizRunState) {
      var st = runState();
      if (els.vizRunState.getAttribute('data-state') !== st.mode) {
        els.vizRunState.setAttribute('data-state', st.mode);
      }
      if (els.vizRunStateText) els.vizRunStateText.textContent = st.label;
    }
    updateStateInfo();
  }

  function updatePlayButton() {
    els.btnPlay.textContent = state.playing ? '❚❚' : '▶';
    els.btnPlay.classList.toggle('playing', state.playing);
    var failed = !!(state.trace && state.trace.error);
    var label = failed ? 'A execução falhou — corrija o código e execute de novo'
      : state.playing ? 'Pausar (Espaço)' : 'Reproduzir (Espaço)';
    els.btnPlay.setAttribute('aria-label', failed ? 'Reprodução indisponível: a execução falhou' : (state.playing ? 'Pausar' : 'Reproduzir'));
    els.btnPlay.title = label;
    updateVizChrome();
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
    hideVarTip();
    state.preview = false;
    var st = steps();
    if (!st.length) {
      els.stepLabel.textContent = '0 / 0';
      els.slider.setAttribute('aria-valuetext', 'Passo 0 de 0');
      els.statusLine.textContent = 'linha —';
      els.slider.value = 0;
      updateSliderFill();
      setCurrentLine(null);
      DSV.renderStructure(els.structure, null, null, {
        onMeta: setCanvasMeta,
        traceError: !!(state.trace && state.trace.error)
      });
      canvasAfterRender(null);
      els.callstack.innerHTML = '<div class="muted side-empty">—</div>';
      els.vars.innerHTML = '<div class="muted side-empty">—</div>';
      els.commands.innerHTML = '<div class="muted side-empty">—</div>';
      if (els.events) els.events.innerHTML = '<div class="muted side-empty">—</div>';
      els.consoleEl.innerHTML = '';
      if (els.varsCount) els.varsCount.textContent = '';
      if (els.callsCount) els.callsCount.textContent = '';
      renderStructureInfo(null, null);
      renderStateInfo(null);
      /* sem execução: a faixa orienta o próximo passo em vez de sumir */
      if (els.stepExplainer) {
        els.stepExplainer.classList.remove('hidden');
        var semPassos = !!(state.trace && state.trace.error);
        if (els.stepExplainer.classList) els.stepExplainer.classList.toggle('is-error', semPassos);
        if (semPassos) {
          els.stepOp.textContent = 'Erro';
          els.stepText.textContent = 'Linha ' + state.trace.error.line + ': ' + state.trace.error.message;
        } else {
          els.stepOp.textContent = 'Execução';
          els.stepText.textContent = 'Execute o código para acompanhar cada etapa.';
        }
        els.stepCount.textContent = '';
      }
      updateButtons();
      return;
    }
    state.index = DSV.clamp(i, 0, st.length - 1);
    var step = st[state.index];
    var stale = !!state.stale;

    els.slider.value = state.index;
    updateSliderFill();
    els.stepLabel.textContent = (state.index + 1) + ' / ' + st.length;
    els.slider.setAttribute('aria-valuetext', 'Passo ' + (state.index + 1) + ' de ' + st.length);

    if (stale) {
      els.statusLine.textContent = 'código editado — execute novamente';
    } else {
      var srcLines = els.code.value.split('\n');
      var lineText = srcLines[step.line - 1] ? srcLines[step.line - 1].trim() : '';
      els.statusLine.textContent = 'linha ' + step.line + (lineText ? ': ' + lineText : '');
    }

    var isErrorStep = !stale && state.errorLine === step.line && state.index === st.length - 1 && !!state.trace.error;
    setCurrentLine(stale ? null : step.line, isErrorStep);
    if (!stale) ensureLineVisible(step.line);

    var curSel = renderStructurePanel(step);
    renderCallstack(step);
    renderVars(step);
    renderConsole();
    renderCommands(curSel);
    renderEvents(curSel);
    renderStructureInfo(curSel, step);
    renderStateInfo(step);
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
    els.btnPlay.disabled = state.debug || n === 0 || !!(state.trace && state.trace.error);
    updatePlayButton();
  }

  /* ------------------------------------------------------------------ */
  /* Seleção da estrutura exibida                                        */
  /* ------------------------------------------------------------------ */

  function chooseSelection(step) {
    var res = DSV.chooseStructure(step, {
      opsMap: state.opsMap,
      forced: state.forced,
      sticky: state.sticky
    });
    state.sticky = res.sticky;
    return res.selection;
  }

  function renderStructurePanel(step) {
    var sel = chooseSelection(step);
    var st = steps();
    var srcLines = els.code.value.split('\n');
    DSV.renderStructure(els.structure, sel, step, {
      opsMap: state.opsMap,
      pointers: step.pointers || {},
      events: step.events || [],
      visit: state.visit,
      prevStep: state.index > 0 ? st[state.index - 1] : null,
      nextStep: state.index < st.length - 1 ? st[state.index + 1] : null,
      /* a faixa de explicação e o foco do array leem a linha que executa */
      lineText: srcLines[step.line - 1] ? srcLines[step.line - 1].trim() : '',
      /* trace + passo atual: a seta contextual da árvore é derivada dos
       * ponteiros reais do passo, sem estado paralelo ao histórico */
      steps: st,
      stepIndex: state.index,
      /* candidates já percorreu o trace: se há estrutura em algum passo,
       * o vazio atual é "ainda não criada", não "código não suportado" */
      expectedStructure: state.candidates && state.candidates.length ? state.candidates[0] : null,
      traceError: !!(state.trace && state.trace.error),
      /* o workspace monta o cabeçalho do canvas; o renderizador só informa
       * título, contagem e evento do passo */
      onMeta: setCanvasMeta,
      /* animações mais curtas quando está tocando em velocidade alta */
      animMs: state.playing ? Math.max(90, Math.min(360, Math.round(430 / state.speed))) : 300
    });
    /* A legenda ocupa altura dentro da Prancha: atualiza antes do fit para a
     * câmera enquadrar a área realmente livre do desenho. */
    updateStepExplainer(sel, step);
    canvasAfterRender(sel);
    return sel;
  }

  /* o que o console.log imprimiu neste passo (mesmo texto do painel Saída) */
  function consoleTextAt(index) {
    if (!state.trace || !state.trace.output) return '';
    var parts = [];
    state.trace.output.forEach(function (o) {
      if (o.step === index) parts.push(o.text);
    });
    return parts.join(' · ');
  }

  /* faixa de explicação contextual: operação + o que aconteceu/acontecerá */
  function updateStepExplainer(sel, step) {
    if (!els.stepExplainer) return;
    var st = steps();
    if (!st.length || !step) {
      els.stepExplainer.classList.add('hidden');
      els.stepExplainer.classList.remove('is-error');
      return;
    }
    /* o texto é limitado a duas linhas no CSS; o title preserva o restante */
    function escrever(op, text) {
      els.stepOp.textContent = op;
      els.stepText.textContent = text;
      els.stepText.title = text;
      els.stepCount.textContent = (state.index + 1) + '/' + st.length;
    }
    var errorHere = !state.stale && !!state.trace.error &&
      state.errorLine === step.line && state.index === st.length - 1;
    if (els.stepExplainer.classList) els.stepExplainer.classList.toggle('is-error', errorHere);
    if (state.stale) {
      els.stepExplainer.classList.remove('hidden');
      escrever('Código editado', 'Execute novamente para atualizar a visualização.');
      return;
    }
    /* o passo em que a execução parou não pode dizer "executando" */
    if (errorHere) {
      els.stepExplainer.classList.remove('hidden');
      escrever('Erro', 'Linha ' + state.errorLine + ': ' + state.trace.error.message);
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
    var op = (info && info.op) || 'Execução';
    var text = (info && info.text) || '';
    if (!text) {
      /* Passos de preparação, saída de console e representação interna não
       * têm frase derivada; a faixa mostra o que está acontecendo em vez de
       * ficar vazia. O texto continua vindo da linha real em execução. */
      if (op === 'Saída') {
        var printed = consoleTextAt(state.index);
        text = printed
          ? 'console.log imprimiu: ' + printed
          : 'Saída do console registrada no painel Saída.';
      }
      else if (op === 'Representação') text = 'Atualizando a representação da estrutura.';
      else if (lineText) text = 'Executando: ' + lineText;
      else text = 'Executando a linha ' + step.line + '.';
    }
    els.stepOp.textContent = op;
    els.stepText.textContent = text;
    els.stepText.title = text;
    els.stepCount.textContent = (state.index + 1) + '/' + st.length;
  }

  /* ------------------------------------------------------------------ */
  /* Dock — histórico (comandos, eventos, saída)                         */
  /* ------------------------------------------------------------------ */

  var DOCK_TABS = [
    { name: 'commands', tab: 'tabCommands', page: 'pageCommands' },
    { name: 'events', tab: 'tabEvents', page: 'pageEvents' },
    { name: 'output', tab: 'tabConsole', page: 'pageConsole' }
  ];

  function setDockTab(name, opts) {
    var found = DOCK_TABS.some(function (t) { return t.name === name; });
    if (!found) name = 'commands';
    workspace.dockTab = name;
    DOCK_TABS.forEach(function (t) {
      var active = t.name === name;
      if (els[t.tab] && els[t.tab].classList) {
        els[t.tab].classList.toggle('active', active);
        els[t.tab].setAttribute('aria-selected', active ? 'true' : 'false');
        els[t.tab].setAttribute('tabindex', active ? '0' : '-1');
      }
      if (els[t.page] && els[t.page].classList) els[t.page].classList.toggle('active', active);
    });
    if (name === 'output' && els.consoleEl) {
      els.consoleEl.scrollTop = els.consoleEl.scrollHeight;
    }
    if (!opts || !opts.silent) saveWorkspace();
  }

  function setDockOpen(open, opts) {
    workspace.dockOpen = !!open;
    if (els.dockHistory) {
      els.dockHistory.hidden = !workspace.dockOpen;
      els.dockHistory.classList.toggle('is-open', workspace.dockOpen);
    }
    /* no recorte de projeção (1000–1100) o histórico vira gaveta sobre a
     * faixa do inspetor em vez de espremer código e desenho */
    if (els.dock && els.dock.classList) els.dock.classList.toggle('is-open', workspace.dockOpen);
    if (els.btnDockToggle) {
      els.btnDockToggle.setAttribute('aria-expanded', workspace.dockOpen ? 'true' : 'false');
      els.btnDockToggle.classList.toggle('is-open', workspace.dockOpen);
      els.btnDockToggle.title = workspace.dockOpen ? 'Recolher histórico da execução' : 'Expandir histórico da execução';
    }
    if (open && (!opts || !opts.silent) && typeof window !== 'undefined' && window.innerWidth <= 900) {
      /* no mobile o histórico é uma gaveta e o código outra: empilhar as duas
       * esconde a barra de status da folha e o desenho ao mesmo tempo */
      var fechou = false;
      if (!collapsed.code) { collapsed.code = true; fechou = true; }
      if (!collapsed.side) { collapsed.side = true; fechou = true; }
      if (fechou) {
        workspace.collapsed.code = collapsed.code;
        workspace.collapsed.side = collapsed.side;
        applyLayout();
        focusOutsidePanel(els.codePanel, els.btnToggleCode || els.railCode);
        focusOutsidePanel(els.sidePanel, els.btnToggleSide || els.railInspector);
      }
    }
    if (!opts || !opts.silent) {
      afterLayoutChange();
      saveWorkspace();
    }
  }

  function setupDock() {
    if (els.btnDockToggle && typeof els.btnDockToggle.addEventListener === 'function') {
      els.btnDockToggle.addEventListener('click', function () { setDockOpen(!workspace.dockOpen); });
    }
    if (els.btnDockClose && typeof els.btnDockClose.addEventListener === 'function') {
      els.btnDockClose.addEventListener('click', function () { setDockOpen(false); });
    }
    DOCK_TABS.forEach(function (t, i) {
      var tab = els[t.tab];
      if (!tab || typeof tab.addEventListener !== 'function') return;
      tab.addEventListener('click', function () { setDockTab(t.name); });
      tab.addEventListener('keydown', function (ev) {
        var last = DOCK_TABS.length - 1;
        var next = null;
        if (ev.key === 'ArrowRight') next = i === last ? 0 : i + 1;
        else if (ev.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = last;
        if (next == null) return;
        if (ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
        var target = els[DOCK_TABS[next].tab];
        if (target && typeof target.focus === 'function') target.focus();
        setDockTab(DOCK_TABS[next].name);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Inspetor — uma seção por vez, escolhida por abas                    */
  /* ------------------------------------------------------------------ */

  var INSPECTOR_TABS = [
    { key: 'structure', tab: 'inspTabStructure', pane: 'pageStructure' },
    { key: 'vars', tab: 'inspTabVars', pane: 'pageVars' },
    { key: 'calls', tab: 'inspTabCalls', pane: 'pageCallstack' },
    { key: 'state', tab: 'inspTabState', pane: 'pageState' }
  ];

  function setInspectorTab(name, opts) {
    var found = INSPECTOR_TABS.some(function (def) { return def.key === name; });
    if (!found) name = 'vars';
    workspace.inspectorTab = name;
    INSPECTOR_TABS.forEach(function (def) {
      var tab = els[def.tab];
      var pane = els[def.pane];
      var active = def.key === name;
      if (tab && tab.classList) {
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.setAttribute('tabindex', active ? '0' : '-1');
      }
      if (pane && pane.classList) pane.classList.toggle('is-active', active);
    });
    if (!opts || !opts.silent) saveWorkspace();
  }

  function setupInspectorTabs() {
    INSPECTOR_TABS.forEach(function (def, i) {
      var tab = els[def.tab];
      if (!tab || typeof tab.addEventListener !== 'function') return;
      tab.addEventListener('click', function () { setInspectorTab(def.key); });
      tab.addEventListener('keydown', function (ev) {
        var last = INSPECTOR_TABS.length - 1;
        var next = null;
        if (ev.key === 'ArrowRight') next = i === last ? 0 : i + 1;
        else if (ev.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = last;
        if (next == null) return;
        if (ev.preventDefault) ev.preventDefault();
        if (ev.stopPropagation) ev.stopPropagation();
        var target = els[INSPECTOR_TABS[next].tab];
        if (target && typeof target.focus === 'function') target.focus();
        setInspectorTab(INSPECTOR_TABS[next].key);
      });
    });
    setInspectorTab(workspace.inspectorTab, { silent: true });
  }

  function kvRow(label, value, cls) {
    return '<div class="kv-row">' +
      '<span class="kv-key">' + esc(label) + '</span>' +
      '<span class="kv-val' + (cls ? ' ' + cls : '') + '">' + esc(value == null || value === '' ? '—' : String(value)) + '</span>' +
      '</div>';
  }

  function renderStructureInfo(sel, step) {
    if (!els.structureInfo) return;
    if (!step) {
      els.structureInfo.innerHTML = '<div class="side-empty muted">Execute o código para inspecionar a estrutura.</div>';
      return;
    }
    var meta = state.canvasMeta || {};
    var title = meta.title || (sel && sel.type !== 'none' ? (sel.label || DSV.typeLabel(sel.type)) : 'automático');
    var sub = meta.sub || '';
    var op = els.stepOp ? els.stepOp.textContent : '';
    var html = '';
    html += kvRow('estrutura', title);
    if (sub) html += kvRow('unidades', sub);
    if (sel && sel.label && sel.label !== title) html += kvRow('seleção', sel.label);
    if (op && op !== 'Execução') html += kvRow('operação', op);
    html += kvRow('linha', step.line);
    els.structureInfo.innerHTML = html;
  }

  function runState() {
    if (state.debug) return { mode: 'debug', label: 'depuração' };
    if (state.playing) return { mode: 'running', label: 'executando' };
    if (state.stale) return { mode: 'stale', label: 'editado' };
    /* a execução que parou em erro não é "pausada": o trace terminou mal */
    if (state.trace && state.trace.error) return { mode: 'error', label: 'falhou' };
    /* primeiro contato: o passo já mostra conteúdo, mas nada foi reproduzido */
    if (state.preview) return { mode: 'preview', label: 'prévia' };
    if (state.trace && steps().length) return { mode: 'paused', label: 'pausado' };
    return { mode: 'idle', label: 'pronto' };
  }

  function speedLabel(speed) {
    return (speed === 0.5 ? '0,5' : String(speed)) + '×';
  }

  function renderStateInfo(step) {
    if (!els.stateInfo) return;
    var st = runState();
    var total = steps().length;
    var html = '';
    html += kvRow('execução', st.label);
    html += kvRow('passo', total ? (state.index + 1) + '/' + total : '0/0');
    html += kvRow('velocidade', speedLabel(state.speed));
    html += kvRow('código', state.stale ? 'editado' : (state.trace ? (state.trace.error ? 'erro' : 'executado') : '—'));
    html += '<div class="kv-row"><span class="kv-key">zoom</span>' +
      '<span class="kv-val" id="stateZoom">' + Math.round(canvasView.zoom * 100) + '%</span></div>';
    if (step) html += kvRow('modo', state.debug ? 'depuração' : (state.forced ? 'manual' : 'automático'));
    els.stateInfo.innerHTML = html;
  }

  function updateStateInfo() {
    renderStateInfo(steps()[state.index] || null);
  }

  function renderCallstack(step) {
    var frames = step.stack || [];
    if (els.callsCount) els.callsCount.textContent = frames.length ? String(frames.length) : '';
    if (!frames.length) {
      els.callstack.innerHTML = '<div class="muted side-empty">fora de função (escopo global)</div>';
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

  function varKey(scope, name, path) {
    return [scope, name].concat(path || []).map(function (part) {
      return encodeURIComponent(String(part));
    }).join('/');
  }

  function varIsContainer(sv) {
    return !!sv && (sv.t === 'o' || sv.t === 'a');
  }

  function varHasChildren(sv) {
    if (!varIsContainer(sv)) return false;
    if (sv.t === 'a') {
      return (sv.items || []).some(function (it) { return !it || it.t !== 'trunc'; });
    }
    return Object.keys(sv.props || {}).length > 0;
  }

  function varPreview(sv) {
    if (!sv || typeof sv !== 'object') return String(sv);
    if (sv.t === 'p') return DSV.fmtPrimitive(sv.v);
    if (sv.t === 'fn') return 'ƒ ' + (sv.name || '(anônimo)');
    if (sv.t === 'c') return 'classe';
    if (sv.t === 'ref') return '→ objeto #' + sv.id;
    if (sv.t === 'trunc') return sv.n ? '… (+' + sv.n + ')' : '…';
    if (sv.t === 'a') {
      var total = 0;
      var clipped = false;
      (sv.items || []).forEach(function (it) {
        if (it && it.t === 'trunc') clipped = true;
        else total++;
      });
      if (!total) return '[]';
      return 'Array(' + total + ')' + (clipped ? ' …' : '');
    }
    if (sv.t === 'o') {
      var keys = Object.keys(sv.props || {});
      var ctor = sv.ctor && sv.ctor !== 'Object' ? sv.ctor : 'Object';
      if (!keys.length) return ctor === 'Object' ? '{}' : ctor + ' {}';
      return ctor + ' {' + keys.length + '}';
    }
    return String(sv);
  }

  function varIsMeta(sv) {
    return !!sv && (sv.t === 'fn' || sv.t === 'c' || sv.t === 'ref' || sv.t === 'trunc');
  }

  function varTooltip(sv) {
    var text = DSV.fmtSerialized(sv);
    return text.length > 260 ? text.slice(0, 257) + '…' : text;
  }

  function varChildren(sv) {
    var out = [];
    if (!varIsContainer(sv)) return out;
    if (sv.t === 'a') {
      (sv.items || []).forEach(function (it, i) {
        if (it && it.t === 'trunc') return;
        out.push({ name: '[' + i + ']', key: String(i), sv: it });
      });
      return out;
    }
    Object.keys(sv.props || {}).forEach(function (k) {
      out.push({ name: k, key: k, sv: sv.props[k] });
    });
    return out;
  }

  function varRowHtml(scope, rootName, name, sv, path, depth) {
    var key = varKey(scope, rootName, path);
    var canExpand = varHasChildren(sv) && depth < VAR_DEPTH_LIMIT;
    var open = canExpand && !!varExpanded[key];
    var cls = 'var-line' + (depth ? ' var-child' : '') + (canExpand ? ' var-node' : '') + (open ? ' is-open' : '');
    var title = varTooltip(sv);
    var chev = '<span class="var-chev" aria-hidden="true">' + (canExpand ? VAR_CHEVRON : '') + '</span>';
    var nameEl = '<span class="var-name">' + esc(name) + '</span>';
    var valEl = '<span class="var-val' + (varIsMeta(sv) ? ' is-meta' : '') + '" title="' + esc(title) + '">' + esc(varPreview(sv)) + '</span>';
    var html;
    if (canExpand) {
      varValueMap[key] = { scope: scope, rootName: rootName, sv: sv, path: path, depth: depth };
      /* O botão de expansão cobre só o chevron e o nome: o valor continua
       * sendo texto selecionável, como no painel anterior. */
      html = '<div class="' + cls + '">' +
        '<button type="button" class="var-toggle" data-var-key="' + esc(key) + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
        chev + nameEl + '</button>' + valEl + '</div>' +
        '<div class="var-children"' + (open ? ' data-filled="1"' : ' hidden') + '>' +
        (open ? varChildrenHtml(scope, rootName, sv, path, depth + 1) : '') + '</div>';
    } else {
      html = '<div class="' + cls + '">' + chev + nameEl + valEl + '</div>';
    }
    return html;
  }

  function varChildrenHtml(scope, rootName, sv, path, depth) {
    var all = varChildren(sv);
    var html = '';
    var shown = Math.min(all.length, VAR_CHILD_LIMIT);
    for (var i = 0; i < shown; i++) {
      html += varRowHtml(scope, rootName, all[i].name, all[i].sv, path.concat(all[i].key), depth);
    }
    if (all.length > shown) {
      html += '<div class="var-line var-child var-more">' +
        '<span class="var-chev" aria-hidden="true"></span>' +
        '<span class="var-name">…</span>' +
        '<span class="var-val is-meta">+' + (all.length - shown) + '</span></div>';
    }
    return html;
  }

  function varScopeTitle(label, count) {
    return '<div class="scope-title"><span>' + esc(label) + '</span>' +
      '<span class="scope-count">' + count + '</span></div>';
  }

  function renderVars(step) {
    var html = '';
    var locals = step.locals || {};
    var globals = step.globals || {};
    var localKeys = Object.keys(locals);
    if (step.thisVal) localKeys.unshift('this');
    varValueMap = Object.create(null);

    if (localKeys.length) {
      html += varScopeTitle('função atual', localKeys.length);
      html += '<div class="var-list">';
      localKeys.forEach(function (k) {
        var sv = k === 'this' ? step.thisVal : locals[k];
        html += varRowHtml(k === 'this' ? 'this' : 'locals', k, k, sv, [], 0);
      });
      html += '</div>';
    }

    var globalKeys = Object.keys(globals);
    html += varScopeTitle('global', globalKeys.length);
    if (!globalKeys.length) {
      html += '<div class="muted side-empty">(vazio)</div>';
    } else {
      html += '<div class="var-list">';
      globalKeys.forEach(function (k) {
        html += varRowHtml('globals', k, k, globals[k], [], 0);
      });
      html += '</div>';
    }
    if (els.varsCount) {
      var count = localKeys.length + globalKeys.length;
      els.varsCount.textContent = count ? String(count) : '';
    }
    els.vars.innerHTML = html;
  }

  /* Expande/recolhe uma propriedade sem redesenhar o painel todo: o foco
   * permanece na linha e os valores aninhados são montados na primeira
   * abertura. O estado em varExpanded sobrevive à troca de passo. */
  function toggleVarRow(btn) {
    if (!btn || !btn.parentElement) return;
    var row = btn.parentElement;
    var key = btn.getAttribute('data-var-key');
    var open = btn.getAttribute('aria-expanded') === 'true';
    var children = row.nextElementSibling;
    if (!children || !children.classList || !children.classList.contains('var-children')) return;
    if (open) {
      children.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      row.classList.remove('is-open');
      delete varExpanded[key];
      return;
    }
    if (!children.getAttribute('data-filled')) {
      var entry = varValueMap[key];
      if (!entry) return;
      children.innerHTML = varChildrenHtml(entry.scope, entry.rootName, entry.sv, entry.path, entry.depth + 1);
      children.setAttribute('data-filled', '1');
    }
    children.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    row.classList.add('is-open');
    varExpanded[key] = true;
  }

  els.vars.addEventListener('click', function (ev) {
    var btn = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.var-toggle') : null;
    if (btn && typeof els.vars.contains === 'function' && els.vars.contains(btn)) toggleVarRow(btn);
  });

  els.vars.addEventListener('keydown', function (ev) {
    var btn = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.var-toggle') : null;
    if (!btn) return;
    var open = btn.getAttribute('aria-expanded') === 'true';
    /* setas dentro do painel controlam a expansão e não a reprodução */
    if (ev.key === 'ArrowRight') {
      ev.stopPropagation();
      if (!open) { ev.preventDefault(); toggleVarRow(btn); }
    } else if (ev.key === 'ArrowLeft') {
      ev.stopPropagation();
      if (open) { ev.preventDefault(); toggleVarRow(btn); }
    }
  });

  function renderConsole() {
    if (!state.trace) { els.consoleEl.innerHTML = ''; return; }
    var outs = state.trace.output.filter(function (o) { return o.step <= state.index; });
    if (!outs.length) {
      els.consoleEl.innerHTML = '<div class="muted side-empty">(nada impresso até este passo)</div>';
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

  /* comandos da execução: eventos nativos (push/pop/...) e operações
   * reconhecidas das demais estruturas (inserção/busca/percurso no BST,
   * listas, fila com índices, MeuArray) — filtrados pela estrutura exibida */
  function commandVisible(cmd, sel) {
    if (cmd.kind !== 'event') return true;
    if (!sel || sel.id == null) return false;
    return cmd.targetId == null || cmd.targetId === sel.id;
  }

  function renderCommands(sel) {
    if (!state.trace) { els.commands.innerHTML = ''; return; }
    var html = '';
    var count = 0;
    (state.commands || []).forEach(function (cmd) {
      if (!commandVisible(cmd, sel)) return;
      count++;
      var cls = 'command';
      if (cmd.step === state.index) cls += ' current';
      else if (cmd.step > state.index) cls += ' future';
      html += '<button type="button" class="' + cls + '" data-step="' + cmd.step + '" title="ir para o passo ' + (cmd.step + 1) + '">' +
        '<span class="command-num">' + count + '</span>' +
        '<span class="command-text">' + esc(cmd.text) + '</span>' +
        '</button>';
    });
    if (!count) {
      els.commands.innerHTML = '<div class="muted side-empty">Nenhuma operação de estrutura neste código.</div>';
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

  /* eventos: log pré-computado no run (uma varredura, não uma por passo) */
  function buildEventLog(allSteps) {
    var out = [];
    allSteps.forEach(function (s, idx) {
      (s.events || []).forEach(function (ev) {
        if (!ev || !ev.text) return;
        out.push({ step: idx, targetId: ev.targetId, text: ev.text });
      });
    });
    return out;
  }

  function renderEvents(sel) {
    if (!state.trace) { els.events.innerHTML = ''; return; }
    var rows = [];
    var log = state.events || [];
    for (var i = 0; i < log.length; i++) {
      var ev = log[i];
      if (ev.step > state.index) continue;
      if (sel && sel.id != null && ev.targetId != null && ev.targetId !== sel.id) continue;
      rows.push(ev);
    }
    if (!rows.length) {
      els.events.innerHTML = '<div class="muted side-empty">Nenhum evento nesta execução.</div>';
      return;
    }
    var start = Math.max(0, rows.length - 120);
    var html = '';
    for (var j = start; j < rows.length; j++) {
      var item = rows[j];
      var cls = 'command event' + (item.step === state.index ? ' current' : '');
      html += '<button type="button" class="' + cls + '" data-step="' + item.step + '" title="ir para o passo ' + (item.step + 1) + '">' +
        '<span class="command-num">#' + (item.step + 1) + '</span>' +
        '<span class="command-text">' + esc(item.text) + '</span>' +
        '</button>';
    }
    els.events.innerHTML = html;
    if (typeof els.events.querySelector === 'function') {
      var cur = els.events.querySelector('.command.current');
      if (cur && typeof cur.scrollIntoView === 'function') {
        try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignora */ }
      }
    }
  }

  if (els.events) {
    els.events.addEventListener('click', function (ev) {
      var btn = ev.target && typeof ev.target.closest === 'function' ? ev.target.closest('.command') : null;
      if (!btn) return;
      stopPlay();
      goto(parseInt(btn.getAttribute('data-step'), 10));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Eventos de UI                                                       */
  /* ------------------------------------------------------------------ */

  els.btnRun.addEventListener('click', function () { exitDebug(); runAndPlay(); });
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
    updateStateInfo();
  });

  els.structureSelect.addEventListener('change', function () {
    if (this.value === 'auto') {
      state.forced = null;
    } else {
      var cand = null;
      for (var i = 0; i < state.candidates.length; i++) {
        if (DSV.candidateKey(state.candidates[i]) === this.value) {
          cand = state.candidates[i];
          break;
        }
      }
      state.forced = cand;
    }
    if (steps().length) {
      var s = renderStructurePanel(steps()[state.index]);
      renderEvents(s);
      renderStructureInfo(s, steps()[state.index]);
      updateStateInfo();
    }
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

  /* clicar na aba com a roda do mouse (botão do meio) fecha, como no VS Code */
  els.tabs.addEventListener('mousedown', function (ev) {
    if (ev.button !== 1) return;
    if (typeof ev.preventDefault === 'function') ev.preventDefault(); /* sem rolagem automática */
  });

  els.tabs.addEventListener('auxclick', function (ev) {
    if (ev.button !== 1) return;
    var t = ev.target;
    var tab = t && typeof t.closest === 'function' ? t.closest('.tab') : null;
    if (!tab || typeof tab.getAttribute !== 'function') return;
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    closeTab(tab.getAttribute('data-tab'));
  });

  /* teclado nas abas: as setas movem o foco; Enter/Espaço ativam a aba
   * focada (clique nativo do botão) */
  els.tabs.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    var t = ev.target;
    if (!t || typeof t.closest !== 'function') return;
    var tab = t.closest('.tab');
    if (!tab || typeof tab.getAttribute !== 'function') return;
    if (typeof ev.preventDefault === 'function') ev.preventDefault();
    if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    var id = tab.getAttribute('data-tab');
    var i = state.tabs.indexOf(id);
    if (i < 0) return;
    var j = ev.key === 'ArrowLeft' ? (i - 1 + state.tabs.length) % state.tabs.length : (i + 1) % state.tabs.length;
    if (typeof els.tabs.querySelector === 'function') {
      var nt = els.tabs.querySelector('.tab[data-tab="' + state.tabs[j] + '"] .tab-name');
      if (nt && typeof nt.focus === 'function') nt.focus();
    }
  });

  /* canvas: controles, roda do mouse e arrasto */
  els.btnZoomIn.addEventListener('click', function () { canvasZoomCenter(1.25); });
  els.btnZoomOut.addEventListener('click', function () { canvasZoomCenter(0.8); });
  els.btnZoomReset.addEventListener('click', function () { canvasCenter(1); canvasView.moved = false; updateStateInfo(); });
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
      canvasFitKey = null;
      codeCharW = 0; /* remede a largura do caractere (zoom/fonte podem mudar) */
      /* reaplica a grade ao cruzar os breakpoints responsivos e reajusta a
       * coluna do editor ao código (a fonte muda em 1366, a largura muda) */
      fitCodeColumn();
      applyLayout();
      syncScroll();
      if (!canvasSupported()) return;
      var narrow = typeof window.innerWidth === 'number' ? window.innerWidth <= 1100 : false;
      var crossed = narrow !== canvasNarrow;
      canvasNarrow = narrow;
      /* a grade mudou (painéis empilhados) ou o desenho saiu da área visível:
       * reenquadra mesmo depois de pan/zoom do usuário */
      if (crossed || canvasStructureOutOfView()) {
        canvasView.moved = false;
        canvasFitNow(true);
        return;
      }
      if (canvasView.moved) return;
      canvasFitNow(true);
    });
  }

  var helpReturnFocus = null;

  if (els.btnSideHintClose) {
    els.btnSideHintClose.addEventListener('click', dismissSideHint);
  }

  els.btnHelp.addEventListener('click', function () {
    helpReturnFocus = document.activeElement;
    if (els.helpDialog.showModal) els.helpDialog.showModal();
  });

  if (els.btnHelpClose) {
    els.btnHelpClose.addEventListener('click', function () {
      if (els.helpDialog && els.helpDialog.close) els.helpDialog.close();
    });
  }

  /* clique no véu (fora do diálogo) fecha, como um modal comum */
  if (els.helpDialog) {
    els.helpDialog.addEventListener('click', function (ev) {
      if (ev.target === els.helpDialog && els.helpDialog.close) els.helpDialog.close();
    });

    /* O gatilho vive dentro do menu "Mais"; se ele já fechou, devolver o foco
     * a um elemento invisível não ajuda. Nesse caso o foco volta ao resumo do
     * menu, que é o controle visível de onde a ajuda foi aberta. */
    els.helpDialog.addEventListener('close', function () {
      var target = helpReturnFocus;
      helpReturnFocus = null;
      var menu = document.getElementById('topMenu');
      if (target && menu && !menu.open && menu.contains(target)) target = null;
      if (target && window.getComputedStyle) {
        var cs = window.getComputedStyle(target);
        if (cs.display === 'none' || cs.visibility === 'hidden') target = null;
      }
      if (!target) target = document.getElementById('btnTopMenu');
      /* o navegador também devolve o foco ao fechar o dialog; espere essa
       * restauração terminar para o controle visível vencer */
      setTimeout(function () {
        if (target && typeof target.focus === 'function') target.focus();
      }, 0);
    });
  }

  document.addEventListener('keydown', function (ev) {
    /* O diálogo modal é dono do teclado: Esc fecha a ajuda, não a gaveta
     * atrás dela, e os atalhos do app não disparam por baixo do véu. */
    if (els.helpDialog && els.helpDialog.open) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
      ev.preventDefault();
      exitDebug();
      runAndPlay();
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
      /* um controle focado continua sendo um controle: Espaço/Enter nele
       * não deve também avançar a execução */
      var dtag = ev.target && ev.target.tagName;
      if ((dtag === 'BUTTON' || dtag === 'A') && (ev.key === ' ' || ev.key === 'Enter')) return;
      ev.preventDefault();
      if (ev.key === 'Escape') { exitDebug(); return; }
      if (ev.key === 'ArrowLeft') { goto(state.index - 1); return; }
      if (ev.key === 'Home') { goto(0); return; }
      if (ev.key === 'End') { goto(steps().length - 1); return; }
      /* qualquer outra tecla executa a próxima linha */
      goto(state.index + 1);
      return;
    }

    /* Esc fecha o inspetor como uma gaveta; dentro do editor ele continua
     * servindo para sair do campo, então o alvo de texto tem prioridade. */
    if (ev.key === 'Escape' && !collapsed.side) {
      var etag = ev.target && ev.target.tagName;
      if (etag !== 'TEXTAREA' && etag !== 'INPUT' && etag !== 'SELECT') {
        ev.preventDefault();
        togglePanel('side');
        return;
      }
    }

    var tag = ev.target && ev.target.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
    /* Espaço em um botão/link pertence ao controle focado (não ao play) */
    if ((tag === 'BUTTON' || tag === 'A') && ev.key === ' ') return;

    if (ev.key === 'ArrowRight') { ev.preventDefault(); stopPlay(); goto(state.index + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stopPlay(); goto(state.index - 1); }
    else if (ev.key === ' ') { ev.preventDefault(); play(); }
    else if (ev.key === 'Home') { ev.preventDefault(); stopPlay(); goto(0); }
    else if (ev.key === 'End') { ev.preventDefault(); stopPlay(); goto(steps().length - 1); }
  });

  /* ------------------------------------------------------------------ */
  /* Inicialização                                                       */
  /* ------------------------------------------------------------------ */

  /* exemplos na ordem da disciplina (array → pilhas → filas → listas →
   * árvores); ids fora da ordem (versões futuras) entram no fim, na ordem
   * do próprio arquivo */
  function orderedExamples() {
    var order = DSV.EXAMPLE_MENU_ORDER || [];
    var rank = {};
    order.forEach(function (id, i) { rank[id] = i; });
    return DSV.EXAMPLES.slice().sort(function (a, b) {
      var ra = rank[a.id] == null ? order.length : rank[a.id];
      var rb = rank[b.id] == null ? order.length : rank[b.id];
      return ra - rb;
    });
  }

  function init() {
    var options = '<button><selectedcontent></selectedcontent></button>';
    orderedExamples().forEach(function (ex) {
      options += '<option value="' + esc(ex.id) + '">' + esc(ex.name) + '</option>';
    });
    els.exampleSelect.innerHTML = options;

    var savedEx = null;
    var savedCode = null;
    var savedBuffers = null;
    try {
      savedEx = localStorage.getItem(STORAGE_EX);
      savedCode = localStorage.getItem(STORAGE_CODE);
      savedBuffers = localStorage.getItem(STORAGE_BUFFERS);
    } catch (e) { /* ignora */ }
    var freshVisit = !savedEx && !savedCode && !savedBuffers;
    if (savedBuffers) {
      try { state.buffers = JSON.parse(savedBuffers) || {}; } catch (e) { state.buffers = {}; }
    }

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
    /* migração: o código único salvo pelas versões anteriores vira o buffer da aba ativa */
    if (savedCode && savedCode.trim() && state.buffers[example.id] == null) {
      state.buffers[example.id] = savedCode;
    }
    renderTabs();
    updateGuiaLink();
    els.code.value = state.buffers[example.id] != null ? state.buffers[example.id] : example.code;

    loadWorkspace();
    collapsed.code = workspace.collapsed.code !== false;
    collapsed.side = workspace.collapsed.side !== false;
    workspace.collapsed.code = collapsed.code;
    workspace.collapsed.side = collapsed.side;
    codeUserResized = workspace.codeUserResized === true;

    setupSplitters();
    setupLayoutControls();
    setupTopMenu();
    setupDock();
    setupInspectorTabs();
    applyGrid();
    setDockOpen(workspace.dockOpen, { silent: true });
    setDockTab(workspace.dockTab, { silent: true });
    applyLayout();
    /* Depois da primeira aplicação, as folhas passam a ficar no fluxo mesmo
     * recolhidas: é o que permite desenhá-las entrando e saindo. */
    if (els.layout && els.layout.classList) els.layout.classList.add('is-motion-ready');
    if (!collapsed.side) showSideHint();
    afterLayoutChange();
    onEdit();
    fitCodeColumn();
    run();
    var deepLinkStep = applyDeepLink();
    if (freshVisit && !deepLinkStep) previewFirstStructure();
    setupReguaHeight();
    setupVizResize();
    setupCodeOverflow();
    syncScroll();

    /* Geist chega depois do primeiro cálculo em alguns cenários. Remede a
     * largura do caractere e reajusta a folha quando as fontes estiverem
     * prontas; o hover e o `codeFit` dependem dessa métrica. */
    if (typeof document !== 'undefined' && document.fonts &&
        document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready.then(function () {
        codeCharW = 0;
        codeMeasure = null;
        fitCodeColumn();
        applyLayout();
        syncScroll();
      });
    }
  }

  init();
})();
