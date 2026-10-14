// Deterministic Canvas 2D documentary renderer (template, from the Rococo film 2026-10-07).
// Edit: palette, IMG_FILES, buildShots(), DURATION. Everything else is the engine.
// window.film.ready -> Promise; window.film.render(frame) -> dataURL (jpeg)
'use strict';
const W = 1920, H = 1080, FPS = 24;
const BAR = 138;
const PIC = { x: 0, y: BAR, w: W, h: H - 2 * BAR };
const INK = '#161210', IVORY = '#efe6d6', GOLD = '#c9a86a', GOLD2 = '#e2c98f';
const PASTELS = ['#e7b7c1', '#a9c4d6', '#cfd9b8', '#e9d6a8'];

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });

// ---------- utilities ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => { t = clamp(t, 0, 1); return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
const easeOut = t => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
const easeIn = t => { t = clamp(t, 0, 1); return t * t * t; };
// window fade: 0 before a, ramps to 1 by a+d, 1 until b-d, ramps to 0 by b
const win = (t, a, b, d = 0.5) => clamp(Math.min((t - a) / d, (b - t) / d), 0, 1);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function font(weight, size, fam) { return `${weight} ${size}px ${fam}`; }
const F_LAT = '"Didot"', F_SC = '"Bodoni 72 Smallcaps"', F_CN = '"Songti SC"';

// ---------- layout guard ----------
// Every opaque plate AND every text call registers the rect it occupies (occupy); every text call
// and the subtitle check against those rects when window.__LAYOUT_CHECK is set and report hits into
// window.__LAYOUT_WARN. scripts/render.js --check samples frames and fails on any hit. Rects are
// reset per shot draw; elements with alpha <= 0.5 (fading in or out) neither block nor collide.
// Every picture helper (portrait, contain, cover/kenburns) registers its rect, except a full-bleed
// cover (>= 90 % of the frame): text over a dimmed background is a design choice, use bottomShade
// there. veil() paints a wash and forgets what lies under it, so layered shots use veil, not fillRect.
// 2026-10-07: the guard passed twice with visible collisions (text over a portrait; a caption under
// the subtitle) because text did not register. Text registers now; keep it that way.
let OCC = [];
function occRect(c, x, y, w, h) { const m = c.getTransform(); const p1 = m.transformPoint(new DOMPoint(x, y)), p2 = m.transformPoint(new DOMPoint(x + w, y + h));
  return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) }; }
function occupy(c, x, y, w, h, label) { if (!window.__LAYOUT_CHECK || c.globalAlpha <= 0.5) return; OCC.push(Object.assign(occRect(c, x, y, w, h), { label })); }
function occCheck(c, s, x, y, w, size, base, alpha) {
  if (!window.__LAYOUT_CHECK || alpha <= 0.5 || !s) return;
  const top = base === 'middle' ? y - size * 0.5 : base === 'top' ? y : y - size * 0.78, h = size;
  const r = occRect(c, x, top, w, h);
  for (const o of OCC) { const ix = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x), iy = Math.min(r.y + r.h, o.y + o.h) - Math.max(r.y, o.y);
    if (ix > 4 && iy > 4) (window.__LAYOUT_WARN = window.__LAYOUT_WARN || []).push({ text: String(s).slice(0, 40), over: o.label, px: [Math.round(ix), Math.round(iy)] }); }
}
function veil(c, x, y, w, h, color, a) { // near-opaque wash over the frame; whatever was under it no longer counts as occupied
  if (a <= 0) return; c.save(); c.fillStyle = hexA(color, a); c.fillRect(x, y, w, h); c.restore();
  if (window.__LAYOUT_CHECK && a * c.globalAlpha >= 0.5) { /* >= 0.5: the covered layer is already receding, dissolve frames included */ const r = occRect(c, x, y, w, h); for (let i = OCC.length - 1; i >= 0; i--) { const o = OCC[i]; if (o.x >= r.x - 1 && o.y >= r.y - 1 && o.x + o.w <= r.x + r.w + 1 && o.y + o.h <= r.y + r.h + 1) OCC.splice(i, 1); } } }

