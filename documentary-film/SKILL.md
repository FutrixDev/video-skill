---
name: documentary-film
description: "Make a festival-style short documentary (纪录片 / 短片 / 影片) as a deterministic JavaScript + Canvas 2D render: script → fact-check → narration (local k3s OmniVoice 配音, GPU) → timeline → music cues → shot list → Playwright frame render → ffmpeg mix (ducking, loudnorm) → QA. Use when the user asks for a 视频 / 短片 / 纪录片 / film essay about a topic, wants 配音 / narration from the local model, or wants to rebuild or extend the Rococo film pipeline. Also use it for animation-dense work, such as 动画 / 动态图形 / motion graphics / 产品宣传片 / explainer / showreel, or \"more animation\": see reference/motion-design.md (springs, beat grid, mask reveals, match cuts, world camera, motion blur; distilled from prompt-motion.com)."
---

# Documentary film (JS + Canvas, local narration)

Distilled from the Rococo film (2026-10-07, `videoK/projects/rococo-film`, 188 s). Everything is
deterministic: `render(frame)` returns the same pixels every time, so re-renders are cheap and
partial re-renders are safe. No video-editing software, no video skills: a script, a timeline
JSON, one renderer file, and ffmpeg.

Paths below are relative to this skill directory. Scripts are copied into the project
(`scripts/`), not run from here, so the project stays self-contained.

## Project layout

```
project/
  script.json          {title, sections:[{id,name,lines:[...]}]}   narration, one line per cue
  timeline.json        written by tts_omnivoice.py: cue start/end/dur, section bounds, vo_end
  assets/prepped/*.jpg images at ≤2000 px long edge, q90 (sips/ffmpeg); credited in the end card
  audio/vo/*.wav       narration, one file per line (24 kHz mono)
  audio/music/*.mp3    instrumental cues from gen_music.py
  render/index.html + render/film.js   the renderer (start from templates/)
  scripts/             tts_omnivoice.py pod_tts.py gen_music.py render.js render_all.sh mix.py
  out/                 part*.mp4 → video_silent.mp4 → film.mp4, stills/, contact sheet
```

## Workflow

1. **Script.** Write `script.json`: 5–7 sections, 2–4 lines each, ~20–28 lines for 3 min
   (narration ≈ 5 chars/s in zh; the pipeline adds 0.9 s between lines, 2.6 s between sections,
   3 s lead). Each line is one subtitle, so keep lines ≤ 32 CJK chars. Write for the ear:
   short clauses, one image per line, no lists.
2. **Fact-check every date, name and attribution** before synthesis (crawl-store for the web).
   Anything you cannot verify is softened on screen ("18th century" not "c. 1760s"). The end
   card credits each image with artist, title, year, holder and licence; only use PD / CC0 /
   CC BY(-SA) images and keep the attribution text.
