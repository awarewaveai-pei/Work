// Staff tool grants: may this staff member use the tool a path belongs to (agency-os/handoffs/2026-10-24-staff-tool-grants)?
// One judgment for the three exits: middleware (pages and APIs), the sidebar and the home page. The grant lives in the
// auth user's app_metadata.staff_tools (server-controlled, like ops_role); middleware carries it as x-ops-tools.
// STAFF_TOOLS_MODE: only the exact string "enforce" enforces; unset or any typo stays shadow (log, never block).
// Flipping it is High: the owner sets every employee on /ops/staff first, then 7 days of would_deny lines are read.
import type { OpsRole } from "./ops-contracts";
import { STAFF_TOOLS, toolsFor } from "./portal/staff-tools";

export type StaffToolsMode = "shadow" | "enforce";
export function staffToolsMode(env: Record<string, string | undefined> = process.env): StaffToolsMode {
  return env.STAFF_TOOLS_MODE === "enforce" ? "enforce" : "shadow";
}

/** null = never set for this person (shadow lets them use everything; enforce gives them only the platform). */
export interface StaffGrant { role: OpsRole; tools: readonly string[] | null }

export const TOOLS_HEADER = "x-ops-tools";
const KNOWN = new Set(STAFF_TOOLS.map((t) => t.key));

/** app_metadata.staff_tools -> the granted keys. Not an array = never set (null). Unknown keys are dropped: a renamed
 *  or removed tool grants nothing. */
export function parseStaffTools(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return [...new Set(raw.filter((k): k is string => typeof k === "string" && KNOWN.has(k)))];
}

/** Header value: comma-joined keys; "" = set but empty. Absent header = never set. Only middleware sets it (it strips
 *  any client-supplied copy). */
export const encodeToolsHeader = (tools: readonly string[]) => tools.join(",");
export function decodeToolsHeader(value: string | null): string[] | null {
  return value === null ? null : parseStaffTools(value.split(",").map((k) => k.trim()));
}

/** Why enforce mode would refuse a path; staffDenial returns null when it would allow it. */
export interface StaffDenial { reason: "not_granted" | "not_configured" | "unclaimed"; tools: readonly string[] }

/** The verdict as enforce mode would give it. The owner always passes (cannot be locked out); the platform always
 *  passes; a path no tool claims is refused (staff-tools.test.ts keeps that from happening). */
export function staffDenial(grant: StaffGrant, pathname: string): StaffDenial | null {
  if (grant.role === "owner") return null;
  const keys = toolsFor(pathname);
  if (keys === "platform") return null;
  if (keys === null) return { reason: "unclaimed", tools: [] };
  const held = grant.tools;
  if (held === null) return { reason: "not_configured", tools: keys };
  return keys.some((k) => held.includes(k)) ? null : { reason: "not_granted", tools: keys };
}

/** For the sidebar and the home page: may this person see a link to `key`? Shadow shows everything not yet set. */
export function staffMayUseTool(grant: StaffGrant, key: string, mode: StaffToolsMode = staffToolsMode()): boolean {
  if (grant.role === "owner") return true;
  if (grant.tools === null) return mode === "shadow";
  return grant.tools.includes(key);
}

/** The grant a server page reads back from middleware's headers. null = no staff identity on the request (auth not
 *  configured in dev, or a customer): the caller shows everything, as before grants existed. */
export function staffGrantOf(h: Pick<Headers, "get">): StaffGrant | null {
  if (h.get("x-ops-user-kind") === "client") return null;
  const role = h.get("x-ops-claims-role");
  if (role !== "owner" && role !== "admin" && role !== "operator" && role !== "viewer") return null;
  return { role, tools: decodeToolsHeader(h.get(TOOLS_HEADER)) };
}

/** Sees every link (no filter at all): the owner, or a person not yet set while shadow. */
export function staffUnrestricted(grant: StaffGrant | null, mode: StaffToolsMode = staffToolsMode()): boolean {
  return grant === null || grant.role === "owner" || (grant.tools === null && mode === "shadow");
}

/** May this person open a link to `href` (sidebar, home page)? Same tools as the gate; a path no tool claims shows
 *  only to the unrestricted. */
export function staffMayOpen(grant: StaffGrant | null, href: string, mode: StaffToolsMode = staffToolsMode()): boolean {
  if (staffUnrestricted(grant, mode)) return true;
  const keys = toolsFor(href);
  if (keys === "platform") return true;
  return keys !== null && keys.some((k) => staffMayUseTool(grant!, k, mode));
}

// One log line per person x reason x tools per window (the first path seen is the one logged). Keyed by tools, not by
// path: a person cannot flood the container log by requesting many distinct paths (Codex 2026-10-24, partialreview-06a455ee).
const LOG_WINDOW_MS = 10 * 60_000;
const LOG_MAX = 2_000;
const logged = new Map<string, number>();
export function logStaffVerdict(mode: StaffToolsMode, userId: string, role: OpsRole, pathname: string, v: StaffDenial, now = Date.now()): void {
  const key = `${mode}|${userId}|${v.reason}|${v.tools.join(",")}`;
  const at = logged.get(key);
  if (at !== undefined && now - at < LOG_WINDOW_MS) return;
  logged.delete(key);
  logged.set(key, now);
  while (logged.size > LOG_MAX) logged.delete(logged.keys().next().value as string);
  const what = mode === "enforce" ? "deny" : "would_deny";
  console.warn(`[staff-tools] ${what} user=${userId || "-"} role=${role} path=${pathname} reason=${v.reason} tools=${v.tools.join(",") || "-"}`);
}
