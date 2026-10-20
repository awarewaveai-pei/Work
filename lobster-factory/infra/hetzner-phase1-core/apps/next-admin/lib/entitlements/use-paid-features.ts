"use client";
// Greys a paid button the account has not bought (ADR 017 §4), from GET /api/entitlements/features (one request per
// mount; the server caches it 5 minutes). Loading, an error or a feature missing from the list = usable: the API still asks can().

import { useEffect, useState } from "react";

type Entry = { allowed: boolean; reason: string | null };

// No browser-side cache: one account's list must never reach the next account in the same tab (Codex 2026-10-19).
// The server keeps each account's list 5 minutes, so a fetch per mount is cheap.
function load(): Promise<Record<string, Entry> | null> {
  return fetch("/api/entitlements/features", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => (body?.list?.features as Record<string, Entry> | undefined) ?? null)
    .catch(() => null);
}

const WHY: Record<string, string> = { no_entitlement: "尚未開通此功能", no_credits: "點數不足" };

export function usePaidFeatures() {
  const [features, setFeatures] = useState<Record<string, Entry> | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((f) => { if (live) setFeatures(f); });
    return () => { live = false; };
  }, []);
  const canUse = (featureKey: string) => features?.[featureKey]?.allowed ?? true;
  /** Tooltip for a greyed button; undefined while it is usable. */
  const why = (featureKey: string) => {
    const entry = features?.[featureKey];
    return entry && !entry.allowed ? WHY[entry.reason ?? ""] ?? "目前無法使用" : undefined;
  };
  return { canUse, why };
}
