// Frame renderer: loads the harness in headless Chromium (SwiftShader WebGL2) and screenshots frames.
// usage: node render.mjs <outDir> <w> <h> <frames "0-299" | "0,10,20"> [scale]
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const [outDir, wArg, hArg, framesArg] = process.argv.slice(2);
const W = parseInt(wArg || '540', 10), H = parseInt(hArg || '960', 10);
fs.mkdirSync(outDir, { recursive: true });

const parseFrames = (s) => {
  if (s.includes('-')) { const [a, b] = s.split('-').map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
  return s.split(',').map(Number);
};
const frames = parseFrames(framesArg);

chromium.setGraphicsMode = true;
// stub NSS/NSPR libraries (built by make_stubs.py) so the serverless Chromium can load here
const stubs = path.resolve(new URL('.', import.meta.url).pathname, 'web/lib/stubs');
const env = { ...process.env, LD_LIBRARY_PATH: stubs + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') };
const browser = await puppeteer.launch({
  args: [...chromium.args, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  executablePath: await chromium.executablePath(),
  env,
  headless: 'shell',
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (!t.includes('THREE.WebGLRenderer')) console.log('[page]', t.slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
const url = `file://${path.resolve(new URL('.', import.meta.url).pathname, 'web/index.html')}?w=${W}&h=${H}`;
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
// install the shot list (work/cues.json) if it is there
const cuesPath = path.resolve(new URL('.', import.meta.url).pathname, 'work/cues.json');
if (fs.existsSync(cuesPath)) {
  const data = JSON.parse(fs.readFileSync(cuesPath, 'utf8'));
  await page.evaluate((d) => window.__setCues(d), data);
  console.log(`cues: ${data.shots.length} shots, ${data.total} frames (${(data.total / 30).toFixed(1)}s), audio=${data.real_audio ? 'real' : 'model'}`);
} else {
  console.log('cues: none (work/cues.json missing) — story defaults');
}
console.log('ready', W + 'x' + H, 'frames:', frames.length);

const ext = process.env.FORMAT === 'png' ? 'png' : 'jpg';
for (const f of frames) {
  const t0 = Date.now();
  await page.evaluate((fr) => window.__renderFrame(fr), f);
  const file = path.join(outDir, `f_${String(f).padStart(5, '0')}.${ext}`);
  await page.screenshot({ path: file, type: ext === 'png' ? 'png' : 'jpeg', quality: 95 });
  console.log('frame', f, ((Date.now() - t0) / 1000).toFixed(2) + 's');
}
await browser.close();
console.log('done');
