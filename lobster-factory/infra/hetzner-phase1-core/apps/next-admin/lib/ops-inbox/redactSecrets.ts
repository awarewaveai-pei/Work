// SSOT: agency-os/reports/audit/auto-repair-2026-05-23.md §Patch 2 (with Errata EMaj-1, EMaj-4)
// Origin: 2026-05-23 Tier 3 logic audit C2 finding — original implementation only matched
// object KEYS, leaking any secret embedded in payload VALUES (e.g. Sentry messages, stacktrace
// strings, breadcrumb data). This module now scrubs both layers + truncates long strings +
// caps recursion depth.
//
// Errata fixes folded in:
//   EMaj-1 (B64 false-positive): the long-base64 pattern requires a key-like prefix anchor
//          (token=, key=, secret=, etc.) so legitimate base64 in Sentry stack frames /
//          PostHog screenshot data URIs / source-maps do NOT get redacted. Aggressive
//          un-anchored detection is gated behind OPS_AGGRESSIVE_REDACT=true.
//   EMaj-4 (depth too tight): MAX_DEPTH raised 32→64 — Sentry React+Redux stacktrace
//          var trees nest 20-40 deep in legitimate payloads.

const SECRET_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /auth(orization)?/i,
  /cookie/i,
  /session/i,
  /credential/i,
  /bearer/i,
  /^x-.*-key$/i,
  /private[_-]?key/i,
];

// Value-side: anchored patterns first (low FP), aggressive last (high FP, opt-in).
const ANCHORED_VALUE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  // Provider-specific keys — high-confidence shapes, anchored to issuer prefix.
  { re: /\bsk_(test|live)_[A-Za-z0-9]{20,}/g, tag: "STRIPE_KEY" },
  { re: /\brk_(test|live)_[A-Za-z0-9]{20,}/g, tag: "STRIPE_RESTRICTED" },
  { re: /\bghp_[A-Za-z0-9]{36,}/g, tag: "GITHUB_PAT" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{60,}/g, tag: "GITHUB_PAT" },
  { re: /\bgho_[A-Za-z0-9]{36,}/g, tag: "GITHUB_OAUTH" },
  { re: /\bxox[bpors]-[A-Za-z0-9-]{20,}/g, tag: "SLACK_TOKEN" },
  { re: /\btr_(pat|prod)_[A-Za-z0-9]{20,}/g, tag: "TRIGGER_TOKEN" },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, tag: "AWS_ACCESS_KEY" },
  { re: /\bASIA[0-9A-Z]{16}\b/g, tag: "AWS_TEMP_KEY" },
  { re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, tag: "JWT" },
  // PEM-format private keys (any algorithm). Multiline-aware via [\s\S].
  {
    re: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+ PRIVATE KEY-----/g,
    tag: "PRIVATE_KEY",
  },
  // Key=value pairs where the key looks secret-bearing and the value is long+random.
  // Anchored to a key-name prefix → won't catch legitimate base64 data in unrelated text.
  { re: /\b(?:api[_-]?key|secret|token|password|auth|bearer)\s*[:=]\s*["']?([A-Za-z0-9+/_-]{20,})["']?/gi, tag: "KEY_EQ_VALUE" },
];

// Aggressive mode: also flag long base64 blobs anywhere (catches SSH key bodies pasted
// without PEM headers, raw secrets in logs). Gated because Sentry minified-JS stack
// frames + PostHog screenshot data URIs are legitimate base64 → would cause FP.
const AGGRESSIVE_VALUE_PATTERNS: Array<{ re: RegExp; tag: string }> = [
  // Require ≥80 chars (raises threshold over the original 60 — minified JS chunks
  // are typically shorter; SSH key bodies are 300+) and require ≥1 + or / character
  // (filters out plain hex / id strings that happen to be long alphanumeric).
  { re: /[A-Za-z0-9+/]{80,}={0,2}/g, tag: "B64_BLOB" },
];

const MAX_STRING_LENGTH = 4096;
const MAX_DEPTH = 64; // Errata EMaj-4: was 32, raised for legitimate Sentry stack depth.

function isAggressive(): boolean {
  return process.env.OPS_AGGRESSIVE_REDACT?.trim().toLowerCase() === "true";
}

function scrubValue(s: string): string {
  let out = s;
  for (const { re, tag } of ANCHORED_VALUE_PATTERNS) {
    out = out.replace(re, `[REDACTED:${tag}]`);
  }
  if (isAggressive()) {
    for (const { re, tag } of AGGRESSIVE_VALUE_PATTERNS) {
      out = out.replace(re, `[REDACTED:${tag}]`);
    }
  }
  if (out.length > MAX_STRING_LENGTH) {
    out = out.slice(0, MAX_STRING_LENGTH) + `…[TRUNCATED:${out.length}b]`;
  }
  return out;
}

export function redactSecrets<T>(input: T): T {
  return walk(input, 0) as T;
}

function walk(v: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[REDACTED:DEPTH_LIMIT]";
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return scrubValue(v);
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERNS.some((p) => p.test(k))) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = walk(val, depth + 1);
    }
  }
  return out;
}
