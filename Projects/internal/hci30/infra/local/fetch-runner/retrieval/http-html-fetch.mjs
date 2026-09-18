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
      // Surrogate range too: fromCodePoint(0xD800) does not throw, it yields a
      // lone surrogate that Postgres jsonb rejects (evidence payload write).
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
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
 * Title + readable text + the scan surface, from already-decoded HTML. Callers
 * go through extractFromBytes below, so capture and promotion-time re-scan see
 * the identical surface.
 */
export function extractReadable(html) {
  const text = extractText(html);
  const title = extractTitle(html);
  return { text, title, scanSurface: [title, text, extractScanSurface(html)].filter(Boolean).join('\n') };
}

/** WHATWG canonical encoding name for a label, or null if unknown/unsupported. */
function resolveEncoding(label) {
  try {
    return new TextDecoder(label.trim()).encoding;
  } catch {
    return null;
  }
}

/**
 * Charset label from a real <meta charset> attribute or an
 * http-equiv="content-type" content value -- never from some other meta's
 * attribute text (critic review 2026-09-19: a bare regex matched
 * `<meta name="description" content="... charset=utf-16 ...">`).
 */
function metaCharsetLabel(prefix) {
  for (const tag of prefix.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = {};
    for (const a of tag[1].matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    }
    if (attrs.charset) return attrs.charset;
    if ((attrs['http-equiv'] || '').trim().toLowerCase() === 'content-type') {
      const m = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(attrs.content || '');
      if (m) return m[1];
    }
  }
  return null;
}

/**
 * Encoding per WHATWG order: BOM > Content-Type header > <meta> prescan
 * (first 1024 bytes, read as latin1 so the ASCII tag is findable before the
 * real encoding is known) > utf-8. Meta-declared utf-16 means utf-8 and
 * x-user-defined means windows-1252 (spec). 'replacement' (e.g. iso-2022-kr)
 * would decode the whole page to U+FFFD, so it is never used. The meta
 * prescan exists because stored snapshots are raw bytes with no headers.
 */
export function detectHtmlEncoding(raw, contentTypeValue = '') {
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  const header = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentTypeValue || '');
  const fromHeader = header && resolveEncoding(header[1]);
  if (fromHeader && fromHeader !== 'replacement') return fromHeader;
  const metaLabel = metaCharsetLabel(bytes.subarray(0, 1024).toString('latin1'));
  let fromMeta = metaLabel && resolveEncoding(metaLabel);
  if (fromMeta === 'utf-16le' || fromMeta === 'utf-16be') fromMeta = 'utf-8';
  if (fromMeta === 'x-user-defined') fromMeta = 'windows-1252';
  if (fromMeta && fromMeta !== 'replacement') return fromMeta;
  return 'utf-8';
}

export function decodeHtmlBytes(raw, contentTypeValue = '') {
  return new TextDecoder(detectHtmlEncoding(raw, contentTypeValue)).decode(raw);
}

/**
 * Bytes -> {text, title, scanSurface, encoding}. The ONE entry point for both
 * live capture (fetchAndExtract) and stored-snapshot re-extraction.
 *
 * Fail-closed scan (critic review 2026-09-19, Major): the chosen encoding is
 * page-controlled (BOM/header/meta). Under utf-16 or iso-2022-jp, ASCII
 * instruction bytes decode to unrelated characters and slip past the scanner
 * while staying in the stored raw bytes. The utf-8 reading of the same bytes
 * is therefore always scanned too; a hit in either reading flags the page.
 */
export function extractFromBytes(raw, contentTypeValue = '') {
  const encoding = detectHtmlEncoding(raw, contentTypeValue);
  const readable = extractReadable(new TextDecoder(encoding).decode(raw));
  const scanSurface = encoding === 'utf-8'
    ? readable.scanSurface
    : `${readable.scanSurface}\n${extractReadable(new TextDecoder('utf-8').decode(raw)).scanSurface}`;
  return { ...readable, scanSurface, encoding };
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
  // scanSurface = title + visible text + comments/attribute values, NOT `text`
  // alone (critic review 2026-09-17: title reached status='completed'
  // unscanned otherwise; comment/attribute text is invisible to `text` but
  // still present in `raw`, which gets durably persisted by Task 5/8).
  const { text, title, scanSurface } = extractFromBytes(raw, contentTypeValue);

  return {
    text,
    raw,
    contentHash: crypto.createHash('sha256').update(raw).digest('hex'),
    title,
    scanSurface,
    finalUrl: res.finalUrl,
    fetchedAt: new Date().toISOString(),
    truncated: !!res.truncated,
    content_provenance: CONTENT_PROVENANCE,
  };
}
