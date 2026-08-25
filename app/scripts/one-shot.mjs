import { chromium } from 'playwright';
const URL = process.env.URL ?? 'http://127.0.0.1:4182/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 20000 });
await page.waitForTimeout(5000);
await page.screenshot({ path: '/workspace/3546202e-d6d3-42d8-abb3-cfad3a70b24a/sessions/agent_e4464314-0f11-4dea-8839-6190745b970b/app/cel-fix-1-uebersicht.png' });
await browser.close();
console.log('done');
