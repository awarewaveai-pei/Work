import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Shapes per ADR-0034. Enforced here (application layer), not as a DB CHECK
// on hci.subject_records.payload -- see that ADR's "why application-layer"
// reasoning. This is the only place a caller can bypass by writing SQL
// directly against an app-role connection; it cannot be bypassed through
// this app's own API, which always calls this before INSERT.
function isNonEmptyString(v) { return typeof v === 'string' && v.trim() !== ''; }
function isUuidArray(v) { return Array.isArray(v) && v.every(isNonEmptyString); }

export function validateSubjectRecordPayload(kind, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload must be an object');
  switch (kind) {
    case 'EVIDENCE':
      if (!isNonEmptyString(payload.content)) throw new Error('EVIDENCE payload requires non-empty content');
      return payload;
    case 'CLAIM':
      if (!isNonEmptyString(payload.content)) throw new Error('CLAIM payload requires non-empty content');
      if (!isUuidArray(payload.evidence_refs) || payload.evidence_refs.length === 0) throw new Error('CLAIM payload requires non-empty evidence_refs');
      return payload;
    case 'ASSESSMENT':
      if (!isNonEmptyString(payload.dimension)) throw new Error('ASSESSMENT payload requires non-empty dimension');
      if (!isNonEmptyString(payload.value)) throw new Error('ASSESSMENT payload requires non-empty value');
      if (!isUuidArray(payload.evidence_refs) || payload.evidence_refs.length === 0) throw new Error('ASSESSMENT payload requires non-empty evidence_refs');
      return payload;
    case 'TRUST_DOMAIN':
      if (!isNonEmptyString(payload.domain)) throw new Error('TRUST_DOMAIN payload requires non-empty domain');
      if (!isNonEmptyString(payload.band)) throw new Error('TRUST_DOMAIN payload requires non-empty band');
      return payload;
    default:
      throw new Error(`unsupported kind: ${kind}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    try {
      const { kind, payload } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      validateSubjectRecordPayload(kind, payload);
      process.exitCode = 0;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  });
}
