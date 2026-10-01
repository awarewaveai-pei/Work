// Gate: every section pointer into the agent rule set (AGENTS.md -> appendix, and any file in the
// repo -> AGENTS.md) lands on exactly one heading, and the appendix holds no copy of the rules.
// See scripts/verify-governance-pointers.mjs for the invariant and the 2026-10-01 state behind it.
//
// The rule is driven with synthetic trees so a broken rule cannot pass just because the real
// tree happens to be clean; the last tests then assert the real tree IS clean and that the CLI
// refuses to call an empty scan a pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SCRIPT = join(REPO, 'scripts', 'verify-governance-pointers.mjs');
const { checkPointers, collectTree, headingKey, parseHeadings, RECORD_PATHS } = await import(pathToFileURL(SCRIPT).href);

const S = String.fromCharCode(0xa7);

// A tree that passes everything; each case perturbs one thing.
function cleanTree() {
  return {
    agents: [
      '# Rules',
      '## 0. Hard facts',
      `- deploy only through the script. ${S}Deploy checklist`,
      '## 1. Identity',
      `- patch test (flow in ${S}0). ${S}R0: architect mode`,
    ].join('\n'),
    appendix: [
      '# Appendix',
      '## Deploy checklist (SOP)',
      'six items',
      '## R0: architect mode',
      `why patches are a red line; see ${S}Deploy checklist, and \`report.md\` ${S}Snapshot for the format.`,
      '## Related Documents (Auto-Synced)',
    ].join('\n'),
    sources: [
      { rel: 'CLAUDE.md', text: `evidence lines: AGENTS.md ${S}1\n` },
      { rel: 'mcp/claude-userlevel/hooks/rules/x.js', text: `'Ref: AGENTS.md ${S}Deploy checklist (six items)'\n` },
    ],
  };
}
const types = (tree) => checkPointers(tree).map((i) => i.type);
const at = (tree) => checkPointers(tree).map((i) => `${i.type}@${i.where}`);

test('clean tree has no issues and counts what it resolved', () => {
  const t = cleanTree();
  assert.deepEqual(checkPointers(t), []);
  assert.equal(t.resolved, 6, 'two end-of-line pointers, one numeric, one appendix ref, two citations');
});

test('headingKey drops the parenthetical and the dash suffix', () => {
  assert.equal(headingKey('Deploy checklist (SOP)'), 'Deploy checklist');
  assert.equal(headingKey('**Fan-out** — lessons'), 'Fan-out');
  assert.equal(headingKey('規則優先序（衝突裁決）'), '規則優先序');
});

test('fenced blocks: a shorter, an info-string or a deeply indented fence line does not end the block', () => {
  const md = ['````', '```', '## fake inside the block', '```', '````', '## real', '~~~', '```', '## also fake', '~~~'].join('\n');
  assert.deepEqual(parseHeadings(md).map((h) => h.key), ['real']);
  assert.deepEqual(parseHeadings('```js\n## fake\n```\n## after').map((h) => h.key), ['after']);
  assert.deepEqual(parseHeadings('```\n    ```\n## still code\n```\n## after').map((h) => h.key), ['after'], 'a 4-space-indented fence line is content');
  assert.deepEqual(parseHeadings(' ```\n    ```\n## still code\n ```\n## after').map((h) => h.key), ['after'], 'also when the opener is indented by one');
});

test('a heading may be indented by up to three spaces; four makes it code', () => {
  assert.deepEqual(parseHeadings('   ## Indented three\n    ## Indented four').map((h) => h.key), ['Indented three']);
  const t = cleanTree();
  t.appendix = t.appendix.replace('## Deploy checklist (SOP)', '  ## Deploy checklist (SOP)');
  assert.deepEqual(checkPointers(t), []);
});

test('a pointer inside a code span of any backtick length is a mention; outside it is real', () => {
  const t = cleanTree();
  t.appendix += `\nsyntax: \`\`AGENTS.md ${S}Ghost\`\` and \`${S}Other ghost\`.`;
  assert.deepEqual(checkPointers(t), []);
  t.appendix += `\nreal: \`\`code\`\` then ${S}Ghost`;
  assert.deepEqual(types(t), ['pointer_unresolved']);
});

