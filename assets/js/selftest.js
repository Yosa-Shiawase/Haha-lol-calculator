/* selftest.js — the QA gate.
 *
 * This file is never shipped to a visitor. calc.html attaches it only when the
 * page is opened with ?selftest, and test.html opens calc.html that way.
 * Run it from the console with:
 *
 *     window.HAHA.test()
 *
 * It returns a promise resolving to the same result object it prints, so a
 * harness can assert on it:
 *
 *     HAHA.test().then(function (r) { if (r.failed) throw new Error('self-test failed'); });
 *
 * Everything here drives the real DOM: it clicks the real keys and reads the
 * real display, so a pass means the shipped page works, not that a copy of the
 * logic does.
 */
(function () {
  'use strict';

  var POISON = /NaN|undefined|\[object|Infinity/;

  /* A raw artifact is a *value* a number cannot have: the whole string being
     NaN, undefined or Infinity, or an [object escaping from somewhere. The
     bare word "undefined" inside a sentence is deliberately not flagged — two
     of Kitsu's error lines say "undefined" in plain English, and the brief
     forbids rewriting her error lines. So the test is for values, not for
     prose. */
  function isArtifact(text) {
    var s = String(text == null ? '' : text);
    if (s.indexOf('[object') >= 0) return true;
    if (/^\s*(NaN|undefined|Infinity)\s*$/.test(s)) return true;
    return /(^|[^\w])(NaN|Infinity)($|[^\w])/.test(s);
  }

  /* only Kitsu ever writes sentences, so prose in one of these slots means
     something leaked that should have been a number */
  function looksLikeAValue(text) {
    return /^\s*[-+−]?[0-9.,]*\s*(?:[eE][-+−]?\d+)?\s*(?:×|÷|\+)\s*\d/.test(String(text || ''));
  }

  /* ---- plumbing --------------------------------------------------------- */

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return [].slice.call(document.querySelectorAll(sel)); }

  function tick(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }

  function exprVal() { return $('#expr').value; }
  function shown() { return $('#value').textContent; }
  function steps() {
    return $$('#steps .step__m').map(function (n) { return n.textContent; });
  }
  function mood() {
    var f = $('[data-kitsu="dock"] .fox');
    return f ? f.getAttribute('data-mood') : null;
  }
  function kitsuLine() {
    var n = $('[data-kitsu="dock"] [data-line]');
    return n ? n.textContent : '';
  }
  function drawerOpen() {
    var d = $('#drawer');
    return d ? d.getAttribute('data-open') : 'no-drawer';
  }

  /* every key on the pad, by the contract each one honours */
  function clickIns(token) {
    var b = $('[data-ins="' + token + '"]');
    if (!b) throw new Error('no key inserts ' + JSON.stringify(token));
    b.click();
  }
  function clickAttr(attr) {
    var b = $('[' + attr + ']');
    if (!b) throw new Error('no key has ' + attr);
    b.click();
  }
  function clickEq(attr, value) {
    var b = $('[' + attr + '="' + value + '"]');
    if (!b) throw new Error('no key has ' + attr + '="' + value + '"');
    b.click();
  }
  function clear() { clickAttr('data-clear'); }
  function solve() { clickAttr('data-solve'); }
  function pressKey(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: key, bubbles: true, cancelable: true
    }));
  }

  function type(text) {
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (/\s/.test(ch)) continue;          /* the pad has no space key, and typing one is its own path */
      if (ch === '*') clickIns('×');
      else if (ch === '/') clickIns('÷');
      else if (ch === '-') clickIns('−');
      else if (ch === '%') clickEq('data-append', '%');
      else clickIns(ch);
    }
  }

  /* 2d: press a run of real keys, each one named by the token it inserts */
  function keys() {
    for (var i = 0; i < arguments.length; i++) {
      var token = arguments[i];
      if ($('[data-ins="' + token + '"]')) clickIns(token);
      else if ($('[data-append="' + token + '"]')) clickEq('data-append', token);
      else if (/^[0-9.]+$/.test(token)) { for (var d = 0; d < token.length; d++) clickIns(token[d]); }
      else throw new Error('no key means ' + JSON.stringify(token));
    }
  }

  /* and solve it, waiting for the count-up to land before reading the answer */
  function solveKeys() {
    clear();
    keys.apply(null, arguments);
    solve();
    return settle().then(function () { return shown(); });
  }

  function layer() { return $('#calc').getAttribute('data-2nd'); }
  function memLit() { var m = $('[data-mem]'); return m && !m.hidden; }
  function layerFlag() { return $('[data-layer]').textContent; }
  function labelOf(attr, token) {
    var b = $('[' + attr + '="' + token + '"]');
    return b ? b.textContent : null;
  }

  /* after "=" the answer counts up; wait for it to land */
  function settle() { return tick(820); }

  /* ---- the report ------------------------------------------------------- */

  var results = [];

  function check(group, name, actual, expected) {
    var pass = String(actual) === String(expected);
    results.push({ group: group, name: name, pass: pass, actual: actual, expected: expected });
    return pass;
  }

  /* ---- 1. button sweep --------------------------------------------------- */

  function sweepButtons() {
    var g = 'button sweep';

    /* every insert key is a literal: from empty, one press is exactly its label */
    $$('[data-ins]').forEach(function (btn) {
      var token = btn.getAttribute('data-ins');
      clear();
      btn.click();
      check(g, 'data-ins ' + JSON.stringify(token), exprVal(), token);
    });

    $$('[data-append]').forEach(function (btn, i) {
      var token = btn.getAttribute('data-append');
      clear();
      clickIns('9');
      btn.click();
      check(g, 'data-append ' + JSON.stringify(token) + ' (#' + (i + 1) + ')', exprVal(), '9' + token);
    });

    clear();
    clickIns('1');
    clickIns('2');
    clickAttr('data-backspace');
    check(g, 'backspace deletes one character', exprVal(), '1');

    clear();
    clickIns('5');
    clickAttr('data-clear');
    check(g, 'C clears the input', exprVal(), '');
    check(g, 'C resets the display', shown(), 'Kitsu is waiting');

    clear();
    clickAttr('data-sign');
    check(g, 'sign opens a group on an empty input', exprVal(), '−(');

    clickAttr('data-mode="deg"');
    check(g, 'DEG toggles its label', $('[data-angles]').textContent, 'DEG');
    clickAttr('data-mode="rad"');
    check(g, 'RAD toggles its label', $('[data-angles]').textContent, 'RAD');
    check(g, 'RAD is the pressed one', $('[data-mode="rad"]').getAttribute('aria-pressed'), 'true');
    clickAttr('data-mode="deg"');

    clear();
    clickIns('2');
    clickIns('+');
    clickIns('3');
    solve();
    return settle().then(function () {
      check(g, '"=" solves', shown(), '5');
    });
  }

  /* ---- 2. engine transcript --------------------------------------------- */

  function transcript() {
    var g = 'transcript';

    function solveIt(src, mode) {
      var r = Engine.solve(src, { mode: mode || 'deg', ans: 7 });
      return { value: r.value, text: r.text, steps: (r.steps || []).map(function (s) { return s.m; }) };
    }

    var a = solveIt('2 + 3 × 4');
    check(g, '2 + 3 × 4 value', a.value, 14);
    check(g, '2 + 3 × 4 steps', JSON.stringify(a.steps), JSON.stringify(['3 × 4 = 12', '2 + 12 = 14']));

    check(g, 'sin(30) in DEG', solveIt('sin(30)', 'deg').value, 0.5);
    check(g, 'sin(π/6) in RAD', solveIt('sin(π/6)', 'rad').value, 0.5);
    check(g, '(1 + 2)! / 3', solveIt('(1 + 2)! / 3').value, 2);
    check(g, '2 ^ 3 ^ 2 is right-associative', solveIt('2 ^ 3 ^ 2').value, 512);
    check(g, 'sqrt(16)^2', solveIt('sqrt(16)^2').value, 16);
    check(g, 'log(100) × π', solveIt('log(100) × π').text, '6.283185307');

    /* the error table: each is a Kitsu line, and never a number that cannot exist */
    var errs = [
      ['(', 'unclosed'],
      ['1/0', 'div0'],
      ['sqrt(-1)', 'negsqrt'],
      ['tan(90)', 'tan90']
    ];
    errs.forEach(function (e) {
      var code = null;
      var line = null;
      try {
        Engine.solve(e[0], { mode: 'deg', ans: 0 });
        check(g, e[0] + ' raises ' + e[1], 'no error thrown', e[1]);
      } catch (err) {
        code = Engine.isError(err) ? err.code : 'not-an-engine-error';
        line = Engine.line(code);
        check(g, e[0] + ' raises ' + e[1], code, e[1]);
        check(g, e[0] + ' gives Kitsu a line, not a raw value',
          (!!line && !isArtifact(line)), true);
      }
      void line;
    });
  }

  /* ---- 3. the result-state machine -------------------------------------- */

  function afterSolving(text, ans) {
    clear();
    type(text);
    solve();
    return settle().then(function () { return ans; });
  }

  function stateMachine() {
    var g = 'state machine';

    return afterSolving('2 + 3').then(function () {
      /* a digit starts a new expression */
      clickIns('9');
      check(g, 'after "=", a digit starts fresh', exprVal(), '9');

      /* an operator continues from the answer */
      return afterSolving('2 + 3');
    }).then(function () {
      clickIns('+');
      check(g, 'after "=", an operator continues with Ans', exprVal(), 'Ans+');
      clickIns('4');
      check(g, 'Ans + 4 is a real expression', exprVal(), 'Ans+4');
      solve();
      return settle();
    }).then(function () {
      check(g, 'Ans carries the previous answer', shown(), '9');

      /* the reported bug, exactly: hammer ANS after a fresh solve */
      return afterSolving('6 × 7');
    }).then(function () {
      var seq = [];
      for (var i = 0; i < 5; i++) { clickAttr('data-ans'); seq.push(exprVal()); }
      check(g, 'ANS × 5 after a solve stays valid', /ansans/.test(exprVal()) ? 'INVALID' : 'valid', 'valid');
      check(g, 'ANS × 5 leaves exactly one Ans', exprVal(), 'Ans');
      check(g, 'the press sequence was', JSON.stringify(seq), JSON.stringify(['Ans', 'Ans', 'Ans', 'Ans', 'Ans']));

      /* Ans only where an operand is expected */
      clear();
      clickAttr('data-ans');
      check(g, 'Ans goes into an empty input', exprVal(), 'Ans');

      clear();
      clickIns('2');
      clickAttr('data-ans');
      check(g, 'Ans is refused after a digit', exprVal(), '2');

      clear();
      clickIns('(');
      clickAttr('data-ans');
      check(g, 'Ans is allowed after (', exprVal(), '(Ans');

      clear();
      clickIns('2');
      clickIns('+');
      clickAttr('data-ans');
      check(g, 'Ans is allowed after an operator', exprVal(), '2+Ans');

      clear();
      clickIns('2');
      clickIns('√(');
      clickIns(')');
      clickAttr('data-ans');
      check(g, 'Ans is refused after a closed group', exprVal(), '2√()');

      /* every case must still be something the engine can read */
      clear();
      for (var j = 0; j < 6; j++) { clickIns('1'); clickAttr('data-ans'); clickIns('+'); }
      check(g, 'hammered input has no doubled Ans', /ansans/i.test(exprVal()), false);

      /* the tape replaces, it never appends */
      return afterSolving('3 + 4');
    }).then(function () {
      type('99');
      var entry = $('#tape .tape__btn');
      check(g, 'the tape kept the solved entry', !!entry, true);
      entry.click();
      check(g, 'a tape tap replaces the input', exprVal(), '3+4');
      check(g, 'a tape tap did not append to what was there', exprVal().indexOf('99') >= 0, false);
    });
  }

  /* ---- 4. keyboard map --------------------------------------------------- */

  function keyboard() {
    var g = 'keyboard';

    clear();
    pressKey('7');
    check(g, 'digit 7', exprVal(), '7');
    pressKey('*');
    check(g, '* becomes the multiplication sign', exprVal(), '7×');
    pressKey('-');
    check(g, '- becomes the minus sign', exprVal(), '7×−');
    pressKey('/');
    check(g, '/ becomes the division sign', exprVal(), '7×−÷');
    pressKey('^');
    check(g, '^ stays ^', exprVal(), '7×−÷^');
    pressKey('!');
    check(g, '! inserts factorial', exprVal(), '7×−÷^!');
    pressKey('(');   check(g, '( inserts a bracket', exprVal(), '7×−÷^!(');
    pressKey(')');   check(g, ') inserts a bracket', exprVal(), '7×−÷^!()');
    pressKey('.');   check(g, '. inserts a point', exprVal(), '7×−÷^!().');

    pressKey('Backspace');
    check(g, 'Backspace deletes one character', exprVal(), '7×−÷^!()');

    clear();
    pressKey('2');
    pressKey('+');
    pressKey('3');
    pressKey('Enter');
    return settle().then(function () {
      check(g, 'Enter solves', shown(), '5');

      /* Esc is layered: it answers to the topmost overlay first, exactly as it
         does for a pointer user, so the sheet goes before the calculator does */
      check(g, 'the solve left the steps sheet open', drawerOpen(), 'true');
      pressKey('Escape');
      check(g, 'Escape closes the steps sheet first', drawerOpen(), 'false');
      check(g, 'Escape left the solved expression alone', exprVal(), '2+3');

      pressKey('Escape');
      check(g, 'a second Escape clears the input', exprVal(), '');
      check(g, 'Escape resets the display', shown(), 'Kitsu is waiting');
    });
  }

  /* ---- 5. the 2nd layer ---------------------------------------------------
     A layer that only changed the label would be a lie: every key here is
     checked twice, once for the label it wears and once for the token it
     actually types. */

  function secondLayer() {
    var g = '2nd layer';

    check(g, 'the pad starts on the first layer', layer(), 'false');
    check(g, 'the display says so', layerFlag(), '1st');
    check(g, 'the 2nd key is not pressed', $('[data-2nd-key]').getAttribute('aria-pressed'), 'false');
    check(g, 'sin wears its first label', labelOf('data-ins', 'sin('), 'sin');

    var altKeys = $$('.key--alt');

    /* every key that claims a second meaning really has one, in the markup */
    altKeys.forEach(function (btn) {
      var attr = btn.getAttribute('data-ins') ? 'data-ins' : 'data-append';
      check(g, 'a key carries both meanings', !!btn.getAttribute(attr + '-2nd'), true);
    });

    clickAttr('data-2nd-key');
    check(g, '2nd switches the pad', layer(), 'true');
    check(g, 'the display says so', layerFlag(), '2nd');
    check(g, 'the 2nd key is pressed', $('[data-2nd-key]').getAttribute('aria-pressed'), 'true');

    altKeys.forEach(function (btn) {
      var name = btn.getAttribute('data-l1');
      var attr = btn.getAttribute('data-ins') ? 'data-ins' : 'data-append';
      check(g, name + ' wears its second label', btn.textContent, btn.getAttribute('data-l2'));

      clear();
      btn.click();
      check(g, name + ' types its second meaning', exprVal(), btn.getAttribute(attr + '-2nd'));

      clear();
      btn.click();
      check(g, name + ' is idempotent on the second layer', exprVal(), btn.getAttribute(attr + '-2nd'));
    });

    /* the pressed state has to be seen, not merely declared in the markup.
       The keys carry a background transition, so a colour is only ever read
       after that transition has landed — reading it on the tick that set the
       attribute would only prove the colour it was leaving. */
    var probe = $('.key--alt');
    var plain = $('[data-ins="7"]');

    /* the layer is a state, so it survives the keypad being turned away */
    clickAttr('data-pad-toggle');
    clickAttr('data-pad-toggle');
    check(g, 'the layer survives a page flip', layer(), 'true');

    clickAttr('data-2nd-key');
    return tick(260).then(function () {
      var rest = getComputedStyle(probe).backgroundColor;
      var ordinary = getComputedStyle(plain).backgroundColor;

      check(g, '2nd switches back', layer(), 'false');
      check(g, 'the display says so', layerFlag(), '1st');
      check(g, 'the 2nd key is released', $('[data-2nd-key]').getAttribute('aria-pressed'), 'false');

      altKeys.forEach(function (btn) {
        var name = btn.getAttribute('data-l1');
        var attr = btn.getAttribute('data-ins') ? 'data-ins' : 'data-append';
        check(g, name + ' wears its first label again', btn.textContent, name);
        clear();
        btn.click();
        check(g, name + ' types its first meaning again', exprVal(), btn.getAttribute(attr));
      });

      clickAttr('data-2nd-key');
      return tick(260).then(function () {
        var held = getComputedStyle(probe).backgroundColor;
        check(g, 'a shifted key is a different colour when held', held !== rest, true);
        check(g, 'and an ordinary key never takes that colour', ordinary !== held, true);
        check(g, 'the display tag lights up with them',
          getComputedStyle($('[data-layer]')).backgroundColor === held, true);
        clickAttr('data-2nd-key');
      });
    });
  }

  /* ---- 6. quick operations ---------------------------------------------- */

  function quickOps() {
    var g = 'quick ops';

    /* the calculator opens on Exact, so the first answer says so; the rest of
       the group reads in DEC, because these rows are about what the keys do */
    return solveKeys('4', '^-1').then(function (got) {
      check(g, '1/x of 4 is exact by default', got, '1/4');
      clickEq('data-exact', 'off');
      return settle();
    }).then(function () {
      check(g, 'and one tap away is the decimal', shown(), '0.25');
      return solveKeys('7', '^2');
    }).then(function (got) {
      check(g, 'x² of 7', got, '49');

      clear();
      clickAttr('data-2nd-key');
      keys('7');
      clickEq('data-append', '^2');
      check(g, 'the 2nd layer squares into a cube', exprVal(), '7^3');
      solve();
      return settle().then(function () {
        check(g, 'x³ of 7', shown(), '343');
        clickAttr('data-2nd-key');
        return solveKeys('200', '+', '10', '%');
      });
    }).then(function (got) {
      check(g, '200 + 10 %', got, '220');
      return solveKeys('200', '−', '10', '%');
    }).then(function (got) {
      check(g, '200 − 10 %', got, '180');
      return solveKeys('10', '%', '×', '2');
    }).then(function (got) {
      check(g, '10 % × 2 is a plain hundredth', got, '0.2');
      return solveKeys('5', '×10^', '3');
    }).then(function (got) {
      check(g, '5 ×10^ 3', got, '5000');
      return solveKeys('1.5', '×10^', '−', '4');
    }).then(function (got) {
      check(g, '1.5 ×10^ −4 is scientific entry', got, '0.00015');

      /* after "=" these are operators, so they continue from the answer */
      clear();
      keys('8');
      solve();
      return settle().then(function () {
        clickEq('data-ins', '×10^');
        check(g, '×10^ continues from the answer', exprVal(), 'Ans×10^');
        clear();
        keys('8');
        solve();
        return settle().then(function () {
          clickEq('data-append', '%');
          check(g, '% continues from the answer', exprVal(), 'Ans%');
          return solveKeys('50', '×', '2', '%');
        });
      });
    }).then(function (got) {
      check(g, '50 × 2 % is a plain hundredth', got, '1');
      return solveKeys('9', '−', '5', '%');
    }).then(function (got) {
      check(g, '9 − 5 % is a slice of the 9', got, '8.55');
      return solveKeys('9', '+', '5', '%');
    }).then(function (got) {
      check(g, '9 + 5 % is a slice of the 9', got, '9.45');
      /* hand the next group the face a visitor actually gets */
      clickEq('data-exact', 'on');
      check(g, 'Exact is the pressed one again', $('[data-exact="on"]').getAttribute('aria-pressed'), 'true');
    });
  }

  /* ---- 7. memory --------------------------------------------------------- */

  function memory() {
    var g = 'memory';

    /* MR is a decision, like ANS: refused means the box did not change */
    function refusedRecall() {
      clear();
      keys('1');
      clickAttr('data-mem-rec');
      return exprVal() === '1';
    }

    function recallNow() { clear(); clickAttr('data-mem-rec'); return exprVal(); }

    check(g, 'memory starts empty', memLit(), false);

    clear();
    keys('1');
    clickAttr('data-mem-rec');
    check(g, 'MR on an empty memory types nothing', exprVal(), '1');

    return solveKeys('6', '×', '7').then(function (got) {
      check(g, '6 × 7 first', got, '42');
      clickAttr('data-mem-add');
      check(g, 'M+ keeps the answer', memLit(), true);
      check(g, 'M+ leaves the expression alone', exprVal(), '6×7');

      check(g, 'MR into an empty input recalls the number', recallNow(), '42');
      solve();
      return settle().then(function () {
        check(g, 'the recalled number solves', shown(), '42');

        check(g, 'MR after a digit is refused', refusedRecall(), true);

        clear();
        keys('8', '+');
        clickAttr('data-mem-rec');
        check(g, 'MR after an operator is allowed', exprVal(), '8+42');
        solve();
        return settle().then(function () {
          check(g, 'and it adds up', shown(), '50');
          return solveKeys('5', '−', '0', '−', '4');
        });
      });
    }).then(function (got) {
      check(g, '5 − 0 − 4 first', got, '1');
      clickAttr('data-mem-sub');
      check(g, 'M− takes the answer back out', memLit(), true);
      check(g, 'MR gives the remainder', recallNow(), '41');
      return solveKeys('20', '×', '1');
    }).then(function () {
      clickAttr('data-mem-add');
      clickAttr('data-mem-add');
      check(g, 'M+ twice keeps both answers', recallNow(), '81');

      check(g, 'the memory keys show they are holding something',
        $('[data-mem-rec]').classList.contains('is-holding'), true);

      clear();
      clickAttr('data-mem-clr');
      check(g, 'MC empties it', memLit(), false);
      check(g, 'MC releases the keys',
        $('[data-mem-rec]').classList.contains('is-holding'), false);
      check(g, 'and nothing was typed on the way', exprVal(), '');

      /* MC is an action, not a keystroke: on an empty memory it says the
         press was ignored rather than quietly doing nothing */
      clear();
      keys('7', '+');
      clickAttr('data-mem-clr');
      check(g, 'MC on an empty memory flashes the edge',
        $('.display').classList.contains('is-refuse'), true);
      check(g, 'MC on an empty memory leaves the box alone', exprVal(), '7+');

      check(g, 'MR after a digit is refused', refusedRecall(), true);
      return solveKeys('3', '+', '4');
    }).then(function () {
      clickAttr('data-mem-add');
      check(g, '3 + 4 is in memory', memLit(), true);
      return solveKeys('9', '×', '9');
    }).then(function () {
      clickAttr('data-mem-rec');
      check(g, 'MR after "=" replaces the finished expression', exprVal(), '7');

      /* Ans is kept across a clear, and so is the answer M+ works from */
      clickAttr('data-mem-clr');
      clear();
      clickAttr('data-mem-add');
      check(g, 'M+ after a clear still keeps the last answer', memLit(), true);
      clickAttr('data-mem-clr');
    });
  }

  /* ---- 8. the display dials ---------------------------------------------- */

  function dials() {
    var g = 'display modes';

    check(g, 'the settings start closed', $('[data-settings]').getAttribute('data-open'), 'false');
    clickAttr('data-settings-toggle');
    check(g, 'the disclosure opens', $('[data-settings]').getAttribute('data-open'), 'true');
    check(g, 'and says it is open', $('[data-settings-toggle]').getAttribute('aria-expanded'), 'true');

    /* the two dials this group drives are the decimal ones, so the exact face
       is switched off here; the exact layer has a group of its own */
    clickEq('data-exact', 'off');
    check(g, 'DEC is one tap away', $('[data-exact="off"]').getAttribute('aria-pressed'), 'true');

    return solveKeys('2', '÷', '3').then(function (got) {
      check(g, 'auto decimals by default', got, '0.666666667');

      clickEq('data-fix', '3');
      check(g, 'FIX 3 rounds to three places', shown(), '0.667');
      check(g, 'FIX 3 is the pressed one', $('[data-fix="3"]').getAttribute('aria-pressed'), 'true');
      check(g, 'auto is released', $('[data-fix="auto"]').getAttribute('aria-pressed'), 'false');

      clear();
      keys('5', '÷', '2');
      check(g, 'FIX 3 applies before a solve too', shown(), '2.500');
      return solveKeys('5', '÷', '2');
    }).then(function (got) {
      check(g, 'FIX 3 solves to three places', got, '2.500');

      /* the tape records what the dial said at the moment of the solve */
      var tape = $('#tape .tape__val');
      check(g, 'the tape uses the same dial', tape ? tape.textContent : '', '= 2.500');

      clickEq('data-fix', '0');
      check(g, 'FIX 0 gives a whole number', shown(), '3');

      clickEq('data-fix', '9');
      check(g, 'FIX 9 gives nine', shown(), '2.500000000');

      /* a number plain notation cannot carry still falls back, FIX or not */
      return solveKeys('1', '×10^', '21');
    }).then(function (got) {
      check(g, 'too big to spell stays in powers of ten', got, '1e+21');

      clickEq('data-fix', 'auto');
      clickEq('data-sci', 'on');
      return solveKeys('2', '÷', '3');
    }).then(function (got) {
      check(g, 'Sci writes every answer as a power of ten', got, '6.666667e-1');
      check(g, 'Sci is the pressed one', $('[data-sci="on"]').getAttribute('aria-pressed'), 'true');

      clickEq('data-fix', '2');
      check(g, 'FIX then sets the mantissa digits', shown(), '6.67e-1');

      clickEq('data-sci', 'off');
      check(g, 'turning Sci off returns to plain', shown(), '0.67');
      clickEq('data-fix', 'auto');
      check(g, 'auto returns the house style', shown(), '0.666666667');

      /* nothing here may leave a dial pressed twice over */
      check(g, 'exactly one decimals dial and one Sci dial are pressed',
        $$('[data-fix][aria-pressed="true"]').length +
        $$('[data-sci][aria-pressed="true"]').length, 2);

      clickEq('data-exact', 'on');
      check(g, 'and the exact face is back where it started',
        $('[data-exact="on"]').getAttribute('aria-pressed'), 'true');

      clickAttr('data-settings-toggle');
      check(g, 'the disclosure closes again', $('[data-settings]').getAttribute('data-open'), 'false');
    });
  }

  /* ---- 9. the exact table -------------------------------------------------
     The display is only ever allowed to say "exact" about a value the engine
     could prove. Every row below is one the layer either proves or refuses,
     and a refused row is as important as a proved one: an approximation that
     dressed itself up as an exact answer would be the whole failure. */

  var EXACT_ROWS = [
    /* rationals, reduced */
    ['2/3 + 1/6', 'deg', '5/6'],
    ['1/2 + 1/3', 'deg', '5/6'],
    ['5/4 + 3/4', 'deg', '2'],
    ['1/3', 'deg', '1/3'],
    ['7/2', 'deg', '7/2'],
    /* a literal is the fraction it was written as */
    ['0.1', 'deg', '1/10'],
    ['1.5', 'deg', '3/2'],
    ['−0.25', 'deg', '−1/4'],
    /* roots, simplified and combined */
    ['√(12)', 'deg', '2√3'],
    ['√(8)', 'deg', '2√2'],
    ['√(18)', 'deg', '3√2'],
    ['√(27)', 'deg', '3√3'],
    ['√(2)', 'deg', '√2'],
    ['√(1/2)', 'deg', '√2/2'],
    ['√(1/3)', 'deg', '√3/3'],
    ['√2 × √3', 'deg', '√6'],
    ['√2 ÷ √3', 'deg', '√6/3'],
    ['√2 × √2', 'deg', '2'],
    /* the standard angles */
    ['sin(45)', 'deg', '√2/2'],
    ['cos(30)', 'deg', '√3/2'],
    ['tan(60)', 'deg', '√3'],
    ['cos(60)', 'deg', '1/2'],
    ['sin(90)', 'deg', '1'],
    ['sin(30)', 'deg', '1/2'],
    /* fifteen degrees is a sum of two roots, so it stays decimal */
    ['sin(15)', 'deg', ''],
    ['sin(45)', 'rad', ''],
    ['sin(30)', 'rad', ''],
    /* structural pi and e */
    ['2π', 'deg', '2π'],
    ['3π/4', 'deg', '3π/4'],
    ['π/6', 'deg', 'π/6'],
    ['2e', 'deg', '2e'],
    ['ln(e)', 'deg', '1'],
    ['log(10)', 'deg', '1'],
    ['ln(1)', 'deg', '0'],
    /* only the first power of pi is inside the bounds */
    ['π^2', 'deg', ''],
    /* a cube root is only exact when it lands */
    ['cbrt(27)', 'deg', '3'],
    ['cbrt(8)', 'deg', '2'],
    ['cbrt(2)', 'deg', ''],
    /* powers and factorials stay inside the family */
    ['2^10', 'deg', '1024'],
    ['(2/3)^2', 'deg', '4/9'],
    ['(2/3)^-2', 'deg', '9/4'],
    ['(2/3)^0', 'deg', '1'],
    ['5!', 'deg', '120'],
    ['2 + 3 × 4', 'deg', '14'],
    /* a percentage is a plain hundredth, except beside a + or a − where it is
       a slice of the number it sits beside — and the exact walk must read % the
       same way the decimal walk does */
    ['10 % × 2', 'deg', '1/5'],
    ['200 + 10 %', 'deg', '220'],
    ['200 − 10 %', 'deg', '180'],
    ['9 + 5 %', 'deg', '189/20'],
    ['9 − 5 %', 'deg', '171/20'],
    ['(10 %) × (200 + 10 %)', 'deg', '22'],
    /* the denominator bound, from both sides */
    ['1/10000', 'deg', '1/10000'],
    ['1/10001', 'deg', ''],
    ['1/3000', 'deg', '1/3000'],
    ['1/30000', 'deg', ''],
    ['0.333333333 + 0.333333333', 'deg', '']
  ];

  function exactDisplay() {
    var g = 'exact display';

    check(g, 'the denominator bound is 10000', Engine.EXACT_MAX_DEN, 10000);

    EXACT_ROWS.forEach(function (row) {
      var got = '';
      try {
        got = Engine.solve(row[0], { mode: row[1], exact: true, ans: 0 }).exact;
      } catch (e) {
        got = 'threw ' + (e.code || e.message);
      }
      check(g, row[0] + ' [' + row[1] + ']', got, row[2]);
    });

    /* nothing on the table may be a decimal wearing an exact label */
    var leaky = EXACT_ROWS.filter(function (row) {
      var got = Engine.solve(row[0], { mode: row[1], exact: true, ans: 0 }).exact;
      return /[.]/.test(got) || /e[+-]/i.test(got);
    });
    check(g, 'no exact answer carries a decimal point or an exponent',
      JSON.stringify(leaky.map(function (r) { return r[0]; })), '[]');

    /* and decimal mode must be untouched by any of it */
    check(g, 'decimal mode still shows the decimal',
      Engine.solve('2/3 + 1/6', { mode: 'deg' }).text, '0.833333333');
    check(g, 'decimal mode has no exact face',
      Engine.solve('2/3 + 1/6', { mode: 'deg' }).exact, '');
    check(g, 'decimal mode leaves the steps alone',
      JSON.stringify(Engine.solve('2 + 3 × 4', { mode: 'deg' }).steps.map(function (s) { return s.m; })),
      JSON.stringify(['3 × 4 = 12', '2 + 12 = 14']));
    check(g, 'an exact step carries its decimal too',
      Engine.solve('2/3 + 1/6', { mode: 'deg', exact: true }).steps[2].m,
      '0.666666667 + 0.166666667 = 5/6 = 0.833333333');

    /* the toggle itself, through the real display: exact is the face the
       calculator opens on, and DEC is one tap away */
    check(g, 'Exact starts on', $('[data-exact="on"]').getAttribute('aria-pressed'), 'true');
    check(g, 'Decimal starts off', $('[data-exact="off"]').getAttribute('aria-pressed'), 'false');

    return solveKeys('2', '÷', '3', '+', '1', '÷', '6').then(function (got) {
      check(g, 'exact display by default', got, '5/6');

      /* one tap each way, on a live answer that is already on screen */
      clickEq('data-exact', 'off');
      check(g, 'one tap to decimal', shown(), '0.833333333');
      clickEq('data-exact', 'on');
      check(g, 'one tap back to exact', shown(), '5/6');

      check(g, 'Exact is the pressed one', $('[data-exact="on"]').getAttribute('aria-pressed'), 'true');
      check(g, 'the live preview is exact', shown(), '5/6');

      solve();
      return settle().then(function () {
        check(g, 'the solved display is exact', shown(), '5/6');
        var tape = $('#tape .tape__val');
        check(g, 'the tape is exact too', tape ? tape.textContent : '', '= 5/6');
        check(g, 'the steps say both', steps().indexOf('0.666666667 + 0.166666667 = 5/6 = 0.833333333') >= 0, true);

        /* FIX cannot round an exact answer into something it is not */
        clickEq('data-fix', '3');
        check(g, 'FIX does not touch an exact answer', shown(), '5/6');
        clickEq('data-fix', 'auto');

        clickEq('data-exact', 'off');
        check(g, 'back to decimal', shown(), '0.833333333');

        /* a refused answer stays refused in both modes */
        clickEq('data-exact', 'on');
        return solveKeys('1', '÷', '30000');
      });
    }).then(function (got) {
      check(g, 'past the bound it is decimal again', got, '0.000033333');
      /* the suite hands the next group the face a visitor actually gets */
      clickEq('data-exact', 'on');
    });
  }

  /* ---- the hit-test sweep ------------------------------------------------

     THE BLINDNESS CURE. A .click() from script does not care what is painted
     on top: a covered button passes every programmatic test in this suite and
     stays dead to a thumb. So the suite now asks the page the only question a
     finger cares about — elementFromPoint(), the same lookup the browser uses
     to route a real pointer. Every interactive element, in every state where
     it is meant to be reachable, scrolled into view and probed at five points
     across its face (centre + the four edge midpoints, so a strip across the
     top of a button cannot hide). Anything other than the element itself or a
     descendant of it fails and names the thief: tag, class, z-index,
     pointer-events, text. A control whose computed pointer-events is none
     fails too — it can render all it likes, no finger can ever take it.
     Hidden and off-screen elements are COUNTED in the summary row, never
     silently dropped: silence is how the original bug survived. */

  var HIT_POINTS = [[0.5, 0.5], [0.5, 0.08], [0.5, 0.92], [0.08, 0.5], [0.92, 0.5]];
  var HIT_SELECTOR = 'a[href],button,[role="button"],input:not([type=hidden]),select,textarea,' +
    'summary,label,.tape__item,svg.fox';

  function hitName(el) {
    if (!el) return 'nothing';
    if (el.id) return '#' + el.id;
    var ins = el.getAttribute('data-ins');
    if (ins != null) return 'key[' + ins + ']';
    var cls = typeof el.className === 'string' ? el.className
            : (el.className && el.className.baseVal) || '';
    cls = cls.trim().split(/\s+/)[0];
    return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
  }

  function hitThief(el) {
    if (!el) return 'nothing (the point falls outside every element)';
    var s = getComputedStyle(el);
    var cls = typeof el.className === 'string' ? el.className
            : (el.className && el.className.baseVal) || '';
    var txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
      (cls ? '.' + cls.trim().split(/\s+/).join('.') : '') +
      (txt ? ' "' + txt + '"' : '') +
      ' [z:' + s.zIndex + ' pe:' + s.pointerEvents + ' pos:' + s.position + ']';
  }

  function sweep(root, tag, g) {
    var prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';   /* land instantly */

    var list = root.querySelectorAll(HIT_SELECTOR);
    var probed = 0, hidden = 0, dead = 0, stolen = 0;

    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') { hidden++; continue; }

      el.scrollIntoView({ block: 'center', inline: 'center' });
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.top < 0 || r.bottom > innerHeight) {
        hidden++;   /* not rendered, or cannot be brought on screen — counted */
        continue;
      }
      probed++;

      if (cs.pointerEvents === 'none') {
        dead++;   /* visible, but no finger can ever take it */
        check(g, 'hit [' + tag + '] ' + hitName(el) + ' is takeable (pointer-events)',
          'pointer-events:' + cs.pointerEvents, 'pointer-events:auto');
        continue;
      }

      /* the part of the control a finger can actually reach: its rect
         intersected with every clipping/scrolling ancestor. Content inside a
         horizontal scroller (the history tape) may hang past the clip — the
         clipped part is not dead, it is scrolled away, and the visible part
         must still take the tap. */
      var vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      for (var q2 = el.parentElement; q2; q2 = q2.parentElement) {
        var q2s = getComputedStyle(q2);
        if (q2s.overflow === 'visible' && q2s.overflowX === 'visible' && q2s.overflowY === 'visible') continue;
        var q2r = q2.getBoundingClientRect();
        vis.l = Math.max(vis.l, q2r.left);
        vis.t = Math.max(vis.t, q2r.top);
        vis.r = Math.min(vis.r, q2r.right);
        vis.b = Math.min(vis.b, q2r.bottom);
      }
      if (vis.r - vis.l < 4 || vis.b - vis.t < 4) {
        hidden++;   /* scrolled fully out of its clip — reachable by scrolling */
        continue;
      }

      /* the fox is painted paths in a transparent box: her edges are
         transparent by design, so she is probed where the handler lives */
      var pts = el.tagName.toLowerCase() === 'svg' ? HIT_POINTS.slice(0, 1) : HIT_POINTS;
      var got = null;
      for (var p = 0; p < pts.length; p++) {
        var x = vis.l + (vis.r - vis.l) * pts[p][0];
        var y = vis.t + (vis.b - vis.t) * pts[p][1];
        var hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) continue;
        got = hit;
        break;
      }
      if (got) {
        stolen++;
        /* name the clip that let the thief through: the first ancestor that
           actually cuts this control's box */
        var clipper = null;
        for (var q = el.parentElement; q; q = q.parentElement) {
          var qs = getComputedStyle(q);
          if (qs.overflow !== 'visible' || qs.overflowX !== 'visible' || qs.overflowY !== 'visible') {
            clipper = q;
            break;
          }
        }
        var clipInfo = '';
        if (clipper) {
          var qr = clipper.getBoundingClientRect();
          clipInfo = '; clipped by ' + hitName(clipper) + ' at ' +
            Math.round(qr.left) + ',' + Math.round(qr.top) + ' ' +
            Math.round(qr.width) + 'x' + Math.round(qr.height) +
            ' scroll ' + clipper.scrollLeft + '/' + clipper.scrollTop +
            ' content ' + clipper.scrollWidth + 'x' + clipper.scrollHeight;
        }
        /* the whole paint stack at the failing point: who is above whom */
        var stack = '';
        if (document.elementsFromPoint) {
          var fx = r.left + r.width * 0.5, fy = r.top + r.height * 0.5;
          stack = '; stack: ' + document.elementsFromPoint(fx, fy)
            .slice(0, 6).map(hitName).join(' < ');
        }
        check(g, 'hit [' + tag + '] ' + hitName(el) + ' takes its own tap',
          'thief: ' + hitThief(got) + ' (control at ' +
            Math.round(r.left) + ',' + Math.round(r.top) + ' ' +
            Math.round(r.width) + 'x' + Math.round(r.height) +
            ', scroll ' + Math.round(scrollY) + clipInfo + stack + ')', 'itself');
      }
    }

    check(g, 'hit-test sweep [' + tag + ']: ' + probed + ' probed, ' + hidden +
      ' hidden/off-screen, ' + dead + ' dead, ' + stolen + ' stolen',
      dead + stolen, 0);

    document.documentElement.style.scrollBehavior = prev;
  }

  /* One REAL coordinate click at page coordinates. When a harness drives the
     suite it provides window.__HAHA_HIT.mouse(x, y), which is CDP
     Input.dispatchMouseEvent — literally the input the OS produces. Without a
     harness the simulation is still honest: elementFromPoint() picks the
     target (the browser's own hit-test), so a covered control still cannot
     pass. Returns the element that received the click. */
  function realClick(x, y) {
    if (window.__HAHA_HIT && typeof window.__HAHA_HIT.mouse === 'function') {
      return Promise.resolve(window.__HAHA_HIT.mouse(x, y)).then(function () {
        return document.elementFromPoint(x, y);
      });
    }
    ['mousedown', 'mouseup', 'click'].forEach(function (type) {
      var target = document.elementFromPoint(x, y);   /* re-hit-test per event */
      if (target) target.dispatchEvent(new MouseEvent(type, {
        clientX: x, clientY: y, bubbles: true, cancelable: true, view: window
      }));
    });
    return Promise.resolve(document.elementFromPoint(x, y));
  }

  function realClickAt(el) {
    var prev = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    var r = el.getBoundingClientRect();
    return realClick(r.left + r.width / 2, r.top + r.height / 2).then(function (hit) {
      document.documentElement.style.scrollBehavior = prev;
      return hit;
    }, function (err) {
      document.documentElement.style.scrollBehavior = prev;
      throw err;
    });
  }

  /* ---- 10. UI invariants ------------------------------------------------- */

  function invariants() {
    var g = 'ui';

    var toggle = $('[data-settings-toggle]');
    var panel = $('[data-settings]');
    var drawerTab = $('[data-drawer]');
    var drawer = $('.drawer');
    var mic = $('[data-mic]');

    /* start from a known state: whatever an earlier group left open, shut */
    if (toggle && panel && panel.getAttribute('data-open') === 'true') toggle.click();
    if (drawerTab && drawerTab.getAttribute('aria-expanded') === 'true') drawerTab.click();

    return tick(450)   /* let the close transitions land: mid-transition an
                          element is neither open nor shut, and its
                          pointer-events and visibility disagree with each
                          other and with what a finger would find */
      .then(function () {
        /* state 1 — the page exactly as it ships */
        sweep(document, 'page, panels closed', g);

        /* state 2 — the second keypad page: its keys are display:none in state 1 */
        var fnKey = $('[data-pad-toggle]');
        if (fnKey) {
          fnKey.click();
          sweep(document, 'second keypad page', g);
          fnKey.click();
        }
      })

      /* state 3 — the display panel, opened by a REAL coordinate click */
      .then(function () {
        if (!toggle || !panel) return null;
        return realClickAt(toggle).then(function () {
          check(g, 'a real coordinate click on Display opens its panel',
            panel.getAttribute('data-open'), 'true');
          sweep($('.dock') || document, 'display panel open', g);
          toggle.click();   /* restore: the suite continues with it shut */
          check(g, 'the display panel shuts again', panel.getAttribute('data-open'), 'false');
        });
      })

      /* state 4 — the steps drawer, opened, swept while open, shut again */
      .then(function () {
        if (!drawerTab || !drawer) return null;
        if (drawerTab.getAttribute('aria-expanded') !== 'true') drawerTab.click();
        check(g, 'the steps drawer opens', drawerTab.getAttribute('aria-expanded'), 'true');
        return tick(450).then(function () {   /* the panel animates open */
          sweep(drawer, 'steps drawer open', g);
          drawerTab.click();
          check(g, 'the steps drawer shuts again', drawerTab.getAttribute('aria-expanded'), 'false');
        });
      })

      /* Talk to Kitsu with a real coordinate click: she listens, or the page
         says why she cannot — never a button that silently does nothing */
      .then(function () {
        if (!mic || mic.hidden) return null;
        return realClickAt(mic).then(function () { return tick(700); }).then(function () {
          var listening = mic.getAttribute('aria-pressed') === 'true';
          var toast = $('[data-toast]');
          var unsupported = mic.getAttribute('data-unsupported') === 'true';
          check(g, 'a real coordinate click on Talk to Kitsu listens or toasts a reason',
            !!(listening || toast || unsupported), true);
          if (toast) {
            check(g, 'the reason is on the page, not only in the console',
              toast.textContent.length > 0, true);
          }
        });
      })

      /* RAD with a real coordinate click — the visible result is the display */
      .then(function () {
        var rad = $('[data-mode="rad"]');
        if (!rad) return null;
        return realClickAt(rad).then(function () {
          check(g, 'a real coordinate click on RAD flips the display',
            $('[data-angles]').textContent, 'RAD');
          check(g, 'RAD is the pressed one after a real click',
            rad.getAttribute('aria-pressed'), 'true');
          $('[data-mode="deg"]').click();   /* restore for the rest of the suite */
          check(g, 'DEG is back for the rest of the suite',
            $('[data-angles]').textContent, 'DEG');
        });
      })

      /* the toast layer floats at z-index 40 over everything: a status, never
         a control — it must pass every tap straight through */
      .then(function () {
        var host = $('[data-toasts]');
        if (host) check(g, 'the toast layer passes taps through',
          getComputedStyle(host).pointerEvents, 'none');
      })

      .then(function () {
        return afterSolving('2 + 3 × 4');
      })
      .then(function () {
      check(g, 'Kitsu is happy after a solve', mood(), 'happy');
      check(g, 'the steps drawer lists the steps', JSON.stringify(steps()),
        JSON.stringify(['3 × 4 = 12', '2 + 12 = 14']));        check(g, 'the tape gained an entry', $$('#tape .tape__item').length > 0, true);
        sweep($('#tape') || document, 'history tape with entries', g);
      check(g, 'the answer is not a raw artifact', isArtifact(shown()), false);
      check(g, 'the steps carry no raw artifact',
        steps().filter(isArtifact).length, 0);
      check(g, 'the tape carries no raw artifact',
        $$('#tape .tape__val').filter(function (n) { return isArtifact(n.textContent); }).length, 0);

      clear();
      clickIns('1');
      clickIns('÷');
      clickIns('0');
      solve();
      return settle();
    }).then(function () {
      check(g, 'Kitsu is oops after an error', mood(), 'oops');
      check(g, 'the error reached the display as a line, not a value', isArtifact(shown()), false);
      check(g, 'the error line is prose, not a broken number', looksLikeAValue(shown()), false);
      check(g, 'the display does show something to the reader', shown().length > 0, true);
      check(g, 'the steps drawer clears for an error', $$('#steps .step').length, 0);
    });
  }

  /* ---- the console watch ------------------------------------------------- */

  /* Anything the page logs while the suite runs is a failure of the suite's
     own promise that "zero console errors" holds, so it is watched here. */
  function watchConsole(store) {
    var realError = console.error;
    var realWarn = console.warn;
    console.error = function () {
      store.push('console.error: ' + [].slice.call(arguments).join(' '));
      realError.apply(console, arguments);
    };
    console.warn = function () {
      store.push('console.warn: ' + [].slice.call(arguments).join(' '));
      realWarn.apply(console, arguments);
    };
    window.addEventListener('error', function (e) {
      store.push('window error: ' + (e.message || 'unknown'));
    });
    return function () { console.error = realError; console.warn = realWarn; };
  }

  /* ---- the runner -------------------------------------------------------- */

  function render(report) {
    var lines = [];
    var groups = [];
    report.forEach(function (r) {
      if (groups.indexOf(r.group) < 0) groups.push(r.group);
    });
    groups.forEach(function (name) {
      lines.push('');
      lines.push('── ' + name + ' ' + new Array(60 - name.length).join('─'));
      report.filter(function (r) { return r.group === name; }).forEach(function (r) {
        lines.push(
          (r.pass ? '  PASS  ' : '  FAIL  ') + r.name +
          (r.pass ? '' : '\n          expected: ' + JSON.stringify(r.expected) +
                     '\n          actual:   ' + JSON.stringify(r.actual))
        );
      });
    });

    var failed = report.filter(function (r) { return !r.pass; });
    lines.push('');
    lines.push('════════════════════════════════════════════════════════════');
    lines.push('  ' + (report.length - failed.length) + ' passed, ' + failed.length + ' failed, ' +
               report.length + ' total');
    lines.push('════════════════════════════════════════════════════════════');
    if (failed.length) {
      lines.push('');
      lines.push('FAILURES');
      failed.forEach(function (r) {
        lines.push('  · ' + r.name);
        lines.push('      expected: ' + JSON.stringify(r.expected));
        lines.push('      actual:   ' + JSON.stringify(r.actual));
      });
    }
    return lines.join('\n');
  }

  function run() {
    results = [];
    var logged = [];
    var restore = watchConsole(logged);

    if (!$('#expr')) {
      restore();
      return Promise.reject(new Error('selftest.js needs to run on calc.html'));
    }

    return sweepButtons()
      .then(transcript)
      .then(stateMachine)
      .then(keyboard)
      .then(secondLayer)
      .then(quickOps)
      .then(memory)
      .then(dials)
      .then(exactDisplay)
      .then(invariants)
      .then(function () {
        check('console', 'zero console errors across the whole run',
          logged.length === 0 ? 'clean' : JSON.stringify(logged), 'clean');
        restore();
        var report = results.slice();
        var text = render(report);
        if (window.console && console.log) console.log('\n' + text + '\n');
        return {
          total: report.length,
          passed: report.filter(function (r) { return r.pass; }).length,
          failed: report.filter(function (r) { return !r.pass; }).length,
          consoleErrors: logged,
          results: report,
          text: text
        };
      })
      .catch(function (err) {
        restore();
        var report = results.slice();
        var text = render(report.concat([{
          group: 'suite', name: 'the suite itself ran to the end', pass: false,
          actual: String(err && err.message || err), expected: 'no throw'
        }]));
        if (window.console && console.log) console.log('\n' + text + '\n');
        return { total: report.length + 1, passed: report.filter(function (r) { return r.pass; }).length,
          failed: report.length + 1 - report.filter(function (r) { return r.pass; }).length,
          consoleErrors: logged, results: report, error: String(err && err.message || err), text: text };
      });
  }

  window.HAHA = {
    test: run,
    get results() { return results.slice(); }
  };

  if (window.console && console.log) {
    console.log('selftest loaded — run HAHA.test()');
  }
})();