function txt(c, s, x, y, o) {
  o = Object.assign({ fam: F_LAT, weight: 400, size: 40, color: IVORY, align: 'center', track: 0, alpha: 1, base: 'alphabetic' }, o);
  if (o.alpha <= 0) return;
  c.save();
  c.globalAlpha *= o.alpha;
  c.font = font(o.weight, o.size, o.fam);
  c.fillStyle = o.color;
  c.textBaseline = o.base;
  c.letterSpacing = `${o.track * o.size}px`;
  // letterSpacing adds trailing space; compensate for centered text
  const wdt = c.measureText(s).width;
  let xx = x;
  if (o.align === 'center') xx = x - wdt / 2 + (o.track * o.size) / 2;
  else if (o.align === 'right') xx = x - wdt + o.track * o.size;
  occCheck(c, s, xx, y, wdt, o.size, o.base, c.globalAlpha);
  occupy(c, xx, o.base === 'middle' ? y - o.size * 0.5 : o.base === 'top' ? y : y - o.size * 0.78, wdt, o.size, 'text "' + String(s).slice(0, 24) + '"'); // text registers too, so text-over-text is caught
  c.textAlign = 'left';
  c.fillText(s, xx, y);
  c.restore();
}

// ---------- rocaille scroll generator ----------
function spiral(turns, grow, n) {
  const pts = []; const thMax = turns * 2 * Math.PI; const rEnd = Math.exp(grow * thMax);
  for (let i = 0; i <= n; i++) { const th = thMax * i / n; const r = Math.exp(grow * th) / rEnd; pts.push([r * Math.cos(th), r * Math.sin(th)]); }
  return pts;
}
// S-scroll: spiral A then point-reflected copy through A's end. C-scroll: mirror across line ⟂ tangent at end.
function scrollPath(kind) {
  const A = spiral(1.6, 0.3, 90);
  const E = A[A.length - 1], P = A[A.length - 2];
  const tx = E[0] - P[0], ty = E[1] - P[1], tl = Math.hypot(tx, ty); const ux = tx / tl, uy = ty / tl;
  let B;
  if (kind === 'S') B = A.map(p => [2 * E[0] - p[0], 2 * E[1] - p[1]]);
  else B = A.map(p => { // reflect across line through E with direction normal (-uy,ux)
    const dx = p[0] - E[0], dy = p[1] - E[1]; const d = dx * ux + dy * uy; return [p[0] - 2 * d * ux, p[1] - 2 * d * uy];
  });
  B.reverse(); B.shift();
  let pts = A.concat(B);
  // rotate so the chord between the two spiral centres lies along +x
  const c0 = pts[0], c1 = pts[pts.length - 1]; const ang = Math.atan2(c1[1] - c0[1], c1[0] - c0[0]);
  const ca = Math.cos(-ang), sa = Math.sin(-ang); pts = pts.map(p => [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca]);
  // normalise to centre & unit size
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
  const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, sc = 1 / Math.max(maxx - minx, maxy - miny);
  return pts.map(p => [(p[0] - cx) * sc, (p[1] - cy) * sc]);
}
const PATH_S = scrollPath('S'), PATH_C = scrollPath('C');

