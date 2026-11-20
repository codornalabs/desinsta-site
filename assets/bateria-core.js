/* Bateria: motor de animação. Puro: o estado avança em passos fixos (DT) e a cena é
   uma função do estado. A carga comanda rosto, braços, cor e líquido; ações e modos
   (rolar o feed, ficar longe da tela, cutucar) somam por cima. */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------ base
  const TAU = Math.PI * 2, RAD = Math.PI / 180, DT = 1 / 120;
  const INK = '#1B1530', MOUTH = '#2A1B3D', PINK = '#FF8FB8', GLASS = '#ECEAF3', SOLE = '#D9D6E3';
  const WHITE = '#FFFFFF', TONGUE = '#FF6F91', BAGS = '#7A6E99', YELLOW = '#FFD23F', SKY = '#8ED1FF';

  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t * t;
  const easeOutBack = (t) => { const k = 1.9; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); };
  const N = (x) => Math.round(x * 100) / 100;
  const approach = (x, t, d) => (x < t ? Math.min(t, x + d) : Math.max(t, x - d));

  function env(t, d, a, r) { // sobe em a, segura, desce em r; 0 fora de [0, d]
    if (t <= 0 || t >= d) return 0;
    if (t < a) return easeInOut(t / a);
    if (t > d - r) return easeInOut((d - t) / r);
    return 1;
  }
  function spr(o, target, f, z, dt) { // mola amortecida (euler semi-implícito)
    const w = TAU * f;
    o.v += (-w * w * (o.x - target) - 2 * z * w * o.v) * dt;
    o.x += o.v * dt;
  }
  const S = (x = 0) => ({ x, v: 0 });

  function kv(arr, u) { // interpola chaves (números, vetores ou objetos) por índice contínuo
    const n = arr.length - 1, uu = clamp(u, 0, n), i = Math.min(n - 1, Math.floor(uu)), f = uu - i;
    const a = arr[i], b = arr[i + 1];
    if (typeof a === 'number') return lerp(a, b, f);
    if (Array.isArray(a)) return a.map((x, k) => (Array.isArray(x) ? [lerp(x[0], b[k][0], f), lerp(x[1], b[k][1], f)] : lerp(x, b[k], f)));
    const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], f); return o;
  }
  const lerpArr = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));
  const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
  function rotP(p, c, deg) {
    const a = deg * RAD, co = Math.cos(a), si = Math.sin(a), dx = p[0] - c[0], dy = p[1] - c[1];
    return [c[0] + dx * co - dy * si, c[1] + dx * si + dy * co];
  }
  // posição contínua entre as 5 chaves (0, 25, 50, 75, 100%), com patamar em cada chave
  function shapedU(L, lo, hi) { const u = clamp(L) * 4, i = Math.min(3, Math.floor(u)); return i + sstep(lo, hi, u - i); }

  // ------------------------------------------------------------------ cor (OKLab)
  function hexToRgb(hx) { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const toSrgb = (c) => { c = clamp(c); return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255); };
  function rgbToOklab(rgb) {
    const r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
  }
  function oklabToHex(c) {
    const l = Math.pow(c[0] + 0.3963377774 * c[1] + 0.2158037573 * c[2], 3);
    const m = Math.pow(c[0] - 0.1055613458 * c[1] - 0.0638541728 * c[2], 3);
    const s = Math.pow(c[0] - 0.0894841775 * c[1] - 1.291485548 * c[2], 3);
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return '#' + [r, g, b].map((x) => toSrgb(x).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const LIQ = ['#F0544F', '#FF9F43', '#FFC53D', '#8BD450', '#3CCB7F'].map((x) => rgbToOklab(hexToRgb(x)));
  const LIQD = ['#C93A36', '#E57F22', '#E5A51E', '#6DB536', '#2BA866'].map((x) => rgbToOklab(hexToRgb(x)));
  const colCache = new Map();
  function liquidColor(L, dark) {
    const q = Math.round(clamp(L) * 400), key = q * 2 + (dark ? 1 : 0);
    let c = colCache.get(key);
    if (!c) { c = oklabToHex(kv(dark ? LIQD : LIQ, (q / 400) * 4)); colCache.set(key, c); }
    return c;
  }
  function mixWhite(hex, t) { const a = rgbToOklab(hexToRgb(hex)), w = rgbToOklab([255, 255, 255]); return oklabToHex(lerpArr(a, w, t)); }

  // ------------------------------------------------------------------ acaso determinístico
  function rnd(s) {
    let t = (s.seed = (s.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rr = (s, a, b) => a + (b - a) * rnd(s);

  // ------------------------------------------------------------------ nós virtuais
  function h(t, a) {
    const c = [];
    const add = (x) => { if (!x) return; if (Array.isArray(x)) x.forEach(add); else c.push(x); };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return { t, a: a || {}, c };
  }
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function toSVG(v) {
    let s = '<' + v.t;
    for (const k in v.a) s += ' ' + k + '="' + esc(v.a[k]) + '"';
    if (!v.c.length) return s + '/>';
    s += '>';
    for (const c of v.c) s += toSVG(c);
    return s + '</' + v.t + '>';
  }

  // ------------------------------------------------------------------ caminhos e matrizes
  const pt = (p) => N(p[0]) + ' ' + N(p[1]);
  function crSeg(pts) { // Catmull-Rom -> Bézier cúbica, sem o M inicial
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ' C ' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' +
        pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
    }
    return d;
  }
  const smoothD = (pts) => 'M ' + pt(pts[0]) + crSeg(pts);
  const Mx = {
    mul: (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]],
    tr: (x, y) => [1, 0, 0, 1, x, y],
    rot: (deg, cx, cy) => { const a = deg * RAD, c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; },
    sc: (sx, sy, cx, cy) => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy],
    ap: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    str: (m) => 'matrix(' + m.map((x) => Math.round(x * 10000) / 10000).join(' ') + ')',
  };

  // ------------------------------------------------------------------ traços
  const lineP = (d, w = 4, color = INK, extra) => h('path', Object.assign({ d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, extra));
  const shapeP = (d, fill, sw = 3, extra) => h('path', Object.assign({ d, fill, stroke: INK, 'stroke-width': sw, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, extra));
  function ellP(cx, cy, rx, ry, fill, sw = 3, rot = 0, extra) {
    const a = { cx: N(cx), cy: N(cy), rx: N(Math.max(0, rx)), ry: N(Math.max(0, ry)), fill };
    if (sw) { a.stroke = INK; a['stroke-width'] = sw; }
    if (rot) a.transform = 'rotate(' + N(rot) + ' ' + N(cx) + ' ' + N(cy) + ')';
    return h('ellipse', Object.assign(a, extra));
  }

  // Mãos: cada mão é UMA silhueta. As partes são desenhadas duas vezes: primeiro em tinta com
  // traço largo (vira o contorno de fora), depois em branco sem traço por cima. Assim não sobra
  // contorno interno entre palma, polegar e dedos; os detalhes de dentro são traços finos à mão.
  function union(parts, w) {
    const ink = [], fill = [];
    for (const e of parts) {
      const a = { cx: N(e[0]), cy: N(e[1]), rx: N(e[2]), ry: N(e[3]) };
      if (e[4]) a.transform = 'rotate(' + e[4] + ' ' + N(e[0]) + ' ' + N(e[1]) + ')';
      ink.push(h('ellipse', Object.assign({ fill: INK, stroke: INK, 'stroke-width': 2 * w }, a)));
      fill.push(h('ellipse', Object.assign({ fill: WHITE }, a)));
    }
    return ink.concat(fill);
  }
  const handG = (x, y, ang, mir) => ({ transform: 'translate(' + N(x) + ' ' + N(y) + ') rotate(' + N(ang + 90) + ') scale(' + mir + ' 1)' });
  // luva sem dedos (Fiel e Fofa): punho, palma + polegar numa silhueta só, dobra do polegar
  function mitten(x, y, ang, s, mir) {
    return h('g', handG(x, y, ang, mir),
      ellP(0, 4.4 * s, 6.2 * s, 3.2 * s, WHITE, 2.6),
      union([[0, -4.5 * s, 6.8 * s, 8.2 * s], [-6.3 * s, -1.5 * s, 2.6 * s, 4.4 * s, -32]], 3),
      lineP('M ' + N(-6.1 * s) + ' ' + N(-5.3 * s) + ' Q ' + N(-3.9 * s) + ' ' + N(-3.4 * s) + ' ' + N(-4.4 * s) + ' ' + N(0.6 * s), 1.7));
  }
  // luva de cartoon clássico: punho em sino, quatro dedos + polegar numa silhueta só,
  // vãos entre os dedos e três costuras finas nas costas da mão
  function glove4(x, y, ang, s, mir) {
    const P = (a, b) => N(a * s) + ' ' + N(b * s);
    return h('g', handG(x, y, ang, mir),
      shapeP('M ' + P(-6.4, 1.6) + ' L ' + P(6.4, 1.6) + ' L ' + P(8.6, 8.2) + ' Q ' + P(0, 9.8) + ' ' + P(-8.6, 8.2) + ' Z', WHITE, 2.4),
      union([[-6.5 * s, -13 * s, 2.7 * s, 5.2 * s, -14], [-2.2 * s, -15.5 * s, 2.7 * s, 5.2 * s, -4], [2.2 * s, -15.5 * s, 2.7 * s, 5.2 * s, 4], [6.5 * s, -13 * s, 2.7 * s, 5.2 * s, 14],
        [-9 * s, -3.5 * s, 2.7 * s, 4.8 * s, -40], [0, -5 * s, 7.4 * s, 7.2 * s]], 2.6),
      lineP('M ' + P(-4.3, -16.4) + ' L ' + P(-4, -12.2) + ' M ' + P(0, -18.4) + ' L ' + P(0, -13.2) + ' M ' + P(4.3, -16.4) + ' L ' + P(4, -12.2), 1.7),
      lineP('M ' + P(-6.6, -7.2) + ' Q ' + P(-5.2, -4.2) + ' ' + P(-6.3, -0.8), 1.6),
      lineP('M ' + P(-2.4, -8.6) + ' L ' + P(-2.4, -5) + ' M ' + P(0.2, -9) + ' L ' + P(0.2, -5) + ' M ' + P(2.8, -8.6) + ' L ' + P(2.8, -5), 1.1));
  }
  function sneaker(x, y, f, s) {
    const X = (d) => N(x + d * s * f), Y = (d) => N(y + d * s);
    return [
      shapeP('M ' + X(-14) + ' ' + Y(2) + ' C ' + X(-15) + ' ' + Y(-9) + ' ' + X(-4) + ' ' + Y(-11) + ' ' + X(4) + ' ' + Y(-8) + ' C ' + X(12) + ' ' + Y(-6) + ' ' + X(17) + ' ' + Y(-2) + ' ' + X(17) + ' ' + Y(2) + ' Z', WHITE, 3),
      shapeP('M ' + X(-15) + ' ' + Y(2) + ' L ' + X(18) + ' ' + Y(2) + ' Q ' + X(19) + ' ' + Y(7) + ' ' + X(14) + ' ' + Y(7) + ' L ' + X(-12) + ' ' + Y(7) + ' Q ' + X(-16) + ' ' + Y(7) + ' ' + X(-15) + ' ' + Y(2) + ' Z', SOLE, 2.6),
      lineP('M ' + X(-2) + ' ' + Y(-7) + ' L ' + X(4) + ' ' + Y(-4) + ' M ' + X(3) + ' ' + Y(-8) + ' L ' + X(9) + ' ' + Y(-5), 1.6),
    ];
  }
  function bigShoe(x, y, f, s) {
    const X = (d) => N(x + d * s * f), Y = (d) => N(y + d * s);
    return [
      shapeP('M ' + X(-10) + ' ' + Y(4) + ' C ' + X(-12) + ' ' + Y(-8) + ' ' + X(2) + ' ' + Y(-12) + ' ' + X(12) + ' ' + Y(-8) + ' C ' + X(22) + ' ' + Y(-4) + ' ' + X(24) + ' ' + Y(4) + ' ' + X(16) + ' ' + Y(6) + ' L ' + X(-6) + ' ' + Y(6) + ' Q ' + X(-11) + ' ' + Y(6) + ' ' + X(-10) + ' ' + Y(4) + ' Z', INK, 3),
      lineP('M ' + X(8) + ' ' + Y(-6) + ' Q ' + X(14) + ' ' + Y(-6) + ' ' + X(17) + ' ' + Y(-2), 2.4, WHITE),
    ];
  }
  const sparkleD = (s) => 'M 0 ' + N(-s) + ' Q 0 0 ' + N(s) + ' 0 Q 0 0 0 ' + N(s) + ' Q 0 0 ' + N(-s) + ' 0 Q 0 0 0 ' + N(-s) + ' Z';
  const BOLT_D = 'M 1 -24 L -13 2 L -1 2 L -9 24 L 13 -6 L 1 -6 Z';
  const DROP_D = 'M 0 -12 Q 9 2 0 7 Q -9 2 0 -12 Z';
  const HEART_D = 'M 0 4 C -7 -1 -5 -7.5 0 -4 C 5 -7.5 7 -1 0 4 Z';
  function plugBubble(wig) {
    const b = shapeP('M -22 -18 L 22 -18 Q 28 -18 28 -12 L 28 10 Q 28 16 22 16 L -6 16 L -14 25 L -13 16 L -22 16 Q -28 16 -28 10 L -28 -12 Q -28 -18 -22 -18 Z', WHITE, 2.6);
    const plug = h('g', { transform: 'rotate(' + N(wig) + ' 0 2)' },
      lineP('M -5 -11 L -5 -5 M 5 -11 L 5 -5', 3),
      shapeP('M -10 -5 L 10 -5 L 10 1 Q 10 8 0 8 Q -10 8 -10 1 Z', '#FF9F43', 2.4),
      lineP('M 0 8 L 0 12', 3));
    return [b, plug];
  }
  function alertBadge() {
    return [h('circle', { cx: 0, cy: 0, r: 15, fill: '#F0544F', stroke: INK, 'stroke-width': 3.5 }),
      h('rect', { x: -2.5, y: -11, width: 5, height: 14, rx: 2.5, fill: WHITE }),
      h('circle', { cx: 0, cy: 8.5, r: 2.8, fill: WHITE })];
  }
  const CARD_COLS = ['#FF8FB8', '#FFD23F', '#8ED1FF', '#9FE6BE', '#FFB37A'];
  function phoneShape(scroll, clipId, like) {
    const cards = [], off = ((scroll % 9) + 9) % 9, base = Math.floor(scroll / 9);
    const n = clipId ? 4 : 3;
    for (let i = 0; i < n; i++) {
      const y = -12.4 + i * 9 - (clipId ? off : 0), c = CARD_COLS[(((base + i) % 5) + 5) % 5];
      cards.push(h('rect', { x: -6, y: N(y), width: 12, height: 7, rx: 1.6, fill: c }));
      cards.push(h('rect', { x: -4.2, y: N(y + 4.4), width: 6.4, height: 1.3, rx: 0.65, fill: WHITE }));
    }
    const k = [h('rect', { x: -10, y: -17, width: 20, height: 34, rx: 4.5, fill: INK }),
      h('rect', { x: -7.6, y: -13.6, width: 15.2, height: 26.6, rx: 2.4, fill: '#E3F6FF' })];
    if (clipId) {
      k.push(h('clipPath', { id: clipId }, h('rect', { x: -7.6, y: -13.6, width: 15.2, height: 26.6, rx: 2.4 })));
      const lk = [];
      if (like >= 0 && like < 1) {
        const sc = like < 0.28 ? 0.95 * easeOutBack(like / 0.28) : 0.95 * (1 - easeIn((like - 0.28) / 0.72));
        lk.push(h('path', { d: HEART_D, fill: '#FF5C8A', stroke: INK, 'stroke-width': 1.6, 'stroke-linejoin': 'round', transform: 'translate(0 ' + N(1 - 4 * like) + ') scale(' + N(Math.max(0, sc)) + ')' }));
      }
      k.push(h('g', { 'clip-path': 'url(#' + clipId + ')' }, cards, lk));
    } else k.push(h('g', {}, cards));
    k.push(h('rect', { x: -2.6, y: -15.6, width: 5.2, height: 1.4, rx: 0.7, fill: '#4A4262' }));
    return k;
  }

  // ------------------------------------------------------------------ as três versões
  // braços: chaves para 0, 25, 50, 75 e 100% (braço esquerdo: ombro, controle, ponta)
  const V = {
    fiel: {
      label: 'Fiel', body: [70, 44, 100, 160, 22], cap: [102, 30, 36, 20],
      ground: 226, hips: [[100, 204], [140, 204]], ankles: [[100, 216], [140, 216]],
      feet: { kind: 'sneaker', at: [[94, 219], [146, 219]], s: 1 }, hand: 'mitten', handOff: 4, shadow: [120, 227, 54],
      arms: [[74, 132, 60, 154, 58, 178], [74, 128, 62, 146, 62, 166], [74, 124, 58, 136, 56, 156], [74, 124, 56, 128, 52, 146], [74, 122, 52, 116, 46, 92]],
      poses: { cheer: [74, 118, 58, 96, 58, 60], stretch: [74, 118, 50, 82, 58, 36], yawn: [74, 122, 50, 128, 38, 108], waveR: [166, 122, 194, 114, 198, 86], hold: [70, 128, 40, 204, 96, 172] },
      acc: { bolt: [207, 46], spark: [30, 46], spark2: [204, 52], drop: [178, 66], plug: [196, 50], alert: [198, 50], note: [52, 62] },
      eye: { style: 'dot', dx: 14, y: [112, 113, 110, 110, 112], lid: [0.5, 0.36, 0, 0, 0], rx: 5.5, ry: 5.5, lidW: 3.5, hlDY: [1.4, 1.4, -1.8, -1.8, -1.8] },
      closed: { hw: 8.5, w: 4.8, dy: 0 }, eyeModes: ['sleep', 'open', 'open', 'open', 'arc'], bags: [1, 0, 0, 0, 0],
      brow: { amt: [0, 1, 1, 0, 0], o: [[97, 104], [97, 101], [96, 100], [96, 100], [96, 100]], i: [[112, 100], [112, 97], [112, 95], [112, 95], [112, 95]], arch: [0, 0, 0, 0, 0], w: 3 },
      mouth: [{ my: 142, hw: 12, ct: -5, cb: -5, sw: 4.5, wob: 0 }, { my: 138, hw: 11, ct: -3, cb: -3, sw: 4.5, wob: 0 }, { my: 134, hw: 12, ct: 0, cb: 0, sw: 4.5, wob: 0 }, { my: 128, hw: 12, ct: 5, cb: 5, sw: 4.5, wob: 0 }, { my: 128, hw: 16, ct: 0, cb: 10, sw: 3.5, wob: 0 }],
      mouthScale: 1, openSW: 3.5, tongue: true, teeth: false,
      cheek: { dx: 26, y: [128, 128, 128, 124, 128], rx: [0, 0, 0, 6, 6.5], ry: [0, 0, 0, 6, 6.5], a: [0, 0, 0, 0.7, 0.8] },
    },
    fofa: {
      label: 'Fofa', body: [62, 66, 116, 132, 32], cap: [100, 52, 40, 20],
      ground: 222, hips: [[104, 198], [136, 198]], ankles: [[104, 208], [136, 208]],
      feet: { kind: 'sneaker', at: [[98, 213], [142, 213]], s: 1.25 }, hand: 'mitten', handOff: 4, shadow: [120, 224, 60],
      arms: [[66, 144, 52, 162, 52, 180], [66, 140, 56, 152, 56, 168], [66, 138, 52, 148, 51, 164], [66, 136, 50, 142, 48, 156], [66, 134, 48, 128, 44, 110]],
      poses: { cheer: [66, 130, 50, 108, 54, 82], stretch: [66, 128, 44, 100, 58, 58], yawn: [66, 136, 46, 138, 36, 116], waveR: [174, 134, 198, 124, 200, 96], hold: [62, 140, 32, 206, 96, 172] },
      acc: { bolt: [209, 60], spark: [30, 62], spark2: [206, 66], drop: [186, 88], plug: [198, 64], alert: [200, 64], note: [48, 78] },
      eye: { style: 'oval', dx: 16, y: [119, 118, 117, 116, 116], lid: [0.5, 0.45, 0, 0, 0], rx: 7.5, ry: 9.5, lidW: 3.2, hlDY: [2, 2, -2, -4, -4] },
      closed: { hw: 9, w: 4.6, dy: 1 }, eyeModes: ['sleep', 'open', 'open', 'open', 'open'], bags: [0, 0, 0, 0, 0],
      brow: null,
      mouth: [{ my: 140, hw: 7, ct: -3, cb: -3, sw: 3, wob: 0.6 }, { my: 138, hw: 7, ct: 0, cb: 0, sw: 3, wob: 1.5 }, { my: 136, hw: 6.5, ct: 0, cb: 0, sw: 3.2, wob: 0 }, { my: 133, hw: 8, ct: 3, cb: 3, sw: 3.2, wob: 0 }, { my: 132, hw: 8, ct: 0, cb: 5, sw: 3, wob: 0 }],
      mouthScale: 0.62, openSW: 3, tongue: false, teeth: false,
      cheek: { dx: 30, y: [136, 134, 134, 133, 132], rx: [6, 7, 7, 7.5, 8], ry: [4, 4.5, 4.5, 5, 5.5], a: [0.35, 0.5, 0.6, 0.75, 0.85] },
    },
    cartoon: {
      label: 'Cartoon clássico', body: [72, 42, 96, 162, 26], cap: [102, 28, 36, 20],
      ground: 224, hips: [[102, 204], [138, 204]], ankles: [[100, 214], [140, 214]],
      feet: { kind: 'big', at: [[92, 218], [148, 218]], s: 1 }, hand: 'glove4', handOff: 6, shadow: [120, 227, 58],
      arms: [[76, 130, 60, 156, 58, 180], [76, 126, 60, 148, 62, 170], [76, 124, 58, 138, 57, 160], [76, 122, 56, 130, 52, 148], [76, 120, 50, 118, 42, 88]],
      poses: { cheer: [76, 116, 58, 92, 60, 58], stretch: [76, 116, 52, 80, 60, 36], yawn: [76, 120, 52, 126, 40, 104], waveR: [164, 120, 192, 112, 198, 84], hold: [72, 126, 40, 208, 90, 178] },
      acc: { bolt: [216, 36], spark: [24, 40], spark2: [208, 48], drop: [176, 64], plug: [196, 48], alert: [198, 48], note: [52, 60] },
      eye: { style: 'pie', dx: 13, y: [106, 106, 106, 106, 106], lid: [0.5, 0.42, 0, 0, 0], rx: 6.5, ry: 11, lidW: 3.2, hlDY: [0, 0, 0, 0, 0] },
      closed: { hw: 8, w: 4.2, dy: 2 }, eyeModes: ['sleep', 'open', 'open', 'open', 'open'], bags: [0, 0, 0, 0, 0],
      brow: { amt: [1, 1, 1, 1, 1], o: [[99, 96], [99, 94], [99, 92], [99, 89], [99, 88]], i: [[113, 91], [113, 90], [113, 89], [114, 88], [114, 87]], arch: [0, 0, -1.5, -3, -4.5], w: 3.2 },
      mouth: [{ my: 138, hw: 13, ct: -5, cb: -5, sw: 4, wob: 0 }, { my: 134, hw: 12, ct: -3, cb: -3, sw: 4, wob: 0 }, { my: 132, hw: 12, ct: 0, cb: 0, sw: 4, wob: 0 }, { my: 128, hw: 16, ct: 7, cb: 7, sw: 4, wob: 0 }, { my: 126, hw: 21, ct: 0, cb: 13, sw: 3.2, wob: 0 }],
      mouthScale: 1.25, openSW: 3.2, tongue: true, teeth: true,
      cheek: { dx: 25, y: [122, 122, 122, 122, 122], rx: [0, 0, 0, 0, 0], ry: [0, 0, 0, 0, 0], a: [0, 0, 0, 0, 0] },
    },
  };
  const VARIANTS = ['fiel', 'fofa', 'cartoon'];

  // bocas de expressão (em tamanho da versão fiel; cada versão escala)
  const MO = {
    laugh: { hw: 15, ct: 0, cb: 11, wob: 0, round: 0, dmy: 0 },
    smile: { hw: 13, ct: 5, cb: 5, wob: 0, round: 0, dmy: 0 },
    o: { hw: 4.5, ct: -3.5, cb: 4.5, wob: 0, round: 1, dmy: 2 },
    yawn: { hw: 7, ct: -6, cb: 11, wob: 0, round: 1, dmy: 2 },
    glazed: { hw: 6, ct: -0.6, cb: 2.6, wob: 0, round: 0.7, dmy: 4 },
    content: { hw: 10, ct: 3.5, cb: 3.5, wob: 0, round: 0, dmy: 0 },
    effort: { hw: 9, ct: -1, cb: -1, wob: 1.1, round: 0, dmy: 0 },
    frown: { hw: 11, ct: -4.5, cb: -4.5, wob: 0, round: 0, dmy: 4 },
    wobbly: { hw: 9, ct: 0, cb: 0, wob: 1.7, round: 0, dmy: 2 },
  };
  // olho fechado: [curvatura, chevron, espiral]
  const CLOSED = { line: [-0.15, 0, 0], arc: [1, 0, 0], sleep: [-0.5, 0, 0], chev: [0, 1, 0], spiral: [0, 0, 1] };
  const MAJOR = { wave: 1, pump: 1, look: 1, sway: 1, worry: 1, yawn: 1, sigh: 1, shiver: 1, celebrate: 1, collapse: 1, stretch: 1, swap: 1, giggle: 1, eh: 1, groggy: 1, dizzy: 1 };
  const BAND_NAMES = ['Descarregou', 'Pedindo tomada', 'Na reserva', 'De boa', 'Carregadona'];

  // ------------------------------------------------------------------ geometria compartilhada
  function bodyMatrix(cfg, P) {
    const bb = cfg.body[1] + cfg.body[3];
    let m = Mx.sc(P.sx, P.sy, 120, bb);
    m = Mx.mul(Mx.rot(P.tilt, 120, cfg.ground), m);
    return Mx.mul(Mx.tr(P.shx, P.dy + P.jy), m);
  }
  function armGeom(cfg, P, side, m) {
    let k = kv(cfg.arms, P.ua);
    if (P.cheer > 0.001) k = lerpArr(k, cfg.poses.cheer, P.cheer);
    if (P.stretch > 0.001) k = lerpArr(k, cfg.poses.stretch, P.stretch);
    if (P.yawnArm > 0.001) k = lerpArr(k, cfg.poses.yawn, P.yawnArm);
    if (P.hold > 0.001) { const w = cfg.poses.hold, q = P.hold, qs = sstep(0, 0.35, q); k = [lerp(k[0], w[0], qs), lerp(k[1], w[1], qs), lerp(k[2], w[2], q), lerp(k[3], w[3], q), lerp(k[4], w[4], q), lerp(k[5], w[5], q)]; }
    let Sp = [k[0], k[1]], C = [k[2], k[3]], E = [k[4], k[5]];
    const drop = (P.pumpY + P.droop) * (1 - P.hold) * (1 - P.stretch);
    E = [E[0], E[1] + drop]; C = [C[0], C[1] + drop * 0.5];
    if (side > 0) {
      Sp = [240 - Sp[0], Sp[1]]; C = [240 - C[0], C[1]]; E = [240 - E[0], E[1]];
      if (P.wave > 0.001) {
        const w = cfg.poses.waveR;
        Sp = lerpP(Sp, [w[0], w[1]], P.wave); C = lerpP(C, [w[2], w[3]], P.wave); E = lerpP(E, [w[4], w[5]], P.wave);
        E = rotP(E, Sp, P.waveAng * P.wave); C = rotP(C, Sp, P.waveAng * P.wave * 0.5);
      }
    }
    const Sw = Mx.ap(m, Sp[0], Sp[1]), C0 = Mx.ap(m, C[0], C[1]), E0 = Mx.ap(m, E[0], E[1]);
    const off = side > 0 ? P.hr : P.hl;
    const Ew = [E0[0] + off.x, E0[1] + off.y], Cw = [C0[0] + off.x * 0.45, C0[1] + off.y * 0.45];
    const ang = Math.atan2(Ew[1] - Cw[1], Ew[0] - Cw[0]) / RAD;
    return { S: Sw, C: Cw, E: Ew, H: [Ew[0] + Math.cos(ang * RAD) * cfg.handOff, Ew[1] + Math.sin(ang * RAD) * cfg.handOff], ang };
  }
  // o celular fica entre as duas mãos, um pouco acima delas
  const phoneAt = (aL, aR) => [(aL.H[0] + aR.H[0]) / 2, (aL.H[1] + aR.H[1]) / 2 - 10];
  function phoneOrigins(s) {
    const o = {};
    for (const v of VARIANTS) { const cfg = V[v], m = bodyMatrix(cfg, s.pose); o[v] = phoneAt(armGeom(cfg, s.pose, -1, m), armGeom(cfg, s.pose, 1, m)); }
    return o;
  }

  // ------------------------------------------------------------------ simulação
  function eyeCtl(mode) {
    const e = { cur: 'open', open: 1, bend: -0.15, chev: 0, spiral: 0 };
    if (mode && mode !== 'open') { const c = CLOSED[mode]; e.cur = 'closed'; e.open = 0; e.bend = c[0]; e.chev = c[1]; e.spiral = c[2]; }
    return e;
  }
  function eyeStep(e, want, dt) {
    if (e.cur === 'open') {
      if (want !== 'open') {
        e.open -= dt / (want === 'sleep' ? 0.26 : 0.07);
        if (e.open <= 0) { e.open = 0; e.cur = 'closed'; e.bend = CLOSED.line[0]; e.chev = 0; e.spiral = 0; }
      } else e.open = Math.min(1, e.open + dt / 0.11);
    } else {
      const c = CLOSED[want === 'open' ? 'line' : want];
      e.bend = approach(e.bend, c[0], (want === 'sleep' ? 3.2 : 9.5) * dt);
      e.chev = approach(e.chev, c[1], 8.5 * dt);
      e.spiral = approach(e.spiral, c[2], 6.5 * dt);
      if (want === 'open' && Math.abs(e.bend - c[0]) < 0.01 && e.chev < 0.01 && e.spiral < 0.01) { e.cur = 'open'; e.open = 0; }
    }
  }

  function createSim(seed) {
    const s = {
      seed: (seed | 0) || 7, t: 0,
      charge: 1, level: S(1), band: 4,
      mode: 'idle', modeT0: 0, demo: true, reduced: false, variant: 'fiel',
      ss: S(1), cr: S(0), tiltS: S(0), cap: S(0), breathPh: 0,
      hl: { x: 0, y: 0, vx: 0, vy: 0 }, hr: { x: 0, y: 0, vx: 0, vy: 0 }, prevBY: 0, prevBX: 0,
      gx: S(0), gy: S(0), pointer: null,
      slosh: S(0), wamp: S(1), ph1: 0, ph2: 0, bubbles: [], pops: [], bubAcc: 0.5, stripes: S(0), stripePh: 0,
      hold: S(0), glazed: S(0), glow: S(0),
      phone: { vis: S(0), scroll: S(0), target: 0, nextFlick: 0, flickT0: -9, likeT0: -9 },
      acc: { bolt: S(1), spark: S(1), spark2: S(0), drop: S(0), plug: S(0), alert: S(0) }, boltKick: S(0), dropT0: 0,
      eyes: { fiel: eyeCtl('arc'), fofa: eyeCtl('open'), cartoon: eyeCtl('open') },
      blinkAt: 2.4, blinkT0: -9,
      acts: [], nextIdle: 0.9, firstIdle: true, parts: [], taps: [], queue: [], events: [], pose: null,
    };
    step(s, DT);
    return s;
  }
  const input = (s, ev) => { s.queue.push(ev); };
  const hasAct = (s, types) => s.acts.some((a) => (Array.isArray(types) ? types.includes(a.type) : a.type === types));
  const busy = (s) => s.acts.some((a) => MAJOR[a.type]);
  function addAct(s, type, dur, data) { const a = Object.assign({ type, t0: s.t, dur }, data); s.acts.push(a); return a; }
  const dropActs = (s, types) => { s.acts = s.acts.filter((a) => !types.includes(a.type)); };
  const IDLE_TYPES = ['wave', 'pump', 'look', 'sway', 'worry', 'yawn', 'sigh', 'shiver', 'stretch'];

  function startScroll(s) {
    if (s.mode === 'scroll') return;
    if (s.charge < 0.03) { dropActs(s, ['eh', 'giggle', 'groggy']); addAct(s, 'groggy', 1.1); s.events.push({ type: 'note', text: 'Sem carga nem para rolar o feed.' }); return; }
    if (s.mode === 'rest') endRest(s, 'user');
    dropActs(s, IDLE_TYPES);
    s.mode = 'scroll'; s.modeT0 = s.t; s.phone.nextFlick = s.t + 0.6;
    s.events.push({ type: 'mode' });
  }
  function endScroll(s, why) {
    if (s.mode !== 'scroll') return;
    s.mode = 'idle'; s.modeT0 = s.t; s.nextIdle = s.t + 3;
    if (s.phone.vis.x > 0.25) {
      const org = phoneOrigins(s), sc = s.phone.scroll.x;
      if (why === 'empty') s.parts.push({ k: 'phone', anchor: 'org', org, t0: s.t, life: 1.4, x: 0, y: 0, vx: 14, vy: -40, g: 760, rot: -14, vr: 110, s: 1, scroll: sc });
      else s.parts.push({ k: 'phone', anchor: 'org', org, t0: s.t, life: 1.2, x: 0, y: 0, vx: 270, vy: -130, g: 900, rot: 0, vr: 720, s: 1, scroll: sc });
    }
    s.phone.vis.x = 0; s.phone.vis.v = 0;
    if (why === 'empty') addAct(s, 'collapse', 1.4);
    s.events.push({ type: 'mode' });
  }
  function startRest(s) {
    if (s.mode === 'rest') return;
    if (s.charge > 0.985) { if (!busy(s)) addAct(s, 'pump', 1.5); s.events.push({ type: 'note', text: 'Já está com a carga cheia.' }); return; }
    if (s.mode === 'scroll') endScroll(s, 'user');
    dropActs(s, IDLE_TYPES);
    s.mode = 'rest'; s.modeT0 = s.t;
    addAct(s, 'stretch', 1.4);
    s.events.push({ type: 'mode' });
  }
  function endRest(s, why) {
    if (s.mode !== 'rest') return;
    s.mode = 'idle'; s.modeT0 = s.t; s.nextIdle = s.t + 3.4;
    if (why === 'full') { dropActs(s, IDLE_TYPES); addAct(s, 'celebrate', 2.1); }
    s.events.push({ type: 'mode' });
  }
  function tap(s) {
    s.taps = s.taps.filter((x) => s.t - x < 1.6); s.taps.push(s.t);
    s.ss.v -= 3.2 * (s.reduced ? 0.5 : 1); s.wamp.v += 7; s.slosh.v += (rnd(s) - 0.5) * 0.9;
    if (hasAct(s, ['dizzy', 'celebrate', 'collapse', 'swap'])) return;
    dropActs(s, ['giggle', 'eh', 'groggy'].concat(s.mode === 'idle' ? IDLE_TYPES : []));
    if (s.taps.length >= 5 && s.band >= 2) { s.taps = []; addAct(s, 'dizzy', 1.9); return; }
    if (s.mode === 'scroll') addAct(s, 'eh', 0.7);
    else if (s.mode === 'rest') addAct(s, 'groggy', 1.1);
    else if (s.band >= 3) addAct(s, 'giggle', 0.95);
    else if (s.band === 2) addAct(s, 'eh', 0.75);
    else addAct(s, 'groggy', 1.1);
    s.nextIdle = Math.max(s.nextIdle, s.t + 2.5);
  }
  function applyInput(s, ev) {
    switch (ev.type) {
      case 'scroll': if (ev.user) s.demo = false; if (ev.on) startScroll(s); else endScroll(s, 'user'); break;
      case 'rest': if (ev.user) s.demo = false; if (ev.on) startRest(s); else endRest(s, 'user'); break;
      case 'level': s.demo = false; endScroll(s, 'user'); endRest(s, 'user'); s.charge = clamp(ev.value); break;
      case 'tap': tap(s); break;
      case 'pointer': s.pointer = [clamp(ev.gx, -1, 1), clamp(ev.gy, -1, 1)]; break;
      case 'pointerleave': s.pointer = null; break;
      case 'variant':
        if (ev.v === s.variant && !hasAct(s, 'swap')) break;
        if (ev.animate) { dropActs(s, ['swap']); addAct(s, 'swap', 0.55, { to: ev.v }); } else s.variant = ev.v;
        break;
      case 'demo': s.demo = !!ev.on; s.modeT0 = s.t; break;
      case 'reduced': s.reduced = !!ev.on; break;
    }
  }
  function demo(s) {
    if (s.mode !== 'idle' || hasAct(s, ['celebrate', 'collapse', 'swap', 'dizzy'])) return;
    const it = s.t - s.modeT0;
    if (s.charge >= 0.98) { if (it > 4.8) startScroll(s); }
    else if (s.charge <= 0.06) { if (it > 3.4) startRest(s); }
    else if (it > 2.4) startRest(s);
  }
  function idlePick(s) {
    const table = {
      4: [['wave', 2.4, 0.36], ['pump', 1.5, 0.34], ['look', 2.4, 0.3]],
      3: [['look', 2.4, 0.4], ['sway', 2.6, 0.35], ['wave', 2.4, 0.25]],
      2: [['worry', 2.4, 0.5], ['look', 2.4, 0.25], ['sigh', 1.9, 0.25]],
      1: [['yawn', 2.6, 0.45], ['sigh', 1.9, 0.35], ['look', 2.4, 0.2]],
      0: [['sigh', 1.9, 0.5], ['shiver', 0.8, 0.5]],
    }[s.band];
    const r = rnd(s); let acc = 0, pick = table[0];
    for (const e of table) { acc += e[2]; if (r < acc) { pick = e; break; } }
    if (s.firstIdle) { s.firstIdle = false; if (s.band >= 3) pick = ['wave', 2.4]; }
    addAct(s, pick[0], pick[1]);
    s.nextIdle = s.t + pick[1] + rr(s, 2.4, 4.6);
  }
  function onBand(s, from, to) {
    s.events.push({ type: 'band', band: to });
    if (to > from && s.mode === 'rest') { s.boltKick.v += 5; s.ss.v += 1.8; s.cap.v += 40; for (let i = 0; i < 3; i++) plusPart(s); }
    if (to < from && s.mode === 'scroll') { s.ss.v -= 1.6; s.wamp.v += 4; }
    if (to === 0 && s.mode === 'idle' && !hasAct(s, 'collapse')) s.tiltS.v -= 28;
    if (to === 2) s.dropT0 = s.t - 1.8;
  }

  // partículas: posição relativa a uma âncora que cada versão resolve na hora de desenhar
  function burst(s, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 1.5 + rr(s, -0.15, 0.15), sp = rr(s, 0.65, 1) * speed;
      s.parts.push({ k: 'spark', anchor: 'head', t0: s.t, life: rr(s, 0.6, 0.85), x: Math.cos(a) * 24, y: Math.sin(a) * 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3.6, rot: rr(s, 0, 90), vr: rr(s, -220, 220), s: rr(s, 6, 9) });
    }
  }
  function puffs(s, k = 1) {
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      s.parts.push({ k: 'puff', anchor: side < 0 ? 'footL' : 'footR', t0: s.t, life: rr(s, 0.38, 0.52), x: 0, y: 0, vx: side * rr(s, 26, 58) * k, vy: -rr(s, 4, 18) * k, drag: 5, rot: 0, vr: 0, s: rr(s, 3, 5.2) * k });
    }
  }
  function plusPart(s) { s.parts.push({ k: 'plus', anchor: 'body', t0: s.t, life: rr(s, 1, 1.4), x: (rnd(s) < 0.5 ? -1 : 1) * rr(s, 54, 74), y: rr(s, -10, 50), vx: 0, vy: -rr(s, 22, 34), rot: 0, vr: 0, s: rr(s, 0.75, 1.05) }); }
  function notePart(s) { s.parts.push({ k: 'note', anchor: 'note', t0: s.t, life: 1.7, x: 0, y: 0, vx: -rr(s, 3, 8), vy: -rr(s, 22, 28), rot: rr(s, -12, 12), vr: rr(s, -25, 25), s: rr(s, 0.9, 1.1), ph: rr(s, 0, TAU) }); }

  function basePose(s, L) {
    const t = s.t, E = sstep(0.05, 0.9, L), R = s.reduced ? 0.4 : 1;
    const P = {
      L, E, band: s.band, uf: shapedU(L, 0.32, 0.68), ua: shapedU(L, 0.12, 0.88),
      crouch: 0, dyAdd: 0, jy: 0, tiltT: -7 * (1 - sstep(0.03, 0.2, L)), tiltAdd: 0, syMul: 1, sxMul: 1, shx: 0, ssT: 1, ssOverride: null,
      cheer: 0, stretch: 0, yawnArm: 0, wave: 0, waveAng: 0, hold: 0, pumpY: 0, droop: 0, handRotL: 0, handRotR: 0, thumb: 0, flickRot: 0,
      gaze: null, gazeJit: 0, browMul: 1, lidAdd: 0, eyeScale: 1, eyeMode: null, mouthOv: [], browDY: 0, browWorry: 0, blush: 0,
      air: 0, toe: 0, tuck: 0,
    };
    if (s.mode === 'idle' && !s.still) { // movimento de fundo, por humor
      if (s.band === 4) { const b = Math.max(0, Math.sin(TAU * 1.25 * t)); P.dyAdd += 0.9 * b * R; P.pumpY -= 1.8 * b; }
      else if (s.band === 3) P.tiltAdd += 0.8 * Math.sin(TAU * 0.42 * t) * R;
      else if (s.band === 0) P.tiltAdd += 1.3 * Math.sin(TAU * 0.27 * t) * R;
    }
    return P;
  }
  function actPose(s, a, P) {
    const lt = s.t - a.t0, d = a.dur, p = clamp(lt / d), R = s.reduced ? 0.45 : 1;
    switch (a.type) {
      case 'wave': {
        const w = env(lt, d, 0.3, 0.42), ph = TAU * 2.6 * (lt - 0.3);
        P.wave = Math.max(P.wave, w); P.waveAng = 14 * Math.sin(ph) * sstep(0.18, 0.42, lt);
        P.handRotR += 18 * Math.sin(ph - 0.9) * w; P.tiltAdd += 2.4 * w * R;
        P.mouthOv.push([MO.smile, 0.7 * w]); P.gaze = [0, -0.1]; break;
      }
      case 'pump': {
        const w = env(lt, d, 0.15, 0.35), b = Math.max(0, Math.sin(TAU * 2.2 * lt));
        P.dyAdd += 3 * b * w * R; P.pumpY -= 6 * b * w; P.cheer = Math.max(P.cheer, 0.22 * w);
        P.mouthOv.push([MO.laugh, 0.6 * w]); if (lt < d - 0.25) P.eyeMode = 'arc'; break;
      }
      case 'look': {
        const tg = lt < 0.75 ? [-0.95, -0.05] : lt < 1.6 ? [0.95, 0.05] : [0, 0];
        P.gaze = tg; P.tiltAdd -= 1.4 * s.gx.x * env(lt, d, 0.3, 0.5) * R; break;
      }
      case 'sway': {
        const w = env(lt, d, 0.45, 0.5);
        P.tiltAdd += 3.2 * Math.sin(TAU * 0.75 * lt) * w * R;
        if (lt > 0.2 && lt < d - 0.35) P.eyeMode = 'arc';
        P.mouthOv.push([MO.content, w]);
        if (!a.n1 && lt > 0.45) { a.n1 = 1; notePart(s); }
        if (!a.n2 && lt > 1.5) { a.n2 = 1; notePart(s); }
        break;
      }
      case 'worry': {
        const w = env(lt, d, 0.3, 0.5);
        P.gaze = [0.05, 1]; P.browWorry += w; P.mouthOv.push([MO.wobbly, 0.8 * w]);
        if (!a.k) { a.k = 1; s.dropT0 = s.t; }
        break;
      }
      case 'yawn': {
        const w = env(lt, d, 0.55, 0.7);
        P.mouthOv.push([MO.yawn, w]); if (lt > 0.25 && lt < d - 0.55) P.eyeMode = 'sleep';
        P.yawnArm = Math.max(P.yawnArm, 0.9 * w); P.syMul *= 1 + 0.05 * w * R; P.tiltAdd -= 2 * w * R; break;
      }
      case 'sigh': {
        const inh = lt < 0.65 ? easeInOut(lt / 0.65) : lt < 1.45 ? 1 - 2 * easeInOut((lt - 0.65) / 0.8) : -1 + easeInOut(clamp((lt - 1.45) / (d - 1.45)));
        P.syMul *= 1 + 0.032 * inh * R; if (inh < 0) { P.droop -= inh * 4; P.lidAdd -= inh * 0.14; }
        if (lt > 0.65 && lt < 1.5) P.mouthOv.push([MO.o, 0.55 * env(lt - 0.65, 0.85, 0.15, 0.3)]);
        break;
      }
      case 'shiver': {
        P.shx += 1.4 * Math.sin(TAU * 15 * lt) * (1 - p) * R;
        if (!a.k) { a.k = 1; s.slosh.v += 0.7; s.wamp.v += 4; }
        break;
      }
      case 'stretch': {
        const w = env(lt, d, 0.38, 0.45);
        P.stretch = Math.max(P.stretch, w); P.syMul *= 1 + 0.07 * w * R; P.sxMul *= 1 - 0.03 * w;
        if (lt < d - 0.3) P.eyeMode = 'chev';
        P.mouthOv.push([MO.yawn, 0.75 * w]); break;
      }
      case 'celebrate': {
        const A = 0.16, T = 0.52, land = A + T;
        if (lt < A) {
          const q = lt / A;
          P.dyAdd += 7 * easeInOut(q) * R; P.ssT = 0.86; P.eyeMode = 'chev'; P.mouthOv.push([MO.effort, 1]); P.droop += 3 * q;
        } else if (lt < land) {
          const q = (lt - A) / T;
          P.jy -= 26 * 4 * q * (1 - q) * R; P.air = 4 * q * (1 - q);
          P.syMul *= 1 + 0.11 * Math.abs(1 - 2 * q) * R;
          P.cheer = Math.max(P.cheer, easeOut(Math.min(1, q * 2.4)));
          P.eyeMode = 'arc'; P.mouthOv.push([MO.laugh, 1]); P.toe = 14 * P.air; P.tuck = -3 * P.air;
          if (!a.b && q > 0.45) { a.b = 1; burst(s, s.reduced ? 4 : 7, 125); }
        } else {
          const q = (lt - land) / (d - land);
          if (!a.l) { a.l = 1; s.ss.v -= 5.2 * R; s.wamp.v += 9; s.cap.v += 60; s.boltKick.v += 5; puffs(s); }
          P.cheer = Math.max(P.cheer, 1 - easeInOut(Math.min(1, q * 2.2)));
          P.pumpY -= 5 * Math.abs(Math.sin(TAU * 2.1 * (lt - land))) * (1 - q);
          if (q < 0.85) P.eyeMode = 'arc';
          P.mouthOv.push([MO.laugh, 1 - easeIn(q)]);
        }
        break;
      }
      case 'collapse': {
        if (!a.k) { a.k = 1; s.tiltS.v -= 55 * R; s.ss.v -= 2.6 * R; s.wamp.v += 5; s.acc.alert.v += 4; }
        const w = env(lt, d, 0.2, 0.6);
        P.dyAdd += 3 * w * R; P.eyeMode = 'sleep'; P.mouthOv.push([MO.frown, w]); P.droop += 4 * w; break;
      }
      case 'giggle': {
        const w = env(lt, d, 0.08, 0.3);
        if (lt < d - 0.18) P.eyeMode = 'arc';
        P.mouthOv.push([Object.assign({}, MO.laugh, { cb: MO.laugh.cb * (1 + 0.22 * Math.sin(TAU * 8 * lt)) }), w]);
        P.blush = Math.max(P.blush, w); P.tiltAdd += 3.2 * Math.sin(TAU * 4.2 * lt) * (1 - p) * R;
        if (lt > 0.06 && lt < 0.36) { const q = (lt - 0.06) / 0.3; P.jy -= 8 * 4 * q * (1 - q) * R; P.air = Math.max(P.air, 1.2 * q * (1 - q)); }
        if (!a.l && lt >= 0.36) { a.l = 1; s.ss.v -= 2.2 * R; }
        break;
      }
      case 'eh': {
        const w = env(lt, d, 0.06, 0.4);
        P.eyeScale *= 1 + 0.18 * w; P.lidAdd -= 0.45 * w; P.browDY -= 3 * w; P.mouthOv.push([MO.o, w]);
        P.tiltAdd -= 1.6 * w * R; P.eyeMode = 'open'; break;
      }
      case 'groggy': {
        const w = env(lt, 0.7, 0.08, 0.35);
        P.lidAdd -= 0.32 * w; P.mouthOv.push([MO.o, 0.6 * w]); P.shx += 0.8 * Math.sin(TAU * 3 * lt) * (1 - p) * R;
        if (s.mode === 'rest' && lt < 0.7) P.eyeMode = 'open';
        break;
      }
      case 'dizzy': {
        const w = env(lt, d, 0.12, 0.4);
        if (lt < d - 0.3) P.eyeMode = 'spiral';
        P.tiltAdd += 6 * Math.sin(TAU * 1.25 * lt) * w * R; P.shx += 2 * Math.sin(TAU * 1.25 * lt + 1.2) * w * R;
        P.mouthOv.push([MO.wobbly, w]); break;
      }
      case 'swap': {
        const A = 0.12;
        if (lt < A) P.ssOverride = lerp(1, 0.6, easeIn(lt / A));
        else if (!a.k) { a.k = 1; s.variant = a.to; s.ss.x = 0.6; s.ss.v = 7.5; puffs(s, 0.7); s.events.push({ type: 'variant' }); }
        if (lt < 0.32) P.eyeMode = 'chev';
        break;
      }
    }
  }
  function modePose(s, P) {
    const t = s.t, mt = t - s.modeT0;
    if (s.mode === 'scroll') {
      if (!P.gaze) P.gaze = [0.42, 0.95];
      P.tiltAdd += 2.4 * sstep(0, 0.5, mt); P.syMul *= 1 - 0.025 * sstep(0, 0.5, mt);
      if (!P.eyeMode) P.eyeMode = 'open';
      P.mouthOv.unshift([MO.glazed, s.glazed.x]);
      P.lidAdd += 0.08 * s.glazed.x;
      const fl = t - s.phone.flickT0;
      P.flickRot = -6 * env(fl, 0.22, 0.05, 0.15); P.thumb = -18 * env(fl, 0.22, 0.05, 0.15); P.gazeJit = 0.14 * env(fl, 0.26, 0.05, 0.2);
    } else if (s.mode === 'rest') {
      P.tiltT *= 1 - sstep(0, 0.7, mt); P.browMul = 1 - sstep(0.3, 1, mt);
      P.tiltAdd += 2.2 * Math.sin(TAU * 0.32 * mt) * sstep(0.9, 1.9, mt) * (s.reduced ? 0.4 : 1);
      if (!P.eyeMode) P.eyeMode = 'sleep';
      P.mouthOv.unshift([MO.content, sstep(0.9, 1.6, mt)]);
    }
  }
  function physics(s, P, dt) {
    const t = s.t, R = s.reduced ? 0.5 : 1, m = s.mode;
    // respiração
    s.breathPh += TAU * lerp(0.2, 0.4, P.E) * dt;
    const br = s.still ? 0 : lerp(0.03, 0.014, P.E) * Math.sin(s.breathPh) * R;
    P.syMul *= 1 + br; P.sxMul *= 1 - br * 0.45;
    // corpo
    spr(s.tiltS, P.tiltT, 1.1, 0.45, dt);
    P.tilt = s.tiltS.x + P.tiltAdd;
    if (P.ssOverride != null) { s.ss.x = P.ssOverride; s.ss.v = 0; } else spr(s.ss, P.ssT, 3.2, 0.32, dt);
    const ss = s.ss.x;
    P.sy = ss * P.syMul; P.sx = (1 + (1 - ss) * 0.8) * P.sxMul;
    spr(s.cr, P.crouch, 4, 0.7, dt); P.dy = s.cr.x + P.dyAdd;
    // mãos atrasam em relação ao corpo (follow-through)
    const bY = P.dy + P.jy, bX = P.shx + P.tilt * RAD * 120;
    const vY = (bY - s.prevBY) / dt, vX = (bX - s.prevBX) / dt;
    s.prevBY = bY; s.prevBX = bX;
    const tx = clamp(-vX * 0.012, -6, 6), ty = clamp(-vY * 0.022, -8, 8), w = TAU * 2.8, z = 0.32;
    for (const hh of [s.hl, s.hr]) {
      hh.vx += (-w * w * (hh.x - tx) - 2 * z * w * hh.vx) * dt; hh.x += hh.vx * dt;
      hh.vy += (-w * w * (hh.y - ty) - 2 * z * w * hh.vy) * dt; hh.y += hh.vy * dt;
    }
    P.hl = { x: s.hl.x, y: s.hl.y }; P.hr = { x: s.hr.x, y: s.hr.y };
    // líquido: superfície tende a ficar nivelada no mundo e balança quando o corpo mexe
    spr(s.slosh, -P.tilt * RAD * 0.92 - vX * 0.0016, 1.3, 0.13, dt);
    spr(s.wamp, lerp(0.7, 1.3, P.E) + (m === 'rest' ? 0.5 : 0), 0.9, 0.55, dt);
    s.ph1 += dt * (2.1 + (m === 'rest' ? 1.3 : 0)); s.ph2 += dt * 1.45;
    P.liqTilt = s.slosh.x; P.wamp = Math.max(0, s.wamp.x); P.ph1 = s.ph1; P.ph2 = s.ph2;
    P.fill = 0.05 + 0.99 * P.L;
    // bolhas
    const rate = (m === 'rest' ? 4.2 : m === 'scroll' ? 0.35 : 1) * (s.reduced ? 0.5 : 1) * (P.fill > 0.14 ? 1 : 0);
    s.bubAcc += rate * dt;
    while (s.bubAcc >= 1) {
      s.bubAcc -= 1;
      s.bubbles.push({ u: rnd(s) < 0.5 ? rr(s, 0.03, 0.09) : rr(s, 0.91, 0.97), h: 0.02, r: rr(s, 1.3, 3), sp: rr(s, 0.11, 0.2) * (m === 'rest' ? 1.7 : 1), wa: rr(s, 0.4, 1.1), wf: rr(s, 1.8, 3.6), ph: rr(s, 0, TAU), t0: t });
    }
    const keep = [];
    for (const b of s.bubbles) { b.h += b.sp * dt; if (b.h >= P.fill - 0.02) { if (P.fill < 0.99) s.pops.push({ u: b.u, t0: t }); } else keep.push(b); }
    s.bubbles = keep; s.pops = s.pops.filter((q) => t - q.t0 < 0.24);
    P.bubbles = s.bubbles; P.pops = s.pops;
    spr(s.stripes, m === 'rest' ? 1 : 0, 1.2, 1, dt); s.stripePh += dt * 0.32;
    P.stripes = clamp(s.stripes.x); P.stripePh = s.stripePh;
    // celular e brilho da tela
    spr(s.hold, m === 'scroll' ? 1 : 0, m === 'scroll' ? 2.4 : 4, 0.85, dt); P.hold = clamp(s.hold.x);
    P.armFront = m === 'scroll' ? P.hold > 0.15 : P.hold > 0.5;
    spr(s.glazed, m === 'scroll' && t - s.modeT0 > 0.35 ? 1 : 0, 2, 1, dt); P.glazed = clamp(s.glazed.x);
    spr(s.glow, m === 'scroll' ? 1 : 0, 1.6, 1, dt); P.glow = clamp(s.glow.x);
    spr(s.phone.vis, m === 'scroll' && t - s.modeT0 > 0.12 ? 1 : 0, 4.2, 0.45, dt); P.phoneVis = Math.max(0, s.phone.vis.x);
    spr(s.phone.scroll, s.phone.target, 4.5, 1, dt); P.phoneScroll = s.phone.scroll.x; P.like = (t - s.phone.likeT0) / 0.65;
    // olhar
    const g = P.gaze || s.pointer || (s.still ? [0, 0] : [0.12 * Math.sin(0.37 * t), 0.08 * Math.sin(0.23 * t + 1)]);
    spr(s.gx, g[0], 4.2, 0.85, dt); spr(s.gy, g[1] + P.gazeJit, 4.2, 0.85, dt);
    P.gx = clamp(s.gx.x, -1.2, 1.2); P.gy = clamp(s.gy.x, -1.2, 1.2);
    // olhos (cada versão tem o seu modo padrão por humor)
    for (const v of VARIANTS) eyeStep(s.eyes[v], P.eyeMode || V[v].eyeModes[s.band], dt);
    if (t >= s.blinkAt) { s.blinkT0 = t; s.blinkAt = t + (rnd(s) < 0.18 ? 0.3 : rr(s, 2.3, 5.2)); }
    const bt = t - s.blinkT0;
    P.blink = bt < 0.065 ? easeIn(bt / 0.065) : bt < 0.1 ? 1 : bt < 0.22 ? 1 - easeOut((bt - 0.1) / 0.12) : 0;
    // tampa e enfeites
    spr(s.cap, 0, 3.5, 0.3, dt); P.capPop = Math.max(-1, s.cap.x);
    const b = s.band;
    const tg = {
      bolt: (b === 4 && m !== 'scroll') || m === 'rest', spark: b === 4 && m === 'idle', spark2: b === 3 && m === 'idle',
      drop: b === 2 && m !== 'rest', plug: b === 1 && m !== 'rest', alert: b === 0 && m !== 'rest',
    };
    P.acc = {};
    for (const k in tg) { spr(s.acc[k], tg[k] ? 1 : 0, 3.2, 0.42, dt); P.acc[k] = Math.max(0, s.acc[k].x); }
    spr(s.boltKick, 0, 3, 0.35, dt);
    P.boltPulse = s.boltKick.x * 0.1 + (m === 'rest' ? 0.1 * Math.max(0, Math.sin(TAU * 1.6 * t)) : 0);
  }
  function phoneTick(s, P) {
    if (s.mode !== 'scroll') return;
    const t = s.t;
    if (t >= s.phone.nextFlick) {
      s.phone.flickT0 = t; s.phone.nextFlick = t + rr(s, 0.5, 0.95); s.phone.target += 9;
      if (rnd(s) < 0.5 && P.phoneVis > 0.8 && t - s.phone.likeT0 > 0.9) s.phone.likeT0 = t;
    }
  }
  function partTick(s, dt) {
    for (const p of s.parts) {
      if (p.g) p.vy += p.g * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt;
    }
    s.parts = s.parts.filter((p) => s.t - p.t0 < p.life);
  }
  function step(s, dt) {
    s.t += dt; const t = s.t;
    while (s.queue.length) applyInput(s, s.queue.shift());
    if (s.demo) demo(s);
    if (s.mode === 'scroll') { s.charge = Math.max(0, s.charge - 0.085 * dt); if (s.charge <= 0) endScroll(s, 'empty'); }
    else if (s.mode === 'rest' && t - s.modeT0 > 0.7) { s.charge = Math.min(1, s.charge + 0.15 * dt); if (s.charge >= 1) endRest(s, 'full'); }
    spr(s.level, s.charge, 1.5, 1, dt);
    const L = clamp(s.level.x);
    const up = [0.01, 0.26, 0.51, 0.76], down = [0.005, 0.24, 0.49, 0.74]; // faixas do produto: 1, 26, 51 e 76%
    let b = s.band;
    while (b < 4 && L >= up[b]) b++;
    while (b > 0 && L < down[b - 1]) b--;
    if (b !== s.band) { const from = s.band; s.band = b; onBand(s, from, b); }
    if (s.mode === 'idle' && !busy(s) && t >= s.nextIdle) idlePick(s);
    const P = basePose(s, L);
    for (const a of s.acts) actPose(s, a, P);
    modePose(s, P);
    // rolando o feed: o braço livre pende; descansando: braços soltos até a comemoração
    P.ua = lerp(P.ua, Math.min(P.ua, 1.4), clamp(s.hold.x));
    if (s.mode === 'rest') P.ua = lerp(P.ua, Math.min(P.ua, 2.1), sstep(0.6, 1.6, t - s.modeT0));
    physics(s, P, dt);
    P.still = !!s.still;
    s.pose = P;
    phoneTick(s, P);
    partTick(s, dt);
    s.acts = s.acts.filter((a) => t - a.t0 < a.dur);
  }

  // ------------------------------------------------------------------ desenho
  function drawEye(cfg, side, ex, ey, E, F, pfx) {
    const ec = cfg.eye, out = [], id = pfx + (side < 0 ? '-el' : '-er');
    const op = E.cur === 'open' ? E.open * (1 - F.blink) : 0;
    if (op > 0.12) {
      const sc = F.eyeScale, rx = ec.rx * sc, ry0 = ec.ry * sc, ry = ry0 * op, cy = ey + (1 - op) * ry0 * 0.25;
      const kids = [h('ellipse', { cx: N(ex), cy: N(cy), rx: N(rx), ry: N(ry), fill: INK })];
      const hx = -F.gx * 0.6, hy = -F.gy * 0.4;
      if (F.glazed > 0.5) kids.push(h('rect', { x: N(ex + rx * 0.05), y: N(cy - ry * 0.5), width: N(rx * 0.55), height: N(ry * 0.45), rx: 0.8, fill: '#CFF2FF' }));
      else if (ec.style === 'dot') kids.push(h('circle', { cx: N(ex + 1.8 * sc + hx), cy: N(cy + kv(ec.hlDY, F.uf) * op + hy), r: N(1.75 * sc), fill: WHITE }));
      else if (ec.style === 'oval') {
        kids.push(h('circle', { cx: N(ex + 2.4 * sc + hx), cy: N(cy + kv(ec.hlDY, F.uf) * op + hy), r: N(3 * sc), fill: WHITE }));
        kids.push(h('circle', { cx: N(ex - 2.5 * sc + hx), cy: N(cy + 4 * op * sc + hy), r: N(1.6 * sc), fill: WHITE }));
      } else {
        const k = op * sc;
        kids.push(h('path', { d: 'M ' + N(ex + 1 * sc + hx) + ' ' + N(cy - 8 * k + hy) + ' L ' + N(ex + 6.4 * sc + hx) + ' ' + N(cy - 5 * k + hy) + ' A ' + N(6.5 * sc) + ' ' + N(11 * k) + ' 0 0 0 ' + N(ex + 2.5 * sc + hx) + ' ' + N(cy - 10.4 * k + hy) + ' Z', fill: WHITE }));
      }
      // pálpebra: recorta o olho por baixo de uma parábola e desenha a borda
      const lid = F.lid, W = rx + 2.2, k = 2.4;
      const Y0 = lid > 0.02 ? cy - ry + lid * 2 * ry : cy - ry - 8;
      out.push(h('clipPath', { id }, h('path', { d: 'M ' + N(ex - W - 3) + ' ' + N(Y0) + ' L ' + N(ex - W) + ' ' + N(Y0) + ' Q ' + N(ex) + ' ' + N(Y0 - 2 * k) + ' ' + N(ex + W) + ' ' + N(Y0) + ' L ' + N(ex + W + 3) + ' ' + N(Y0) + ' L ' + N(ex + W + 3) + ' ' + N(cy + ry + 6) + ' L ' + N(ex - W - 3) + ' ' + N(cy + ry + 6) + ' Z' })));
      out.push(h('g', { 'clip-path': 'url(#' + id + ')' }, kids));
      const lidG = [];
      if (lid > 0.04) {
        const ym = Y0 - k * 0.6, q = (ym - cy) / ry, chord = Math.abs(q) < 1 ? rx * Math.sqrt(1 - q * q) : 0;
        const a = Math.min(W, chord + 2.2) * sstep(0.3, 0.6, op);
        if (a > 0.6) {
          const ya = Y0 - k * (1 - (a * a) / (W * W)), yc = ya - (2 * k * a * a) / (W * W);
          lidG.push(lineP('M ' + N(ex - a) + ' ' + N(ya) + ' Q ' + N(ex) + ' ' + N(yc) + ' ' + N(ex + a) + ' ' + N(ya), ec.lidW));
        }
      }
      out.push(h('g', {}, lidG));
    } else {
      const c = cfg.closed, y0 = ey + c.dy, hw = c.hw * (1 - E.spiral * 0.85);
      let d;
      if (E.chev > 0.02) {
        const dir = side < 0 ? 1 : -1, ch = E.chev;
        const P0 = lerpP([ex - hw, y0], [ex - dir * 0.55 * c.hw, y0 - 4.6], ch);
        const P1 = lerpP([ex, y0 - 6 * E.bend], [ex + dir * 0.6 * c.hw, y0], ch);
        const P2 = lerpP([ex + hw, y0], [ex - dir * 0.55 * c.hw, y0 + 4.6], ch);
        d = 'M ' + pt(P0) + ' L ' + pt(P1) + ' L ' + pt(P2);
      } else d = 'M ' + N(ex - hw) + ' ' + N(y0) + ' Q ' + N(ex) + ' ' + N(y0 - 12 * E.bend) + ' ' + N(ex + hw) + ' ' + N(y0);
      out.push(lineP(d, c.w * (1 - E.spiral * 0.45)));
      if (E.spiral > 0.02) {
        const pts = [], R = 6.6 * E.spiral, rot = F.t * 7 * (side < 0 ? 1 : -1);
        for (let i = 0; i <= 26; i++) { const th = (i / 26) * 4.2 * Math.PI, r = (R * i) / 26, a = th * (side < 0 ? 1 : -1) + rot; pts.push([ex + r * Math.cos(a), ey + r * Math.sin(a)]); }
        out.push(lineP(smoothD(pts), 2.6));
      }
    }
    return out;
  }
  function drawMouth(cfg, P, pfx) {
    const m = Object.assign({ round: 0 }, kv(cfg.mouth, P.uf)), ms = cfg.mouthScale;
    for (const pair of P.mouthOv) {
      const ov = pair[0], w = clamp(pair[1]);
      if (w <= 0) continue;
      m.hw = lerp(m.hw, ov.hw * ms, w); m.ct = lerp(m.ct, ov.ct * ms, w); m.cb = lerp(m.cb, ov.cb * ms, w);
      m.wob = lerp(m.wob, ov.wob * ms, w); m.round = lerp(m.round, ov.round, w); m.my = lerp(m.my, m.my + ov.dmy * ms, w);
    }
    const n = 10, top = [], bot = [], mx = 120, my = m.my;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = mx - m.hw + 2 * m.hw * u;
      const pr = lerp(4 * u * (1 - u), Math.pow(Math.sin(Math.PI * u), 0.6), m.round), wv = -m.wob * Math.sin(TAU * u);
      top.push([x, my + m.ct * pr + wv]); bot.push([x, my + m.cb * pr + wv]);
    }
    const open = clamp((m.cb - m.ct) / 5), sw = lerp(m.sw, cfg.openSW, open);
    if (m.cb - m.ct < 0.7) return [lineP(smoothD(top), sw)];
    const d = smoothD(top) + crSeg(bot.slice().reverse()) + ' Z', id = pfx + '-mo';
    const inner = [];
    if (cfg.teeth && open > 0.25) {
      const t1 = top.map((p) => [p[0], p[1] + 1.6]), t2 = top.map((p) => [p[0], p[1] + 1.6 + 4.6 * open]);
      inner.push(h('path', { d: smoothD(t1) + ' L ' + pt(t2[n]) + crSeg(t2.slice().reverse()) + ' Z', fill: WHITE }));
    }
    if (cfg.tongue) inner.push(ellP(mx, my + m.cb * 0.82, 6 * ms * clamp(open * 1.3), 3 * ms * clamp(open * 1.3), TONGUE, 0));
    return [h('clipPath', { id }, h('path', { d })), h('path', { d, fill: MOUTH }), h('g', { 'clip-path': 'url(#' + id + ')' }, inner), h('path', { d, fill: 'none', stroke: INK, 'stroke-width': N(sw), 'stroke-linejoin': 'round' })];
  }
  function drawFace(cfg, s, P, E, pfx) {
    const uf = P.uf, ec = cfg.eye, out = [];
    const ey = kv(ec.y, uf) + P.gy * 1.2, exL = 120 - ec.dx + P.gx * 1.6, exR = 120 + ec.dx + P.gx * 1.6;
    const ck = cfg.cheek, crx = kv(ck.rx, uf) + 6 * P.blush, cry = kv(ck.ry, uf) + 4.5 * P.blush, ca = Math.max(kv(ck.a, uf), 0.75 * P.blush), cy = kv(ck.y, uf);
    out.push(h('g', {}, crx > 0.4 ? [ellP(120 - ck.dx, cy, crx, cry, PINK, 0, 0, { opacity: N(ca) }), ellP(120 + ck.dx, cy, crx, cry, PINK, 0, 0, { opacity: N(ca) })] : null));
    const F = { lid: clamp(Math.max(kv(ec.lid, uf), 0.38 * P.glazed) + P.lidAdd, 0, 0.8), blink: P.blink, eyeScale: P.eyeScale * (1 - 0.06 * P.glazed), glazed: P.glazed, uf, gx: P.gx, gy: P.gy, t: s.t };
    out.push(h('g', {}, drawEye(cfg, -1, exL, ey, E, F, pfx)), h('g', {}, drawEye(cfg, 1, exR, ey, E, F, pfx)));
    const bags = kv(cfg.bags, uf);
    out.push(h('g', {}, bags > 0.03 ? lineP([exL, exR].map((x) => 'M ' + N(x - 7 * bags) + ' ' + N(ey + 10) + ' Q ' + N(x) + ' ' + N(ey + 14) + ' ' + N(x + 7 * bags) + ' ' + N(ey + 10)).join(' '), 3, BAGS) : null));
    const bw = [];
    if (cfg.brow) {
      const b = cfg.brow, amt = clamp(kv(b.amt, uf) + P.browWorry * 0.7) * P.browMul;
      if (amt > 0.03) {
        const o = kv(b.o, uf), i = kv(b.i, uf), arch = kv(b.arch, uf);
        const o1 = [o[0], o[1] + P.browDY + P.browWorry * 1.2], i1 = [i[0], i[1] + P.browDY - P.browWorry * 2.2];
        const mid = lerpP(o1, i1, 0.5), o2 = lerpP(mid, o1, amt), i2 = lerpP(mid, i1, amt);
        const c = [(o2[0] + i2[0]) / 2, (o2[1] + i2[1]) / 2 + arch * amt], mir = (p) => [240 - p[0], p[1]];
        bw.push(lineP('M ' + pt(o2) + ' Q ' + pt(c) + ' ' + pt(i2) + ' M ' + pt(mir(o2)) + ' Q ' + pt(mir(c)) + ' ' + pt(mir(i2)), b.w));
      }
    }
    out.push(h('g', {}, bw));
    out.push(h('g', {}, drawMouth(cfg, P, pfx)));
    return out;
  }
  function drawLiquid(cfg, P, pfx, ix, iy, iw, ih, ir) {
    const f = P.fill, kf = 1 - sstep(0.93, 1.03, f), y0 = iy + ih * (1 - f), tl = Math.tan(P.liqTilt) * kf, A = P.wamp * kf;
    const surf = (x, ph) => y0 + tl * (x - 120) + A * (0.62 * Math.sin(0.15 * x + P.ph1 + ph) + 0.38 * Math.sin(0.27 * x - P.ph2 + ph * 1.7));
    const x0 = ix - 8, x1 = ix + iw + 8, bot = iy + ih + 8, xs = [];
    for (let x = x0; x < x1 - 0.5; x += 6) xs.push(x);
    xs.push(x1);
    const front = xs.map((x) => [x, surf(x, 0)]), back = xs.map((x) => [x, surf(x, 2.3) - 2.4]);
    const close = ' L ' + N(x1) + ' ' + N(bot) + ' L ' + N(x0) + ' ' + N(bot) + ' Z', liqD = smoothD(front) + close;
    const col = liquidColor(P.L), dark = liquidColor(P.L, true), inId = pfx + '-in', lqId = pfx + '-lq';
    const g = [h('path', { d: smoothD(back) + close, fill: dark, opacity: 0.5 }), h('path', { d: liqD, fill: col })];
    const stripes = [];
    if (P.stripes > 0.01) {
      const th = 9 * P.stripes, per = 30, off = (P.stripePh * 60) % per;
      for (let k = -1; k < Math.ceil(ih / per) + 2; k++) {
        const yb = iy + ih - (k * per + off);
        stripes.push(h('path', { d: 'M ' + N(x0) + ' ' + N(yb + 8) + ' L ' + N(x1) + ' ' + N(yb - 8) + ' L ' + N(x1) + ' ' + N(yb - 8 - th) + ' L ' + N(x0) + ' ' + N(yb + 8 - th) + ' Z', fill: WHITE, opacity: 0.2 }));
      }
    }
    g.push(h('g', { 'clip-path': 'url(#' + lqId + ')' }, stripes));
    const sx0 = ix + iw - 12, sh = [];
    for (let x = sx0; x < x1 - 0.5; x += 4) sh.push([x, surf(x, 0)]);
    sh.push([x1, surf(x1, 0)]);
    g.push(h('path', { d: smoothD(sh) + ' L ' + N(x1) + ' ' + N(bot) + ' L ' + N(sx0) + ' ' + N(bot) + ' Z', fill: dark, opacity: 0.55 }));
    const shTop = surf(ix + 10, 0) + 8, shBot = iy + ih - 10;
    g.push(h('g', {}, shBot - shTop > 6 ? h('rect', { x: ix + 7, y: N(shTop), width: 7, height: N(shBot - shTop), rx: 3.5, fill: WHITE, opacity: 0.4 }) : null));
    const t = P.t;
    const bubs = P.still ? [{ u: 0.9, h: 0.16, r: 2.8, wa: 0, wf: 0, ph: 0, t0: 0 }, { u: 0.88, h: 0.3, r: 1.9, wa: 0, wf: 0, ph: 0, t0: 0 }].filter((b) => b.h < P.fill - 0.08) : P.bubbles;
    g.push(h('g', {}, bubs.map((b) => h('circle', { cx: N(ix + b.u * iw + b.wa * Math.sin(TAU * b.wf * (t - b.t0) + b.ph)), cy: N(iy + ih * (1 - b.h)), r: N(b.r), fill: WHITE, opacity: 0.55 }))));
    g.push(h('g', {}, (P.still ? [] : P.pops).map((q) => { const p = (t - q.t0) / 0.24, x = ix + q.u * iw; return h('circle', { cx: N(x), cy: N(surf(x, 0) - 1), r: N(2 + 4 * easeOut(p)), fill: 'none', stroke: WHITE, 'stroke-width': N(1.8 * (1 - p)), opacity: 0.8 }); })));
    g.push(h('path', { d: smoothD(front), fill: 'none', stroke: dark, 'stroke-width': 2.4, 'stroke-linecap': 'round' }));
    return [h('clipPath', { id: inId }, h('rect', { x: ix, y: iy, width: iw, height: ih, rx: ir })), h('clipPath', { id: lqId }, h('path', { d: liqD })), h('g', { 'clip-path': 'url(#' + inId + ')' }, g)];
  }
  function drawBody(cfg, s, P, E, pfx) {
    const [bx, by, bw, bh, br] = cfg.body, [cx, cy, cw, ch] = cfg.cap;
    const ix = bx + 10, iy = by + 10, iw = bw - 20, ih = bh - 20, ir = Math.max(br - 9, 8);
    const pcx = cx + cw / 2, pcy = cy + ch / 2 - 1, out = [];
    out.push(h('g', { transform: 'translate(0 ' + N(-P.capPop) + ')' },
      h('rect', { x: cx, y: cy, width: cw, height: ch, rx: 6, fill: INK }),
      lineP('M ' + (pcx - 4) + ' ' + pcy + ' L ' + (pcx + 4) + ' ' + pcy + ' M ' + pcx + ' ' + (pcy - 4) + ' L ' + pcx + ' ' + (pcy + 4), 2.4, WHITE),
      h('rect', { x: cx + 4, y: cy + 3, width: 5, height: 3, rx: 1.5, fill: '#5C566C' })));
    out.push(h('rect', { x: bx, y: by, width: bw, height: bh, rx: br, fill: WHITE, stroke: INK, 'stroke-width': 6 }));
    out.push(h('rect', { x: bx + bw - 16, y: by + 12, width: 7, height: bh - 24, rx: 3.5, fill: GLASS }));
    const gid = pfx + '-gl', fl = 0.86 + 0.14 * Math.sin(s.t * 17.3) * Math.sin(s.t * 5.1), glowOn = P.glow > 0.01;
    const glowRect = (op) => h('g', {}, glowOn ? h('rect', { x: bx + 3, y: by + 3, width: bw - 6, height: bh - 6, rx: br - 3, fill: 'url(#' + gid + ')', opacity: N(op * P.glow * fl) }) : null);
    out.push(h('g', {}, glowOn ? h('radialGradient', { id: gid, gradientUnits: 'userSpaceOnUse', cx: 120, cy: N(by + bh - 34), r: N(bh * 0.85) },
      h('stop', { offset: 0, 'stop-color': '#8FD6FF', 'stop-opacity': 0.9 }), h('stop', { offset: 0.55, 'stop-color': '#B5E5FF', 'stop-opacity': 0.45 }), h('stop', { offset: 1, 'stop-color': '#B5E5FF', 'stop-opacity': 0 })) : null));
    out.push(glowRect(1));
    out.push(drawLiquid(cfg, P, pfx, ix, iy, iw, ih, ir));
    out.push(glowRect(0.16));
    out.push(h('rect', { x: ix, y: iy, width: iw, height: ih, rx: ir, fill: 'none', stroke: INK, 'stroke-width': 1.6, opacity: 0.18 }));

    out.push(h('g', { transform: 'translate(' + N(P.gx * 1.4) + ' ' + N(P.gy * 1.0) + ')' }, drawFace(cfg, s, P, E, pfx)));
    return out;
  }
  function anchorOf(cfg, p, vn) {
    switch (p.anchor) {
      case 'org': return p.org[vn];
      case 'footL': return [cfg.feet.at[0][0] - 27, cfg.ground - 3];
      case 'footR': return [cfg.feet.at[1][0] + 27, cfg.ground - 3];
      case 'head': return [120, cfg.cap[1] - 12];
      case 'body': return [120, cfg.body[1] + cfg.body[3] * 0.5];
      case 'note': return cfg.acc.note;
    }
    return [120, 120];
  }
  function drawParticles(cfg, s, vn, back) {
    const out = [];
    for (const p of s.parts) {
      if ((p.k === 'puff') !== !!back) continue;
      const q = clamp((s.t - p.t0) / p.life), a = anchorOf(cfg, p, vn), x = a[0] + p.x, y = a[1] + p.y;
      const tf = (sc) => 'translate(' + N(x) + ' ' + N(y) + ') rotate(' + N(p.rot) + ') scale(' + N(Math.max(0, sc)) + ')';
      if (p.k === 'spark') { const sc = q < 0.18 ? easeOutBack(q / 0.18) : 1 - easeIn((q - 0.18) / 0.82); out.push(h('path', { d: sparkleD(p.s), fill: YELLOW, stroke: INK, 'stroke-width': 1.5, 'stroke-linejoin': 'round', transform: tf(sc) })); }
      else if (p.k === 'puff') { const r = p.s * (0.5 + 0.9 * easeOut(q)) * (1 - easeIn(q)); out.push(h('circle', { cx: N(x), cy: N(y), r: N(Math.max(0, r)), fill: WHITE, stroke: INK, 'stroke-width': 2 })); }
      else if (p.k === 'plus') { const sc = (q < 0.2 ? easeOutBack(q / 0.2) : 1 - easeIn((q - 0.2) / 0.8)) * p.s; out.push(h('g', { transform: tf(sc) }, lineP('M -4 0 L 4 0 M 0 -4 L 0 4', 5, INK), lineP('M -4 0 L 4 0 M 0 -4 L 0 4', 2.4, '#3CCB7F'))); }
      else if (p.k === 'note') {
        const sc = (q < 0.15 ? easeOutBack(q / 0.15) : 1 - easeIn(clamp((q - 0.7) / 0.3))) * p.s, wx = 3 * Math.sin(TAU * 1.2 * (s.t - p.t0) + p.ph);
        out.push(h('g', { transform: 'translate(' + N(x + wx) + ' ' + N(y) + ') rotate(' + N(p.rot) + ') scale(' + N(Math.max(0, sc)) + ')' }, ellP(0, 0, 3.4, 2.5, INK, 0, -20), lineP('M 2.9 -1 L 2.9 -11.5 Q 7.5 -9.5 6.5 -5.5', 2)));
      } else if (p.k === 'phone') out.push(h('g', { transform: tf(1.08) }, phoneShape(p.scroll, null, -1)));
    }
    return h('g', {}, out);
  }
  function drawAccents(cfg, s, P, m) {
    const t = s.t, A = P.acc, out = [];
    const head = [120, cfg.body[1] + 20], hw = Mx.ap(m, head[0], head[1]), dx = (hw[0] - head[0]) * 0.6, dy = (hw[1] - head[1]) * 0.6;
    const at = (k) => [cfg.acc[k][0] + dx, cfg.acc[k][1] + dy];
    if (A.bolt > 0.01) {
      const p = at('bolt'), sc = A.bolt * (1 + P.boltPulse), bob = P.still ? 0 : 1.5 * Math.sin(TAU * 1.1 * t);
      out.push(h('path', { d: BOLT_D, fill: P.boltPulse > 0.04 ? '#FFE15A' : YELLOW, stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round', transform: 'translate(' + N(p[0]) + ' ' + N(p[1] + bob) + ') rotate(' + N(P.still ? 0 : 4 * Math.sin(TAU * 0.7 * t)) + ') scale(' + N(sc) + ')' }));
    }
    for (const k of ['spark', 'spark2']) {
      if (A[k] > 0.01) {
        const p = at(k), sc = A[k] * (P.still ? 1 : 0.85 + 0.2 * Math.sin(TAU * 1.3 * t + (k === 'spark' ? 0 : 2)));
        out.push(h('path', { d: sparkleD(k === 'spark' ? 9 : 8), fill: YELLOW, stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round', transform: 'translate(' + N(p[0]) + ' ' + N(p[1]) + ') rotate(' + N(P.still ? 0 : (t * 40) % 360) + ') scale(' + N(sc) + ')' }));
      }
    }
    if (A.drop > 0.01) { // gota de suor escorrendo pela lateral do corpo
      const c = P.still ? 0.25 : (((t - s.dropT0) % 2.6) + 2.6) % 2.6;
      let sc = 0, yo = 0;
      if (c < 0.25) sc = easeOutBack(c / 0.25);
      else if (c < 1.35) { sc = 1; yo = 24 * easeIn((c - 0.25) / 1.1); }
      else if (c < 1.55) { sc = 1 - (c - 1.35) / 0.2; yo = 24 + 4 * ((c - 1.35) / 0.2); }
      if (sc > 0.01) { const p = Mx.ap(m, cfg.acc.drop[0], cfg.acc.drop[1] + yo); out.push(h('path', { d: DROP_D, fill: SKY, stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round', transform: 'translate(' + N(p[0]) + ' ' + N(p[1]) + ') scale(' + N(sc * A.drop) + ')' })); }
    }
    if (A.plug > 0.01) {
      const p = at('plug'), wig = P.still ? 0 : 9 * Math.sin(TAU * 3 * t) * Math.max(0, Math.sin(TAU * 0.4 * t));
      out.push(h('g', { transform: 'translate(' + N(p[0]) + ' ' + N(p[1] + (P.still ? 0 : 2 * Math.sin(TAU * 0.8 * t))) + ') scale(' + N(A.plug) + ')' }, plugBubble(wig)));
    }
    if (A.alert > 0.01) {
      const p = at('alert'), pulse = P.still ? 0 : Math.abs(Math.sin(TAU * 1.4 * t)), c = t % 2.2, sh = !P.still && c < 0.35 ? 12 * Math.sin(TAU * 10 * c) * (1 - c / 0.35) : 0;
      out.push(h('g', { transform: 'translate(' + N(p[0]) + ' ' + N(p[1]) + ') rotate(' + N(sh) + ') scale(' + N(A.alert * (1 + 0.08 * pulse)) + ')' }, alertBadge()));
    }
    return h('g', {}, out);
  }
  function drawCharacter(vn, s, pfx) {
    const cfg = V[vn], P = Object.assign({}, s.pose, { t: s.t }), E = s.eyes[vn], m = bodyMatrix(cfg, P), out = [];
    const sh = cfg.shadow, air = P.air;
    out.push(h('ellipse', { cx: N(sh[0] + P.shx * 0.5 + P.tilt * 0.6), cy: sh[1], rx: N(sh[2] * (1 - 0.3 * air) * (0.92 + 0.08 * P.sx)), ry: N(6 * (1 - 0.2 * air)), fill: INK, opacity: N(0.12 * (1 - 0.35 * air)) }));
    out.push(drawParticles(cfg, s, vn, true));
    const aL = armGeom(cfg, P, -1, m), aR = armGeom(cfg, P, 1, m), front = P.armFront;
    const armD = (a) => 'M ' + pt(a.S) + ' Q ' + pt(a.C) + ' ' + pt(a.E);
    out.push(h('g', {}, front ? null : [lineP(armD(aL), 7), lineP(armD(aR), 7)]));
    const fy = P.jy + P.tuck, hips = cfg.hips.map((p) => Mx.ap(m, p[0], p[1])), ank = cfg.ankles.map((p) => [p[0], p[1] + fy]);
    out.push(lineP('M ' + pt(hips[0]) + ' L ' + pt(ank[0]) + ' M ' + pt(hips[1]) + ' L ' + pt(ank[1]), 7));
    for (let i = 0; i < 2; i++) {
      const f = i ? 1 : -1, at = cfg.feet.at[i], y = at[1] + fy;
      const parts = cfg.feet.kind === 'sneaker' ? sneaker(at[0], y, f, cfg.feet.s) : bigShoe(at[0], y, f, cfg.feet.s);
      out.push(h('g', P.toe ? { transform: 'rotate(' + N(P.toe * f) + ' ' + at[0] + ' ' + N(y) + ')' } : {}, parts));
    }
    out.push(h('g', { transform: Mx.str(m) }, drawBody(cfg, s, P, E, pfx)));
    out.push(h('g', {}, front ? [lineP(armD(aL), 7), lineP(armD(aR), 7)] : null));
    const ph = [];
    if (P.phoneVis > 0.01) { const c = phoneAt(aL, aR); ph.push(h('g', { transform: 'translate(' + N(c[0]) + ' ' + N(c[1]) + ') rotate(' + N(P.flickRot * 0.5 + P.tilt * 0.3) + ') scale(' + N(1.08 * P.phoneVis) + ')' }, phoneShape(P.phoneScroll, pfx + '-sc', P.like))); }
    out.push(h('g', {}, ph));
    for (const [a, side] of [[aL, -1], [aR, 1]]) {
      const rot = a.ang + (side > 0 ? P.handRotR + P.flickRot * 1.4 : P.handRotL), mir = side > 0 ? -1 : 1;
      out.push(cfg.hand === 'mitten' ? mitten(a.H[0], a.H[1], rot, 1, mir) : glove4(a.H[0], a.H[1], rot, 1, mir));
    }
    out.push(drawAccents(cfg, s, P, m));
    out.push(drawParticles(cfg, s, vn, false));
    return h('g', {}, out);
  }

  const VIEW = { single: [-20, -16, 280, 262], compare: [-8, -16, 728, 284] }, CELL = 236;
  function scene(s, opts) {
    opts = opts || {};
    const layout = opts.layout || 'single', vs = layout === 'compare' ? VARIANTS : [opts.variant || s.variant], out = [];
    vs.forEach((v, i) => {
      const pfx = (opts.pfx || 'b') + v.slice(0, 2), g = drawCharacter(v, s, pfx);
      if (layout === 'compare') {
        const cid = pfx + '-cell';
        out.push(h('clipPath', { id: cid }, h('rect', { x: -8, y: -40, width: CELL, height: 330 })));
        out.push(h('g', { transform: 'translate(' + i * CELL + ' 0)' }, h('g', { 'clip-path': 'url(#' + cid + ')' }, g)));
      } else out.push(g);
    });
    return out;
  }
  function renderSVG(s, opts, W) {
    opts = opts || {};
    const vb = VIEW[opts.layout || 'single'], H = Math.round((W * vb[3]) / vb[2]);
    return toSVG(h('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: vb.join(' '), width: W, height: H },
      h('rect', { x: vb[0], y: vb[1], width: vb[2], height: vb[3], fill: opts.bg || '#FFF3E4' }), scene(s, opts)));
  }

  function handsOf(s, vn) { const cfg = V[vn], m = bodyMatrix(cfg, s.pose); return [armGeom(cfg, s.pose, -1, m).H, armGeom(cfg, s.pose, 1, m).H]; }
  root.BatCore = { handsOf, DT, VIEW, CELL, V, VARIANTS, BAND_NAMES, createSim, step, input, scene, renderSVG, toSVG, h, liquidColor, mixWhite };
})(typeof window !== 'undefined' ? window : globalThis);
