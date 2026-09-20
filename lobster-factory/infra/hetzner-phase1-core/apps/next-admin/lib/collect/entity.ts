// Does this text talk about THIS entity? The one question collection never asked.
//
// WHY THIS EXISTS: quality.ts grades whether we extracted the article or the chrome around it.
// Nothing graded whether the article is about the thing the operator searched for. A run for
// "Theo Farrell" stored 159 pages of a bookshop's browse catalogue (run manual-2026-09-20051728):
// every one of them had plenty of text, fine density, and no 404 wording, so every gate passed.
// Relevance is a SEPARATE axis and needs its own answer.
//
// PURE FUNCTIONS ONLY. No fetch, no db, no env. The gate that uses this lives in the orchestrator
// (lib/collect/relevance.ts) for the same reason grading does: a block that judges its own
// relevance judges itself generously.
//
// TOKEN-WINDOW MATCHING, NOT VARIANT ENUMERATION. A list of spellings ("Theo Farrell", "T. Farrell",
// "Farrell, Theo") is a list somebody has to keep extending, and the miss is silent — the document
// is simply never collected and nothing says why. Instead: split the name into significant tokens
// and require them to co-occur inside a short window. "Theo Gerard Farrell", "Farrell, Theo G." and
// "Prof Farrell (Theo)" all match without anybody enumerating them, and "Theo Smith … Bob Farrell"
// three paragraphs apart does not.

export type EntityKind = "person" | "company" | "event";

/** What the operator asserted they are researching. Everything here comes from the source config. */
export interface EntityRef {
  name: string;
  kind: EntityKind;
  /**
   * Disambiguation terms: an affiliation, a role, a place, a date. "Theo Farrell" alone matches a
   * vice-chancellor, an Instagram account and a bookshop's author page for a different Farrell.
   */
  anchors: string[];
  /** Other names for the SAME entity (maiden name, English/Chinese name, former company name). */
  aliases: string[];
  /**
   * Anchors required, not merely preferred. Default ON whenever anchors are given: an operator who
   * bothered to type "La Trobe" is telling us which Theo Farrell they mean, and storing the other
   * one anyway is the failure they were trying to prevent.
   */
  strictAnchors: boolean;
}

/** Honorifics and name particles that must never be the thing a match hinges on. */
const DROPPED_TOKENS = new Set([
  "dr", "prof", "professor", "mr", "mrs", "ms", "miss", "sir", "dame", "rev", "hon",
  "the", "of", "and", "de", "da", "van", "von", "del", "della", "bin", "ibn",
  "教授", "博士", "先生", "女士", "小姐",
]);

/**
 * Legal-form suffixes. "AwareWave Ltd" on one page and "AwareWave" on the next are one company, and
 * requiring the suffix would drop every news article that omits it — which is most of them.
 */
const COMPANY_SUFFIXES = [
  "股份有限公司", "有限公司", "企業社", "商行", "工作室",
  "corporation", "incorporated", "limited", "company",
  "corp", "inc", "llc", "llp", "ltd", "plc", "gmbh", "ag", "sa", "bv", "nv", "pty", "co",
  "株式会社", "有限会社",
];

const CJK_RE = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;

/**
 * Fold everything that varies between two spellings of the same string but changes no meaning:
 * width (NFKC turns ｆｕｌｌｗｉｄｔｈ into ascii), case, and every kind of dash/quote/punctuation.
 *
 * Punctuation becomes a SPACE rather than being deleted: deleting it turns "Farrell,Theo" into
 * "farrelltheo", one token that matches nothing, while "farrell theo" matches correctly.
 */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐-―‘’“”]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasCjk(s: string): boolean {
  return CJK_RE.test(s);
}

/**
 * The parts of a name a match may depend on.
 *
 * CJK names have no spaces, so they stay whole — splitting 王大明 into characters would match any
 * page containing 王 and 明 anywhere. A CJK string that DOES contain spaces (a transliteration, a
 * mixed name) is still split, because then the spaces are real.
 */
export function significantTokens(name: string, kind: EntityKind): string[] {
  const normalized = normalizeForMatch(name);
  if (!normalized) return [];
  if (hasCjk(normalized) && !normalized.includes(" ")) return [normalized];

  let tokens = normalized.split(" ").filter((t) => t.length >= 2 && !DROPPED_TOKENS.has(t));
  if (kind === "company") {
    const stripped = tokens.filter((t) => !COMPANY_SUFFIXES.includes(t));
    // Only strip when something survives: a company literally called "Limited" would otherwise
    // become an entity with no tokens at all, which matches every page ever written.
    if (stripped.length) tokens = stripped;
  }
  // Every token dropped as an honorific means the name was ONLY honorifics — fall back to the raw
  // split rather than returning nothing, because nothing means "matches everything" downstream.
  if (!tokens.length) tokens = normalized.split(" ").filter(Boolean);
  return tokens;
}

