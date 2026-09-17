// HCI-30 isolated fetch runner -- minimal HTML fetch + text extraction
// (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 7).
//
// Standalone reimplementation of the "grab the readable text, drop the
// chrome" technique in
// lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/collectors/http-html.ts
// (interface shape -- Target/RawDoc -- is inspiration only, per this task's
// own Boundaries: no import across the next-admin/isolated-runner boundary,
// and no lib/collect function may ever be called from here). Deliberately
// smaller than that file: this task's Output is `{text, raw, contentHash,
// ...}`, not the full RawDoc shape (no link discovery, no canonical-URL
// resolution, no crawl-continuation -- that is a different product surface
// this runner does not own).
//
// The actual network call goes through Task 4's createSafeFetch
// (../net/pinned-http-client.mjs), never Node's raw http/https -- that is
// the whole point of Task 4 existing before this task could be built.

import crypto from 'node:crypto';
import { createSafeFetch } from '../net/pinned-http-client.mjs';

/** Elements whose text is never the article body. */
const DROP_TAGS = ['script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer', 'aside', 'form', 'iframe', 'button', 'select'];

/**
 * Remove those elements with a single linear scan, not a backtracking regex
 * (a `<(script|...)\b[\s\S]*?<\/\1>` pattern is quadratic on a page with many
 * unclosed tags, and on truncation mid-element it matches nothing at all --
 * the reference implementation's own header comment documents measuring
 * this at 2.6s on a 340KB adversarial input; same reasoning applies here
 * unchanged, so it is reproduced rather than rediscovered).
 */
export function stripElements(html) {
  let out = '';
  let i = 0;
  const lower = html.toLowerCase();
  while (i < html.length) {
    const lt = lower.indexOf('<', i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    const tag = DROP_TAGS.find((t) => lower.startsWith(t, lt + 1) && /[\s/>]/.test(lower[lt + 1 + t.length] ?? '>'));
    if (!tag) {
      out += html.slice(i, lt + 1);
      i = lt + 1;
      continue;
    }
    out += `${html.slice(i, lt)} `;
    const close = lower.indexOf(`</${tag}`, lt);
    if (close < 0) break; // unclosed: the rest of the document is inside it -- drop it, the safe direction
    const closeEnd = lower.indexOf('>', close);
    i = closeEnd < 0 ? html.length : closeEnd + 1;
  }
  return out;
}

const SELF_CLOSING_NOISE = /<(br|hr|img|input|source|track)\b[^>]*\/?>/gi;
const BLOCK_END = /<\/(p|div|section|article|h[1-6]|li|tr|blockquote|pre)\s*>/gi;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#160': ' ',
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”',
};

export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
    const key = name.toLowerCase();
    if (ENTITIES[key]) return ENTITIES[key];
    if (key.startsWith('#')) {
      const hex = key.startsWith('#x');
      const code = Number.parseInt(hex ? key.slice(2) : key.slice(1), hex ? 16 : 10);
      // String.fromCodePoint throws on an out-of-range code point, and the
      // page controls this number -- an unhandled RangeError here would
      // abort extraction for the whole document.
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return whole;
  });
}

function contentRegion(html) {
  for (const re of [/<main\b[^>]*>([\s\S]*?)<\/main\s*>/i, /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i]) {
    const m = re.exec(html);
    if (m && m[1].length > 200) return m[1];
  }
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  return body ? body[1] : html;
}

