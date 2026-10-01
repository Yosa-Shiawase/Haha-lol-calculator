/* ==========================================================================
   fox.js — Kitsu.
   One module, many instances. Builds the fox from parts, owns her four
   moods, her blink schedule, her eye tracking and her click-hop.
   Every animation here is a CSS class toggle; nothing is animated in JS.
   ========================================================================== */

(function () {
  'use strict';

  var RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TRACK_MAX = 4;      /* px, in fox viewBox units */
  var BLINK_MIN = 1600;
  var BLINK_MAX = 5000;
  var BLINK_MS = 130;
  var HOP_HOLD = 1700;

  var MARKUP = [
    '<svg class="fox" viewBox="0 0 200 200" data-mood="idle" role="img"',
    ' aria-label="Kitsu, a burnt-orange fox who explains her work">',
    '<g class="fox__tilt">',
    '<g class="ears">',
    '<path class="f" d="M34 72 L26 16 L86 46 Z"/>',
    '<path class="p" d="M39 62 L33 27 L73 48 Z"/>',
    '<path class="i" d="M26 16 L32 37 L51 29 Z"/>',
    '<path class="f" d="M166 72 L174 16 L114 46 Z"/>',
    '<path class="p" d="M161 62 L167 27 L127 48 Z"/>',
    '<path class="i" d="M174 16 L168 37 L149 29 Z"/>',
    '</g>',
    '<path class="f" d="M100 40 C138 40 164 62 168 92 C172 122 156 148 129 159 C120 163 110 165 100 165 C90 165 80 163 71 159 C44 148 28 122 32 92 C36 62 62 40 100 40 Z"/>',
    '<path class="p" d="M100 96 C126 96 142 110 142 128 C142 146 123 157 100 157 C77 157 58 146 58 128 C58 110 74 96 100 96 Z"/>',
    '<g class="freckles i">',
    '<circle cx="47" cy="120" r="3.4"/><circle cx="56" cy="132" r="3.4"/><circle cx="41" cy="106" r="3.4"/>',
    '<circle cx="153" cy="120" r="3.4"/><circle cx="144" cy="132" r="3.4"/><circle cx="159" cy="106" r="3.4"/>',
    '</g>',
    '<g class="blush"><ellipse class="f" cx="48" cy="98" rx="12" ry="8" opacity=".5"/><ellipse class="f" cx="152" cy="98" rx="12" ry="8" opacity=".5"/></g>',
    '<g class="track" data-eye="l">',
    '<circle class="p" cx="75" cy="90" r="13"/><circle class="i" cx="75" cy="90" r="13" fill="none" stroke="var(--ink)" stroke-width="2.5"/>',
    '<g class="pupilgrp"><circle class="i" cx="75" cy="90" r="7.4"/><circle class="p" cx="71.6" cy="86.6" r="2.7"/><circle class="p" cx="79.4" cy="94" r="1.5"/></g>',
    '</g>',
    '<g class="track" data-eye="r">',
    '<circle class="p" cx="125" cy="90" r="13"/><circle class="i" cx="125" cy="90" r="13" fill="none" stroke="var(--ink)" stroke-width="2.5"/>',
    '<g class="pupilgrp"><circle class="i" cx="125" cy="90" r="7.4"/><circle class="p" cx="121.6" cy="86.6" r="2.7"/><circle class="p" cx="129.4" cy="94" r="1.5"/></g>',
    '</g>',
    '<g class="e-arc s"><path d="M62 94 Q75 78 88 94"/><path d="M112 94 Q125 78 138 94"/></g>',
    '<g class="e-x s"><path d="M65 82 L85 100 M85 82 L65 100"/><path d="M115 82 L135 100 M135 82 L115 100"/></g>',
    '<g class="s">',
    '<g class="b-think"><path d="M61 74 L84 68"/><path d="M139 74 L116 68"/></g>',
    '<g class="b-oops"><path d="M63 64 L84 58"/><path d="M137 64 L116 58"/></g>',
    '</g>',
    '<path class="i" d="M92 110 Q100 105 108 110 Q107 121 100 124 Q93 121 92 110 Z"/>',
    '<g class="mouths">',
    '<path class="s m-neutral" d="M92 134 Q100 140 108 134"/>',
    '<g class="m-happy"><path class="i" d="M86 132 Q100 148 114 132 Q100 138 86 132 Z"/><ellipse class="f" cx="100" cy="140" rx="6" ry="4"/></g>',
    '<path class="m-flat s" d="M91 134 L109 134"/>',
    '<path class="m-wavy s" d="M88 134 q6 -7 12 0 t12 0"/>',
    '</g>',
    '</g>',
    '</svg>'
  ].join('');

  /* the same palette the standalone asset uses, so an inline fox and an
     <img> fox are pixel-identical */
  var STYLE = [
    '.fox{--fox:#E0511A;--ink:#191411;--paper2:#FAF5EA;--err:#B3261E}',
    '.fox *{vector-effect:non-scaling-stroke}',
    '.fox .f{fill:var(--fox)}.fox .i{fill:var(--ink)}.fox .p{fill:var(--paper2)}',
    '.fox .s{stroke:var(--ink);stroke-width:5;stroke-linecap:round;fill:none}',
    /* each mood shows exactly one eye set and exactly one mouth */
    '.fox .m-happy,.fox .m-wavy,.fox .m-flat,.fox .m-neutral,.fox .b-think,.fox .b-oops,.fox .blush,.fox .e-arc,.fox .e-x,.fox .track{opacity:0}',
    '.fox[data-mood="idle"] .track,.fox[data-mood="idle"] .m-neutral{opacity:1}',
    '.fox[data-mood="think"] .track,.fox[data-mood="think"] .m-flat,.fox[data-mood="think"] .b-think{opacity:1}',
    '.fox[data-mood="happy"] .m-happy,.fox[data-mood="happy"] .e-arc,.fox[data-mood="happy"] .blush{opacity:1}',
    '.fox[data-mood="oops"] .m-wavy,.fox[data-mood="oops"] .e-x,.fox[data-mood="oops"] .b-oops{opacity:1}',
    '.fox__tilt{transform-box:fill-box;transform-origin:50% 88%;transition:transform var(--t-enter) var(--ease)}',
    '.fox[data-mood="oops"] .fox__tilt{transform:rotate(-5deg)}',
    '.fox .track{transform-box:fill-box;transform-origin:50% 50%}',
    '.fox .pupilgrp{transform-box:fill-box;transform-origin:50% 50%;transform:scaleY(var(--blink,1));transition:transform ' + BLINK_MS + 'ms var(--ease)}'
  ].join('');

  var instances = [];
  var styleInjected = false;

  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var el = document.createElement('style');
    el.id = 'kitsu-style';
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function Kitsu(host) {
    this.host = host;
    this.id = host.getAttribute('data-kitsu') || 'main';
    this.hold = 0;
    this.blinkTimer = 0;

    injectStyle();
    host.classList.add('kitsu');
    host.innerHTML = MARKUP + '<p class="kitsu__line" data-line role="status"></p>';

    this.svg = host.querySelector('.fox');
    this.lineEl = host.querySelector('[data-line]');
    this.eyes = [host.querySelector('[data-eye="l"]'), host.querySelector('[data-eye="r"]')];
    this.pupils = host.querySelectorAll('.pupilgrp');

    var self = this;
    this.svg.addEventListener('click', function () { self.hop(); });
    this.scheduleBlink();

    var opening = host.getAttribute('data-line');
    if (opening) this.line(opening);
  }

  Kitsu.prototype.mood = function (mood, hold) {
    mood = mood === 'think' || mood === 'happy' || mood === 'oops' ? mood : 'idle';
    this.svg.setAttribute('data-mood', mood);
    if (this.hold) { clearTimeout(this.hold); this.hold = 0; }
    var self = this;
    if (hold) {
      this.hold = setTimeout(function () {
        self.hold = 0;
        self.svg.setAttribute('data-mood', 'idle');
      }, hold);
    }
  };

  Kitsu.prototype.hop = function () {
    if (!RM.matches) {
      this.svg.classList.remove('is-hop');
      void this.svg.getBoundingClientRect();
      this.svg.classList.add('is-hop');
      var self = this;
      setTimeout(function () { self.svg.classList.remove('is-hop'); }, HOP_HOLD);
    }
    this.mood('happy', HOP_HOLD);
  };

  /* the bubble is inert under reduced motion, so does the hop */
  Kitsu.prototype.line = function (text, mood) {
    this.lineEl.textContent = text;
    this.host.classList.toggle('is-talking', !!text);
    if (mood) this.mood(mood);
    document.dispatchEvent(new CustomEvent('kitsu:line', {
      detail: { id: this.id, text: text }
    }));
  };

  Kitsu.prototype.scheduleBlink = function () {
    var self = this;
    var wait = BLINK_MIN + Math.random() * (BLINK_MAX - BLINK_MIN);
    this.blinkTimer = setTimeout(function () {
      self.blink();
      self.scheduleBlink();
    }, wait);
  };

  Kitsu.prototype.blink = function () {
    if (RM.matches || !this.svg.isConnected) return;
    var self = this;
    var i = this.pupils.length;
    while (i--) this.pupils[i].style.setProperty('--blink', '0.08');
    setTimeout(function () {
      var j = self.pupils.length;
      while (j--) self.pupils[j].style.setProperty('--blink', '1');
    }, BLINK_MS / 2);
  };

  Kitsu.prototype.look = function (x, y) {
    if (RM.matches) return;
    for (var i = 0; i < this.eyes.length; i++) {
      this.eyes[i].style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)';
    }
  };

  /* one pointer listener for the whole site */
  var pending = null;
  var raf = 0;

  function track(e) {
    if (RM.matches) return;
    var cx = window.innerWidth / 2;
    var cy = window.innerHeight / 2;
    pending = {
      x: Math.max(-TRACK_MAX, Math.min(TRACK_MAX, (e.clientX - cx) / (cx / TRACK_MAX))),
      y: Math.max(-TRACK_MAX, Math.min(TRACK_MAX, (e.clientY - cy) / (cy / TRACK_MAX)))
    };
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (!pending) return;
      for (var i = 0; i < instances.length; i++) instances[i].look(pending.x, pending.y);
      pending = null;
    });
  }

  function mount() {
    var hosts = document.querySelectorAll('[data-kitsu]');
    for (var i = 0; i < hosts.length; i++) {
      if (instances.some(function (k) { return k.host === hosts[i]; })) continue;
      instances.push(new Kitsu(hosts[i]));
    }
  }

  function get(id) {
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].id === id) return instances[i];
    }
    return instances[0] || null;
  }

  function each(fn) {
    for (var i = 0; i < instances.length; i++) fn(instances[i]);
  }

  window.Kitsu = {
    /* one explicit target, or every fox on the page */
    one: function (id, mood, hold) {
      var k = get(id);
      if (k) k.mood(mood, hold);
    },
    mood: function (m, hold) { each(function (k) { k.mood(m, hold); }); },
    hop: function () { each(function (k) { k.hop(); }); },
    say: function (text, mood) { each(function (k) { k.line(text, mood); }); },
    sayTo: function (id, text, mood) { var k = get(id); if (k) k.line(text, mood); },
    instances: instances,
    mount: mount
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.addEventListener('pointermove', track, { passive: true });
})();