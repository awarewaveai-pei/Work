import { beforeEach, describe, expect, it } from "vitest";
import { decideNotification } from "../rules";

const baseIncident: any = {
  environment: "production",
  status: "open",
  severity: "medium",
  notification_log: [],
};

describe("decideNotification", () => {
  beforeEach(() => {
    process.env.OPS_INBOX_NOTIFY_ENABLED = "true";
  });

  it("respects globally_disabled", () => {
    process.env.OPS_INBOX_NOTIFY_ENABLED = "false";
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
});
