#!/usr/bin/env node
/* Functional test for the domain chips (plan D18 / U21) and the home app (plan U1 / U16).
   Lessons: click every chip; after each click every example group shows exactly one variant, the clicked one, judged by
   the computed display (a display: rule would silently un-hide a group), and exactly one chip is aria-selected.
   Home: every check runs twice — on the page, where it must pass, and on a copy without home-catalog-script, where it
   must FAIL — so a pass proves the page's own code, not the browser (Chromium opens a closed <details> on a fragment
   jump by itself, hence link clicks run with the default action prevented). CommonJS like render-mocks.cjs; from the repo root:
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

async function homeChecks(browser, file) {
  const url = pathToFileURL(file).href;
  const p = await browser.newPage();
  p.setDefaultTimeout(2500);
  await p.goto(url, { waitUntil: "load" });
  await p.evaluate(() => window.addEventListener("click", (e) => { if (e.target.closest && e.target.closest('a[href^="#"]')) e.preventDefault(); }, true));
  const shown = () => p.evaluate(() => [...document.querySelectorAll("section[data-view]")].filter((s) => s.getClientRects().length).map((s) => s.id).join(","));
  const current = () => p.evaluate(() => [...document.querySelectorAll('.navi[aria-current="page"]')].map((a) => a.dataset.view).join(","));
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
    // a 常用 link in a goal card lands on the tool's row: tools view, row rendered, its fold open
    commonLink: async () => {
      await menu("home"); await p.click('a[href="#m-foresight.scenario_planning"]');
      const ok = (await shown()) === "tools" && (await p.$eval('[id="m-foresight.scenario_planning"]', (r) => r.getClientRects().length > 0 && r.closest("details").open));
      await p.$eval('[id="m-foresight.scenario_planning"]', (r) => { r.closest("details").open = false; }); return ok;
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
    // real navigation (default action kept): a placeholder link (href="#") leaves the view where it is
    placeholder: async () => {
      const q = await browser.newPage(); q.setDefaultTimeout(2500); await q.goto(url + "#workflows", { waitUntil: "load" });
      await q.click('section#workflows a[href="#"]');
      const ok = await q.evaluate(() => [...document.querySelectorAll("section[data-view]")].filter((s) => s.getClientRects().length).map((s) => s.id).join(",") === "workflows");
      await q.close(); return ok;
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
  const home = path.join(__dirname, "home-mock.html");
  const bare = path.join(os.tmpdir(), "home-mock-without-script.html");
  const src = fs.readFileSync(home, "utf8");
  const stripped = src.replace(/<!-- == partial: home-catalog-script: start[\s\S]*?<!-- == partial: home-catalog-script: end == -->/, "");
  if (stripped === src) { console.log("home-mock.html: home-catalog-script markers not found"); bad++; }
  fs.writeFileSync(bare, stripped);
  const withScript = await homeChecks(browser, home);
  const without = await homeChecks(browser, bare);
  for (const name of Object.keys(withScript)) {
    const ok = withScript[name] === true && without[name] === false;
    if (!ok) bad++;
    console.log(`home-mock.html [${name}] ${withScript[name] ? "pass" : "FAIL"}; without the script: ${without[name] ? "PASSES (the check does not test the page)" : "fails, as it must"}`);
  }
  await browser.close();
  console.log(bad ? `chips: FAIL ${bad}` : "chips: PASS");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
