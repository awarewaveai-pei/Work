#!/usr/bin/env node
/* Functional test for the domain chips (plan D18 / U21), the home app (plan U1 / U16), the lesson tabs (U15:
   tabs-script) and the run form (U14: run-form-script — #new, #demo, run, fill, clear).
   Lessons: click every chip; after each click every example group shows exactly one variant, the clicked one, judged by
   the computed display (a display: rule would silently un-hide a group), and exactly one chip is aria-selected.
   Home (views, search, tool pages) and every page's actions (mock-only buttons, links into folds): every check runs
   twice — on the page, where it must pass, and on a copy without the script it tests (home-catalog-script /
   page-actions-script), where it must FAIL — so a pass proves the page's own code, not the browser (Chromium opens a
   closed <details> on a fragment jump by itself, hence link clicks run with the default action prevented). CommonJS like render-mocks.cjs; from the repo root:
     NODE_PATH="<node_modules that holds playwright>" node Projects/internal/cognitive-engineering-os/docs/mockups/chips-test.cjs
   Exit 0 pass, 1 fail, 2 playwright missing, 3 render failed. Plan §10: run with render-mocks.cjs before publishing. */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) { console.error("playwright not resolvable: set NODE_PATH to a node_modules that contains it"); process.exit(2); }
const LESSON = ["iceberg-lesson-mock.html", "workflow-lesson-mock.html"];   // = mockkit.LESSON
const RESULT = ["iceberg-result-mock.html", "workflow-result-mock.html"];   // = mockkit.RESULT

