#!/usr/bin/env node
/*
 * Exports the 3D background of each slide (no text, no org chart, no slide counter) for Canva:
 *
 *   export-canva/slide-N.png   1920x1080 still
 *   export-canva/slide-N.mp4   8 seconds, 30 fps, H.264 — loops seamlessly (the animation is periodic:
 *                              the image that would follow the last frame is exactly the first frame)
 *
 * It drives the "export mode" of the presentation (index.html?export), which renders the scene at a
 * fixed time t and hides everything but the 3D canvas.
 *
 * Usage
 *   node tools/export-canva.mjs                      all 7 slides into ./export-canva
 *   node tools/export-canva.mjs --slides 1,4         only some slides
 *   node tools/export-canva.mjs --jobs 2             render two slides at once (faster on many-core machines)
 *   node tools/export-canva.mjs --png-only           stills only (a few seconds)
 *
 * Options
 *   --out <dir>        output folder                            (default: export-canva)
 *   --slides <list>    e.g. 1,2,5                               (default: 1,2,3,4,5,6,7)
 *   --size <WxH>       frame size                               (default: 1920x1080)
 *   --fps <n>          video frame rate                         (default: 30)
 *   --seconds <n>      video length, a multiple of 8            (default: 8)
 *   --crf <n>          x264 quality, lower = better and bigger  (default: 17)
 *   --url <url>        presentation URL                         (default: the index.html next to tools/)
 *   --libs <dir>       folder holding the npm packages "three" and "gsap", used instead of the CDN (offline use)
 *   --gpu              use the machine's GPU instead of the software renderer (much faster where a GPU exists)
 *   --chromium <path>  Chromium / Chrome executable to use
 *   --ffmpeg <path>    ffmpeg executable                        (default: ffmpeg from the PATH)
 *
 * Requirements: Node 18+, Playwright (npm i -g playwright && npx playwright install chromium) and ffmpeg.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

/* ---------- arguments ---------- */
const argv = process.argv.slice(2), opt = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  opt[k] = v;
}
const out = path.resolve(opt.out || path.join(root, 'export-canva'));
const slides = String(opt.slides || '1,2,3,4,5,6,7').split(',').map(Number).filter(n => n >= 1 && n <= 7);
const [W, H] = String(opt.size || '1920x1080').split('x').map(Number);
const FPS = +(opt.fps || 30), SECONDS = +(opt.seconds || 8), CRF = +(opt.crf || 17), JOBS = Math.max(1, +(opt.jobs || 1));
const FFMPEG = opt.ffmpeg || 'ffmpeg';
const pageUrl = (() => {
  const base = opt.url || pathToFileURL(path.join(root, 'index.html')).href;
  return base + (base.includes('?') ? '&' : '?') + 'export';
})();

/* ---------- several jobs: re-launch this script on slices of the slide list ---------- */
if (JOBS > 1 && !opt['child']) {
  const groups = Array.from({ length: JOBS }, () => []);
  slides.forEach((s, k) => groups[k % JOBS].push(s));
  const base = argv.filter((a, i) => !['--jobs', '--slides'].includes(a) && !['--jobs', '--slides'].includes(argv[i - 1]));
  await Promise.all(groups.filter(g => g.length).map((g, gi) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url), ...base, '--slides', g.join(','), '--child'], { stdio: 'inherit' });
    p.on('exit', c => c === 0 ? resolve() : reject(new Error(`job ${gi} failed (${c})`)));
  })));
  console.log('all done →', out);
  process.exit(0);
}

/* ---------- Playwright (local or global install) ---------- */
async function loadPlaywright() {
  try { return await import('playwright'); } catch {}
  const g = execSync('npm root -g').toString().trim();
  return await import(pathToFileURL(path.join(g, 'playwright', 'index.mjs')).href);
}
const { chromium } = await loadPlaywright();

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: opt.chromium || undefined,
  args: ['--no-sandbox', ...(opt.gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])]
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

