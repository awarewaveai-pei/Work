import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMigrationEvents } from '../systems-migrate-supervisor.mjs';

const registry = { systems: [{ slug: 's', phases: [{ slug: 'p', legacy_source_path: 'agency-os/handoffs/x/' }],
  features: [{ id: 'f3', slug: 'c3-a', phase: 'p', legacy_code: 'C3' }, { id: 'f8', slug: 'c8-b', phase: 'p', legacy_code: 'C8' },
    { id: 'f9', slug: 'c9-c', phase: 'p', legacy_code: 'C9' }, { id: 'f1', slug: 'c1-no-code', phase: 'p' }] }] };
const steps = [
  { code: 'C3', status: 'done', commit: 'aaa' },
  { code: 'C8', status: 'in_progress', items: [{ status: 'done', commit: 'bbb' }, { status: 'todo' }] },
  { code: 'C9', status: 'done' },
  { code: 'C1', status: 'done', commit: 'zzz' },
];
const run = (resolveSha) => buildMigrationEvents({ registry, steps, folder: 'agency-os/handoffs/x', sourceSha: 'src', occurredAt: '2026-01-01T00:00:00Z', resolveSha });

test('commit => evidence commit; done without evidence stays implemented; in_progress kept; unmapped counted', () => {
  const { events, unmapped } = run((s) => (s === 'bbb' ? null : s + '0'.repeat(40 - s.length)));
  const by = Object.fromEntries(events.map((e) => [e.feature_slug, e.payload]));
  assert.deepEqual(unmapped, ['C1']);
  assert.equal(by['c3-a'].evidence_level, 'commit');
  assert.equal(by['c3-a'].mapped_status, 'implemented');
  assert.equal(by['c8-b'].evidence_level, 'none'); // item commit does not exist in git
  assert.equal(by['c8-b'].mapped_status, 'in_progress');
  assert.equal(by['c9-c'].mapped_status, 'implemented'); // no evidence, never todo
  assert.equal(events[0].commit_sha.length, 40); // short sha from data.mjs expanded to the full one
  assert.equal(events[0].event_key, 'mig:f3');
  assert.equal(events[0].source, 'migration');
});

test('unclaimed folder throws', () => {
  assert.throws(() => buildMigrationEvents({ registry, steps, folder: 'other', sourceSha: 's', occurredAt: 'x', resolveSha: (s) => s }), /no registry phase/);
});

test('match is legacy_code only: slug prefix ignored, codes with dots / non-ASCII / no code at all map exactly', () => {
  const reg = { systems: [{ slug: 's', phases: [{ slug: 'p', legacy_source_path: 'agency-os/handoffs/x/' }],
    features: [{ id: 'a', slug: 'ed1-x', phase: 'p', legacy_code: 'ED.1' }, { id: 'b', slug: 'batch0-x', phase: 'p', legacy_code: '批0' },
      { id: 'c', slug: 's2-x', phase: 'p', legacy_code: '2' }, { id: 'd', slug: 'ed10-x', phase: 'p', legacy_code: 'ED.10' }] }] };
  const st = [{ code: 'ED.1', status: 'done' }, { code: '批0', status: 'todo' }, { n: 2, status: 'todo' }, { code: 'ED.1x', status: 'todo' }];
  const { events, unmapped } = buildMigrationEvents({ registry: reg, steps: st, folder: 'agency-os/handoffs/x', sourceSha: 's', occurredAt: 'x', resolveSha: () => null });
  assert.deepEqual(events.map((e) => e.feature_slug), ['ed1-x', 'batch0-x', 's2-x']);
  assert.deepEqual(unmapped, ['ED.1x']);
});
