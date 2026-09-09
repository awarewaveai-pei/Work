import { describe, expect, it } from "vitest";
import { validateOutcomeEvent } from "../outcome-contract";

const event = { releaseId: "r1", deliveryId: "d1", platform: "instagram", externalPostId: "p1", observedAt: "2026-09-09T00:00:00.000Z", maturity: "24h", metrics: { views: 10, completion_rate: 0.5 } };
describe("outcome contract", () => {
  it("validates and deterministically deduplicates snapshots", () => {
    const one = validateOutcomeEvent(event);
    expect(one.ok).toBe(true);
    expect(one.eventId).toBe(validateOutcomeEvent({ ...event }).eventId);
  });
  it("rejects unknown or negative metrics", () => {
    const result = validateOutcomeEvent({ ...event, metrics: { views: -1, viral_score: 3 } });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(["metric views must be a non-negative number", "metric viral_score is unsupported"]));
  });
});
