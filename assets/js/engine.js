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
    ln: 1, log: 1, sqrt: 1, cbrt: 1, abs: 1,
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

  /* a number may carry an exponent: 1e-15 is one literal, not 1 × e − 15.
     The exponent has to carry its own digits, so 2e still means 2 × e. */
  var NUM = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/;
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
      if (c === '%') { out.push({ t: '%', v: '%', s: c, i: i++ }); continue; }
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
      for (;;) {
        if (at('!')) { next(); node = { type: 'fact', arg: node }; continue; }
        if (at('%')) { next(); node = { type: 'pct', arg: node }; continue; }
        break;
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
    /* no snapping here: a literal that is genuinely tiny is a real answer,
       and quiet() is applied only where float noise actually arises */
    /* 15 significant digits is where a double stops lying about itself */
    var r = Number(v.toPrecision(15));
    return r === 0 ? 0 : r;
  }/* display rounding is separate from internal precision */
  var SHOW = 12;
  var WIDE = 1e15;      /* past this plain notation stops being readable */
  var THIN = 1e-6;      /* under this the zeros are more answer than digits */

  function exponent(t, digits) {
    return t.toExponential(digits).replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
  }

  /* Two optional dials, both absent by default, so a caller that asks for
     nothing gets exactly the house style it has always had:
       fix  0..9    that many decimal places, always, rounded
       sci  true    every answer in powers of ten; FIX then decides how many
                    digits sit in the mantissa                                  */
  function format(v, opts) {
    var o = opts || {};
    var fix = typeof o.fix === 'number' ? o.fix : null;
    var t = tidy(v);
    var a = Math.abs(t);

    if (o.sci) return t === 0 ? '0' : exponent(t, fix === null ? SHOW - 6 : fix);

    /* too big or too small for plain notation, whatever else was asked for */
    if (a !== 0 && (a >= WIDE || a < THIN)) return exponent(t, SHOW - 6);

    if (fix !== null) return t.toFixed(fix);

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
      case 'pct': s = render(node.arg, PREC.fact) + ' %'; break;
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
  /* sin(180) in DEG is -1.22e-16 of float noise, not a number. Only the
     transcendental functions make that kind of noise, so only they are quieted. */
  function quiet(v) { return Math.abs(v) < SNAP ? 0 : v; }

  function radToDeg(v) { return v * 180 / Math.PI; }function applyFn(name, xs, mode) {
      var x = xs[0];
      switch (name) {
        case 'abs': return Math.abs(x);
        case 'sqrt': if (x < 0) throw { code: 'negsqrt' }; return Math.sqrt(x);
        /* a cube root of a negative is a real number, so this one is not a domain error */
        case 'cbrt': return Math.cbrt(x);
        case 'ln': if (x <= 0) throw { code: 'domain' }; return quiet(Math.log(x));
        case 'log': if (x <= 0) throw { code: 'domain' }; return quiet(Math.log10(x));
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
      case 'sin': return quiet(Math.sin(mode === 'deg' ? degToRad(x) : x));
      case 'cos': return quiet(Math.cos(mode === 'deg' ? degToRad(x) : x));
      case 'tan': {
        var fold = mode === 'deg' ? ((x % 180) + 180) % 180 : ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        var half = mode === 'deg' ? 90 : Math.PI / 2;
        if (Math.abs(fold - half) < 1e-9 || Math.abs(fold - half * 3) < 1e-9) throw { code: 'tan90' };
        return quiet(Math.tan(mode === 'deg' ? degToRad(x) : x));
      }
      case 'asin': case 'acos': {
        if (x < -1 || x > 1) throw { code: 'domain' };
        var r = name === 'asin' ? Math.asin(x) : Math.acos(x);
        return quiet(mode === 'deg' ? radToDeg(r) : r);
      }
      case 'atan': {
        var a = Math.atan(x);
        return quiet(mode === 'deg' ? radToDeg(a) : a);
      }
      default: throw { code: 'unknown' };
    }
  }

/* ---- exact values ------------------------------------------------------
   Bounded on purpose. An answer is only called exact when it is provably one
   of three families, and anything outside them comes back null and is printed
   as a decimal. An approximation is never dressed up as an exact answer:
     a rational whose denominator is at most MAX_DEN
     a rational times the square root of a squarefree integer
     a rational times pi, or a rational times e
   A term is { a: {n, d}, s } where s is 1 for a plain rational, 'pi' or 'e',
   or the radicand of a root. */

var MAX_DEN = 10000;
var SQ = '\u221a';
var PI = '\u03c0';

function gcd(a, b) {
  while (b) { var t = b; b = a % b; a = t; }
  return Math.abs(a);
}

/* a reduced rational, or null if these two numbers cannot be one */
function rat(n, d) {
  if (!isFinite(n) || !isFinite(d) || d === 0) return null;
  if (n % 1 !== 0 || d % 1 !== 0) return null;
  if (d < 0) { n = -n; d = -d; }
  var g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

/* the last gate before a term is allowed to claim to be exact */
function ex(a, s) {
  var f = rat(a.n, a.d);
  if (!f || f.d > MAX_DEN) return null;
  return { a: f, s: s === undefined ? 1 : s };
}

/* k squared times s, with s squarefree — the only factoring needed here */
function sqf(k) {
  var out = 1;
  var top = Math.sqrt(k);
  for (var i = 2; i <= top; i++) {
    while (k % (i * i) === 0) { k /= i * i; out *= i; }
  }
  return { k: out, s: k };
}

/* a typed literal is exactly the fraction it was written as, if the fraction
   is small enough to be worth saying. 0.1 is 1/10; 1e-7 is nothing at all. */
function fromNumber(v) {
  if (!isFinite(v)) return null;
  if (v % 1 === 0) return ex({ n: v, d: 1 }, 1);
  var m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(v));
  if (!m) return null;
  var den = Math.pow(10, (m[3] || '').length);
  var num = parseInt((m[2] || '') + (m[3] || ''), 10);
  return ex({ n: m[1] ? -num : num, d: den }, 1);
}

function ipow(k, n) {
  if (n < 0 || n > 12) return NaN;
  var r = 1;
  for (var i = 0; i < n; i++) r *= k;
  return r;
}

/* sqrt(n/d) is sqrt(n*d)/d, which is inside the bounds whenever n*d is */
function exSqrt(x) {
  if (!x || x.s !== 1 || x.a.n < 0) return null;
  if (x.a.n === 0) return ex({ n: 0, d: 1 }, 1);
  var t = sqf(x.a.n * x.a.d);
  return ex({ n: t.k, d: x.a.d }, t.s);
}

function exAdd(x, y, sign) {
  if (!x || !y || x.s !== y.s) return null;
  return ex({ n: x.a.n * y.a.d + sign * y.a.n * x.a.d, d: x.a.d * y.a.d }, x.s);
}

function exMul(x, y) {
  if (!x || !y) return null;
  if (y.s === 1) return ex({ n: x.a.n * y.a.n, d: x.a.d * y.a.d }, x.s);
  if (x.s === 1) return ex({ n: x.a.n * y.a.n, d: x.a.d * y.a.d }, y.s);
  /* two roots: the radicands multiply, and what squares out moves into the
     coefficient, so sqrt(2) * sqrt(2) is 2 and not sqrt(4) */
  var t = sqf(x.s * y.s);
  return ex({ n: x.a.n * y.a.n * t.k, d: x.a.d * y.a.d }, t.s);
}

function exDiv(x, y) {
  if (!x || !y || y.a.n === 0) return null;
  if (y.s === 1) return ex({ n: x.a.n * y.a.d, d: x.a.d * y.a.n }, x.s);
  if (x.s === 1) return null;              /* 1 / sqrt(2) is outside the bounds */
  /* sqrt(r)/sqrt(s) is sqrt(r*s)/s */
  var t = sqf(x.s * y.s);
  return ex({ n: x.a.n * y.a.d * t.k, d: x.a.d * y.a.n * y.s }, t.s);
}

function exPow(base, exp) {
  if (!base || !exp || exp.s !== 1) return null;
  var n = exp.a.n;
  var d = exp.a.d;

  if (d === 1) {
    if (n < 0) {
      base = { a: { n: base.a.d, d: base.a.n }, s: base.s };
      n = -n;
    }
    /* pi and e only survive their own first power */
    if (base.s !== 1 && n !== 1) return null;
    return ex({ n: ipow(base.a.n, n), d: ipow(base.a.d, n) }, base.s);
  }
  if (d === 2 && n === 1) return base.s === 1 ? exSqrt(base) : null;
  return null;
}

/* the standard angles, and only those: a 15-degree cosine is a sum of two
   roots and would be outside the bounds, so it simply stays decimal */
var COS = {
  0: [1, 1], 30: [1, 2, 3], 45: [1, 2, 2], 60: [1, 2], 90: [0, 1],
  120: [-1, 2], 135: [-1, 2, 2], 150: [-1, 2, 3], 180: [-1, 1],
  225: [-1, 2, 2], 240: [-1, 2], 270: [0, 1], 300: [1, 2], 315: [1, 2, 2], 330: [1, 2, 3]
};

var TAN = {
  0: [0, 1], 45: [1, 1], 60: [1, 1, 3], 120: [-1, 1, 3], 135: [-1, 1],
  180: [0, 1], 225: [1, 1], 240: [1, 1, 3], 300: [-1, 1, 3], 315: [-1, 1]
};

function exactAngle(name, node, o) {
  if (o.mode !== 'deg') return null;
  var x = exact(node, o);
  if (!x || x.s !== 1 || x.a.d !== 1) return null;
  var deg = ((x.a.n % 360) + 360) % 360;
  var row = name === 'tan' ? TAN[deg] : (name === 'cos' ? COS[deg] : COS[((90 - deg) % 360 + 360) % 360]);
  return row ? ex({ n: row[0], d: row[1] }, row.length > 2 ? row[2] : 1) : null;
}

function exOne() { return ex({ n: 1, d: 1 }, 1); }

function exactFn(node, o) {
  var name = node.name;
  var args = node.args || [node.arg];
  var x = args.length === 1 ? exact(args[0], o) : null;

  if (name === 'sqrt') return x && exSqrt(x);
  if (name === 'abs') return x && ex({ n: Math.abs(x.a.n), d: x.a.d }, x.s);
  if (name === 'cbrt') {
    if (!x || x.s !== 1 || x.a.n < 0) return null;
    var n = Math.round(Math.cbrt(x.a.n));
    var d = Math.round(Math.cbrt(x.a.d));
    return n * n * n === x.a.n && d * d * d === x.a.d ? ex({ n: n, d: d }, 1) : null;
  }
  if (name === 'ln') {
    if (x && x.s === 'e' && x.a.n === 1 && x.a.d === 1) return exOne();
    return x && x.s === 1 && x.a.n === x.a.d ? ex({ n: 0, d: 1 }, 1) : null;
  }
  if (name === 'log') {
    if (x && x.s === 1 && x.a.n === 10 && x.a.d === 1) return exOne();
    return x && x.s === 1 && x.a.n === x.a.d ? ex({ n: 0, d: 1 }, 1) : null;
  }
  if (name === 'sin' || name === 'cos' || name === 'tan') return exactAngle(name, args[0], o);
  return null;
}

/* the walk, again, for the value nobody can see in decimal */
function exact(node, o) {
  switch (node.type) {
    case 'num': return fromNumber(node.value);
    case 'const':
      if (node.name === 'pi') return ex({ n: 1, d: 1 }, 'pi');
      if (node.name === 'e') return ex({ n: 1, d: 1 }, 'e');
      return o.ansX || null;
    case 'group': return exact(node.arg, o);
    case 'neg': {
      var g = exact(node.arg, o);
      return g && ex({ n: -g.a.n, d: g.a.d }, g.s);
    }
    case 'pct': {
      var p = exact(node.arg, o);
      return p && ex({ n: p.a.n, d: p.a.d * 100 }, p.s);
    }
    case 'fact': {
      var f = exact(node.arg, o);
      if (!f || f.s !== 1 || f.a.d !== 1 || f.a.n < 0 || f.a.n > 20) return null;
      return ex({ n: factorial(f.a.n), d: 1 }, 1);
    }
    case 'pow': return exPow(exact(node.l, o), exact(node.r, o));
    case 'add': return exAdd(exact(node.l, o), exact(node.r, o), 1);
    case 'sub': return exAdd(exact(node.l, o), exact(node.r, o), -1);
    case 'mul': return exMul(exact(node.l, o), exact(node.r, o));
    case 'div': return exDiv(exact(node.l, o), exact(node.r, o));
    case 'fn': return exactFn(node, o);
    default: return null;
  }
}

/* a node is parsed fresh every solve, so its exact value is remembered on it
   and never computed twice */
function exactOf(node, o) {
  if (node._x === undefined) node._x = exact(node, o);
  return node._x;
}function exactText(x) {
    var n = x.a.n;
    var d = x.a.d;
    /* the house minus, never the one a terminal prints */
    var sign = n < 0 ? '\u2212' : '';
    var mag = Math.abs(n);
    var body;

    if (x.s === 'pi' || x.s === 'e') {
      var sym = x.s === 'pi' ? PI : 'e';
      body = sign + (mag === 1 ? '' : mag) + sym;
      return d === 1 ? body : body + '/' + d;
    }

    if (x.s === 1) {
      body = sign + mag;
      return d === 1 ? body : body + '/' + d;
    }

    body = sign + (mag === 1 ? SQ + x.s : mag + SQ + x.s);
    return d === 1 ? body : body + '/' + d;
  }

/* In exact mode a rung of the ladder carries both faces of the answer: the
   exact one, and what it is worth in decimal, so Kitsu can say either. */
function rung(v, x, o) {
  var dec = format(v);
  if (!o.exact || !x) return dec;
  var exT = exactText(x);
  return exT === dec ? exT : exT + ' = ' + dec;
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
    var xo = { mode: mode, ansX: o.ansX || null };

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
          note('0 \u2212 ' + render(node.arg, 0) + ' = ' + rung(v, exactOf(node, xo), o), NOTE.neg);
          return v;
        }

        /* percent is a hundredth, and says so by itself. The parent decides
           whether it means a plain fraction or a slice of the thing beside
           it — that is the one place % is not simply /100. */
        case 'pct':
          return walk(node.arg) / 100;

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
          note(format(whole) + '! = ' + chain + rung(f, exactOf(node, xo), o), NOTE.fact);
          return f;
        }

        case 'pow': {
          var base = walk(node.l);
          var exp = walk(node.r);
          var pw = tidy(Math.pow(base, exp));
          note(render(node.l, 0) + ' ^ ' + render(node.r, 0) + ' = ' + rung(pw, exactOf(node, xo), o), NOTE.pow);
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
          note(shown + ' = ' + rung(out, exactOf(node, xo), o), trig ? NOTE[mode] : undefined);
          return out;
        }

        case 'add': case 'sub': case 'mul': case 'div': {
          var l = walk(node.l);
          var r = walk(node.r);
          var res;

          /* 200 + 10 % is 220, because a percentage is taken of what is beside
             it. Every other parent reads % as the plain hundredth it is. */
          var slice = node.r.type === 'pct' && (node.type === 'add' || node.type === 'sub');

          if (node.type === 'add') res = slice ? l + l * r : l + r;
          else if (node.type === 'sub') res = slice ? l - l * r : l - r;
          else if (node.type === 'mul') res = l * r;
          else {
            if (r === 0) throw { code: 'div0' };
            res = l / r;
          }res = tidy(res);

          /* a climbed operand shows its value, so 2 + 3 * 4 reads "2 + 12 = 14" */
          note(operandText(node.l, l) + ' ' + sym(node.type === 'add' ? '+' : node.type === 'sub' ? '-' : node.type === 'mul' ? '*' : '/')
            + ' ' + operandText(node.r, r) + ' = ' + rung(res, exactOf(node, xo), o),
            NOTE[node.implicit ? 'implicit' : node.type]);
          return res;
        }

        default:
          throw { code: 'unknown' };
      }
    }

    var value = walk(ast);
    var x = exactOf(ast, xo);

    return {
      value: value,
      text: format(value),
      /* empty in decimal mode, so the controller can ask for whichever face
         the dial asked for without knowing anything about exact values */
      exact: x && o.exact ? exactText(x) : '',
      x: x,
      steps: state.steps,
      mode: mode
    };
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
    EXACT_MAX_DEN: MAX_DEN,
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