#!/usr/bin/env node
// Verify every `mcp__<server>__<tool>` reference inside the SHARED agent assets
// resolves to a server that can actually exist at runtime.
//
// Why this gate exists (2026-09-20): `.claude/skills/browser-test/SKILL.md` told the
// agent to call `mcp__Claude_in_Chrome__list_connected_browsers` for months. The real
// server id is `claude-in-chrome` -- lowercase, hyphens -- so the skill's FIRST tool
// call failed every time, and `mcp__Claude_in_Chrome__screenshot` was not a tool at
// all (screenshots are an action on `computer`). Nothing caught it: `mcp-health.js`
// checks whether a configured server is UP, never whether a reference names a real
// one. Same class: `decision-intelligence` declared `mcp__perplexity__perplexity_search`
// in its `tools:` frontmatter after the Perplexity MCP server was retired, so the agent
// silently lost its research tool with no error anywhere.
//
// Invariant, stated so the fix is not "spell-check the two names we found":
//   An asset may only name a server that (a) our own registry emits and has enabled,
//   or (b) the host injects. Everything else is unreachable at call time. Case and
//   punctuation are part of the id, so comparison is exact.
//
// Deliberately NOT in scope: whether `<tool>` exists on that server. Tool rosters
// change with every upstream release, so a static list would need syncing forever and
// would go stale silently -- the failure mode this gate exists to remove. Server ids
// are ours (or the host's) and stable, which is what makes them checkable.
//
// Node-only on purpose: these assets are shared with Codex, whose containers ship
// without pwsh, so a `.ps1` gate would only ever run on the Windows laptop.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');

// Roots holding assets that an agent reads as instructions. `.codex/agents` and
// `.agents/skills` are the generated Codex side: a bad ref reaches Codex too.
const ROOTS = [
  '.claude/commands',
  '.claude/agents',
  '.claude/skills',
  '.agents/skills',
  '.codex/agents',
];
const EXTRA_FILES = ['.claude/SKILL_AND_COMMAND_INDEX.md', '.claude/SUBAGENT_CHARTER.md'];
const EXTS = new Set(['.md', '.toml', '.json']);

// Servers the HOST injects (Claude Code / the desktop app / Codex), not ours to
// configure and therefore absent from our registry. Exact spellings, because a
// near-miss spelling is precisely the bug being caught.
const HOST_SERVERS = new Set([
  'claude-in-chrome',
  'Claude_Browser',
  'computer-use',
  'terminal',
  'visualize',
  'mcp-registry',
  'ccd_session', 'ccd_session_mgmt', 'ccd_view', 'ccd_pr', 'ccd_settings',
  'ccd_connectors', 'ccd_directory', 'ccd_sidebar', 'ccd_window',
]);

const IGNORE_MARKER = 'mcp-ref-ignore';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Server segment allows the punctuation real ids use; tool segment is identifier-only.
const REF_RE = /mcp__([A-Za-z0-9_-]+)__([A-Za-z0-9_]+)/g;

function readRegistry() {
  const p = join(REPO, 'mcp/registry.template.json');
  const raw = readFileSync(p, 'utf8').replace(/^﻿/, '');
  const doc = JSON.parse(raw);
  const servers = doc.mcpServers || doc.servers || doc;
  const enabled = new Set();
  const disabled = new Set();
  for (const [name, entry] of Object.entries(servers)) {
    const off = entry && typeof entry === 'object' && entry.enabled === false;
    (off ? disabled : enabled).add(name);
  }
  return { enabled, disabled };
}

// File set = what git considers repo-owned under ROOTS (tracked + untracked,
// minus .gitignore). One SSOT: app-owned output such as .claude/skills/synced/ is ignored
// there, so it is neither committed nor scanned. A filesystem walk would disagree with it.
function collectFiles() {
  let out;
  try {
    out = execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-per-directory=.gitignore', '--', ...ROOTS],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    // No git = no evidence; failing beats a vacuous "0 files OK".
    throw new Error(`git ls-files failed, cannot determine repo-owned assets: ${e.message}`);
  }
  const files = [...new Set(out.split('\x00').filter(Boolean))]
    .filter((f) => EXTS.has(f.slice(f.lastIndexOf('.'))))
    .map((f) => join(REPO, f))
    .filter((abs) => existsSync(abs));
  // EXTRA_FILES are named explicitly (some are gitignored deployed copies, e.g. the
  // charter), so they bypass the git filter; only discovery under ROOTS is git-defined.
  for (const f of EXTRA_FILES) {
    const abs = join(REPO, f);
    if (existsSync(abs)) files.push(abs);
  }
  if (files.length === 0) throw new Error('git ls-files returned no asset files; refusing a vacuous pass');
  return files;
}

