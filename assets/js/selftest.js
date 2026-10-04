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
      else clickIns(ch);
    }
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

  /* ---- 5. UI invariants -------------------------------------------------- */

  function invariants() {
    var g = 'ui';

    return afterSolving('2 + 3 × 4').then(function () {
      check(g, 'Kitsu is happy after a solve', mood(), 'happy');
      check(g, 'the steps drawer lists the steps', JSON.stringify(steps()),
        JSON.stringify(['3 × 4 = 12', '2 + 12 = 14']));
      check(g, 'the tape gained an entry', $$('#tape .tape__item').length > 0, true);
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
