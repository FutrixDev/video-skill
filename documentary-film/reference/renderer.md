# Renderer: engine API and design rules

`templates/film.js` exposes `window.film = { ready, render(frame) → jpeg dataURL, fontCheck() }`.
`scripts/render.js` serves the project over a loopback http server (file:// taints the canvas),
drives it with Playwright (`NODE_PATH=/opt/homebrew/lib/node_modules`), and pipes MJPEG frames
to ffmpeg. Boot: fetch `../timeline.json`, load + `check` fonts, decode `assets/prepped/*.jpg`,
`buildPost()`, `buildShots()`; returns `{frames, fps}`.

## Frame geometry

1920×1080, 24 fps, 2.39:1 letterbox: `BAR = 138`, picture rect `PIC = {x:0, y:138, w:1920, h:804}`.
All composition lives inside PIC; the bars are painted last in `post()`.

## Engine helpers (keep; call from shots)

| helper | purpose |
|---|---|
| `txt(c, s, x, y, {fam, weight, size, color, align, track, alpha, base})` | text with letter-spacing compensation |
| `spiral / scrollPath('S'|'C') / scroll(c, path, x, y, size, rot, p, o) / cartouche(c, x, y, w, h, p, alpha, lw)` | procedural rocaille: log-spiral S/C scrolls as one ribbon-filled polygon with tapered width, leaf offshoots, progressive reveal `p` |
| `hairline`, `plateFrame`, `bottomShade` | gold rules, thin frame around a plate, bottom gradient for legibility |
| `cover(c, img, r, s, cx, cy)` / `kenburns(c, img, r, from, to, u)` | cover-fit with clamped translation; `from/to = [scale, cx, cy]`, `u` in 0..1 |
| `contain(c, img, r, pad)` | plate on ivory, returns drawn rect |
| `caption(c, s, alpha, light)` | museum caption, top-right, 22 px Didot |
| `chapter(c, roman, en, cn, t, t0)` | chapter marker top-left, 4.5 s with a growing hairline |
| `callout(c, px, py, lx, ly, en, cn, a, dark)` | gold dot + leader + EN/CN label + tiny C-scroll |
| `subtitle(c, t, light)` | from `TL.cues`, Songti SC 38 px, bottom of PIC, −0.15 s / +0.45 s padding |
| `occupy`, `occCheck`, `veil(c, x, y, w, h, color, a)` | layout guard, see below; text and plates register, text and the subtitle box check, `veil` clears what it covers |
| `win(t, a, b, d)`, `ease`, `easeOut`, `easeIn`, `lerp`, `clamp`, `mulberry32` | timing + seeded random |

## Layout guard (text vs text vs pictures)

`occupy(c, x, y, w, h, label)` records a rect (in canvas space, through the current transform)
for the shot being drawn. Who registers: `txt()` (its own glyph box, label `text "<first 24
chars>"`), `maskReveal()`, `portrait()`, `contain()`, `cover()`/`kenburns()` (label `plate`),
except a full-bleed `cover` (>= 90 % of the frame), where text over the dimmed background is a
design choice and needs `bottomShade`. Who checks before drawing: `txt()`, `maskReveal()` and
`subtitle()` (its whole background box, label `subtitle box`, all lines). `occCheck()` pushes
`{text, over, px}` into `window.__LAYOUT_WARN` when the box (text: ascent 0.78 em, height
1 em) intersects a recorded rect by more than 4 px. Both sides are ignored while
`globalAlpha <= 0.5`, so crossfades and rise-ins do not trip it. `drawShot` resets the list, so
the previous shot of a crossfade never blocks the current one. `veil(c, x, y, w, h, color, a)`
paints a wash and, while `a * globalAlpha >= 0.5`, forgets every rect fully inside it: use it
(not a bare `fillRect`) when a second layer is drawn over a dimmed first layer, or the guard
reports the invisible layer underneath. `scripts/render.js --check [step]` turns the guard on,
samples every `step` frames (default fps/2) and exits 3 listing every collision with its first
time. It must print `LAYOUT CHECK OK` before `render_all.sh`; a FAILED list is a layout bug,
never something to silence. When you add a helper that paints opaque pixels or text, make it
call `occupy()`; when it only decorates (lines, rules, glows) it does not register, so look at
the frames anyway.

Rules the guard enforces, so you can place things right the first time:
- The subtitle band is reserved. zh single-line box top is y ≈ 974 (size 38); en two-line box
  top is y ≈ 926 (size 36, lh 48, maxW 1600). Nothing else, caption or plate, may extend into
  it. Bottom captions therefore sit with baseline ≤ 920 (zh) / ≤ 900 (en); captions that
  belong to a chart go top-left under the title instead.
- `rise()` text travels up to 1.2 × size below its final baseline while animating and the
  guard sees that whole path, so leave that much room under a rising caption.
- English runs ~1.5× wider than Chinese: every label that just fit in zh must be re-placed in
  en (right-align row labels, shorten card titles, shift timeline years off each other).
- Plate credits go inside or directly under the plate, never in the band below it.

History: 2026-10-07 the guard passed while "产物自己催化自己" sat on the Soai portrait, because
only `contain()` registered. The same day it passed again while a caption sat under the
subtitle, because `txt()` registered nothing and `subtitle()` checked nothing. Both are fixed
above; text registers, the subtitle box checks, and all four Nobel films were re-rendered.

## Shot system

`shot(t0, xf, draw(c, t, u), {light, lightFrom, noSub})`. The compositor picks the shot with
the latest `t0 <= t`, draws the previous shot into BUF_A and the current into BUF_B, and
crossfades with eased alpha over `xf` seconds. Subtitle colour follows the shot that is more
than half visible. Shots paint their own background first (`INK` or `IVORY`).

Key timings to narration: `T[i]` = start of cue i, `SEC.<id>.start/end`. Give pictures ~1 s
before the line that mentions them. End: outro card at `TL.vo_end + 1`, credits 8.4 s later,
`DURATION = credits + 9.6` (2 s fade to black inside `render`).

## Post pass (deterministic)

10 pre-generated 960×540 grain tiles from `mulberry32(seed)`, drawn `overlay` at 0.18 and
cycled by frame; radial vignette `multiply`; warm `soft-light` grade `#d9a86c` at 0.22; black
bars. Change the seed per film, not the recipe.

## Typography and palette

- Latin: Didot (titles 150 px tracked 0.3, small caps labels 22 px tracked 0.34–0.42).
  Chinese: Songti SC 300 for display, 400 for subtitles. Small caps: Bodoni 72 Smallcaps.
  All three are macOS system fonts; the render host must have them (fontCheck is the gate).
- INK `#161210`, IVORY `#efe6d6`, GOLD `#c9a86a` / `#e2c98f`, muted caption `#6b5f4e` on ivory,
  pastel accents only as small dots.
- One idea per card. Title cards: ornament first, then title settles into it. Keywords: three
  across at ±520 px. Plates: 600 px wide box, callouts leave the box on the side with room.
- Diptychs: two cover-fit halves with a 2 px gold hairline, slow 5 % zoom.
- Museum captions always: "Artist · Title · year · Holder". Chapter markers: roman numeral +
  EN small caps + CN.