/**
 * How many of the tokens must land inside the window.
 *
 * A person or a company is a fixed name: all of it, or it is a different entity (the whole point of
 * the exercise). An event is a DESCRIPTION people phrase differently — "2019 Christchurch mosque
 * attack" vs "the Christchurch attacks" — so requiring every token would collect nothing.
 */
export function requiredTokenCount(tokens: string[], kind: EntityKind): number {
  if (kind !== "event") return tokens.length;
  // Clamped to what actually exists. Without the clamp a ONE-token phrase requires two tokens and
  // can therefore never match — and assessEntity judges every ANCHOR as a phrase, so a single-word
  // anchor ("Wollongong", "校長") would silently never hit, which under the default strict mode
  // rejects every correct page as entity_anchor_missing. Found by the cross-model oracle,
  // 2026-09-20; masked in the live test because both of its anchors happened to be two words.
  return Math.min(tokens.length, Math.max(2, Math.ceil(tokens.length * 0.6)));
}

export interface MentionHit {
  /** How many separate windows in the text satisfied the token requirement. */
  count: number;
  /** Offset in the NORMALIZED text of the first satisfying window; -1 when there is none. */
  firstIndex: number;
}

/**
 * Find windows of `normalizedText` containing at least `required` of `tokens`.
 *
 * The window is sized from the name itself plus slack, so a long name gets a long window and a
 * two-token name does not accidentally match across half a paragraph.
 */
export function findTokenWindows(normalizedText: string, tokens: string[], required: number): MentionHit {
  if (!tokens.length || !normalizedText || required <= 0) return { count: 0, firstIndex: -1 };

  const windowSize = tokens.reduce((n, t) => n + t.length, 0) + 30;
  // Word-boundary positions per token. CJK has no word boundaries, so those match as substrings —
  // correct for CJK, and never applied to latin text where it would match "art" inside "start".
  const positions = tokens.map((t) => occurrences(normalizedText, t));
  if (positions.filter((p) => p.length > 0).length < required) return { count: 0, firstIndex: -1 };

  // Anchor on the RAREST token that actually occurs: fewest candidate windows to test, and it is
  // the most distinctive part of the name (a surname beats a given name half the country shares).
  let anchorIdx = -1;
  for (let i = 0; i < positions.length; i++) {
    if (!positions[i].length) continue;
    if (anchorIdx < 0 || positions[i].length < positions[anchorIdx].length) anchorIdx = i;
  }
  if (anchorIdx < 0) return { count: 0, firstIndex: -1 };

  let count = 0;
  let firstIndex = -1;
  let lastWindowEnd = -1;
  for (const at of positions[anchorIdx]) {
    const from = Math.max(0, at - windowSize);
    const to = at + tokens[anchorIdx].length + windowSize;
    // Windows that overlap a window already counted are the same mention seen twice; counting them
    // separately would make one sentence look like sustained coverage of the entity.
    if (at <= lastWindowEnd) continue;
    const present = positions.reduce((n, list) => n + (list.some((p) => p >= from && p <= to) ? 1 : 0), 0);
    if (present >= required) {
      count++;
      if (firstIndex < 0) firstIndex = from;
      lastWindowEnd = to;
    }
  }
  return { count, firstIndex };
}

/** Every start offset of `needle` in `hay`, honouring word boundaries for non-CJK needles. */
function occurrences(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  const cjk = hasCjk(needle);
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    if (cjk || isWordBounded(hay, at, needle.length)) out.push(at);
    from = at + 1;
    // A pathological page (a keyword-stuffed SEO farm) can contain a token tens of thousands of
    // times; the answer to "is this about the entity" does not improve after the first few hundred.
    if (out.length >= 500) break;
  }
  return out;
}

function isWordBounded(hay: string, at: number, len: number): boolean {
  const before = at === 0 ? " " : hay[at - 1];
  const after = at + len >= hay.length ? " " : hay[at + len];
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
}

