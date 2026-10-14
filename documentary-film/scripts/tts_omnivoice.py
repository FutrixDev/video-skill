#!/usr/bin/env python3
"""Narration via the local k3s OmniVoice (videok pod, GPU node). Writes audio/vo/*.wav + timeline.json.

Usage (from the project root, where script.json lives):
  tts_omnivoice.py --narrator doc-male-1 [--instruct "男，中年，低音调"] [--speed 0.92] [--lang zh]
                   [--lead 3.0 --gap-line 0.9 --gap-section 2.6] [--context lab-k3s]

script.json schema: {"title": str, "sections": [{"id": str, "name": str, "lines": [str, ...]}, ...]}
timeline.json schema (same as the MiniMax-era tts.py): {title, lead, vo_end, sections:[{id,name,start,end,cues}], cues:[{section,text,file,start,end,dur}]}

Flow: job dir -> kubectl cp into the pod (/data/narration/<job>) -> kubectl exec pod_tts.py -> kubectl cp wavs back.
Lines whose wav already exists in audio/vo are skipped (delete the wav to re-synthesize).
Narrators are files in this skill's voices/ dir: <name>.ref.wav + <name>.ref.txt (the only source of truth; the pod
keeps just a prompt cache). A new narrator is created with --instruct and its reference is copied back into voices/.
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ap = argparse.ArgumentParser()
ap.add_argument("--narrator", required=True); ap.add_argument("--instruct", default=None)
ap.add_argument("--speed", type=float, default=0.92); ap.add_argument("--lang", default="zh"); ap.add_argument("--steps", type=int, default=32)
ap.add_argument("--lead", type=float, default=3.0); ap.add_argument("--gap-line", type=float, default=0.9); ap.add_argument("--gap-section", type=float, default=2.6)
ap.add_argument("--context", default="lab-k3s"); ap.add_argument("--namespace", default="videok"); ap.add_argument("--script", default="script.json")
a = ap.parse_args()

K = ["kubectl", "--context", a.context, "-n", a.namespace]
def sh(cmd, **kw): return subprocess.run(cmd, check=True, text=True, capture_output=True, **kw).stdout
pod = sh(K + ["get", "pod", "-l", "app=videok", "-o", "jsonpath={.items[0].metadata.name}"]).strip()
if not pod: raise SystemExit("videok pod not found")
health = json.loads(sh(K[:3] + ["get", "--raw", f"/api/v1/namespaces/{a.namespace}/services/videok:80/proxy/healthz"]))  # via the API server, no node IP
if "OmniVoice" not in health.get("tts", ""): raise SystemExit(f"videok /healthz says tts={health.get('tts')!r}; omnivoice not installed")

script = json.load(open(a.script, encoding="utf-8"))
vo = Path("audio/vo"); vo.mkdir(parents=True, exist_ok=True)
VOICES = Path.home() / ".claude/skills/documentary-film/voices"; ref_wav, ref_txt = VOICES / f"{a.narrator}.ref.wav", VOICES / f"{a.narrator}.ref.txt"
if ref_wav.exists() and a.instruct: raise SystemExit(f"narrator {a.narrator} already exists in {VOICES}; drop --instruct or pick a new name")
if not ref_wav.exists() and not a.instruct: raise SystemExit(f"narrator {a.narrator} not in {VOICES}; create it with --instruct \"男，中年，低音调\" (valid tags only)")
todo = []
for si, s in enumerate(script["sections"]):
    for li, text in enumerate(s["lines"]):
        lid = f"{si:02d}-{s['id']}-{li:02d}"
        if not (vo / f"{lid}.wav").exists(): todo.append({"id": lid, "text": text})
if todo:
    job = f"job-{time.strftime('%Y%m%d-%H%M%S')}"
    tmp = Path(tempfile.mkdtemp()); jd = tmp / job; jd.mkdir()
    (jd / "job.json").write_text(json.dumps({"narrator": a.narrator, "instruct": a.instruct, "language": a.lang, "speed": a.speed, "num_step": a.steps, "lines": todo}, ensure_ascii=False), encoding="utf-8")
    shutil.copy(HERE / "pod_tts.py", jd / "pod_tts.py")
    if ref_wav.exists(): shutil.copy(ref_wav, jd / "ref.wav"); shutil.copy(ref_txt, jd / "ref.txt")
    sh(K + ["exec", pod, "-c", "web", "--", "mkdir", "-p", "/data/narration"])
    sh(K + ["cp", str(jd), f"{pod}:/data/narration/{job}", "-c", "web"])
    print(f"synthesizing {len(todo)} lines in pod {pod} (job {job})", flush=True)
    p = subprocess.Popen(K + ["exec", pod, "-c", "web", "--", "sh", "-c", f"cd /data && PYTHONPATH=/data/.tts:/data/.pylib HF_HOME=/data/.hf python3 /data/narration/{job}/pod_tts.py /data/narration/{job}"], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        if "warn" not in line.lower() and "Loading weights" not in line and "Fetching" not in line: print("  pod:", line.rstrip(), flush=True)
    if p.wait() != 0: raise SystemExit("pod_tts.py failed")
    sh(K + ["cp", f"{pod}:/data/narration/{job}", str(tmp / "back"), "-c", "web"])
    for ln in todo: shutil.copy(tmp / "back" / f"{ln['id']}.wav", vo / f"{ln['id']}.wav")
    if not ref_wav.exists():
        VOICES.mkdir(exist_ok=True); shutil.copy(tmp / "back" / "ref.wav", ref_wav); shutil.copy(tmp / "back" / "ref.txt", ref_txt)
        print(f"saved new narrator {a.narrator} -> {VOICES}")
    sh(K + ["exec", pod, "-c", "web", "--", "rm", "-rf", f"/data/narration/{job}"])
    shutil.rmtree(tmp)
else:
    print("all lines already synthesized; rebuilding timeline only")

def dur(p): return float(sh(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)]).strip())
t = a.lead; cues = []; sections = []
for si, s in enumerate(script["sections"]):
    if si > 0: t += a.gap_section
    sec = {"id": s["id"], "name": s["name"], "start": round(t, 3), "cues": []}
    for li, text in enumerate(s["lines"]):
        if li > 0: t += a.gap_line
        f = vo / f"{si:02d}-{s['id']}-{li:02d}.wav"; d = dur(f)
        cue = {"section": s["id"], "text": text, "file": str(f), "start": round(t, 3), "end": round(t + d, 3), "dur": round(d, 3)}
        cues.append(cue); sec["cues"].append(cue); t += d
        print(f"{cue['start']:7.2f} {d:5.2f}  {text}")
    sec["end"] = round(t, 3); sections.append(sec)
json.dump({"title": script["title"], "lead": a.lead, "vo_end": round(t, 3), "sections": sections, "cues": cues}, open("timeline.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("VO ends at", round(t, 2), "s  (narrator:", a.narrator + ")")
