import { chromium } from 'playwright';
const CHROME = process.env.CHROME;
const URL = process.env.WB_URL ?? 'http://127.0.0.1:8199/world-builder.html';
const browser = await chromium.launch({
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console:${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

// Capture every getContext('webgl*') call, with its call stack.
await page.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    const ctx = orig.call(this, type, opts);
    if (type === 'webgl2' || type === 'webgl') {
      window.__ctxTrace = window.__ctxTrace || [];
      window.__ctxTrace.push({ type, ok: !!ctx, stack: (new Error()).stack.split('\n').slice(1, 6).join(' | ') });
    }
    return ctx;
  };
});

await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => ({
  canvasCount: document.querySelectorAll('canvas').length,
  editor: !!window.__BEUTELTIER_EDITOR__,
  state: window.__BEUTELTIER_EDITOR__ ? window.__BEUTELTIER_EDITOR__.state() : null,
  ctxTrace: window.__ctxTrace || [],
}));
console.log(JSON.stringify(info, null, 2));
console.log('ERRORS:', errors);
await browser.close();