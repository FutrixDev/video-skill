#!/usr/bin/env python3
"""Turn a recorded take into a narrator for tts_omnivoice.py.
Usage: add_narrator.py <take.wav> <narrator-name> [--text "exact words read"] [--context lab-k3s] [--namespace videok]
Trims leading/trailing silence (keeps 0.3 s), resamples 24 kHz mono, requires 3-20 s, transcribes with
faster-whisper large-v3 inside the videok pod when --text is not given, prints the text for you to confirm,
and writes voices/<name>.ref.wav + voices/<name>.ref.txt. Refuses to overwrite an existing narrator."""
import argparse, subprocess, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent; VOICES = Path.home() / ".claude/skills/documentary-film/voices"
ap = argparse.ArgumentParser(); ap.add_argument("take"); ap.add_argument("name"); ap.add_argument("--text")
ap.add_argument("--context", default="lab-k3s"); ap.add_argument("--namespace", default="videok"); a = ap.parse_args()
wav, txt = VOICES / f"{a.name}.ref.wav", VOICES / f"{a.name}.ref.txt"
if wav.exists() or txt.exists(): sys.exit(f"narrator {a.name} already exists in {VOICES}; pick another name")
VOICES.mkdir(exist_ok=True)
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", a.take, "-af",
    "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.3,areverse,silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.3,areverse",
    "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(wav)], check=True)
dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)]))
if not 3 <= dur <= 20: wav.unlink(); sys.exit(f"trimmed reference is {dur:.1f}s; OmniVoice needs 3-20 s (best 6-12 s)")
text = a.text
if not text:
    kc = ["kubectl", "--context", a.context, "-n", a.namespace]
    pod = subprocess.check_output(kc + ["get", "pod", "-l", "app=videok", "-o", "jsonpath={.items[0].metadata.name}"]).decode()
    subprocess.run(kc + ["cp", str(wav), f"{pod}:/data/narration/_asr.wav", "-c", "web"], check=True)
    code = ("from faster_whisper import WhisperModel;m=WhisperModel('large-v3',device='cuda',compute_type='float16');"
            "s,_=m.transcribe('/data/narration/_asr.wav',language='zh',beam_size=5);print(''.join(x.text for x in s).strip())")
    text = subprocess.check_output(kc + ["exec", pod, "-c", "web", "--", "sh", "-c",
        f"PYTHONPATH=/data/.pylib LD_LIBRARY_PATH=/data/.pylib/.cudalibs HF_HOME=/data/.hf python3 -c \"{code}\"; rm -f /data/narration/_asr.wav"]).decode().strip().splitlines()[-1]
txt.write_text(text, encoding="utf-8")
print(f"narrator {a.name}: {dur:.1f}s -> {wav}\nref text: {text}\n(if the text is not exactly what was read, edit {txt})")