export interface EntityMatch {
  /** The name (or one of its aliases) is present. */
  nameHit: boolean;
  nameHits: number;
  /** The name is in the TITLE — the strongest single signal that the page is about the entity. */
  titleHit: boolean;
  /** Extracted text length, so one mention in a short notice is told apart from one in a long report. */
  textLength: number;
  /**
   * Where the first mention sits, as a fraction of the whole text (0 = the very top, 1 = the end).
   * -1 when there is no mention. A document that is ABOUT somebody names them near the top; one
   * that merely mentions them gets to them halfway down.
   */
  firstMentionAt: number;
  /** Which anchors appeared. Empty when none were configured OR none appeared — `anchorsAsked` tells them apart. */
  anchorsHit: string[];
  anchorsAsked: number;
  /** Text around the first mention, for a human deciding whether the collection is working. */
  snippet: string | null;
}

/**
 * Assess one document against one entity. Decides nothing — lib/collect/relevance.ts turns this
 * into a verdict, so that the policy ("strict anchors means refuse") lives in exactly one place.
 *
 * `title` is scanned as well as the body because a bare profile page ("Theo Farrell | About") can
 * carry the name once, in the title, and have it appear nowhere in the extracted text.
 */
export function assessEntity(text: string, title: string | null, ref: EntityRef): EntityMatch {
  const haystack = normalizeForMatch(`${title ?? ""}\n${text}`);
  const names = [ref.name, ...ref.aliases].map((n) => n.trim()).filter(Boolean);

  const titleHay = normalizeForMatch(title ?? "");
  let nameHits = 0;
  let firstIndex = -1;
  let titleHit = false;
  for (const name of names) {
    const tokens = significantTokens(name, ref.kind);
    const required = requiredTokenCount(tokens, ref.kind);
    const hit = findTokenWindows(haystack, tokens, required);
    nameHits += hit.count;
    if (hit.firstIndex >= 0 && (firstIndex < 0 || hit.firstIndex < firstIndex)) firstIndex = hit.firstIndex;
    // Scanned separately from the body: the title is the page declaring what it is about, which is
    // a different claim from the name appearing somewhere in 50KB of prose.
    if (findTokenWindows(titleHay, tokens, required).count > 0) titleHit = true;
  }

  const anchorsHit = ref.anchors
    .map((a) => a.trim())
    .filter(Boolean)
    .filter((a) => {
      const tokens = significantTokens(a, "event"); // an anchor is a phrase, judged like one
      return findTokenWindows(haystack, tokens, requiredTokenCount(tokens, "event")).count > 0;
    });

  return {
    nameHit: nameHits > 0,
    nameHits,
    titleHit,
    textLength: text.length,
    anchorsHit,
    anchorsAsked: ref.anchors.filter((a) => a.trim()).length,
    firstMentionAt: firstIndex >= 0 && haystack.length > 0 ? firstIndex / haystack.length : -1,
    snippet: firstIndex >= 0 ? snippetAt(haystack, firstIndex) : null,
  };
}

/**
 * A readable fragment from the NORMALIZED text — punctuation-free and lowercase, which is ugly but
 * honest: it is exactly what the matcher saw. Rebuilding an offset into the original string is a
 * second index to keep correct, and a wrong one would quote the document saying something it does
 * not say.
 */
export function snippetAt(normalizedText: string, index: number, length = 180): string {
  const from = Math.max(0, index - 20);
  return normalizedText.slice(from, from + length).trim();
}

/** Parse the operator's comma/newline separated input. Shared by the block and its tests. */
export function parseTermList(value: unknown, limit = 12): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return [
    ...new Set(
      value
        .split(/[,，;；\n]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

export function isEntityKind(v: unknown): v is EntityKind {
  return v === "person" || v === "company" || v === "event";
}

/**
 * Rebuild the EntityRef a Target is carrying. Targets cross process boundaries (the frontier is
 * persisted as JSON and resumed by a later run), so meta arrives as unknown and must be re-checked
 * rather than cast — a resumed run with a half-written ref would otherwise silently match nothing.
 */
export function entityRefOf(meta: Record<string, unknown> | undefined): EntityRef | null {
  const raw = meta?.entity;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  if (!isEntityKind(r.kind)) return null;
  return {
    name: r.name,
    kind: r.kind,
    anchors: Array.isArray(r.anchors) ? r.anchors.filter((a): a is string => typeof a === "string") : [],
    aliases: Array.isArray(r.aliases) ? r.aliases.filter((a): a is string => typeof a === "string") : [],
    strictAnchors: r.strictAnchors !== false,
  };
}
