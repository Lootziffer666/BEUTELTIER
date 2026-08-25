import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL ?? 'http://127.0.0.1:4173/';

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

async function measure(label, durationMs) {
  const result = await page.evaluate(async (d) => {
    const samples = [];
    let last = performance.now();
    let frames = 0;
    const stop = last + d;
    return new Promise((resolve) => {
      function tick() {
        const now = performance.now();
        samples.push(now - last);
        last = now;
        frames += 1;
        if (now < stop) requestAnimationFrame(tick);
        else resolve({ frames, samples });
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
  const s = result.samples;
  s.sort((a, b) => a - b);
  const avg = s.reduce((a, b) => a + b, 0) / s.length;
  const median = s[Math.floor(s.length / 2)];
  const p95 = s[Math.floor(s.length * 0.95)];
  const fps = 1000 / avg;
  console.log(
    `${label}: frames=${result.frames} avg=${avg.toFixed(1)}ms median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms fps=${fps.toFixed(1)}`,
  );
}

await measure('Uebersicht', 3000);

const icons = await page.$$('.icon-choice');
const labels = await Promise.all(icons.map((el) => el.textContent()));
console.log('icons:', labels.map((t) => t?.trim()).join(' | '));

for (let i = 0; i < icons.length; i++) {
  const t = (await icons[i].textContent())?.trim();
  if (t === 'Halle') { await icons[i].click(); break; }
}
await page.waitForTimeout(1500);
await measure('Halle    ', 3000);

await browser.close();
fs.writeFileSync('app/perf-logs.txt', logs.join('\n'));
console.log('logs: app/perf-logs.txt');
