// Renders every /tools/social view to PNG so a design change can be looked at, not guessed (SOCIAL_MANAGER_GAP_REPORT.md §1);
// the C19 frame: plan tabs, the composer's own page, the five section shells. Phone renders come with C30.
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
  { id: "acc00000-0000-4000-8000-000000000001", platform: "bluesky", label: "Soulful Expression", status: "connected", postiz_integration_id: "i1", picture: null, handle: "soulfulexpression.bsky.social", chatwoot_inbox_id: null },
  { id: "acc00000-0000-4000-8000-000000000002", platform: "facebook", label: "Soulful Expression Art Therapy", status: "connected", postiz_integration_id: "i2", picture: null, handle: "", chatwoot_inbox_id: null },
  { id: "acc00000-0000-4000-8000-000000000003", platform: "instagram", label: "soulful.art", status: "expired", postiz_integration_id: "i3", picture: null, handle: "soulful.art", chatwoot_inbox_id: null },
];
const now = new Date();
const day = (d, h, m = 0) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x.toISOString(); };
const mk = (i, state, at, body, extra = {}) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, state, body, scheduled_at: at, list_id: null, list_position: null,
  first_comment: null, link_url: null, link_utm: false, notes: null, source_url: null, published_at: state === "published" ? at : null, deleted_at: null,
  created_by: "ops:owner", version: 1, media: [], repeat: null, repeat_of: null, origin_slot: null, auto_mode: "brand", comments: [], tags: [],
  targets: [{ id: `t${i}a`, account_id: ACCOUNTS[0].id, custom_body: null, format: "post", state: state === "published" ? "published" : "pending", postiz_post_id: null, release_url: state === "published" ? "https://bsky.app/x" : null, error: null },
    { id: `t${i}b`, account_id: ACCOUNTS[1].id, custom_body: null, format: "post", state: state === "published" ? "published" : state === "error" ? "error" : "pending", postiz_post_id: null, release_url: state === "published" ? "https://www.facebook.com/example/posts/1" : null, error: state === "error" ? "Facebook: (#200) permission" : null }],
  ...extra,
});
const TAGS = [{ id: "tag-a", name: "活動", colour: "a" }, { id: "tag-b", name: "課程", colour: "b" }, { id: "tag-c", name: "每週一句", colour: "c" }];
// Taipei's weekday (1 Mon .. 7 Sun) of an instant: the series below repeats weekly on that day
const taipeiWeekday = (iso) => ((new Date(Date.parse(iso) + 8 * 3600_000).getUTCDay() + 6) % 7) + 1;
const POSTS = [
  mk(1, "published", day(-2, 10), "本週六的藝術治療體驗課還有 3 個名額，歡迎私訊報名。#藝術治療 #台北"),
  mk(2, "error", day(-1, 9), "新文章上線：藝術治療和畫畫課有什麼不同？全文在部落格。"),
  mk(3, "scheduled", day(1, 12), "你今天有沒有為自己留一點時間？來畫一張不需要好看的畫。", { media: [{ media_id: "m1", position: 0, alt_text: "水彩" }, { media_id: "m2", position: 1, alt_text: null }], tags: [{ tag_id: "tag-b" }] }),
  mk(4, "queued", day(0, 20), "晚安。今天也辛苦了。"),
  mk(5, "review", day(2, 15), "十一月團體課報名開始，早鳥價到 10/31。"),
  mk(6, "draft", null, "（草稿）年底回顧貼文，先放想法。"),
  mk(7, "scheduled", day(3, 9, 30), "每週一句：創作是一種安靜的勇氣。", { tags: [{ tag_id: "tag-c" }], repeat: { freq: "week", days: [taipeiWeekday(day(3, 9, 30))], end: "never" } }),
  mk(9, "scheduled", day(1, 18), "週六親子藝術時光，現在報名還有名額。", { tags: [{ tag_id: "tag-a" }, { tag_id: "tag-b" }], auto_mode: "own" }),
  mk(8, "rotation", null, "常青貼文：什麼是藝術治療？", { list_id: "11111111-0000-4000-8000-000000000001", list_position: 0 }),
];
const TRASHED = [
  mk(10, "deleted", day(2, 10), "舊的活動預告：十月份體驗課已經額滿。", { deleted_at: day(-1, 15, 20) }),
  mk(11, "deleted", null, "（草稿）想法太散，先刪掉。", { deleted_at: day(-3, 9, 5) }),
];
const DELETIONS = { [TRASHED[0].id]: { actor: "ops:owner:u1", from: "scheduled" }, [TRASHED[1].id]: { actor: "client:soulful", from: "draft" } };
const LISTS = [{ id: "11111111-0000-4000-8000-000000000001", name: "常青內容", weekdays: [1, 3, 5], send_time: "10:00:00", active: true, cursor: 0, accounts: [{ account_id: ACCOUNTS[0].id }, { account_id: ACCOUNTS[1].id }],
  slots: [{ weekday: 1, send_time: "10:00:00" }, { weekday: 3, send_time: "10:00:00" }, { weekday: 5, send_time: "18:00:00" }] }];