async function homeChecks(browser, file) {
  const url = pathToFileURL(file).href;
  const p = await browser.newPage();
  p.setDefaultTimeout(2500);
  await p.goto(url, { waitUntil: "load" });
  await p.evaluate(() => window.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('a[href^="#"]')) e.preventDefault(); }, true));
  const shown = () => p.evaluate(() => [...document.querySelectorAll("section[data-view]")].filter((s) => s.getClientRects().length).map((s) => s.id).join(","));
  const current = () => p.evaluate(() => [...document.querySelectorAll('.navi[aria-current="page"]')].map((a) => a.dataset.view).join(","));
  const page = () => p.evaluate(() => [...document.querySelectorAll("article.tpage")].filter((a) => a.getClientRects().length).map((a) => a.id).join(","));
  const state = () => p.evaluate(() => ({
    tools: document.querySelectorAll(".tool").length, hidden: document.querySelectorAll(".tool[hidden]").length,
    rendered: [...document.querySelectorAll(".tool")].filter((e) => e.getClientRects().length).length,
    open: document.querySelectorAll("details[data-dir][open]").length,
    visibleFolds: [...document.querySelectorAll("details[data-dir]")].filter((e) => e.getClientRects().length).length,
    mcount: (document.getElementById("mcount") || {}).textContent, hits: document.getElementById("hits").textContent,
    links: [...document.querySelectorAll("#hits a")].map((a) => a.getAttribute("href")),
  }));
  const flush = () => p.evaluate(() => new Promise((r) => setTimeout(r, 0)));
  const menu = (v) => p.click(`.navi[data-view="${v}"]`);
  const checks = {
    // the main menu switches the views in place and moves aria-current
    menu: async () => { await menu("tools"); return (await shown()) === "tools" && (await current()) === "tools"; },
    // an address hash (a link from another page: …/artifact/<home>#workflows) opens that view on load
    hash: async () => {
      const q = await browser.newPage(); await q.goto(url + "#workflows", { waitUntil: "load" });
      const ok = await q.evaluate(() => [...document.querySelectorAll("section[data-view]")].filter((s) => s.getClientRects().length).map((s) => s.id).join(",") === "workflows"
        && [...document.querySelectorAll('.navi[aria-current="page"]')].map((a) => a.dataset.view).join(",") === "workflows");
      await q.close(); return ok;
    },
    // the name search filters the rows, opens exactly the folds that hold a hit, lists workflow hits; clearing restores
    search: async () => {
      await menu("tools"); const all = await state(); await p.fill("#q", "swot"); const s = await state(); await p.fill("#q", ""); const b = await state();
      const n = all.tools - s.hidden;
      return n > 0 && n < all.tools && s.mcount === String(n) && s.rendered === n && s.open === s.visibleFolds && s.visibleFolds > 0
        && s.links.length > 0 && s.links.every((h) => h.startsWith("#wf-")) && b.hidden === 0 && b.open === 0 && b.links.length === 0 && b.mcount === String(all.tools);
    },
    // full-width input (a zh-TW IME) finds the same rows
    fullwidth: async () => {
      await menu("tools"); await p.fill("#q", "swot"); const a = await state(); await p.fill("#q", "ＳＷＯＴ"); const b = await state(); await p.fill("#q", "");
      return a.hidden > 0 && a.hidden === b.hidden;
    },
    // 0 tool hits: no "folds opened" claim; platform-internal workflows are labelled apart from the user ones
    hits: async () => {
      await menu("tools"); await p.fill("#q", "db-migration"); const a = await state(); await p.fill("#q", "swot"); const b = await state(); await p.fill("#q", "");
      return !a.hits.includes("所在類別已打開") && a.hits.includes("平台維運用的工作流") && a.links.includes("#wf-db-migration-expand-contract")
        && !b.hits.includes("平台維運用");
    },
    // the search closes only the folds it opened; a fold the user closed during a search stays closed
    folds: async () => {
      await menu("tools"); await p.click("#dir-decide > summary"); await flush(); await p.fill("#q", "s"); await p.fill("#q", ""); await flush();
      const kept = await p.$eval("#dir-decide", (d) => d.open);
      await p.fill("#q", "sw"); const auto = await p.$eval("#dir-strategy", (d) => d.open);
      await p.click("#dir-strategy > summary"); await flush(); await p.fill("#q", "swo"); const stays = await p.$eval("#dir-strategy", (d) => !d.open);
      await p.fill("#q", ""); await p.click("#dir-decide > summary"); await flush();
      return kept && auto && stays;
    },
    // a goal-card link to a fold the search hid: the search clears, the tools view shows, the fold opens
    hiddenLink: async () => {
      await menu("tools"); await p.fill("#q", "swot"); await menu("home"); await p.click('a[href="#dir-law"]');
      const ok = (await shown()) === "tools" && (await p.$eval("#q", (i) => i.value)) === ""
        && (await p.$eval("#dir-law", (d) => d.open && d.getClientRects().length > 0));
      await p.$eval("#dir-law", (d) => { d.open = false; }); return ok;
    },
    // a 常用 link in a goal card opens that tool's own page: the tool view, only that page, the menu still on 工具
    commonLink: async () => {
      await menu("home"); await p.click('a[href="#t-foresight.scenario_planning"]');
      return (await shown()) === "tool" && (await current()) === "tools" && (await page()) === "t-foresight.scenario_planning";
    },
    // a directory row opens its tool's page (found by search, so its fold is open)
    toolRow: async () => {
      await menu("tools"); await p.fill("#q", "swot"); await p.click('.tool a[href="#t-strategy.swot"]');
      const ok = (await shown()) === "tool" && (await current()) === "tools" && (await page()) === "t-strategy.swot";
      await menu("tools"); await p.fill("#q", ""); return ok;
    },
    // an address hash (…/artifact/<home>#t-<id>, from another page) opens that tool page on load
    toolHash: async () => {
      const q = await browser.newPage(); await q.goto(url + "#t-systems.iceberg_model", { waitUntil: "load" });
      const ok = await q.evaluate(() => [...document.querySelectorAll("article.tpage")].filter((a) => a.getClientRects().length).map((a) => a.id).join(",") === "t-systems.iceberg_model"
        && [...document.querySelectorAll('.navi[aria-current="page"]')].map((a) => a.dataset.view).join(",") === "tools");
      await q.close(); return ok;
    },
    // real navigation: row → tool page → back lands on the list where it was scrolled, the search still in place
    toolBack: async () => {
      const q = await browser.newPage({ viewport: { width: 1000, height: 360 } }); q.setDefaultTimeout(2500); await q.goto(url + "#tools", { waitUntil: "load" });
      const view = () => q.evaluate(() => [...document.querySelectorAll("section[data-view]")].filter((s) => s.getClientRects().length).map((s) => s.id).join(","));
      await q.fill("#q", "swot"); await q.hover('.tool a[href="#t-strategy.swot"]'); const y0 = await q.evaluate(() => window.scrollY);   // hover scrolls the row in first
      await q.click('.tool a[href="#t-strategy.swot"]'); await q.waitForTimeout(100); const a = await view();
      await q.goBack(); await q.waitForTimeout(100); const b = await view(); const y1 = await q.evaluate(() => window.scrollY);
      const kept = await q.$eval("#q", (i) => i.value);
      await q.close(); return y0 > 0 && a === "tool" && b === "tools" && Math.abs(y1 - y0) < 5 && kept === "swot";
    },
    // a workflow hit that is platform-internal: the workflows view shows and its fold opens
    internal: async () => {
      await menu("tools"); await p.fill("#q", "db-migration"); await p.click('#hits a[href="#wf-db-migration-expand-contract"]');
      const ok = (await shown()) === "workflows" && (await p.$eval("#wf-internal", (d) => d.open));
      await p.$eval("#wf-internal", (d) => { d.open = false; }); await menu("tools"); await p.fill("#q", ""); return ok;
    },
    // an example situation fills the box; another example replaces it
    example: async () => {
      await menu("home"); const b = await p.$$("[data-prompt]"); const t = await Promise.all(b.slice(0, 2).map((x) => x.getAttribute("data-prompt")));
      await b[0].click(); const one = await p.$eval("#ask", (a) => a.value); await b[1].click(); const two = await p.$eval("#ask", (a) => a.value);
      await p.fill("#ask", ""); return one === t[0] && two === t[1];
    },
    // real navigation: back/forward switch the views, and back returns to where the view was scrolled
    history: async () => {
      const q = await browser.newPage(); q.setDefaultTimeout(2500); await q.goto(url, { waitUntil: "load" });
      const view = () => q.evaluate(() => [...document.querySelectorAll("section[data-view]")].filter((s) => s.getClientRects().length).map((s) => s.id).join(","));
      await q.evaluate(() => window.scrollTo(0, 900)); const y0 = await q.evaluate(() => window.scrollY);
      await q.click('.navi[data-view="tools"]'); const a = await view();
      await q.goBack(); await q.waitForTimeout(100); const b = await view(); const y1 = await q.evaluate(() => window.scrollY);
      await q.goForward(); await q.waitForTimeout(100); const c = await view();
      await q.close(); return y0 > 0 && a === "tools" && b === "home" && Math.abs(y1 - y0) < 5 && c === "tools";
    },
    // the user's own text hides the examples (a click can never wipe it); clearing brings them back
    ownText: async () => {
      await menu("home"); await p.fill("#ask", "我們的讀書會每次都拖到很晚才結束");
      const hid = await p.$eval("#prompts", (e) => e.getClientRects().length === 0); await p.fill("#ask", "");
      const back = await p.$eval("#prompts", (e) => e.getClientRects().length > 0); return hid && back;
    },
  };
  const out = {};
  for (const [name, fn] of Object.entries(checks)) {
    try { out[name] = await fn(); } catch (e) { out[name] = false; }
  }
  await p.close();
  return out;
}