// Exported so the test can drive the rule without touching the filesystem.
export function checkText({ text, label, enabled, disabled }) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes(IGNORE_MARKER)) return;
    for (const m of line.matchAll(REF_RE)) {
      const ref = m[0];
      const server = m[1];
      if (HOST_SERVERS.has(server) || enabled.has(server)) continue;
      let why;
      if (disabled.has(server)) {
        why = `server "${server}" is enabled:false in mcp/registry.template.json, so sync-mcp-config.ps1 never emits it -- this call cannot resolve`;
      } else if (UUID_RE.test(server)) {
        why = `"${server}" is a per-install connector id, not a stable server name; resolve it from the live tool list instead of hardcoding it`;
      } else {
        const flat = (s) => s.toLowerCase().replace(/[_-]/g, '');
        const near = [...enabled, ...HOST_SERVERS].find((k) => flat(k) === flat(server));
        why = near
          ? `unknown server "${server}" -- did you mean "${near}"? ids are compared exactly, including case and punctuation`
          : `unknown server "${server}" -- not in mcp/registry.template.json and not a host-injected server`;
      }
      findings.push({ label, line: i + 1, ref, why });
    }
  });
  return findings;
}

function selfTest() {
  const enabled = new Set(['github', 'posthog']);
  const disabled = new Set(['canva']);
  const cases = [
    ['mcp__github__push_files', 0, 'registry server passes'],
    ['mcp__claude-in-chrome__navigate', 0, 'host server passes'],
    ['mcp__Claude_in_Chrome__navigate', 1, 'wrong casing/punctuation fails'],
    ['mcp__canva__export_design', 1, 'disabled server fails'],
    ['mcp__perplexity__perplexity_search', 1, 'retired server fails'],
    ['mcp__f7320332-8068-44ba-9e9e-18a5c7ce6e5a__get_message', 1, 'UUID connector id fails'],
    ['see mcp__perplexity__ for history', 0, 'bare server prose (no tool segment) passes'],
    [`mcp__nope__x <!-- ${IGNORE_MARKER} -->`, 0, 'ignore marker respected'],
    ['mcp__github__push_files and mcp__nope__x', 1, 'mixed line reports only the bad ref'],
  ];
  let bad = 0;
  for (const [text, want, why] of cases) {
    const got = checkText({ text, label: 'self-test', enabled, disabled }).length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${why} (expected ${want}, got ${got})`);
  }
  // The near-miss hint is the whole point of the Claude_in_Chrome case; assert it fires.
  const hint = checkText({ text: 'mcp__Claude_in_Chrome__navigate', label: 't', enabled, disabled })[0];
  const hintOk = Boolean(hint) && hint.why.includes('did you mean "claude-in-chrome"');
  if (!hintOk) bad++;
  console.log(`${hintOk ? 'PASS' : 'FAIL'}  near-miss hint names the correct id`);
  console.log(bad === 0 ? `\nself-test OK (${cases.length + 1} cases)` : `\nself-test FAILED (${bad})`);
  return bad === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const { enabled, disabled } = readRegistry();
  const files = collectFiles();
  const findings = [];
  for (const f of files) {
    const label = relative(REPO, f).split(sep).join('/');
    const text = readFileSync(f, 'utf8').replace(/^﻿/, '');
    findings.push(...checkText({ text, label, enabled, disabled }));
  }
  if (findings.length === 0) {
    console.log(`asset MCP refs OK -- ${files.length} files scanned, 0 unreachable references`);
    return 0;
  }
  console.error(`asset MCP refs FAILED -- ${findings.length} unreachable reference(s):\n`);
  for (const f of findings) console.error(`  ${f.label}:${f.line}  ${f.ref}\n    ${f.why}`);
  console.error('\nFix the reference, or add an inline `mcp-ref-ignore` marker if the line is prose about a retired server.');
  return 1;
}

// Run only when invoked as a CLI. Without this guard, `import`ing the module to unit-test
// `checkText` executed `main()` and then `process.exit(0)` -- which killed the test process
// before a single test registered, and the zero exit code reported the run as PASSING.
// A false green in the gate that exists to stop false greens; caught 2026-09-20 by
// checking the reported test count instead of the exit code.
const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main());
