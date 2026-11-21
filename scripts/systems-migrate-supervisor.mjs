#!/usr/bin/env node
// One-off per supervisor page: data.mjs cards -> contract-2 `migration` events on stdout. Never POSTs (the supervisor does).
// Card -> feature link: feature slug starts with the lowercased card code + "-" (c3-research-evidence <- code C3).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = { done: 'implemented', in_progress: 'in_progress', todo: 'todo' };
const norm = (p) => p.replaceAll(String.fromCharCode(92), '/').replace(/^\.\//, '').replace(/\/?$/, '/');

// No evidence never lowers a done card: done -> implemented regardless. Unknown legacy status -> todo + flagged by caller.
export function buildMigrationEvents({ registry, steps, folder, sourceSha, occurredAt, shaExists }) {
  const want = norm(folder);
  let system, phase;
  for (const s of registry.systems) for (const p of s.phases) if (p.legacy_source_path && norm(p.legacy_source_path) === want) { system = s; phase = p; }
  if (!system) throw new Error(`no registry phase claims legacy_source_path ${folder}`);
  const events = [], unmapped = [];
  for (const step of steps) {
    const feature = system.features.find((f) => f.phase === phase.slug && f.slug.startsWith(String(step.code).toLowerCase() + '-'));
    if (!feature) { unmapped.push(step.code); continue; }
    // Step-level commit, else the last done item's commit (cards in progress only carry item commits).
    const commit = step.commit || [...(step.items || [])].reverse().find((i) => i.status === 'done' && i.commit)?.commit || null;
    const hasCommit = Boolean(commit && shaExists(commit));
    events.push({
      event_key: `mig:${feature.id}`, system_slug: system.slug, phase_slug: phase.slug, feature_slug: feature.slug,
      event_type: 'migration', source: 'migration', commit_sha: hasCommit ? commit : null, occurred_at: occurredAt,
      payload: { legacy_status: step.status, mapped_status: STATUS[step.status] ?? 'todo', evidence_level: hasCommit ? 'commit' : 'none', source_path: want, source_sha: sourceSha },
      evidence: hasCommit ? { commit } : null,
    });
  }
  return { events, unmapped };
}

const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

async function main() {
  const folder = process.argv[2];
  if (!folder) { console.error('usage: systems-migrate-supervisor.mjs <supervisor folder> [--registry <file>]'); process.exit(2); }
  const ri = process.argv.indexOf('--registry');
  const registry = JSON.parse(fs.readFileSync(ri > 0 ? process.argv[ri + 1] : path.join(repo, 'agency-os/systems/registry.json'), 'utf8'));
  const abs = path.resolve(repo, folder);
  const rel = norm(path.relative(repo, abs)).slice(0, -1);
  const { STEPS } = await import(pathToFileURL(path.join(abs, 'data.mjs')).href);
  const log = git(['log', '-1', '--format=%H %cI', '--', rel + '/data.mjs']).stdout.trim().split(' ');
  if (log.length !== 2) throw new Error(`data.mjs has no git history under ${rel}`);
  const { events, unmapped } = buildMigrationEvents({ registry, steps: STEPS, folder: rel, sourceSha: log[0], occurredAt: log[1], shaExists: (sha) => git(['cat-file', '-e', sha + '^{commit}']).status === 0 });
  console.error(`migrated ${events.length}, unmapped cards (not in registry): ${unmapped.length}${unmapped.length ? ' ' + unmapped.join(',') : ''}`);
  console.log(JSON.stringify(events, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