// page-actions-script (every page): a mock-only action says what the product will do; an in-page link opens its fold
async function actionChecks(browser, file) {
  const p = await browser.newPage();
  p.setDefaultTimeout(2500);
  await p.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await p.evaluate(() => window.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('a[href^="#"]')) e.preventDefault(); }, true));
  const checks = {};
  // the first visible mock-only button, clicked, writes one note saying what the product will do (the lessons have none
  // since 2026-09-25: their one action, 開始, is a real link to the run page)
  if (await p.$("button[data-mock]")) checks.mockNote = async () => {
    let clicked = false;
    for (const x of await p.$$("button[data-mock]")) if (await x.isVisible()) { await x.click(); clicked = true; break; }
    const t = await p.evaluate(() => [...document.querySelectorAll(".mocknote")].map((n) => n.textContent));
    return clicked && t.length === 1 && t[0].startsWith("示意稿：正式版");
  };
  if (await p.$('a[href="#expert"]')) checks.expertOpen = async () => { await p.click('a[href="#expert"]'); return p.$eval("#expert", (d) => d.open); };
  const out = {};
  for (const [name, fn] of Object.entries(checks)) {
    try { out[name] = await fn(); } catch (e) { out[name] = false; }
  }
  await p.close();
  return out;
}

// tabs-script (lessons, plan U15): a tab click, ←/→ (wrapping both ways), Home/End, a "next tab" button, an address hash on
// load and a hash change after load each leave exactly one panel showing, the selected tab's (keys also move focus)
async function tabChecks(browser, file) {
  const url = pathToFileURL(file).href;
  const p = await browser.newPage();
  p.setDefaultTimeout(2500);
  await p.goto(url, { waitUntil: "load" });
  const shown = (q) => q.evaluate(() => [...document.querySelectorAll('[role="tabpanel"]')].filter((s) => s.getClientRects().length).map((s) => s.id).join(","));
  const selected = () => p.evaluate(() => [...document.querySelectorAll('.tabs [aria-selected="true"]')].map((t) => t.id).join(","));
  const ids = await p.evaluate(() => [...document.querySelectorAll('.tabs [role="tab"]')].map((t) => t.id.slice(4)));
  const on = async (id) => (await shown(p)) === `panel-${id}` && (await selected()) === `tab-${id}`;
  const checks = {
    click: async () => { await p.click("#tab-read"); return on("read"); },
    keys: async () => {
      const last = ids[ids.length - 1];
      const step = async (key, id) => { await p.keyboard.press(key); return (await on(id)) && (await p.evaluate(() => document.activeElement.id)) === `tab-${id}`; };
      await p.click(`#tab-${ids[0]}`);
      return (await step("ArrowRight", ids[1])) && (await step("ArrowLeft", ids[0])) && (await step("ArrowLeft", last))
        && (await step("Home", ids[0])) && (await step("End", last)) && (await step("ArrowRight", ids[0]));
    },
    next: async () => { await p.click(`#tab-${ids[0]}`); await p.click(`#panel-${ids[0]} [data-tab-go]`); return on(ids[1]); },
    hash: async () => { const q = await browser.newPage(); await q.goto(url + "#panel-read", { waitUntil: "load" }); const ok = (await shown(q)) === "panel-read"; await q.close(); return ok; },
    hashchange: async () => {
      await p.click(`#tab-${ids[0]}`); await p.evaluate(() => { location.hash = "#panel-read"; });
      await p.waitForFunction(() => !document.getElementById("panel-read").hidden).catch(() => {});
      return on("read");
    },
  };
  const out = {};
  for (const [name, fn] of Object.entries(checks)) {
    try { out[name] = await fn(); } catch (e) { out[name] = false; }
  }
  await p.close();
  return out;
}

