// Motion primitives for animation-dense shots. See reference/motion-design.md.
// Load it before the film script (see motion-demo.html). It reads the globals W, H, FPS and clamp
// that the film script defines, at call time.
// Every function is a pure function of time, so render(frame) stays seek-safe and repeatable.

// Critically damped spring step response, 0 → 1, reaching 0.99 at t = dur. No overshoot.
function spring(t, dur = 0.6) { if (t <= 0) return 0; const x = 6.64 / dur * t; return 1 - (1 + x) * Math.exp(-x); }
// Underdamped (zeta 0.8, about 1.5 % overshoot) for a "premium" settle.
function springSoft(t, dur = 0.7) {
  if (t <= 0) return 0; const z = 0.8, w = 5.3 / dur, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
}
// A value retargeted many times = base + one spring per change. changes: [[t0, from, to, dur], ...]
function springTrack(t, base, changes, fn = spring) { let v = base; for (const [t0, a, b, d] of changes) v += (b - a) * fn(t - t0, d); return v; }
// Stretchy indicator moving from x0 to x1 (width w): the leading edge springs faster than the
// trailing edge, so the pill stretches toward the target and catches up. Returns [left, width].
function stretchEdges(t, t0, x0, x1, w) {
  const fwd = x1 > x0, lead = spring(t - t0, 0.32), lag = spring(t - t0, 0.62);
  const l = x0 + (x1 - x0) * (fwd ? lag : lead), r = x0 + w + (x1 - x0) * (fwd ? lead : lag);
  return [l, r - l];
}

const easeOutExpo = u => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u);
// CSS cubic-bezier semantics, solved by Newton iteration on x.
function cubicBezier(x1, y1, x2, y2) {
  const bx = s => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  const by = s => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
  const dx = s => 3 * x1 * (1 - s) ** 2 + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s;
  return u => {
    if (u <= 0) return 0; if (u >= 1) return 1;
    let s = u; for (let i = 0; i < 8; i++) { const d = dx(s); if (Math.abs(d) < 1e-6) break; s -= (bx(s) - u) / d; }
    return by(clamp(s, 0, 1));
  };
}
const premium = cubicBezier(0.16, 1, 0.3, 1);
// Keyframes continuous in frame number (never floor a motion value). keys: [[frame, value], ...]
function kf(f, keys, ease = easeOutExpo) {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f0, v0] = keys[i - 1], [f1, v1] = keys[i];
    if (f <= f1) return v0 + (v1 - v0) * ease((f - f0) / (f1 - f0));
  }
  return keys[keys.length - 1][1];
}
// Seeded hash in place of Math.random: the same (i, salt) always gives the same value in [0, 1).
function hash(i, salt = 0) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return ((h ^ h >>> 16) >>> 0) / 4294967296;
}

// Beat grid. Set bpm and t0 (the measured first kick, seconds) per project.
const BEAT = { bpm: 120, t0: 0 };
const beat = n => BEAT.t0 + n * 60 / BEAT.bpm;
const bar = n => beat(n * 4);
const onBeat = (n, lead = 2 / FPS) => beat(n) - lead; // motion lands 2 frames before the beat

// Words rise from behind a mask line, staggered. Returns the drawn width.
function maskReveal(c, words, x, y, size, fam, t, t0, o = {}) {
  const stagger = o.stagger ?? 0.06, dur = o.dur ?? 0.55, weight = o.weight ?? 800;
  c.save(); c.font = `${weight} ${size}px ${fam}`; c.textBaseline = 'alphabetic'; c.fillStyle = o.color || c.fillStyle;
  let cx = x;
  for (let i = 0; i < words.length; i++) {
    const w = c.measureText(words[i]).width, p = spring(t - t0 - i * stagger, dur);
    c.save(); c.beginPath(); c.rect(cx - size, y - size * 1.1, w + 2 * size, size * 1.4); c.clip();
    if (p > 0.6 && typeof occCheck === 'function') occCheck(c, words[i], cx, y, w, size, 'alphabetic', c.globalAlpha);
    c.fillText(words[i], cx, y + (1 - p) * size * 1.15); c.restore();
    cx += w + size * 0.24;
  }
  c.restore(); return cx - x;
}
// Flood: a disc from (ox, oy) grows past the farthest corner. Returns progress 0..1.
function flood(c, t, t0, ox, oy, colour, dur = 0.3) {
  const R = 1.15 * Math.hypot(Math.max(ox, W - ox), Math.max(oy, H - oy)), p = premium(clamp((t - t0) / dur, 0, 1));
  if (p > 0) { c.save(); c.fillStyle = colour; c.beginPath(); c.arc(ox, oy, R * p, 0, Math.PI * 2); c.fill(); c.restore(); }
  return p;
}
// Iris: clip to a rotating n-blade polygon that opens over dur. Call between save() and restore().
function irisClip(c, t, t0, cx, cy, blades = 7, dur = 0.5) {
  const u = clamp((t - t0) / dur, 0, 1), R = 1.2 * Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * premium(u), rot = (1 - u) * 0.8;
  c.beginPath();
  for (let i = 0; i < blades; i++) { const a = rot + i * 2 * Math.PI / blades; c[i ? 'lineTo' : 'moveTo'](cx + R * Math.cos(a), cy + R * Math.sin(a)); }
  c.closePath(); c.clip();
}
// World camera. keys: [[t, x, y, scale], ...]; (x, y) is the world point at screen centre.
// Scale is interpolated in log space so zooms feel constant-speed.
function camAt(t, keys, ease = premium) {
  const at = (a, b, u) => [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, Math.exp(Math.log(a[3]) + (Math.log(b[3]) - Math.log(a[3])) * u)];
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return at(keys[i - 1], keys[i], ease((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return keys[keys.length - 1].slice(1);
}
function applyCam(c, cam) { c.translate(W / 2, H / 2); c.scale(cam[2], cam[2]); c.translate(-cam[0], -cam[1]); }
// macOS-style arrow. hover and press are 0..1 (springs); draw it last.
function cursor(c, x, y, hover = 0, press = 0, scale = 1.6) {
  const k = scale * (1 + 0.15 * hover - 0.14 * press);
  c.save(); c.translate(x, y); c.scale(k, k); c.fillStyle = '#111'; c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 22); c.lineTo(6, 17); c.lineTo(10, 26); c.lineTo(14, 24); c.lineTo(10, 16); c.lineTo(17, 16); c.closePath();
  c.stroke(); c.fill(); c.restore();
}
// Rounded rect path helper (morphing containers keep identity by springing x, y, w, h, r).
function rrect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.roundRect(x, y, w, h, r); }
// Subframe motion blur: average N renders at t + k/(FPS·N) onto the target. draw(c, t) must
// clear and paint a full frame. Costs N× render time; use only on fast segments.
const _acc = {};
function motionBlur(target, t, draw, n = 4, shutter = 0.5) {
  if (!_acc.c) { _acc.c = document.createElement('canvas'); _acc.c.width = W; _acc.c.height = H; _acc.x = _acc.c.getContext('2d'); }
  target.save(); target.globalAlpha = 1; draw(target, t - shutter / (2 * FPS)); target.restore();
  for (let k = 1; k < n; k++) {
    _acc.x.save(); draw(_acc.x, t + (k / (n - 1) - 0.5) * shutter / FPS); _acc.x.restore();
    target.save(); target.globalAlpha = 1 / (k + 1); target.drawImage(_acc.c, 0, 0); target.restore();
  }
}