// draw a scroll: centre (x,y), size (px), rotation, reveal p∈[0,1], mirror, width scale, alpha
function scroll(c, path, x, y, size, rot, p, o) {
  o = Object.assign({ mirror: false, color: GOLD, lw: 1, alpha: 1, leaves: true, glow: true }, o);
  if (p <= 0 || o.alpha <= 0) return;
  const L = path.length; const n = Math.max(3, Math.floor(L * clamp(p, 0, 1)));
  c.save();
  c.translate(x, y); c.rotate(rot); if (o.mirror) c.scale(-1, 1);
  c.globalAlpha *= o.alpha; c.strokeStyle = o.color; c.fillStyle = o.color; c.lineCap = 'round'; c.lineJoin = 'round';
  if (o.glow) { c.shadowColor = 'rgba(226,201,143,0.5)'; c.shadowBlur = size * 0.03; }
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(L - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const u = i / L; const w = (0.5 + 3.4 * Math.sin(Math.PI * u) ** 1.4) * o.lw * size / 160 * clamp((n - 1 - i) / 6, 0, 1);
    const px = path[i][0] * size, py = path[i][1] * size;
    left.push([px - dy * w / 2, py + dx * w / 2]); right.push([px + dy * w / 2, py - dx * w / 2]);
  }
  c.beginPath(); c.moveTo(left[0][0], left[0][1]); for (let i = 1; i < n; i++) c.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) c.lineTo(right[i][0], right[i][1]); c.closePath(); c.fill();
  if (o.leaves) {
    c.shadowBlur = 0;
    for (const sp of [0.3, 0.44, 0.58, 0.72]) {
      const i = Math.floor(sp * L); if (i >= n - 4) continue;
      const a = path[i], b = path[i + 1]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); const nx = -dy / l, ny = dx / l;
      const len = size * 0.085 * clamp((n - i) / 10, 0, 1);
      c.lineWidth = 1.3 * o.lw * size / 160; c.beginPath(); c.moveTo(a[0] * size, a[1] * size);
      c.quadraticCurveTo(a[0] * size + nx * len * 0.9 + dx / l * len * 0.4, a[1] * size + ny * len * 0.9 + dy / l * len * 0.4, a[0] * size + nx * len * 0.6 + dx / l * len * 1.1, a[1] * size + ny * len * 0.6 + dy / l * len * 1.1);
      c.stroke();
    }
  }
  c.restore();
}
// symmetric cartouche: 2 S-scrolls (left/right) + 2 C-scrolls (top/bottom), staggered reveal p∈[0,1]
function cartouche(c, x, y, w, h, p, alpha, lw = 1) {
  const pr = (k) => clamp((p - k) / 0.6, 0, 1);
  scroll(c, PATH_S, x - w / 2, y, h, Math.PI / 2, pr(0), { alpha, lw });
  scroll(c, PATH_S, x + w / 2, y, h, Math.PI / 2, pr(0), { alpha, lw, mirror: true });
  scroll(c, PATH_C, x, y - h / 2 - 70, w * 0.17, 0, pr(0.3), { alpha, lw });
  scroll(c, PATH_C, x, y + h / 2 + 70, w * 0.17, Math.PI, pr(0.3), { alpha, lw });
}
function hairline(c, x1, y1, x2, y2, alpha, lw = 1) {
  if (alpha <= 0) return; c.save(); c.globalAlpha *= alpha; c.strokeStyle = GOLD; c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
}

// ---------- images & Ken Burns ----------
const IMG = {};
const IMG_FILES = ['example-painting', 'example-plate']; // basenames under assets/prepped/*.jpg

