/* Miniatura animada da home.
 *
 * Os quadros são derivados do exemplo `pilha-array` (passos 3–9): push 10,
 * push 20, push 30, pop 30 e pop 20. O loop devolve 20 e 30 ao topo para
 * recomeçar sem um quadro vazio; nenhuma operação é inventada.
 * O movimento é só CSS; este arquivo decide o quadro, pausa e retoma.
 */
(function () {
  'use strict';

  var root = document.getElementById('miniDemo');
  if (!root) return;

  var frames = [
    { stack: [10, 20, 30], line: 4, op: 'push', text: 'Topo = 30: o 30 foi o último a entrar.' },
    { stack: [10, 20], line: 5, op: 'pop', text: 'pop(): o 30 sai — o último que entrou é o primeiro que sai.' },
    { stack: [10], line: 6, op: 'pop', text: 'pop(): agora o topo é 10; restou um elemento.' },
    { stack: [10, 20], line: 3, op: 'push', text: 'push(20): o 20 volta ao topo.' },
    { stack: [10, 20, 30], line: 4, op: 'push', text: 'push(30): a pilha volta a ter três elementos.' }
  ];

  var lines = Array.prototype.slice.call(root.querySelectorAll('.mini-line'));
  var cells = Array.prototype.slice.call(root.querySelectorAll('.mini-cell'));
  var op = document.getElementById('miniOp');
  var text = document.getElementById('miniText');
  var toggle = document.getElementById('miniToggle');
  var body = root.querySelector('.mini-body');
  var media = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  var index = 0;
  var timer = null;
  var manualPaused = false;
  var hoverPaused = false;
  var offscreen = false;

  function reduced() {
    return !!(media && media.matches);
  }

  function render() {
    var frame = frames[index];
    var top = Math.max.apply(null, frame.stack);

    lines.forEach(function (line) {
      line.classList.toggle('is-current', Number(line.getAttribute('data-line')) === frame.line);
    });

    cells.forEach(function (cell) {
      var value = Number(cell.getAttribute('data-value'));
      var on = frame.stack.indexOf(value) >= 0;
      cell.classList.toggle('is-on', on);
      cell.classList.toggle('is-top', on && value === top);
    });

    op.textContent = frame.op;
    text.textContent = frame.text;
  }

  function canRun() {
    return !manualPaused && !hoverPaused && !offscreen && !document.hidden && !reduced();
  }

  function stop() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule() {
    stop();
    if (!canRun()) return;
    timer = setTimeout(function () {
      index = (index + 1) % frames.length;
      render();
      schedule();
    }, 1600);
  }

  function syncButton() {
    if (!toggle) return;
    toggle.hidden = reduced();
    toggle.textContent = manualPaused ? 'Retomar' : 'Pausar';
    toggle.setAttribute('aria-label', manualPaused ? 'Retomar animação' : 'Pausar animação');
  }

  function refresh() {
    syncButton();
    schedule();
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      manualPaused = !manualPaused;
      refresh();
    });
  }

  /* Pausa ao passar o mouse sobre o código/desenho; o cabeçalho e o botão
   * ficam de fora para não conflitar com o controle manual. */
  if (body) {
    body.addEventListener('pointerenter', function () {
      hoverPaused = true;
      schedule();
    });
    body.addEventListener('pointerleave', function () {
      hoverPaused = false;
      schedule();
    });
  }

  document.addEventListener('visibilitychange', schedule);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      offscreen = !entries[0].isIntersecting;
      schedule();
    }, { threshold: 0.15 }).observe(root);
  }

  if (media) {
    if (media.addEventListener) media.addEventListener('change', refresh);
    else if (media.addListener) media.addListener(refresh);
  }

  render();
  refresh();
})();
