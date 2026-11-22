// 立即更新 state from Pending.requestedAt. A request the host has not answered for STALE_MINUTES stops locking the button.
import type { Pending } from "@/lib/systems/store";

export const STALE_MINUTES = 15;
export type RefreshState = { kind: "idle" } | { kind: "waiting"; minutes: number } | { kind: "stale"; minutes: number };

export function refreshState(p: Pick<Pending, "refresh" | "requestedAt">, now: number): RefreshState {
  if (!p.refresh) return { kind: "idle" };
  const at = p.requestedAt ? Date.parse(p.requestedAt) : NaN;
  const minutes = Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 60000)) : 0;
  return minutes >= STALE_MINUTES ? { kind: "stale", minutes } : { kind: "waiting", minutes };
}
