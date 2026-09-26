/**
 * System-mode gate for the workflows runner. Mirrors next-admin's
 * lib/command-plane/killSwitch.ts (getActiveMode + evaluateKillSwitch at risk "high") exactly:
 * most-restrictive of the org's client row and the global row; a DB error, an unrecognized mode
 * value, or a non-uuid organizationId all fail closed to "unavailable" (blocked). organizationId
 * null means "no org context" -- only the global row applies then.
 *
 * Kept in lockstep with the next-admin implementation via a SHARED fixture
 * (src/lib/__fixtures__/system-mode-cases.json), loaded by both this module's own test and
 * next-admin's lib/system-modes/__tests__/system-mode-fixture-parity.test.ts -- not by
 * independently re-deriving the rule in both places.
 */
import { supabaseRestQuery, type SupabaseRestConfig } from "../db/supabase/supabaseRestInsert";

export type SystemMode = "normal" | "read_only" | "maintenance" | "emergency_stop";
export type ModeLookup = SystemMode | "unavailable";

const ORG_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODE_STRICTNESS: Record<SystemMode, number> = {
  normal: 0,
  read_only: 1,
  maintenance: 2,
  emergency_stop: 3,
};

function stricterOf(a: SystemMode, b: SystemMode): SystemMode {
  return MODE_STRICTNESS[b] > MODE_STRICTNESS[a] ? b : a;
}

function isKnownMode(value: unknown): value is SystemMode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MODE_STRICTNESS, value);
}

/**
 * Returns the most-restrictive of the client-scoped and global-scoped system_modes rows for this
 * org. organizationId is interpolated into the PostgREST `or` filter below -- anything but a uuid
 * could rewrite it, so a non-uuid value fails closed without querying at all (same guard as
 * killSwitch.ts's getActiveMode).
 */
export async function getActiveMode(
  creds: SupabaseRestConfig,
  organizationId: string | null,
): Promise<ModeLookup> {
  if (organizationId !== null && !ORG_ID_RE.test(organizationId)) {
    return "unavailable";
  }

  let rows: unknown[];
  try {
    rows = organizationId
      ? await supabaseRestQuery(creds, "system_modes", {
          select: "scope_type,scope_id,mode",
          or: `(and(scope_type.eq.client,scope_id.eq.${organizationId}),and(scope_type.eq.global,scope_id.is.null))`,
        })
      : await supabaseRestQuery(creds, "system_modes", {
          select: "scope_type,scope_id,mode",
          scope_type: "eq.global",
          scope_id: "is.null",
        });
  } catch {
    return "unavailable";
  }

  if (!Array.isArray(rows)) return "unavailable";
  if (rows.length === 0) return "normal";

  const parsed = rows as Array<{ mode?: unknown }>;
  // A mode this code does not know (null, or a value a future migration added before SystemMode
  // was updated here too) cannot be ranked -- treat the table as unreadable rather than as 'normal'.
  if (parsed.some((row) => !isKnownMode(row.mode))) {
    return "unavailable";
  }
  return parsed.reduce<SystemMode>((strictest, row) => stricterOf(strictest, row.mode as SystemMode), "normal");
}

export interface SystemModeDecision {
  mode: ModeLookup;
  blocks: boolean;
  reason?: string;
}

/**
 * Mirrors killSwitch.ts's evaluateKillSwitch at risk level "high" -- every production-changing
 * dispatch in this package is at least "high", so no separate risk-level parameter is needed here.
 * FAIL_OPEN_FOR is empty in killSwitch.ts: anything but "normal" blocks.
 */
export function evaluateAtHigh(mode: ModeLookup): SystemModeDecision {
  switch (mode) {
    case "normal":
      return { mode, blocks: false };
    case "unavailable":
      return { mode, blocks: true, reason: "system_modes unreadable (fail closed)" };
    case "emergency_stop":
      return { mode, blocks: true, reason: "system in emergency_stop" };
    case "maintenance":
      return { mode, blocks: true, reason: "system in maintenance" };
    case "read_only":
      return { mode, blocks: true, reason: "system in read_only" };
  }
}

/** Convenience: read + evaluate in one call, the shape every dispatch call site actually needs. */
export async function checkOrgSystemMode(
  creds: SupabaseRestConfig,
  organizationId: string | null,
): Promise<SystemModeDecision> {
  const mode = await getActiveMode(creds, organizationId);
  return evaluateAtHigh(mode);
}
