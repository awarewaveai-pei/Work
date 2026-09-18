// HCI-30 -- human-driven promotion of a DISCOVERED source into case EVIDENCE
// (2026-09-19). Automation stops at DISCOVERED (sink-hci-discovered.mjs;
// ADR-011 §15c, "raw web result must never automatically become formal HCI
// Evidence"). This module is the human path past it. One operator act covers
// all three steps: they read the snapshot text (VERIFIED), pick the case(s) and
// person(s) it is about (MATCHED), and confirm (ACCEPTED). The migration 0020
// trigger enforces each single step. This module walks them in order and never
// skips one.
//
// `query` MUST be one transaction's executor on a SET LOCAL ROLE'd connection
// (app/tenant-transaction.mjs): the FOR UPDATE lock, the 3 state
// steps and every EVIDENCE insert commit or roll back together. RLS on that
// role is the tenant boundary.
//
// EVIDENCE has no link table: hci.source_relationships is CLAIM-only
// (migration 0004, claim_kind CHECK). Provenance therefore lives in
// payload.source (snapshot id + content hash = the exact stored bytes the
// text was derived from).

import crypto from 'node:crypto';
import { validateSubjectRecordPayload } from '../../packages/contracts/validate-subject-record-payload.mjs';

export const EVIDENCE_CONTENT_MAX_CHARS = 20_000;
// Written ONLY by buildEvidencePayload. POST /cases/:id/records refuses them, so
// a hand-typed record can never pose as a verified web capture (critic m3).
export const RESERVED_EVIDENCE_KEYS = ['source', 'provenance'];
export const MAX_CASES = 5;
export const MAX_PERSONS = 10;
export const MAX_PAIRS = 20;
const PROMOTION_PATH = ['MATCHED', 'VERIFIED', 'ACCEPTED'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PromoteError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PromoteError';
    this.status = status;
  }
}

export function isUuid(v) {
  return typeof v === 'string' && UUID.test(v);
}

function uuidList(value, name, max) {
  if (!Array.isArray(value) || value.length === 0) throw new PromoteError(400, `${name} must be a non-empty array`);
  if (!value.every(isUuid)) throw new PromoteError(400, `${name} must contain only uuids`);
  const unique = [...new Set(value.map((v) => v.toLowerCase()))];
  if (unique.length > max) throw new PromoteError(400, `${name} allows at most ${max} entries`);
  return unique;
}

/** Shape-only validation of the POST body. Throws PromoteError(400). */
export function validatePromoteRequest(body) {
  const { snapshotId, caseIds, personIds } = body || {};
  if (!isUuid(snapshotId)) throw new PromoteError(400, 'snapshotId (the snapshot you previewed) is required');
  const cases = uuidList(caseIds, 'caseIds', MAX_CASES);
  const persons = uuidList(personIds, 'personIds', MAX_PERSONS);
  if (cases.length * persons.length > MAX_PAIRS) throw new PromoteError(400, `at most ${MAX_PAIRS} case x person evidence records per promotion`);
  return { snapshotId: snapshotId.toLowerCase(), caseIds: cases, personIds: persons };
}

/**
 * The newest snapshot of a source, or a specific one when snapshotId is given.
 * Plain read. RLS scopes it to the caller's tenant.
 */
export async function loadSnapshot(query, sourceId, snapshotId = null) {
  const { rows } = await query(
    `SELECT s.id AS source_id, s.source_ref, s.admission_state,
            ss.id AS snapshot_id, ss.content_hash, ss.snapshot_ref, ss.retrieved_at
       FROM hci.sources s
       JOIN hci.source_snapshots ss ON ss.tenant_id = s.tenant_id AND ss.source_id = s.id
      WHERE s.id = $1 AND ($2::uuid IS NULL OR ss.id = $2::uuid)
      ORDER BY ss.retrieved_at DESC, ss.id DESC
      LIMIT 1`,
    [sourceId, snapshotId],
  );
  return rows[0] ?? null;
}

function iso(v) {
  return v instanceof Date ? v.toISOString() : String(v);
}

