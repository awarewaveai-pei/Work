/** Env keys used by tenant provisioning — set on Trigger worker / deploy sync. */

export function readTrim(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

export function requiredEnv(names: string[]): string | undefined {
  for (const n of names) {
    const v = readTrim(n);
    if (v) return v;
  }
  return undefined;
}

/** Strip `/api/v1` suffix so callers append REST paths predictably. */
export function normalizeServiceRoot(envName: string, fallback: string): string {
  let b = readTrim(envName) ?? fallback;
  b = b.replace(/\/$/, "");
  b = b.replace(/\/api\/v1\/?$/i, "").replace(/\/api\/?$/i, "");
  return b;
}
