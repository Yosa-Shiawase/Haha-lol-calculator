/* background.js — "solving paper": the paper resolves into focus behind an ink
   frontier that follows you down the page. Graph paper, a plotted curve inked
   by scrolling, plot points, an orange nib, flying ink, margin stamps, a pencil
   sketch running ahead of the ink, drifting margin glyphs, and a folded corner
   that tells you how far through the page you are.

   Everything is drawn in page-space (t = 0..1 down the page) and one fixed
   canvas sits behind all content. The frontier is
   progress = (scrollY + 0.85 * viewportH) / pageHeight, which means it always
   lands at 85% of the viewport height however far you have scrolled. */

(function () {
  'use strict';

  /* ---- the paper ---- */

  var CELL = 48;               /* graph-paper spacing, px */
  var FRONTIER = 0.85;         /* the ink frontier sits this far down the viewport */
  var GRID_BEHIND = 0.06;      /* ink alpha behind the frontier */
  var GRID_BEHIND_5 = 0.09;    /* ... and on every fifth line */
  var GRID_AHEAD = 0.04;       /* ink alpha ahead of it, dashed */
  var GRID_DASH = [2, 6];
  var LINE_W = 1;

  /* ---- the plot ---- */

  var SAMPLE = 2;              /* px of page between curve samples */
  var MAX_DPR = 2;
  var CURVE_A = 0.12;
  var CURVE_W = 2;

  /* ---- plot points ---- */

  var POINT_EVERY = 0.04;      /* a mark every 4% of the page */
  var MAX_POINTS = 30;
  var POINT_A = 0.25;
  var CROSS = 7;               /* the "+" mark, px across */
  var ROOT_R = 10;             /* the open circle, px radius */
  var ROOT_NEAR = 6;           /* how close to the centre counts as a root, px */

  /* ---- the nib ---- */

  var TIP_R = 5;
  var TRAIL_T = 0.02;          /* the trail is this much of the page */
  var TRAIL_VEL = 0.0016;      /* ... and grows with scroll velocity, px per frame */

  /* ---- flying ink ---- */

  var DROP_MAX = 80;
  var DROP_PER_FRAME = 3;
  var DROP_VEL = 40;           /* px per frame before ink flies */
  var DROP_GRAV = 60;          /* px per second, squared */
  var DROP_LIFE = 700;         /* ms before a droplet dries as a blot */
  var DROP_MIN_R = 1.5;
  var DROP_MAX_R = 3.5;

  /* ---- margin stamps ---- */

  var STAMP_EVERY = 0.12;
  var STAMP_SIZE = 13;
  var STAMP_TURN = -6;         /* degrees */
  var STAMP_REVEAL_PX = 220;   /* scroll distance that plays the reveal */
  var STAMP_A_HOT = 0.35;
  var STAMP_A_REST = 0.14;

  /* ---- the pencil sketch ---- */

  var PENCIL_A = 0.22;
  var PENCIL_DASH = [6, 9];
  var PENCIL_AHEAD = 1.18;     /* the sketch runs this far ahead of the ink */

  /* ---- margin glyphs ---- */

  var GLYPH_A = 0.06;
  var STRIKE_A = 0.08;
  var GLYPHS = [
    { g: 'π', size: 260, side: -1, factor: 0.92, spin: 0.010, at: 0.08 },
    { g: '∑', size: 190, side: 1, factor: 0.86, spin: -0.008, at: 0.24 },
    { g: '√', size: 230, side: -1, factor: 0.95, spin: 0.006, at: 0.40 },
    { g: '∫', size: 170, side: 1, factor: 0.80, spin: -0.011, at: 0.56 },
    { g: 'Δ', size: 210, side: -1, factor: 0.88, spin: 0.009, at: 0.72 },
    { g: '≠', size: 180, side: 1, factor: 0.83, spin: -0.007, at: 0.88 }
  ];

  /* ---- the folded corner ---- */

  var FOLD_MIN = 22;
  var FOLD_GROW = 26;

  /* the eight stamps, in the order the page meets them */
  var STAMPS = [
    '× before +', '= 12', 'θ = 30°', '√16 = 4',
    '7! = 5040', '2^10 = 1024', 'π ≈ 3.14159', '= 14'
  ];

  var MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
  var DISPLAY = '"Fraunces", Georgia, serif';

  var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var canvas = null;
  var ctx = null;

  var W = 0, H = 0, pageH = 0, dpr = 1;
  var sampleCount = 0;
  var inkX = null, inkY = null, penX = null, penY = null;
  var points = [], stamps = [], glyphs = [], droplets = [];
  var color = { paper: '#F3ECDF', paper2: '#FAF5EA', ink: '25,20,17', fox: '#E0511A', pine: '#1F3B2C' };

  var dirty = true;
  var raf = 0;
  var lastY = 0;
  var velocity = 0;
  var dropCursor = 0;
  var liveDrops = 0;
  var moved = false;
  var staticMode = false;
  var lastTs = 0;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function readTokens() {
    var cs = getComputedStyle(document.documentElement);
    var prop = function (name, fallback) {
      return (cs.getPropertyValue(name) || '').trim() || fallback;
    };
    color.paper = prop('--paper', '#F3ECDF');
    color.paper2 = prop('--paper2', '#FAF5EA');
    color.fox = prop('--fox', '#E0511A');
    color.pine = prop('--pine', '#1F3B2C');
    color.ink = hexToRgb(prop('--ink', '#191411'));
  }

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16);
    return ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255);
  }

  function inkAt(width, t) {
    return width / 2
      + Math.sin(t * 2.2 * Math.PI * 2) * width * 0.30
      + Math.sin(t * 11 * Math.PI * 2 + 1.5) * width * 0.05;
  }

  function pencilAt(width, t) {
    return width / 2
      + Math.sin(t * 1.7 * Math.PI * 2 + 0.9) * width * 0.36
      + Math.sin(t * 5.3 * Math.PI * 2) * width * 0.06;
  }

  /* the plot marks are fixed for a given page, so they are worked out once
     per layout rather than every frame */
  function layoutPoints() {
    var list = [];
    for (var i = 1; i * POINT_EVERY <= 1 && list.length < MAX_POINTS; i++) {
      var t = i * POINT_EVERY;
      if (t > 1) break;
      var x = inkAt(W, t);
      list.push({
        t: t,
        x: x,
        y: t * pageH,
        root: Math.abs(x - W / 2) <= ROOT_NEAR
      });
    }
    return list;
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    pageH = Math.max(document.documentElement.scrollHeight, H);

    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    sampleCount = Math.max(2, Math.ceil(pageH / SAMPLE) + 1);
    inkX = new Float32Array(sampleCount);
    inkY = new Float32Array(sampleCount);
    penX = new Float32Array(sampleCount);
    penY = new Float32Array(sampleCount);
    for (var i = 0; i < sampleCount; i++) {
      var t = i / (sampleCount - 1);
      inkX[i] = inkAt(W, t);
      inkY[i] = t * pageH;
      penX[i] = pencilAt(W, t);
      penY[i] = t * pageH;
    }

    points = layoutPoints();

    stamps = STAMPS.map(function (text, index) {
      var t = (index + 1) * STAMP_EVERY;
      return {
        text: text,
        t: Math.min(t, 1),
        pageY: Math.min(t, 1) * pageH,
        side: index % 2 === 0 ? -1 : 1,
        x: index % 2 === 0 ? W * 0.035 : W * 0.965,
        align: index % 2 === 0 ? 'left' : 'right'
      };
    });

    glyphs = GLYPHS.map(function (g) {
      return {
        g: g.g,
        size: g.size,
        spin: g.spin,
        factor: g.factor,
        t: g.at,
        pageY: g.at * pageH,
        x: g.side < 0 ? W * 0.035 : W * 0.965,
        align: g.side < 0 ? 'left' : 'right'
      };
    });

    /* a fixed pool: nothing here is ever allocated while the page is live */
    droplets = [];
    for (var d = 0; d < DROP_MAX; d++) {
      droplets.push({ blot: true, x: 0, y: 0, vx: 0, vy: 0, r: 2, age: 0, pageX: 0, pageY: 0 });
    }
    dropCursor = 0;
    liveDrops = 0;

    dirty = true;
  }

  /* ---- layer 1 — the resolving grid ---- */

  function drawGrid(scrollY, frontierY) {
    var i, x, y, index;

    ctx.fillStyle = color.paper;
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = LINE_W;

    /* vertical lines stand still, and split where the frontier crosses them:
       solid where the ink has been, dashed where it has not */
    var vAnchor = W / 2 - Math.round(W / 2 / CELL) * CELL;

    ctx.beginPath();
    for (i = 0; vAnchor + i * CELL < W + CELL; i++) {
      if (((i % 5) + 5) % 5 === 0) continue;
      x = Math.round(vAnchor + i * CELL) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, frontierY);
    }
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + GRID_BEHIND + ')';
    ctx.stroke();

    ctx.beginPath();
    for (i = 0; vAnchor + i * CELL < W + CELL; i++) {
      if (((i % 5) + 5) % 5 !== 0) continue;
      x = Math.round(vAnchor + i * CELL) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, frontierY);
    }
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + GRID_BEHIND_5 + ')';
    ctx.stroke();

    ctx.setLineDash(GRID_DASH);
    ctx.beginPath();
    for (i = 0; vAnchor + i * CELL < W + CELL; i++) {
      x = Math.round(vAnchor + i * CELL) + 0.5;
      ctx.moveTo(x, frontierY);
      ctx.lineTo(x, H);
    }
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + GRID_AHEAD + ')';
    ctx.stroke();
    ctx.setLineDash([]);

    /* horizontal lines travel with the page, and each one is either behind
       the frontier or ahead of it */
    var off = scrollY % CELL;
    var base = Math.floor(scrollY / CELL);

    ctx.beginPath();
    for (i = 0, index = base; i * CELL - off <= H; i++, index++) {
      y = Math.round(i * CELL - off) + 0.5;
      if (y > frontierY || ((index % 5) + 5) % 5 === 0) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + GRID_BEHIND + ')';
    ctx.stroke();

    ctx.beginPath();
    for (i = 0, index = base; i * CELL - off <= H; i++, index++) {
      y = Math.round(i * CELL - off) + 0.5;
      if (y > frontierY || ((index % 5) + 5) % 5 !== 0) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + GRID_BEHIND_5 + ')';
    ctx.stroke();

    ctx.setLineDash(GRID_DASH);
    ctx.beginPath();
    for (i = 0; i * CELL - off <= H; i++) {
      y = Math.round(i * CELL - off) + 0.5;
      if (y <= frontierY) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + GRID_AHEAD + ')';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ---- layers 2 and 7 — the inked curve and the pencil sketch ---- */

  function curveRange(scrollY, progress) {
    var from = Math.floor((scrollY - 4) / pageH * (sampleCount - 1));
    var to = Math.ceil((scrollY + H + 4) / pageH * (sampleCount - 1));
    var tip = Math.round(clamp01(progress) * (sampleCount - 1));
    if (from < 0) from = 0;
    if (to > sampleCount - 1) to = sampleCount - 1;
    if (to > tip) to = tip;
    return { from: from, to: to, tip: tip };
  }

  function drawCurve(xs, ys, scrollY, progress, alpha, dash, rgb) {
    var range = curveRange(scrollY, progress);
    if (range.to - range.from < 1) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgb;
    ctx.lineWidth = CURVE_W;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(xs[range.from], ys[range.from] - scrollY);
    for (var i = range.from + 1; i <= range.to; i++) ctx.lineTo(xs[i], ys[i] - scrollY);
    ctx.stroke();
    ctx.restore();
  }

  /* ---- layer 3 — the plot marks ---- */

  function drawPoints(scrollY, progress) {
    ctx.save();
    ctx.strokeStyle = 'rgba(' + color.ink + ',' + POINT_A + ')';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
      var p = points[i];
      if (p.t > progress) continue;
      var y = p.y - scrollY;
      if (y < -ROOT_R || y > H + ROOT_R) continue;
      if (p.root) continue;                     /* roots get a circle of their own */
      ctx.moveTo(p.x - CROSS / 2, y);
      ctx.lineTo(p.x + CROSS / 2, y);
      ctx.moveTo(p.x, y - CROSS / 2);
      ctx.lineTo(p.x, y + CROSS / 2);
    }
    ctx.stroke();

    /* a crossing of the centre axis is a root, and gets an open circle */
    ctx.beginPath();
    for (var j = 0; j < points.length; j++) {
      var q = points[j];
      if (!q.root || q.t > progress) continue;
      var qy = q.y - scrollY;
      if (qy < -ROOT_R || qy > H + ROOT_R) continue;
      ctx.moveTo(q.x + ROOT_R, qy);
      ctx.arc(q.x, qy, ROOT_R, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---- layer 4 — the nib ---- */

  function drawTip(scrollY, progress, range) {
    if (range.tip < 1 || range.tip >= sampleCount - 1) return;
    var tipX = inkX[range.tip];
    var tipY = inkY[range.tip] - scrollY;

    var trail = Math.min(sampleCount - 1, Math.round(TRAIL_T * sampleCount + velocity * TRAIL_VEL * sampleCount));
    var from = Math.max(0, range.tip - trail);

    ctx.save();
    ctx.lineCap = 'round';
    var span = range.tip - from;
    for (var i = from; i < range.tip; i++) {
      var f = span ? (i - from) / span : 0;
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
    ctx.arc(tipX, tipY, TIP_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    return { x: tipX, y: tipY };
  }

  /* ---- layer 5 — flying ink ---- */

  function spawnDroplets(tipX, tipY) {
    var count = 1 + Math.floor(Math.random() * DROP_PER_FRAME);
    if (count > DROP_PER_FRAME) count = DROP_PER_FRAME;
    for (var k = 0; k < count; k++) {
      var drop = droplets[dropCursor];
      dropCursor = (dropCursor + 1) % DROP_MAX;
      drop.blot = false;
      drop.x = tipX + (Math.random() - 0.5) * 6;
      drop.y = tipY + (Math.random() - 0.5) * 6;
      /* they leave the nib roughly the way it is travelling, plus a shove */
      drop.vx = (Math.random() - 0.5) * 90 + (Math.random() < 0.5 ? -1 : 1) * velocity * 0.35;
      drop.vy = (Math.random() - 0.5) * 70 - 20;
      drop.r = DROP_MIN_R + Math.random() * (DROP_MAX_R - DROP_MIN_R);
      drop.age = 0;
    }
    liveDrops += count;
  }

  function stepDroplets(dt, scrollY) {
    var seconds = dt / 1000;
    for (var i = 0; i < droplets.length; i++) {
      var drop = droplets[i];
      if (drop.blot) continue;
      drop.age += dt;
      if (drop.age >= DROP_LIFE) {
        /* it dries where it landed and stays in the page from then on */
        drop.blot = true;
        drop.pageX = drop.x;
        drop.pageY = drop.y + scrollY;
        liveDrops--;
        continue;
      }
      drop.vy += DROP_GRAV * seconds;
      drop.x += drop.vx * seconds;
      drop.y += drop.vy * seconds;
    }
  }

  function drawDroplets(scrollY) {
    ctx.save();
    var inkLive = 'rgba(' + color.ink + ',';
    for (var i = 0; i < droplets.length; i++) {
      var drop = droplets[i];
      if (drop.blot) {
        var by = drop.pageY - scrollY;
        if (by < -6 || by > H + 6) continue;
        ctx.fillStyle = inkLive + '0.03)';
        ctx.beginPath();
        ctx.arc(drop.pageX, by, drop.r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        if (drop.y < -6 || drop.y > H + 6) continue;
        var fade = 1 - drop.age / DROP_LIFE;
        ctx.fillStyle = inkLive + (0.55 * fade).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(drop.x, drop.y, drop.r * (0.6 + 0.4 * fade), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /* ---- layer 6 — margin stamps ---- */

  function drawStamps(scrollY, progress) {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '400 ' + STAMP_SIZE + 'px ' + MONO;
    var frontierPageY = progress * pageH;

    for (var i = 0; i < stamps.length; i++) {
      var s = stamps[i];
      var y = s.pageY - scrollY;
      if (y < -30 || y > H + 30) continue;

      /* the reveal is measured in scrolled distance, not in milliseconds, so
         it holds still when you hold still */
      var k = clamp01((frontierPageY - s.pageY) / STAMP_REVEAL_PX);
      var scale = 1.35 - 0.35 * k;
      var alpha = STAMP_A_HOT + (STAMP_A_REST - STAMP_A_HOT) * k;

      ctx.save();
      ctx.translate(s.x, y);
      ctx.rotate(STAMP_TURN * Math.PI / 180);
      ctx.scale(scale, scale);
      ctx.textAlign = s.align;
      ctx.fillStyle = 'rgba(' + color.ink + ',' + alpha.toFixed(3) + ')';
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---- layer 8 — margin glyphs ---- */

  function drawGlyphs(scrollY, progress) {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = '700 200px ' + DISPLAY;
    var frontierPageY = progress * pageH;

    for (var i = 0; i < glyphs.length; i++) {
      var g = glyphs[i];
      /* the parallax rule: screenY = pageY - scrollY * factor */
      var y = g.pageY - scrollY * g.factor;
      if (y < -g.size || y > H + g.size) continue;

      var edge = Math.min(1, Math.max(0, y / (H * 0.18)))
        * Math.min(1, Math.max(0, (H - y) / (H * 0.18)));
      if (edge <= 0.01) continue;

      var turn = scrollY * g.spin * Math.PI / 180;

      ctx.save();
      ctx.translate(g.x, y);
      ctx.rotate(turn);
      ctx.font = '700 ' + g.size + 'px ' + DISPLAY;
      ctx.textAlign = g.align;
      ctx.fillStyle = 'rgba(' + color.ink + ',' + (GLYPH_A * edge).toFixed(4) + ')';
      ctx.fillText(g.g, 0, 0);

      /* once the ink has passed, a strike line runs through it */
      if (progress >= g.t) {
        var reach = g.size * 0.62;
        ctx.strokeStyle = 'rgba(' + color.ink + ',' + STRIKE_A + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(g.side < 0 ? 0 : -reach, g.size * 0.18);
        ctx.lineTo(g.side < 0 ? reach : 0, g.size * 0.18);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---- layer 9 — the folded corner ---- */

  function drawFold(scrollY) {
    var span = Math.max(1, pageH - H);
    var overall = clamp01(scrollY / span);
    var size = FOLD_MIN + FOLD_GROW * overall;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(W, H - size);
    ctx.lineTo(W, H);
    ctx.lineTo(W - size, H);
    ctx.closePath();
    ctx.fillStyle = color.paper2;
    ctx.fill();
    ctx.strokeStyle = 'rgba(' + color.ink + ',0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.translate(W, H);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = 'rgba(' + color.ink + ',0.4)';
    ctx.font = '400 10px ' + MONO;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    /* local -y is the fold's inward bisector once rotated, so the percentage
       sits inside the triangle, reading along the crease */
    ctx.fillText(Math.round(overall * 100) + '%', 0, -size * 0.30);
    ctx.restore();
  }

  /* ---- the frame ---- */

  function paint(scrollY) {
    var progress = staticMode ? 1 : clamp01((scrollY + FRONTIER * H) / pageH);
    /* the frontier always lands 85% of the way down the viewport */
    var frontierY = staticMode ? H : FRONTIER * H;

    drawGrid(scrollY, frontierY);
    drawCurve(penX, penY, scrollY, Math.min(1, progress * PENCIL_AHEAD), PENCIL_A, PENCIL_DASH, color.pine);
    drawCurve(inkX, inkY, scrollY, progress, CURVE_A, null, 'rgb(' + color.ink + ')');
    drawPoints(scrollY, progress);

    if (!staticMode) {
      var range = curveRange(scrollY, progress);
      var tip = drawTip(scrollY, progress, range);
      if (tip && moved && velocity > DROP_VEL) spawnDroplets(tip.x, tip.y);
      drawDroplets(scrollY);
    }

    drawStamps(scrollY, progress);
    drawGlyphs(scrollY, progress);
    drawFold(staticMode ? 0 : scrollY);
  }

  function frame(ts) {
    raf = 0;
    if (!dirty && !liveDrops) return;
    dirty = false;

    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var dt = lastTs ? Math.min(64, ts - lastTs) : 16;
    lastTs = ts;

    if (staticMode) {
      paint(0);
      return;
    }

    moved = Math.abs(y - lastY) > 0;
    velocity = velocity * 0.7 + (moved ? Math.abs(y - lastY) * 0.3 : 0);
    lastY = y;

    stepDroplets(dt, y);
    paint(y);

    /* ink still in the air needs frames to fall and dry into 3% blots, so the
       loop stays awake until the last one lands — but `moved` is false for
       every one of those frames, so a page standing still flings nothing */
    if (liveDrops > 0) raf = requestAnimationFrame(frame);
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
    lastTs = 0;
    velocity = 0;
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

    /* the page grows when fonts land or a section reveals, so the cached
       page height and everything derived from it are worked out again */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { onResize(); });
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
            document.fonts.load('700 200px "Fraunces"', 'π∑√∫Δ≠'),
            document.fonts.load('400 13px "JetBrains Mono"')
          ]);
        }
        return null;
      }).then(onResize, onResize);
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