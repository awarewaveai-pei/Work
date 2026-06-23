// Cold Outreach — Free-Plan Router types (task T4, PART H §H4).
// The router is COST-FIRST: free/manual steps are always usable so a need can never be fully
// blocked, and paid/limited connectors are only chosen when explicitly enabled + within quota.

export type ConnectorNeed =
  | "ai_generation"
  | "email_verification"
  | "lead_scraping"
  | "email_sending";

export type StepKind = "byo" | "agency" | "free" | "manual";

export interface FallbackStep {
  provider: string; // e.g. "gemini", "hunter", "manual_prompt"
  kind: StepKind;
  connectorName?: string; // co_connector_accounts.connector_name when requiresConnector
  requiresConnector: boolean; // needs an enabled connector account (+ quota) to be usable
  note: string;
}

export interface RouterContext {
  // connector_name values that are enabled (is_enabled = true) for the active org.
  enabledConnectors: Set<string>;
  // false when the connector's monthly quota is exhausted (see quota.ts evaluateQuota).
  quotaOk: (connectorName: string) => boolean;
}

export interface ResolvedLadder {
  need: ConnectorNeed;
  steps: FallbackStep[]; // full ladder (for display/transparency)
  usable: FallbackStep[]; // steps currently usable, in preference order
  chosen: FallbackStep | null; // first usable step (always non-null thanks to free/manual safety net)
}
