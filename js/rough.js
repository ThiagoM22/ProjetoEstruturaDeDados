/* ED Viz — traço "à mão" estilo Excalidraw (determinístico).
 * Gera caminhos SVG com pequenas imperfeições, como se fossem desenhados
 * numa lousa: cada forma recebe duas passadas levemente tremidas.
 */
(function (global) {
  'use strict';

  var DSV = (global.DSV = global.DSV || {});

  /* PRNG determinístico (mulberry32) — mesma seed, mesmo desenho */
  function seeded(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fmt(v) { return Math.round(v * 100) / 100; }
  function p(x, y) { return fmt(x) + ' ' + fmt(y); }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

  /* caminho suave (quadráticas pelos pontos médios) */
  function smoothPath(points, closed) {
    var n = points.length;
    if (n < 2) return '';
    var d = '';
    var i;
    if (closed) {
      var m0 = mid(points[n - 1], points[0]);
      d += 'M' + p(m0[0], m0[1]);
      for (i = 0; i < n; i++) {
        var cur = points[i];
        var nxt = points[(i + 1) % n];
        var mm = mid(cur, nxt);
        d += 'Q' + p(cur[0], cur[1]) + ' ' + p(mm[0], mm[1]);
      }
      d += 'Z';
    } else {
      d += 'M' + p(points[0][0], points[0][1]);
      for (i = 1; i < n - 1; i++) {
        var m = mid(points[i], points[i + 1]);
        d += 'Q' + p(points[i][0], points[i][1]) + ' ' + p(m[0], m[1]);
      }
      var lastPt = points[n - 1];
      d += 'L' + p(lastPt[0], lastPt[1]);
    }
    return d;
  }

  /* elipse desenhada à mão, centrada em (0,0): duas passadas sobrepostas */
  function ellipse(rx, ry, seed, jitter) {
    jitter = jitter == null ? 1.6 : jitter;
    var rnd = seeded(seed);
    var out = '';
    for (var l = 0; l < 2; l++) {
      var pts = [];
      var steps = 9;
      var jr = jitter * (l === 0 ? 1 : 0.75);
      var scale = l === 0 ? 1 : 1.04;
      for (var i = 0; i < steps; i++) {
        var ang = (i / steps) * Math.PI * 2 + (l * 0.4);
        var rj = (rnd() - 0.5) * 2 * jr;
        pts.push([
          Math.cos(ang) * (rx * scale + rj),
          Math.sin(ang) * (ry * scale + rj)
        ]);
      }
      var seg = smoothPath(pts, true);
      out += (out ? ' ' : '') + seg;
    }
    return out;
  }

  /* linha à mão entre dois pontos: duas passadas com tremor perpendicular */
  function line(x1, y1, x2, y2, seed, jitter) {
    jitter = jitter == null ? 1.4 : jitter;
    var rnd = seeded(seed);
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len;
    var ny = dx / len;
    var out = '';
    for (var l = 0; l < 2; l++) {
      var pts = [];
      var segs = 3;
      for (var i = 0; i <= segs; i++) {
        var t = i / segs;
        var off = (rnd() - 0.5) * 2 * jitter * (l ? 0.7 : 1);
        if (i === 0 || i === segs) off *= 0.35; /* pontas mais firmes */
        pts.push([x1 + dx * t + nx * off, y1 + dy * t + ny * off]);
      }
      var seg = smoothPath(pts, false);
      out += (out ? ' ' : '') + seg;
    }
    return out;
  }

  DSV.rough = {
    seeded: seeded,
    ellipse: ellipse,
    line: line,
    /* seed estável a partir de um id */
    seedOf: function (id, salt) {
      return (((id || 0) * 2654435761) ^ ((salt || 0) * 40503)) >>> 0;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
