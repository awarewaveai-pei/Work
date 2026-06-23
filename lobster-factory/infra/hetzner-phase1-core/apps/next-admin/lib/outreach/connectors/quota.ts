// Cold Outreach — Quota Guard (task T4, PART H §H6).
// Pure evaluation of a co_connector_limits row → allow / near-limit / ratio.
// A null/zero monthly_limit means "unlimited" (e.g. self-hosted or manual steps).

export interface ConnectorLimitRow {
  connector_name: string;
  monthly_limit: number | null;
  current_usage: number;
  alert_threshold: number; // 0..1 (default 0.8)
}

export interface QuotaVerdict {
  connectorName: string;
  allowed: boolean; // under the monthly limit (or no limit set)
  nearLimit: boolean; // usage ratio >= alert_threshold
  ratio: number | null; // current_usage / monthly_limit, or null when unlimited
}

export function evaluateQuota(row: ConnectorLimitRow): QuotaVerdict {
  const { connector_name, monthly_limit, current_usage, alert_threshold } = row;
  if (monthly_limit == null || monthly_limit <= 0) {
    return { connectorName: connector_name, allowed: true, nearLimit: false, ratio: null };
  }
  const ratio = current_usage / monthly_limit;
  const threshold = Number.isFinite(alert_threshold) && alert_threshold > 0 ? alert_threshold : 0.8;
  return {
    connectorName: connector_name,
    allowed: current_usage < monthly_limit,
    nearLimit: ratio >= threshold,
    ratio,
  };
}

/** Build the RouterContext.quotaOk predicate from a set of limit rows (keyed by connector_name). */
export function quotaOkFromLimits(rows: ConnectorLimitRow[]): (connectorName: string) => boolean {
  const verdicts = new Map<string, boolean>();
  for (const r of rows) verdicts.set(r.connector_name, evaluateQuota(r).allowed);
  // Unknown connectors (no limit row) default to allowed — limits are opt-in guards.
  return (name: string) => verdicts.get(name) ?? true;
}
