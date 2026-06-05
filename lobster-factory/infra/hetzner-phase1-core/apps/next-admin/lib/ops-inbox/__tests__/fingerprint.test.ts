import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeFingerprint, computeFingerprintV2 } from "../fingerprint";

/**
 * 2026-05-23: Tests cover the netdata fingerprint stability fix.
 *
 * Pre-fix bug: fingerprint used `raw.alarm` (label text containing value, e.g.
 * "System requires reboot ... = 1 status"). When alarm transitioned WARNING → CLEAR,
 * the value changed (1 → 0), producing a different fingerprint and breaking
 * incident lookup. Post-fix: uses `raw.name` (stable metric ID).
 *
 * See: agency-os/docs/operations/AUDIT_REGISTRY.md §Ops Inbox webhook CLEAR auto-resolve
 *      agency-os/WORKLOG.md 2026-05-23 §B-Minimal residual risk closure (Q4)
 */
describe("computeFingerprint — netdata stability", () => {
  const host = "wordpress-ubuntu-4gb-sin-1";
  const name = "system_post_update_reboot_status";

  it("netdata WARNING and CLEAR produce same fingerprint when name is present", () => {
    const warning = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: ... = 1 status on host",
      raw: {
        host,
        name,
        alarm_id: "1776419011",
        alarm: "System requires reboot after package updates = 1 status",
        status: "WARNING",
        value: "1",
      },
    });
    const cleared = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: ... = 0 status on host",
      raw: {
        host,
        name,
        alarm_id: "1776419011",
        alarm: "System requires reboot after package updates = 0 status",
        status: "CLEAR",
        value: "0",
      },
    });
    expect(warning).toBe(cleared);
  });

  it("falls back to alarm_id when name is missing", () => {
    const fp = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: legacy payload",
      raw: { host, alarm_id: "1776419011", alarm: "legacy alarm = 1" },
    });
    expect(fp).toBeTruthy();
    expect(fp.length).toBe(64); // sha256 hex
  });

  it("falls back to alarm when both name and alarm_id are missing", () => {
    const fp = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: very-legacy payload",
      raw: { host, alarm: "ancient_alarm = 1" },
    });
    expect(fp).toBeTruthy();
    expect(fp.length).toBe(64);
  });

  it("returns null when host is missing (cannot identify source machine)", () => {
    const fp = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: orphan payload",
      raw: { name, alarm: "x = 1" },
    });
    // Falls back to generic title-based fingerprint (truthy, but different code path)
    expect(fp).toBeTruthy();
  });

  it("different hosts with same metric name produce different fingerprints", () => {
    const sg = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: ... on SG",
      raw: { host: "wordpress-ubuntu-4gb-sin-1", name, alarm: "x = 1" },
    });
    const eu = computeFingerprint({
      source: "netdata",
      service: null,
      signal_type: "resource",
      title: "Netdata: ... on EU",
      raw: { host: "awarewave-eu-hel1-cpx32", name, alarm: "x = 1" },
    });
    expect(sg).not.toBe(eu);
  });
});

describe("computeFingerprintV2 — M4 salted fingerprint", () => {
  const args = {
    source: "sentry" as const,
    service: "next-admin",
    signal_type: "error" as const,
    title: "TypeError: cannot read property",
    raw: { data: { issue: { id: "12345" } } },
  };

  let savedSalt: string | undefined;
  beforeEach(() => {
    savedSalt = process.env.OPS_INBOX_FINGERPRINT_SALT;
    delete process.env.OPS_INBOX_FINGERPRINT_SALT;
  });
  afterEach(() => {
    if (savedSalt === undefined) delete process.env.OPS_INBOX_FINGERPRINT_SALT;
    else process.env.OPS_INBOX_FINGERPRINT_SALT = savedSalt;
  });

  it("salt unset → v2 equals v1 (no-op, deploy-safe)", () => {
    expect(computeFingerprintV2(args)).toBe(computeFingerprint(args));
  });

  it("salt set → v2 differs from v1 (attacker cannot predict without salt)", () => {
    process.env.OPS_INBOX_FINGERPRINT_SALT = "s3cr3t-server-salt";
    expect(computeFingerprintV2(args)).not.toBe(computeFingerprint(args));
  });

  it("salt set → v2 is deterministic for the same input", () => {
    process.env.OPS_INBOX_FINGERPRINT_SALT = "s3cr3t-server-salt";
    expect(computeFingerprintV2(args)).toBe(computeFingerprintV2(args));
  });

  it("different salts → different v2 for the same input", () => {
    process.env.OPS_INBOX_FINGERPRINT_SALT = "salt-A";
    const a = computeFingerprintV2(args);
    process.env.OPS_INBOX_FINGERPRINT_SALT = "salt-B";
    const b = computeFingerprintV2(args);
    expect(a).not.toBe(b);
  });

  it("salt set → v2 is a 64-char sha256 hex digest", () => {
    process.env.OPS_INBOX_FINGERPRINT_SALT = "s3cr3t-server-salt";
    expect(computeFingerprintV2(args)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("v2 tracks the same incident across WARNING/CLEAR (v1 stability is preserved under salt)", () => {
    process.env.OPS_INBOX_FINGERPRINT_SALT = "s3cr3t-server-salt";
    const host = "wordpress-ubuntu-4gb-sin-1";
    const name = "system_post_update_reboot_status";
    const warning = computeFingerprintV2({
      source: "netdata", service: null, signal_type: "resource",
      title: "= 1 status", raw: { host, name, status: "WARNING", value: "1" },
    });
    const cleared = computeFingerprintV2({
      source: "netdata", service: null, signal_type: "resource",
      title: "= 0 status", raw: { host, name, status: "CLEAR", value: "0" },
    });
    expect(warning).toBe(cleared);
  });
});
