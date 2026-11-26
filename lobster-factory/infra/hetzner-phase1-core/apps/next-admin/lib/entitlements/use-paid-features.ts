"use client";
// Greys a paid button the account has not bought (ADR 017 §4), from GET /api/entitlements/features (one request per
// mount and per client change; the server caches it 5 minutes). Loading, an error or a feature missing from the list =
// usable: the API still asks can(). Inside a ClientContextProvider with a client chosen (ADR 020), the list is that
// client's (`?org=`, checked server-side by actorFor); without a provider or a choice, the caller's own account as before.

import { useEffect, useState } from "react";
import { useClientContextState } from "@/lib/client-context/use-client-context";
import { rightLabel, type RightSource } from "./right-label";

type Entry = { allowed: boolean; reason: string | null; source?: RightSource };

// No browser-side cache: one account's list must never reach the next account in the same tab (Codex 2026-10-19).
// The server keeps each account's list 5 minutes, so a fetch per mount is cheap.
function load(org: string | null): Promise<Record<string, Entry> | null> {
  const url = org ? `/api/entitlements/features?org=${encodeURIComponent(org)}` : "/api/entitlements/features";
  return fetch(url, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => (body?.list?.features as Record<string, Entry> | undefined) ?? null)
    .catch(() => null);
}

export function usePaidFeatures() {
  const org = useClientContextState()?.org ?? null;
  const [features, setFeatures] = useState<Record<string, Entry> | null>(null);
  useEffect(() => {
    let live = true;
    setFeatures(null);   // never show the previous client's list while the next one loads
    void load(org).then((f) => { if (live) setFeatures(f); });
    // Back from paying on aware-wave.com (the shop link opens in this tab): the browser may restore this page from its
    // back-forward cache without mounting it again, so read the list once more (U28; the server dropped its copy).
    const onReturn = (event: PageTransitionEvent) => { if (event.persisted) void load(org).then((f) => { if (live) setFeatures(f); }); };
    window.addEventListener("pageshow", onReturn);
    return () => { live = false; window.removeEventListener("pageshow", onReturn); };
  }, [org]);
  const canUse = (featureKey: string) => features?.[featureKey]?.allowed ?? true;
  /** Held per a loaded list: false while loading, on an error or for a key the list lacks. A screen that STATES what the
   *  account holds (the door menu) uses this; a button keeps canUse, since the API asks can() anyway. */
  const holds = (featureKey: string) => features?.[featureKey]?.allowed === true;
  /** Tooltip for a greyed button; undefined while it is usable. */
  const why = (featureKey: string) => {
    const entry = features?.[featureKey];
    if (!entry || entry.allowed) return undefined;
    // Tooltip keeps today's wording ("點數不足" without the full stop); the full sentence is for screens that have numbers.
    const text = rightLabel({ entry, source: entry.source ?? null, door: "open", viewer: "member", mode: "enforce" }).text;
    return text ? text.replace(/。$/, "") : "目前無法使用";
  };
  return { canUse, holds, why };
}
