# QA checklist (run before delivering)

Picture
- [ ] `render.js --check` printed `LAYOUT CHECK OK` on the final shots.js (text never over a portrait/plate).
- [ ] `render.js --stills 36` contact sheet reviewed: no text collisions, no clipped plates, no
      subtitle over a caption, light shots have ink subtitles.
- [ ] One `--frame` grab inside every crossfade (t0 + xf/2) for shots that change background colour.
- [ ] Fonts: driver printed `[["Didot",true],["Bodoni 72 Smallcaps",true],["Songti SC",true]]`.
- [ ] Dates/attributions on screen match the fact-check; credits list every image and licence.
- [ ] `ffprobe`: yuv420p, color_range tv, 24 fps, duration = frames/24.

Sound
- [ ] Narration: listen to the first line of each section; ASR (large-v3) over any doubtful line.
- [ ] Music seams: RMS flat across each crossfade (`astats` per second; expect −17…−21 dB in a bed-only gap).
- [ ] Ducking: music ~6–8 dB lower under VO than in gaps, not pumping (release 900 ms).
- [ ] `ebur128`: I ≈ −16 LUFS, true peak ≤ −1.5 dBTP; no VO clipping (`peak` in result.json < 0.99).
- [ ] VO and subtitle agree (same `timeline.json` fed both).

Delivery
- [ ] `out/film.mp4` + contact sheet sent with SendUserFile; summary in the user's language with
      duration, loudness, structure, licences, and the narrator used.
- [ ] Pod temp jobs removed (`/data/narration/<job>` is deleted by the driver; check on failure).
