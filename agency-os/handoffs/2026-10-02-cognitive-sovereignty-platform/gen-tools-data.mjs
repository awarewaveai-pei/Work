// Builds the TOOLS / FLOWS block of platform-supervisor.html from the repo, so every card and the tools page can name
// each tool and workflow instead of only counting them (operator 2026-10-03: 「要怎麼知道哪 116 個？」).
//   node gen-tools-data.mjs --write [--page <html>] [--root <repo root>]   rewrite the block in the page
//   node gen-tools-data.mjs         [--page <html>] [--root <repo root>]   exit 1 if the page's block is out of date
// check-supervisor.mjs imports buildBlock() and runs the same comparison.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const START = '/* ── 這一段由 gen-tools-data.mjs 從程式庫產生，不要手改 ── */';
const END = '/* ── 產生的資料到這裡 ── */';

export function buildBlock(root) {
  const M = path.join(root, 'agency-os/docs/AI_LEGO_Cognitive_Engineering_OS');
  // Chinese name of every method: methods/registry/method-display-metadata.yaml, entries "  <id>:" then "    name_zh: ..."
  const nameOf = {};
  let cur = null;
  for (const line of readFileSync(path.join(M, 'methods/registry/method-display-metadata.yaml'), 'utf8').split(/\r?\n/)) {
    const id = line.match(/^  ([a-z0-9_]+\.[a-z0-9_]+):\s*$/);
    if (id) { cur = id[1]; continue; }
    const nm = line.match(/^    name_zh:\s*"?(.*?)"?\s*$/);
    if (nm && cur) nameOf[cur] = nm[1];
  }
  const dir = path.join(M, 'methods/contracts');
  const tools = readdirSync(dir).filter((f) => f.endsWith('.contract.yaml') && !f.startsWith('stakeholder.')).sort().map((f) => {
    const id = f.replace(/\.contract\.yaml$/, '');
    const fam = (readFileSync(path.join(dir, f), 'utf8').match(/^family:\s*(\S+)/m) || [])[1];
    if (!fam) throw new Error('no family: ' + f);
    if (!nameOf[id]) throw new Error('no Chinese name in method-display-metadata.yaml: ' + id);
    return [id, fam, nameOf[id]];
  });
  // Workflows: recipes/validated/*.recipe.yaml; Chinese name and audience from recipes/registry/recipe-display-metadata.yaml
  const flowMeta = {};
  for (const m of readFileSync(path.join(M, 'recipes/registry/recipe-display-metadata.yaml'), 'utf8').matchAll(/^  ([a-z0-9-]+): \{audience: (\w+), goal: (\w+), name_zh: ([^,}]+)/gm)) flowMeta[m[1]] = [m[4].trim(), m[2]];
  const flows = readdirSync(path.join(M, 'recipes/validated')).filter((f) => f.endsWith('.recipe.yaml')).sort().map((f) => {
    const id = f.replace(/\.recipe\.yaml$/, '');
    if (!flowMeta[id]) throw new Error('no entry in recipe-display-metadata.yaml: ' + id);
    return [id, ...flowMeta[id]];
  });
  const rows = (a) => a.map((r) => ' ' + JSON.stringify(r)).join(',\n');
  // how many question groups the site shows (methods/registry/method-goal-groups.yaml, the goals: list)
  const goals = (readFileSync(path.join(M, 'methods/registry/method-goal-groups.yaml'), 'utf8').split(/^popular:/m)[0].match(/^  - id: /gm) || []).length;
  return `${START}\n/* 每一個工具：程式庫裡的代號、類別（family）、中文名。 */\nconst TOOLS = [\n${rows(tools)},\n];\n/* 每一條工作流：程式庫裡的檔名、中文名、給誰用（user＝一般使用者，internal＝內部）。 */\nconst FLOWS = [\n${rows(flows)},\n];\n/* 網站上的問題分類有幾個。 */\nconst GOAL_COUNT = ${goals};\n${END}`;
}

export function pageBlock(html) {
  const a = html.indexOf(START), b = html.indexOf(END);
  return a < 0 || b < 0 ? null : html.slice(a, b + END.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? path.resolve(process.argv[i + 1]) : d; };
  const root = arg('root', path.resolve(here, '../../..'));
  const page = arg('page', path.join(here, 'platform-supervisor.html'));
  const html = readFileSync(page, 'utf8');
  const want = buildBlock(root);
  const have = pageBlock(html);
  if (process.argv.includes('--write')) {
    // first time: right before the tool rows (and their comment), which read from it
    const at = ['/* 每一列：歸哪一塊、幾個', 'const TOOL_ROWS = ['].map((s) => html.indexOf(s)).find((i) => i >= 0);
    if (!have && at === undefined) throw new Error('TOOL_ROWS not found');
    const out = have ? html.replace(have, () => want) : html.slice(0, at) + want + '\n' + html.slice(at);
    if (out === html && have !== want) throw new Error('could not place the block');
    writeFileSync(page, out);
    console.log(have === want ? 'block already up to date' : 'block written');
  } else if (have !== want) { console.error('TOOLS / FLOWS block is out of date: run with --write'); process.exit(1); }
  else console.log('block up to date');
}
