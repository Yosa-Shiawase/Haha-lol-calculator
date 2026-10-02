/* background.js — "solving paper": graph paper, an ink curve inked by scrolling,
   a pencil sketch ahead of it, drifting margin glyphs. */

(function () {
  'use strict';

  var CELL = 48;
  var LINE_W = 1;
  var INK_A = 0.05;
  var INK_A_5 = 0.08;
  var CURVE_A = 0.12;
  var CURVE_W = 2;
  var PENCIL_A = 0.22;
  var GLYPH_A = 0.06;
  var PAD = 24;
  var SAMPLE = 2;            /* px of page per curve sample */
  var MAX_DPR = 2;

  var GLYPHS = [
    { g: 'π', size: 260, side: -1, factor: 0.92, spin: 0.010 },
    { g: '∑', size: 190, side: 1, factor: 0.86, spin: -0.008 },
    { g: '√', size: 230, side: -1, factor: 0.95, spin: 0.006 },
    { g: '∫', size: 170, side: 1, factor: 0.80, spin: -0.011 },
    { g: 'δ', size: 210, side: -1, factor: 0.88, spin: 0.009 },
    { g: '≠', size: 180, side: 1, factor: 0.83, spin: -0.007 }
  ];

  var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas = null;
  var ctx = null;

  var W = 0, H = 0, pageH = 0, dpr = 1;
  var inkX = null, inkY = null, penX = null, penY = null, n = 0;
  var color = { paper: '#F3ECDF', ink: '25,20,17', fox: '#E0511A', pine: '#1F3B2C' };
  var glyphs = [];

  var dirty = true;
  var raf = 0;
  var lastY = 0;
  var vel = 0;
  var staticMode = false;

  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    var paper = cs.getPropertyValue('--paper').trim() || '#F3ECDF';
    var fox = cs.getPropertyValue('--fox').trim() || '#E0511A';
    var pine = cs.getPropertyValue('--pine').trim() || '#1F3B2C';
    color.paper = paper;
    color.fox = fox;
    color.pine = pine;
    color.ink = hexToRgb(cs.getPropertyValue('--ink').trim() || '#191411');
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255);
  }

  function inkCurve(W2, count) {
    var xs = new Float32Array(count);
    var ys = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var t = i / (count - 1);
      xs[i] = W2 / 2 + Math.sin(t * Math.PI * 4.4) * W2 * 0.30 + Math.sin(t * Math.PI * 11 + 1.5) * W2 * 0.05;
      ys[i] = t * pageH;
    }
    return { x: xs, y: ys };
  }

  function pencilCurve(W2, count) {
    var xs = new Float32Array(count);
    var ys = new Float32Array(count);
    for (var i = 0; i < count; i++) {
      var t = i / (count - 1);
      xs[i] = W2 / 2 + Math.sin(t * Math.PI * 3.1 + 0.9) * W2 * 0.36 + Math.sin(t * Math.PI * 8.7) * W2 * 0.06;
      ys[i] = t * pageH;
    }
    return { x: xs, y: ys };
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    pageH = Math.max(document.documentElement.scrollHeight, H);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    n = Math.max(2, Math.ceil(pageH / SAMPLE) + 1);
    var ink = inkCurve(W, n);
    var pen = pencilCurve(W, n);
    inkX = ink.x; inkY = ink.y;
    penX = pen.x; penY = pen.y;

    var span = Math.max(pageH - H, 1);
    glyphs = GLYPHS.map(function (g) {
      var at = (GLYPHS.indexOf(g) + 0.5) / GLYPHS.length * span;
      return {
        g: g.g,
        size: g.size,
        spin: g.spin,
        factor: g.factor,
        x: g.side < 0 ? W * 0.075 : W * 0.925,
        align: g.side < 0 ? 'left' : 'right',
        /* the parallax rule: screenY = pageY - scrollY * factor */
        pageY: staticMode ? H * (GLYPHS.indexOf(g) + 0.5) / GLYPHS.length
                          : H / 2 + at * g.factor
      };
    });
    dirty = true;
  }

  function drawGrid(scrollY) {
    var i, x, y, idx;

    ctx.fillStyle = color.paper;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = LINE_W;

    /* vertical lines never move; anchor them so one crosses the centre */
    var vAnchor = W / 2 - Math.round(W / 2 / CELL) * CELL;

    ctx.strokeStyle = 'rgba(' + color.ink + ',' + INK_A + ')';
    ctx.beginPath();
    for (i = 0; vAnchor + i * CELL < W + CELL; i++) {
      if (((i % 5) + 5) % 5 === 0) continue;
      x = Math.round(vAnchor + i * CELL) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    /* horizontal lines scroll with the page */
    var off = scrollY % CELL;
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + INK_A + ')';
    ctx.beginPath();
    for (y = -off, idx = Math.floor(scrollY / CELL); y <= H; y += CELL, idx++) {
      if (((idx % 5) + 5) % 5 === 0) continue;
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(' + color.ink + ',' + INK_A_5 + ')';
    ctx.beginPath();
    for (y = -off, idx = Math.floor(scrollY / CELL); y <= H; y += CELL, idx++) {
      if (((idx % 5) + 5) % 5 !== 0) continue;
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  function slice(scrollY, p) {
    var i0 = Math.floor((scrollY - PAD) / pageH * (n - 1));
    var i1 = Math.ceil((scrollY + H + PAD) / pageH * (n - 1));
    if (i0 < 0) i0 = 0;
    if (i1 > n - 1) i1 = n - 1;
    var tip = Math.round(p * (n - 1));
    if (i1 > tip) i1 = tip;
    if (tip < 0) tip = 0;
    return { i0: i0, i1: i1, tip: tip };
  }

  function drawCurve(xs, ys, scrollY, p, alpha, dashed, rgb) {
    var s = slice(scrollY, p);
    if (s.i1 - s.i0 < 1) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgb;
    ctx.lineWidth = CURVE_W;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dashed) ctx.setLineDash([6, 9]);
    ctx.beginPath();
    ctx.moveTo(xs[s.i0], ys[s.i0] - scrollY);
    for (var i = s.i0 + 1; i <= s.i1; i++) ctx.lineTo(xs[i], ys[i] - scrollY);
    ctx.stroke();
    ctx.restore();
  }

  function drawTip(scrollY, tip, trail) {
    if (tip < 1 || tip >= n - 1) return;
    var x = inkX[tip];
    var y = inkY[tip] - scrollY;
    var from = Math.max(0, tip - trail);

    ctx.save();
    ctx.lineCap = 'round';
    var steps = trail;
    for (var i = from; i < tip; i++) {
      var f = (i - from) / (steps || 1);
      ctx.strokeStyle = color.fox;
      ctx.globalAlpha = 0.5 * f * f;
      ctx.lineWidth = 1 + 2.6 * f;
      ctx.beginPath();
      ctx.moveTo(inkX[i], inkY[i] - scrollY);
      ctx.lineTo(inkX[i + 1], inkY[i + 1] - scrollY);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = color.fox;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGlyphs(scrollY) {
    ctx.save();
    ctx.textBaseline = 'middle';
    for (var i = 0; i < glyphs.length; i++) {
      var g = glyphs[i];
      var y = g.pageY - scrollY * g.factor;
      if (y < -g.size || y > H + g.size) continue;
      var f = y / H;
      var fade = Math.min(1, Math.max(0, f / 0.16)) * Math.min(1, Math.max(0, (1 - f) / 0.16));
      if (fade <= 0.01) continue;
      ctx.save();
      ctx.translate(g.x, y);
      ctx.rotate(scrollY * g.spin * Math.PI / 180);
      ctx.font = '700 ' + g.size + 'px "Fraunces", Georgia, serif';
      ctx.textAlign = g.align;
      ctx.fillStyle = 'rgba(' + color.ink + ',' + (GLYPH_A * fade).toFixed(4) + ')';
      ctx.fillText(g.g, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function paint(scrollY) {
    drawGrid(scrollY);

    var p = staticMode ? 1 : Math.min(1, (scrollY + 0.85 * H) / pageH);

    var rgbInk = 'rgb(' + color.ink + ')';
    var rgbPine = 'rgb(' + color.pine + ')';

    drawCurve(penX, penY, scrollY, Math.min(1, p * 1.18), PENCIL_A, true, rgbPine);
    drawCurve(inkX, inkY, scrollY, p, CURVE_A, false, rgbInk);

    if (!staticMode) {
      var s = slice(scrollY, p);
      var trail = Math.min(160, 14 + vel * 0.9) / SAMPLE;
      drawTip(scrollY, s.tip, trail);
    }

    drawGlyphs(scrollY);
  }

  function frame() {
    raf = 0;
    if (!dirty) return;
    dirty = false;

    if (!staticMode) {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      vel = vel * 0.7 + Math.abs(y - lastY) * 0.3;
      lastY = y;
      paint(y);
    } else {
      paint(0);
    }
  }

  function invalidate() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function onScroll() {
    if (staticMode) return;
    invalidate();
  }

  function onResize() {
    layout();
    invalidate();
  }

  function setMode(reduced) {
    if (staticMode === reduced) return;
    staticMode = reduced;
    layout();
  }

  function init() {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'paper-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      ctx = canvas.getContext('2d');
    }
    if (!canvas.isConnected && document.body) document.body.appendChild(canvas);

    readTokens();
    layout();
    invalidate();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    /* the page grows when fonts land or a section reveals */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { invalidate(); });
      ro.observe(document.documentElement);
    }
    if (rm.addEventListener) {
      rm.addEventListener('change', function (e) { setMode(e.matches); });
    } else if (rm.addListener) {
      rm.addListener(function (e) { setMode(e.matches); });
    }
    setMode(rm.matches);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (document.fonts.load) {
          return Promise.all([
            document.fonts.load('700 200px "Fraunces"'),
            document.fonts.load('700 200px "Fraunces"', 'π∑√∫δ≠')
          ]);
        }
        return null;
      }).then(invalidate, invalidate);
    }
  }

  window.Paper = { invalidate: invalidate, repaint: onResize };

  /* page chrome — scroll reveals and the hero strike-through; one shared listener */

  function chrome() {
    var items = document.querySelectorAll('[data-reveal]');
    var i;
    if (!('IntersectionObserver' in window) || rm.matches) {
      for (i = 0; i < items.length; i++) items[i].classList.add('is-in');
    } else {
      var io = new IntersectionObserver(function (entries) {
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].isIntersecting) {
            entries[j].target.classList.add('is-in');
            io.unobserve(entries[j].target);
          }
        }
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
      for (i = 0; i < items.length; i++) io.observe(items[i]);
    }

    var strike = document.querySelector('.strike');
    if (strike && !rm.matches) {
      setTimeout(function () { strike.classList.add('is-struck'); }, 240);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', chrome);
  } else {
    chrome();
  }
})();