import { beforeEach, describe, expect, it } from "vitest";
import { decideNotification } from "../rules";

/** Mirrors rules.ts throttle (15 min). */
const THROTTLE_MS = 15 * 60 * 1000;

const baseIncident: any = {
  environment: "production",
  status: "open",
  severity: "medium",
  notification_log: [],
};

describe("decideNotification", () => {
  beforeEach(() => {
    process.env.OPS_INBOX_NOTIFY_ENABLED = "true";
    delete process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK;
  });

  it("respects globally_disabled", () => {
    process.env.OPS_INBOX_NOTIFY_ENABLED = "false";
    delete process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK;
    expect(decideNotification({ incident: baseIncident, transition: { kind: "new" }, now: new Date() }).shouldSend).toBe(false);
  });

  it("implicitly enables notify when webhook is set and OPS_INBOX_NOTIFY_ENABLED unset", () => {
    delete process.env.OPS_INBOX_NOTIFY_ENABLED;
    process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK = "https://hooks.slack.com/services/FAKE/FAKE/FAKE";
    const d = decideNotification({ incident: baseIncident, transition: { kind: "new" }, now: new Date() });
    expect(d.shouldSend).toBe(true);
    delete process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK;
  });

  it("stays disabled when neither flag nor webhook", () => {
    delete process.env.OPS_INBOX_NOTIFY_ENABLED;
    delete process.env.OPS_INBOX_SLACK_INCIDENTS_WEBHOOK;
    expect(decideNotification({ incident: baseIncident, transition: { kind: "new" }, now: new Date() }).shouldSend).toBe(false);
  });

  it("skips development env", () => {
    expect(
      decideNotification({
        incident: { ...baseIncident, environment: "development" },
        transition: { kind: "new" },
        now: new Date(),
      }).shouldSend,
    ).toBe(false);
  });

  it("sends new incident", () => {
    const d = decideNotification({ incident: baseIncident, transition: { kind: "new" }, now: new Date() });
    expect(d.shouldSend).toBe(true);
    expect(d.rule).toBe("new_incident_first_occurrence");
  });

  it("duplicate medium sends Slack when outside throttle", () => {
    const past = new Date(Date.now() - THROTTLE_MS - 60_000).toISOString();
    const incident = {
      ...baseIncident,
      severity: "medium",
      notification_log: [{ channel: "x", rule: "new_incident_first_occurrence", status: "sent", ts: past }],
    };
    const d = decideNotification({ incident, transition: { kind: "duplicate" }, now: new Date() });
    expect(d.shouldSend).toBe(true);
    expect(d.rule).toBe("duplicate_occurrence");
  });

  it("duplicate medium skips inside throttle", () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const incident = {
      ...baseIncident,
      severity: "medium",
      notification_log: [{ channel: "x", rule: "new_incident_first_occurrence", status: "sent", ts: recent }],
    };
    const d = decideNotification({ incident, transition: { kind: "duplicate" }, now: new Date() });
    expect(d.shouldSend).toBe(false);
    expect(d.reason).toBe("within_throttle_window");
  });

  it("duplicate critical uses critical_immediate after throttle", () => {
    const past = new Date(Date.now() - THROTTLE_MS - 60_000).toISOString();
    const incident = {
      ...baseIncident,
      severity: "critical",
      notification_log: [{ channel: "x", rule: "critical_immediate", status: "sent", ts: past }],
    };
    const d = decideNotification({ incident, transition: { kind: "duplicate" }, now: new Date() });
    expect(d.shouldSend).toBe(true);
    expect(d.rule).toBe("critical_immediate");
  });
});
