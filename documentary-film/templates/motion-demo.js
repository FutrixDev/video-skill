// Motion demo (6 s, 60 fps): a starting point for animation-dense pieces and a test of motion.js.
// Shot 1: masked type + stretchy tab pill + cursor click → flood. Shot 2: world camera over a card
// grid with subframe motion blur → iris. Shot 3: springing counter on the beat.
// Copy motion-demo.html to render/index.html, this file and motion.js to render/.
const W = 1920, H = 1080, FPS = 60;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const canvas = document.getElementById('c'); const ctx = canvas.getContext('2d');
const F = '"Helvetica Neue"';
const PAPER = '#f1ede4', INK = '#151515', ACCENT = '#ff5a1f', NIGHT = '#101318';
const DUR = 6.0;
BEAT.bpm = 120; BEAT.t0 = 0; // demo has no music; beats every 0.5 s from 0

// ---------- shot 1: type, tabs, cursor (0 → flood at T_FLOOD) ----------
const TABS = ['Script', 'Beats', 'Render'], TAB_X = [700, 900, 1100], TAB_W = 180, TAB_Y = 640;
const BTN = { x: 1340, y: 610, w: 260, h: 84 };
const T_FLOOD = onBeat(4);
function shot1(c, t) {
  c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  // shot enters already moving: the headline block drifts left the whole shot
  const drift = -40 * easeOutExpo(clamp(t / 2.2, 0, 1));
  c.fillStyle = INK; maskReveal(c, ['MORE', 'MOTION,'], 300 + drift, 430, 150, F, t, -0.12);
  c.fillStyle = ACCENT; maskReveal(c, ['LESS', 'FADING.'], 300 + drift, 580, 150, F, t, 0.1);
  // tab bar: pill moves Script → Beats → Render on beats 1 and 2, edges on different springs
  const bars = spring(t - 0.1, 0.5);
  c.globalAlpha = bars; c.fillStyle = 'rgba(0,0,0,.06)'; rrect(c, 690 + drift, TAB_Y + (1 - bars) * 30, 600, 76, 38); c.fill(); c.globalAlpha = 1;
  let [l, w] = stretchEdges(t, onBeat(1), TAB_X[0], TAB_X[1], TAB_W);
  if (t > onBeat(2)) { [l, w] = stretchEdges(t, onBeat(2), TAB_X[1], TAB_X[2], TAB_W); }
  c.globalAlpha = bars; c.fillStyle = INK; rrect(c, l + drift, TAB_Y + 8 + (1 - bars) * 30, w, 60, 30); c.fill();
  c.font = `600 30px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  TABS.forEach((s, i) => { const on = clamp(1 - Math.abs((l + w / 2) - (TAB_X[i] + TAB_W / 2)) / 120, 0, 1);
    c.fillStyle = on > 0.5 ? PAPER : INK; c.globalAlpha = bars; c.fillText(s, TAB_X[i] + TAB_W / 2 + drift, TAB_Y + 38 + (1 - bars) * 30); });
  c.globalAlpha = 1; c.textAlign = 'left';
  // button pops in, cursor homes on its live position, press on beat 4
  const bIn = springSoft(t - onBeat(2) - 0.15, 0.5), press = spring(t - (T_FLOOD - 0.12), 0.1) - spring(t - T_FLOOD, 0.15);
  const bs = (0.85 + 0.15 * bIn) * (1 - 0.04 * press), bx = BTN.x + drift, cx = bx + BTN.w / 2, cy = BTN.y + BTN.h / 2;
  c.save(); c.translate(cx, cy); c.scale(bs, bs); c.globalAlpha = clamp(bIn * 1.4, 0, 1);
  c.fillStyle = ACCENT; rrect(c, -BTN.w / 2, -BTN.h / 2, BTN.w, BTN.h, 42); c.fill();
  c.fillStyle = '#fff'; c.font = `700 32px ${F}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Render  →', 0, 2); c.restore();
  const k = spring(t - 1.2, 0.75), sx = 1820 - 160 * easeOutExpo(clamp(t / 1.2, 0, 1)), sy = 1060 - 90 * easeOutExpo(clamp(t / 1.2, 0, 1));
  const mx = sx + (cx + 20 - sx) * k, my = sy + (cy + 10 - sy) * k; // drifts in from frame 0, then homes on the button
  cursor(c, mx, my, spring(t - 1.8, 0.2), press);
  flood(c, t, T_FLOOD, cx, cy, NIGHT, 0.3);
}