if (opt.libs) {                                   // offline: serve three.js and GSAP from local npm packages instead of the CDN
  const libs = path.resolve(opt.libs);
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('file:') || u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) return route.continue();
    const g = u.match(/cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/[^/]+\/gsap\.min\.js/);
    if (g) return route.fulfill({ body: fs.readFileSync(path.join(libs, 'gsap/dist/gsap.min.js')), contentType: 'text/javascript' });
    const t = u.match(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/[^/]+\/(.+)$/);
    if (t) { const rel = t[1] === 'three.module.min.js' ? 'build/three.module.min.js' : t[1];
      return route.fulfill({ body: fs.readFileSync(path.join(libs, 'three', rel)), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }); }
    return route.abort();                          // fonts etc.: not needed to render the 3D background
  });
}

const page = await ctx.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.goto(pageUrl);
await page.waitForFunction(() => window.__exportReady || window.__exportError, null, { timeout: 180000 });
const err = await page.evaluate(() => window.__exportError);
if (err) { console.error('The 3D scene could not start (WebGL / network?):\n' + err); await browser.close(); process.exit(1); }
const T = await page.evaluate(() => window.__export.T);
if (SECONDS % T !== 0) { console.error(`--seconds must be a multiple of ${T} (the loop length of the animation)`); await browser.close(); process.exit(1); }
const FRAMES = Math.min(SECONDS * FPS, +(opt['max-frames'] || Infinity));

/** renders the scene at time t and waits until the browser has presented it */
const grab = async t => {
  await page.evaluate(async t => { window.__export.render(t); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, t);
  return page.screenshot({ type: 'png' });
};
const pngSize = b => [b.readUInt32BE(16), b.readUInt32BE(20)];
const fmt = s => s < 90 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;

for (const n of slides) {
  const t0 = Date.now();
  await page.evaluate(([i, w, h]) => window.__export.setup(i, { w, h }), [n - 1, W, H]);

  /* still: the very first frame of the loop */
  const first = await grab(0);
  const [pw, ph] = pngSize(first);
  if (pw !== W || ph !== H) throw new Error(`slide ${n}: screenshot is ${pw}x${ph}, expected ${W}x${H}`);
  fs.writeFileSync(path.join(out, `slide-${n}.png`), first);
  console.log(`slide ${n}: slide-${n}.png  ${W}x${H}`);
  if (opt['png-only']) continue;

  /* video: frames t = 0, 1/fps, … (the frame at t = 8 s would be identical to frame 0, so it is not repeated) */
  const file = path.join(out, `slide-${n}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-x264-params', 'aq-mode=3', '-g', String(FPS * 2),
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(FPS), '-movflags', '+faststart', '-an', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => { ff.on('error', rej); ff.on('exit', c => c === 0 ? res() : rej(new Error(`ffmpeg exited with ${c}`))); });
  const write = buf => new Promise((res, rej) => { ff.stdin.write(buf, e => e ? rej(e) : res()); });
  for (let k = 0; k < FRAMES; k++) {
    await write(k === 0 ? first : await grab(k / FPS));
    if (k % 30 === 29 || k === FRAMES - 1) {
      const el = (Date.now() - t0) / 1000;
      process.stdout.write(`\r  slide ${n}: frame ${k + 1}/${FRAMES}  (${fmt(el)} elapsed, about ${fmt(el / (k + 1) * (FRAMES - k - 1))} left)   `);
    }
  }
  ff.stdin.end(); await done;
  /* loop check: the scene at t = 8 s must be identical to the scene at t = 0 */
  const seam = await page.evaluate(t => window.__export.compare(0, t), T);
  console.log(`\n  slide-${n}.mp4  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB   loop seam: mean difference ${seam.mean.toFixed(4)} / 255 ${seam.mean < .05 ? '(seamless)' : '(WARNING: the loop is not seamless)'}`);
}
await browser.close();
console.log('done →', out);
