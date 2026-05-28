import type { IncidentDraft, IncidentSeverity } from "../types";

export function normalizeDeploy(raw: Record<string, unknown>): IncidentDraft {
  const event = String(raw.event ?? "deploy_unknown");
  const app = String(raw.app ?? "unknown");
  const deployed = String(raw.deployed_commit ?? "?");
  const origin = String(raw.origin_commit ?? "?");
  const behind = Number(raw.behind ?? 0);
  const runAt = String(raw.run_at ?? new Date().toISOString());
  // Truncate to hour: one dedup bucket per 4-hour deploy cycle
  const runAtHour = runAt.substring(0, 13) + ":00:00Z";

  const severity: IncidentSeverity =
    event === "deploy_failed" ? "high" : event === "deploy_success" ? "low" : "medium";

  const title =
    event === "deploy_failed"
      ? `SG ${app} auto-deploy FAILED`
      : event === "deploy_success"
        ? `SG ${app} auto-deployed OK`
        : `SG ${app} deploy drift (${behind} commit(s) behind)`;

  return {
    source: "deploy",
    signal_type: "deployment",
    severity,
    service: app,
    environment: "production",
    external_id: `deploy:${app}:${runAtHour}`,
    fingerprint: "",
    title,
    message: `deployed=${deployed.substring(0, 12)} origin=${origin.substring(0, 12)} behind=${behind}`,
    raw: { ...raw, run_at_hour: runAtHour },
    tags: { app, deployed_commit: deployed, origin_commit: origin, behind, run_at: runAt },
  };
}
