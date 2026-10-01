// Gate: the every-turn trigger index in agency-os/AGENTS.md is exactly what
// scripts/gen-trigger-index.mjs derives from TOOL_TRIGGER_MAP.md -- the map is the only place a
// row is written, the index cannot drift from it, and a restructured map cannot quietly yield an
// empty index. See the generator's header for why the index exists.
//
// Row selection is driven with a synthetic map; the last test asserts the real AGENTS.md block.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'gen-trigger-index.mjs');
const { renderIndex, splitRow, currentBlock, expectedBlock, BEGIN, END, AGENTS_REL } = await import(pathToFileURL(SCRIPT).href);

const HOOK = String.fromCodePoint(0x1f527);
const loaded = new Set(['health', 'critic', 'vuln-verifier', 'wordpress-maintenance-agent', 'tomo']);

function map({ phraseRows, selfRows } = {}) {
  return [
    '# Tool Trigger Map',
    '## AGENTS.md 觸發與路由正本（moved here）',
    '### 問題症狀 → Runbook 路由表',
    '| 症狀 / 告警 | 立即讀取的 Runbook |',
    '|---|---|',
    '| 網站 502 / OOM | `runbooks/502.md` |',
    '### 工作類型 → Agent/Tool 路由表',
    '| 使用者描述的工作 | 自動使用 |',
    '|---|---|',
    '| VPS 問題 | `devops-engineer` agent |',
    '### Claude 工作自觸發規則（不依賴使用者輸入）',
    '| Claude 正在做的事 | 自動執行 |',
    '|---|---|',
    ...(selfRows || [
      '| critic 回報 Critical | 召喚 `vuln-verifier` 寫 PoC |',
      `| 改動 auth | **${HOOK} 機械閘**：\`hooks/rules/file-path-router.js\` 自動 BLOCK |`,
    ]),
    '### 任務到達協議 步驟 2 — 任務類型預載表',
    '| 任務類型 | 判斷條件 | 預載 |',
    '|---|---|---|',
    '| Security | auth / RLS | `critic` → `vuln-verifier` |',
    '| Client site | WP / 客戶 | `/client-status` → `wordpress-*` agent |',
    '### 代理自動工具使用規則（使用者說了某句話 → 觸發）',
    '| 觸發情境 | 立即執行 |',
    '|---|---|',
    ...(phraseRows || [
      '| 使用者提到「改外觀」/「theme」 | **先讀** [`THEME.md`](../x/THEME.md)，再改 |',
      '| 使用者問「系統狀態」/「health」 | 跑 `/health` |',
      '| 操作者說 `/tomo <hint>` | 直接寫 `handoffs/` |',
      `| 編輯 Auto-Repair 路徑 | **${HOOK} 機械閘**：\`hooks/rules/auto-repair-guard.js\` |`,
      '| 訊息含 reboot 訊號 | 先讀 `reports/status/auto-reboot-LATEST.md`；≥ 16h → `/health` |',
      '| `x` 欄出現 `error.*401\\|error.*403` | ① `secrets-vault.ps1 -Action import-user-env` |',
    ]),
    '## Slash Commands',
    '### AO 生命週期',
    '| x | y |',
  ].join('\n');
}

test('splitRow keeps a pipe inside a code span (any backtick length) or escaped inside its cell', () => {
  assert.deepEqual(splitRow('| a `x|y` | b \\| c | d |'), ['a `x|y`', 'b | c', 'd']);
  assert.deepEqual(splitRow('| ``error|401`` | run `fix` |'), ['``error|401``', 'run `fix`']);
});

test('a malformed table is an error, never a silently skipped row', () => {
  const noHeader = map().replace('| 症狀 / 告警 | 立即讀取的 Runbook |\n|---|---|\n', '');
  assert.throws(() => renderIndex(noHeader, loaded), /no header row followed by a separator row/);
  const noPipe = map().replace('| 網站 502 / OOM | `runbooks/502.md` |', '網站 502 / OOM | `runbooks/502.md`');
  assert.throws(() => renderIndex(noPipe, loaded), /table row does not start with a pipe/);
  const oneCell = map({ selfRows: ['| 改動外掛並要讓操作者拿到 → bump `VERSION` |'] });
  assert.throws(() => renderIndex(oneCell, loaded), /table row has too few cells/);
});

