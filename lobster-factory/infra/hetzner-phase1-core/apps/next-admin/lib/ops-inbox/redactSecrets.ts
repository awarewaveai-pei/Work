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

export function redactSecrets<T>(input: T): T {
  return walk(input) as T;
}

function walk(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERNS.some((p) => p.test(k))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = walk(val);
      }
    }
    return out;
  }
  return v;
}
