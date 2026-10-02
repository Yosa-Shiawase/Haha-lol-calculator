/* engine.js — normalizeInput -> tokenize -> parse -> evaluate. A recursive-descent
   parser that narrates itself. No dependencies; runs under file:// or node. */

(function () {
  'use strict';

  var GLYPH = { '*': '\u00d7', '/': '\u00f7', '-': '\u2212' };

  /* every failure the engine can produce, and the one line Kitsu says for it */
  var LINES = {
    unclosed: 'A bracket went missing. I counted twice.',
    div0: 'Division by zero. Even I can\u2019t outrun that one.',
    negsqrt: 'Square root of a negative? Not on the real number line, friend.',
    tan90: 'tan(90 degrees) runs off to infinity \u2014 undefined.',
    domain: 'That leaves the real number line, so I stopped there.',
    fact: 'I can only count whole numbers, and only up to 170 of them.',
    unknown: 'I don\u2019t know that one. The About page lists everything I understand.'
  };

  var FUNCS = {
    sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
    ln: 1, log: 1, sqrt: 1, abs: 1,
    mod: 2, gcd: 2, lcm: 2, ncr: 2, npr: 2, hypot: 2,
    round: 1, floor: 1, ceil: 1, sign: 1, det: 9
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
    deg: 'in degrees \u2014 flip the toggle for radians',
    rad: 'in radians \u2014 flip the toggle for degrees'
  };

  var SNAP = 1e-12;
  var PREC = { addsub: 1, mul: 2, neg: 3, pow: 4, fact: 5, group: 6 };

  /* a narration line's glyph: + stays, the rest wear maths */
  function sym(op) { return GLYPH[op] || op; }

  /* normalizeInput */

  var FOLD = [
    [/[\u2013\u2014\u2212]/g, '-'],
    [/[\u00d7\u22c5\u00b7\u2219\u2715\u00d7]/g, '*'],
    [/\u00f7/g, '/'],
    [/\u00b2/g, '^2'],
    [/\u00b3/g, '^3'],[/\u221a/g, 'sqrt'],
      [/\u00b0/g, ''],
      [/\u03c0/g, 'pi']
  ];

  function normalizeInput(src) {
    var s = String(src == null ? '' : src);
    s = s.replace(/[\u00a0\u2007\u202f]/g, ' ');
    for (var i = 0; i < FOLD.length; i++) s = s.replace(FOLD[i][0], FOLD[i][1]);
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /* tokenize */

  var NUM = /^(?:\d+\.?\d*|\.\d+)/;
  var WORD = /^[a-zA-Z]+/;
  /* typed either way, but always shown in the house style */
  var CANON = { ncr: 'nCr', npr: 'nPr' };

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
      }if (/[a-z]/i.test(c)) {
          var w = WORD.exec(s.slice(i))[0];
          var wl = w.toLowerCase();
          out.push({
            t: FUNCS[wl] ? 'fn' : (CONSTS[wl] ? 'const' : 'word'),
            v: CANON[wl] || wl,
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

  /* parse: recursive descent,
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
          /* commas separate arguments, so det(1,2,3,4) parses */
          var args = [addsub()];
          while (at(',')) { next(); args.push(addsub()); }
          if (!at(')')) throw { code: 'unclosed' };
          next();
          return { type: 'fn', name: k.v, args: args, arg: args[0] };
        }
        /* \u221a9 and sin30 are the same thought, so brackets are optional */
        return { type: 'fn', name: k.v, args: null, arg: postfix() };
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

  /* evaluate: post-order */

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
    if (a === 0) return '0';if (a >= 1e15 || a < 1e-6) return t.toExponential(SHOW - 6).replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
      /* whole numbers keep every digit; fractions stop at nine decimals */
      if (t % 1 === 0) return String(t);
      return String(Number(t.toFixed(9)));
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
      case 'fn': s = node.name + '(' + (node.args || [node.arg]).map(function (a) { return render(a, 0); }).join(', ') + ')'; break;
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
  function radToDeg(v) { return v * 180 / Math.PI; }function applyFn(name, xs, mode) {
      var x = xs[0];
      switch (name) {
        case 'abs': return Math.abs(x);
        case 'sqrt': if (x < 0) throw { code: 'negsqrt' }; return Math.sqrt(x);
        case 'ln': if (x <= 0) throw { code: 'domain' }; return Math.log(x);
        case 'log': if (x <= 0) throw { code: 'domain' }; return Math.log10(x);
        case 'round': {
          if (xs.length === 1) return Math.round(x);
          var places = xs[1];
          var scale = Math.pow(10, places);
          return tidy(Math.round(x * scale) / scale);
        }
        case 'floor': return Math.floor(x);
        case 'ceil': return Math.ceil(x);
        case 'sign': return x > 0 ? 1 : x < 0 ? -1 : 0;
        case 'mod': if (xs[1] === 0) throw { code: 'div0' }; return x - xs[1] * Math.floor(x / xs[1]);
        case 'hypot': return Math.sqrt(x * x + xs[1] * xs[1]);
        case 'gcd': {
          var ga = Math.abs(Math.round(x)); var gb = Math.abs(Math.round(xs[1]));
          while (gb) { var t = gb; gb = ga % gb; ga = t; }
          return ga;
        }
        case 'lcm': {
          if (Math.round(x) === 0 || Math.round(xs[1]) === 0) return 0;
          return Math.abs(Math.round(x) * Math.round(xs[1])) / applyFn('gcd', xs, mode);
        }
        case 'nCr': case 'nPr': {
          var n = Math.round(x); var r = Math.round(xs[1]);
          if (n < 0 || r < 0 || r > n) throw { code: 'domain' };
          var out = 1;
          for (var i = 0; i < r; i++) out = name === 'npr' ? out * (n - i) : out * (n - i) / (i + 1);
          return tidy(out);
        }
        case 'det': {
          if (xs.length === 4) return xs[0] * xs[3] - xs[1] * xs[2];
          if (xs.length !== 9) throw { code: 'domain' };
          var a = xs[0], b = xs[1], c = xs[2], d = xs[3], e = xs[4],
              f = xs[5], g = xs[6], h = xs[7], i2 = xs[8];
          return a * (e * i2 - f * h) - b * (d * i2 - f * g) + c * (d * h - e * g);
        }
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

  /* a compound operand shows its value; a literal keeps its own face */
  function operandText(node, v) {
    var binary = node.type === 'add' || node.type === 'sub' || node.type === 'mul'
      || node.type === 'div' || node.type === 'pow';
    return binary ? format(v) : render(node, 0);
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
          /* spell the product out when it is short enough to be worth reading */
          var whole = Math.round(a);
          var chain = '';
          if (whole >= 2 && whole <= 12) {
            var parts = [];
            for (var fi = whole; fi >= 1; fi--) parts.push(format(fi));
            chain = parts.join(' \u00d7 ') + ' = ';
          }
          note(format(whole) + '! = ' + chain + format(f), NOTE.fact);
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
          var nodes = node.args || [node.arg];
          var xs = [];
          for (var ai = 0; ai < nodes.length; ai++) xs.push(walk(nodes[ai]));
          var want = FUNCS[node.name];
          if (want === 1 && xs.length !== 1 && node.name !== 'round') throw { code: 'domain' };
          if (want === 2 && xs.length !== 2) throw { code: 'domain' };
          if (node.name === 'round' && xs.length !== 1 && xs.length !== 2) throw { code: 'domain' };
          if (node.name === 'det' && xs.length !== 4 && xs.length !== 9) throw { code: 'domain' };
          var out = tidy(applyFn(node.name, xs, mode));
          var trig = node.name === 'sin' || node.name === 'cos' || node.name === 'tan';
          var shown = node.name + '(' + nodes.map(function (a) { return render(a, 0); }).join(', ') + ')';
          note(shown + ' = ' + format(out), trig ? NOTE[mode] : undefined);
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
          }res = tidy(res);

          /* a climbed operand shows its value, so 2 + 3 * 4 reads "2 + 12 = 14" */
          note(operandText(node.l, l) + ' ' + sym(node.type === 'add' ? '+' : node.type === 'sub' ? '-' : node.type === 'mul' ? '*' : '/')
            + ' ' + operandText(node.r, r) + ' = ' + format(res),
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

  /* public surface */

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