// Kill switch: read system_modes.
// Modifications must go through ops console SSO (never via command plane).

import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModeLookup, RiskLevel, SystemMode } from "./types";

// Exported (not just module-private) so tests can inject a fail-open risk level without a real DB.
export const FAIL_OPEN_FOR = new Set<RiskLevel>([]); // Empty: nothing fails open, including while system_modes is unreadable.

export interface KillSwitchDecision {
  mode: ModeLookup;
  blocks: boolean;
  reason?: string;
}

// emergency_stop > maintenance > read_only > normal. maintenance outranks
// read_only because FAIL_OPEN_FOR is empty: maintenance blocks every risk
// level while read_only only blocks non-low.
const MODE_STRICTNESS: Record<SystemMode, number> = {
  normal: 0,
  read_only: 1,
  maintenance: 2,
  emergency_stop: 3,
};

function stricterOf(a: SystemMode, b: SystemMode): SystemMode {
  return MODE_STRICTNESS[b] > MODE_STRICTNESS[a] ? b : a;
}

/**
 * Returns the most-restrictive of the client-scoped and global-scoped rows
 * for this org. `organizationId: null` means "no org context" (e.g. the
 * repair-center health probe) -- only the global row is queried then, a
 * client row can never apply. No rows at all -> 'normal' (no mode configured
 * is legal). A DB error -> 'unavailable', so the caller fails closed rather
 * than silently treating an unreadable table as 'normal'. Both fail-closed
 * branches (DB error, unrecognized mode) report to Sentry before returning,
 * since 'unavailable' on its own erases the reason once it reaches the caller.
 */
export async function getActiveMode(
  client: SupabaseClient,
  organizationId: string | null,
): Promise<ModeLookup> {
  const query = client.from("system_modes").select("scope_type, scope_id, mode");
  const { data, error } = organizationId
    ? await query.or(
        `and(scope_type.eq.client,scope_id.eq.${organizationId}),and(scope_type.eq.global,scope_id.is.null)`,
      )
    : await query.eq("scope_type", "global").is("scope_id", null);
  if (error || !data) {
    Sentry.captureMessage(
      `[kill-switch] system_modes unreadable: ${error?.message ?? "no data returned"}`,
      { level: "error", tags: { component: "kill-switch" } },
    );
    return "unavailable";
  }
  if (data.length === 0) {
    return "normal";
  }
  // A mode this code does not know (null, or a value a future migration added before SystemMode
  // was updated) cannot be ranked -- treat the table as unreadable rather than as 'normal'.
  const unknownRow = data.find(
    (row) => typeof row.mode !== "string" || !Object.prototype.hasOwnProperty.call(MODE_STRICTNESS, row.mode),
  );
  if (unknownRow) {
    Sentry.captureMessage(
      `[kill-switch] system_modes holds an unrecognized mode: ${String(unknownRow.mode)}`,
      { level: "error", tags: { component: "kill-switch" } },
    );
    return "unavailable";
  }
  return data.reduce<SystemMode>(
    (strictest, row) => stricterOf(strictest, row.mode as SystemMode),
    "normal",
  );
}

export function evaluateKillSwitch(mode: ModeLookup, riskLevel: RiskLevel): KillSwitchDecision {
  switch (mode) {
    case "unavailable":
      return FAIL_OPEN_FOR.has(riskLevel)
        ? { mode, blocks: false }
        : { mode, blocks: true, reason: "system_modes unreadable (fail closed)" };
    case "emergency_stop":
      return { mode, blocks: true, reason: "system in emergency_stop" };
    case "maintenance":
      return FAIL_OPEN_FOR.has(riskLevel) ? { mode, blocks: false } : { mode, blocks: true, reason: "system in maintenance" };
    case "read_only":
      return riskLevel === "low" ? { mode, blocks: false } : { mode, blocks: true, reason: "system in read_only" };
    case "normal":
      return { mode, blocks: false };
    default: {
      // Unreachable by type; at runtime a mode string nobody added here blocks instead of passing.
      const unknown: never = mode;
      return { mode: unknown, blocks: true, reason: `unknown mode ${String(unknown)} (fail closed)` };
    }
  }
}
