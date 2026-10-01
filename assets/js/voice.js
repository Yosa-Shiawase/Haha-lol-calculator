/* ==========================================================================
   voice.js — Kitsu's mouth. Strictly opt-in.
   Nothing here ever runs until the speaker is switched on, and every
   capability check degrades silently: no speech on the page, no errors.
   ========================================================================== */

(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  var PREFER = ['Samantha', 'Google UK English Female', 'Aria', 'Libby', 'Zira'];

  var enabled = false;
  var voice = null;
  var current = null;      /* the utterance on the air, for barge-in */
  var bubbles = [];        /* live [data-line] elements we may highlight */
  var rec = null;
  var listening = false;

  function englishVoices() {
    if (!synth) return [];
    return synth.getVoices().filter(function (v) { return /^en/i.test(v.lang || ''); });
  }

  function pickVoice() {
    var pool = englishVoices();
    var i, j, name;

    for (i = 0; i < PREFER.length; i++) {
      for (j = 0; j < pool.length; j++) {
        if (pool[j].name === PREFER[i]) return pool[j];
      }
      for (j = 0; j < pool.length; j++) {
        name = pool[j].name || '';
        if (name.indexOf(PREFER[i]) !== -1) return pool[j];
      }
    }
    return pool[0] || null;
  }

  /* one span per word so the bubble can follow her along */
  function layWords(el, text) {
    var parts = text.split(/\s+/).filter(Boolean);
    el.textContent = '';
    parts.forEach(function (w, i) {
      var span = document.createElement('span');
      span.className = 'word';
      span.textContent = (i ? ' ' : '') + w;
      el.appendChild(span);
    });
    return el.querySelectorAll('.word');
  }

  function stop() {
    if (synth) synth.cancel();
    current = null;
    bubbles.forEach(function (el) {
      var spoken = el.querySelectorAll('.word.is-spoken');
      for (var i = 0; i < spoken.length; i++) spoken[i].classList.remove('is-spoken');
    });
    bubbles = [];
  }

  function speak(text, el) {
    if (!enabled || !synth || !text) return;

    stop();
    if (!voice) voice = pickVoice();

    var utter = new SpeechSynthesisUtterance(text);
    if (voice) utter.voice = voice;
    utter.pitch = 1.1;
    utter.rate = 0.96 + Math.random() * 0.08;   /* a 4% drift, so she never loops */
    utter.lang = (voice && voice.lang) || 'en-GB';
    utter.onend = utter.onerror = function () {
      if (current === utter) current = null;
    };

    if (el) {
      bubbles.push(el);
      var words = layWords(el, text);
      utter.onboundary = function (e) {
        var upto = 0;
        for (var i = 0; i < words.length; i++) {
          upto += words[i].textContent.length;
          if (upto > e.charIndex) {
            words[i].classList.add('is-spoken');
          } else {
            break;
          }
        }
      };
    }

    current = utter;
    synth.speak(utter);
  }

  /* ------------------------------------------------------------------ *
   * speech in: "two plus three times four" -> 2 + 3 * 4
   * ------------------------------------------------------------------ */

  var NUMBERS = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
    seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20',
    thirty: '30', forty: '40', fifty: '50', sixty: '60', seventy: '70',
    eighty: '80', ninety: '90'
  };

  var PHRASES = [
    ['square root of', 'sqrt('], ['to the power of', '^'], ['to the power', '^'],
    ['divided by', '/'], ['multiplied by', '*'], ['times', '*'],
    ['open bracket', '('], ['close bracket', ')'],
    ['plus', '+'], ['minus', '-'], ['over', '/'],
    ['point', '.'], ['factorial', '!'], ['equals', '']
  ];

  var WORDS = {
    point: '.', pi: 'pi', e: 'e', ans: 'ans',
    sine: 'sin(', cos: 'cos(', tan: 'tan(',
    cosine: 'cos(', tangent: 'tan(',
    square: 'sqrt(', root: 'sqrt(', absolute: 'abs(',
    log: 'log(', ln: 'ln('
  };

  function transcribe(text) {
    var s = ' ' + String(text).toLowerCase().replace(/[^a-z0-9. ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    var i;

    for (i = 0; i < PHRASES.length; i++) {
      s = s.split(' ' + PHRASES[i][0] + ' ').join(' ' + PHRASES[i][1] + ' ');
    }
    s = s.split(/\s+/).map(function (w) {
      if (!w) return '';
      if (NUMBERS[w] !== undefined) return NUMBERS[w];
      if (WORDS[w] !== undefined) return WORDS[w];
      if (/^[0-9.]+$/.test(w)) return w;
      return '';
    }).filter(Boolean).join(' ');

    return window.Engine ? window.Engine.normalizeInput(s) : s.trim();
  }

  function hear(onText) {
    if (!SR || listening) return;
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    listening = true;

    rec.onresult = function (e) {
      var said = e.results[0][0].transcript;
      var expression = transcribe(said);
      listening = false;
      document.dispatchEvent(new CustomEvent('kitsu:heard', {
        detail: { said: said, expression: expression }
      }));
      if (onText) onText(expression, said);
    };
    rec.onerror = function () { listening = false; syncMic(); };
    rec.onend = function () { listening = false; syncMic(); };

    try {
      rec.start();
      syncMic();
    } catch (e) {
      listening = false;
      syncMic();
    }
  }

  /* ------------------------------------------------------------------ *
   * wiring
   * ------------------------------------------------------------------ */

  function syncMic() {
    var btn = document.querySelector('[data-mic]');
    if (!btn) return;
    btn.setAttribute('aria-pressed', listening ? 'true' : 'false');
    btn.textContent = listening ? 'Listening\u2026' : 'Talk to Kitsu';
  }

  function setEnabled(on) {
    enabled = !!on && !!synth;
    var buttons = document.querySelectorAll('[data-speak]');
    var labels = document.querySelectorAll('[data-speak-label]');

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', enabled ? 'true' : 'false');
    }
    for (var j = 0; j < labels.length; j++) {
      labels[j].textContent = enabled ? 'Speaker on' : 'Speaker off';
    }

    if (!enabled) stop();
  }

  function init() {
    var mic = document.querySelector('[data-mic]');
    if (mic) mic.hidden = !SR;

    if (synth) {
      voice = pickVoice();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', function () { voice = pickVoice(); });
    }

    document.addEventListener('kitsu:line', function (e) {
      if (!enabled) return;
      var host = document.querySelector('[data-kitsu="' + e.detail.id + '"]');
      speak(e.detail.text, host ? host.querySelector('[data-line]') : null);
    });

    var buttons = document.querySelectorAll('[data-speak]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () { setEnabled(!enabled); });
    }

    if (mic) mic.addEventListener('click', function () { hear(); });

    window.addEventListener('pagehide', stop);
  }

  window.Voice = {
    get enabled() { return enabled; },
    get supported() { return !!synth; },
    get recognitionSupported() { return !!SR; },
    speak: speak,
    stop: stop,
    transcribe: transcribe,
    listen: hear,
    setEnabled: setEnabled
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();