#!/usr/bin/env python3
"""Generate instrumental music cues with MiniMax music-2.5. Usage: gen_music.py <name> <prompt>"""
import json, os, sys, urllib.request
key = os.environ["MINIMAX_API_KEY"]
name, prompt = sys.argv[1], sys.argv[2]
body = json.dumps({"model":"music-2.5","prompt":prompt,"lyrics":"[Instrumental]","stream":False,
                   "audio_setting":{"sample_rate":44100,"bitrate":256000,"format":"mp3"}}).encode()
req = urllib.request.Request("https://api.minimaxi.com/v1/music_generation", data=body,
      headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"})
d = json.load(urllib.request.urlopen(req, timeout=300))
if d["base_resp"]["status_code"] != 0: raise SystemExit(f"music {name} failed: {d['base_resp']}")
out = f"audio/music/{name}.mp3"
open(out,"wb").write(bytes.fromhex(d["data"]["audio"]))
print(name, d["extra_info"]["music_duration"]/1000, "s")
