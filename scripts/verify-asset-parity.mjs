#!/usr/bin/env node
// Verify the SHARED Claude + Codex asset surface is internally consistent:
// every command and agent reaches BOTH runtimes, and every index actually lists what
// exists on disk.
//
// Why this gate exists (2026-09-20). Three indexes and two parity relationships were
// maintained entirely by hand in a system whose stated philosophy is mechanical gates
// over self-discipline, and they had drifted:
//   * `.claude/SKILL_AND_COMMAND_INDEX.md` was last touched 2026-09-04 and was missing
//     `/claude-review` and `/codex-review` -- the two oracle entry points AGENTS.md
//     section 4 makes mandatory. The index that tells you what exists did not list the
//     commands you are required to run.
//   * The Codex command bridge was a hardcoded 3-entry table, so 42 of 45 commands were
//     Claude-only. `/claude-review` is BY DEFINITION the review a Codex session owes, and
//     a Codex session could not invoke it.
// `check-claude-sync.ps1` H3 only asks "does this tracked file exist on disk", which
// answers none of the above.
//
// Invariant: an asset's existence, its Codex bridge, and its index row are one fact in
// three places. Anything that can go out of step between them is checked here, so adding
// a command cannot quietly skip either the bridge or the index.
//
// Deliberately NOT in scope: an index ROW with no command behind it. The index keeps a
// "已退役" table on purpose so an old reference stays findable, and flagging those rows
// would either break that table or require this gate to understand the index's section
// structure. Orphans are caught where they actually mislead a runtime -- a generated
// wrapper or agent bridge whose source is gone, both checked below.
//
// Node-only on purpose: Codex containers ship without pwsh, so a .ps1 gate would only
// ever run on the Windows laptop -- the exact single-runtime blind spot being closed.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const COMMANDS_DIR = '.claude/commands';
const AGENTS_DIR = '.claude/agents';
const SKILLS_DIR = '.claude/skills';
const WRAPPER_DIR = '.agents/skills';
const CODEX_AGENT_DIR = '.codex/agents';
const INDEX_FILE = '.claude/SKILL_AND_COMMAND_INDEX.md';
const TRIGGER_MAP = 'agency-os/docs/operations/TOOL_TRIGGER_MAP.md';
const AGENT_INDEX = '.claude/agents/AGENT_INDEX.md';

// Not agents: the directory's own documentation.
const AGENT_DIR_NON_AGENTS = /^(README|AGENT_INDEX)/;

// Tiers defined in mcp/claude-userlevel/SUBAGENT_CHARTER.md. Aliases, not dated model ids:
// a pinned `claude-opus-5` would need editing on every model release, and an agent left on
// a retired id is a silent downgrade.
const MODEL_TIERS = new Set(['opus', 'sonnet', 'haiku', 'inherit']);

