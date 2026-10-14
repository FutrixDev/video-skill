# Motion design: making a film animation-dense

Distilled from 230 cases on prompt-motion.com (research 2026-10-07:
`videoK/research/prompt-motion/README.md`, dataset `cases.json`). `[n]` is a case index there. Each case
has `author` and `post`. Borrow techniques freely, but credit the case when you copy a specific idea
and never paste someone's prompt wholesale.

The best cases use the same architecture as this skill: `render(frame)` is a pure function of time,
Playwright screenshots each frame, and ffmpeg encodes. What the documentary engine lacks is the
**motion grammar**. Use this file when the user asks for 动画 / 动态图形 / motion graphics, a product
film, an explainer, a showreel, or "more animation" in a documentary.

## 1. Brief skeleton (write it before any code)

The most reliable cases ([142][214][222][123]) follow six sections, so write the plan in this shape:

```
<inputs>     what the user must supply: product URL / screenshots / logo / brand colours / music / VO.
             Ask once, then proceed with stated defaults.
<direction>  one sentence of mood + 3 reference styles + the banned list (§4) + "3 extraordinary
             moments, not 10 mediocre ones"
<structure>  beat map: a table of time → shot → the ONE idea → the transition into the next shot.
             At 120 BPM a beat is 0.5 s; plan a new idea every 1.5–2 s (3–4 beats).
<build>      stack, fps, resolution, render command, where assets live
<gotchas>    known traps (§5)
<start>      first deliverable = beat map + 4 stills, wait for OK, then the full render
```

## 2. Technique vocabulary → where it was done well

| Technique | What it is | Cases |
|---|---|---|
| Masked type reveal | A word rises from behind a mask line, staggered by 40–60 ms per word or letter | [4][126][192][212] |
| Kinetic type as objects | Words move, scale and stack as designed objects; heavy grotesk type (Anton-like) | [126][61][88] |
| Handwriting draw-on | `stroke-dashoffset` / partial path length on a script font outline | [22][173] |
| Object-driven transition / match cut | The next scene grows out of an element in this one: chart line → document edge, pill → button, number → invoice amount | [0][92][142][214] |
| Flood transition | A shape grows past every corner (overscale ≥ 1.15 × diagonal) in about 0.3 s, then contracts into the next scene | [214][222] |
| Iris | Blade polygon or circle aperture opens on the new scene | [214] |
| Continuous morph | One container keeps its identity across UI states; position, size and radius spring between them | [123]/[211] |
| World camera | Every scene lives on one big "world" layer; the camera tracks (x, y, log-scale); only one camera move at a time | [204][92] |
| Cursor | A single arrow drives real clicks: it homes on the live target, grows on hover, shrinks on press | [0][30][92][142] |
| Goo / liquid | Blur plus an alpha threshold merges blobs; liquid glass = displacement of a cloned backdrop | [214] |
| Persistent model explainer | One visual model (bucket, graph, tree) stays on screen and gains state step by step | [76][91][224] |
| Physics-as-music | Collision events are the notes; the picture is locked to the beat | [176][75][153] |
| One-material film | The whole piece speaks one material: riso, oscilloscope, clay, paper, engraving, pixel | [69][70][49][22][217][209] |

## 3. Primitives: `templates/motion.js`

Load `motion.js` before the film script (it reads `W`, `H`, `FPS` and `clamp` at call time). Every
function is a pure function of `t` in seconds. `templates/motion-demo.{html,js}` is a 6 s, 60 fps
piece that uses all of them. Copy it as the starting point for a motion-dense project, or read it
as usage examples.

| Function | Use |
|---|---|
| `spring(t, dur)`, `springSoft(t, dur)` | 0→1 step response; critically damped / ~1.5 % overshoot |
| `springTrack(t, base, [[t0, from, to, dur], …])` | a value retargeted many times, as a sum of springs (stateless, seek-safe) |
| `stretchEdges(t, t0, x0, x1, w)` | tab pill / toggle knob whose two edges ride different springs → `[left, width]` |
| `kf(frame, [[f, v], …], ease)` | keyframe table, continuous in frame number |
| `cubicBezier(x1, y1, x2, y2)`, `premium`, `easeOutExpo` | CSS-exact curves; `premium` = (0.16, 1, 0.3, 1) |
| `hash(i, salt)` | seeded random in [0, 1) in place of `Math.random` |
| `BEAT`, `beat(n)`, `bar(n)`, `onBeat(n)` | beat grid; `onBeat` lands motion 2 frames early |
| `maskReveal(c, words, x, y, size, fam, t, t0, o)` | words rise from behind a mask line, staggered |
| `flood(c, t, t0, ox, oy, colour, dur)` | disc grows past the farthest corner (≈0.3 s), cut under it |
| `irisClip(c, t, t0, cx, cy, blades, dur)` | rotating n-blade aperture clip for the incoming shot |
| `camAt(t, [[t, x, y, s], …])`, `applyCam(c, cam)` | world camera, log-scale zoom |
| `cursor(c, x, y, hover, press)` | macOS arrow; home it on the target's live position |
| `rrect(c, x, y, w, h, r)` | rounded rect for morphing containers (spring x, y, w, h, r) |
| `motionBlur(ctx, t, scene, n)` | n subframes across a 180° shutter, averaged; use on fast moves only (n× cost) |