// cover-draw img into rect with scale factor s (1 = exact cover) focused at normalised (cx,cy)
function cover(c, img, r, s, cx, cy) {
  const sc = Math.max(r.w / img.width, r.h / img.height) * s;
  const dw = img.width * sc, dh = img.height * sc;
  let dx = r.x + r.w / 2 - cx * dw, dy = r.y + r.h / 2 - cy * dh;
  dx = clamp(dx, r.x + r.w - dw, r.x); dy = clamp(dy, r.y + r.h - dh, r.y);
  c.drawImage(img, dx, dy, dw, dh);
  if (r.w < W * 0.9 || r.h < H * 0.9) occupy(c, r.x, r.y, r.w, r.h, 'plate'); // full-bleed backgrounds are exempt
}
function kenburns(c, img, r, from, to, u) {
  const t = clamp(u, 0, 1.3); // allow slight overrun while being faded out
  cover(c, img, r, lerp(from[0], to[0], t), lerp(from[1], to[1], t), lerp(from[2], to[2], t));
}
// fit img inside rect (contain), returns drawn rect
function contain(c, img, r, pad = 0) {
  const sc = Math.min((r.w - 2 * pad) / img.width, (r.h - 2 * pad) / img.height);
  const dw = img.width * sc, dh = img.height * sc; const dx = r.x + (r.w - dw) / 2, dy = r.y + (r.h - dh) / 2;
  occupy(c, dx, dy, dw, dh, 'plate'); c.drawImage(img, dx, dy, dw, dh); return { x: dx, y: dy, w: dw, h: dh };
}
function bottomShade(c, r, a = 0.55) {
  const g = c.createLinearGradient(0, r.y + r.h * 0.55, 0, r.y + r.h); g.addColorStop(0, 'rgba(10,8,6,0)'); g.addColorStop(1, `rgba(10,8,6,${a})`);
  c.fillStyle = g; c.fillRect(r.x, r.y + r.h * 0.55, r.w, r.h * 0.45);
}
function caption(c, s, alpha, light) { // museum caption, top-right of picture
  txt(c, s, PIC.x + PIC.w - 72, PIC.y + 70, { fam: F_LAT, size: 22, color: light ? '#6b5f4e' : GOLD2, align: 'right', track: 0.12, alpha: alpha * 0.9 });
}
function chapter(c, roman, en, cn, t, t0) { // chapter marker top-left for 4.5 s
  const a = win(t, t0 + 0.3, t0 + 5.0, 0.7); if (a <= 0) return;
  const x = 72, y = PIC.y + 70;
  txt(c, `${roman}`, x, y, { fam: F_LAT, size: 26, color: GOLD, align: 'left', track: 0.2, alpha: a });
  txt(c, en, x + 60, y, { fam: F_LAT, size: 26, color: GOLD, align: 'left', track: 0.25, alpha: a });
  txt(c, cn, x + 60 + ctxMeasure(en, 26, F_LAT, 0.25) + 26, y - 1, { fam: F_CN, weight: 300, size: 26, color: GOLD, align: 'left', track: 0.12, alpha: a });
  hairline(c, x, y + 18, x + 60 + ctxMeasure(en, 26, F_LAT, 0.25) + 26 + ctxMeasure(cn, 26, F_CN, 0.12) * clamp((t - t0 - 0.3) / 1.4, 0, 1), y + 18, a, 1);
}
function ctxMeasure(s, size, fam, track) { ctx.save(); ctx.font = font(400, size, fam); ctx.letterSpacing = `${track * size}px`; const w = ctx.measureText(s).width; ctx.restore(); return w; }
// label with gold dot & leader line + small scroll flourish (callout on plates)
function callout(c, px, py, lx, ly, en, cn, a, dark = true) {
  if (a <= 0) return;
  const col = dark ? INK : IVORY; const g = GOLD;
  const r = easeOut(a);
  c.save(); c.globalAlpha *= clamp(a * 2, 0, 1);
  c.fillStyle = g; c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = g; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(lerp(px, lx, r), lerp(py, ly, r)); c.stroke();
  const dir = lx > px ? 1 : -1;
  if (r > 0.95) { c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + dir * 150, ly); c.stroke(); }
  c.restore();
  const ta = clamp((a - 0.6) / 0.4, 0, 1);
  txt(c, en, lx + dir * 8, ly - 12, { fam: F_LAT, size: 22, color: g, align: dir > 0 ? 'left' : 'right', track: 0.22, alpha: ta });
  txt(c, cn, lx + dir * 8, ly + 34, { fam: F_CN, weight: 400, size: 30, color: col, align: dir > 0 ? 'left' : 'right', track: 0.1, alpha: ta });
  scroll(c, PATH_C, lx + dir * 170, ly, 36, dir > 0 ? -Math.PI / 2 : Math.PI / 2, ta, { lw: 1.4, leaves: false, glow: false });
}
function plateFrame(c, r, a) { // thin gold frame around a plate image
  if (a <= 0) return; c.save(); c.globalAlpha *= a; c.strokeStyle = GOLD; c.lineWidth = 1.2; c.strokeRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28); c.restore();
}

// ---------- timeline / subtitles ----------
let TL = null;
function cueAt(t) { for (const q of TL.cues) if (t >= q.start - 0.15 && t <= q.end + 0.45) return q; return null; }
function subtitle(c, t, light) {
  const q = cueAt(t); if (!q) return;
  const a = win(t, q.start - 0.15, q.end + 0.45, 0.3);
  const y = PIC.y + PIC.h - 56;
  if (!light) { c.save(); c.globalAlpha = a * 0.9; c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 14; c.shadowOffsetY = 1;
    txt(c, q.text, W / 2, y, { fam: F_CN, weight: 400, size: 38, color: '#f3ece0', track: 0.06, alpha: 1 }); c.restore(); }
  else txt(c, q.text, W / 2, y, { fam: F_CN, weight: 400, size: 38, color: INK, track: 0.06, alpha: a * 0.92 });
}