// run-form-script (run pages, plan U14): #new empties the fields and waits for a run, #demo fills the demo, a blank run is
// refused with a note, a filled run shows the result with the product sentence, fill then clear act on the fields
async function runChecks(browser, file) {
  const url = pathToFileURL(file).href;
  const open = async (hash) => { const q = await browser.newPage(); q.setDefaultTimeout(2500); await q.goto(url + hash, { waitUntil: "load" }); return q; };
  const state = (q) => q.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0, ts = [...document.querySelectorAll("form.runform textarea")].filter(vis);
    return { values: ts.map((t) => t.value), demo: ts.map((t) => (t.hasAttribute("data-demo") ? t.getAttribute("data-demo") : t.defaultValue)),
      all: [...document.querySelectorAll("form.runform textarea")].map((t) => t.value),
      result: [...document.querySelectorAll('[data-when="result"]')].some(vis), empty: [...document.querySelectorAll('[data-when="empty"]')].some(vis),
      notes: [...document.querySelectorAll(".mocknote")].map((n) => n.textContent) };
  });
  const press = async (q, sel) => { for (const h of await q.$$(sel)) if (await h.isVisible()) { await h.click(); return true; } return false; };
  const run = async (hash, fn) => { const q = await open(hash); try { return await fn(q); } finally { await q.close(); } };
  const same = (a, b) => a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
  const checks = {
    newEmpty: () => run("#new", async (q) => { const s = await state(q); return s.all.every((v) => v === "") && !s.result && s.empty; }),
    demoFilled: () => run("#demo", async (q) => { const s = await state(q); return same(s.values, s.demo) && s.values.some((v) => v) && !s.result && s.empty; }),
    blankRunRefused: () => run("#new", async (q) => { const ok = await press(q, "form.runform [data-run]"); const s = await state(q); return ok && !s.result && s.notes.some((n) => n.includes("先填")); }),
    runShows: () => run("#demo", async (q) => { const ok = await press(q, "form.runform [data-run]"); const s = await state(q); return ok && s.result && !s.empty && s.notes.some((n) => n.startsWith("示意稿：正式版")); }),
    fillClear: () => run("", async (q) => {
      await press(q, "form.runform [data-fill]"); const a = await state(q);
      await press(q, "form.runform [data-clear]"); const b = await state(q);
      return same(a.values, a.demo) && a.values.some((v) => v) && b.values.length > 0 && b.values.every((v) => v === "");
    }),
  };
  const out = {};
  for (const [name, fn] of Object.entries(checks)) {
    try { out[name] = await fn(); } catch (e) { out[name] = false; }
  }
  return out;
}

