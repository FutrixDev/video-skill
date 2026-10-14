#!/usr/bin/env python3
"""Music bed + VO mix, muxed onto the silent render.
Usage: mix.py [--video out/video_silent.mp4] [--out out/film.mp4] [--music-vol 0.55] cue1.mp3 cue2.mp3 ...
Reads timeline.json (cues[].file / start). Music cues are chained with 3 s crossfades, trimmed to the
video length, faded out, ducked under VO by sidechain compression, then loudnormed to -16 LUFS / -1.5 dBTP.
Video is re-encoded once to tv-range yuv420p (MJPEG parts come out as yuvj420p / pc range)."""
import argparse, json, subprocess
ap = argparse.ArgumentParser(); ap.add_argument("cues", nargs="+"); ap.add_argument("--video", default="out/video_silent.mp4")
ap.add_argument("--out", default="out/film.mp4"); ap.add_argument("--music-vol", type=float, default=0.55); ap.add_argument("--xf", type=float, default=3.0)
a = ap.parse_args()
TOTAL = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video]).decode().strip())
tl = json.load(open("timeline.json")); cues = a.cues
inputs = []; fl = []
for c in cues: inputs += ["-i", c]
for i in range(len(cues)): fl.append(f"[{i+1}:a]aresample=48000,aformat=channel_layouts=stereo[c{i}]")
prev = "[c0]"
for i in range(1, len(cues)):
    fl.append(f"{prev}[c{i}]acrossfade=d={a.xf}:c1=tri:c2=tri[m{i}]"); prev = f"[m{i}]"
fl.append(f"{prev}atrim=0:{TOTAL},afade=t=in:d=2,afade=t=out:st={TOTAL-6}:d=6,volume={a.music_vol}[music]")
n0 = len(cues) + 1; vo = []
for j, q in enumerate(tl["cues"]):
    inputs += ["-i", q["file"]]; ms = int(q["start"] * 1000)
    fl.append(f"[{n0+j}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{j}]"); vo.append(f"[v{j}]")
fl.append("".join(vo) + f"amix=inputs={len(vo)}:normalize=0:dropout_transition=0,apad=whole_dur={TOTAL}[vo]")
fl.append("[vo]asplit[vo1][vo2]")
fl.append("[music][vo2]sidechaincompress=threshold=0.02:ratio=3.5:attack=80:release=900:makeup=1[duck]")
fl.append("[duck][vo1]amix=inputs=2:normalize=0:weights=1 1.6,loudnorm=I=-16:TP=-1.5:LRA=11[mix]")
cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", a.video] + inputs + ["-filter_complex", ";".join(fl), "-map", "0:v", "-map", "[mix]",
       "-vf", "scale=in_range=pc:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-color_range", "tv",
       "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest", a.out]
subprocess.run(cmd, check=True)
print("MIX_DONE", a.out)
