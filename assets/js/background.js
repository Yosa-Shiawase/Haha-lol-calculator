/* ==========================================================================
   background.js — the solving paper, first layer: graph paper.
   A single fixed canvas paints the paper colour and the grid behind
   everything. Horizontal lines scroll with the page so it feels like paper
   you are working on; vertical lines stay put. Dirty-flag rendering: we
   paint on scroll, on resize and on font load, never on a timer.
   ========================================================================== */

(function () {
  'use strict';

  var CELL = 48;
  var LINE_W = 1;
  var INK_A = 0.05;
  var INK_A_5 = 0.08;
  var MAX_DPR = 2;

  var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas = null;
  var ctx = null;

  var W = 0;
  var H = 0;
  var dpr = 1;
  var paper = '#F3ECDF';
  var ink = '25,20,17';

  var dirty = true;
  var raf = 0;
  var staticMode = false;

  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    paper = cs.getPropertyValue('--paper').trim() || '#F3ECDF';

    var hex = (cs.getPropertyValue('--ink').trim() || '#191411').replace('#', '');
    var v = parseInt(hex, 16);
    ink = ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255);
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  function paint(scrollY) {
    var i, y, idx;

    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = LINE_W;

    var light = 'rgba(' + ink + ',' + INK_A + ')';
    var heavy = 'rgba(' + ink + ',' + INK_A_5 + ')';

    /* vertical lines never move; anchor one through the centre so the grid
       looks deliberate rather than wherever the viewport happens to cut it */
    var anchor = W / 2 - Math.round(W / 2 / CELL) * CELL;

    ctx.strokeStyle = light;
    ctx.beginPath();
    for (i = 0; anchor + i * CELL < W + CELL; i++) {
      if (((i % 5) + 5) % 5 === 0) continue;
      var x = Math.round(anchor + i * CELL) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    ctx.stroke();

    /* horizontal lines scroll with the page, every fifth one heavier */
    var off = scrollY % CELL;
    var first = Math.floor(scrollY / CELL);

    ctx.strokeStyle = light;
    ctx.beginPath();
    for (y = -off, idx = first; y <= H; y += CELL, idx++) {
      if (((idx % 5) + 5) % 5 === 0) continue;
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = heavy;
    ctx.beginPath();
    for (y = -off, idx = first; y <= H; y += CELL, idx++) {
      if (((idx % 5) + 5) % 5 !== 0) continue;
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(W, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }

  function frame() {
    raf = 0;
    if (!dirty) return;
    dirty = false;
    paint(staticMode ? 0 : (window.pageYOffset || document.documentElement.scrollTop || 0));
  }

  function invalidate() {
    dirty = true;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function setMode(reduced) {
    if (staticMode === reduced) return;
    staticMode = reduced;
    dirty = true;
  }

  function init() {
    canvas = document.createElement('canvas');
    canvas.id = 'paper-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d');
    document.body.appendChild(canvas);

    readTokens();
    layout();

    window.addEventListener('scroll', function () {
      if (!staticMode) invalidate();
    }, { passive: true });

    window.addEventListener('resize', function () {
      layout();
      invalidate();
    });

    if (rm.addEventListener) rm.addEventListener('change', function (e) { setMode(e.matches); });
    else if (rm.addListener) rm.addListener(function (e) { setMode(e.matches); });

    setMode(rm.matches);

    /* the page grows when the webfonts land */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(invalidate, invalidate);

    invalidate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();