const MEDIA = [
  { id: "m1", kind: "image", file_name: "watercolor-01.jpg", postiz_path: "https://picsum.photos/seed/a/400/300", bytes: 120000, created_at: day(-3, 1), used: 2 },
  { id: "m2", kind: "image", file_name: "studio.jpg", postiz_path: "https://picsum.photos/seed/b/400/300", bytes: 220000, created_at: day(-4, 1), used: 0 },
  { id: "m3", kind: "image", file_name: "poster-nov.png", postiz_path: "https://picsum.photos/seed/c/400/300", bytes: 320000, created_at: day(-5, 1), used: 1 },
  { id: "m4", kind: "video", file_name: "workshop.mp4", postiz_path: null, bytes: 840000, created_at: day(-2, 1), used: 0 },
];
const ARTICLE = { siteId: "site-1", siteName: "Soulful", id: 42, title: "藝術治療和畫畫課有什麼不同", status: "publish", date: day(1, 8).slice(0, 19), viewUrl: "https://soulful.example/a" };
const LOG = [
  { id: 3, at: day(0, 8), actor: "ops:owner", action: "schedule", post_id: POSTS[2].id, detail: { scheduled_at: POSTS[2].scheduled_at } },
  { id: 2, at: day(-1, 9, 5), actor: "system", action: "error", post_id: POSTS[1].id, detail: { error: "Facebook: (#200) permission" } },
  { id: 1, at: day(-2, 10), actor: "system", action: "published", post_id: POSTS[0].id, detail: {} },
];

