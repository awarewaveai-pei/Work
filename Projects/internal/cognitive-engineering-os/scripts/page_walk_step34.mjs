// Page walk of the steps 3+4 wave: six new pages x two widths (1280, 400) on a LOCAL stack with seeded test data.
// Fails (exit 1) on: a console error or page error, an answer of 400 or more, horizontal page scroll, a <select>, a literal
// colour in an inline style or <style> in the page, a forbidden word in the visible text (票 排名 分數 進度), a seeded text the
// page should draw but does not, and an AI-written seeded text drawn without an "AI" mark beside it. Saves full-page PNGs
// (<page>-<width>.png) and the visible text (<page>-<width>.txt) to --out.
//
// Local stack, from the product root (Projects/internal/cognitive-engineering-os), test values only, nothing on a real host:
//   docker run -d --name c80_pg -p 127.0.0.1:55480:5432 -e POSTGRES_PASSWORD=<test value> -e POSTGRES_DB=cos postgres:17-alpine   # tests/pg.py pins the digest
//   export COGNITIVE_OS_DATABASE_URLS="eu=postgresql://postgres:<test value>@127.0.0.1:55480/cos"
//   python -c "from ai_lego.data.db import migrate; migrate('postgresql://postgres:<test value>@127.0.0.1:55480/cos')"
//   python -m uvicorn ai_lego.apps.api.main:app --host 127.0.0.1 --port 8431
//   (cd apps/cognitive-web && COS_API_ORIGIN=http://127.0.0.1:8431 npm run build && npx next start -p 3101)
//   python scripts/seed_step34.py --state <state.json>
//   node scripts/page_walk_step34.mjs --state <state.json> --out <folder> [--web http://127.0.0.1:3101] [--playwright-from <dir with package.json whose node_modules holds @playwright/test>] [--all]
// --all adds the leader's own area (/lead) to the six. Stop what you started: docker rm -f c80_pg, the uvicorn and next processes.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const flag = (name, fallback) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : fallback; };
const state = JSON.parse(readFileSync(flag('state'), 'utf8'));
const out = path.resolve(flag('out'));
const web = flag('web', 'http://127.0.0.1:3101');
const playwrightFrom = path.resolve(flag('playwright-from', path.join(here, '../../../../lobster-factory/infra/hetzner-phase1-core/tests')));
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(path.join(playwrightFrom, 'package.json'))('@playwright/test');

const { decision, class: klass } = state.groups;
// who: the seeded person; expect: seeded words the page must draw; ai: seeded AI-written words that must sit beside an "AI" mark
const PAGES = [
  { name: 'groups', path: '/groups', who: 'alice', expect: ['第三位合夥人要不要加入', '冰山模型工作坊'] },
  { name: 'group', path: `/groups/${decision}`, who: 'alice', expect: ['第三位合夥人要不要加入我們？', '我想讓他加入', '試用期還是要先講好誰負責'], ai: [state.ai_texts.group] },
  { name: 'govern-data', path: '/me/data', who: 'bob', expect: ['第二步的時間太趕'] },
  { name: 'teach', path: '/me/teach', who: 'alice', expect: [] },
  { name: 'express', path: `/projects/${state.alice_case}/express`, who: 'alice', expect: ['第三位合夥人', '合夥人下週要回覆'], ai: [state.ai_texts.express] },
  { name: 'facilitate', path: `/groups/${klass}/lead`, who: 'carol', expect: ['替參與者下結論'] },
  ...(process.argv.includes('--all') ? [{ name: 'lead', path: '/lead', who: 'carol', expect: ['替參與者下結論'] }] : []),
];
const WIDTHS = [1280, 400];
const FORBIDDEN = /票|排名|分數|進度/g;
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

async function login(context, who) {
  const person = state.people[who];
  const response = await context.request.post(`${web}/api/auth/login`, { data: { tenant_id: state.tenant_id, email: person.email, password: person.password } });
  if (!response.ok()) throw new Error(`login of ${who} answered ${response.status()}`);
  const value = /cognitive_os_session=([^;]+)/.exec(response.headers()['set-cookie'] ?? '')?.[1];
  if (!value) throw new Error(`no session cookie for ${who}`);
  await context.addCookies([{ name: 'cognitive_os_session', value, url: web }]);
}