// ---------- shot 2: world camera over a card grid ----------
const T2 = T_FLOOD + 0.3, T_IRIS = onBeat(9);
const CARDS = Array.from({ length: 35 }, (_, i) => ({ x: (i % 7) * 420, y: Math.floor(i / 7) * 300, hue: Math.floor(hash(i, 3) * 360) }));
const CAM = [[T2 - 0.3, 1260, 600, 0.55], [T2 + 0.9, 1260, 600, 0.62], [T2 + 1.5, 2100, 900, 2.2], [T_IRIS + 0.3, 2140, 905, 2.6]];
function shot2(c, t) {
  c.fillStyle = NIGHT; c.fillRect(0, 0, W, H);
  c.save(); applyCam(c, camAt(t, CAM));
  for (const [i, cd] of CARDS.entries()) {
    const p = spring(t - T2 + 0.15 - hash(i, 7) * 0.35, 0.6);
    c.globalAlpha = p; c.fillStyle = `hsl(${cd.hue} 55% ${i === 26 ? 58 : 22}%)`;
    rrect(c, cd.x, cd.y + (1 - p) * 60, 380, 260, 28 * (1 - 0.6 * (i === 26 ? spring(t - T2 - 1.2, 0.6) : 0))); c.fill();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `600 34px ${F}`; c.fillText(`Shot ${String(i + 1).padStart(2, '0')}`, cd.x + 28, cd.y + 60 + (1 - p) * 60);
  }
  c.restore(); c.globalAlpha = 1;
}

// ---------- shot 3: counter on the beat ----------
function shot3(c, t) {
  c.fillStyle = ACCENT; c.fillRect(0, 0, W, H);
  const n = Math.round(springTrack(t, 0, [[T_IRIS + 0.1, 0, 60, 0.6], [onBeat(10), 60, 120, 0.6]]));
  c.fillStyle = '#fff'; c.font = `800 360px ${F}`; c.textBaseline = 'alphabetic';
  const s = String(n), wv = c.measureText('000').width; c.textAlign = 'right'; c.fillText(s, W / 2 + wv / 2, 640);
  c.textAlign = 'left'; c.fillStyle = INK; maskReveal(c, ['BEATS', 'PER', 'MINUTE'], W / 2 - wv / 2 + 10, 790, 90, F, t, onBeat(10) + 0.1);
}

function scene(c, t) {
  if (t < T2) return shot1(c, t);
  if (t < T_IRIS) return shot2(c, t);
  shot2(c, t); c.save(); irisClip(c, t, T_IRIS, W / 2, H / 2, 7, 0.45); shot3(c, t); c.restore();
}
function render(frame) {
  const t = frame / FPS;
  const fast = t > T2 + 0.9 && t < T2 + 1.5; // blur only the fast camera move
  if (fast) motionBlur(ctx, t, scene, 6); else scene(ctx, t);
  return canvas.toDataURL('image/jpeg', 0.95);
}
async function boot() {
  const f = `800 40px ${F}`; await document.fonts.load(f); if (!document.fonts.check(f)) throw new Error('font not available: ' + f);
  return { frames: Math.round(DUR * FPS), fps: FPS };
}
window.film = { ready: boot(), render, fontCheck() { return [[F, document.fonts.check(`40px ${F}`)]]; } };
