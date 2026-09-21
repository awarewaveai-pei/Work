// C1 pages. Slice 1: the client's site_url only. page_id = first 16 hex of sha256(canonical URL).
import { createHash } from "node:crypto";

/**
 * Lowercase scheme/host (URL does), default port dropped (URL does), no query, no fragment, no
 * trailing slash. Query strings are dropped on purpose: they carry tracking/session tokens (C12).
 * Returns null for anything that is not an absolute http(s) URL.
 */
export function canonicalUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const path = u.pathname.replace(/\/+$/, "");
  return `${u.protocol}//${u.host}${path}`;
}

export function pageIdFor(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export interface WatchedPage {
  pageId: string;
  url: string;
}

/** The pages a target checks. Slice 1: the home page from client_config.site_url, or none. */
export function pagesForSiteUrl(siteUrl: unknown): WatchedPage[] {
  if (typeof siteUrl !== "string") return [];
  const url = canonicalUrl(siteUrl);
  return url ? [{ pageId: pageIdFor(url), url }] : [];
}