// ---------- shots ----------
// each shot: t0 (start, s), xf (crossfade-in seconds), draw(c, t, u) with u = t - t0,
// opts: light (subtitle in ink colour for pale shots), lightFrom (seconds after t0 when it turns light), noSub.
// Shots are selected by "latest t0 <= t"; keep them sorted. Key t0 to narration cue starts (T[i]) or section starts (SEC.id.start).
const SHOTS = [];
function shot(t0, xf, draw, opts = {}) { SHOTS.push(Object.assign({ t0, xf, draw }, opts)); }
const SEC = {};
function buildShots() {
  for (const s of TL.sections) SEC[s.id] = s;
  const T = Object.fromEntries(TL.cues.map((q, i) => [i, q.start]));
  // --- title card: cartouche draws itself, then the title settles inside it
  shot(0, 0, (c, t) => {
    c.fillStyle = INK; c.fillRect(0, 0, W, H);
    const p = clamp((t - 2.0) / 9.5, 0, 1);
    const titleA = ease((t - (T[2] != null ? T[2] : T[0] + 10)) / 1.4); // title lands on the 3rd line ("人们后来叫它…")
    const sc = lerp(1, 0.78, titleA);
    cartouche(c, W / 2, H / 2 + 10, 1240 * sc, 300 * sc, p, (0.35 + 0.65 * (1 - titleA)) * clamp(t - 1.5, 0, 1), 1);
    txt(c, 'A SUBTITLE IN SMALL CAPS', W / 2, H / 2 - 92, { fam: F_LAT, size: 22, color: GOLD, track: 0.42, alpha: ease((titleA - 0.5) * 2) });
    txt(c, 'TITLE', W / 2, H / 2 + 36, { fam: F_LAT, size: 150, color: IVORY, track: 0.3, alpha: titleA });
    txt(c, '中文标题 · 副题', W / 2, H / 2 + 118, { fam: F_CN, weight: 300, size: 44, color: IVORY, track: 0.22, alpha: titleA * 0.95 });
  });
  // --- chapter on a painting with Ken Burns + museum caption
  const o = TL.sections[1] ? SEC[TL.sections[1].id].start : 20;
  shot(o, 1.6, (c, t, u) => { c.fillStyle = INK; c.fillRect(0, 0, W, H);
    kenburns(c, IMG['example-painting'], PIC, [1.0, 0.42, 0.5], [1.14, 0.56, 0.48], u / 9.8); bottomShade(c, PIC, 0.45);
    chapter(c, 'I', 'CHAPTER', '章名', t, o);
    caption(c, 'Artist · Title · year · Museum', win(t, o + 2, o + 9.5, 0.8)); });
  // --- museum plate on ivory with callouts (light shot: subtitles in ink)
  const d = o + 10;
  shot(d, 1.2, (c, t) => { c.fillStyle = IVORY; c.fillRect(0, 0, W, H);
    const box = { x: W / 2 - 300, y: PIC.y + 34, w: 600, h: PIC.h - 68 };
    const rr = contain(c, IMG['example-plate'], box); plateFrame(c, rr, ease((t - d - 0.5) / 1.2));
    callout(c, rr.x + rr.w * 0.5, rr.y + rr.h * 0.3, box.x + box.w + 90, box.y + 120, 'DETAIL', '细节', clamp((t - d - 1.0) / 1.4, 0, 1));
  }, { light: true });
  // --- outro + credits (noSub: no subtitles over the end cards)
  const ot = Math.max(TL.vo_end + 1.0, d + 8); // outro after the narration ends (and after the plate)
  shot(ot, 1.6, (c, t) => { c.fillStyle = INK; c.fillRect(0, 0, W, H);
    cartouche(c, W / 2, H / 2 + 20, 1300, 300, clamp((t - ot) / 3.5, 0, 1), 0.55 * clamp(t - ot, 0, 1), 0.9);
    txt(c, '结尾一句。', W / 2, H / 2 + 20, { fam: F_CN, weight: 300, size: 60, color: IVORY, track: 0.22, alpha: ease((t - ot - 0.3) / 1.2) });
  }, { noSub: true });
  const cr = ot + 8.4;
  shot(cr, 1.4, (c, t) => { c.fillStyle = INK; c.fillRect(0, 0, W, H);
    const L = [ // [cn, en, isHeading] — every image with artist, title, year, holder, licence
      ['片名', 'TITLE', true], ['', ''],
      ['当代设计  Dylan', ''], ['Model  Claude Fable 5.1', ''], ['', ''],   // only these two lines before IMAGES: no narration, music, tooling or local-folder credits
      ['IMAGES', '', true], ['Artist, Title (year), Museum · public domain / CC0 / CC BY-SA 4.0 (photo: name)', '']];
    const a0 = ease((t - cr - 0.2) / 1.2) * (1 - easeIn((t - cr - 7.2) / 1.6));
    let y = PIC.y + 92;
    for (const [cn, en, head] of L) {
      if (cn === '' && en === '') { y += 18; continue; }
      if (head) { txt(c, cn === 'IMAGES' ? cn : en, W / 2, y, { fam: F_LAT, size: 22, color: GOLD, track: 0.34, alpha: a0 }); if (cn !== 'IMAGES') { y += 30; txt(c, cn, W / 2, y, { fam: F_CN, weight: 300, size: 24, color: IVORY, track: 0.2, alpha: a0 }); } y += 44; continue; }
      txt(c, cn, W / 2, y, { fam: /[一-鿿]/.test(cn) ? F_CN : F_LAT, weight: 300, size: 24, color: '#cfc4b0', track: 0.04, alpha: a0 * 0.9 }); y += 38;
    }
  }, { noSub: true });
  SEC.__credits = cr;
}
const DURATION = () => SEC.__credits + 9.6; // credits end + 2 s fade