// C24 數據分析: sample numbers in the API's shape (lib/social/metrics.ts Analytics). Facebook has reach / impressions /
// engagement, Bluesky followers / posts / engagement, the expired Instagram nothing -- each gap with its reason.
function analytics(days, account) {
  const iso = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
  const dayList = (off) => Array.from({ length: days }, (_, i) => iso(off - days + 1 + i));
  const ids = account ? [account] : ACCOUNTS.map((a) => a.id);
  const has = (id) => ids.includes(id);
  const fb = has(ACCOUNTS[1].id), bs = has(ACCOUNTS[0].id);
  const wave = (k, base, amp) => (i) => Math.max(0, Math.round(base + amp * Math.sin((i + k) / 2.3) + ((i * 7 + k) % 5)));
  const line = (on, f) => Array.from({ length: days }, (_, i) => (on ? f(i) : null));
  const series = {
    followers: { cur: line(bs, (i) => 120 + Math.floor(i / 3)), prev: line(bs, (i) => 112 + Math.floor(i / 4)) },
    reach: { cur: line(fb, wave(1, 60, 25)), prev: line(fb, wave(4, 50, 20)) },
    impressions: { cur: line(fb, wave(2, 140, 50)), prev: line(fb, wave(5, 120, 40)) },
    engagement: { cur: line(fb || bs, wave(3, 9, 5)), prev: line(fb || bs, wave(6, 7, 4)) },
    posts: { cur: line(bs, (i) => (i % 3 === 0 ? 1 : 0)), prev: line(bs, (i) => (i % 4 === 0 ? 1 : 0)) },
  };
  series.rate = { cur: line(fb, (i) => Math.round((series.engagement.cur[i] / Math.max(1, series.reach.cur[i])) * 1000) / 10), prev: line(fb, (i) => Math.round((series.engagement.prev[i] / Math.max(1, series.reach.prev[i])) * 1000) / 10) };
  const sum = (vs) => vs.some((v) => v != null) ? vs.reduce((a, v) => a + (v ?? 0), 0) : null;
  const last = (vs) => [...vs].reverse().find((v) => v != null) ?? null;
  const kpis = Object.fromEntries(Object.entries(series).map(([m, s]) => [m, m === "followers" ? { value: last(s.cur), prev: last(s.prev) }
    : m === "rate" ? { value: fb ? Math.round((sum(series.engagement.cur) / sum(series.reach.cur)) * 1000) / 10 : null, prev: fb ? Math.round((sum(series.engagement.prev) / sum(series.reach.prev)) * 1000) / 10 : null }
    : { value: sum(s.cur), prev: sum(s.prev) }]));
  const cur = dayList(-1);
  const gaps = [
    ...(fb ? [{ account_id: ACCOUNTS[1].id, fields: ["followers"], reason: "Postiz 只提供每天新增的追蹤數，沒有追蹤者總數" }, { account_id: ACCOUNTS[1].id, fields: ["posts"], reason: "Postiz 沒有提供每天的發文數" }] : []),
    ...(bs ? [{ account_id: ACCOUNTS[0].id, fields: ["reach", "impressions"], reason: "Bluesky 不提供觸及和曝光數" }] : []),
    ...(has(ACCOUNTS[2].id) ? [{ account_id: ACCOUNTS[2].id, fields: ["followers", "reach", "impressions", "engagement", "posts"], reason: "要等這個平台審核通過分析權限" }] : []),
  ];
  const posts = [POSTS[0], ...TRASHED].slice(0, 3).map((x, i) => ({ id: `${x.id}-a${i}`, body: x.body, published_at: day(-1 - i * 3, 10), account_ids: [ACCOUNTS[i % 2].id],
    thumb: null, reach: i % 2 ? 84 - i : null, engagement: 6 + i, rate: i % 2 ? Math.round(((6 + i) / (84 - i)) * 1000) / 10 : null })).filter((x) => x.account_ids.some(has));
  return { period: { from: cur[0], to: cur.at(-1), prevFrom: dayList(-1 - days)[0], prevTo: dayList(-1 - days).at(-1) }, days: cur, accounts: ACCOUNTS,
    gaps, empty: [], posts, latestDay: cur.at(-1), kpis, series };
}

// C25 報表管理: the same sample numbers as 數據分析, in the report API's shape (lib/social/reports.ts ReportData). Facebook has
// reach / impressions / engagement, Bluesky followers / posts / engagement, the expired Instagram nothing.
const REPORT = { id: "00000000-0000-4000-8000-0000000000a1", name: "上個月成效報告", period_from: "2026-09-01", period_to: "2026-09-30", format: "pdf", colour: "b",
  account_ids: ACCOUNTS.map((a) => a.id), sections: ["sum", "plat", "top", "cmp"], created_at: day(-1, 10), created_by: "ops:owner" };
function reportData() {
  const a = analytics(30, null);
  const per = (acc, keep) => ({ account_id: acc.id, kpis: Object.fromEntries(Object.entries(a.kpis).map(([m, k]) => [m, keep.includes(m) ? k : { value: null, prev: null }])) });
  return { brand: { id: BRAND.id, name: BRAND.name }, period: { from: "2026-09-01", to: "2026-09-30", prevFrom: "2026-08-02", prevTo: "2026-08-31", days: a.days },
    accounts: ACCOUNTS, total: { kpis: a.kpis, series: a.series },
    perAccount: [per(ACCOUNTS[0], ["followers", "engagement", "posts"]), per(ACCOUNTS[1], ["reach", "impressions", "engagement", "rate"]), per(ACCOUNTS[2], [])],
    gaps: a.gaps.map((g) => ({ account_id: g.account_id, reason: g.reason })), empty: [], top: a.posts };
}

