// HCI-30 collector pipeline -- sink/hci-discovered write path
// (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 8).
//
// Lands one completed runner job (Task 7's fetch+extract output, already
// uploaded to object storage by Task 5) as a DISCOVERED row in
// hci.sources/hci.source_snapshots. No Claim/Evidence/Assessment is ever
// created here (ADR-011 06:215: "raw web result must never automatically
// become formal HCI Evidence" -- automation stops at DISCOVERED, everything
// past it is a human-driven HCI admission-state transition). No record-level
// dedup (ADR-0026): the same URL re-fetched twice produces the SAME
// hci.sources row (by source_ref) but a NEW hci.source_snapshots row every
// time -- append-only, one row per retrieval.
//
// Deliberately takes `query` as a parameter rather than importing `pg`
// itself: this module has zero npm dependencies, matching the fetch-runner
// modules' own "no external dependency where Node core (or, here, a plain
// function signature) suffices" choice. The caller (app/server.mjs's
// queryAsTenant, or Task 9's Trigger.dev task once built) owns the actual
// Postgres connection and the SET ROLE tenant-scoping -- this module only
// ever issues SQL through the function it is handed, so RLS (which keys off
// whichever role the caller already SET ROLE'd to) is the only tenant
// boundary in effect, exactly as every other write path in this app already
// works (see app/server.mjs's own handlers).
//
// `query(sql, params) => Promise<{ rows }>` is the pg.Pool/pg.Client query
// shape -- any object satisfying it works (a real pg connection, or a test
// double).

import crypto from 'node:crypto';

/**
 * Non-authoritative "these might be the same story" hint: other hci.sources
 * rows (within whatever tenant `query`'s connection is scoped to via RLS)
 * whose source_ref shares the same origin (scheme+host[+port]) as the
 * target URL, excluding the source this call just touched. Computed by
 * origin only -- NOT full canonical-URL resolution (Task 7's own Boundaries
 * explicitly excludes that: "no canonical-URL resolution... a different
 * product surface this runner does not own"). This is a coarse, cheap,
 * honestly-labelled-as-non-authoritative signal for a human reviewer, never
 * persisted anywhere (Task 8's own Boundaries: hci.source_relationships
 * requires a Claim, which does not exist at the DISCOVERED stage).
 */
async function findCandidateRelatedSources(query, targetUrl, excludeSourceId) {
  let origin;
  try {
    origin = new URL(targetUrl).origin;
  } catch {
    // Boundaries note: fetchAndExtract's own SSRF gate already rejects an
    // unparseable URL long before this function runs, so this branch exists
    // only as defense in depth, not an expected path.
    return [];
  }
  try {
    // critic review 2026-09-17: `starts_with()`, not `LIKE $1` -- a bound
    // LIKE parameter is safe from SQL injection, but Postgres still
    // interprets a literal `_`/`%` INSIDE that parameter value as a
    // wildcard. A hostname containing `_` is legal (WHATWG URL host
    // parsing permits it, e.g. `my_test.example.com`) and would otherwise
    // make this "same origin" hint match ANY single character in that
    // position against another tenant's unrelated source -- surfacing an
    // unrelated organization's page as a candidate "same story" to a human
    // reviewer, exactly the misattribution this feature exists to avoid.
    // starts_with() is a plain prefix comparison with no wildcard semantics
    // at all, closing the whole bug class rather than escaping `_`/`%`.
    const { rows } = await query(
      "SELECT id, source_ref FROM hci.sources WHERE starts_with(source_ref, $1) AND id != $2 ORDER BY id LIMIT 20",
      [`${origin}/`, excludeSourceId],
    );
    return rows.map((r) => ({ sourceId: r.id, sourceRef: r.source_ref }));
  } catch (err) {
    // critic review 2026-09-17: this step is explicitly non-authoritative
    // (Task 8's own Boundaries) -- a transient failure here (connection
    // drop, statement timeout) must never turn an otherwise-successful
    // DISCOVERED write into a reported failure. The two authoritative
    // writes above (upsert_discovered_source, the source_snapshots INSERT)
    // are each their own autocommit statement and have already durably
    // committed by the time this runs; letting this throw would make a
    // retrying caller re-invoke the whole write for a URL that is already
    // correctly recorded, producing a spurious duplicate snapshot row for
    // one real fetch (source_snapshots is plain-append, not idempotent like
    // the upsert). Degrading to no hints preserves the write's success.
    console.error('findCandidateRelatedSources: non-fatal failure, degrading to no hints:', err.message);
    return [];
  }
}