// ---------- post: grain, vignette, grade, letterbox ----------
const GRAINS = []; const VIG = mk(W, H);
function buildPost() {
  const rnd = mulberry32(20261007);
  for (let k = 0; k < 10; k++) { const g = mk(960, 540); const gc = g.getContext('2d'); const id = gc.createImageData(960, 540); const d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = 96 + rnd() * 64; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } gc.putImageData(id, 0, 0); GRAINS.push(g); }
  const vc = VIG.getContext('2d'); const g = vc.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); vc.fillStyle = g; vc.fillRect(0, 0, W, H);
}
function post(c, frame) {
  c.save();
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.18; c.drawImage(GRAINS[frame % GRAINS.length], 0, 0, W, H);
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 1; c.drawImage(VIG, 0, 0);
  c.globalCompositeOperation = 'soft-light'; c.globalAlpha = 0.22; c.fillStyle = '#d9a86c'; c.fillRect(0, 0, W, H);
  c.restore();
  c.fillStyle = '#000'; c.fillRect(0, 0, W, BAR); c.fillRect(0, H - BAR, W, BAR);
}

// ---------- compositor ----------
const BUF_A = mk(W, H), BUF_B = mk(W, H);
function drawShot(sh, t, target) {
  OCC = []; const c = target.getContext('2d'); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  sh.draw(c, t, t - sh.t0); c.restore();
}
function isLight(sh, t) { if (!sh.light) return false; if (sh.lightFrom != null) return t - sh.t0 >= sh.lightFrom; return true; }
function render(frame) {
  const t = frame / FPS;
  let i = 0; for (let k = 0; k < SHOTS.length; k++) if (SHOTS[k].t0 <= t) i = k;
  const cur = SHOTS[i], prev = SHOTS[i - 1];
  const xa = cur.xf > 0 ? ease((t - cur.t0) / cur.xf) : 1;
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  let subLight;
  if (xa < 1 && prev) { drawShot(prev, t, BUF_A); ctx.drawImage(BUF_A, 0, 0); subLight = isLight(prev, t); }
  drawShot(cur, t, BUF_B); ctx.globalAlpha = xa; ctx.drawImage(BUF_B, 0, 0); ctx.globalAlpha = 1;
  if (xa >= 0.5 || prev == null) subLight = isLight(cur, t);
  ctx.restore();
  // end fade to black
  const D = DURATION(); const ef = clamp((t - (D - 2.0)) / 2.0, 0, 1);
  if (!cur.noSub) subtitle(ctx, t, subLight);
  post(ctx, frame);
  if (ef > 0) { ctx.fillStyle = `rgba(0,0,0,${ef})`; ctx.fillRect(0, 0, W, H); }
  return canvas.toDataURL('image/jpeg', 0.95);
}

// ---------- boot ----------
async function boot() {
  TL = await (await fetch('../timeline.json')).json();
  const fonts = [font(400, 40, F_LAT), font(400, 40, F_SC), font(300, 40, F_CN), font(400, 40, F_CN)];
  for (const f of fonts) { await document.fonts.load(f); if (!document.fonts.check(f)) throw new Error('font not available: ' + f); }
  for (const f of IMG_FILES) { const im = new Image(); im.src = '../assets/prepped/' + f + '.jpg'; await im.decode(); IMG[f] = im; }
  ctx.imageSmoothingQuality = 'high';
  buildPost(); buildShots();
  return { frames: Math.round(DURATION() * FPS), fps: FPS };
}
window.film = { ready: boot(), render, fontCheck() { return fonts_check(); } };
function fonts_check() { return [F_LAT, F_SC, F_CN].map(f => [f, document.fonts.check(`40px ${f}`)]); }