async function handle(route) {
  const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
  const ok = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, ...body }) });
  if (p === "/api/social/brands") return ok({ brands: [BRAND, BRAND2] });
  // C21 composer: the brand's tags and its auto-reply rules (one on, one off)
  if (p === "/api/social/tags") return ok({ tags: [{ id: "tag-a", name: "活動", colour: "a" }, { id: "tag-b", name: "課程", colour: "b" }, { id: "tag-c", name: "每週一句", colour: "c" }] });
  if (p === "/api/social/auto-rules") return ok({ rules: url.searchParams.get("post") ? [] : [
    { id: "r1", post_id: null, name: "報名表", trigger: "comment", keywords: ["報名", "怎麼報"], platforms: ["facebook", "instagram"], action: "both", reply: "謝謝你！報名表在這裡。", active: true, hits: 12 },
    { id: "r2", post_id: null, name: "上課地點", trigger: "dm", keywords: ["地址"], platforms: ["instagram"], action: "dm", reply: "工作室在台北市大安區。", active: false, hits: 3 }] });
  if (p === "/api/social/accounts") return ok({ accounts: ACCOUNTS, connecting: null, justConnected: null, connectFailed: null });
  if (p === "/api/social/media") return ok({ media: MEDIA });
  if (p === "/api/social/texts") return ok({ texts: [{ id: "x1", body: "#藝術治療 #台北 #自我照顧", mediaIds: [] }] });
  if (p === "/api/social/needs") return ok({ failed: [POSTS[1]].map((x) => ({ id: x.id, body: x.body, scheduled_at: x.scheduled_at, errors: ["Facebook: (#200) permission"] })), expired: [{ id: ACCOUNTS[2].id, platform: "instagram", label: "soulful.art" }], review: [{ id: POSTS[4].id, body: POSTS[4].body, scheduled_at: POSTS[4].scheduled_at }], n: 3 });
  if (p === "/api/social/settings") return ok({ requireReview: true });
  // C29 訊息收件匣: Facebook linked with 3 unread, Bluesky linked and all read, Instagram not linked to an inbox
  if (p === "/api/social/inbox") return ok({ home: "https://chat.example/app/accounts/1/conversations", inboxes: [
    { accountId: ACCOUNTS[1].id, platform: "facebook", label: ACCOUNTS[1].label, handle: "", picture: null, chatwootInboxId: 7, unread: 3, status: "ok", chatwootUrl: "https://chat.example/app/accounts/1/inbox/7" },
    { accountId: ACCOUNTS[0].id, platform: "bluesky", label: ACCOUNTS[0].label, handle: ACCOUNTS[0].handle, picture: null, chatwootInboxId: 8, unread: 0, status: "ok", chatwootUrl: "https://chat.example/app/accounts/1/inbox/8" },
    { accountId: ACCOUNTS[2].id, platform: "instagram", label: ACCOUNTS[2].label, handle: ACCOUNTS[2].handle, picture: null, chatwootInboxId: null, unread: 0, status: "unlinked", chatwootUrl: null }] });
  if (p === "/api/social/members") return ok({ members: [{ user_id: "u1", email: "pei@example.com", role: "owner", created_at: day(-10, 1) }, { user_id: "u2", email: "client@example.com", role: "editor", created_at: day(-1, 1) }] });
  if (p === "/api/social/log") return ok({ log: LOG });
  if (p === "/api/social/metrics") return ok({ analytics: analytics(Number(url.searchParams.get("days") ?? 28), url.searchParams.get("account")) });
  if (p === "/api/social/reports/monthly") return ok({ monthly: { enabled: false, lastRunAt: null, lastError: null } });
  if (p === "/api/social/reports") return url.searchParams.get("preview") === "1" ? ok({ data: reportData() }) : ok({ reports: [REPORT, { ...REPORT, id: "r2", name: "上週成效報告", created_at: day(-8, 10) }] });
  if (p.startsWith("/api/social/reports/")) return ok({ report: REPORT, data: reportData() });
  if (p === "/api/social/lists" ) return ok({ lists: LISTS });
  if (p.startsWith("/api/social/lists/")) return ok({ list: LISTS[0], items: [POSTS[7]], upcoming: [POSTS[6]] });
  if (p === "/api/social/posts" && req.method() === "GET") {
    if (url.searchParams.get("trash") === "1") return ok({ posts: TRASHED, deletions: DELETIONS });
    return ok({ undatedTruncated: false, tags: TAGS, wordpress: [ARTICLE], posts: POSTS });
  }
  const m = p.match(/^\/api\/social\/posts\/([^/]+)$/);
  if (m) return ok({ post: POSTS.find((x) => x.id === m[1]) ?? POSTS[0] });
  return route.fulfill({ status: 501, contentType: "application/json", body: JSON.stringify({ ok: false, error: `fake ${p}` }) });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 660 }, deviceScaleFactor: 1 });
