#!/usr/bin/env node
// 影片工具操作教材：在正式站真的做一支影片，每步截圖（headed，操作者自己登入，agent 不碰密碼）。
// 不是 *.spec.ts，playwright test 不會撿到；直接 node 跑：
//   cd lobster-factory/infra/hetzner-phase1-core/tests
//   node e2e/tutorial/video-walkthrough.mjs                       # 從頭
//   node e2e/tutorial/video-walkthrough.mjs --project=<id> --from=render   # 中斷後接著跑
// 登入狀態存 $TEMP/aw-video-tutorial-state.json，重跑不必再登入（過期會再停在 /login 等）。
// 會花錢的只有腳本 AI（Haiku）與 Edge 配音（免費）；社群只存草稿，不發布。
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../../../..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d ?? ""}`).split("=").slice(1).join("=");

const BASE = arg("base", process.env.PLAYWRIGHT_BASE_URL || "https://app.aware-wave.com");
const OUT = path.resolve(arg("out", path.join(repo, "agency-os/docs/video_generator/img")));
const STATE = path.join(process.env.TEMP || os.tmpdir(), "aw-video-tutorial-state.json");
const STEPS = ["forge", "send", "cost", "generate", "render", "captions", "qa", "release", "project"];
const FROM = arg("from", "forge");
let projectId = arg("project", "");
const TOPIC = arg("topic", "教材示範：用 AI 三十秒看懂品牌影片怎麼做");
const CAPTION_EDIT = "教材示範：這句字幕是改過再重燒的";
const SOCIAL_TEXT = "教材示範：AI 影片工具做出來的第一支影片（草稿，不發布）";

if (!STEPS.includes(FROM)) throw new Error(`--from 只能是 ${STEPS.join("|")}`);
if (FROM !== "forge" && !projectId) throw new Error("--from 不是 forge 時要給 --project=<id>");
fs.mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(`[${new Date().toLocaleTimeString("zh-TW", { hour12: false })}] ${m}`);
const shots = [];
async function shot(page, name, note, opts = {}) {
  await page.waitForTimeout(800);
  const file = path.join(OUT, `${String(shots.length + 1).padStart(2, "0")}-${name}.jpg`);
  await page.screenshot({ path: file, type: "jpeg", quality: 72, fullPage: !!opts.fullPage });
  shots.push({ file: path.basename(file), note });
  log(`📸 ${path.basename(file)} — ${note}`);
}
const btn = (page, name, exact = false) => page.getByRole("button", { name, exact });

async function ensureLogin(page) {
  await page.goto(`${BASE}/tools/script-forge`, { waitUntil: "domcontentloaded" });
  if (!new URL(page.url()).pathname.startsWith("/login")) return;
  log("⏸ 請在開出來的瀏覽器自己登入（腳本不代填密碼），登入後會自動繼續…");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15 * 60_000 });
  await page.context().storageState({ path: STATE });
  log(`✅ 已登入，狀態存到 ${STATE}`);
}

async function pickOption(select, re) {
  const value = await select.evaluate((el, src) => {
    const r = new RegExp(src);
    return [...el.options].find((o) => r.test(o.textContent ?? ""))?.value ?? null;
  }, re.source);
  if (value === null) throw new Error(`下拉找不到 ${re}`);
  await select.selectOption(value);
}

async function forge(page) {
  await page.goto(`${BASE}/tools/script-forge`, { waitUntil: "networkidle" });
  await shot(page, "script-forge", "腳本工具首頁：左邊選功能，預設就是「手動生成」。");
  await pickOption(page.locator('select[title^="腳本場景總數"]'), /^4 場$/);
  await pickOption(page.locator('select[title^="前製素材分配"]'), /^0 場$/);
  await pickOption(page.locator('select[title^="文字 AI 模型"]'), /Claude Haiku/);
  await pickOption(page.locator('select[title^="載入客戶品牌語境"]'), /AwareWave/);
  await page.getByText(/✅ /).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await shot(page, "top-bar", "頂列設好：場景 4 場、AI 生圖 0 場、模型 Claude Haiku、客戶 AwareWave。");
  await page.getByPlaceholder(/新手如何開始學畫畫/).fill(TOPIC);
  await btn(page, /Instagram Reels/).click();
  await btn(page, "30秒", true).click();
  await shot(page, "brief", "填主題，平台選 Instagram Reels，長度選 30 秒。", { fullPage: true });
  await btn(page, /產生腳本角度/).click();
  await page.getByText("選擇腳本角度").waitFor();
  await page.getByText("AI 正在生成角度").waitFor({ state: "hidden", timeout: 120_000 }).catch(() => {});
  const angle = page.locator('div[style*="cursor: pointer"]').filter({ hasText: /\S{6,}/ }).first();
  await angle.waitFor({ timeout: 120_000 });
  await shot(page, "angles", "AI 給幾個腳本角度，點一個你喜歡的。");
  await angle.click();
  await page.getByText("完整腳本").waitFor();
  await btn(page, /送去做影片/).first().waitFor({ timeout: 240_000 });
  await page.waitForTimeout(3000);
  await shot(page, "script", "腳本寫好了：每一場有畫面、台詞、字幕。", { fullPage: true });
}

async function send(page) {
  if (!projectId) {
    const b = btn(page, /送去做影片/).first();
    await b.scrollIntoViewIfNeeded();
    await shot(page, "send-to-video", "按「🎬 送去做影片」，系統會自動建一個影片專案。");
    await Promise.all([page.waitForURL(/\/tools\/video\?project=/, { timeout: 60_000 }), b.click()]);
    projectId = new URL(page.url()).searchParams.get("project");
    log(`🎬 專案 ${projectId}`);
    // 測試資料要一眼認得：專案標題前綴「教材示範」。
    await page.evaluate(async (id) => {
      const r = await fetch(`/api/video/projects?id=${id}`); const j = await r.json();
      const t = j.item?.title ?? "";
      if (!t.startsWith("教材示範")) await fetch("/api/video/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, title: `教材示範｜${t}`.slice(0, 180) }) });
    }, projectId);
  }
  await page.goto(`${BASE}/tools/video?project=${projectId}`, { waitUntil: "networkidle" });
}

async function cost(page) {
  await page.getByText("費用預覽與確認").waitFor({ timeout: 30_000 });
  await shot(page, "cost", "② 設定與費用：先看大概要花多少錢，可以接受就按「確認，繼續 →」。", { fullPage: true });
  await btn(page, /確認，繼續/).click();
}

async function generate(page) {
  await page.getByText("素材模式").waitFor({ timeout: 30_000 });
  await btn(page, /^照片動畫/).click();
  const noMotion = btn(page, /不要（維持縮放特效/);
  if (await noMotion.isVisible()) await noMotion.click();
  await btn(page, /Edge TTS 繁中女聲/).click();
  // 比例鍵沒有 aria 狀態：先「全選」再取消 9:16，結果一定是 16:9＋4:5（16:9 排第一＝主版）。
  await btn(page, "全選", true).click();
  await btn(page, "9:16", true).click();
  await shot(page, "settings", "③ 素材選「照片動畫」、配音選「Edge TTS 繁中女聲」、比例勾 16:9 和 4:5。", { fullPage: true });
  await btn(page, "生成草稿", true).click();
  const go = btn(page, /生成，我要逐步審|確認送出渲染/);
  await go.waitFor({ timeout: 300_000 });
  await page.waitForFunction(() => ![...document.querySelectorAll("button")].some((b) => /圖片生成中|處理中/.test(b.textContent ?? "")), null, { timeout: 300_000 });
  await shot(page, "draft", "草稿出來了：每場的圖和台詞都看得到，不喜歡可以單場重生。", { fullPage: true });
  await go.click();
}

async function render(page) {
  page.on("response", async (r) => {
    if (!r.url().includes("/api/video/status")) return;
    const j = await r.json().catch(() => null);
    if (j) log(`⏳ 渲染 ${j.status ?? "?"} ${j.progress ?? ""}`);
  });
  await page.waitForTimeout(20_000);
  await shot(page, "rendering", "開始渲染，大約 6–8 分鐘；這頁可以開著等。");
  await btn(page, /下一步：審片/).waitFor({ timeout: 20 * 60_000 });
  await shot(page, "rendered", "做好了：兩個比例的影片都可以直接播。", { fullPage: true });
  await btn(page, /下一步：審片/).click();
}

async function captions(page) {
  await page.goto(`${BASE}/tools/video?project=${projectId}`, { waitUntil: "networkidle" });
  const first = page.getByLabel("字幕第 1 句");
  await first.waitFor({ timeout: 60_000 });
  await shot(page, "captions", "④ 審片第一步：配音和字幕已經做進影片，可以逐句改字幕。", { fullPage: true });
  await first.fill(CAPTION_EDIT);
  await btn(page, "重燒字幕", true).click();
  await page.getByText(/字幕已重燒|重燒字幕失敗/).waitFor({ timeout: 15 * 60_000 });
  if (await page.getByText("重燒字幕失敗").isVisible()) throw new Error("重燒字幕失敗");
  await shot(page, "reburned", "改一句字幕再按「重燒字幕」，每個比例都會重做。", { fullPage: true });
  await btn(page, /繼續 →/).click();
}

async function qa(page) {
  await page.getByText("技術 QA + 編輯 QA").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(5000);
  await shot(page, "qa", "四項檢查都要「通過」，才能進到發布。", { fullPage: true });
  await btn(page, /繼續到 Release/).click();
}

async function release(page) {
  await page.getByText("1. 成片與核准").waitFor({ timeout: 60_000 });
  const row = page.locator("div").filter({ has: page.locator("b", { hasText: /^16:9/ }) }).filter({ has: btn(page, "核准這個比例發布") }).last();
  await row.waitFor({ timeout: 60_000 });
  await shot(page, "release", "⑤ 發布：每個比例一列，四項都過的才能核准。", { fullPage: true });
  await row.getByRole("button", { name: "核准這個比例發布" }).click();
  await page.getByText(/已核准發布/).first().waitFor({ timeout: 60_000 });
  const fb = page.locator("label").filter({ hasText: /（facebook）/ }).first();
  await fb.waitFor({ timeout: 30_000 });
  await fb.locator('input[type="checkbox"]').check();
  await page.locator("label", { hasText: "的文案" }).locator("textarea").first().fill(SOCIAL_TEXT);
  await shot(page, "social", "核准 16:9 後，勾 facebook、寫文案。這裡只存草稿，不會發出去。", { fullPage: true });
  await btn(page, "存成社群草稿", true).click();
  await page.getByText(/已存成 \d+ 個社群草稿|存草稿失敗/).waitFor({ timeout: 60_000 });
  await shot(page, "drafted", "存好了：草稿在社群工具裡，要發布再去那邊按。", { fullPage: true });
}

async function project(page) {
  await page.goto(`${BASE}/tools/video/projects/${projectId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await shot(page, "project", "專案頁：這支影片的成片、檢查結果、發布紀錄都在這裡。", { fullPage: true });
}

const RUN = { forge, send, cost, generate, render, captions, qa, release, project };
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "zh-TW", ...(fs.existsSync(STATE) ? { storageState: STATE } : {}) });
const page = await context.newPage();
let failed = null;
try {
  await ensureLogin(page);
  if (FROM !== "forge" && FROM !== "send") await page.goto(`${BASE}/tools/video?project=${projectId}`, { waitUntil: "networkidle" });
  for (const s of STEPS.slice(STEPS.indexOf(FROM))) { log(`▶ ${s}`); await RUN[s](page); }
  await context.storageState({ path: STATE });
} catch (e) {
  failed = e;
  await page.screenshot({ path: path.join(OUT, "_error.jpg"), type: "jpeg", quality: 72, fullPage: true }).catch(() => {});
  console.error(`❌ ${e.message}\n   重跑：node e2e/tutorial/video-walkthrough.mjs --project=${projectId || "<id>"} --from=<步驟>`);
} finally {
  fs.writeFileSync(path.join(OUT, `shots-${FROM}.json`), JSON.stringify({ base: BASE, projectId, from: FROM, shots }, null, 2));
  await browser.close();
}
process.exit(failed ? 1 : 0);
