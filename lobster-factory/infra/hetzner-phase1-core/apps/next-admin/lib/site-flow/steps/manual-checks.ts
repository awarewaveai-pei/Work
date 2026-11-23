// Step 8 手動項目 and the hand-confirmed steps (SITE-FLOW-COMPLETION-PLAN.md §1-4 "手動項目勾選", §2 step 9).
// Stored in sites.metadata.manual_checks = [{key, by, at, note}] (one entry per key, the latest tick); a removed tick is
// a removed entry. Written only by POST /api/ops/site-flow/[siteId]/manual-checks (owner/admin, audited).
//
// Traps:
// - A tick is the operator's word, shown as such ("您手動確認"); it never stands in for a host observation.
// - The write is a CAS on sites.updated_at: two people ticking at once never lose each other's tick silently.
// - `gateway_routed` exists only for ingress=product-gateway (step 5 is then confirmed by hand, §1 #6).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnvironmentRow } from "../types";
import { ingress } from "./shared";

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

export interface ManualCheckDef {
  key: string;
  label: string;
  /** Where the operator does it. */
  where: string;
}

/** Step 8's three items (§1 #1 ⑧). */
export const MANUAL_CHECKS: readonly ManualCheckDef[] = [
  { key: "uptime_monitor", label: "已在 Uptime Kuma 加入這個網址的監控", where: "Uptime Kuma 介面（沒有建立監控的 API）" },
  { key: "wpvivid_remote", label: "已設定 WPvivid 遠端備份", where: "這個站的 WordPress 後台 → WPvivid" },
  { key: "mail_setup", label: "已設定寄信（FluentSMTP）並寄出測試信", where: "這個站的 WordPress 後台 → FluentSMTP" },
];

/** Step 5 when the URL is routed by the product gateway: done by an engineer, confirmed here. */
export const GATEWAY_CHECK: ManualCheckDef = {
  key: "gateway_routed",
  label: "工程師已在產品閘道把這個網址接到這個站",
  where: "主機 nginx（safe-infra-patch.sh nginx；ORACLE-WP-SPEC GO-2）",
};

export function checksFor(env: EnvironmentRow): ManualCheckDef[] {
  return ingress(env) === "product-gateway" ? [...MANUAL_CHECKS, GATEWAY_CHECK] : [...MANUAL_CHECKS];
}

export interface ManualTick {
  key: string;
  by: string;
  at: string;
  note: string;
}

const NOTE_MAX = 200;

export function readTicks(siteMetadata: Json): ManualTick[] {
  const raw = Array.isArray(siteMetadata.manual_checks) ? siteMetadata.manual_checks : [];
  return raw
    .filter(isObj)
    .filter((t) => typeof t.key === "string" && typeof t.at === "string")
    .map((t) => ({ key: String(t.key), by: typeof t.by === "string" ? t.by : "", at: String(t.at), note: typeof t.note === "string" ? t.note : "" }));
}

export const tickOf = (siteMetadata: Json, key: string): ManualTick | null => readTicks(siteMetadata).find((t) => t.key === key) ?? null;

export type TickError = "unknown_check" | "invalid_note" | "site_not_found" | "lookup_failed" | "update_failed" | "conflict";

/**
 * Sets (checked) or clears one tick. `by` = who (profile email, else user id, else role). Returns the new tick list.
 * Other metadata keys are kept as they are.
 */
export async function writeTick(
  db: SupabaseClient,
  args: { siteId: string; env: EnvironmentRow; key: string; checked: boolean; note: unknown; by: string; now?: () => Date },
): Promise<{ ok: true; ticks: ManualTick[]; organizationId: string } | { ok: false; error: TickError }> {
  if (!checksFor(args.env).some((c) => c.key === args.key)) return { ok: false, error: "unknown_check" };
  const note = args.note === undefined || args.note === null ? "" : args.note;
  if (typeof note !== "string" || note.length > NOTE_MAX) return { ok: false, error: "invalid_note" };
  const { data, error } = await db.from("sites").select("id,organization_id,metadata,updated_at").eq("id", args.siteId).maybeSingle();
  if (error) return { ok: false, error: "lookup_failed" };
  if (!data) return { ok: false, error: "site_not_found" };
  const row = data as Json;
  const meta = isObj(row.metadata) ? row.metadata : {};
  const kept = readTicks(meta).filter((t) => t.key !== args.key);
  const ticks = args.checked
    ? [...kept, { key: args.key, by: args.by, at: (args.now ?? (() => new Date()))().toISOString(), note: note.trim() }]
    : kept;
  const { data: moved, error: upErr } = await db
    .from("sites")
    .update({ metadata: { ...meta, manual_checks: ticks }, updated_at: new Date().toISOString() })
    .eq("id", args.siteId)
    .eq("updated_at", row.updated_at as string)
    .select("id");
  if (upErr) return { ok: false, error: "update_failed" };
  if (!Array.isArray(moved) || moved.length !== 1) return { ok: false, error: "conflict" };
  return { ok: true, ticks, organizationId: String(row.organization_id) };
}

/** Step 8 as the page shows it: every item with its tick (or none). */
export function manualPanel(siteMetadata: Json): Array<ManualCheckDef & { tick: ManualTick | null }> {
  return MANUAL_CHECKS.map((c) => ({ ...c, tick: tickOf(siteMetadata, c.key) }));
}