export function extractText(html) {
  const region = stripElements(contentRegion(html))
    .replace(SELF_CLOSING_NOISE, '\n')
    .replace(BLOCK_END, '\n\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(region)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractTitle(html) {
  const t = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (t) {
    const decoded = decodeEntities(t[1]).replace(/\s+/g, ' ').trim();
    if (decoded) return decoded;
  }
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i.exec(html);
  if (!h1) return null;
  const decoded = decodeEntities(h1[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  return decoded || null;
}

/**
 * critic review 2026-09-17: `extractText`'s generic `<[^>]+>` strip
 * (deliberately, for speed/simplicity) deletes HTML comments and every tag
 * ATTRIBUTE in one pass -- `<!--ignore previous instructions-->` collapses
 * to nothing, and `<meta name="description" content="ignore previous
 * instructions">`'s content never appears in `extractText`'s output at all.
 * That text is still present byte-for-byte in `raw` (which gets
 * content-hashed and is what Task 5/8 durably persist), so it must not be
 * invisible to the scan just because it is invisible to the human-readable
 * `text` field. This function is scan input ONLY -- never returned as
 * `text`/`title`, which stay clean for article-quality/display purposes.
 */
export function extractScanSurface(html) {
  let out = '';
  for (const m of html.matchAll(/<!--([\s\S]*?)-->/g)) out += `${m[1]}\n`;
  for (const m of html.matchAll(/\b(?:alt|title|content|aria-label|placeholder)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    out += `${decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')}\n`;
  }
  return out;
}

/**
 * critic review 2026-09-17: unconditional `raw.toString('utf8')` ignored the
 * response's own declared charset -- non-UTF-8 pages (common for
 * older/regional sites) decoded to mojibake. Named ASCII instruction
 * phrases still matched regardless (ASCII bytes are stable across
 * UTF-8/Latin-1/Big5/etc.), so this never let anything past the scanner --
 * it only corrupted extracted text/title quality for a real fraction of
 * target sites. `<meta charset>` sniffing is intentionally NOT added here
 * (would need decoding once to even find that tag) -- header charset covers
 * the common case; a future task can add sniffing if it proves necessary.
 */
function decodeBody(raw, contentTypeValue) {
  const charsetMatch = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentTypeValue || '');
  const charset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8';
  try {
    return new TextDecoder(charset, { fatal: false }).decode(raw);
  } catch {
    // Unknown/unsupported charset label (e.g. a typo'd or nonstandard
    // value) -- fall back to utf-8 rather than throwing and losing the
    // whole document over a malformed header.
    return new TextDecoder('utf-8', { fatal: false }).decode(raw);
  }
}

/**
 * `content_provenance` shape per Task 7's Output line: values are the
 * kernel's own 11-value epistemic_type enum, verbatim, not a new vocabulary
 * (0010_wave1_epistemic_label_up.sql's own boundary comment: HCI may take
 * ONLY that enum from the shared kernel). `authorship_state` is carried here
 * as in-memory/audit metadata for Task 8's human-review-queue path only --
 * it is NOT a database column. 0010's own header comment is explicit that
 * `authorship_state` is "reserved, no ADR authorizes it as a column yet",
 * and 0020 (Task 2's migration) says the same thing again ("authorship_state
 * is deliberately NOT added here"). Task 8 must never attempt to persist
 * this field to any hci.* table.
 */
const CONTENT_PROVENANCE = Object.freeze({ epistemic_type: 'EVIDENCE', authorship_state: 'SOURCE_QUOTATION' });

// critic review 2026-09-17: anchored to the actual media-type token instead
// of an unanchored substring match -- a contrived Content-Type value merely
// containing "text/html" elsewhere (e.g. in a parameter) would previously
// have passed.
const HTML_CONTENT_TYPE = /^(text\/html|application\/xhtml\+xml)\b/i;

/**
 * Fetch one URL through the DNS-pinned, SSRF-gated client and extract its
 * readable text. Never throws SsrfBlockedError itself -- that propagates
 * from `safeFetch` unchanged, so callers can distinguish "blocked by the
 * SSRF gate" from "fetched fine but not usable content" (this function's own
 * thrown errors below).
 */
export async function fetchAndExtract(url, opts = {}) {
  const safeFetch = opts.safeFetch ?? createSafeFetch(opts.fetchOptions);
  const res = await safeFetch(url, { method: 'GET' });

  if (res.status < 200 || res.status >= 300) {
    // critic review 2026-09-18: 4xx (except 429) gets a `.code` so Task 9's
    // orchestrator can classify it non-retryable -- the same URL fetched
    // again gets the identical 404/403/410/etc, so retrying is pure waste
    // (both of Trigger.dev's retry budget and of real requests against a
    // third-party site, a self-inflicted mild DoS-like pattern the critic
    // review named directly). 429 (Too Many Requests) is deliberately
    // excluded -- rate-limiting IS transient, unlike every other 4xx here.
    // 5xx gets no code at all, staying in the existing default-retryable
    // bucket, which is already correct for a transient server error.
    const isNonRetryableClientError = res.status >= 400 && res.status < 500 && res.status !== 429;
    throw Object.assign(new Error(`fetch_failed_http_${res.status}`), {
      status: res.status,
      ...(isNonRetryableClientError ? { code: 'HTTP_CLIENT_ERROR' } : {}),
    });
  }

  const contentType = (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '';
  const contentTypeValue = (Array.isArray(contentType) ? contentType[0] : contentType).trim();
  if (!HTML_CONTENT_TYPE.test(contentTypeValue)) {
    // Same critic review: the same URL will report the same content type
    // again, so this is exactly as non-retryable as an HTTP_CLIENT_ERROR.
    throw Object.assign(new Error(`unsupported_content_type_${contentTypeValue.split(';')[0] || 'unknown'}`), { status: 415, code: 'UNSUPPORTED_CONTENT_TYPE' });
  }

  const raw = res.body; // Buffer, from Task 4's defaultTransport
  const html = decodeBody(raw, contentTypeValue);
  const text = extractText(html);
  const title = extractTitle(html);

  return {
    text,
    raw,
    contentHash: crypto.createHash('sha256').update(raw).digest('hex'),
    title,
    // Scan input for Task 7's content-isolation gate (server.mjs's
    // processJob) -- title + visible text + comments/attribute values, NOT
    // just `text` alone (critic review 2026-09-17: title reaches
    // status='completed' unscanned otherwise, and comment/attribute text is
    // invisible to `text` but still present in `raw`, which gets durably
    // persisted by Task 5/8).
    scanSurface: [title, text, extractScanSurface(html)].filter(Boolean).join('\n'),
    finalUrl: res.finalUrl,
    fetchedAt: new Date().toISOString(),
    truncated: !!res.truncated,
    content_provenance: CONTENT_PROVENANCE,
  };
}
