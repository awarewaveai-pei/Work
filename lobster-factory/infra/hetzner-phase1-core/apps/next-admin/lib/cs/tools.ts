// cs-engine action gate — the deterministic code that decides whether an agentic tool call may run
// autonomously. Money/identity (A3) and any amount over MAX_REFUND_CENTS are hard-stopped to a
// human BY CODE, never by the LLM (plan §3.4 D9, §14 red-line). Concrete tool handlers (order
// lookup etc.) register here in Phase 3 — in U1 the registry is empty, so the gate denies writes
// and there are no read handlers to call.

import { MAX_REFUND_CENTS } from "@/lib/cs/config";
import { hitsRedLine, hitsSensitive } from "@/lib/cs/autonomy";
import type { ToolSpec } from "@/lib/cs/types";

export type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

const registry = new Map<string, ToolHandler>();

/** Register a concrete A1/A2 tool implementation (e.g. get_order_status). Phase 3+. */
export function registerTool(name: string, handler: ToolHandler): void {
  registry.set(name, handler);
}
export function getToolHandler(name: string): ToolHandler | undefined {
  return registry.get(name);
}
export function clearTools(): void {
  registry.clear();
}

export interface ToolDecision {
  allow: boolean;
  status: "ok" | "denied" | "error" | "pending_confirm" | "pending_human";
  reason?: string;
}

/** Pull a cents amount from common param shapes (amount_cents / amountCents / amount in major units). */
export function extractAmountCents(params: Record<string, unknown>): number | null {
  const cents = params.amount_cents ?? params.amountCents;
  if (typeof cents === "number" && Number.isFinite(cents)) return Math.round(cents);
  const amt = params.amount;
  if (typeof amt === "number" && Number.isFinite(amt)) return Math.round(amt * 100);
  return null;
}

/**
 * The action gate (pure). A1 reads run; A2 writes need a human (no in-widget confirm flow until
 * Phase 4); A3 + over-ceiling money always go to a human. Disabled tools are denied outright.
 */
export function resolveToolDecision(spec: ToolSpec, params: Record<string, unknown>): ToolDecision {
  if (!spec.isEnabled) return { allow: false, status: "denied", reason: "tool_disabled" };

  // Name backstop: a tool whose NAME implies money/identity can NEVER run autonomously, even if the
  // DB `risk` column was mis-tagged (e.g. issue_refund flagged A1_read). Code beats DB config here.
  if (hitsRedLine(spec.name) || hitsSensitive(spec.name)) {
    return { allow: false, status: "pending_human", reason: "red_line_tool_name" };
  }

  // Any non-zero amount (positive OR negative) over the code ceiling ⇒ human. MAX_REFUND_CENTS=0 in
  // U1 means no autonomous money movement at all; abs() closes a negative-amount bypass.
  const amount = extractAmountCents(params);
  if (amount !== null && Math.abs(amount) > MAX_REFUND_CENTS) {
    return { allow: false, status: "pending_human", reason: "amount_over_ceiling" };
  }

  switch (spec.risk) {
    case "A1_read":
      return { allow: true, status: "ok" };
    case "A2_gated_write":
      return { allow: false, status: "pending_human", reason: "gated_write_needs_human" };
    case "A3_human_only":
      return { allow: false, status: "pending_human", reason: "a3_human_only" };
    default:
      return { allow: false, status: "denied", reason: "unknown_risk" };
  }
}
