import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Incident } from "@/lib/ops-inbox/types";
import { restartUnhealthyContainer } from "../remediations/restart-unhealthy-container";
import { autoRemediateEnabled, findRemediation, REMEDIATION_COOLDOWN_MS } from "../remediations/engine";
import { REMEDIATIONS } from "../remediations/index";

const baseIncident = (over: Partial<Incident> = {}): Incident =>
  ({
    id: "00000000-0000-0000-0000-000000000001",
    source: "uptime_kuma",
    external_id: "x",
    fingerprint: "fp",
    signal_type: "uptime",
    severity: "high",
    service: "next-admin",
    environment: "production",
    title: "DOWN",
    message: null,
    occurrence_count: 1,
    first_seen_at: "2026-07-03T12:00:00Z",
    last_seen_at: "2026-07-03T12:00:00Z",
    status: "open",
    notes: null,
    due_at: null,
    reopen_count: 0,
    resolved_at: null,
    resolved_by: null,
    ai_provider_suggested: null,
    ai_diagnoses: [],
    cursor_deeplink: null,
    notification_log: [],
    raw: {},
    tags: {},
    created_at: "2026-07-03T12:00:00Z",
    updated_at: "2026-07-03T12:00:00Z",
    client_slug: null,
    organization_id: null,
    ...over,
  }) as Incident;

describe("restartUnhealthyContainer.matches — allowlist discipline", () => {
  const savedWhitelist = process.env.AUTO_REMEDIATE_SERVICE_WHITELIST;
  beforeEach(() => {
    process.env.AUTO_REMEDIATE_SERVICE_WHITELIST = "next-admin,ops-worker";
  });
  afterEach(() => {
    if (savedWhitelist === undefined) delete process.env.AUTO_REMEDIATE_SERVICE_WHITELIST;
    else process.env.AUTO_REMEDIATE_SERVICE_WHITELIST = savedWhitelist;
  });

  it("matches a whitelisted platform uptime_kuma production incident", () => {
    expect(restartUnhealthyContainer.matches(baseIncident())).toBe(true);
  });

  it("never matches netdata — its alarms are host-level (service=null in prod)", () => {
    // Real netdata incidents have service=null (normalizeNetdata), so the
    // matcher would never fire; the source guard makes that explicit.
    expect(restartUnhealthyContainer.matches(baseIncident({ source: "netdata", signal_type: "resource", service: null }))).toBe(false);
    // Even a (non-real) netdata incident carrying a whitelisted service is rejected by source.
    expect(restartUnhealthyContainer.matches(baseIncident({ source: "netdata", signal_type: "resource" }))).toBe(false);
  });

  it("never matches client-scoped incidents (platform stack only)", () => {
    expect(restartUnhealthyContainer.matches(baseIncident({ client_slug: "soulful-expression" }))).toBe(false);
  });

  it("never matches non-whitelisted services", () => {
    expect(restartUnhealthyContainer.matches(baseIncident({ service: "postgres" }))).toBe(false);
  });

  it("empty whitelist matches nothing (safe default)", () => {
    process.env.AUTO_REMEDIATE_SERVICE_WHITELIST = "";
    expect(restartUnhealthyContainer.matches(baseIncident())).toBe(false);
  });

  it("never matches sentry/deploy sources or non-production environments", () => {
    expect(restartUnhealthyContainer.matches(baseIncident({ source: "sentry", signal_type: "error" }))).toBe(false);
    expect(restartUnhealthyContainer.matches(baseIncident({ source: "deploy", signal_type: "deployment" }))).toBe(false);
    expect(restartUnhealthyContainer.matches(baseIncident({ environment: "staging" }))).toBe(false);
  });

  it("cooldown keys on service, so a null-service incident is never throttle-eligible", () => {
    // (documents the engine.inCooldown early-return contract via the matcher:
    // a matched incident always has a non-null whitelisted service)
    expect(restartUnhealthyContainer.matches(baseIncident({ service: null }))).toBe(false);
  });

  it("rejects service names with shell metacharacters via the SERVICE_RE gate", () => {
    process.env.AUTO_REMEDIATE_SERVICE_WHITELIST = "next-admin";
    expect(restartUnhealthyContainer.matches(baseIncident({ service: "next-admin; rm -rf /" }))).toBe(false);
  });
});

describe("engine safety defaults", () => {
  const savedFlag = process.env.AUTO_REMEDIATE_ENABLED;
  afterEach(() => {
    if (savedFlag === undefined) delete process.env.AUTO_REMEDIATE_ENABLED;
    else process.env.AUTO_REMEDIATE_ENABLED = savedFlag;
  });

  it("AUTO_REMEDIATE_ENABLED defaults OFF", () => {
    delete process.env.AUTO_REMEDIATE_ENABLED;
    expect(autoRemediateEnabled()).toBe(false);
    process.env.AUTO_REMEDIATE_ENABLED = "false";
    expect(autoRemediateEnabled()).toBe(false);
    process.env.AUTO_REMEDIATE_ENABLED = "true";
    expect(autoRemediateEnabled()).toBe(true);
  });

  it("cooldown window is 30 minutes", () => {
    expect(REMEDIATION_COOLDOWN_MS).toBe(30 * 60_000);
  });

  it("findRemediation returns null when nothing matches", () => {
    process.env.AUTO_REMEDIATE_SERVICE_WHITELIST = "";
    expect(findRemediation(baseIncident())).toBeNull();
  });

  it("catalog rollback for restart is an explicit no-op (documented)", async () => {
    const r = await restartUnhealthyContainer.rollback({ incident: baseIncident() });
    expect(r.ok).toBe(true);
    expect(r.detail).toContain("no-op");
  });

  it("every catalog entry implements the four-stage contract", () => {
    for (const r of REMEDIATIONS) {
      expect(typeof r.matches).toBe("function");
      expect(typeof r.precheck).toBe("function");
      expect(typeof r.execute).toBe("function");
      expect(typeof r.healthcheck).toBe("function");
      expect(typeof r.rollback).toBe("function");
      expect(r.key).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
