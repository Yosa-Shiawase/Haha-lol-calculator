/* story.js — the landing page: a mini-pad that really calculates, the
   sticky card that walks 2 + 3 x 4 as you scroll, and the orange wipe.
   Everything it shows comes out of Engine; nothing is faked. */

(function () {
  'use strict';

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var DEMO = '2 + 3 \u00d7 4';
  var OPGLYPH = { '+': '+', '-': '\u2212', '*': '\u00d7', '/': '\u00f7', '^': '^' };

  var stage = 0;
  var ticking = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  /* 1. the mini-pad: three keys, the real engine */

  function miniPad() {
    var keys = document.querySelectorAll('[data-go]');
    var out = document.querySelector('[data-pad-out]');
    var line = document.querySelector('[data-pad-expr]');
    var steps = document.querySelector('[data-pad-steps]');
    if (!keys.length || !out) return;

    Array.prototype.forEach.call(keys, function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-go');
        btn.classList.remove('is-hit');
        void btn.offsetWidth;
        btn.classList.add('is-hit');

        line.textContent = text;
        steps.textContent = '';
        Kitsu.one('hero', 'think', 400);

        try {
          var r = Engine.solve(text, { mode: 'deg' });
          out.textContent = r.text;
          out.className = 'minipad__val';
          r.steps.forEach(function (s) { steps.appendChild(el('li', null, s.m)); });
          Kitsu.sayTo('hero', 'Solved — and I showed my work.', 'happy');
        } catch (e) {
          out.textContent = Engine.isError(e) ? Engine.line(e.code) : Engine.line('unknown');
          out.className = 'minipad__val is-error';
          Kitsu.sayTo('hero', out.textContent, 'oops');
        }
      });
    });
  }

  /* 2. the scroll beat: tokens, tree, steps, answer */

  function tokenChip(t) {
    var label = t.t === 'num' ? t.s : t.t === 'op' ? OPGLYPH[t.v] : t.v;
    return el('span', 'chip' + (t.t === 'op' ? ' chip--op' : ''), label);
  }

  function treeLines(node, depth, out) {
    var pad = '    '.repeat(depth);
    var label = Engine.render(node, 6);

    out.push({ depth: depth, text: (depth ? '\u2514\u2500\u2500 ' : '') + label, leaf: !node.l && !node.r });
    if (node.l) treeLines(node.l, depth + 1, out);
    if (node.r) treeLines(node.r, depth + 1, out);
    return out;
  }

  function buildStages() {
    var host = document.querySelector('[data-stages]');
    if (!host) return null;

    var solved;
    try {
      solved = Engine.solve(DEMO, { mode: 'deg' });
    } catch (e) {
      return null;
    }

    var tokens = host.querySelector('[data-tokens]');
    tokens.textContent = '';
    solved.tokens.forEach(function (t) { tokens.appendChild(tokenChip(t)); });

    host.querySelector('[data-tree]').textContent =
      treeLines(solved.ast, 0, []).map(function (l) { return l.text; }).join('\n');

    var steps = host.querySelector('[data-steps]');
    solved.steps.forEach(function (s, i) {
      var li = el('li', 'math__step');
      li.appendChild(el('b', null, s.m));
      if (s.n) li.appendChild(el('span', null, s.n));
      li.style.setProperty('--i', i);
      steps.appendChild(li);
    });

    host.querySelector('[data-answer]').textContent = solved.text;
    host.querySelector('[data-aside]').textContent = solved.steps[solved.steps.length - 1].n;
    return host;
  }

  function showStage(n) {
    var stages = document.querySelectorAll('[data-stage]');
    if (!stages.length) return;
    stage = Math.max(0, Math.min(stages.length - 1, n));
    for (var i = 0; i < stages.length; i++) stages[i].classList.toggle('is-on', i === stage);
  }

  function scrollBeat(host) {
    if (!host) return;

    function measure() {
      var box = host.closest('.math') || host;
      var top = box.getBoundingClientRect().top + window.pageYOffset;
      var span = box.offsetHeight - window.innerHeight;
      var p = span > 0 ? (window.pageYOffset - top) / span : 1;
      showStage(RM.matches ? 3 : Math.floor(p * 4 + 0.15));
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; measure(); });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
  }

  /* 3. the wipe: cover in one phase, hold in the other */

  function pageWipe() {
    var layer = document.querySelector('[data-wipe-layer]');
    if (!layer) return;
    var go = 0;
    var giveUp = 0;

    /* the overlay covers the viewport, so it must always be escapable: the
       button, Esc or a backdrop click — and the watchdog takes it down even
       if the navigation never happens. */
    function clear() {
      window.clearTimeout(go);
      window.clearTimeout(giveUp);
      layer.classList.remove('is-wiping');
      layer.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey, true);
    }

    function onKey(ev) {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      clear();
    }

    function onClick(ev) {
      if (ev.target.closest('[data-wipe-cancel]')) return;
      clear();
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-wipe]'), function (a) {
      a.addEventListener('click', function (ev) {
        if (RM.matches || go) return;
        ev.preventDefault();
        layer.classList.add('is-wiping');
        layer.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey, true);
        giveUp = window.setTimeout(clear, 2500);
        go = window.setTimeout(function () { window.location.href = a.getAttribute('href'); }, 700);
      });
    });
  }

  function boot() {
    miniPad();
    scrollBeat(buildStages());
    pageWipe();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();