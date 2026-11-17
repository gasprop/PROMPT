// Render the whole short in one browser session, in chunks, resumable.
// usage: LD_LIBRARY_PATH=web/lib/stubs node render_all.mjs [start] [count]
//   default start=0 count=1800
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const W = parseInt(process.env.W || '1080', 10), H = parseInt(process.env.H || '1920', 10);
const OUT = process.env.OUT || 'out/frames';
const start = parseInt(process.argv[2] || '0', 10);
const count = parseInt(process.argv[3] || '1800', 10);
const TOTAL = JSON.parse(fs.readFileSync(path.resolve('work/cues.json'), 'utf8')).total;
fs.mkdirSync(OUT, { recursive: true });

const isMac = process.platform === 'darwin';
if (!isMac) chromium.setGraphicsMode = true;
const stubs = path.resolve('web/lib/stubs');
const env = isMac ? process.env : { ...process.env, LD_LIBRARY_PATH: stubs + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') };
const browser = await puppeteer.launch({
  args: isMac ? ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'] : [...chromium.args, '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
  executablePath: isMac ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : await chromium.executablePath(),
  env, headless: isMac ? 'new' : 'shell',
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
const url = `file://${path.resolve('web/index.html')}?w=${W}&h=${H}`;
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 60000 });
const cues = JSON.parse(fs.readFileSync(path.resolve('work/cues.json'), 'utf8'));
await page.evaluate((d) => window.__setCues(d), cues);
console.log(`cues ${cues.shots.length} shots ${TOTAL} frames; rendering ${start}..${start + count - 1}`);

let t0 = Date.now(), done = 0;
for (let f = start; f < Math.min(TOTAL, start + count); f++) {
  const file = path.join(OUT, `f_${String(f).padStart(5, '0')}.jpg`);
  if (fs.existsSync(file)) { done++; continue; }
  await page.evaluate((fr) => window.__renderFrame(fr), f);
  await page.screenshot({ path: file, type: 'jpeg', quality: 95 });
  done++;
  if (done % 100 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`${done} frames, ${el.toFixed(0)}s, ${(el / done).toFixed(2)}s/frame, eta ${((count - done) * el / done / 60).toFixed(0)} min`);
  }
}
await browser.close();
console.log('done', done, 'frames in', ((Date.now() - t0) / 1000).toFixed(0) + 's');