function readText(rel) {
  const p = join(REPO, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function parseFrontmatter(text) {
  const body = text.replace(/^﻿/, '');
  if (!body.startsWith('---')) return null;
  const end = body.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = body.slice(3, end);
  const fm = {};
  let lastKey = null;
  for (const raw of block.split(/\r?\n/)) {
    const m = raw.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (m) {
      lastKey = m[1];
      fm[lastKey] = m[2].trim();
    } else if (lastKey && /^\s+\S/.test(raw)) {
      // folded/continued scalar (`description: >-` then an indented line)
      fm[lastKey] = (fm[lastKey] ? fm[lastKey] + ' ' : '') + raw.trim();
    }
  }
  return fm;
}

function listMd(rel) {
  const p = join(REPO, rel);
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((f) => f.endsWith('.md')).sort();
}

export function collectTree() {
  const commands = listMd(COMMANDS_DIR).map((f) => {
    const name = f.slice(0, -3);
    const rel = `${COMMANDS_DIR}/${f}`;
    const buf = readFileSync(join(REPO, rel));
    const text = buf.toString('utf8');
    return {
      name,
      rel,
      hasBom: buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
      frontmatter: parseFrontmatter(text),
    };
  });

  const agents = listMd(AGENTS_DIR)
    .filter((f) => !AGENT_DIR_NON_AGENTS.test(f))
    .map((f) => {
      const rel = `${AGENTS_DIR}/${f}`;
      const fm = parseFrontmatter(readFileSync(join(REPO, rel), 'utf8'));
      return { name: f.slice(0, -3), rel, model: fm ? fm.model : undefined };
    });

  const skillsPath = join(REPO, SKILLS_DIR);
  const skills = [];
  if (existsSync(skillsPath)) {
    for (const entry of readdirSync(skillsPath).sort()) {
      const full = join(skillsPath, entry);
      if (statSync(full).isDirectory()) {
        if (existsSync(join(full, 'SKILL.md'))) skills.push(entry);
      } else if (entry.endsWith('.skill')) {
        // A packed archive. The generator names the wrapper after the archive's TOP FOLDER
        // (it opens the zip to find it); this gate assumes that equals the basename, true for
        // every archive so far (verified for ai-decision-intelligence.skill on 2026-09-20).
        // If a future archive disagrees, this reports a wrapper as missing when it exists --
        // a false alarm that names the file, never a false pass, which is the right way for
        // the cheap check to be wrong.
        skills.push(entry.slice(0, -'.skill'.length));
      }
    }
  }

  const wrapperPath = join(REPO, WRAPPER_DIR);
  const wrappers = new Set(
    existsSync(wrapperPath)
      ? readdirSync(wrapperPath).filter((d) => existsSync(join(wrapperPath, d, 'SKILL.md')))
      : []
  );

  const codexAgentPath = join(REPO, CODEX_AGENT_DIR);
  const tomls = new Set(
    existsSync(codexAgentPath)
      ? readdirSync(codexAgentPath).filter((f) => f.endsWith('.toml')).map((f) => f.slice(0, -5))
      : []
  );

  return {
    commands,
    agents,
    skills,
    wrappers,
    tomls,
    indexText: readText(INDEX_FILE),
    triggerMapText: readText(TRIGGER_MAP),
    agentIndexText: readText(AGENT_INDEX),
  };
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A row whose FIRST cell names the command, e.g. "| `/health` | ... |". Anchored to the
// line start so a mention buried in another row's description cannot satisfy it.
//
// The first cell may carry an annotation after the name -- TOOL_TRIGGER_MAP really does
// write "| `/codex-review`（2026-08-30 起主力，本 repo 自建 command） |" -- so trailing
// non-pipe text is allowed. The `(?![\w-])` boundary stops /review from being satisfied by
// a hypothetical /review-foo row, which a plain prefix match would have accepted. Leading
// `*`/`` ` `` decoration is tolerated so bolding a row (`| **`/health`** |`) does not make this
// gate cry wolf over pure formatting.
function hasCommandRow(text, name) {
  return new RegExp(`^\\|\\s*[*\`]*/${escapeRe(name)}(?![\\w-])[^|]*\\|`, 'm').test(text);
}

// Floors, not exact counts: the gate must not report OK because it found nothing to check.
// An empty scan is how a gate goes quietly green after a path rename or a partial checkout --
// the same false-green shape that let an imported CLI script's process.exit() fake a passing
// test run earlier the same day. Set well below the real inventory (41/25/13) so ordinary
// additions and removals never trip it.
const MIN_COMMANDS = 20;
const MIN_AGENTS = 10;
const MIN_SKILLS = 5;

export function checkParity(tree) {
  const problems = [];
  const add = (where, what) => problems.push({ where, what });

  if (tree.commands.length < MIN_COMMANDS) {
    add(COMMANDS_DIR, `only ${tree.commands.length} commands found (expected at least ${MIN_COMMANDS}) -- the scan found almost nothing, so a pass here would mean nothing was checked`);
  }
  if (tree.agents.length < MIN_AGENTS) {
    add(AGENTS_DIR, `only ${tree.agents.length} agents found (expected at least ${MIN_AGENTS}) -- see above`);
  }
  if (tree.skills.length < MIN_SKILLS) {
    add(SKILLS_DIR, `only ${tree.skills.length} skills found (expected at least ${MIN_SKILLS}) -- see above`);
  }

  const skipped = new Set();

  for (const cmd of tree.commands) {
    const fm = cmd.frontmatter;
    if (cmd.hasBom) {
      add(cmd.rel, 'starts with a UTF-8 BOM; repo .md must be BOM-free (AGENTS.md section 8) and a BOM before `---` stops frontmatter parsing');
    }
    if (!fm) {
      add(cmd.rel, 'has no YAML frontmatter, so its description is guessed from the body\'s first line and it cannot declare argument-hint or disable-model-invocation');
      continue;
    }
    if (!fm.name) add(cmd.rel, 'frontmatter is missing `name:`');
    else if (fm.name !== cmd.name) add(cmd.rel, `frontmatter name "${fm.name}" does not match the filename "${cmd.name}"`);
    if (!fm.description) add(cmd.rel, 'frontmatter is missing `description:`');

    if (fm['codex-skip'] === 'true') {
      skipped.add(cmd.name);
      continue;
    }
    const wrapper = `source-command-${cmd.name}`;
    if (!tree.wrappers.has(wrapper)) {
      add(cmd.rel, `no Codex wrapper at ${WRAPPER_DIR}/${wrapper}/SKILL.md -- re-run mcp/codex-userlevel/scripts/sync-claude-to-codex.ps1`);
    }
  }

  // Orphan command wrappers: a wrapper whose command was deleted keeps pointing Codex at
  // a file that no longer exists.
  for (const w of tree.wrappers) {
    if (!w.startsWith('source-command-')) continue;
    const cmdName = w.slice('source-command-'.length);
    if (!tree.commands.some((c) => c.name === cmdName)) {
      add(`${WRAPPER_DIR}/${w}`, `wraps /${cmdName}, which no longer exists under ${COMMANDS_DIR}`);
    } else if (skipped.has(cmdName)) {
      add(`${WRAPPER_DIR}/${w}`, `wraps /${cmdName}, which is marked codex-skip: true`);
    }
  }

  for (const agent of tree.agents) {
    if (!tree.tomls.has(agent.name)) {
      add(agent.rel, `no Codex agent bridge at ${CODEX_AGENT_DIR}/${agent.name}.toml`);
    }
    // An absent `model:` is not "inherit by choice", it is a tier nobody picked. That is
    // how critic, db-expert, vuln-verifier, debugger and planner ran on the parent's model
    // for months while AGENT_INDEX.md documented `opus` for all five. `inherit` is a valid
    // answer -- it just has to be written down. Tiers: mcp/claude-userlevel/SUBAGENT_CHARTER.md
    if (!agent.model) {
      add(agent.rel, 'frontmatter declares no `model:`, so its tier is whatever the parent session happens to be; declare one of opus / sonnet / haiku / inherit (see SUBAGENT_CHARTER.md)');
    } else if (!MODEL_TIERS.has(agent.model)) {
      add(agent.rel, `declares model: ${agent.model}, which is not one of ${[...MODEL_TIERS].join(' / ')}`);
    }
  }
  for (const t of tree.tomls) {
    if (!tree.agents.some((a) => a.name === t)) {
      add(`${CODEX_AGENT_DIR}/${t}.toml`, `bridges an agent that no longer exists under ${AGENTS_DIR}`);
    }
  }

  for (const skill of tree.skills) {
    if (!tree.wrappers.has(skill)) {
      add(`${SKILLS_DIR}/${skill}`, `no Codex wrapper at ${WRAPPER_DIR}/${skill}/SKILL.md`);
    }
  }

  // Index coverage. A bare substring search is NOT enough: it passed /ks-aw-01-reboot
  // purely because another row's prose said "已被 `/ks-aw-01-reboot` 取代", so a command with
  // no row of its own looked listed. The asset must own a ROW, which is what a reader
  // scanning the table actually needs.
  if (tree.indexText === null) {
    add(INDEX_FILE, 'is missing');
  } else {
    for (const cmd of tree.commands) {
      if (!hasCommandRow(tree.indexText, cmd.name)) {
        add(INDEX_FILE, `has no table row for /${cmd.name} (a mention inside another row's prose does not count)`);
      }
    }
  }
  if (tree.triggerMapText === null) {
    add(TRIGGER_MAP, 'is missing');
  } else {
    for (const cmd of tree.commands) {
      if (!hasCommandRow(tree.triggerMapText, cmd.name)) {
        add(TRIGGER_MAP, `has no table row for /${cmd.name}, so nothing routes an operator phrase to it`);
      }
    }
  }
  if (tree.agentIndexText === null) {
    add(AGENT_INDEX, 'is missing');
  } else {
    for (const agent of tree.agents) {
      if (!new RegExp(`^\\|\\s*\\[?${escapeRe(agent.name)}(?![\\w-])`, 'm').test(tree.agentIndexText)) {
        add(AGENT_INDEX, `has no table row for the ${agent.name} agent`);
      }
    }
  }

  return problems;
}

function main() {
  const tree = collectTree();
  const problems = checkParity(tree);
  const counts = `${tree.commands.length} commands, ${tree.agents.length} agents, ${tree.skills.length} skills, ${tree.wrappers.size} Codex wrappers, ${tree.tomls.size} Codex agent bridges`;
  if (problems.length === 0) {
    console.log(`asset parity OK -- ${counts}`);
    return 0;
  }
  console.error(`asset parity FAILED -- ${problems.length} problem(s) across ${counts}:\n`);
  for (const p of problems) console.error(`  ${p.where}\n    ${p.what}`);
  return 1;
}

const invokedDirectly =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main());