/** EVIDENCE payload from a snapshot row + the runner's extracted text. */
export function buildEvidencePayload(snapshot, extracted) {
  const text = (extracted.text || '').trim();
  // toWellFormed: the cut can split a surrogate pair; a lone surrogate makes the
  // jsonb INSERT fail on every retry (critic review 2026-09-19, m1).
  const content = text.slice(0, EVIDENCE_CONTENT_MAX_CHARS).toWellFormed();
  const fullLength = Math.max(extracted.textLength ?? 0, text.length);
  return {
    content,
    content_truncated: Boolean(extracted.textTruncated) || content.length < text.length,
    full_text_length: fullLength,
    source: {
      source_id: snapshot.source_id,
      source_ref: snapshot.source_ref,
      snapshot_id: snapshot.snapshot_id,
      content_hash: snapshot.content_hash,
      snapshot_ref: snapshot.snapshot_ref,
      retrieved_at: iso(snapshot.retrieved_at),
      title: extracted.title == null ? null : String(extracted.title).toWellFormed(),
    },
    // Kernel epistemic vocabulary, same values the runner stamps at capture
    // (http-html-fetch.mjs CONTENT_PROVENANCE): a site's page proves the site
    // said it, not that it is true.
    provenance: { epistemic_type: 'EVIDENCE', authorship_state: 'SOURCE_QUOTATION' },
  };
}

/**
 * Walk DISCOVERED -> MATCHED -> VERIFIED -> ACCEPTED and write one EVIDENCE
 * record per (case, person) pair, inside the caller's transaction.
 *
 * DISCOVERED-only by design: the FOR UPDATE lock makes a double-submit's second
 * request see ACCEPTED and get a 409 instead of duplicate evidence.
 * Inserts go in ascending caseId order. Migration 0018's hash chain takes a
 * transaction-scoped advisory lock per (tenant, case) on every insert, so two
 * concurrent promotions touching overlapping cases in opposite order would
 * otherwise deadlock.
 */
export async function promoteDiscoveredSource(query, { tenantId, sourceId, snapshotId, caseIds, personIds, payload }) {
  try {
    validateSubjectRecordPayload('EVIDENCE', payload);
  } catch {
    throw new PromoteError(422, 'the stored snapshot has no readable text -- nothing to record as evidence');
  }

  const { rows: src } = await query('SELECT admission_state FROM hci.sources WHERE id = $1 FOR UPDATE', [sourceId]);
  if (src.length === 0) throw new PromoteError(404, 'no source with that id visible to this tenant');
  if (src[0].admission_state !== 'DISCOVERED') {
    throw new PromoteError(409, `source is already ${src[0].admission_state} (only DISCOVERED sources can be promoted)`);
  }

  const { rows: snap } = await query('SELECT id FROM hci.source_snapshots WHERE id = $1 AND source_id = $2', [snapshotId, sourceId]);
  if (snap.length === 0) throw new PromoteError(404, 'that snapshot does not belong to this source');

  const { rows: openCases } = await query("SELECT id FROM hci.cases WHERE id = ANY($1::uuid[]) AND status IN ('OPEN','ACTIVE')", [caseIds]);
  if (openCases.length !== caseIds.length) throw new PromoteError(409, 'every selected case must exist and be open (not CLOSED)');
  const { rows: persons } = await query('SELECT id FROM hci.persons WHERE id = ANY($1::uuid[])', [personIds]);
  if (persons.length !== personIds.length) throw new PromoteError(404, 'one or more selected persons do not exist for this tenant');

  for (const state of PROMOTION_PATH) {
    await query('UPDATE hci.sources SET admission_state = $1 WHERE id = $2', [state, sourceId]);
  }

  const payloadJson = JSON.stringify(payload);
  const records = [];
  for (const caseId of [...caseIds].sort()) {
    for (const personId of personIds) {
      // EVIDENCE requires encryption_key_ref (migration 0007). Minted via the
      // same SECURITY DEFINER primitive POST /cases/:id/records uses.
      const { rows: keyRows } = await query('SELECT hci.mint_encryption_key() AS id');
      const id = crypto.randomUUID();
      await query(
        'INSERT INTO hci.subject_records (id, tenant_id, person_id, kind, case_id, payload, author_class, encryption_key_ref) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        // DETERMINISTIC: required for EVIDENCE by migration 0008, and accurate here
        // (machine-extracted text, not human-typed).
        [id, tenantId, personId, 'EVIDENCE', caseId, payloadJson, 'DETERMINISTIC', keyRows[0].id],
      );
      records.push({ id, caseId, personId });
    }
  }
  return { sourceId, admissionState: 'ACCEPTED', records };
}
