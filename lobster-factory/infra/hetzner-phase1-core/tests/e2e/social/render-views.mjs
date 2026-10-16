// Renders every /tools/social view to PNG so a design change can be looked at, not guessed (SOCIAL_MANAGER_GAP_REPORT.md §1).
// Against the no-Supabase dev server (.claude/launch.json "next-admin-social-ui", port 3902); every /api/social call is
// answered here with fixed sample data (8 posts across the states, 3 accounts incl. one expired, 1 list, 3 media, 3 log rows).
// Nothing reaches a database or Postiz. Output goes OUTSIDE the repo (renders are not committed).
//   node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/render-views.mjs "$env:TEMP/social-renders"
//   node .../render-views.mjs <outDir> --mock      # the mock instead (launch.json "social-mocks", port 8766): 1280x660 + phone 390
//                                                   day view and editor sheet; exit 1 when the phone page is wider than 390
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = process.argv[2];
if (!out) { console.error("usage: node render-views.mjs <outDir> [--mock]"); process.exit(2); }
mkdirSync(out, { recursive: true });
if (process.argv.includes("--mock")) {
  // what sticks out past the right edge of the screen: the page itself, plus any element (the editor sheet is fixed with
  // overflow hidden, so the page width alone cannot see inside it); children of a sideways-scrolling box are its business
  const sticksOut = () => {
    const w = innerWidth, scrolls = (e) => { for (let a = e.parentElement; a; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowX)) return true; return false; };
    const els = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.right > w + 1 && !scrolls(e); });
    return { page: document.scrollingElement.scrollWidth, over: els.slice(0, 5).map((e) => `${e.tagName.toLowerCase()}.${e.className}`.slice(0, 60)) };
  };
  const b = await chromium.launch();
  let bad = [];
  try {
    const pg = await b.newPage({ viewport: { width: 1280, height: 660 } });
    await pg.goto("http://127.0.0.1:8766/social-manager-mock.html", { waitUntil: "networkidle" });
    await pg.waitForTimeout(800);
    await pg.screenshot({ path: `${out}/mock-01.png` });
    // phone (U10): day view, then the editor sheet
    const ph = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ph.goto("http://127.0.0.1:8766/social-manager-mock.html", { waitUntil: "networkidle" });
    await ph.waitForTimeout(500);
    await ph.screenshot({ path: `${out}/mock-02-phone-day.png` });
    const day = await ph.evaluate(sticksOut);
    await ph.locator(".day.focus .card[data-kind=social]:not([data-state=rotation])").first().click({ timeout: 5000 });
    await ph.waitForFunction(() => document.body.classList.contains("sheet") && document.getElementById("edPanel").getBoundingClientRect().width > 0, null, { timeout: 5000 });
    await ph.waitForTimeout(300);
    await ph.screenshot({ path: `${out}/mock-03-phone-sheet.png` });
    const sheet = await ph.evaluate(sticksOut);
    console.log("phone, 390 wide", JSON.stringify({ day, sheet }));
    for (const [n, m] of [["day", day], ["sheet", sheet]]) if (m.page > 390 || m.over.length) bad.push(n);
  } finally {
    await b.close();
  }
  if (bad.length) { console.error(`FAIL: on the phone (${bad.join(", ")}) something is wider than the 390px screen`); process.exit(1); }
  console.log("done", out);
  process.exit(0);
}
const BRAND = { id: "0b0b0b0b-0000-4000-8000-000000000001", slug: "soulful", name: "Soulful Expression", default_timezone: "Asia/Taipei", role: "owner" };
const BRAND2 = { id: "0b0b0b0b-0000-4000-8000-000000000002", slug: "aw", name: "Aware Wave", default_timezone: "Asia/Taipei", role: "owner" };
const ACCOUNTS = [
  { id: "acc00000-0000-4000-8000-000000000001", platform: "bluesky", label: "soulfulexpression.bsky.social", status: "connected", postiz_integration_id: "i1" },
  { id: "acc00000-0000-4000-8000-000000000002", platform: "facebook", label: "Soulful Expression Art Therapy", status: "connected", postiz_integration_id: "i2" },
  { id: "acc00000-0000-4000-8000-000000000003", platform: "instagram", label: "soulful.art", status: "expired", postiz_integration_id: "i3" },
];
const now = new Date();
const day = (d, h, m = 0) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const mk = (i, state, at, body, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, state, body, scheduled_at: at, list_id: null, list_position: null,
  first_comment: null, link_url: null, link_utm: false, notes: null, source_url: null, published_at: state === "published" ? at : null, deleted_at: null,
  created_by: "ops:owner", version: 1, media: [],
  targets: [{ id: `t${i}a`, account_id: ACCOUNTS[0].id, custom_body: null, format: "post", state: state === "published" ? "published" : "pending", postiz_post_id: null, release_url: state === "published" ? "https://bsky.app/x" : null, error: null },
    { id: `t${i}b`, account_id: ACCOUNTS[1].id, custom_body: null, format: "post", state: state === "published" ? "published" : state === "error" ? "error" : "pending", postiz_post_id: null, release_url: null, error: state === "error" ? "Facebook: (#200) permission" : null }],
  ...extra,
});
const POSTS = [
  mk(1, "published", day(-2, 10), "本週六的藝術治療體驗課還有 3 個名額，歡迎私訊報名。#藝術治療 #台北"),
  mk(2, "error", day(-1, 9), "新文章上線：藝術治療和畫畫課有什麼不同？全文在部落格。"),
  mk(3, "scheduled", day(1, 12), "你今天有沒有為自己留一點時間？來畫一張不需要好看的畫。", { media: [{ media_id: "m1", position: 0, alt_text: "水彩" }] }),
  mk(4, "queued", day(0, 20), "晚安。今天也辛苦了。"),
  mk(5, "review", day(2, 15), "十一月團體課報名開始，早鳥價到 10/31。"),
  mk(6, "draft", null, "（草稿）年底回顧貼文，先放想法。"),
  mk(7, "scheduled", day(3, 9, 30), "每週一句：創作是一種安靜的勇氣。"),
  mk(8, "rotation", null, "常青貼文：什麼是藝術治療？", { list_id: "11111111-0000-4000-8000-000000000001", list_position: 0 }),
];
const LISTS = [{ id: "11111111-0000-4000-8000-000000000001", name: "常青內容", weekdays: [1, 3, 5], send_time: "10:00:00", active: true, cursor: 0, accounts: [{ account_id: ACCOUNTS[0].id }, { account_id: ACCOUNTS[1].id }] }];
const MEDIA = [
  { id: "m1", kind: "image", file_name: "watercolor-01.jpg", postiz_path: "https://picsum.photos/seed/a/400/300", bytes: 120000, created_at: day(-3, 1), used: 2 },
  { id: "m2", kind: "image", file_name: "studio.jpg", postiz_path: "https://picsum.photos/seed/b/400/300", bytes: 220000, created_at: day(-4, 1), used: 0 },
  { id: "m3", kind: "image", file_name: "poster-nov.png", postiz_path: "https://picsum.photos/seed/c/400/300", bytes: 320000, created_at: day(-5, 1), used: 1 },
];
const ARTICLE = { siteId: "site-1", siteName: "Soulful", id: 42, title: "藝術治療和畫畫課有什麼不同", status: "publish", date: day(1, 8).slice(0, 19), viewUrl: "https://soulful.example/a" };
const LOG = [
  { id: 3, at: day(0, 8), actor: "ops:owner", action: "schedule", post_id: POSTS[2].id, detail: { scheduled_at: POSTS[2].scheduled_at } },
  { id: 2, at: day(-1, 9, 5), actor: "system", action: "error", post_id: POSTS[1].id, detail: { error: "Facebook: (#200) permission" } },
  { id: 1, at: day(-2, 10), actor: "system", action: "published", post_id: POSTS[0].id, detail: {} },
];