await page.route("**/api/social/**", handle);
page.on("console", (m) => { if (m.type() === "error") console.log("console error:", m.text().slice(0, 300)); });   // the dev overlay counts these
const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({ path: `${out}/${name}.png` }); };
// C19 frame: the plan page (channel list + toolbar + week), then every tab and the views behind the bell and the gear.
// Names: the cards' own (01 calendar, 02 compose, 10 sections, 15 C27 flows); x-* are the other views.
await page.goto(`http://localhost:3902/tools/social?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "社群發文" }).waitFor();
await shot("01-calendar");
await page.locator('.sm-post[data-state="published"]').first().hover();
await page.getByRole("link", { name: "在 Bluesky 查看貼文" }).waitFor();
await shot("x-card-links");
// the next week: every day is ahead, so the best times show on all seven and the posts made for the coming days are there
await page.getByRole("button", { name: "往後" }).click();
await shot("x-next-week");
await page.getByRole("button", { name: /^最佳發布時間/ }).click();
await shot("05-best");
await page.getByRole("button", { name: /^最佳發布時間/ }).click();
await page.getByRole("button", { name: /^篩選/ }).click();
await page.getByLabel("課程").check();
await shot("06-filter");
await page.getByRole("button", { name: "清除" }).click();
await page.getByRole("button", { name: "完成" }).click();
await page.getByRole("button", { name: "月", exact: true }).click();
await shot("08-month");
await page.getByRole("button", { name: "週", exact: true }).click();
await page.getByRole("button", { name: "Soulful Expression Art Therapy 的選單" }).click();
await shot("x-channel-menu");
await page.getByRole("button", { name: "Soulful Expression Art Therapy 的選單" }).click();   // closes it again
for (const [tab, name] of [["貼文清單", "x-list"], ["貼文素材庫", "x-library"], ["自動發布清單", "x-lists"], ["已刪除貼文", "07-trash"], ["自動化流程", "15-flows"]]) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await shot(name);
}
await page.getByRole("button", { name: "貼文素材庫", exact: true }).click();
await page.getByRole("button", { name: "圖片和影片", exact: true }).click();
await page.getByText("workshop.mp4", { exact: true }).waitFor();
await shot("18-library");
await page.getByRole("button", { name: "自動發布清單", exact: true }).click();
await page.getByText("常青內容").first().click();
await shot("11-list-detail");   // C23: two time rows (10:00 Mon+Wed, 18:00 Fri) = 3 weekly slots
await page.getByRole("button", { name: "＋ 加一個時間" }).click();
await page.getByRole("button", { name: /^改時間 12:00/ }).click();
await shot("11-list-time");   // the composer's DateTimePicker, time only
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /需處理的事和紀錄/ }).click();
await shot("x-log-needs");
await page.getByRole("button", { name: "設定", exact: true }).click();
await shot("x-settings");
// the composer's own page (C21): 建立貼文 with text, two comments and a tag; ▾ of the main button; 設定發佈時間 (and with
// 週期性安排); then an existing post (a scheduled one, the one waiting for review)
await page.goto(`http://localhost:3902/tools/social/compose/new?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByLabel("貼文內容").waitFor();
await page.getByLabel("貼文內容").fill("這則貼文要立即發佈，先確認頻道和不可撤回的風險。");
await page.getByRole("button", { name: "換一種做法" }).click();
await page.getByRole("menuitemradio", { name: /立即發佈/ }).click();
await page.getByRole("button", { name: "立即發佈", exact: true }).click();
await page.getByRole("dialog").waitFor();
await shot("x-publish-confirm");
await page.goto(`http://localhost:3902/tools/social/compose/new?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByLabel("貼文內容").waitFor();
await page.getByRole("button", { name: "從媒體庫選" }).click();
await page.getByRole("button", { name: "圖片和影片", exact: true }).click();
await page.getByText("watercolor-01.jpg", { exact: true }).waitFor();
await page.getByRole("button", { name: /watercolor-01\.jpg/ }).click();
await page.locator(".sm-cwrite .sm-mt img").first().waitFor();
await shot("x-compose-media-picked");
await page.getByRole("button", { name: "排程日曆", exact: true }).click();
await page.locator(".sm-toolbar .sm-end button").click();
await page.waitForURL(/\/tools\/social\/compose\/new/);
await page.getByLabel("貼文內容").waitFor();
await page.getByLabel("貼文內容").fill("這週六下午的親子藝術時光還有三個名額。不需要任何繪畫基礎，帶著孩子一起來玩顏色就好。報名方式在留言。");
await page.getByRole("button", { name: "新增留言" }).last().click();
await page.getByLabel("第 1 則留言", { exact: true }).fill("報名表在這裡：soulfulexpression.art/sat");
await page.getByRole("button", { name: "新增留言" }).last().click();
await page.getByLabel("第 2 則留言", { exact: true }).fill("名額滿了會在這裡說。");
await page.getByRole("button", { name: "第 2 則什麼時候留" }).click();
await page.getByRole("button", { name: "這則的自動回覆" }).click();
await shot("x-compose-comments");
await page.locator(".sm-wscroll").evaluate((e) => e.scrollTo(0, 0));
await shot("02-compose");
await page.getByRole("button", { name: "換一種做法" }).click();
await shot("03-compose-menu");
await page.getByRole("menuitemradio", { name: /週期性安排/ }).click();
await page.getByRole("button", { name: /^設定發佈時間/ }).click();
await shot("x-compose-repeat-picker");
await page.getByRole("button", { name: "取消" }).click();
await page.getByRole("button", { name: "換一種做法" }).click();
await page.getByRole("menuitemradio", { name: /設定行程/ }).click();
await page.getByRole("button", { name: /^設定發佈時間/ }).click();
await shot("04-compose-picker");
await page.getByRole("button", { name: "取消" }).click();
await page.getByRole("button", { name: /^標籤/ }).click();
await page.getByLabel("這則加上「活動」").check();
await shot("x-compose-tags");
await page.getByRole("button", { name: "回排程日曆" }).click();
await page.waitForURL(/\/tools\/social\?/);
await page.goto(`http://localhost:3902/tools/social/compose/${POSTS[2].id}?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByLabel("貼文內容").waitFor();
await shot("x-compose-scheduled");
await page.goto(`http://localhost:3902/tools/social/compose/00000000-0000-4000-8000-000000000005?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByLabel("貼文內容").waitFor();
await shot("x-compose-review");
// C24 數據分析: all channels / 28 days, then one channel (Bluesky) with a card it has no number for picked
await page.getByRole("button", { name: "數據分析", exact: true }).click();
await page.waitForURL(/\/tools\/social\/analytics/);
await page.getByText("沒有數字的原因").waitFor({ timeout: 10000 });
await shot("12-analytics");
await page.locator(".an-chan .sm-cmain", { hasText: "Soulful Expression" }).first().click();
await page.getByRole("button", { name: "90 天" }).click();
await page.locator(".an-card", { hasText: "觸及" }).click();
await shot("x-analytics-bluesky-90");
// C25 報表管理: the form with the first-page preview, then a saved report as the page the browser prints (and its PDF, A4 landscape)
await page.getByRole("button", { name: "報表管理", exact: true }).click();
await page.waitForURL(/\/tools\/social\/reporting/);
await page.getByText("第一頁長這樣").waitFor({ timeout: 10000 });
await page.locator(".rp-mini b").first().waitFor({ timeout: 10000 });
await shot("13-reporting");
await page.goto(`http://localhost:3902/tools/social/reports/${REPORT.id}?brand=${BRAND.id}`, { waitUntil: "networkidle" });
await page.getByText("各平台成效").first().waitFor({ timeout: 10000 });
await shot("14-report-print");
await page.pdf({ path: `${out}/14-report-print.pdf`, format: "A4", landscape: true, printBackground: true });
await page.emulateMedia({ media: "print" });
await page.screenshot({ path: `${out}/14-report-print-media.png`, fullPage: true });
await page.emulateMedia({ media: "screen" });
await page.goto(`http://localhost:3902/tools/social?brand=${BRAND.id}`, { waitUntil: "networkidle" });   // the report page has no top bar
// the sections that are shells until their cards (C27-C29)
for (const [label, key] of [["智慧連結", "smartlinks"], ["廣告管理", "ads"]]) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForURL(new RegExp(`/tools/social/${key}`));
  await shot(`10-${key}`);
}
// C29 訊息收件匣: per-channel unread, "打開收件匣" in a new tab, and how to connect for the channel with no inbox
await page.getByRole("button", { name: "訊息收件匣", exact: true }).click();
await page.waitForURL(/\/tools\/social\/inbox/);
await page.getByText("3 則未讀").first().waitFor({ timeout: 10000 });
if ((await page.getByRole("link", { name: "打開收件匣" }).getAttribute("target")) !== "_blank") { console.error("FAIL: 打開收件匣 does not open a new tab"); process.exit(1); }
await shot("17-inbox");
const size = await page.evaluate(() => ({ h: document.scrollingElement.scrollHeight, w: document.scrollingElement.scrollWidth }));
console.log("page size on the last section", size);

// C30: the product at 390px, not only the static mock. Each view must fit the viewport exactly.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await phone.route("**/api/social/**", handle);
const phoneShot = async (name) => {
  await phone.waitForTimeout(500);
  const width = await phone.evaluate(() => document.scrollingElement.scrollWidth);
  console.log(`${name} scrollWidth`, width);
  if (width !== 390) throw new Error(`${name} is ${width}px wide, expected 390px`);
  await phone.screenshot({ path: `${out}/${name}.png` });
};
const phoneHome = `http://localhost:3902/tools/social?brand=${BRAND.id}`;
await phone.goto(phoneHome, { waitUntil: "networkidle" });
await phone.getByRole("heading", { name: "社群發文" }).waitFor();
await phoneShot("phone-01-calendar");
await phone.getByRole("button", { name: "月", exact: true }).click();
await phoneShot("phone-02-month");
await phone.goto(phoneHome, { waitUntil: "networkidle" });
await phone.getByRole("button", { name: "貼文清單", exact: true }).click();
await phoneShot("phone-03-list");
await phone.goto(phoneHome, { waitUntil: "networkidle" });
await phone.getByRole("button", { name: "頻道", exact: true }).click();
await phone.getByRole("button", { name: "關閉", exact: true }).waitFor();
await phoneShot("phone-04-channels");
await phone.getByRole("button", { name: "關閉", exact: true }).click();
await phone.locator(".sm-toolbar .sm-end button").click();
await phone.getByLabel("貼文內容").waitFor();
await phoneShot("phone-05-compose-edit");
await phone.locator(".sm-mobile-compose-tabs button").nth(1).click();
await phoneShot("phone-06-compose-preview");
await browser.close();
console.log("done", out);
