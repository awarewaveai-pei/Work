/**
 * decodeWpEntities — decode the HTML entities WordPress REST returns in term/post titles back to their
 * literal characters. Used so a category/pattern/post name the AI is shown matches the human-readable
 * name byte-for-byte, which is what publish-side resolveTermIds compares against (case-insensitive exact
 * match). The previous ad-hoc cleanup STRIPPED numeric entities (e.g. an en-dash "&#8211;" was deleted),
 * mangling names like "Health – Wellness" → "Health  Wellness" so the model's exact-match copy missed
 * the real term and a duplicate category got created — the precise bug feature #3 set out to prevent
 * (critic 2026-06-16). Decoding (not stripping) fixes it.
 *
 * Scope: the common named entities + numeric (decimal/hex) references. Not a full HTML5 entity table —
 * WP term/title text only emits this handful in practice.
 */
const NAMED: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
  "&apos;": "'", "&nbsp;": " ", "&hellip;": "…", "&mdash;": "—", "&ndash;": "–",
};

export function decodeWpEntities(input: string): string {
  if (!input) return "";
  let s = input;
  for (const [ent, ch] of Object.entries(NAMED)) s = s.split(ent).join(ch);
  s = s
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => safeFromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => safeFromCodePoint(parseInt(dec, 10)));
  // Strip any stray markup, collapse whitespace.
  return s.replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
}

/** String.fromCodePoint that never throws on a malformed/out-of-range value (returns ""). */
function safeFromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
  try { return String.fromCodePoint(cp); } catch { return ""; }
}
