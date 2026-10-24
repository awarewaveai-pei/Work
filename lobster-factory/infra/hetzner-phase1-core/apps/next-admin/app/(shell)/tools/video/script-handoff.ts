// A script made on the standalone ScriptForge page (/tools/script-forge) going to the video pipeline (/tools/video):
// the same payload ScriptForge hands VideoPipeline in-page (onSendToProduction / onSendToRemotion), carried across the
// navigation in sessionStorage and taken once, only within MAX_AGE_MS: the page navigates at once, so an older one was
// never picked up (a later login in the same tab must not receive it). Storage can be unavailable (private mode).
const KEY = "sf_to_video";
const MAX_AGE_MS = 60_000;

export type ScriptHandoff = { kind: "production" | "remotion"; payload: Record<string, unknown> };

/** true = stored; the caller may navigate. */
export function stashForVideo(h: ScriptHandoff): boolean {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...h, at: Date.now() })); return true; } catch { return false; }
}

/** The waiting hand-off, removed as it is read; null = none (or unreadable). */
export function takeForVideo(): ScriptHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const h = raw ? (JSON.parse(raw) as ScriptHandoff & { at?: unknown }) : null;
    if (!h || typeof h.at !== "number" || Date.now() - h.at > MAX_AGE_MS || Date.now() < h.at) return null;
    return (h.kind === "production" || h.kind === "remotion") && h.payload && typeof h.payload === "object" ? { kind: h.kind, payload: h.payload } : null;
  } catch { return null; }
}