Demo render of the pattern (2026-10-07): 360 frames in 5.5 s with one Playwright worker.

Goo (not in motion.js, add it when needed): draw the blobs into an offscreen canvas with
`filter = 'blur(14px)'`, then threshold alpha (`a > 128 ? 255 : 0`) through `getImageData`.

## 4. Rules and the banned list

- One shot = one idea. A new idea every 1.5–2 s. Three extraordinary moments beat ten mediocre ones.
- Every transition is motivated by an object (§2). **Banned: crossfade, generic slide, random wipe,
  zoom-blur spam.** In a documentary, crossfades stay for slow archival images only; motion
  segments never use them.
- Shots enter already moving: at frame 0 of a shot, elements are mid-ease toward their resting
  place, never static.
- Springs are critically damped, or have under 2 % overshoot. No bouncy UI.
- Never two camera moves at once. Text inside a morphing container has its own mask and timing.
- **Banned decoration:** particles, shockwave rings, RGB split, camera shake, lens flares, neon glow,
  glassmorphism everywhere, corner HUD micro-text, fake timecodes, "AI" chrome.
- One material per film (paper, riso, clay, engraving, pixel, Swiss). Don't mix.
- Sound on every hit; cuts on downbeats.

## 5. Gotchas

- Measure text only after fonts load (`document.fonts.check`, already enforced by `render.js`).
- No `Math.random`, `Date.now`, `requestAnimationFrame` state or accumulated physics. Use `hash()`.
  For physics, integrate inside `render` from t=0 each frame, or precompute a table once at load.
- White elements on white need a 1 px hairline (`rgba(0,0,0,.08)`).
- Video footage inside a frame: re-encode all-intra (`-g 1`) or use a JPEG sequence. Seek, then
  await `seeked`. Python's `http.server` cannot range-seek, so use a blob URL.
- DOM/CSS stacks (HyperFrames, Remotion): never `will-change` on anything the camera scales; never
  opacity/filter on a `preserve-3d` element (fade its wrapper); `visibility:visible` children show
  through hidden parents; `backdrop-filter:url()` is broken in Chromium (clone the backdrop instead).

## 6. Audio sync

- Pick or generate music at a known BPM (gen_music prompt: "… 120 BPM, strong kick on every beat …").
- Measure the first kick: `ffmpeg -i cue.mp3 -af "lowpass=150,astats=metadata=1:reset=1" …` or
  numpy on the onset envelope, then set `BEAT.t0`. Check by rendering the click track
  (`aevalsrc` beeps at `beat(n)`) over the music once.
- Cuts and impacts sit on `onBeat(n)`. Place SFX by their measured peak, not the file start
  (`peak_offset` = argmax |x|; start = hit − peak_offset).
- Motion-graphics master: −14 LUFS integrated, −1 dBTP; measure again after the AAC encode.
  The documentary mix keeps −16 LUFS under narration.

## 7. What this changes in film.js / render.js

Config flips (per project, edit the copied `render/film.js`):

| Setting | Documentary default | Motion segment |
|---|---|---|
| `FPS` | 24 | 60 (or 30 for long pieces) |
| `BAR` letterbox | 138 px (2.39:1) | 0 (full 16:9) or 9:16 canvas |
| Transition | `xf` crossfade seconds | `xf: 0`, with the transition drawn inside the shot (flood / iris / match cut) |
| Shot length | one narration line (~4–6 s) | 3–4 beats (1.5–2 s) |

New primitives: everything in §3 lives in `templates/motion.js` and is loaded next to `film.js`. No change to
`render.js` is needed: subframe blur happens inside `render()` via `motionBlur`.

Rendering a motion segment: copy `motion-demo.html` to `render/index.html`, plus `motion.js` and the
demo script into `render/`, then `node scripts/render.js --from 0 --to N --out out/x.mp4` as usual.
In a documentary, add `<script src="motion.js"></script>` before `film.js` in `render/index.html`
and give the motion shots `xf: 0`.

## 8. QA additions (on top of qa-checklist.md)

- One still per beat for motion segments (`--frame N --png` at `round(beat(n)·FPS)`).
- Frozen frames and single-frame pops, from the encoded file:
  `ffmpeg -i out/x.mp4 -vf "signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=ydif.log" -f null -`,
  then flag frames whose YDIF is above 3× all four neighbours **and** above an absolute floor of about 3.
  Without the floor, an integer counter settling by one digit shows up as a pop. Runs of YDIF ≈ 0 are
  holds: fine when intended, a bug mid-move.
- Decode frames from the **final mp4**, not the PNG renders.
- Loops: the last frame equals the first frame.
- Last step: a fresh critic. Start a new agent with only the mp4 stills and the brief, have it name
  the three weakest moments, then fix them.