test('all five tables must exist, including the one that is not indexed', () => {
  const lost = map().replace('### 工作類型 → Agent/Tool 路由表', '### Agents');
  assert.throws(() => renderIndex(lost, loaded), /table "### 工作類型 → Agent\/Tool 路由表" not found/);
});

test('a glob that is not a tool family is shown as a plain target', () => {
  const text = renderIndex(map({ selfRows: ['| 改動外掛 code | bump `VERSION`，push tag `v*` → Action |'] }), new Set(['verify', ...loaded]));
  assert.ok(text.includes('- 改動外掛 code → `VERSION` → `v*`'), text);
});

test('row selection: runbooks all, self-trigger without hooks, preload all, phrases only when nothing else surfaces them', () => {
  const lines = renderIndex(map(), loaded).split('\n');
  assert.deepEqual(lines, [
    '**症狀 → 先讀 runbook**（1）',
    '- 網站 502 / OOM → `runbooks/502.md`',
    '**我正在做 X → 接著做**（1）',
    '- critic 回報 Critical → `vuln-verifier`',
    '**任務類型 → 先載入**（2）',
    '- Security（auth / RLS） → `critic` → `vuln-verifier`',
    '- Client site（WP / 客戶） → `wordpress-*`',
    '**使用者提到 → 先讀／先跑**（3）',
    '- 改外觀／theme → `THEME.md`',
    '- 訊息含 reboot 訊號 → `reports/status/auto-reboot-LATEST.md`',
    '- x 欄出現 error.*401|error.*403 → `secrets-vault.ps1 -Action import-user-env`',
  ]);
});

test('a hook-backed row, a loaded-tool row and a slash-command row are left to what already surfaces them', () => {
  const text = renderIndex(map(), loaded);
  for (const absent of ['auto-repair-guard', '/health`', 'tomo', 'file-path-router', 'devops-engineer']) {
    assert.ok(!text.includes(absent), `${absent} is not in the index`);
  }
});

test('a map that lost its section, a table, or all rows of a table is an error, not an empty index', () => {
  assert.throws(() => renderIndex('# Tool Trigger Map\n## Other', loaded), /section .* not found/);
  assert.throws(() => renderIndex(map().replace('### 問題症狀 → Runbook 路由表', '### Runbooks'), loaded), /table "### 問題症狀 → Runbook 路由表" not found/);
  assert.throws(() => renderIndex(map({ selfRows: [`| x | ${HOOK} hook |`] }), loaded), /produced no index rows/);
});

test('currentBlock finds the block whatever the newline style, and reports its absence', () => {
  const block = `${BEGIN}\n- a → \`b\`\n${END}`;
  assert.equal(currentBlock(`intro\r\n${block.replace(/\n/g, '\r\n')}\r\nafter`), block);
  assert.equal(currentBlock('no markers here'), null);
  assert.equal(currentBlock(`${END}\n${BEGIN}`), null);
  assert.equal(currentBlock(`${block}\n\nstale copy:\n${BEGIN}\n- old → \`x\`\n${END}`), null, 'a second block must not hide behind the first');
});

test('the real AGENTS.md carries exactly the generated index', () => {
  const expected = expectedBlock(REPO);
  const rows = expected.split('\n').filter((l) => l.startsWith('- '));
  assert.ok(rows.length >= 30, `the real map yields a real index (${rows.length} rows)`);
  assert.ok(rows.every((r) => r.includes(' → ')), 'every row has a target');
  const have = currentBlock(fs.readFileSync(join(REPO, AGENTS_REL), 'utf8'));
  assert.equal(have, expected, 'run: node scripts/gen-trigger-index.mjs --write');
});
