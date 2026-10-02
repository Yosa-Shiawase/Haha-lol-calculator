/* calc.js — the controller: display, live preview, tape, steps drawer,
   keyboard. It computes nothing itself; every value on screen came from
   Engine, through Engine.format. */

(function () {
  'use strict';

  var expr = document.getElementById('expr');
  if (!expr) return;

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');

  var display = document.querySelector('.display');
  var valueOut = document.getElementById('value');
  var tapeList = document.getElementById('tape');
  var stepsList = document.getElementById('steps');
  var drawer = document.getElementById('drawer');
  var drawerTab = document.querySelector('[data-drawer]');
  var sheetBackdrop = document.querySelector('[data-sheet-backdrop]');
  var countBadge = document.querySelector('[data-step-count]');
  var hint = document.querySelector('[data-steps-hint]');
  var padRoot = document.getElementById('calc');
  var padToggle = document.querySelector('[data-pad-toggle]');
  var padLabel = document.querySelector('[data-pad-label]');
  var anglesOut = document.querySelector('[data-angles]');

  var state = { mode: 'deg', ans: 0, last: 0 };
  var TAPE_MAX = 14;

  var SHORT = {
    unclosed: 'a bracket is still missing',
    div0: 'that would divide by zero',
    negsqrt: 'no square root of a negative',
    tan90: 'tan is undefined right here',
    domain: 'that leaves the real number line',
    fact: 'a factorial wants a whole number',
    unknown: 'Kitsu does not know that symbol'
  };

  var all = function (sel) { return [].slice.call(document.querySelectorAll(sel)); };

  /* --- display ----------------------- */

  function say(text, cls) {
    valueOut.textContent = text;
    valueOut.className = 'display__value' + (cls ? ' ' + cls : '');
  }

  /* the caret is tracked here rather than read from the DOM, because a
     click on a key button blurs the field and would otherwise lose it */
  var lastCaret = 0;

  function caret() { return lastCaret; }

  function put(text, pos) {
    expr.value = text;
    lastCaret = pos === undefined ? text.length : pos;
    expr.setSelectionRange(lastCaret, lastCaret);
  }

  function insert(text) {
    var at = caret();
    var v = expr.value;

    /* typing the bracket that is already there just steps over it */
    if (text === ')' && v[at] === ')') {
      expr.setSelectionRange(at + 1, at + 1);
      preview();
      return;
    }
    put(v.slice(0, at) + text + v.slice(at), at + text.length);
    preview();
  }

  function backspace() {
    var at = caret();
    if (at === 0) return;
    put(expr.value.slice(0, at - 1) + expr.value.slice(at));
    preview();
  }

  function clearAll() {
    put('');
    say('Kitsu is waiting');
    stepsList.textContent = '';
    countBadge.textContent = '0';
    drawer.setAttribute('data-has-steps', 'false');
    Kitsu.one('dock', 'idle');
    expr.focus();
  }

  function sign() {
    var v = expr.value;
    var at = caret();
    var m = /([0-9.]+)$/.exec(v.slice(0, at));

    /* nothing to flip yet — open a group and wait for the digits */
    if (!m) { insert('−('); return; }

    var head = v.slice(0, at - m[1].length);

    /* already sitting in −( ) — take the sign back off */
    if (head.slice(-2) === '\u2212(' && v[at] === ')') {
      put(head.slice(0, -2) + m[1] + v.slice(at + 1), head.length - 2 + m[1].length);
      preview();
      return;
    }

    put(head + '\u2212(' + m[1] + ')' + v.slice(at), at + 2);
    preview();
  }

  function preview() {
    var raw = expr.value.trim();

    if (!raw) { say('Kitsu is waiting'); setThinking(false); return; }

    try {
      var r = Engine.solve(raw, { mode: state.mode, ans: state.ans });
      say(r.text, 'is-answer');
    } catch (e) {
      if (Engine.isError(e)) {
        say(raw.length > 1 ? SHORT[e.code] : '', 'is-error');
      } else {
        say('Kitsu is stuck', 'is-error');
      }
    }
    setThinking(/[()]/.test(raw) && raw.indexOf('(') > raw.lastIndexOf(')'));
  }

  function setThinking(on) {
    Kitsu.one('dock', on ? 'think' : 'idle', on ? 1600 : 0);
  }

  /* --- solving --------------------------- */

  function drawSteps(steps, code) {
    stepsList.textContent = '';
    drawer.setAttribute('data-has-steps', steps && steps.length ? 'true' : 'false');
    countBadge.textContent = steps && steps.length ? String(steps.length) : '0';

    if (code) {
      hint.textContent = Engine.line(code);
      hint.style.display = '';
      return;
    }

    if (!steps || !steps.length) return;

    steps.forEach(function (s, i) {
      var li = document.createElement('li');
      li.className = 'step';
      li.style.animationDelay = (i * 40) + 'ms';
      var m = document.createElement('span');
      m.className = 'step__m';
      m.textContent = s.m;
      li.appendChild(m);
      if (s.n) {
        var n = document.createElement('span');
        n.className = 'step__n';
        n.textContent = s.n;
        li.appendChild(n);
      }
      stepsList.appendChild(li);
    });
  }

  function addTape(raw, text) {
    var empty = tapeList.querySelector('.tape__empty');
    if (empty) empty.remove();

    var li = document.createElement('li');
    li.className = 'tape__item is-cued';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tape__btn';

    var a = document.createElement('span');
    a.className = 'tape__expr';
    a.textContent = raw;
    var b = document.createElement('span');
    b.className = 'tape__val';
    b.textContent = '= ' + text;

    btn.appendChild(a);
    btn.appendChild(b);
    btn.addEventListener('click', function () {
      put(raw);
      all('.tape__item').forEach(function (x) { x.classList.remove('is-cued'); });
      li.classList.add('is-cued');
      preview();
      expr.focus();
    });

    li.appendChild(btn);
    tapeList.insertBefore(li, tapeList.firstChild);
    while (tapeList.children.length > TAPE_MAX) tapeList.removeChild(tapeList.lastChild);
  }

  /* the answer counts up, then the display flashes the accent once */
  function burst(to) {
    var from = (RM.matches || !isFinite(state.last)) ? to : state.last;
    display.classList.remove('is-bursting');

    function flash() {
      display.classList.add('is-bursting');
      window.setTimeout(function () { display.classList.remove('is-bursting'); }, 620);
    }

    if (RM.matches || from === to || !isFinite(from)) {
      say(Engine.format(to), 'is-answer');
      flash();
      return;
    }

    var t0 = performance.now();
    (function tick(now) {
      var p = Math.min(1, (now - t0) / 600);
      var eased = 1 - Math.pow(1 - p, 3);
      try { say(Engine.format(from + (to - from) * eased), 'is-answer'); } catch (err) { say(Engine.format(to), 'is-answer'); }
      if (p < 1) requestAnimationFrame(tick);
      else flash();
    })(t0);
  }

  function solve() {
    var raw = expr.value.trim();
    if (!raw) {
      Kitsu.sayTo('dock', 'Type something and I will climb it for you.', 'think');
      return;
    }

    put(raw);

    var res;
    try {
      res = Engine.solve(raw, { mode: state.mode, ans: state.ans });
    } catch (e) {
      var code = Engine.isError(e) ? e.code : 'unknown';
      say(SHORT[code], 'is-error');
      drawSteps(null, code);
      Kitsu.sayTo('dock', Engine.line(code), 'oops');
      return;
    }

    state.ans = res.value;
    state.last = res.value;

    drawSteps(res.steps);
    addTape(raw, res.text);
    burst(res.value);
    Kitsu.sayTo('dock', 'Solved — and I showed my work.', 'happy');

    if (window.innerWidth > 720 && drawer.getAttribute('data-open') !== 'true') {
      setDrawer(true);
    }
  }

  /* --- keys, switch, drawer, pad pages ------------- */

  function hit(btn) {
    btn.classList.remove('is-hit');
    void btn.offsetWidth;
    btn.classList.add('is-hit');
  }

  all('[data-ins]').forEach(function (btn) {
    btn.addEventListener('click', function () { hit(btn); insert(btn.getAttribute('data-ins')); });
  });

  all('[data-append]').forEach(function (btn) {
    btn.addEventListener('click', function () { hit(btn); insert(btn.getAttribute('data-append')); });
  });

  var back = document.querySelector('[data-backspace]');
  if (back) back.addEventListener('click', function () { hit(back); backspace(); });

  var clr = document.querySelector('[data-clear]');
  if (clr) clr.addEventListener('click', function () { hit(clr); clearAll(); });

  var sgn = document.querySelector('[data-sign]');
  if (sgn) sgn.addEventListener('click', function () { hit(sgn); sign(); });

  var eq = document.querySelector('[data-solve]');
  if (eq) eq.addEventListener('click', function () { hit(eq); solve(); });

  function setMode(mode) {
    state.mode = mode;
    all('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (anglesOut) anglesOut.textContent = mode.toUpperCase();
    preview();
  }

  all('[data-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
  });

  /* one place decides if the sheet is open, so tab, backdrop and Esc agree */
  function setDrawer(open) {
    drawer.setAttribute('data-open', open ? 'true' : 'false');
    if (drawerTab) drawerTab.setAttribute('aria-expanded', open ? 'true' : 'false');
    padRoot.setAttribute('data-sheet', open ? 'true' : 'false');
  }

  if (drawerTab) {
    drawerTab.addEventListener('click', function () {
      setDrawer(drawer.getAttribute('data-open') !== 'true');
    });
  }

  /* the backdrop closes the sheet, then hands the click to whatever was
       underneath, so reading the steps never costs a second click */
  if (sheetBackdrop) {
    sheetBackdrop.addEventListener('click', function (ev) {
      var x = ev.clientX;
      var y = ev.clientY;
      setDrawer(false);
      var under = document.elementFromPoint(x, y);
      if (under && under !== sheetBackdrop && under.click) under.click();
    });
  }

  if (padToggle) {
    padToggle.addEventListener('click', function () {
      var next = padRoot.getAttribute('data-pad') === 'fn' ? 'main' : 'fn';
      padRoot.setAttribute('data-pad', next);
      padToggle.setAttribute('aria-pressed', next === 'fn' ? 'true' : 'false');
      if (padLabel) padLabel.textContent = next === 'fn' ? '123' : 'fn';
    });
  }

  /* --- keyboard ----------------------- */

  var TYPED = {
    '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^',
    '(': '(', ')': ')', '!': '!', '.': '.'
  };

  function onKey(ev) {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;

    var k = ev.key;
    var inField = ev.target === expr;

    if (k === 'Enter' || k === '=') { ev.preventDefault(); solve(); return; }
    if (k === 'Escape') {
      ev.preventDefault();
      /* the topmost overlay answers to Esc before the calculator does */
      if (drawer.getAttribute('data-open') === 'true') { setDrawer(false); return; }
      clearAll();
      return;
    }

    /* starting to work dismisses the sheet, so it never sits over the keys */
    if (drawer.getAttribute('data-open') === 'true') setDrawer(false);

    if (k === 'Backspace') {
      if (inField) { preview(); return; }
      ev.preventDefault();
      expr.focus();
      backspace();
      return;
    }

    if (inField) return;

    /* anything a person might type simply lands in the expression, so
       "ans", "sqrt(9)" and "log(100)" need no special keys at all */
    if (TYPED[k] || /^[0-9a-z.]$/i.test(k)) {
      ev.preventDefault();
      expr.focus();
      insert(TYPED[k] || k);
    }
  }

  document.addEventListener('keydown', onKey);
  expr.addEventListener('input', function () {
    lastCaret = expr.selectionStart === null ? expr.value.length : expr.selectionStart;
    preview();
  });

  document.addEventListener('kitsu:heard', function (ev) {
    put(ev.detail.expression);
    preview();
    solve();
    expr.focus();
  });

  setMode('deg');

  /* a mouse user gets the caret straight away; a phone would only get an
     on-screen keyboard covering half the keypad */
  if (window.matchMedia('(pointer: fine)').matches) {
    expr.focus({ preventScroll: true });
  }
})();