test('a second pointer joined by a conjunction is still an AGENTS citation', () => {
  const t = cleanTree();
  t.sources.push({ rel: 'scripts/c.ps1', text: `# AGENTS.md ${S}0 and ${S}NoSuchSection\n# AGENTS.md ${S}0 or ${S}1\n` });
  assert.deepEqual(at(t), ['citation_unresolved@scripts/c.ps1:1']);
});

test('a heading in a fenced block cannot satisfy a pointer', () => {
  const t = cleanTree();
  t.appendix = t.appendix.replace('## Deploy checklist (SOP)', '````\n```\n## Deploy checklist (SOP)\n```\n````');
  assert.ok(types(t).includes('pointer_unresolved'));
});

test('an end-of-line pointer with no heading is reported with its line', () => {
  const t = cleanTree();
  t.agents += `\n- new rule. ${S}Nowhere`;
  assert.deepEqual(at(t), ['pointer_unresolved@agency-os/AGENTS.md:6']);
});

test('a name must be a whole heading followed by a delimiter, never a prefix of longer text', () => {
  const t = cleanTree();
  t.sources.push({ rel: 'scripts/a.ps1', text: `# AGENTS.md ${S}Deploy checklistTYPO\n# AGENTS.md ${S}Deploy checklist; fine\n# AGENTS.md ${S}Deploy checklist\n` });
  const issues = checkPointers(t);
  assert.deepEqual(issues.map((i) => `${i.type}@${i.where}`), ['citation_unresolved@scripts/a.ps1:1']);
  assert.match(issues[0].detail, /runs on into "TYPO"/);
});

test('every section sign in a rule file is accounted for: mid-line, numeric, sub-numbered', () => {
  const t = cleanTree();
  t.agents += `\n- see ${S}7 and ${S}Ghost section, also ${S}0.5 here.`;
  assert.deepEqual(at(t), ['pointer_unresolved@agency-os/AGENTS.md:6', 'pointer_unresolved@agency-os/AGENTS.md:6', 'pointer_unresolved@agency-os/AGENTS.md:6']);
  const u = cleanTree();
  u.appendix += `\nbare number: ${S}99`;
  assert.deepEqual(at(u), ['pointer_unresolved@agency-os/docs/operations/AGENTS_APPENDIX.md:7']);
});

test('a pointer qualified by another file, or written in backticks, belongs elsewhere', () => {
  const t = cleanTree();
  t.appendix += `\nsee \`ao-resume.md\` ${S}1／${S}6 and [guide](docs/GUIDE.md) ${S}Routing table; the syntax is \`${S}name\`.`;
  assert.deepEqual(checkPointers(t), []);
});

test('unrelated text near a pointer does not hide it', () => {
  const t = cleanTree();
  t.appendix += `\nrun foo.js, then see ${S}NoSuchSection`;
  assert.deepEqual(types(t), ['pointer_unresolved']);
});

test('numeric citations: a missing number fails, with or without the sign repeated', () => {
  const t = cleanTree();
  t.sources.push({
    rel: 'scripts/r.ps1',
    text: [
      `# AGENTS.md ${S}0–${S}1 ok`,
      `# AGENTS ${S}0/1 ok`,
      `# AGENTS.md ${S}1–${S}99 bad`,
      `# AGENTS ${S}0/1/7 bad`,
      `# AGENTS.md ${S}1-99 bad`,
      `# AGENTS.md ${S}1, 12 files is prose`,
      `# AGENTS.md ${S}7 bad`,
    ].join('\n'),
  });
  assert.deepEqual(at(t), ['citation_unresolved@scripts/r.ps1:3', 'citation_unresolved@scripts/r.ps1:4', 'citation_unresolved@scripts/r.ps1:5', 'citation_unresolved@scripts/r.ps1:7']);
});

test('a section sign in another file that is not about AGENTS.md is not a citation', () => {
  const t = cleanTree();
  t.sources.push({ rel: 'docs/law.md', text: `GDPR ${S}17 and charter ${S}4.3 apply; ao-resume.md ${S}8 too.\n` });
  assert.deepEqual(checkPointers(t), []);
});

test('renaming an appendix heading breaks the pointer, the appendix ref and the hook citation', () => {
  const t = cleanTree();
  t.appendix = t.appendix.replace('## Deploy checklist (SOP)', '## Release checklist (SOP)');
  assert.deepEqual(types(t).sort(), ['citation_unresolved', 'pointer_unresolved', 'pointer_unresolved']);
});

