// Storm correlation (Auto-Repair A3, 2026-07-03).
//
// One outage → uptime_kuma DOWN + sentry 5xx + netdata CPU as three separate
// incidents. Two pieces:
//   1. linkStormParent — at ingest, best-effort link a new incident to the
//      earliest open incident in the same window (writes parent_incident_id,
//      added by migration 0058). Fail-open: if the column doesn't exist yet or
//      anything errors, ingest continues untouched.
//   2. collapseStormChildren — pure display logic: given queue rows, hide
//      children whose parent is also present and report the collapse count on
//      the parent. Unit-tested; no I/O.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Incident } from "@/lib/ops-inbox/types";
import { neighborWindow } from "./evidence";

/** Minimal shape both ops_incidents rows and queue items satisfy. */
export interface StormLinkable {
  id: string;
  parent_incident_id?: string | null;
}

export interface CollapseResult<T extends StormLinkable> {
  /** Rows to display: parents and independent incidents, in input order. */
  visible: T[];
  /** parent id → number of children hidden under it. */
  childCount: Map<string, number>;
}

/**
 * Hide rows whose parent is also in the list; count them on the parent.
 * A child whose parent is NOT in the list stays visible (its parent may be
 * resolved already — the child is then the actionable row).
 */
export function collapseStormChildren<T extends StormLinkable>(rows: T[]): CollapseResult<T> {
  const present = new Set(rows.map((r) => r.id));
  const childCount = new Map<string, number>();
  const visible: T[] = [];
  for (const row of rows) {
    const parent = row.parent_incident_id ?? null;
    if (parent && present.has(parent)) {
      childCount.set(parent, (childCount.get(parent) ?? 0) + 1);
    } else {
      visible.push(row);
    }
  }
  return { visible, childCount };
}

/**
 * Link a just-upserted incident to the earliest open incident from a DIFFERENT
 * source within ±15 min and the same tenant scope (same client_slug, or both
 * platform-level). Idempotent (IS NULL guard), fail-open, and never links an
 * incident to itself or forms chains (parents are only ever incidents that are
 * themselves unparented).
 */
export async function linkStormParent(
  supabase: SupabaseClient,
  incident: Incident & { parent_incident_id?: string | null },
): Promise<Incident & { parent_incident_id?: string | null }> {
  try {
    if (incident.parent_incident_id) return incident;
    const { from, to } = neighborWindow(incident.last_seen_at);

    let query = supabase
      .from("ops_incidents")
      .select("id,source,first_seen_at,parent_incident_id")
      .in("status", ["open", "investigating"])
      .neq("id", incident.id)
      .neq("source", incident.source)
      .is("parent_incident_id", null)
      .gte("last_seen_at", from)
      .lte("last_seen_at", to)
      .order("first_seen_at", { ascending: true })
      .limit(1);
    query = incident.client_slug
      ? query.eq("client_slug", incident.client_slug)
      : query.is("client_slug", null);

    const { data: parentRow, error } = await query.maybeSingle();
    if (error || !parentRow?.id) return incident;

    const { error: updErr } = await supabase
      .from("ops_incidents")
      .update({ parent_incident_id: parentRow.id })
      .eq("id", incident.id)
      .is("parent_incident_id", null);
    if (updErr) return incident;
    return { ...incident, parent_incident_id: parentRow.id };
  } catch (e) {
    console.warn("[ops-inbox] storm correlation failed (fail-open):", e);
    return incident;
  }
}
