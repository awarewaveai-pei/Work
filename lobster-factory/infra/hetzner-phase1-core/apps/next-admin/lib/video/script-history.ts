// Script history handoff (video-unify-plan-20261116 §2 D16, §4 U11 commit 1). ScriptForge keeps its history in the
// browser: localStorage "sf_history", newest first, at most 50, id = Date.now() (app/(shell)/tools/video/ScriptForge.tsx:30).
// The staff door's copy moves to the video host when staff open the workbench from the old entry: the staff page opens
// video.<base>/handoff and posts its copy to that window; the handoff page takes it only from a staff host (STAFF_HOSTS)
// and merges it into the video host's own copy. Nothing is deleted on either side.
export const SF_HISTORY_KEY = "sf_history";
export const SF_HISTORY_MAX = 50;
export const HANDOFF_CHANNEL = "sf-history:v1";

export type ScriptHistoryEntry = { id: number | string; [field: string]: unknown };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
type Message = { origin: string; data: unknown; source: unknown };

const hostOf = (origin: string): string | null => {
  try { return new URL(origin).host.toLowerCase(); } catch { return null; }
};

/** The entries of a history list that ScriptForge can show (an object with an id); anything else is dropped. */
export function validEntries(value: unknown): ScriptHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((e): e is ScriptHistoryEntry => !!e && typeof e === "object" && !Array.isArray(e)
    && ((typeof e.id === "number" && Number.isFinite(e.id)) || (typeof e.id === "string" && e.id !== ""))).slice(0, SF_HISTORY_MAX);
}

export function readScriptHistory(storage: Storage): ScriptHistoryEntry[] {
  try { return validEntries(JSON.parse(storage.getItem(SF_HISTORY_KEY) || "[]")); } catch { return []; }
}

/** own ∪ incoming by id (own wins), newest first (id is the save time), at most 50. */
export function mergeScriptHistory(own: ScriptHistoryEntry[], incoming: ScriptHistoryEntry[]): ScriptHistoryEntry[] {
  const seen = new Set(own.map((e) => String(e.id)));
  const added = incoming.filter((e) => !seen.has(String(e.id)) && !!seen.add(String(e.id)));
  const time = (e: ScriptHistoryEntry) => (typeof e.id === "number" ? e.id : Number(e.id) || 0);
  return [...own, ...added].map((e, i) => ({ e, i })).sort((a, b) => time(b.e) - time(a.e) || a.i - b.i).map((x) => x.e).slice(0, SF_HISTORY_MAX);
}

/** Merges incoming into this host's history; returns how many entries were new. A full or blocked storage adds nothing. */
export function storeScriptHistory(storage: Storage, incoming: ScriptHistoryEntry[]): number {
  const own = readScriptHistory(storage);
  const merged = mergeScriptHistory(own, incoming);
  const ownIds = new Set(own.map((e) => String(e.id)));
  try { storage.setItem(SF_HISTORY_KEY, JSON.stringify(merged)); } catch { return 0; }
  return merged.filter((e) => !ownIds.has(String(e.id))).length;
}

/** Handoff page (video host): the history a message carries, or null when it is not one the staff door sent. */
export function acceptScriptHistory(event: Message, { staffHosts, opener }: { staffHosts: readonly string[]; opener: unknown }): ScriptHistoryEntry[] | null {
  if (!opener || event.source !== opener) return null;
  const host = hostOf(event.origin);
  if (!host || !staffHosts.includes(host)) return null;
  const d = event.data as { channel?: unknown; type?: unknown; items?: unknown } | null;
  if (!d || typeof d !== "object" || d.channel !== HANDOFF_CHANNEL || d.type !== "history") return null;
  return validEntries(d.items);
}

/** Staff page: is this message the handoff window (on the video host) saying it is ready, or how many it added? */
export function fromHandoff(event: Message, { window: opened, videoHost }: { window: unknown; videoHost: string }): { type: "ready" } | { type: "saved"; added: number } | null {
  if (!opened || event.source !== opened || hostOf(event.origin) !== videoHost.toLowerCase()) return null;
  const d = event.data as { channel?: unknown; type?: unknown; added?: unknown } | null;
  if (!d || typeof d !== "object" || d.channel !== HANDOFF_CHANNEL) return null;
  if (d.type === "ready") return { type: "ready" };
  if (d.type === "saved" && typeof d.added === "number") return { type: "saved", added: d.added };
  return null;
}

/** Where the handoff page sends the browser: the workbench shell, opening one of its pages (scripts/index-1.js PAGES). */
export function workbenchPath(open: string | null | undefined): string {
  return open && /^[a-z][a-z0-9-]{0,40}$/.test(open) ? `/?open=${open}` : "/";
}
