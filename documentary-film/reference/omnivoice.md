# Narration backend: OmniVoice on the local k3s cluster

Found 2026-10-07. There is no standalone TTS service; the model lives inside the `videok` app.

| item | value |
|---|---|
| kube context / namespace / workload | `lab-k3s` / `videok` / `deploy/videok` (container `web`, label `app=videok`) |
| node | GPU node `omarchy`, RTX 4060 Ti 8 GB (705 MiB used idle on 2026-10-07) |
| model | `k2-fsa/OmniVoice` (omnivoice 0.2.1), weights cached in `/data/.hf/hub/models--k2-fsa--OmniVoice` |
| python env | `PYTHONPATH=/data/.tts:/data/.pylib HF_HOME=/data/.hf` (torch + omnivoice in `/data/.tts`, separate from faster-whisper in `/data/.pylib`; never import both in one process) |
| health | `kubectl --context lab-k3s get --raw /api/v1/namespaces/videok/services/videok:80/proxy/healthz` → `"tts": "k2-fsa/OmniVoice 未加载（auto）"` means installed, loads on demand |
| narrators | this skill's `voices/<name>.ref.wav` + `.ref.txt` (single source); the pod only caches `/data/narrators/<name>/prompt-<hash>.pt` |
| output | 24 kHz mono, ~1 s per 6 s of speech on the 4060 Ti, model load ≈ 2 s |

The app's own HTTP API (`/api/dub`) only dubs an uploaded video from an SRT with a recorded
voice; it cannot synthesize free text. So `scripts/tts_omnivoice.py` copies a job into the pod
and runs `pod_tts.py` with `kubectl exec`. It runs outside the app's job queue and shares the
8 GB card with the app's own jobs; the test runs were done with the app idle. If the app is
dubbing or transcribing at the same time, expect CUDA out-of-memory rather than queuing.

## Generation modes and why we clone

`OmniVoice.generate(text, language, instruct | voice_clone_prompt, speed, duration, num_step)`

- `instruct` (voice design, no reference audio) drifts between separate calls: in a 6-line test
  RMS swung 0.058–0.133 and timbre moved. Not usable for a 30-line narration.
- `voice_clone_prompt` from one reference wav + its text keeps RMS within 0.117–0.146 and the
  timbre stable. `pod_tts.py` therefore designs the voice once (first line, `instruct`), the
  driver saves that reference into `voices/`, and every later line is cloned from it. The pod's
  `.pt` is only a cache. There is no seed parameter; a narrator cannot be regenerated
  bit-identically, only re-used, so never delete a `voices/` pair that a film used.
- `speed` 0.92 for calm documentary pacing; `duration` pins length exactly (used by the app's
  dubbing, not needed for narration). `num_step` 32 (16 is twice as fast, rougher).
- `normalize_text=True` (digits → words) needs the `omnivoice[tn]` extra, not installed: write
  numbers out in the script (一七一五年, not 1715年).

## Valid `instruct` tags (the model rejects anything else)

One language per instruct. English tags joined by `, `; Chinese tags joined by `，` (full-width).

- English: american accent, australian accent, british accent, canadian accent, child, chinese
  accent, elderly, female, high pitch, indian accent, japanese accent, korean accent, low pitch,
  male, middle-aged, moderate pitch, portuguese accent, russian accent, teenager, very high
  pitch, very low pitch, whisper, young adult
- Chinese: 东北话，中年，中音调，云南话，低音调，儿童，四川话，女，宁夏话，少年，极低音调，极高音调，
  桂林话，河南话，济南话，甘肃话，男，石家庄话，老年，耳语，贵州话，陕西话，青岛话，青年，高音调

Free-text descriptions ("沉稳的纪录片旁白") raise `ValueError: Unsupported instruct items`.

## Existing narrators

- `dylan` — the user's own voice (recorded 2026-10-07 through the browser recorder, 16 s, the
  Rococo opening sentence as ref text). The user's voice stays in `voices/` and the pod job dir only.

- `doc-male-1` — 男，中年，低音调; reference line is the Rococo opening sentence
  (`voices/doc-male-1.ref.wav`). Nothing to restore in the pod: the driver ships the reference
  with every job.

## Intelligibility check (in the pod)

```bash
kubectl -n videok exec deploy/videok -c web -- sh -c 'cd /data && PYTHONPATH=/data/.pylib HF_HOME=/data/.hf LD_LIBRARY_PATH=/data/.pylib/.cudalibs python3 -c "
from faster_whisper import WhisperModel; m=WhisperModel(\"large-v3\",device=\"cuda\",compute_type=\"float16\")
segs,_=m.transcribe(\"/data/narration/<job>/<id>.wav\",language=\"zh\",initial_prompt=\"简体中文。\"); print(\"\".join(s.text for s in segs))"'
```
Homophone substitutions for proper nouns (华托 → 滑脱) are ASR errors, not TTS errors.

## Recording a new narrator from the user's voice

Mac ffmpeg cannot open the microphone from this process (avfoundation: "Cannot use HD Pro Webcam
C920", a TCC permission issue), so recording goes through the built-in browser:

1. `python3 scripts/record_ref.py <dir> 8765` (or `preview_start` name `narrator-recorder` from
   `.claude/launch.json`); put the sentence to read in `<dir>/ref.txt` (8-12 s of speech).
2. The user reads it on `http://localhost:8765`; each take lands as `<dir>/take-N.wav` (24 kHz mono).
3. `python3 scripts/add_narrator.py <dir>/take-N.wav <name>` trims silence, checks 3-20 s,
   transcribes in the pod (Whisper large-v3) and writes `voices/<name>.ref.*`. Whisper drops
   punctuation; overwrite `.ref.txt` with the exact sentence that was read.
