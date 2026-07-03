// Remediation: restart an unhealthy/exited platform container (A2, 2026-07-03).
//
// Scope is deliberately narrow — SG platform stack only, service must be in
// the operator-set allowlist AUTO_REMEDIATE_SERVICE_WHITELIST (comma-separated
// docker compose service names; EMPTY = matches nothing, which is the safe
// default). Client-site incidents never match: their remediation story goes
// through per-client config, not the platform stack.
//
// precheck proves the container is actually unhealthy/exited/restarting right
// now (an alert alone is not proof); execute is one bounded
// `docker compose restart <svc>`; healthcheck re-reads container state;
// rollback is a documented no-op (restart is idempotent and destroys nothing —
// a container that fails to come back needs a human, not a second blind kick).

import { readSshTarget, sshExecOnce } from "../ssh";
import type { Incident } from "@/lib/ops-inbox/types";
import type { Remediation, RemediationContext, RemediationStepResult } from "./types";

const SERVICE_RE = /^[a-z0-9_-]{1,40}$/;
const EXEC_TIMEOUT_MS = 60_000;
const PROBE_TIMEOUT_MS = 10_000;
const HEALTH_SETTLE_MS = 15_000;

function whitelist(): Set<string> {
  return new Set(
    (process.env.AUTO_REMEDIATE_SERVICE_WHITELIST ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SERVICE_RE.test(s)),
  );
}

function phase1Root(): string {
  const raw = process.env.AUTO_REPAIR_SG_PHASE1_ROOT?.trim() || "/root/lobster-phase1";
  // Same charset rule as backup.ts safeScriptPath — no shell metacharacters.
  return /^[/A-Za-z0-9_.-]+$/.test(raw) && !raw.includes("..") ? raw : "/root/lobster-phase1";
}

function serviceOf(incident: Incident): string | null {
  const svc = incident.service?.trim() ?? "";
  return SERVICE_RE.test(svc) ? svc : null;
}

async function containerStatus(service: string): Promise<{ ok: boolean; status: string }> {
  const target = readSshTarget("SG");
  if (!target) return { ok: false, status: "AUTO_REPAIR_SG_SSH_* not configured" };
  // --filter name= is a substring match; format output then exact-match in code.
  const result = await sshExecOnce(
    target,
    `docker ps -a --format '{{.Names}}|{{.Status}}'`,
    PROBE_TIMEOUT_MS,
  );
  if (result.code !== 0) return { ok: false, status: `probe exit=${result.code}: ${result.stderr.slice(0, 200)}` };
  const line = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .find((l) => {
      const name = l.split("|")[0] ?? "";
      // compose containers are named <project>-<service>-<n> or <project>_<service>_<n>
      return name === service || name.includes(`-${service}-`) || name.includes(`_${service}_`);
    });
  if (!line) return { ok: false, status: `container for service "${service}" not found` };
  return { ok: true, status: line.split("|")[1] ?? "" };
}

export const restartUnhealthyContainer: Remediation = {
  key: "restart-unhealthy-container",
  title: "重啟 unhealthy 平台容器（SG）",

  matches(incident: Incident): boolean {
    if (incident.environment !== "production") return false;
    if (incident.client_slug) return false; // platform stack only
    if (incident.source !== "uptime_kuma" && incident.source !== "netdata") return false;
    const svc = serviceOf(incident);
    return !!svc && whitelist().has(svc);
  },

  async precheck(ctx: RemediationContext): Promise<RemediationStepResult> {
    const svc = serviceOf(ctx.incident);
    if (!svc || !whitelist().has(svc)) return { ok: false, detail: `service not in AUTO_REMEDIATE_SERVICE_WHITELIST` };
    const probe = await containerStatus(svc);
    if (!probe.ok) return { ok: false, detail: probe.status };
    const bad = /unhealthy|restarting|exited|dead/i.test(probe.status);
    return bad
      ? { ok: true, detail: `container state confirms problem: ${probe.status}` }
      : { ok: false, detail: `container looks healthy (${probe.status}) — alert may be stale; no action` };
  },

  async execute(ctx: RemediationContext): Promise<RemediationStepResult> {
    const svc = serviceOf(ctx.incident);
    if (!svc) return { ok: false, detail: "invalid service name" };
    const target = readSshTarget("SG");
    if (!target) return { ok: false, detail: "AUTO_REPAIR_SG_SSH_* not configured" };
    const result = await sshExecOnce(
      target,
      `cd ${phase1Root()} && docker compose restart ${svc}`,
      EXEC_TIMEOUT_MS,
    );
    return result.code === 0
      ? { ok: true, detail: `docker compose restart ${svc} → exit 0` }
      : { ok: false, detail: `restart failed exit=${result.code}: ${result.stderr.slice(0, 300)}` };
  },

  async healthcheck(ctx: RemediationContext): Promise<RemediationStepResult> {
    const svc = serviceOf(ctx.incident);
    if (!svc) return { ok: false, detail: "invalid service name" };
    await new Promise((r) => setTimeout(r, HEALTH_SETTLE_MS));
    const probe = await containerStatus(svc);
    if (!probe.ok) return { ok: false, detail: probe.status };
    const up = /^Up/i.test(probe.status) && !/unhealthy|restarting/i.test(probe.status);
    return up
      ? { ok: true, detail: `container recovered: ${probe.status}` }
      : { ok: false, detail: `container still bad after restart: ${probe.status}` };
  },

  async rollback(): Promise<RemediationStepResult> {
    // Restart is idempotent and destroys no state. A container that failed its
    // post-restart healthcheck needs a human — a second blind restart would
    // just mask the signal. Deliberate no-op.
    return { ok: true, detail: "no-op: restart destroys no state; escalate to human instead of re-kicking" };
  },
};
