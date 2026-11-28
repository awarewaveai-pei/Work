#!/usr/bin/env node
/**
 * 紫微命盤「一個畫面看完」檢查(卡 R2)。專案沒有瀏覽器測試慣例,寫成可重跑的腳本,不進 vitest。
 *
 * 用法(先 `npm run dev` 或 `npm start` 起引擎):
 *   node scripts/check-ziwei-fit.mjs [baseUrl=http://localhost:3000] [--shots <資料夾>]
 * 需要 playwright 套件:專案未列相依,用 PLAYWRIGHT_MODULE 指到任一份安裝(例 npx 快取的 node_modules/playwright)。
 *
 * 檢查(桌機 1440×900、1280×720;嵌入頁與獨立頁;中英文;兩張固定命盤):
 *   1. 命盤捲到頂端對齊後,底邊 ≤ 視窗高度(整張盤在一個畫面內)。
 *   2. 頁面沒有橫向溢出(scrollWidth ≤ clientWidth)。
 *   3. 十二宮都有畫出來(英文盤地支是拼音,曾因查表只認中文而整盤空白)。
 * --shots 另外截 768×1024、375×812 的圖(只查橫向溢出,不查高度;平板手機允許捲動)。
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shotsDir = shotsIdx >= 0 ? args[shotsIdx + 1] : null;
const base = (args.find((a, i) => !a.startsWith('--') && (shotsIdx < 0 || i !== shotsIdx + 1)) || 'http://localhost:3000').replace(/\/$/, '');

const CHARTS = [
  { id: '1979', date: '1979-11-15', time: '22:00' }, // 亥時,女
  { id: '2000', date: '2000-08-16', time: '14:30' }, // 未時,女
];
const PAGES = [
  { id: 'embed-zh', url: '/embed/zh-TW/ziwei' },
  { id: 'embed-en', url: '/embed/en/ziwei' },
  { id: 'site-zh', url: '/zh-TW/ziwei' },
  { id: 'site-en', url: '/en/ziwei' },
];
const DESKTOP = [
  { w: 1440, h: 900 },
  { w: 1280, h: 720 },
];
const OTHER = [
  { w: 768, h: 1024 },
  { w: 375, h: 812 },
];

const browser = await chromium.launch();
const failures = [];
let checks = 0;
try {
  for (const vp of shotsDir ? [...DESKTOP, ...OTHER] : DESKTOP) {
    const judge = DESKTOP.includes(vp);
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
    for (const pg of PAGES) {
      for (const c of CHARTS) {
        await page.goto(base + pg.url, { waitUntil: 'networkidle' });
        await page.fill('input[type=date]', c.date);
        await page.fill('input[type=time]', c.time);
        if (pg.id.endsWith('-en')) {
          // 英文介面不預設出生地,選台北(與中文預設同地)
          await page.fill('input[type=search]', 'Taipei');
          await page.locator('form button', { hasText: 'Taipei' }).first().click();
        }
        await page.click('button[type=submit]');
        const chart = page.locator('[data-ziwei-chart]');
        await chart.waitFor();
        await chart.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        const m = await chart.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const d = document.documentElement;
          return { palaces: el.querySelectorAll('.ziwei-palace').length, bottom: r.bottom, height: r.height, innerH: innerHeight, sw: d.scrollWidth, cw: d.clientWidth };
        });
        const tag = `${pg.id} ${c.id} ${vp.w}x${vp.h}`;
        if (shotsDir) {
          mkdirSync(shotsDir, { recursive: true });
          await page.screenshot({ path: path.join(shotsDir, `${pg.id}-${c.id}-${vp.w}x${vp.h}.png`) });
        }
        const overflowX = m.sw > m.cw;
        const tooTall = judge && m.bottom > m.innerH + 0.5;
        checks += judge ? 3 : 2;
        if (m.palaces !== 12) failures.push(`${tag}: 只畫出 ${m.palaces} 宮`);
        if (tooTall) failures.push(`${tag}: 盤底 ${Math.round(m.bottom)} > 視窗 ${m.innerH}(盤高 ${Math.round(m.height)})`);
        if (overflowX) failures.push(`${tag}: 橫向溢出 scrollWidth ${m.sw} > ${m.cw}`);
        console.log(`${overflowX || tooTall || m.palaces !== 12 ? 'FAIL' : 'ok  '} ${tag} 宮=${m.palaces} 盤高=${Math.round(m.height)} 底=${Math.round(m.bottom)}/${m.innerH} 寬=${m.sw}/${m.cw}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(`\n${checks} 項檢查,${failures.length} 項失敗`);
for (const f of failures) console.log('  ' + f);
process.exit(failures.length ? 1 : 0);
