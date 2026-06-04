import { describe, expect, it } from "vitest";
import { normalizeUptimeKuma } from "../normalize/uptime-kuma";

// m4 regression tests: monitor.hostname must NOT influence environment inference.
// An attacker-controlled hostname (e.g. "staging.evil.com") must not downgrade
// a production incident to staging severity.
describe("normalizeUptimeKuma — m4: hostname must not affect environment", () => {
  const basePayload = (hostname: string, envTag?: string) => ({
    monitor: {
      id: 1,
      name: "aware-wave.com",
      hostname,
      url: "https://aware-wave.com",
      type: "http",
      tags: envTag ? [{ name: "env", value: envTag }] : [],
    },
    heartbeat: { status: 0, msg: "Connection refused" }, // status 0 = DOWN
  });

  it("hostname 'staging.evil.com' must NOT yield staging environment", () => {
    const draft = normalizeUptimeKuma(basePayload("staging.evil.com"));
    expect(draft.environment).toBe("production");
  });

  it("hostname 'staging.aware-wave.com' must NOT yield staging environment (only env tag counts)", () => {
    const draft = normalizeUptimeKuma(basePayload("staging.aware-wave.com"));
    expect(draft.environment).toBe("production");
  });

  it("explicit env tag 'staging' still works", () => {
    const draft = normalizeUptimeKuma(basePayload("aware-wave.com", "staging"));
    expect(draft.environment).toBe("staging");
  });

  it("explicit env tag 'development' still works", () => {
    const draft = normalizeUptimeKuma(basePayload("aware-wave.com", "development"));
    expect(draft.environment).toBe("development");
  });

  it("no env tag + legitimate hostname → production", () => {
    const draft = normalizeUptimeKuma(basePayload("aware-wave.com"));
    expect(draft.environment).toBe("production");
  });

  it("production DOWN → critical severity (not medium from staging downgrade)", () => {
    // Before m4 fix: attacker sets hostname="staging.evil.com" → environment=staging → severity=medium
    // After m4 fix: environment=production → severity=critical
    const draft = normalizeUptimeKuma(basePayload("staging.evil.com"));
    expect(draft.severity).toBe("critical");
  });
});