async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
  const ok = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...body }) });
  if (p === "/api/social/brands") return ok({ brands: [BRAND, BRAND2] });
  if (p === "/api/social/accounts") return ok({ accounts: ACCOUNTS, connecting: null, justConnected: null, connectFailed: null });
  if (p === "/api/social/media") return ok({ media: MEDIA });
  if (p === "/api/social/texts") return ok({ texts: [{ id: "x1", body: "#藝術治療 #台北 #自我照顧" }] });
  if (p === "/api/social/needs") return ok({ failed: [POSTS[1]].map((x) => ({ id: x.id, body: x.body, scheduled_at: x.scheduled_at, errors: ["Facebook: (#200) permission"] })), expired: [{ id: ACCOUNTS[2].id, platform: "instagram", label: "soulful.art" }], review: [{ id: POSTS[4].id, body: POSTS[4].body, scheduled_at: POSTS[4].scheduled_at }], n: 3 });
  if (p === "/api/social/settings") return ok({ requireReview: true });
  if (p === "/api/social/members") return ok({ members: [{ user_id: "u1", email: "pei@example.com", role: "owner", created_at: day(-10, 1) }, { user_id: "u2", email: "client@example.com", role: "editor", created_at: day(-1, 1) }] });
  if (p === "/api/social/log") return ok({ log: LOG });
  if (p === "/api/social/lists" ) return ok({ lists: LISTS });
  if (p.startsWith("/api/social/lists/")) return ok({ list: LISTS[0], items: [POSTS[7]], upcoming: [POSTS[6]] });
  if (p === "/api/social/posts" && req.method() === "GET") {
    if (url.searchParams.get("trash") === "1") return ok({ posts: [] });
    return ok({ undatedTruncated: false, wordpress: [ARTICLE], posts: POSTS });
  }
  const m = p.match(/^\/api\/social\/posts\/([^/]+)$/);
  if (m) return ok({ post: POSTS.find((x) => x.id === m[1]) ?? POSTS[0] });
  return route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ ok: false, error: `fake ${p}` }) });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 660 }, deviceScaleFactor: 1 });
await page.route("**/api/social/**", handle);
await page.goto(`http://127.0.0.1:3902/tools/social?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "社群發文" }).waitFor();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-week-new.png` });
// open a scheduled post
await page.getByTitle(/已排程/).first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/02-week-edit-scheduled.png` });
// the header's 通知 N opens the log on 需處理
await page.getByRole("button", { name: /通知/ }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/03-needs.png` });
await page.getByRole("button", { name: "週", exact: true }).click();
await page.waitForTimeout(400);
// the review one -> reviewer bar
await page.locator(".sm-post[data-state=review]").first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/04-edit-review.png` });
for (const [v, name] of [["月", "05-month"], ["清單", "06-list"], ["輪播", "07-lists"], ["媒體", "08-media"], ["紀錄", "09-log"], ["設定", "10-settings"]]) {
  await page.getByRole("button", { name: v, exact: true }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png` });
}
// list detail on the right
await page.getByRole("button", { name: "輪播", exact: true }).click();
await page.waitForTimeout(400);
await page.getByText("常青內容").first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/11-list-detail.png` });
// mobile
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "週", exact: true }).click();
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/12-mobile-week.png`, fullPage: true });
const size = await page.evaluate(() => ({ h: document.scrollingElement.scrollHeight, w: document.scrollingElement.scrollWidth }));
console.log("mobile page size", size, size.w > 390 ? "(wider than the viewport: horizontal overflow)" : "");
await browser.close();
console.log("done", out);
