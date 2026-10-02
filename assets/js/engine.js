/* engine.js — normalizeInput -> tokenize -> parse -> evaluate. A plain
   recursive-descent parser that narrates itself. No dependencies, no globals
   beyond window.Engine; runs identically under file://, a host or node. */

(function () {
  'use strict';

  var GLYPH = { '*': '\u00d7', '/': '\u00f7', '-': '\u2212' };

  /* every failure the engine can produce, and the one line Kitsu says for it.
     Never blame the user — blame the brackets. */
  var LINES = {
    unclosed: 'A bracket went missing. I counted twice.',
    div0: 'Division by zero. Even I can\u2019t outrun that one.',
    negsqrt: 'Square root of a negative? Not on the real number line, friend.',
    tan90: 'tan(90 degrees) runs off to infinity \u2014 undefined.',
    domain: 'That leaves the real number line, so I stopped there.',
    fact: 'I can only count whole numbers, and only up to 170 of them.',
    unknown: 'I don\u2019t know that one. Try sin, cos, tan, ln, log, sqrt, abs, pi, e or ans.'
  };

  var FUNCS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
    ln: 1, log: 1, sqrt: 1, abs: 1
  };
  var CONSTS = { pi: 1, e: 1, ans: 1 };

  var NOTE = {
    add: 'adding is the loosest rung on the ladder',
    sub: 'subtracting walks back down the ladder',
    mul: 'multiplication binds before \u2212 and +',
    div: 'the left side is divided by the right side',
    implicit: 'two things side by side mean multiply',
    pow: 'powers climb from the right: 2 ^ 3 ^ 4 is 2 ^ (3 ^ 4)',
    neg: 'the minus sign sits below the power rung',
    fact: 'factorial binds tightest of all',
    deg: 'angles are in degrees because the switch says DEG',
    rad: 'angles are in radians because the switch says RAD'
  };

  var SNAP = 1e-12;
  var PREC = { addsub: 1, mul: 2, neg: 3, pow: 4, fact: 5, group: 6 };

  /* an operator's glyph in a narration line: + stays, the rest wear maths */
  function sym(op) { return GLYPH[op] || op; }

  /* --- 1. normalizeInput -------------------- */

  var FOLD = [
    [/[\u2013\u2014\u2212]/g, '-'],
    [/[\u00d7\u22c5\u00b7\u2219\u2715\u00d7]/g, '*'],
    [/\u00f7/g, '/'],
    [/\u00b2/g, '^2'],
    [/\u00b3/g, '^3'],
    [/\u221a/g, 'sqrt'],
    [/\u03c0/g, 'pi']
  ];

  function normalizeInput(src) {
    var s = String(src == null ? '' : src);
    s = s.replace(/[\u00a0\u2007\u202f]/g, ' ');
    for (var i = 0; i < FOLD.length; i++) s = s.replace(FOLD[i][0], FOLD[i][1]);
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /* --- 2. tokenize ---------------------------- */

  var NUM = /^(?:\d+\.?\d*|\.\d+)/;
  var WORD = /^[a-z]+/;

  function tokenize(src) {
    var s = normalizeInput(src);
    var out = [];
    var i = 0;

    while (i < s.length) {
      var c = s[i];

      if (c === ' ') { i++; continue; }

      if (/[0-9.]/.test(c)) {
        var num = NUM.exec(s.slice(i));
        if (!num) throw { code: 'unknown' };
        out.push({ t: 'num', v: parseFloat(num[0]), s: num[0], i: i });
        i += num[0].length;
        continue;
      }

      if (/[a-z]/.test(c)) {
        var w = WORD.exec(s.slice(i))[0];
        out.push({
          t: FUNCS[w] ? 'fn' : (CONSTS[w] ? 'const' : 'word'),
          v: w,
          s: w,
          i: i
        });
        i += w.length;
        continue;
      }

      if (c === '(') { out.push({ t: '(', v: '(', s: c, i: i++ }); continue; }
      if (c === ')') { out.push({ t: ')', v: ')', s: c, i: i++ }); continue; }
      if (c === ',') { out.push({ t: ',', v: ',', s: c, i: i++ }); continue; }
      if (c === '!') { out.push({ t: '!', v: '!', s: c, i: i++ }); continue; }
      if ('+-*/^'.indexOf(c) !== -1) { out.push({ t: 'op', v: c, s: c, i: i++ }); continue; }

      throw { code: 'unknown' };
    }

    return out;
  }

  /* --- 3. parse: recursive descent.
   loosest to tightest: + -  <  * /  <  implicit x  <  unary -  <  ^  <  !  <  atom */

  function parse(tokens) {
    var p = 0;

    function peek() { return tokens[p] || null; }
    function next() { return tokens[p++] || null; }

    function at(t, v) {
      var k = peek();
      return !!k && k.t === t && (v === undefined || k.v === v);
    }

    function atom() {
      var k = next();
      if (!k) throw { code: 'unclosed' };

      if (k.t === 'num') return { type: 'num', value: k.v, raw: k.s };

      if (k.t === 'const') return { type: 'const', name: k.v };

      if (k.t === 'fn') {
        if (at('(')) {
          next();
          var arg = addsub();
          if (!at(')')) throw { code: 'unclosed' };
          next();
          return { type: 'fn', name: k.v, arg: arg };
        }
        /* \u221a9 and sin30 are the same thought, so brackets are optional here */
        return { type: 'fn', name: k.v, arg: postfix() };
      }

      if (k.t === '(') {
        var inner = addsub();
        if (!at(')')) throw { code: 'unclosed' };
        next();
        return { type: 'group', arg: inner };
      }

      throw { code: 'unknown' };
    }

    function postfix() {
      var node = atom();
      while (at('!')) {
        next();
        node = { type: 'fact', arg: node };
      }
      return node;
    }

    function power() {
      var left = postfix();
      if (at('op', '^')) {
        next();
        /* right-associative, and the exponent may itself be signed */
        return { type: 'pow', l: left, r: unary() };
      }
      return left;
    }

    function unary() {
      if (at('op', '-')) { next(); return { type: 'neg', arg: unary() }; }
      if (at('op', '+')) { next(); return unary(); }
      return power();
    }

    function startsAtom(k) {
      return !!k && (k.t === 'num' || k.t === 'const' || k.t === 'fn' || k.t === '(');
    }

    function implicit() {
      var node = unary();
      while (startsAtom(peek())) {
        node = { type: 'mul', l: node, r: unary(), implicit: true };
      }
      return node;
    }

    function muldiv() {
      var node = implicit();
      while (at('op', '*') || at('op', '/')) {
        var op = next().v;
        node = { type: op === '*' ? 'mul' : 'div', l: node, r: implicit() };
      }
      return node;
    }

    function addsub() {
      var node = muldiv();
      while (at('op', '+') || at('op', '-')) {
        var op = next().v;
        node = { type: op === '+' ? 'add' : 'sub', l: node, r: muldiv() };
      }
      return node;
    }

    if (!tokens.length) throw { code: 'unknown' };

    var ast = addsub();
    if (p < tokens.length) throw { code: 'unknown' };
    return ast;
  }

  /* --- 4. evaluate: post-order; every rung leaves a step ------- */

  function tidy(v) {
    if (!isFinite(v)) throw { code: 'domain' };
    if (Math.abs(v) < SNAP) return 0;
    /* 15 significant digits is where a double stops lying about itself */
    var r = Number(v.toPrecision(15));
    return r === 0 ? 0 : r;
  }

  /* display rounding is separate from internal precision */
  var SHOW = 12;

  function format(v) {
    var t = tidy(v);
    var a = Math.abs(t);
    if (a === 0) return '0';
    if (a >= 1e15 || a < 1e-6) return t.toExponential(SHOW - 6).replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
    return String(Number(t.toPrecision(SHOW)));
  }

  function render(node, parent) {
    var p = parent || 0;
    var s;

    switch (node.type) {
      case 'num': s = node.raw; break;
      case 'const': s = node.name; break;
      case 'group': return '(' + render(node.arg, 0) + ')';
      case 'neg': s = '-' + render(node.arg, PREC.neg); break;
      case 'fact': s = render(node.arg, PREC.fact) + ' !'; break;
      case 'pow': s = render(node.l, PREC.fact + 0.5) + ' ^ '
        + render(node.r, node.r.type === 'neg' ? PREC.neg : PREC.pow + 0.5); break;
      case 'fn': s = node.name + '(' + render(node.arg, 0) + ')'; break;
      case 'add': s = render(node.l, PREC.addsub + 1) + ' + ' + render(node.r, PREC.addsub + 1); break;
      case 'sub': s = render(node.l, PREC.addsub + 1) + ' \u2212 ' + render(node.r, PREC.addsub + 1); break;
      case 'mul': s = render(node.l, PREC.mul + 1) + ' \u00d7 ' + render(node.r, PREC.mul + 1); break;
      case 'div': s = render(node.l, PREC.mul + 1) + ' \u00f7 ' + render(node.r, PREC.mul + 1); break;
      default: s = '?';
    }

    return PREC[node.type] < p ? '(' + s + ')' : s;
  }

  function factorial(n) {
    if (!isFinite(n) || Math.abs(n - Math.round(n)) > 1e-9 || n < 0 || n > 170) throw { code: 'fact' };
    var r = 1;
    for (var i = 2; i <= n; i++) r *= i;
    return r;
  }

  function degToRad(v) { return v * Math.PI / 180; }
  function radToDeg(v) { return v * 180 / Math.PI; }

  function applyFn(name, x, mode) {
    switch (name) {
      case 'abs': return Math.abs(x);
      case 'sqrt': if (x < 0) throw { code: 'negsqrt' }; return Math.sqrt(x);
      case 'ln': if (x <= 0) throw { code: 'domain' }; return Math.log(x);
      case 'log': if (x <= 0) throw { code: 'domain' }; return Math.log10(x);
      case 'sin': return Math.sin(mode === 'deg' ? degToRad(x) : x);
      case 'cos': return Math.cos(mode === 'deg' ? degToRad(x) : x);
      case 'tan': {
        var fold = mode === 'deg' ? ((x % 180) + 180) % 180 : ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        var half = mode === 'deg' ? 90 : Math.PI / 2;
        if (Math.abs(fold - half) < 1e-9 || Math.abs(fold - half * 3) < 1e-9) throw { code: 'tan90' };
        return Math.tan(mode === 'deg' ? degToRad(x) : x);
      }
      case 'asin': case 'acos': {
        if (x < -1 || x > 1) throw { code: 'domain' };
        var r = name === 'asin' ? Math.asin(x) : Math.acos(x);
        return mode === 'deg' ? radToDeg(r) : r;
      }
      case 'atan': {
        var a = Math.atan(x);
        return mode === 'deg' ? radToDeg(a) : a;
      }
      default: throw { code: 'unknown' };
    }
  }

  function evaluate(ast, opts) {
    var o = opts || {};
    var mode = o.mode === 'rad' ? 'rad' : 'deg';
    var state = { ans: typeof o.ans === 'number' ? o.ans : 0, steps: [] };

    function note(m, n) {
      state.steps.push(n ? { m: m, n: n } : { m: m });
    }

    function walk(node) {
      switch (node.type) {
        case 'num':
          return node.value;

        case 'const':
          if (node.name === 'pi') return Math.PI;
          if (node.name === 'e') return Math.E;
          return state.ans;

        case 'group':
          return walk(node.arg);

        case 'neg': {
          var v = tidy(-walk(node.arg));
          note('0 \u2212 ' + render(node.arg, 0) + ' = ' + format(v), NOTE.neg);
          return v;
        }

        case 'fact': {
          var a = walk(node.arg);
          var f = tidy(factorial(a));
          note(render(node.arg, 0) + ' ! = ' + format(f), NOTE.fact);
          return f;
        }

        case 'pow': {
          var base = walk(node.l);
          var exp = walk(node.r);
          var pw = tidy(Math.pow(base, exp));
          note(render(node.l, 0) + ' ^ ' + render(node.r, 0) + ' = ' + format(pw), NOTE.pow);
          return pw;
        }

        case 'fn': {
          var arg = walk(node.arg);
          var out = tidy(applyFn(node.name, arg, mode));
          var trig = node.name === 'sin' || node.name === 'cos' || node.name === 'tan';
          note(node.name + '(' + render(node.arg, 0) + ') = ' + format(out),
            trig ? NOTE[mode] : undefined);
          return out;
        }

        case 'add': case 'sub': case 'mul': case 'div': {
          var l = walk(node.l);
          var r = walk(node.r);
          var res;

          if (node.type === 'add') res = l + r;
          else if (node.type === 'sub') res = l - r;
          else if (node.type === 'mul') res = l * r;
          else {
            if (r === 0) throw { code: 'div0' };
            res = l / r;
          }

          res = tidy(res);
          note(render(node.l, 0) + ' ' + sym(node.type === 'add' ? '+' : node.type === 'sub' ? '-' : node.type === 'mul' ? '*' : '/')
            + ' ' + render(node.r, 0) + ' = ' + format(res),
            NOTE[node.implicit ? 'implicit' : node.type]);
          return res;
        }

        default:
          throw { code: 'unknown' };
      }
    }

    var value = walk(ast);
    return { value: value, text: format(value), steps: state.steps, mode: mode };
  }

  /* --- public surface ------------------------ */

  function solve(input, opts) {
    var tokens = tokenize(input);
    var ast = parse(tokens);
    var res = evaluate(ast, opts);
    res.tokens = tokens;
    res.ast = ast;
    res.normalized = normalizeInput(input);
    return res;
  }

  var Engine = {
    LINES: LINES,
    FUNCS: FUNCS,
    CONSTS: CONSTS,
    normalizeInput: normalizeInput,
    tokenize: tokenize,
    parse: parse,
    evaluate: evaluate,
    solve: solve,
    render: render,
    format: format,
    tidy: tidy,
    isError: function (e) { return !!e && typeof e === 'object' && typeof e.code === 'string'; },
    line: function (code) { return LINES[code] || LINES.unknown; }
  };

  if (typeof window !== 'undefined') window.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})();