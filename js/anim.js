/* ED Viz — animações: FLIP para estruturas HTML e utilidades de tween. */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});

  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function easeOutCubic(t) { t = clamp01(t); return 1 - Math.pow(1 - t, 3); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function now() {
    if (global.performance && typeof global.performance.now === 'function') return global.performance.now();
    return Date.now();
  }

  DSV.anim = {
    clamp01: clamp01,
    ease: easeOutCubic,
    lerp: lerp,
    now: now,
    defaultDur: 280
  };

  DSV.supportsFlip = function (container) {
    return !!(container && typeof container.querySelectorAll === 'function' &&
      typeof global.document !== 'undefined' && global.document.body &&
      typeof global.Element !== 'undefined' && global.Element.prototype.animate);
  };

  function enterStart(dir) {
    switch (dir) {
      case 'up': return { dx: 0, dy: -16, sc: 0.9 };
      case 'down': return { dx: 0, dy: 16, sc: 0.9 };
      case 'left': return { dx: -18, dy: 0, sc: 0.92 };
      case 'right': return { dx: 18, dy: 0, sc: 0.92 };
      default: return { dx: 0, dy: 0, sc: 0.8 };
    }
  }

  function exitEnd(dir) {
    switch (dir) {
      case 'up': return { dx: 0, dy: -18, sc: 0.9 };
      case 'down': return { dx: 0, dy: 18, sc: 0.9 };
      case 'left': return { dx: -22, dy: 0, sc: 0.9 };
      case 'right': return { dx: 22, dy: 0, sc: 0.9 };
      default: return { dx: 0, dy: 0, sc: 0.7 };
    }
  }

  /**
   * Renderiza com animação FLIP:
   *  - elementos com data-k que continuam: deslizam da posição antiga para a nova;
   *  - elementos novos: entram com fade + deslocamento (data-enter);
   *  - elementos removidos: um clone sai com fade (data-exit).
   * Se o ambiente não suportar (ex.: testes em Node), apenas reconstrói.
   */
  DSV.flipRender = function (container, build, dur) {
    dur = dur || DSV.anim.defaultDur;

    if (!DSV.supportsFlip(container)) {
      build();
      return;
    }

    var oldEls = container.querySelectorAll('[data-k]');
    var old = Object.create(null);
    var i;
    for (i = 0; i < oldEls.length; i++) {
      var el = oldEls[i];
      old[el.getAttribute('data-k')] = { el: el, rect: el.getBoundingClientRect() };
    }

    build();

    var newEls = container.querySelectorAll('[data-k]');
    var seen = Object.create(null);
    for (i = 0; i < newEls.length; i++) {
      var nel = newEls[i];
      var key = nel.getAttribute('data-k');
      seen[key] = true;
      var prev = old[key];
      if (prev) {
        var rect = nel.getBoundingClientRect();
        var dx = prev.rect.left - rect.left;
        var dy = prev.rect.top - rect.top;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          nel.animate(
            [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
            { duration: dur, easing: 'cubic-bezier(.22,.61,.36,1)' }
          );
        }
      } else {
        var es = enterStart(nel.getAttribute('data-enter'));
        nel.animate(
          [{
            opacity: 0,
            transform: 'translate(' + es.dx + 'px,' + es.dy + 'px) scale(' + es.sc + ')'
          }, {
            opacity: 1,
            transform: 'translate(0,0) scale(1)'
          }],
          { duration: dur, easing: 'cubic-bezier(.22,.61,.36,1)' }
        );
      }
    }

    Object.keys(old).forEach(function (key) {
      if (seen[key]) return;
      var item = old[key];
      var el2 = item.el;
      if (!el2.isConnected) return;

      var ee = exitEnd(el2.getAttribute('data-exit'));
      var clone = el2.cloneNode(true);
      clone.style.position = 'fixed';
      clone.style.left = item.rect.left + 'px';
      clone.style.top = item.rect.top + 'px';
      clone.style.width = item.rect.width + 'px';
      clone.style.height = item.rect.height + 'px';
      clone.style.margin = '0';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '60';
      global.document.body.appendChild(clone);

      var anim = clone.animate(
        [{
          opacity: 1,
          transform: 'translate(0,0) scale(1)'
        }, {
          opacity: 0,
          transform: 'translate(' + ee.dx + 'px,' + ee.dy + 'px) scale(' + ee.sc + ')'
        }],
        { duration: dur, easing: 'ease-in' }
      );

      var done = function () {
        if (clone.parentNode) clone.parentNode.removeChild(clone);
      };
      if (anim && anim.finished && typeof anim.finished.then === 'function') {
        anim.finished.then(done).catch(done);
      }
      global.setTimeout(done, dur + 160);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