const browser = await chromium.launch();
const failures = [];
const report = [];
for (const spec of PAGES) {
  for (const width of WIDTHS) {
    const label = `${spec.name}@${width}`;
    const problems = [];
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await login(context, spec.who);
      const page = await context.newPage();
      page.on('console', (message) => { if (message.type() === 'error') problems.push(`console error: ${message.text().slice(0, 200)}`); });
      page.on('pageerror', (error) => problems.push(`page error: ${String(error).slice(0, 200)}`));
      page.on('response', (response) => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
      await page.goto(web + spec.path, { waitUntil: 'networkidle' });
      const carryOn = page.getByRole('button', { name: '不改，繼續' });   // a case page first asks whether to change what the AI may do
      if (await carryOn.count()) { await carryOn.click(); await page.waitForLoadState('networkidle'); }
      await page.waitForTimeout(800);

      const found = await page.evaluate(({ ai, literal }) => {
        const colour = new RegExp(literal);
        const text = document.body.innerText;
        const styled = [...document.querySelectorAll('[style]')].filter((el) => colour.test(el.getAttribute('style'))).map((el) => `${el.tagName.toLowerCase()} style="${el.getAttribute('style').slice(0, 80)}"`);
        const sheets = [...document.body.querySelectorAll('style')].filter((el) => colour.test(el.textContent)).map(() => '<style> in the page');
        const unmarked = (ai ?? []).filter((words) => {
          const holder = [...document.querySelectorAll('*')].filter((el) => el.children.length === 0 && el.textContent.includes(words)).pop();
          if (!holder) return false;   // a missing text is the expect check's to report
          // the mark is a short leaf ("AI 寫的", "AI 撰寫") inside the same item: climb only while the item is small
          const isMark = (el) => el.children.length === 0 && /^AI /.test(el.textContent.trim()) && el.textContent.trim().length <= 10;
          for (let up = holder; up && up.textContent.length - words.length <= 500; up = up.parentElement) if ([...up.querySelectorAll('*')].some(isMark)) return false;
          return true;
        });
        return {
          text,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          selects: document.querySelectorAll('select').length,
          colours: [...styled, ...sheets],
          unmarked,
        };
      }, { ai: spec.ai, literal: LITERAL_COLOUR.source });

      if (found.overflow > 1) problems.push(`horizontal scroll: page is ${found.overflow}px wider than the window`);
      if (found.selects) problems.push(`${found.selects} <select> on the page`);
      if (found.colours.length) problems.push(`literal colour: ${found.colours.slice(0, 3).join('; ')}`);
      const words = [...new Set(found.text.match(FORBIDDEN) ?? [])];
      if (words.length) problems.push(`forbidden word: ${words.join(' ')}`);
      for (const wanted of spec.expect) if (!found.text.includes(wanted)) problems.push(`seeded text not drawn: ${wanted}`);
      for (const words_ of found.unmarked) problems.push(`AI-written text without an AI mark: ${words_}`);

      await page.screenshot({ path: path.join(out, `${spec.name}-${width}.png`), fullPage: true });
      writeFileSync(path.join(out, `${spec.name}-${width}.txt`), found.text, 'utf8');
    } catch (error) {
      problems.push(`walk error: ${String(error).slice(0, 300)}`);
    } finally {
      await context.close();
    }
    report.push(`${problems.length ? 'FAIL' : 'ok  '} ${label}${problems.length ? ' -- ' + problems.join(' | ') : ''}`);
    problems.forEach((problem) => failures.push(`${label}: ${problem}`));
  }
}
await browser.close();
console.log(report.join('\n'));
console.log(failures.length ? `PAGE_WALK_FAILED ${failures.length} problem(s)` : `PAGE_WALK_OK ${PAGES.length} pages x ${WIDTHS.length} widths, screenshots in ${out}`);
process.exit(failures.length ? 1 : 0);
