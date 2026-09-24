#!/usr/bin/env node
/* Functional test for the domain chips (plan D18 / U21): on every lesson page click every chip; after each click every
   example group must show exactly one variant, the clicked one, judged by the browser's computed display (not the
   hidden attribute: a display: rule would silently un-hide a group), and exactly one chip is aria-selected. Prints the
   worked-example lead per domain so the switch is visible in the log. CommonJS like render-mocks.cjs; from the repo root:
     NODE_PATH="<node_modules that holds playwright>" node Projects/internal/cognitive-engineering-os/docs/mockups/chips-test.cjs
   Exit 0 pass, 1 fail, 2 playwright missing, 3 render failed. Plan §10: run with render-mocks.cjs before publishing. */
const path = require("path");
const { pathToFileURL } = require("url");
let chromium;
try { ({ chromium } = require("playwright")); }
catch (e) { console.error("playwright not resolvable: set NODE_PATH to a node_modules that contains it"); process.exit(2); }
const LESSON = ["iceberg-lesson-mock.html", "workflow-lesson-mock.html"];   // = mockkit.LESSON
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
  await browser.close();
  console.log(bad ? `chips: FAIL ${bad}` : "chips: PASS");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(3); });
