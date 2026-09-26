// T23: every external <script src> / <link rel="stylesheet" href"> on a page under public/ (served
// on the app origin, outside login, where the Supabase session cookie is readable by JS -- httpOnly
// false) must be version-pinned AND carry a matching integrity hash + crossorigin, so a compromised
// CDN file cannot silently execute in that context. Pure regex/attribute extraction, not a full HTML
// parser: adequate for the small, hand-authored files under public/ (no nested quotes-inside-quotes,
// no scripting that rewrites tags at parse time).

export interface ExternalResourceTag {
  kind: "script" | "link";
  url: string;
  crossorigin: string | null; // null = attribute absent
  integrity: string | null; // null = attribute absent; "" = present but empty
  raw: string;
}

function attr(tagText: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = re.exec(tagText);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : m[2];
}

export function isExternalUrl(url: string): boolean {
  return /^(https?:)?\/\//i.test(url.trim());
}

/** Every <script src=...> / <link rel="stylesheet" href=...> tag whose target is external. */
export function extractExternalTags(html: string): ExternalResourceTag[] {
  const tags: ExternalResourceTag[] = [];

  const scriptTagRe = /<script\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptTagRe.exec(html))) {
    const tagText = m[0];
    const src = attr(tagText, "src");
    if (!src || !isExternalUrl(src)) continue;
    tags.push({ kind: "script", url: src, crossorigin: attr(tagText, "crossorigin"), integrity: attr(tagText, "integrity"), raw: tagText });
  }

  const linkTagRe = /<link\b[^>]*>/gi;
  while ((m = linkTagRe.exec(html))) {
    const tagText = m[0];
    const rel = attr(tagText, "rel");
    if (!rel || rel.trim().toLowerCase() !== "stylesheet") continue;
    const href = attr(tagText, "href");
    if (!href || !isExternalUrl(href)) continue;
    tags.push({ kind: "link", url: href, crossorigin: attr(tagText, "crossorigin"), integrity: attr(tagText, "integrity"), raw: tagText });
  }

  return tags;
}

/** No "latest", no floating major -- the version segment must look like at least major.minor. */
export function isVersionPinned(url: string): boolean {
  if (/\/latest\//i.test(url) || /@latest\b/i.test(url)) return false;
  const atVersion = /@([^/]+)\//.exec(url); // jsdelivr: /npm/pkg@1.2.3/...
  if (atVersion) return /^\d+\.\d+(\.\d+)?/.test(atVersion[1]);
  const pathVersion = /\/libs\/[^/]+\/([^/]+)\//.exec(url); // cdnjs: /ajax/libs/pkg/1.2.3/...
  if (pathVersion) return /^\d+\.\d+(\.\d+)?/.test(pathVersion[1]);
  // A URL shape this function does not recognize cannot be confirmed pinned -- fail closed rather
  // than silently pass an unrecognized CDN convention that happens to float.
  return false;
}

export function hasValidIntegrityFormat(integrity: string | null): boolean {
  if (!integrity) return false;
  return /^sha(256|384|512)-[A-Za-z0-9+/]+=*(\s+sha(256|384|512)-[A-Za-z0-9+/]+=*)*$/.test(integrity.trim());
}

export interface SriViolation {
  url: string;
  reasons: string[];
}

/** Every reason a tag fails the SRI contract; [] if it's fully compliant. */
export function tagViolations(tag: ExternalResourceTag): string[] {
  const reasons: string[] = [];
  if (!isVersionPinned(tag.url)) reasons.push("URL is not version-pinned (no floating version / \"latest\")");
  if (!hasValidIntegrityFormat(tag.integrity)) reasons.push("missing or malformed integrity attribute (expected sha256/384/512-<base64>)");
  if (!tag.crossorigin) reasons.push("missing crossorigin attribute");
  return reasons;
}
