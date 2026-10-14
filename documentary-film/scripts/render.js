// Usage: node scripts/render.js --frames | --check [step] | --stills N [--dir d] | --from F --to G --out file.mp4 | --frame N --png out.png
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
function serve() { return new Promise(res => { const s = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!p.startsWith(ROOT) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }); s.listen(0, '127.0.0.1', () => res(s)); }); }
(async () => {
  const srv = await serve(); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => { console.error('PAGE ERROR', e); process.exit(2); });
  await page.goto(`http://127.0.0.1:${port}/render/index.html`);
  const info = await page.evaluate(() => window.film.ready);
  const fc = await page.evaluate(() => window.film.fontCheck());
  console.error('fonts', JSON.stringify(fc), 'frames', info.frames);
  const grab = async f => Buffer.from((await page.evaluate(n => window.film.render(n), f)).split(',')[1], 'base64');
  if (args.frames) { console.log(info.frames); }
  else if (args.check) { // sample every step frames, collect layout warnings from the engine
    const step = args.check === true ? Math.round(info.fps / 2) : +args.check; await page.evaluate(() => { window.__LAYOUT_CHECK = true; });
    const hits = new Map();
    for (let f = 0; f < info.frames; f += step) { await page.evaluate(n => window.film.render(n), f);
      const w = await page.evaluate(() => { const w = window.__LAYOUT_WARN || []; window.__LAYOUT_WARN = []; return w; });
      for (const h of w) { const k = `${h.text} | ${h.over}`; const e = hits.get(k) || { ...h, frames: [] }; e.frames.push(f); hits.set(k, e); } }
    for (const e of hits.values()) console.log(`OVERLAP "${e.text}" over ${e.over} ${e.px[0]}x${e.px[1]}px frames ${e.frames[0]}..${e.frames[e.frames.length - 1]} (${e.frames.length} samples, t=${(e.frames[0] / info.fps).toFixed(1)}s)`);
    console.log(hits.size ? `LAYOUT CHECK FAILED: ${hits.size} collision(s)` : 'LAYOUT CHECK OK'); await browser.close(); srv.close(); process.exit(hits.size ? 3 : 0); }
  else if (args.frame !== undefined) { fs.writeFileSync(args.png, await grab(+args.frame)); }
  else if (args.stills) { const n = +args.stills; const dir = args.dir || path.join(ROOT, 'out', 'stills'); fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < n; i++) { const f = Math.round(i * (info.frames - 1) / (n - 1)); fs.writeFileSync(path.join(dir, `s${String(i).padStart(2, '0')}_f${f}.jpg`), await grab(f)); } }
  else { const from = +args.from, to = Math.min(+args.to, info.frames); // [from,to)
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(info.fps), args.out], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = from; f < to; f++) { const buf = await grab(f); if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); if ((f - from) % 240 === 0) console.error(`${args.out}: ${f}/${to}`); }
    ff.stdin.end(); await new Promise((r, j) => ff.on('close', c => c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))); }
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
