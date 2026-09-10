// Document identity: which rows are "the same document, different version".
//
// K1 (KNOWLEDGE_BASE_PLAN.md §1.3). Pure module — no DB, no network, fully unit-testable.
//
// doc_family_id = uuidv5(KB_FAMILY_NAMESPACE, organizationId + "|" + canonicalKey).
// The organization is INSIDE the hash on purpose: two tenants ingesting the same public URL must
// not land in the same family. If they did, any future "drop the old versions of this family"
// that forgot an organization_id filter would delete across tenants — and RLS on these tables is
// service_role only, so the database has no backstop.
//
// The namespace constant is hard-coded, never read from env: an env-derived namespace would make
// the same document produce different family ids on different machines, silently splitting a
// document's version history in two.

import { createHash } from "node:crypto";

/** Fixed v5 namespace for KB document families. Changing it re-parents every existing family. */
export const KB_FAMILY_NAMESPACE = "b6f1c0a2-3d4e-5f60-8a91-2c3d4e5f6071";

function uuidBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32 || !/^[0-9a-fA-F]+$/.test(hex)) throw new Error("invalid_uuid");
  return Buffer.from(hex, "hex");
}

/** RFC 4122 §4.3 name-based UUID, SHA-1 variant. */
export function uuidv5(namespace: string, name: string): string {
  const hash = createHash("sha1").update(uuidBytes(namespace)).update(Buffer.from(name, "utf8")).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The stable identity key of a document.
 *
 * A real `canonicalUrl` wins when the caller has one, and is used EXACTLY as given apart from
 * trimming whitespace: URL normalisation belongs to the collection layer (ADR 011 §決策 2), which
 * owns it precisely so that two blocks cannot disagree about what the same URL is. So
 * `HTTPS://X.test/a` and `https://x.test/a` are two documents here — normalise upstream, not here.
 * Manually uploaded documents have no URL, so they are identified by kind + title:
 * re-uploading "退貨政策" with new text becomes version 2 of the same document, while a differently
 * titled upload is a different document. Renaming a manual document therefore starts a new family —
 * documented rather than guessed at, and the way out of it is to give the document a canonical URL.
 */
export function canonicalKeyFor(input: { kind: string; title: string; canonicalUrl?: string | null }): string {
  const url = (input.canonicalUrl ?? "").trim();
  if (url) return url;
  return `kb://manual/${input.kind}/${input.title.trim()}`;
}

/** Family id for a document within one tenant. */
export function docFamilyId(organizationId: string, canonicalKey: string): string {
  return uuidv5(KB_FAMILY_NAMESPACE, `${organizationId}|${canonicalKey}`);
}

/**
 * Content fingerprint used to skip pointless re-versioning: a crawler that re-fetches an unchanged
 * page must not create version 2, 3, 4 … Normalised on line endings and trailing whitespace only —
 * anything more aggressive would hide real edits.
 */
export function contentHash(body: string): string {
  const normalised = body.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}
