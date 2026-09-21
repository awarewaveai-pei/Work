// C9/C12 object layout in the private site-watch bucket:
//   site-watch/<orgId>/<pageId>/baseline.jpg                one object per page, overwritten in place
//   site-watch/<orgId>/<pageId>/evidence/<stamp>-<rand>.jpg failure/diff evidence, 30-day retention
//   site-watch/<orgId>/<pageId>/evidence/<stamp>-<rand>-diff.jpg
import { randomUUID } from "node:crypto";

export const SITE_WATCH_PREFIX = "site-watch/";

export function baselineKey(orgId: string, pageId: string): string {
  return `${SITE_WATCH_PREFIX}${orgId}/${pageId}/baseline.jpg`;
}

export function evidenceKeys(orgId: string, pageId: string, now: Date): { shot: string; diff: string } {
  const stamp = now.toISOString().replace(/[-:.]/g, "");
  const base = `${SITE_WATCH_PREFIX}${orgId}/${pageId}/evidence/${stamp}-${randomUUID().slice(0, 8)}`;
  return { shot: `${base}.jpg`, diff: `${base}-diff.jpg` };
}

const KEY_RE = /^site-watch\/([0-9a-f-]{36})\/([0-9a-f]{16})\/(baseline\.jpg|evidence\/[^/]+)$/;

/** Parse a key back into its parts; null for anything not written by this module. */
export function parseKey(key: string): { orgId: string; pageId: string; kind: "baseline" | "evidence" } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { orgId: m[1], pageId: m[2], kind: m[3] === "baseline.jpg" ? "baseline" : "evidence" };
}
