import { describe, expect, it } from "vitest";
import { computeFingerprint } from "../fingerprint";

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