// run `checks` on the page and on a copy without `partial`: each check must pass on the page and FAIL on the copy
async function withControl(browser, name, partial, checks) {
  const file = path.join(__dirname, name), src = fs.readFileSync(file, "utf8");
  const re = new RegExp(`<!-- == partial: ${partial}: start[\\s\\S]*?<!-- == partial: ${partial}: end == -->`);
  const stripped = src.replace(re, "");
  if (stripped === src) { console.log(`${name}: ${partial} markers not found`); return 1; }
  const bare = path.join(os.tmpdir(), `${name}-without-${partial}.html`);
  fs.writeFileSync(bare, stripped);
  const a = await checks(browser, file), b = await checks(browser, bare);
  let bad = 0;
  for (const k of Object.keys(a)) {
    const ok = a[k] === true && b[k] === false;
    if (!ok) bad++;
    console.log(`${name} [${k}] ${a[k] ? "pass" : "FAIL"}; without ${partial}: ${b[k] ? "PASSES (the check does not test the page)" : "fails, as it must"}`);
  }
  return bad;
}

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const f of LESSON) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(__dirname, f)).href, { waitUntil: "load" });
    const chips = await page.$$eval(".chip", (cs) => cs.map((c) => c.getAttribute("data-set")));
    if (chips.length < 2) { console.log(`${f}: only ${chips.length} chip(s)`); bad++; }
    for (const set of chips) {
      await page.click(`.chip[data-set="${set}"]`);
      const r = await page.evaluate((set) => {
        const groups = new Map();
        let wrong = 0;
        document.querySelectorAll(".ex").forEach((el) => {
          if (!el.getAttribute("data-set")) { wrong++; return; }   // the script hides such an element forever
          const k = el.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(el);
        });
        for (const [, els] of groups) {
          const shown = els.filter((e) => getComputedStyle(e).display !== "none");
          if (shown.length !== 1 || shown[0].getAttribute("data-set") !== set) wrong++;
        }
        const lead = document.querySelector('#worked .ex:not([hidden]) .lead, #walked .ex:not([hidden]) .lead');
        const on = document.querySelectorAll('.chip[aria-selected="true"]').length;
        return { groups: groups.size, wrong, on, lead: lead ? lead.textContent.trim().slice(0, 40) : "(no lead)" };
      }, set);
      if (r.wrong || r.on !== 1) bad++;
      console.log(`${f} [${set}] groups=${r.groups} wrong=${r.wrong} selected=${r.on} lead="${r.lead}"`);
    }
    await page.close();
  }
  bad += await withControl(browser, "home-mock.html", "home-catalog-script", homeChecks);
  for (const f of LESSON) bad += await withControl(browser, f, "tabs-script", tabChecks);
  for (const f of RESULT) bad += await withControl(browser, f, "run-form-script", runChecks);
  for (const f of ["home-mock.html", ...RESULT, ...LESSON]) bad += await withControl(browser, f, "page-actions-script", actionChecks);
  await browser.close();
  console.log(bad ? `chips: FAIL ${bad}` : "chips: PASS");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
