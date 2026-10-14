#!/usr/bin/env python3
"""Record a narrator reference from the browser microphone.
Usage: record_ref.py <out_dir> [port]   -> serves a recorder page; each take is saved as
<out_dir>/take-N.webm and converted to <out_dir>/take-N.wav (24 kHz mono). Open the page in the
built-in browser (localhost, so getUserMedia works without https). Read a 6-12 s sentence
clearly, 20-40 cm from the mic, in a quiet room; silence ≥ 0.5 s before and after."""
import json, subprocess, sys, time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
OUT = Path(sys.argv[1]).resolve(); OUT.mkdir(parents=True, exist_ok=True); PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
PAGE = """<!doctype html><meta charset=utf-8><title>Narrator reference</title>
<style>body{font:18px/1.6 -apple-system,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#222}
button{font:inherit;padding:10px 22px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer}button.rec{background:#c33;color:#fff;border-color:#c33}
#text{font-size:26px;line-height:1.5;padding:16px;background:#f5f1e8;border-radius:8px;margin:16px 0}#log{white-space:pre-wrap;color:#555;font-size:15px}</style>
<h2>录一段旁白参考音</h2><p>点「开始录音」，等 1 秒，用旁白的语气从容地念下面这句，念完等 1 秒再点「停止」。</p>
<div id=text>__TEXT__</div>
<p><button id=b>开始录音</button> <span id=st></span></p><div id=log></div>
<script>
let rec,chunks=[],t0;const b=document.getElementById('b'),st=document.getElementById('st'),log=document.getElementById('log');
b.onclick=async()=>{ if(rec&&rec.state==='recording'){rec.stop();return;}
 const s=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
 rec=new MediaRecorder(s,{mimeType:'audio/webm;codecs=opus'});chunks=[];
 rec.ondataavailable=e=>chunks.push(e.data);
 rec.onstop=async()=>{s.getTracks().forEach(t=>t.stop());b.textContent='开始录音';b.classList.remove('rec');st.textContent='上传中…';
  const r=await fetch('/take',{method:'POST',body:new Blob(chunks,{type:'audio/webm'})});const j=await r.json();
  st.textContent='';log.textContent+=`take ${j.take}: ${j.seconds}s  peak ${j.peak} dB  rms ${j.rms} dB\\n`;};
 rec.start();t0=Date.now();b.textContent='停止';b.classList.add('rec');
 const tick=()=>{if(rec.state==='recording'){st.textContent=((Date.now()-t0)/1000).toFixed(1)+' s';requestAnimationFrame(tick)}};tick();};
</script>"""
TEXT = Path(OUT / "ref.txt").read_text(encoding="utf-8") if (OUT / "ref.txt").exists() else "（在 out_dir/ref.txt 里放要念的句子）"
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        self.send_response(200); self.send_header("content-type", "text/html; charset=utf-8"); self.end_headers(); self.wfile.write(PAGE.replace("__TEXT__", TEXT).encode())
    def do_POST(self):
        n = 1 + len(list(OUT.glob("take-*.webm"))); webm, wav = OUT / f"take-{n}.webm", OUT / f"take-{n}.wav"
        webm.write_bytes(self.rfile.read(int(self.headers["content-length"])))
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(webm), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(wav)], check=True)
        st = subprocess.run(["ffmpeg", "-i", str(wav), "-af", "astats=measure_overall=Peak_level+RMS_level:measure_perchannel=none", "-f", "null", "-"], capture_output=True, text=True).stderr
        pk = next((l.split()[-1] for l in st.splitlines() if "Peak level dB" in l), "?"); rm = next((l.split()[-1] for l in st.splitlines() if "RMS level dB" in l), "?")
        sec = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(wav)]).decode().strip())
        print(f"take {n}: {sec:.2f}s peak {pk} dB rms {rm} dB -> {wav}", flush=True)
        self.send_response(200); self.send_header("content-type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps({"take": n, "seconds": round(sec, 2), "peak": pk, "rms": rm}).encode())
print(f"recorder on http://127.0.0.1:{PORT}  -> {OUT}", flush=True)
HTTPServer(("127.0.0.1", PORT), H).serve_forever()