test('two headings with one key are a duplicate, whichever file holds them', () => {
  const t = cleanTree();
  t.appendix += '\n## 1. Identity (old copy)';
  const issues = checkPointers(t);
  assert.deepEqual(issues.map((i) => i.type), ['duplicate_heading']);
  assert.match(issues[0].detail, /already at agency-os\/AGENTS\.md:4/);
});

test('a heading that starts with another heading is ambiguous', () => {
  const t = cleanTree();
  t.appendix += '\n## Deploy checklist details';
  const issues = checkPointers(t);
  assert.deepEqual(issues.map((i) => i.type), ['ambiguous_heading']);
  assert.match(issues[0].detail, /"Deploy checklist details" starts with the heading "Deploy checklist"/);
});

test('the doc-sync footer heading may appear in both files', () => {
  const t = cleanTree();
  t.agents += '\n## Related Documents (Auto-Synced)';
  assert.deepEqual(checkPointers(t), []);
});

test('an archive is refused by its heading and by its content, even inside a code fence', () => {
  const t = cleanTree();
  t.appendix += '\n## 第五次瘦身前全文存檔';
  assert.deepEqual(types(t), ['appendix_archive']);
  const u = cleanTree();
  const rule = '- a rule body long enough to count as rule text: deploy only through the one script, never by hand.';
  u.agents += `\n${rule}`;
  u.appendix += `\n## History\n\`\`\`\n${rule}\n\`\`\``;
  assert.deepEqual(at(u), ['duplicate_rule_text@agency-os/docs/operations/AGENTS_APPENDIX.md:9']);
});

test('an unreadable rule file or a failed scan is an issue, not an empty check', () => {
  assert.deepEqual(at({ agents: null, appendix: null, sources: [] }), ['missing_file@agency-os/AGENTS.md']);
  const t = cleanTree();
  t.appendix = null;
  assert.deepEqual(at(t), ['missing_file@agency-os/docs/operations/AGENTS_APPENDIX.md']);
  const u = cleanTree();
  u.scanIssues = [{ type: 'unreadable_source', where: 'scripts/locked.ps1', detail: 'EACCES' }];
  assert.deepEqual(at(u), ['unreadable_source@scripts/locked.ps1']);
});

test('records are skipped, live surfaces are not', () => {
  const skip = (p) => RECORD_PATHS.some((re) => re.test(p));
  for (const p of ['agency-os/WORKLOG.md', 'agency-os/WORKLOG-archive/2026-05.md', 'agency-os/reports/oracle/x.md', 'agency-os/docs/x/ADR-0030-y.md', 'agency-os/docs/CODEX_HANDOFF_2026-08-31.md']) {
    assert.ok(skip(p), `${p} is a record`);
  }
  for (const p of ['runbooks/VPS-AUTO-REBOOT-RUNBOOK.md', 'lobster-factory/infra/app/lib/engine.ts', '.claude/commands/ao-close.md', 'scripts/verify-closeout-completeness.ps1', 'CLAUDE.md']) {
    assert.ok(!skip(p), `${p} is live`);
  }
});

test('the CLI fails on a root that is not a git checkout, and never prints a pass with nothing verified', () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'govgate-root-'));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, `--root=${dir}`], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stdout, /PASSED/);
  } finally {
    fs.rmdirSync(dir);
  }
});

test('the real tree is clean, scanned widely, and the CLI reports the counts', () => {
  const tree = collectTree(REPO);
  assert.ok(tree.agents && tree.appendix, 'rule set files were read');
  assert.equal(parseHeadings(tree.appendix)[0]?.level, 1, 'the appendix title is a heading even when the file carries a BOM');
  assert.deepEqual(checkPointers(tree), []);
  assert.ok(tree.scanned > 1000, `expected a repo-wide scan, got ${tree.scanned} files`);
  assert.ok(tree.resolved >= 60, `expected the known pointers to be resolved, got ${tree.resolved}`);
  const rels = new Set(tree.sources.map((s) => s.rel));
  for (const must of ['CLAUDE.md', '.claude/commands/ao-close.md', 'mcp/claude-userlevel/hooks/rules/file-path-router.js', 'scripts/verify-closeout-completeness.ps1']) {
    assert.ok(rels.has(must), `${must} is in the scan`);
  }
  const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Governance pointers PASSED \(\d+ files scanned, \d+ headings, \d+ pointers resolved\)\.\s*$/);
});