/**
 * Write one runner job's output as a DISCOVERED source + a new snapshot.
 *
 * @param {(sql: string, params?: unknown[]) => Promise<{rows: any[]}>} query
 * @param {{targetUrl: string, contentHash: string, snapshotRef: string, contentEpistemicType?: string}} input
 *   `contentHash`/`snapshotRef` are Task 5's object-storage write-path
 *   return shape ({content_hash, snapshot_ref}); `contentEpistemicType`
 *   should come from Task 7's content_provenance.epistemic_type. Defaults
 *   to 'UNKNOWN' (0020's own migration-level default and reasoning: a raw
 *   snapshot must never default to EVIDENCE before a human has looked at
 *   it) if the caller does not supply one.
 * @returns {Promise<{sourceId: string, snapshotId: string, candidateRelatedSources: {sourceId: string, sourceRef: string}[]}>}
 */
export async function writeDiscoveredSource(query, input) {
  const { targetUrl, contentHash, snapshotRef, contentEpistemicType = 'UNKNOWN' } = input;
  // critic review 2026-09-17: a whitespace-only string was truthy and slid
  // past this check, then failed downstream with a raw Postgres CHECK
  // (length(btrim(source_ref)) > 0) error instead of this module's own
  // clear TypeError -- DB defense-in-depth held either way, but the error
  // message quality regressed. `.trim()` here matches the DB's own
  // btrim-based emptiness definition.
  if (typeof targetUrl !== 'string' || !targetUrl.trim()) throw new TypeError('targetUrl is required');
  if (typeof contentHash !== 'string' || !contentHash.trim()) throw new TypeError('contentHash is required');
  if (typeof snapshotRef !== 'string' || !snapshotRef.trim()) throw new TypeError('snapshotRef is required');

  // hci.upsert_discovered_source(p_id, p_source_ref) resolves the SAME row
  // for a re-discovered URL (ON CONFLICT DO UPDATE SET source_ref =
  // EXCLUDED.source_ref, a no-op when unchanged) -- the returned id may NOT
  // be the p_id just generated here; the function is the single source of
  // truth for which id this source_ref actually maps to. admission_state is
  // never part of this conflict-resolution write (0020's own trigger design:
  // INSERT must start DISCOVERED, and this upsert's ON CONFLICT clause never
  // touches that column), so re-discovering an already-promoted source can
  // never drag it back to DISCOVERED.
  const candidateSourceId = crypto.randomUUID();
  const { rows: upsertRows } = await query('SELECT hci.upsert_discovered_source($1, $2) AS id', [candidateSourceId, targetUrl]);
  const sourceId = upsertRows[0].id;

  // hci.source_snapshots is append-only by schema design (0004's own
  // reject_update_delete triggers) -- always a plain INSERT, never an
  // upsert, so a second fetch of the same URL produces a SECOND snapshot
  // row, never overwrites the first (ADR-0026: no record-level dedup).
  // tenant_id comes from hci.current_tenant_id(), the same session-scoped
  // function RLS itself keys off -- not passed as a parameter, so this
  // function has no way to write into a tenant other than whichever one the
  // caller's connection is already SET ROLE'd to.
  const snapshotId = crypto.randomUUID();
  await query(
    'INSERT INTO hci.source_snapshots (id, tenant_id, source_id, content_hash, snapshot_ref, content_epistemic_type) VALUES ($1, hci.current_tenant_id(), $2, $3, $4, $5)',
    [snapshotId, sourceId, contentHash, snapshotRef, contentEpistemicType],
  );

  const candidateRelatedSources = await findCandidateRelatedSources(query, targetUrl, sourceId);

  return { sourceId, snapshotId, candidateRelatedSources };
}