3. **Narration (配音).** Default backend is the local OmniVoice on k3s, see
   `reference/omnivoice.md`. From the project root:
   ```bash
   python3 scripts/tts_omnivoice.py --narrator doc-male-1
   ```
   Narrators are `voices/<name>.ref.wav` + `.ref.txt` in this skill (the scripts resolve that path absolutely, so the copied project scripts still find them) (`doc-male-1` synthetic, `dylan` = the user's own voice). Only synthetic narrators are committed to the public repo (FutrixDev/video-skill); personal voice references are git-ignored there, so record them locally. To record a new one from the user's voice use `scripts/record_ref.py` + `scripts/add_narrator.py` (see reference/omnivoice.md). To
   make a new one: a new name plus `--instruct "男，中年，低音调"` once (valid tags only, see the
   reference); the reference is saved into `voices/`. This writes `audio/vo/*.wav` and `timeline.json`. Lines already on disk are
   skipped; delete a wav to redo it. Listen to 3–4 lines (`afplay`) and run Whisper large-v3 in
   the pod over the output if a line sounds off. MiniMax `speech-2.5-hd-preview` (speed 0.92,
   calm) is the alternative when the cluster is down; keep the same `timeline.json` schema.
4. **Music.** `scripts/gen_music.py <name> "<prompt>"` (MiniMax music-2.5, needs
   `MINIMAX_API_KEY`). Prompt pattern that worked: "cinematic documentary score, <period
   instruments>, instrumental, <tempo> BPM, <key>, ~50 s, <mood>". Generate 5–6 cues of
   30–70 s; the mixer chains them with 3 s crossfades, so pick cues with similar levels and
   the same key family. Drop cues you don't use.
5. **Renderer.** Copy `templates/index.html` and `templates/film.js` to `render/`. Edit only the
   palette, `IMG_FILES` and `buildShots()`; the engine (text, rocaille scrolls, Ken Burns,
   plates, callouts, captions, chapters, subtitles, crossfade compositor, grain/vignette/grade,
   letterbox, credits fade) stays. Shot timings are keyed to cue starts `T[i]` and section
   starts `SEC.id.start`, never to hard-coded seconds. Design rules: `reference/renderer.md`.
   For animated segments, or a pure motion-graphics piece, read `reference/motion-design.md`
   first. It covers the brief skeleton, beat map, banned list and object-driven transitions, and
   provides `templates/motion.js` (springs, beat grid, mask reveal, flood, iris, camera, cursor,
   motion blur). `templates/motion-demo.*` is a 6 s, 60 fps starting point.
6. **Check fonts and stills.** `NODE_PATH=/opt/homebrew/lib/node_modules node scripts/render.js
   --stills 36` → `out/stills/`; montage to a contact sheet and look at it. The driver aborts on
   any page error and prints `document.fonts.check` results; a missing font is a hard stop.
   Render the exact frames around each crossfade (`--frame N --png`) for the shots you doubt.
   Then run the layout guard: `node scripts/render.js --check` samples two frames per second and
   exits 3 with an `OVERLAP "<text>" over <plate|text|subtitle box>` line for every text, subtitle
   box or plate that sits on another registered rect. It must print `LAYOUT CHECK OK` before you render.
7. **Render.** `zsh scripts/render_all.sh 4` (4 Playwright workers → `out/video_silent.mp4`,
   ~10 min for 4500 frames on an M-series Mac). Logs in `out/part*.log`.
8. **Mix.** `python3 scripts/mix.py --out out/film.mp4 audio/music/cue1.mp3 audio/music/cue2.mp3 …`
   (bed 0.55, sidechain duck ratio 3.5, VO weight 1.6, loudnorm −16 LUFS / −1.5 dBTP, video
   re-encoded to tv-range yuv420p).
9. **QA** per `reference/qa-checklist.md`, then deliver the mp4 with SendUserFile and a short
   Chinese summary (duration, loudness, what the viewer sees, licences).

## Rules that came from mistakes

- Subtitles live at the bottom of the picture area; captions and chapter markers at the top.
  Never stack two text elements in the same band. The engine's layout guard enforces this:
  `render.js --check` must print `LAYOUT CHECK OK` before every render, and a FAILED list is a
  layout bug to fix in the shot, never to silence (rules in `reference/renderer.md`).
- Text never crosses a portrait or plate (2026-10-07, chemistry film 2:24: "产物自己催化自己" was
  drawn at x=160 while the Soai portrait occupied x 190–430, y 480–840; the user caught it). Rule:
  before placing any text, write down the rects of every picture element in that shot and keep
  a ≥30 px gap; a caption next to a portrait starts at `portrait.x + portrait.w + 40`. The engine
  enforces it: `portrait()` / `contain()` call `occupy()`, `txt()` and `maskReveal()` call
  `occCheck()`, and `render.js --check` fails the build on any hit. Any new helper that paints an
  opaque picture must call `occupy()`; never deliver without a green `--check`.
- Pale ("light") shots need ink-coloured subtitles; set `light: true` (or `lightFrom`) on the shot.
- `document.fonts.load()` returns `[]` for system fonts; only `document.fonts.check()` is a test.
- zsh: `setopt +o nomatch` before `rm -f out/part*.mp4`; use `${=var}` to word-split.
- In the ffmpeg filtergraph the video is input 0, so audio inputs are `[i+1:a]`; give every
  audio input `aresample=48000,aformat=channel_layouts=stereo` before mixing.
- MJPEG frames come out as yuvj420p (pc range); the mix step converts once with
  `scale=in_range=pc:out_range=tv` and tags `-color_range tv`. Verify with ffprobe.
- Music that sounds right under VO is too loud in the gaps; judge the bed level in a gap.
- Procedural ornament beads when stroked per segment; fill one ribbon polygon instead.
- Plates and grids stop ≥110 px above the picture bottom so the subtitle band stays on the stage
  colour; a pale full-bleed image under subtitles needs `bottomShade` ≥0.5.
- Don't drive a dolly with `premium` easing: it is a fast-out curve, so the camera races the
  plates. Use linear for the travel segment and keep `premium` for the push.
- `lightFrom` / `lightUntil` are seconds from the shot start. When a flood is keyed to the next
  cue (`T[i+1] - 0.45`), derive the flag from that cue, not from the current cue's duration.
- QA transition shots from the concatenated video (`ffmpeg -ss … -vf fps=2,tile=6x4`), not from
  single renderer frames: an empty stage mid-dolly is invisible in stills and obvious in a strip.
- End-card credits: title, `当代设计  Dylan` (first name only), `Model  Claude Fable 5.1`, then the
  image licences. Nothing else: no narration backend, no music/AI line, no render tooling, no local
  folder / repo name (the user trimmed the Rococo credits to this on 2026-10-07).
