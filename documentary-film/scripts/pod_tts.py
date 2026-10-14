#!/usr/bin/env python3
"""Runs INSIDE the videok pod (GPU). Synthesizes narration lines with OmniVoice.

Usage: python3 pod_tts.py <job_dir>
  <job_dir>/job.json : {"narrator": str, "instruct": str|null, "language": "zh",
                        "speed": 0.92, "num_step": 32, "lines": [{"id": str, "text": str}, ...]}
  <job_dir>/ref.wav + ref.txt : the narrator reference shipped by the driver (absent => create one)
  writes <job_dir>/<id>.wav (24 kHz mono int16), <job_dir>/result.json, and when creating a
  narrator also <job_dir>/ref.wav + ref.txt for the driver to keep.

The narrator's source of truth is the skill's voices/ dir on the Mac; the pod only caches the
encoded prompt at /data/narrators/<name>/prompt.pt (recomputed when the shipped ref differs).
Cloning from a fixed reference keeps timbre and loudness stable across lines (instruct-only
mode drifted ~2x in RMS line to line in testing).
"""
import hashlib, json, sys, time
from pathlib import Path
sys.path.insert(0, "/data/.tts")
import numpy as np, soundfile as sf, torch
from omnivoice import OmniVoice, VoiceClonePrompt

SR = 24000
CACHE = Path("/data/narrators")
job_dir = Path(sys.argv[1]); job = json.loads((job_dir / "job.json").read_text(encoding="utf-8"))
lang, speed, steps = job.get("language", "zh"), float(job.get("speed", 0.92)), int(job.get("num_step", 32))
lines = job["lines"]
if not lines: raise SystemExit("no lines")
if not torch.cuda.is_available(): raise SystemExit("CUDA not visible in this pod; refusing to run TTS on CPU")
ref_wav, ref_txt = job_dir / "ref.wav", job_dir / "ref.txt"
if ref_wav.exists() and job.get("instruct"):
    raise SystemExit(f"narrator {job['narrator']} already exists; --instruct only applies when creating a new narrator")
if not ref_wav.exists() and not job.get("instruct"):
    raise SystemExit(f"narrator {job['narrator']} has no reference and no --instruct was given to create it")

t = time.time()
model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda", dtype=torch.float16)
print(f"model loaded in {time.time()-t:.1f}s", flush=True)

if not ref_wav.exists():
    a = np.asarray(model.generate(text=lines[0]["text"], language=lang, instruct=job["instruct"], speed=speed, num_step=steps)[0], dtype=np.float32)
    sf.write(str(ref_wav), a, SR, subtype="PCM_16"); ref_txt.write_text(lines[0]["text"], encoding="utf-8")
    print(f"created narrator {job['narrator']} from line {lines[0]['id']} with instruct {job['instruct']!r}", flush=True)
ref_text = ref_txt.read_text(encoding="utf-8").strip()
digest = hashlib.sha256(ref_wav.read_bytes() + ref_text.encode()).hexdigest()[:16]
cd = CACHE / job["narrator"]; cd.mkdir(parents=True, exist_ok=True)
pt = cd / f"prompt-{digest}.pt"
prompt = None
if pt.exists():
    try: prompt = VoiceClonePrompt.load(str(pt))
    except Exception as exc: print(f"cached prompt unreadable, recomputing: {exc}", flush=True)
if prompt is None:
    prompt = model.create_voice_clone_prompt(ref_audio=str(ref_wav), ref_text=ref_text)
    prompt.save(str(pt))

res = []
t = time.time()
for i, ln in enumerate(lines):
    a = np.asarray(model.generate(text=ln["text"], language=lang, voice_clone_prompt=prompt, speed=speed, num_step=steps)[0], dtype=np.float32)
    peak = float(np.abs(a).max() or 0)
    if peak > 0.99: a *= 0.99 / peak
    sf.write(str(job_dir / f"{ln['id']}.wav"), a, SR, subtype="PCM_16")
    res.append({"id": ln["id"], "dur": round(len(a) / SR, 3), "peak": round(peak, 3), "rms": round(float(np.sqrt((a ** 2).mean())), 4)})
    print(f"{i+1}/{len(lines)} {ln['id']} {len(a)/SR:5.2f}s", flush=True)
print(f"synthesized {len(lines)} lines in {time.time()-t:.1f}s", flush=True)
(job_dir / "result.json").write_text(json.dumps({"narrator": job["narrator"], "lines": res}, ensure_ascii=False, indent=1), encoding="utf-8")
