// C1.4 smoke driver (headless Chromium, SwiftShader WebGL2 — the C6.1 flags).
// Serve a folder holding smoke-host.html + the dist as ./pc/ (README「驗證」), then:
//   node smoke.mjs <url of smoke-host.html> <script.js> [screenshot.png]
// <script.js> is the body of an async function run in the host page (helpers: pc(), openUrl,
// openBytes, nextSave, events, saves — see smoke-host.html); its return value is printed as JSON.
// PLAYWRIGHT_DIR: a folder whose node_modules has `playwright` (default: the repo's e2e tests).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const [url, scriptFile, shot] = process.argv.slice(2);
if (!url || !scriptFile) {
  console.error('usage: node smoke.mjs <smoke-host url> <script.js> [screenshot.png]');
  process.exit(2);
}
const pwDir = process.env.PLAYWRIGHT_DIR || path.resolve(import.meta.dirname, '../../lobster-factory/infra/hetzner-phase1-core/tests');
const { chromium } = createRequire(path.join(pwDir, 'package.json'))('playwright');

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
try {
  await page.goto(url);
  // ready, or failed (no WebGPU/WebGL2, the wasm didn't load): stop at once with its reason.
  await page.waitForFunction(() => window.events && window.events.some((e) => e.type === 'photocraft:ready' || e.type === 'photocraft:failed'), null, { timeout: 120000 });
  const failed = await page.evaluate(() => window.events.find((e) => e.type === 'photocraft:failed'));
  if (failed) throw new Error('photocraft:failed ' + failed.error);
  const body = readFileSync(scriptFile, 'utf8');
  const result = await page.evaluate(`(async () => { ${body} })()`);
  if (shot) await page.screenshot({ path: shot });
  console.log(JSON.stringify({ ok: true, result }, null, 1));
} catch (e) {
  if (shot) await page.screenshot({ path: shot }).catch(() => {});
  console.log(JSON.stringify({ ok: false, error: String(e), logs: logs.slice(-30) }, null, 1));
  process.exitCode = 1;
} finally {
  await browser.close();
}
